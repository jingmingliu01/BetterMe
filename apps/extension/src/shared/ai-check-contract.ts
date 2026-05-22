import rawContract from "./ai-check-contract.json";
import type {
  AICheckSchemaFieldReference,
  AICheckCaseStatus,
  AIDecision,
  BadCaseErrorType,
  BehaviorReasonCategory,
  DecisionReasonCategory,
  StrictnessLevel
} from "./types";

interface AICheckContractSection {
  title: string;
  summary: string;
  fields: AICheckSchemaFieldReference[];
  example: unknown;
  schemaSummary?: string;
  promptSchema?: unknown;
}

interface AICheckCurrentVersions {
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
}

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

interface AICheckContract {
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
    caseSources: Array<"authored_eval" | "real_session" | "bad_case_review">;
    badCaseErrorTypes: BadCaseErrorType[];
  };
  pmReview: {
    errorTypes: Array<{ value: BadCaseErrorType; label: string }>;
    commonTags: string[];
    caseSets: Array<{
      id: string;
      name: string;
      description: string;
      statuses: AICheckCaseStatus[];
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

export const AI_CHECK_CONTRACT = rawContract as AICheckContract;

export const AI_CHECK_CURRENT_VERSIONS = AI_CHECK_CONTRACT.current;

export const AI_CHECK_DECISIONS = AI_CHECK_CONTRACT.enums.decisions;
export const AI_CHECK_DECISION_REASON_CATEGORIES = AI_CHECK_CONTRACT.enums.decisionReasonCategories;
export const AI_CHECK_BEHAVIOR_REASON_CATEGORIES = AI_CHECK_CONTRACT.enums.behaviorReasonCategories;
export const AI_CHECK_STRICTNESS_LEVELS = AI_CHECK_CONTRACT.enums.strictnessLevels;
export const AI_CHECK_CASE_STATUSES = AI_CHECK_CONTRACT.enums.caseStatuses;
export const AI_CHECK_CASE_SOURCES = AI_CHECK_CONTRACT.enums.caseSources;
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
