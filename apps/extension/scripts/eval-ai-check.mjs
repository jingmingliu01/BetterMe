import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import { buildGeneratedSections, validateCaseShape } from "./ai-check-contract-shape.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const defaultCaseDir = resolve(here, "../evals/ai-check-cases");
const contractPath = resolve(here, "../src/shared/ai-check-contract.json");
const providerConfigPath = resolve(here, "../src/shared/provider-config.json");
const aiCheckContract = JSON.parse(await readFile(contractPath, "utf8"));
const contractSections = buildGeneratedSections(aiCheckContract);
const rawProviderConfigs = JSON.parse(await readFile(providerConfigPath, "utf8"));

const currentVersions = aiCheckContract.current ?? {
  promptVersion: aiCheckContract.promptVersion,
  outputSchemaVersion: aiCheckContract.outputSchemaVersion,
  evaluationSchemaVersion: aiCheckContract.evaluationSchemaVersion
};
const promptVersion = currentVersions.promptVersion;
const outputSchemaVersion = currentVersions.outputSchemaVersion;
const evaluationSchemaVersion = currentVersions.evaluationSchemaVersion;
const contractEnums = aiCheckContract.enums;
const scoreNames = contractSections.output.fields
  .map((field) => field.path)
  .filter((path) => path.startsWith("scores."))
  .map((path) => path.slice("scores.".length));

const providerConfigs = Object.fromEntries(rawProviderConfigs.map((config) => [config.id, config]));
providerConfigs.mock = { label: "mock", defaultModel: "mock" };

const args = parseArgs(process.argv.slice(2));
const provider = args.provider ?? "mock";
const providerConfig = providerConfigs[provider];
if (!providerConfig) {
  throw new Error(`Unknown provider "${provider}". Use mock, openai, deepseek, or kimi.`);
}

const model = args.model ?? providerConfig.defaultModel ?? "mock";
const casePath = args.cases ? resolve(process.cwd(), args.cases) : defaultCaseDir;
const cases = filterCases((await loadCases(casePath)).map(normalizeCase), args);
const results = [];
let runtimeModules = null;

try {
  for (const testCase of cases) {
    results.push(await runCase(testCase, { provider, providerConfig, model }));
  }

  const failed = results.filter((result) => !result.pass);
  const tagStats = summarizeByTag(results);

  console.log("AI Check Eval Run");
  console.log(`Prompt: ${promptVersion}`);
  console.log(`Output Schema: ${outputSchemaVersion}`);
  console.log(`Evaluation Schema: ${evaluationSchemaVersion}`);
  console.log(`Provider mode: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Case filter: ${describeCaseFilter(args)}`);
  console.log("");
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  console.log("");
  console.log("By tag:");
  for (const row of tagStats) {
    console.log(`- ${row.tag}: ${row.passed}/${row.total}`);
  }

  if (failed.length > 0) {
    console.log("");
    console.log("Failed:");
    for (const result of failed) {
      console.log(`- ${result.id}: ${result.failureReasons.join("; ")}`);
    }
    process.exitCode = 1;
  }
} finally {
  await runtimeModules?.server.close();
}

async function runCase(testCase, runConfig) {
  validateCase(testCase);
  const actual =
    runConfig.provider === "mock" ? mockDecision(testCase.input) : await providerDecision(testCase, runConfig);
  const evaluation = testCase.eval;
  const expected = evaluation.expectedOutput ?? {};
  const failureReasons = [];

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
    actual.memoryUpdate?.behaviorReasonCategory,
    expected.memoryUpdate?.behaviorReasonCategory,
    failureReasons
  );
  checkNullableTextExpectation(
    "memoryUpdate.patternNote",
    actual.memoryUpdate?.patternNote ?? null,
    expected.memoryUpdate?.patternNote,
    failureReasons
  );

  for (const scoreName of scoreNames) {
    const score = actual.scores?.[scoreName];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      failureReasons.push(`${scoreName} score ${score ?? "missing"} is not a 0-100 number`);
    }
  }

  for (const [scoreName, range] of Object.entries(expected.scores ?? {})) {
    const score = actual.scores?.[scoreName];
    if (typeof score !== "number") {
      failureReasons.push(`scores.${scoreName} missing`);
    } else {
      checkNumberRangeExpectation(`scores.${scoreName}`, score, range, failureReasons);
    }
  }

  return {
    id: testCase.id,
    tags: evaluation.tags ?? [],
    actualDecision: actual.decision,
    pass: failureReasons.length === 0,
    failureReasons
  };
}

function checkDecisionExpectation(path, actual, expectation, failureReasons) {
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

function checkExactExpectation(path, actual, expected, failureReasons) {
  if (expected === undefined) return;
  if (actual !== expected) {
    failureReasons.push(`${path} expected ${expected}, got ${actual ?? "missing"}`);
  }
}

function checkTextExpectation(path, actual, expectation, failureReasons) {
  if (!expectation) return;
  if (expectation.exact !== undefined && actual !== expectation.exact) {
    failureReasons.push(`${path} expected exact text ${JSON.stringify(expectation.exact)}, got ${JSON.stringify(actual)}`);
  }
  checkPhraseExpectations(path, actual ?? "", expectation, failureReasons);
}

function checkNullableTextExpectation(path, actual, expectation, failureReasons) {
  if (!expectation) return;
  if ("exact" in expectation && actual !== expectation.exact) {
    failureReasons.push(`${path} expected ${expectation.exact ?? "null"}, got ${actual ?? "null"}`);
  }
  if (actual !== null) {
    checkPhraseExpectations(path, actual, expectation, failureReasons);
  }
}

function checkPhraseExpectations(path, actual, expectation, failureReasons) {
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

function checkNullableNumberExpectation(path, actual, expectation, failureReasons) {
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

function checkNumberRangeExpectation(path, actual, expectation, failureReasons) {
  if (typeof expectation.min === "number" && actual < expectation.min) {
    failureReasons.push(`${path} ${actual} below min ${expectation.min}`);
  }
  if (typeof expectation.max === "number" && actual > expectation.max) {
    failureReasons.push(`${path} ${actual} above max ${expectation.max}`);
  }
}

async function providerDecision(testCase, runConfig) {
  const input = testCase.input;
  const apiKey = process.env[runConfig.providerConfig.envKey];
  if (!apiKey) {
    throw new Error(`Set ${runConfig.providerConfig.envKey} to run provider mode for ${runConfig.providerConfig.label}.`);
  }
  const runtime = await loadRuntimeModules();
  const isFinalTurn = input.sessionContext?.isFinalTurn ?? false;

  const response = await fetch(`${runConfig.providerConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: runConfig.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: runtime.buildProviderMessages({
        round: runtime.buildRoundSnapshotFromCaseInput(input, { sessionId: `eval_${testCase.id}` }),
        messages: input.messages,
        turn: runtime.buildTurnStateFromCaseInput(input)
      })
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${runConfig.providerConfig.label} eval request failed: ${JSON.stringify(payload)}`);
  }
  const raw = payload.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new Error(`${runConfig.providerConfig.label} returned no message content.`);
  }
  const decision = runtime.parseCheckpointDecision(raw, `eval_${testCase.id}`);
  runtime.validateDecisionConstraints(decision, input.strictness, { isFinalTurn });
  return decision;
}

function mockDecision(input) {
  const latestUser = [...input.messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
  const strictness = input.strictness;
  const repeatedCount = Math.max(...(input.patternMemorySnapshot ?? []).map((memory) => memory.repeatedCount ?? 0), 0);
  const sensitive = /nsfw|porn|explicit|adult/i.test(input.targetDisplay) || /explicit|porn|色情|成人视频|黄片/.test(latestUser);
  const hasTimeBoundary =
    /\b(\d+\s*(minute|minutes|min|hour|hours)|close the tab|then i will|after|for \d+)\b/i.test(latestUser) ||
    /[1-9]\d?\s*(分钟|小时)|看完就|然后关|关掉|预计/.test(latestUser);
  const hasPurpose =
    /\b(need|fix|fixing|tutorial|answer|work|programming|bug|research|recipe|doctor|appointment|homework)\b/i.test(latestUser) ||
    /学习|工作|报错|教程|资料|作业|预约|菜谱|解决方案/.test(latestUser);
  const highRiskEmotion = /\b(bored|boring|lonely|stress|stressed|escape|relax|reward|deserve|tired|无聊|孤独|压力|逃避|放松|奖励|累)\b/i.test(latestUser);
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

function decision(decisionValue, message, options = {}) {
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

function getMockCooldownSeconds(strictness) {
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

async function loadCases(path) {
  const pathStat = await stat(path).catch(() => null);
  if (pathStat?.isDirectory()) {
    const entries = await readdir(path);
    const jsonFiles = entries.filter((entry) => entry.endsWith(".json")).sort();
    const nested = await Promise.all(jsonFiles.map((entry) => readJsonArray(resolve(path, entry))));
    return nested.flat();
  }
  if (pathStat?.isFile()) {
    return readJsonArray(path);
  }
  throw new Error(`Eval case path does not exist: ${path}`);
}

async function readJsonArray(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Eval case file must contain an array: ${path}`);
  }
  return parsed;
}

function validateCase(testCase) {
  const shapeErrors = validateCaseShape(aiCheckContract, testCase, { label: `Eval case ${testCase.id ?? "unknown"}` });
  if (shapeErrors.length > 0) {
    throw new Error(shapeErrors.join(" "));
  }
  const required = ["id", "title", "input", "eval"];
  for (const key of required) {
    if (!(key in testCase)) {
      throw new Error(`Eval case ${testCase.id ?? "unknown"} missing ${key}.`);
    }
  }
  if (!contractEnums.strictnessLevels.includes(testCase.input.strictness)) {
    throw new Error(`Eval case ${testCase.id} has invalid strictness ${testCase.input.strictness}.`);
  }
  if (!Array.isArray(testCase.input.messages)) {
    throw new Error(`Eval case ${testCase.id} has invalid messages.`);
  }
  if (!testCase.eval.expectedOutput || Object.keys(testCase.eval.expectedOutput).length === 0) {
    throw new Error(`Eval case ${testCase.id} missing eval.expectedOutput expectations.`);
  }
  validateDecisionExpectation(testCase.id, testCase.eval.expectedOutput.decision);
  const expectedBehaviorReason = testCase.eval.expectedOutput.memoryUpdate?.behaviorReasonCategory;
  if (expectedBehaviorReason && !contractEnums.behaviorReasonCategories.includes(expectedBehaviorReason)) {
    throw new Error(`Eval case ${testCase.id} has invalid expected behavior reason ${expectedBehaviorReason}.`);
  }
  const expectedDecisionReason = testCase.eval.expectedOutput.decisionReasonCategory;
  if (expectedDecisionReason && !contractEnums.decisionReasonCategories.includes(expectedDecisionReason)) {
    throw new Error(`Eval case ${testCase.id} has invalid expected decision reason ${expectedDecisionReason}.`);
  }
  if (!contractEnums.caseStatuses.includes(testCase.status)) {
    throw new Error(`Eval case ${testCase.id} has invalid status ${testCase.status}.`);
  }
  if (!args["include-legacy"]) {
    const versions = testCase.versions ?? {};
    const expectedVersions = { promptVersion, outputSchemaVersion, evaluationSchemaVersion };
    for (const [key, expected] of Object.entries(expectedVersions)) {
      if (versions[key] !== expected) {
        throw new Error(`Eval case ${testCase.id} has ${key} ${versions[key] ?? "missing"}; expected ${expected}.`);
      }
    }
  }
}

function validateDecisionExpectation(caseId, expectation) {
  if (!expectation) return;
  if (typeof expectation === "string") {
    if (!contractEnums.decisions.includes(expectation)) {
      throw new Error(`Eval case ${caseId} has invalid expected decision ${expectation}.`);
    }
    return;
  }
  const values = [
    expectation.exact,
    ...(Array.isArray(expectation.allowed) ? expectation.allowed : []),
    ...(Array.isArray(expectation.disallowed) ? expectation.disallowed : [])
  ].filter(Boolean);
  for (const value of values) {
    if (!contractEnums.decisions.includes(value)) {
      throw new Error(`Eval case ${caseId} has invalid decision expectation ${value}.`);
    }
  }
}

function normalizeCase(testCase) {
  return {
    ...testCase,
    status: testCase.archivedAt ? "archived" : testCase.status ?? "ready",
    input: {
      ...testCase.input,
      patternMemorySnapshot: testCase.input.patternMemorySnapshot ?? []
    }
  };
}

async function loadRuntimeModules() {
  if (runtimeModules) return runtimeModules;
  const server = await createServer({
    configFile: false,
    root: resolve(here, ".."),
    server: { middlewareMode: true }
  });
  const [
    {
      buildProviderMessages,
      buildRoundSnapshotFromCaseInput,
      buildTurnStateFromCaseInput
    },
    { parseCheckpointDecision, validateDecisionConstraints }
  ] = await Promise.all([
    server.ssrLoadModule("/src/ai/context-builder.ts"),
    server.ssrLoadModule("/src/ai/checkpoint-schema.ts")
  ]);
  runtimeModules = {
    server,
    buildProviderMessages,
    buildRoundSnapshotFromCaseInput,
    buildTurnStateFromCaseInput,
    parseCheckpointDecision,
    validateDecisionConstraints
  };
  return runtimeModules;
}

function filterCases(cases, args) {
  const requestedStatuses = splitArg(args.status ?? args.statuses);
  const requestedTags = splitArg(args.tag ?? args.tags);
  return cases.filter((testCase) => {
    if (!args["include-archived"] && testCase.status === "archived") {
      return false;
    }
    if (requestedStatuses.length > 0 && !requestedStatuses.includes(testCase.status)) {
      return false;
    }
    if (requestedTags.length > 0) {
      const tags = new Set(testCase.eval?.tags ?? []);
      if (!requestedTags.some((tag) => tags.has(tag))) {
        return false;
      }
    }
    return true;
  });
}

function splitArg(value) {
  return typeof value === "string" && value !== "true"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function describeCaseFilter(args) {
  const parts = [];
  const statuses = splitArg(args.status ?? args.statuses);
  const tags = splitArg(args.tag ?? args.tags);
  parts.push(args["include-archived"] ? "including archived" : "active only");
  if (statuses.length > 0) parts.push(`status=${statuses.join(",")}`);
  if (tags.length > 0) parts.push(`tag=${tags.join(",")}`);
  return parts.join("; ");
}

function summarizeByTag(results) {
  const rows = new Map();
  for (const result of results) {
    for (const tag of result.tags) {
      const row = rows.get(tag) ?? { tag, passed: 0, total: 0 };
      row.total += 1;
      if (result.pass) row.passed += 1;
      rows.set(tag, row);
    }
  }
  return [...rows.values()].sort((left, right) => left.tag.localeCompare(right.tag));
}

function parseArgs(values) {
  const parsed = {};
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const [key, rawValue = "true"] = value.slice(2).split("=");
    parsed[key] = rawValue;
  }
  return parsed;
}
