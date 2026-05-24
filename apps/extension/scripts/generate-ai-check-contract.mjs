import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGeneratedSections } from "./ai-check-contract-shape.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(here, "../src/shared/ai-check-contract.json");
const generatedPath = resolve(here, "../src/shared/ai-check-contract.generated.ts");
const checkOnly = process.argv.includes("--check");

const contract = JSON.parse(await readFile(contractPath, "utf8"));
const generatedSections = buildGeneratedSections(contract);

const source = `${generatedHeader()}
import rawContract from "./ai-check-contract.json";

${literalArray("AI_CHECK_DECISIONS", contract.enums.decisions)}
export type AIDecision = (typeof AI_CHECK_DECISIONS)[number];

${literalArray("AI_CHECK_DECISION_REASON_CATEGORIES", contract.enums.decisionReasonCategories)}
export type DecisionReasonCategory = (typeof AI_CHECK_DECISION_REASON_CATEGORIES)[number];

${literalArray("AI_CHECK_BEHAVIOR_REASON_CATEGORIES", contract.enums.behaviorReasonCategories)}
export type BehaviorReasonCategory = (typeof AI_CHECK_BEHAVIOR_REASON_CATEGORIES)[number];

${literalArray("AI_CHECK_STRICTNESS_LEVELS", contract.enums.strictnessLevels)}
export type StrictnessLevel = (typeof AI_CHECK_STRICTNESS_LEVELS)[number];

${literalArray("AI_CHECK_CASE_STATUSES", contract.enums.caseStatuses)}
export type AICheckCaseStatus = (typeof AI_CHECK_CASE_STATUSES)[number];

${literalArray("AI_CHECK_DATASET_TYPES", contract.enums.datasetTypes)}
export type AICheckDatasetType = (typeof AI_CHECK_DATASET_TYPES)[number];

${literalArray("AI_CHECK_PROVENANCE_TYPES", contract.enums.provenanceTypes)}
export type AICheckProvenanceType = (typeof AI_CHECK_PROVENANCE_TYPES)[number];

${literalArray("AI_CHECK_SEVERITY_LEVELS", contract.enums.severityLevels)}
export type AICheckSeverity = (typeof AI_CHECK_SEVERITY_LEVELS)[number];

${literalArray("AI_CHECK_BAD_CASE_ERROR_TYPE_VALUES", contract.enums.badCaseErrorTypes)}
export type BadCaseErrorType = (typeof AI_CHECK_BAD_CASE_ERROR_TYPE_VALUES)[number];

export type AICheckScoreName = "repeatedReason" | "impulse" | "deliberateness";
export type AICheckScores = Record<AICheckScoreName, number>;

export interface AICheckCurrentVersions {
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
}

export interface AICheckSchemaFieldReference {
  path: string;
  type: string;
  required: boolean;
  nullable?: boolean;
  example?: unknown;
  meaning: string;
  whyNecessary: string;
  productImpact: string;
  validation: string;
  commonMistakes: string;
}

export interface AICheckContractSection {
  title: string;
  summary: string;
  fields: AICheckSchemaFieldReference[];
  example: unknown;
  schemaSummary?: string;
  promptSchema?: unknown;
}

export type AICheckContractSchemaNode =
  | { type: "string"; required: boolean; nullable?: boolean }
  | { type: "number"; required: boolean; nullable?: boolean; min?: number; max?: number }
  | { type: "boolean"; required: boolean }
  | { type: "enum"; required: boolean; enum?: string; values?: string[] }
  | { type: "array"; required: boolean; item: AICheckContractSchemaNode }
  | { type: "object"; required: boolean; title?: string; summary?: string; fields: Record<string, AICheckContractSchemaNode> }
  | { type: "ref"; required: boolean; ref: "input" | "output" | "evaluation" }
  | { type: "union"; required: boolean; variants: AICheckContractSchemaNode[] }
  | { type: "nullableNumberExpectation"; required: boolean }
  | { type: "nullableTextExpectation"; required: boolean }
  | { type: "numberRangeExpectation"; required: boolean };

interface AICheckVersionRegistryEntry {
  version: string;
  label: string;
  current?: boolean;
  section?: AICheckContractSection;
}

export interface AICheckResolvedVersionEntry {
  version: string;
  label: string;
  current: boolean;
  section: AICheckContractSection;
}

export interface AICheckContract {
  id: string;
  outputSchemaVersion: string;
  promptVersion: string;
  evaluationSchemaVersion: string;
  current: AICheckCurrentVersions;
  versionRegistry: {
    prompts: Array<Omit<AICheckVersionRegistryEntry, "section">>;
    outputSchemas: AICheckVersionRegistryEntry[];
    evaluationSchemas: AICheckVersionRegistryEntry[];
  };
  sessionPolicy: {
    maxAssistantTurns: number;
    maxSessionSeconds: number;
  };
  enums: {
    decisions: AIDecision[];
    decisionReasonCategories: DecisionReasonCategory[];
    behaviorReasonCategories: BehaviorReasonCategory[];
    strictnessLevels: StrictnessLevel[];
    caseStatuses: AICheckCaseStatus[];
    datasetTypes: AICheckDatasetType[];
    provenanceTypes: AICheckProvenanceType[];
    severityLevels: AICheckSeverity[];
    badCaseErrorTypes: BadCaseErrorType[];
  };
  schemas: {
    input: AICheckContractSchemaNode;
    output: AICheckContractSchemaNode;
    evaluation: AICheckContractSchemaNode;
  };
  examples: {
    input: unknown;
    output: unknown;
    evaluation: unknown;
  };
  pmReview: {
    fieldDocs: Record<"input" | "output" | "evaluation", Record<string, Omit<AICheckSchemaFieldReference, "path" | "type" | "required" | "nullable" | "example">>>;
    errorTypes: Array<{ value: BadCaseErrorType; label: string }>;
    commonTags: string[];
    caseSets: Array<{
      id: string;
      name: string;
      description: string;
      statuses: AICheckCaseStatus[];
      datasetTypes?: AICheckDatasetType[];
      tags?: string[];
      includeArchived?: boolean;
    }>;
  };
  sections: {
    input: AICheckContractSection;
    output: AICheckContractSection & {
      schemaSummary: string;
      promptSchema: unknown;
    };
    evaluation: AICheckContractSection;
  };
}

export interface AICheckCaseInput {
  targetDisplay: string;
  strictness: StrictnessLevel;
  sessionContext: {
    assistantTurnCount: number;
    maxAssistantTurns: number;
    isFinalTurn: boolean;
  };
  messages: Array<{
    role: "system" | "assistant" | "user";
    content: string;
    source: "local_opening" | "user" | "llm" | "system";
  }>;
  patternMemorySnapshot: Array<{
    id?: string;
    targetDisplay: string;
    behaviorReasonCategory: BehaviorReasonCategory;
    repeatedCount: number;
    lastUserReason: string;
    guidance: string;
    updatedAt: string;
  }>;
}

export interface CheckpointDecision {
  id: string;
  sessionId: string;
  decision: AIDecision;
  userFacingMessage: string;
  decisionReasonCategory: DecisionReasonCategory;
  unlockMinutes: number | null;
  aiCooldownSeconds: number | null;
  aiCooldownNormalization?: {
    originalSeconds: number;
    normalizedSeconds: number;
    minSeconds: number;
    maxSeconds: number;
  };
  scores: AICheckScores;
  memoryUpdate: {
    behaviorReasonCategory: BehaviorReasonCategory;
    patternNote: string | null;
  };
  createdAt: string;
  rawProvider?: string;
}

export interface AICheckCaseOutput {
  provider?: string;
  model?: string;
  rawProvider?: string;
  parsed: Omit<CheckpointDecision, "id" | "sessionId" | "createdAt" | "decisionReasonCategory" | "memoryUpdate"> & {
    decisionReasonCategory: DecisionReasonCategory;
    memoryUpdate: {
      behaviorReasonCategory: BehaviorReasonCategory;
      patternNote: string | null;
    };
  };
}

export type AICheckDecisionExpectation =
  | AIDecision
  | {
      exact?: AIDecision;
      allowed?: AIDecision[];
      disallowed?: AIDecision[];
    };

export interface AICheckTextExpectation {
  exact?: string;
  mustMention?: string[];
  mustNotMention?: string[];
}

export interface AICheckNullableTextExpectation {
  exact?: string | null;
  mustMention?: string[];
  mustNotMention?: string[];
}

export interface AICheckNullableNumberExpectation {
  exact?: number | null;
  min?: number;
  max?: number;
}

export interface AICheckNumberRangeExpectation {
  min?: number;
  max?: number;
}

export interface AICheckExpectedOutput {
  decision?: AICheckDecisionExpectation;
  userFacingMessage?: AICheckTextExpectation;
  decisionReasonCategory?: DecisionReasonCategory;
  unlockMinutes?: AICheckNullableNumberExpectation;
  aiCooldownSeconds?: AICheckNullableNumberExpectation;
  scores?: Partial<Record<AICheckScoreName, AICheckNumberRangeExpectation>>;
  memoryUpdate?: {
    behaviorReasonCategory?: BehaviorReasonCategory;
    patternNote?: AICheckNullableTextExpectation;
  };
}

export interface AICheckCaseEval {
  expectedOutput: AICheckExpectedOutput;
  tags: string[];
  reviewerNote?: string;
}

export type AICheckCaseProvenance =
  | { type: "authored"; author?: string }
  | { type: "session"; sessionId?: string; decisionId?: string }
  | { type: "review"; reviewId?: string; sessionId?: string; decisionId?: string };

export interface AICheckCaseLineage {
  parentCaseId?: string;
  supersedesCaseIds?: string[];
  splitFromCaseId?: string;
  mergedFromCaseIds?: string[];
}

export interface AICheckCase {
  id: string;
  title: string;
  datasetType: AICheckDatasetType;
  provenance: AICheckCaseProvenance;
  lineage?: AICheckCaseLineage;
  versions: AICheckCurrentVersions;
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval?: AICheckCaseEval;
  status: AICheckCaseStatus;
  severity?: AICheckSeverity;
  archivedAt?: string;
  archivedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AICheckEvalRun {
  id: string;
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
  providerMode: "mock" | "byok";
  createdAt: string;
}

export interface AICheckEvalResult {
  id: string;
  runId: string;
  evalCaseId: string;
  actualDecision: AIDecision | null;
  pass: boolean;
  failureReasons: string[];
  rawProvider?: string;
  createdAt: string;
}

const GENERATED_SECTIONS = ${JSON.stringify(generatedSections, null, 2)} as const;

export const AI_CHECK_CONTRACT = {
  ...rawContract,
  sections: GENERATED_SECTIONS
} as unknown as AICheckContract;
export const AI_CHECK_CURRENT_VERSIONS = AI_CHECK_CONTRACT.current;

export const AI_CHECK_BAD_CASE_ERROR_TYPES = AI_CHECK_CONTRACT.pmReview.errorTypes;
export const AI_CHECK_COMMON_TAGS = AI_CHECK_CONTRACT.pmReview.commonTags;
export const AI_CHECK_CASE_SETS = AI_CHECK_CONTRACT.pmReview.caseSets;
export const AI_CHECK_SESSION_POLICY = AI_CHECK_CONTRACT.sessionPolicy;

export const AI_CHECK_INPUT_FIELD_REFERENCE = AI_CHECK_CONTRACT.sections.input.fields;
export const AI_CHECK_OUTPUT_FIELD_REFERENCE = AI_CHECK_CONTRACT.sections.output.fields;
export const AI_CHECK_EVALUATION_FIELD_REFERENCE = AI_CHECK_CONTRACT.sections.evaluation.fields;

export const AI_CHECK_INPUT_EXAMPLE = AI_CHECK_CONTRACT.sections.input.example;
export const AI_CHECK_OUTPUT_EXAMPLE = AI_CHECK_CONTRACT.sections.output.example;
export const AI_CHECK_EVALUATION_EXAMPLE = AI_CHECK_CONTRACT.sections.evaluation.example;

export const AI_CHECK_OUTPUT_SCHEMA_SUMMARY = AI_CHECK_CONTRACT.sections.output.schemaSummary;
export const AI_CHECK_OUTPUT_PROMPT_SCHEMA = AI_CHECK_CONTRACT.sections.output.promptSchema;

export interface AICheckShapeValidationOptions {
  label?: string;
  enumMode?: "strict" | "provider";
}

export function validateAIContractOutputShape(
  value: unknown,
  options: AICheckShapeValidationOptions = {}
): string[] {
  return validateSchemaValue(AI_CHECK_CONTRACT.schemas.output, value, options.label ?? "output", options);
}

export function assertAIContractOutputShape(value: unknown, options: AICheckShapeValidationOptions = {}): void {
  const errors = validateAIContractOutputShape(value, options);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

export function validateAICheckCaseShape(value: unknown, options: AICheckShapeValidationOptions = {}): string[] {
  return validateSchemaValue(AI_CHECK_CONTRACT.schemas.evaluation, value, options.label ?? "case", options);
}

export function assertAICheckCaseShape(value: unknown, options: AICheckShapeValidationOptions = {}): void {
  const errors = validateAICheckCaseShape(value, options);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

function validateSchemaValue(
  rawNode: AICheckContractSchemaNode,
  value: unknown,
  label: string,
  options: AICheckShapeValidationOptions
): string[] {
  const errors: string[] = [];
  validateNode(rawNode, value, label, options, errors);
  return errors;
}

function validateNode(
  rawNode: AICheckContractSchemaNode,
  value: unknown,
  label: string,
  options: AICheckShapeValidationOptions,
  errors: string[]
): void {
  if (value === undefined) {
    if (rawNode.required) errors.push(\`\${label} is required.\`);
    return;
  }
  if (value === null) {
    if (!("nullable" in rawNode && rawNode.nullable)) errors.push(\`\${label} must not be null.\`);
    return;
  }

  const node = resolveSchemaNode(rawNode);
  switch (node.type) {
    case "string":
      if (typeof value !== "string" || (node.required && value.length === 0)) errors.push(\`\${label} must be a non-empty string.\`);
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(\`\${label} must be a finite number.\`);
        return;
      }
      if (typeof node.min === "number" && value < node.min) errors.push(\`\${label} must be >= \${node.min}.\`);
      if (typeof node.max === "number" && value > node.max) errors.push(\`\${label} must be <= \${node.max}.\`);
      return;
    case "boolean":
      if (typeof value !== "boolean") errors.push(\`\${label} must be a boolean.\`);
      return;
    case "enum": {
      if (typeof value !== "string") {
        errors.push(\`\${label} must be a string enum value.\`);
        return;
      }
      const providerLoose =
        options.enumMode === "provider" &&
        (label.endsWith("decisionReasonCategory") || label.endsWith("behaviorReasonCategory"));
      if (!providerLoose && !enumValues(node).includes(value)) errors.push(\`\${label} has invalid enum value \${value}.\`);
      return;
    }
    case "array":
      if (!Array.isArray(value)) {
        errors.push(\`\${label} must be an array.\`);
        return;
      }
      value.forEach((item, index) => validateNode(node.item, item, \`\${label}[\${index}]\`, options, errors));
      return;
    case "object":
      if (!isRecord(value)) {
        errors.push(\`\${label} must be an object.\`);
        return;
      }
      for (const [key, child] of Object.entries(node.fields)) {
        validateNode(child, value[key], \`\${label}.\${key}\`, options, errors);
      }
      return;
    case "union": {
      const variantErrors = node.variants.map((variant) => validateSchemaValue(variant, value, label, options));
      if (!variantErrors.some((items) => items.length === 0)) errors.push(\`\${label} did not match any allowed shape.\`);
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
      errors.push(\`\${label} has unsupported schema node type \${(node as { type: string }).type}.\`);
  }
}

function resolveSchemaNode(node: AICheckContractSchemaNode): AICheckContractSchemaNode {
  if (node.type !== "ref") return node;
  return {
    ...AI_CHECK_CONTRACT.schemas[node.ref],
    required: node.required
  };
}

function enumValues(node: Extract<AICheckContractSchemaNode, { type: "enum" }>): string[] {
  if (node.values) return node.values;
  return node.enum ? ((AI_CHECK_CONTRACT.enums as Record<string, string[]>)[node.enum] ?? []) : [];
}

function validateNullableNumberExpectation(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(\`\${label} must be an object.\`);
    return;
  }
  if ("exact" in value && typeof value.exact !== "number" && value.exact !== null) errors.push(\`\${label}.exact must be number or null.\`);
  if ("min" in value && typeof value.min !== "number") errors.push(\`\${label}.min must be a number.\`);
  if ("max" in value && typeof value.max !== "number") errors.push(\`\${label}.max must be a number.\`);
}

function validateNullableTextExpectation(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(\`\${label} must be an object.\`);
    return;
  }
  if ("exact" in value && typeof value.exact !== "string" && value.exact !== null) errors.push(\`\${label}.exact must be string or null.\`);
  validateStringArray(value.mustMention, \`\${label}.mustMention\`, errors);
  validateStringArray(value.mustNotMention, \`\${label}.mustNotMention\`, errors);
}

function validateNumberRangeExpectation(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(\`\${label} must be an object.\`);
    return;
  }
  if ("min" in value && typeof value.min !== "number") errors.push(\`\${label}.min must be a number.\`);
  if ("max" in value && typeof value.max !== "number") errors.push(\`\${label}.max must be a number.\`);
}

function validateStringArray(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) errors.push(\`\${label} must be a string array.\`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveSchemaRegistry(
  entries: AICheckVersionRegistryEntry[],
  currentVersion: string,
  currentSection: AICheckContractSection
): AICheckResolvedVersionEntry[] {
  const resolved = entries.map((entry) => ({
    version: entry.version,
    label: entry.label,
    current: entry.current ?? entry.version === currentVersion,
    section: entry.section ?? currentSection
  }));

  if (resolved.some((entry) => entry.version === currentVersion)) {
    return resolved;
  }

  return [
    {
      version: currentVersion,
      label: currentVersion,
      current: true,
      section: currentSection
    },
    ...resolved
  ];
}

export const AI_CHECK_PROMPT_VERSIONS = AI_CHECK_CONTRACT.versionRegistry.prompts.map((entry) => ({
  version: entry.version,
  label: entry.label,
  current: entry.current ?? entry.version === AI_CHECK_CURRENT_VERSIONS.promptVersion
}));

export const AI_CHECK_OUTPUT_SCHEMA_VERSIONS = resolveSchemaRegistry(
  AI_CHECK_CONTRACT.versionRegistry.outputSchemas,
  AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion,
  AI_CHECK_CONTRACT.sections.output
);

export const AI_CHECK_EVALUATION_SCHEMA_VERSIONS = resolveSchemaRegistry(
  AI_CHECK_CONTRACT.versionRegistry.evaluationSchemas,
  AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion,
  AI_CHECK_CONTRACT.sections.evaluation
);
`;

if (checkOnly) {
  const existing = await readFile(generatedPath, "utf8").catch(() => "");
  if (existing !== source) {
    throw new Error("ai-check-contract.generated.ts is stale. Run npm run generate:ai-check-contract.");
  }
  console.log("AI_CHECK_CONTRACT_GENERATED_OK true");
} else {
  await writeFile(generatedPath, source);
  console.log(`Generated ${generatedPath}`);
}

function literalArray(name, values) {
  return `export const ${name} = ${JSON.stringify(values)} as const;`;
}

function generatedHeader() {
  return `// Generated by scripts/generate-ai-check-contract.mjs.
// Do not edit by hand; edit ai-check-contract.json and regenerate instead.
`;
}
