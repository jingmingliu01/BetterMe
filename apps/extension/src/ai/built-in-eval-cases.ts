import askMoreCases from "../../evals/ai-check-cases/ask-more.json";
import overAllowCases from "../../evals/ai-check-cases/over-allow.json";
import overBlockCases from "../../evals/ai-check-cases/over-block.json";
import reasonStrengthCases from "../../evals/ai-check-cases/reason-strength.json";
import repeatedPatternCases from "../../evals/ai-check-cases/repeated-pattern.json";
import sensitiveAdviceCases from "../../evals/ai-check-cases/sensitive-advice.json";
import strictnessBehaviorCases from "../../evals/ai-check-cases/strictness-behavior.json";
import type { AICheckCase } from "../shared/types";

export const BUILT_IN_AI_CHECK_CASES = [
  ...askMoreCases,
  ...overAllowCases,
  ...overBlockCases,
  ...reasonStrengthCases,
  ...repeatedPatternCases,
  ...sensitiveAdviceCases,
  ...strictnessBehaviorCases
] as AICheckCase[];
