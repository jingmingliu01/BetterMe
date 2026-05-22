export function buildGeneratedSections(contract) {
  return {
    input: buildSection(contract, "input"),
    output: {
      ...buildSection(contract, "output"),
      schemaSummary: schemaSummaryFromNode(contract.schemas.output),
      promptSchema: promptSchemaFromNode(contract, contract.schemas.output)
    },
    evaluation: buildSection(contract, "evaluation")
  };
}

export function buildSection(contract, name) {
  const schema = contract.schemas[name];
  const docs = contract.pmReview?.fieldDocs?.[name] ?? {};
  const schemaPaths = flattenSchemaPaths(contract, schema);
  const orderedPaths = [...schemaPaths, ...Object.keys(docs).filter((path) => !schemaPaths.includes(path))];
  const fields = orderedPaths
    .filter((path) => docs[path])
    .map((path) => {
      const node = resolvePath(contract, schema, path);
      return {
        path,
        type: node ? describeNode(contract, node) : docs[path].type ?? "unknown",
        required: node ? Boolean(node.required) : Boolean(docs[path].required),
        ...(node?.nullable ? { nullable: true } : {}),
        ...(exampleAt(contract.examples[name], path) !== undefined ? { example: exampleAt(contract.examples[name], path) } : {}),
        ...docs[path]
      };
    });
  return {
    title: schema.title,
    summary: schema.summary,
    fields,
    example: contract.examples[name]
  };
}

export function flattenSchemaPaths(contract, node, prefix = "") {
  const resolved = resolveRef(contract, node);
  if (resolved.type === "object") {
    const childPaths = Object.entries(resolved.fields ?? {}).flatMap(([key, child]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      const childResolved = resolveRef(contract, child);
      if (childResolved.type === "object" && hasDocumentableDescendant(contract, childResolved)) {
        return [nextPrefix, ...flattenSchemaPaths(contract, childResolved, nextPrefix)];
      }
      return [nextPrefix, ...flattenSchemaPaths(contract, childResolved, nextPrefix)];
    });
    return prefix ? [prefix, ...childPaths] : childPaths;
  }
  return [];
}

export function promptSchemaFromNode(contract, node) {
  const resolved = resolveRef(contract, node);
  if (resolved.type === "object") {
    return Object.fromEntries(
      Object.entries(resolved.fields ?? {})
        .filter(([, child]) => child.required !== false)
        .map(([key, child]) => [key, promptSchemaFromNode(contract, child)])
    );
  }
  if (resolved.type === "enum") {
    return enumValues(contract, resolved).join("|");
  }
  if (resolved.type === "number") {
    return resolved.nullable ? "number|null" : "number";
  }
  if (resolved.type === "string") {
    return resolved.nullable ? "string|null" : "string";
  }
  if (resolved.type === "boolean") {
    return "boolean";
  }
  if (resolved.type === "array") {
    return `${promptSchemaFromNode(contract, resolved.item)}[]`;
  }
  return describeNode(contract, resolved);
}

export function schemaSummaryFromNode(node) {
  if (node.type !== "object") return describeNode({}, node);
  const parts = Object.entries(node.fields ?? {})
    .filter(([, child]) => child.required !== false)
    .map(([key, child]) => {
      const resolved = child.type === "ref" ? child : child;
      if (resolved.type === "object") {
        return `${key}: ${schemaSummaryFromNode(resolved)}`;
      }
      return key;
    });
  return `{ ${parts.join(", ")} }`;
}

export function validateSchemaValue(contract, node, value, label, options = {}) {
  const errors = [];
  validateNode(contract, node, value, label, errors, options);
  return errors;
}

export function validateOutputShape(contract, value, options = {}) {
  return validateSchemaValue(contract, contract.schemas.output, value, options.label ?? "output", options);
}

export function validateCaseShape(contract, value, options = {}) {
  return validateSchemaValue(contract, contract.schemas.evaluation, value, options.label ?? "case", options);
}

export function resolvePath(contract, root, path) {
  let node = resolveRef(contract, root);
  for (const part of path.split(".")) {
    node = resolveRef(contract, node);
    if (node.type !== "object" || !node.fields?.[part]) return null;
    node = node.fields[part];
  }
  return resolveRef(contract, node);
}

export function describeNode(contract, node) {
  const resolved = resolveRef(contract, node);
  if (resolved.type === "enum") return enumValues(contract, resolved).join(" | ");
  if (resolved.type === "array") return `${describeNode(contract, resolved.item)}[]`;
  if (resolved.type === "object") return "object";
  if (resolved.type === "union") return resolved.variants.map((variant) => describeNode(contract, variant)).join(" | ");
  if (resolved.type === "nullableNumberExpectation") return "{ exact?: number|null, min?: number, max?: number }";
  if (resolved.type === "nullableTextExpectation") return "{ exact?: string|null, mustMention?: string[], mustNotMention?: string[] }";
  if (resolved.type === "numberRangeExpectation") return "{ min?: number, max?: number }";
  if (resolved.type === "number" && resolved.min === 0 && resolved.max === 100) return "0-100 number";
  if (resolved.nullable) return `${resolved.type} | null`;
  return resolved.type;
}

function validateNode(contract, rawNode, value, label, errors, options) {
  if (value === undefined) {
    if (rawNode.required) errors.push(`${label} is required.`);
    return;
  }
  if (value === null) {
    if (!rawNode.nullable) errors.push(`${label} must not be null.`);
    return;
  }

  const node = resolveRef(contract, rawNode);
  switch (node.type) {
    case "ref":
      validateNode(contract, { ...contract.schemas[node.ref], required: rawNode.required }, value, label, errors, options);
      return;
    case "string":
      if (typeof value !== "string" || (node.required && value.length === 0)) errors.push(`${label} must be a non-empty string.`);
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`${label} must be a finite number.`);
        return;
      }
      if (typeof node.min === "number" && value < node.min) errors.push(`${label} must be >= ${node.min}.`);
      if (typeof node.max === "number" && value > node.max) errors.push(`${label} must be <= ${node.max}.`);
      return;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${label} must be a boolean.`);
      return;
    case "enum": {
      if (typeof value !== "string") {
        errors.push(`${label} must be a string enum value.`);
        return;
      }
      const providerLoose =
        options.enumMode === "provider" &&
        (label.endsWith("decisionReasonCategory") || label.endsWith("behaviorReasonCategory"));
      if (!providerLoose && !enumValues(contract, node).includes(value)) {
        errors.push(`${label} has invalid enum value ${value}.`);
      }
      return;
    }
    case "array":
      if (!Array.isArray(value)) {
        errors.push(`${label} must be an array.`);
        return;
      }
      value.forEach((item, index) => validateNode(contract, node.item, item, `${label}[${index}]`, errors, options));
      return;
    case "object":
      if (!isPlainObject(value)) {
        errors.push(`${label} must be an object.`);
        return;
      }
      for (const [key, child] of Object.entries(node.fields ?? {})) {
        validateNode(contract, child, value[key], `${label}.${key}`, errors, options);
      }
      return;
    case "union": {
      const variantErrors = node.variants.map((variant) => validateSchemaValue(contract, variant, value, label, options));
      if (!variantErrors.some((items) => items.length === 0)) {
        errors.push(`${label} did not match any allowed shape.`);
      }
      return;
    }
    case "nullableNumberExpectation":
      validateNullableNumberExpectation(value, label, errors);
      return;
    case "nullableTextExpectation":
      validateNullableTextExpectation(value, label, errors);
      return;
    case "numberRangeExpectation":
      validateNumberRangeExpectation(value, label, errors);
      return;
    default:
      errors.push(`${label} has unsupported schema node type ${node.type}.`);
  }
}

function validateNullableNumberExpectation(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if ("exact" in value && typeof value.exact !== "number" && value.exact !== null) errors.push(`${label}.exact must be number or null.`);
  if ("min" in value && typeof value.min !== "number") errors.push(`${label}.min must be a number.`);
  if ("max" in value && typeof value.max !== "number") errors.push(`${label}.max must be a number.`);
}

function validateNullableTextExpectation(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if ("exact" in value && typeof value.exact !== "string" && value.exact !== null) errors.push(`${label}.exact must be string or null.`);
  validateStringArray(value.mustMention, `${label}.mustMention`, errors);
  validateStringArray(value.mustNotMention, `${label}.mustNotMention`, errors);
}

function validateNumberRangeExpectation(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if ("min" in value && typeof value.min !== "number") errors.push(`${label}.min must be a number.`);
  if ("max" in value && typeof value.max !== "number") errors.push(`${label}.max must be a number.`);
}

function validateStringArray(value, label, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${label} must be a string array.`);
  }
}

function enumValues(contract, node) {
  return node.values ?? contract.enums?.[node.enum] ?? [];
}

function resolveRef(contract, node) {
  return node?.type === "ref" ? { ...contract.schemas[node.ref], required: node.required } : node;
}

function hasDocumentableDescendant(contract, node) {
  return Boolean(node && resolveRef(contract, node).type === "object");
}

function exampleAt(example, path) {
  let current = example;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
