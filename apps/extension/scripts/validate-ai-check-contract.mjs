import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGeneratedSections,
  flattenSchemaPaths,
  validateCaseShape,
  validateOutputShape
} from "./ai-check-contract-shape.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(here, "../src/shared/ai-check-contract.json");
const caseDir = resolve(here, "../evals/ai-check-cases");
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const generatedSections = buildGeneratedSections(contract);
const errors = [];

validateContract();
await validateFixtures();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("AI_CHECK_CONTRACT_VALID true");
}

function validateContract() {
  requireObject(contract, "contract");
  if ("sections" in contract) {
    errors.push("contract.sections must be generated, not authored in ai-check-contract.json.");
  }
  checkVersionRegistry("promptVersion", "prompts");
  checkVersionRegistry("outputSchemaVersion", "outputSchemas");
  checkVersionRegistry("evaluationSchemaVersion", "evaluationSchemas");
  validateEnums();
  validatePromptProgram();
  validatePmReviewErrorTypes();
  validateSchemas();
  validateGeneratedSections();
  validateExamples();
}

function checkVersionRegistry(currentKey, registryKey) {
  const current = contract.current?.[currentKey];
  if (!current) {
    errors.push(`current.${currentKey} is required.`);
    return;
  }
  const registry = contract.versionRegistry?.[registryKey];
  if (!Array.isArray(registry)) {
    errors.push(`versionRegistry.${registryKey} must be an array.`);
    return;
  }
  if (!registry.some((entry) => entry.version === current)) {
    errors.push(`current.${currentKey} ${current} is missing from versionRegistry.${registryKey}.`);
  }
  const currentEntries = registry.filter((entry) => entry.current);
  if (currentEntries.length !== 1 || currentEntries[0]?.version !== current) {
    errors.push(`versionRegistry.${registryKey} must mark exactly ${current} as current.`);
  }
}

function validateEnums() {
  for (const [name, values] of Object.entries(contract.enums ?? {})) {
    if (!Array.isArray(values) || values.length === 0) {
      errors.push(`enums.${name} must be a non-empty array.`);
      continue;
    }
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) {
      errors.push(`enums.${name} contains duplicate values: ${[...new Set(duplicates)].join(", ")}`);
    }
  }
}

function validatePromptProgram() {
  validatePromptProgramRules("promptProgram.decisionPolicyRules", contract.promptProgram?.decisionPolicyRules);
  validatePromptProgramRules("promptProgram.scoringRules", contract.promptProgram?.scoringRules);
}

function validatePromptProgramRules(label, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return;
  }
  const ids = new Set();
  for (const [index, rule] of rules.entries()) {
    for (const key of ["id", "label", "rule", "rationale", "riskIfIgnored"]) {
      if (typeof rule?.[key] !== "string" || rule[key].trim().length === 0) {
        errors.push(`${label}[${index}] must include non-empty ${key}.`);
      }
    }
    if (ids.has(rule.id)) {
      errors.push(`${label} contains duplicate id ${rule.id}.`);
    }
    ids.add(rule.id);
  }
}

function validatePmReviewErrorTypes() {
  const enumValues = new Set(contract.enums?.badCaseErrorTypes ?? []);
  for (const item of contract.pmReview?.errorTypes ?? []) {
    if (!enumValues.has(item.value)) {
      errors.push(`pmReview.errorTypes contains ${item.value}, which is not in enums.badCaseErrorTypes.`);
    }
  }
}

function validateSchemas() {
  for (const name of ["input", "output", "evaluation"]) {
    if (!contract.schemas?.[name]) {
      errors.push(`schemas.${name} is required.`);
    }
    if (!contract.examples || !(name in contract.examples)) {
      errors.push(`examples.${name} is required.`);
    }
    if (!contract.pmReview?.fieldDocs?.[name]) {
      errors.push(`pmReview.fieldDocs.${name} is required.`);
    }
  }
}

function validateGeneratedSections() {
  for (const sectionName of ["input", "output", "evaluation"]) {
    const section = generatedSections[sectionName];
    const docPaths = Object.keys(contract.pmReview.fieldDocs[sectionName] ?? {});
    const schemaPaths = flattenSchemaPaths(contract, contract.schemas[sectionName]);
    const sectionPaths = section.fields.map((field) => field.path);
    for (const path of docPaths) {
      if (!sectionPaths.includes(path)) {
        errors.push(`generated ${sectionName} section is missing documented path ${path}.`);
      }
    }
    for (const path of sectionPaths) {
      if (!docPaths.includes(path)) {
        errors.push(`generated ${sectionName} section includes ${path} without pmReview.fieldDocs.${sectionName}.${path}.`);
      }
    }
    for (const path of docPaths) {
      if (!schemaPaths.includes(path)) {
        errors.push(`pmReview.fieldDocs.${sectionName}.${path} does not exist in schemas.${sectionName}.`);
      }
    }
    for (const field of section.fields) {
      validateFieldDoc(`generated sections.${sectionName}`, field);
    }
  }
}

function validateExamples() {
  errors.push(...validateOutputShape(contract, contract.examples.output, { label: "examples.output" }));
  errors.push(...validateCaseShape(contract, contract.examples.evaluation, { label: "examples.evaluation" }));
  assertDeepEqual(contract.examples.evaluation?.versions, contract.current, "examples.evaluation.versions must match current versions.");
}

function validateFieldDoc(sectionName, field) {
  const required = ["path", "type", "required", "meaning", "whyNecessary", "productImpact", "validation", "commonMistakes"];
  for (const key of required) {
    if (!(key in field)) {
      errors.push(`${sectionName}.fields entry ${field.path ?? "unknown"} missing ${key}.`);
    }
  }
}

async function validateFixtures() {
  const pathStat = await stat(caseDir).catch(() => null);
  if (!pathStat?.isDirectory()) {
    errors.push(`Eval case directory missing: ${caseDir}`);
    return;
  }
  const files = (await readdir(caseDir)).filter((file) => file.endsWith(".json")).sort();
  const ids = new Set();
  for (const file of files) {
    const cases = JSON.parse(await readFile(resolve(caseDir, file), "utf8"));
    if (!Array.isArray(cases)) {
      errors.push(`${file} must contain an array.`);
      continue;
    }
    for (const testCase of cases) {
      if (ids.has(testCase.id)) {
        errors.push(`Duplicate eval case id ${testCase.id}.`);
      }
      ids.add(testCase.id);
      errors.push(...validateCaseShape(contract, testCase, { label: `${file} ${testCase.id ?? "unknown"}` }));
      validateCurrentFixtureVersions(testCase, file);
      validateArchiveState(testCase, file);
    }
  }
}

function validateCurrentFixtureVersions(testCase, label) {
  if (testCase.status === "archived") return;
  const versions = testCase.versions ?? {};
  for (const [key, expected] of Object.entries(contract.current)) {
    if (versions[key] !== expected) {
      errors.push(`${label} ${testCase.id} has ${key} ${versions[key] ?? "missing"}; expected ${expected}.`);
    }
  }
}

function validateArchiveState(testCase, label) {
  if (testCase.status === "archived" && !testCase.archivedAt) {
    errors.push(`${label} ${testCase.id ?? "unknown"} is archived but missing archivedAt.`);
  }
  if (testCase.status !== "archived" && testCase.archivedAt) {
    errors.push(`${label} ${testCase.id ?? "unknown"} has archivedAt but status is ${testCase.status}.`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  return true;
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(message);
  }
}
