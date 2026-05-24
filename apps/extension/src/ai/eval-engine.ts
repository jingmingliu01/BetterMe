import { createId, nowIso } from "../shared/id";
import { AI_CHECK_CURRENT_VERSIONS } from "../shared/ai-check-contract";
import { buildProviderMessages, buildRoundSnapshotFromCaseInput, buildTurnStateFromCaseInput } from "./context-builder";
import { requestCheckpointDecision } from "./provider-client";
import type {
  AICheckCase,
  AICheckEvalMetrics,
  AICheckEvalResult,
  AICheckEvalRun,
  AICheckEvalRunFilters,
  AICheckEvalRunMode,
  AICheckExpectedOutput,
  AICheckNumberRangeExpectation,
  AICheckNullableTextExpectation,
  AICheckTextExpectation,
  AIDecision,
  CheckpointDecision,
  ProviderId,
  StrictnessLevel
} from "../shared/types";

export function filterEvalCasesForRun(cases: AICheckCase[], filters: AICheckEvalRunFilters): AICheckCase[] {
  return cases.filter((testCase) => {
    if (!filters.includeArchived && testCase.status === "archived") return false;
    if (filters.statuses?.length && !filters.statuses.includes(testCase.status)) return false;
    if (filters.datasetTypes?.length && !filters.datasetTypes.includes(testCase.datasetType)) return false;
    if (filters.strictness?.length && !filters.strictness.includes(testCase.input.strictness)) return false;
    if (filters.severity?.length && (!testCase.severity || !filters.severity.includes(testCase.severity))) return false;
    if (filters.expectedDecisions?.length) {
      const expectedDecision = getPrimaryExpectedDecision(testCase.eval?.expectedOutput.decision);
      if (!expectedDecision || !filters.expectedDecisions.includes(expectedDecision)) return false;
    }
    if (filters.tags?.length) {
      const tags = new Set(testCase.eval?.tags ?? []);
      if (!filters.tags.some((tag) => tags.has(tag))) return false;
    }
    return true;
  });
}

export function runMockEvalExperiment(
  cases: AICheckCase[],
  filters: AICheckEvalRunFilters,
  mode: AICheckEvalRunMode = "tuning"
): Promise<{
  run: AICheckEvalRun;
  results: AICheckEvalResult[];
}> {
  return runEvalExperimentForCases(cases, { filters, mode, provider: "mock", model: "mock" });
}

export async function runEvalExperimentForCases(
  cases: AICheckCase[],
  input: {
    filters: AICheckEvalRunFilters;
    mode?: AICheckEvalRunMode;
    provider?: AICheckEvalRun["provider"];
    model?: string;
    apiKey?: string;
    promptVersion?: string;
    systemPromptAddendum?: string;
  }
): Promise<{
  run: AICheckEvalRun;
  results: AICheckEvalResult[];
}> {
  const mode = input.mode ?? "tuning";
  const provider = input.provider ?? "mock";
  const model = input.model ?? "mock";
  const selectedCases = filterEvalCasesForRun(cases, input.filters);
  if (selectedCases.length === 0) {
    throw new Error("No evaluation cases match this experiment filter.");
  }
  if (provider !== "mock" && !input.apiKey) {
    throw new Error("Provider-mode eval requires a saved provider API key.");
  }

  const createdAt = nowIso();
  const runId = createId("evalrun");
  const results: AICheckEvalResult[] = [];
  for (const testCase of selectedCases) {
    results.push(
      await runEvalCase(testCase, {
        runId,
        createdAt,
        provider,
        model,
        apiKey: input.apiKey,
        systemPromptAddendum: input.systemPromptAddendum
      })
    );
  }
  const metrics = buildEvalMetrics(selectedCases, results);
  const run: AICheckEvalRun = {
    id: runId,
    promptVersion: input.promptVersion ?? AI_CHECK_CURRENT_VERSIONS.promptVersion,
    outputSchemaVersion: AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion,
    evaluationSchemaVersion: AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion,
    mode,
    providerMode: provider === "mock" ? "mock" : "byok",
    provider,
    model,
    filters: input.filters,
    caseIds: selectedCases.map((testCase) => testCase.id),
    metrics,
    createdAt
  };
  return { run, results };
}

async function runEvalCase(
  testCase: AICheckCase,
  input: {
    runId: string;
    createdAt: string;
    provider: AICheckEvalRun["provider"];
    model: string;
    apiKey?: string;
    systemPromptAddendum?: string;
  }
): Promise<AICheckEvalResult> {
  const actual =
    input.provider === "mock"
      ? mockDecision(testCase.input)
      : await providerDecision(testCase, {
          provider: input.provider,
          model: input.model,
          apiKey: input.apiKey ?? "",
          systemPromptAddendum: input.systemPromptAddendum
        });
  const failureReasons = evaluateExpectedOutput(actual, testCase.eval?.expectedOutput ?? {});
  const rawProvider = (actual as Partial<CheckpointDecision>).rawProvider;
  return {
    id: createId("evalresult"),
    runId: input.runId,
    evalCaseId: testCase.id,
    actualDecision: actual.decision,
    pass: failureReasons.length === 0,
    failureReasons,
    rawProvider: rawProvider ?? JSON.stringify(actual, null, 2),
    createdAt: input.createdAt
  };
}

async function providerDecision(
  testCase: AICheckCase,
  input: { provider: ProviderId; model: string; apiKey: string; systemPromptAddendum?: string }
): Promise<CheckpointDecision> {
  const round = buildRoundSnapshotFromCaseInput(testCase.input, { sessionId: `eval_${testCase.id}` });
  const turn = buildTurnStateFromCaseInput(testCase.input);
  return requestCheckpointDecision({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    messages: buildProviderMessages({
      round,
      messages: testCase.input.messages,
      turn,
      systemPromptAddendum: input.systemPromptAddendum
    }),
    sessionId: `eval_${testCase.id}`,
    strictness: testCase.input.strictness,
    isFinalTurn: turn.isFinalTurn
  });
}

function evaluateExpectedOutput(actual: MockDecision, expected: AICheckExpectedOutput): string[] {
  const failureReasons: string[] = [];
  checkDecisionExpectation("decision", actual.decision, expected.decision, failureReasons);
  checkTextExpectation("userFacingMessage", actual.userFacingMessage, expected.userFacingMessage, failureReasons);
  checkExactExpectation(
    "decisionReasonCategory",
    actual.decisionReasonCategory,
    expected.decisionReasonCategory,
    failureReasons
  );
  checkNullableNumberExpectation("unlockMinutes", actual.unlockMinutes, expected.unlockMinutes, failureReasons);
  checkNullableNumberExpectation("aiCooldownSeconds", actual.aiCooldownSeconds, expected.aiCooldownSeconds, failureReasons);
  checkExactExpectation(
    "memoryUpdate.behaviorReasonCategory",
    actual.memoryUpdate.behaviorReasonCategory,
    expected.memoryUpdate?.behaviorReasonCategory,
    failureReasons
  );
  checkNullableTextExpectation(
    "memoryUpdate.patternNote",
    actual.memoryUpdate.patternNote,
    expected.memoryUpdate?.patternNote,
    failureReasons
  );

  for (const scoreName of ["repeatedReason", "impulse", "deliberateness"] as const) {
    const score = actual.scores[scoreName];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      failureReasons.push(`${scoreName} score ${score ?? "missing"} is not a 0-100 number`);
    }
  }

  for (const [scoreName, range] of Object.entries(expected.scores ?? {})) {
    const score = actual.scores[scoreName as keyof typeof actual.scores];
    if (typeof score !== "number") {
      failureReasons.push(`scores.${scoreName} missing`);
    } else {
      checkNumberRangeExpectation(`scores.${scoreName}`, score, range, failureReasons);
    }
  }

  return failureReasons;
}

function buildEvalMetrics(cases: AICheckCase[], results: AICheckEvalResult[]): AICheckEvalMetrics {
  const resultByCaseId = new Map(results.map((result) => [result.evalCaseId, result]));
  const failedCases = cases.filter((testCase) => !resultByCaseId.get(testCase.id)?.pass);
  const falseAllowFailures = failedCases.filter((testCase) => resultByCaseId.get(testCase.id)?.actualDecision === "ALLOW").length;
  const falseBlockFailures = failedCases.filter((testCase) => resultByCaseId.get(testCase.id)?.actualDecision === "BLOCK").length;
  const askMoreRecallFailures = failedCases.filter(
    (testCase) => getPrimaryExpectedDecision(testCase.eval?.expectedOutput.decision) === "ASK_MORE"
  ).length;
  const schemaFailures = failedCases.filter((testCase) => (testCase.eval?.tags ?? []).includes("schema_or_format_failure")).length;
  const unsafeSensitiveFailures = failedCases.filter((testCase) =>
    (testCase.eval?.tags ?? []).includes("unsafe_sensitive_advice")
  ).length;
  const reasonQualityFailures = failedCases.filter((testCase) =>
    (testCase.eval?.tags ?? []).some((tag) => tag === "wrong_reason_strength" || tag === "wrong_cooldown")
  ).length;
  const criticalFailures = failedCases.filter((testCase) => testCase.severity === "critical").length;
  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  const releaseGateReasons: string[] = [];

  if (results.length === 0) releaseGateReasons.push("No cases selected.");
  if (schemaFailures > 0) releaseGateReasons.push(`${schemaFailures} schema or format failure(s).`);
  if (falseAllowFailures > 0) releaseGateReasons.push(`${falseAllowFailures} false allow failure(s).`);
  if (unsafeSensitiveFailures > 0) releaseGateReasons.push(`${unsafeSensitiveFailures} unsafe sensitive failure(s).`);
  if (criticalFailures > 0) releaseGateReasons.push(`${criticalFailures} critical failure(s).`);
  if (failed > 0 && releaseGateReasons.length === 0) releaseGateReasons.push(`${failed} non-gating failure(s) need review.`);

  const releaseGate = {
    status:
      releaseGateReasons.length === 0 ? "pass" : failed > 0 && releaseGateReasons.every((reason) => reason.includes("non-gating")) ? "warn" : "fail",
    reasons: releaseGateReasons.length === 0 ? ["All selected release-gate checks passed."] : releaseGateReasons
  } as const;

  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    byTag: buildBreakdown(cases, results, (testCase) => testCase.eval?.tags ?? []),
    byStrictness: buildBreakdown(cases, results, (testCase) => [testCase.input.strictness]),
    falseAllowFailures,
    falseBlockFailures,
    askMoreRecallFailures,
    schemaFailures,
    unsafeSensitiveFailures,
    reasonQualityFailures,
    criticalFailures,
    releaseGate
  };
}

function buildBreakdown(
  cases: AICheckCase[],
  results: AICheckEvalResult[],
  getKeys: (testCase: AICheckCase) => string[]
): AICheckEvalMetrics["byTag"] {
  const resultByCaseId = new Map(results.map((result) => [result.evalCaseId, result]));
  const rows = new Map<string, { key: string; passed: number; total: number }>();
  for (const testCase of cases) {
    const result = resultByCaseId.get(testCase.id);
    if (!result) continue;
    for (const key of getKeys(testCase)) {
      const row = rows.get(key) ?? { key, passed: 0, total: 0 };
      row.total += 1;
      if (result.pass) row.passed += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      passRate: row.total > 0 ? row.passed / row.total : 0
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function checkDecisionExpectation(
  path: string,
  actual: AIDecision,
  expectation: AICheckExpectedOutput["decision"],
  failureReasons: string[]
): void {
  if (!expectation) return;
  if (typeof expectation === "string") {
    checkExactExpectation(path, actual, expectation, failureReasons);
    return;
  }
  if (expectation.exact) {
    checkExactExpectation(path, actual, expectation.exact, failureReasons);
  }
  if (expectation.allowed?.length && !expectation.allowed.includes(actual)) {
    failureReasons.push(`${path} ${actual} not in allowed set ${expectation.allowed.join(",")}`);
  }
  if (expectation.disallowed?.includes(actual)) {
    failureReasons.push(`${path} used disallowed value ${actual}`);
  }
}

function checkExactExpectation<T>(path: string, actual: T | undefined, expected: T | undefined, failureReasons: string[]): void {
  if (expected === undefined) return;
  if (actual !== expected) {
    failureReasons.push(`${path} expected ${expected}, got ${actual ?? "missing"}`);
  }
}

function checkTextExpectation(
  path: string,
  actual: string,
  expectation: AICheckTextExpectation | undefined,
  failureReasons: string[]
): void {
  if (!expectation) return;
  if (expectation.exact !== undefined && actual !== expectation.exact) {
    failureReasons.push(`${path} expected exact text ${JSON.stringify(expectation.exact)}, got ${JSON.stringify(actual)}`);
  }
  checkPhraseExpectations(path, actual, expectation, failureReasons);
}

function checkNullableTextExpectation(
  path: string,
  actual: string | null,
  expectation: AICheckNullableTextExpectation | undefined,
  failureReasons: string[]
): void {
  if (!expectation) return;
  if ("exact" in expectation && actual !== expectation.exact) {
    failureReasons.push(`${path} expected ${expectation.exact ?? "null"}, got ${actual ?? "null"}`);
  }
  if (actual !== null) {
    checkPhraseExpectations(path, actual, expectation, failureReasons);
  }
}

function checkPhraseExpectations(
  path: string,
  actual: string,
  expectation: { mustMention?: string[]; mustNotMention?: string[] },
  failureReasons: string[]
): void {
  const lowerActual = actual.toLowerCase();
  for (const phrase of expectation.mustMention ?? []) {
    if (!lowerActual.includes(phrase.toLowerCase())) {
      failureReasons.push(`${path} missing required phrase: ${phrase}`);
    }
  }
  for (const phrase of expectation.mustNotMention ?? []) {
    if (lowerActual.includes(phrase.toLowerCase())) {
      failureReasons.push(`${path} used forbidden phrase: ${phrase}`);
    }
  }
}

function checkNullableNumberExpectation(
  path: string,
  actual: number | null,
  expectation: AICheckExpectedOutput["unlockMinutes"],
  failureReasons: string[]
): void {
  if (!expectation) return;
  if ("exact" in expectation) {
    if (actual !== expectation.exact) {
      failureReasons.push(`${path} expected ${expectation.exact ?? "null"}, got ${actual ?? "null"}`);
    }
    return;
  }
  if (typeof actual !== "number") {
    failureReasons.push(`${path} missing`);
    return;
  }
  checkNumberRangeExpectation(path, actual, expectation, failureReasons);
}

function checkNumberRangeExpectation(
  path: string,
  actual: number,
  expectation: AICheckNumberRangeExpectation,
  failureReasons: string[]
): void {
  if (typeof expectation.min === "number" && actual < expectation.min) {
    failureReasons.push(`${path} ${actual} below min ${expectation.min}`);
  }
  if (typeof expectation.max === "number" && actual > expectation.max) {
    failureReasons.push(`${path} ${actual} above max ${expectation.max}`);
  }
}

function getPrimaryExpectedDecision(expectation: AICheckExpectedOutput["decision"]): AIDecision | null {
  if (!expectation) return null;
  if (typeof expectation === "string") return expectation;
  return expectation.exact ?? expectation.allowed?.[0] ?? null;
}

type MockDecision = Omit<CheckpointDecision, "id" | "sessionId" | "createdAt" | "rawProvider">;

function mockDecision(input: AICheckCase["input"]): MockDecision {
  const latestUser = [...input.messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
  const strictness = input.strictness;
  const repeatedCount = Math.max(...(input.patternMemorySnapshot ?? []).map((memory) => memory.repeatedCount ?? 0), 0);
  const sensitive =
    /nsfw|porn|explicit|adult/i.test(input.targetDisplay) || /explicit|porn|色情|成人视频|黄片/.test(latestUser);
  const hasTimeBoundary =
    /\b(\d+\s*(minute|minutes|min|hour|hours)|close the tab|then i will|after|for \d+)\b/i.test(latestUser) ||
    /[1-9]\d?\s*(分钟|小时)|看完就|然后关|关掉|预计/.test(latestUser);
  const hasPurpose =
    /\b(need|fix|fixing|tutorial|answer|work|programming|bug|research|recipe|doctor|appointment|homework)\b/i.test(latestUser) ||
    /学习|工作|报错|教程|资料|作业|预约|菜谱|解决方案/.test(latestUser);
  const highRiskEmotion =
    /\b(bored|boring|lonely|stress|stressed|escape|relax|reward|deserve|tired|无聊|孤独|压力|逃避|放松|奖励|累)\b/i.test(
      latestUser
    );
  const vague = /\b(just|quickly|a bit|one thing)\b/i.test(latestUser) || /一下|一会儿|随便|看看|刷/.test(latestUser);

  if (sensitive && (strictness === "monk" || latestUser.includes("explicit") || latestUser.includes("色情"))) {
    return decision("BLOCK", "This looks like a high-risk impulse. Leave the site and choose a different next action.", {
      decisionReasonCategory: "high_risk_pattern",
      repeatedReason: repeatedCount > 0 ? 85 : 60,
      impulse: 90,
      deliberateness: 15
    });
  }

  if (repeatedCount >= 3 && (highRiskEmotion || vague)) {
    return decision("BLOCK", "This repeats a pattern that has not been bounded. Stay blocked for now.", {
      decisionReasonCategory: "repeated_excuse",
      repeatedReason: 90,
      impulse: 82,
      deliberateness: 20
    });
  }

  if (hasPurpose && hasTimeBoundary && strictness !== "monk") {
    return decision("ALLOW", "Your reason is specific and bounded. Keep it short and close the tab when done.", {
      decisionReasonCategory: "clear_intention",
      repeatedReason: repeatedCount * 10,
      impulse: 20,
      deliberateness: 86,
      unlockMinutes: strictness === "gentle" ? 10 : 5
    });
  }

  if (hasPurpose && hasTimeBoundary && strictness === "monk") {
    return decision("AI_COOLDOWN", "Pause first, then come back only if this task still feels necessary and bounded.", {
      decisionReasonCategory: "insufficient_reason",
      repeatedReason: repeatedCount * 10,
      impulse: 48,
      deliberateness: 62,
      aiCooldownSeconds: 600
    });
  }

  if (highRiskEmotion || (vague && strictness === "strict")) {
    return decision("AI_COOLDOWN", "Pause first, then decide whether this is still worth opening.", {
      decisionReasonCategory: repeatedCount > 0 ? "repeated_excuse" : "insufficient_reason",
      repeatedReason: repeatedCount > 0 ? 75 : 35,
      impulse: 76,
      deliberateness: 28,
      aiCooldownSeconds: getMockCooldownSeconds(strictness)
    });
  }

  if (hasPurpose && !hasTimeBoundary) {
    return decision("ASK_MORE", "How long will this take, and when will you leave?", {
      decisionReasonCategory: "insufficient_reason",
      repeatedReason: repeatedCount * 10,
      impulse: 45,
      deliberateness: 48
    });
  }

  if (vague) {
    return decision("AI_COOLDOWN", "Pause first, then decide whether this is still worth opening.", {
      decisionReasonCategory: repeatedCount > 0 ? "repeated_excuse" : "insufficient_reason",
      repeatedReason: repeatedCount > 0 ? 75 : 35,
      impulse: 76,
      deliberateness: 28,
      aiCooldownSeconds: getMockCooldownSeconds(strictness)
    });
  }

  return decision("ASK_MORE", "What specific task are you trying to finish, and when will you stop?", {
    decisionReasonCategory: "insufficient_reason",
    repeatedReason: repeatedCount * 10,
    impulse: 52,
    deliberateness: 42
  });
}

function decision(
  decisionValue: AIDecision,
  message: string,
  options: Partial<MockDecision["scores"]> &
    Partial<Pick<MockDecision, "decisionReasonCategory" | "unlockMinutes" | "aiCooldownSeconds">> = {}
): MockDecision {
  return {
    decision: decisionValue,
    userFacingMessage: message,
    decisionReasonCategory: options.decisionReasonCategory ?? "insufficient_reason",
    unlockMinutes: options.unlockMinutes ?? null,
    aiCooldownSeconds: options.aiCooldownSeconds ?? null,
    scores: {
      repeatedReason: options.repeatedReason ?? 0,
      impulse: options.impulse ?? 50,
      deliberateness: options.deliberateness ?? 50
    },
    memoryUpdate: {
      behaviorReasonCategory: "other",
      patternNote: null
    }
  };
}

function getMockCooldownSeconds(strictness: StrictnessLevel): number {
  switch (strictness) {
    case "gentle":
      return 60;
    case "strict":
      return 240;
    case "monk":
      return 600;
    default:
      return 120;
  }
}
