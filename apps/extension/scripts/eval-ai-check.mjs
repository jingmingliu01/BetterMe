import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const defaultCaseDir = resolve(here, "../evals/ai-check-cases");

const promptVersion = "ai-check-prompt-v1";
const schemaVersion = "checkpoint-decision-v1";
const rubricVersion = "strictness-rubric-v1";

const providerConfigs = {
  mock: { label: "mock" },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.1-mini"
  },
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat"
  },
  kimi: {
    label: "Kimi",
    envKey: "KIMI_API_KEY",
    baseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2.6"
  }
};

const args = parseArgs(process.argv.slice(2));
const provider = args.provider ?? "mock";
const providerConfig = providerConfigs[provider];
if (!providerConfig) {
  throw new Error(`Unknown provider "${provider}". Use mock, openai, deepseek, or kimi.`);
}

const model = args.model ?? providerConfig.defaultModel ?? "mock";
const casePath = args.cases ? resolve(process.cwd(), args.cases) : defaultCaseDir;
const cases = await loadCases(casePath);
const results = [];

for (const testCase of cases) {
  results.push(await runCase(normalizeCase(testCase), { provider, providerConfig, model }));
}

const failed = results.filter((result) => !result.pass);
const tagStats = summarizeByTag(results);

console.log("AI Check Eval Run");
console.log(`Prompt: ${promptVersion}`);
console.log(`Schema: ${schemaVersion}`);
console.log(`Rubric: ${rubricVersion}`);
console.log(`Provider mode: ${provider}`);
console.log(`Model: ${model}`);
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

async function runCase(testCase, runConfig) {
  validateCase(testCase);
  const actual = runConfig.provider === "mock" ? mockDecision(testCase.input) : await providerDecision(testCase.input, runConfig);
  const assertions = testCase.eval;
  const failureReasons = [];

  if (assertions.allowedDecisions?.length && !assertions.allowedDecisions.includes(actual.decision)) {
    failureReasons.push(`decision ${actual.decision} not in allowed set ${assertions.allowedDecisions.join(",")}`);
  } else if (!assertions.allowedDecisions?.length && actual.decision !== assertions.expectedOutput.decision) {
    failureReasons.push(`expected ${assertions.expectedOutput.decision}, got ${actual.decision}`);
  }

  if (assertions.disallowedDecisions?.includes(actual.decision)) {
    failureReasons.push(`disallowed decision ${actual.decision}`);
  }

  if (assertions.expectedOutput.decisionReasonCategory && actual.decisionReasonCategory !== assertions.expectedOutput.decisionReasonCategory) {
    failureReasons.push(
      `expected reasoning ${assertions.expectedOutput.decisionReasonCategory}, got ${actual.decisionReasonCategory ?? "missing"}`
    );
  }

  if (
    assertions.expectedOutput.behaviorReasonCategory &&
    actual.memoryUpdate?.behaviorReasonCategory !== assertions.expectedOutput.behaviorReasonCategory
  ) {
    failureReasons.push(
      `expected behavior reason ${assertions.expectedOutput.behaviorReasonCategory}, got ${actual.memoryUpdate?.behaviorReasonCategory ?? "missing"}`
    );
  }

  for (const scoreName of ["repeatedReason", "impulse", "deliberateness"]) {
    const score = actual.scores?.[scoreName];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      failureReasons.push(`${scoreName} score ${score ?? "missing"} is not a 0-100 number`);
    }
  }

  for (const phrase of assertions.mustAskAbout ?? []) {
    if (!actual.userFacingMessage.toLowerCase().includes(phrase.toLowerCase())) {
      failureReasons.push(`missing required ask phrase: ${phrase}`);
    }
  }

  for (const phrase of assertions.mustNotSay ?? []) {
    if (actual.userFacingMessage.toLowerCase().includes(phrase.toLowerCase())) {
      failureReasons.push(`used forbidden phrase: ${phrase}`);
    }
  }

  if (assertions.expectedCooldownRangeSeconds) {
    if (typeof actual.aiCooldownSeconds !== "number") {
      failureReasons.push("missing aiCooldownSeconds");
    } else {
      const { min, max } = assertions.expectedCooldownRangeSeconds;
      if (actual.aiCooldownSeconds < min || actual.aiCooldownSeconds > max) {
        failureReasons.push(`cooldown ${actual.aiCooldownSeconds}s outside ${min}-${max}s`);
      }
    }
  }

  for (const [scoreName, range] of Object.entries(assertions.expectedScoreRanges ?? {})) {
    const score = actual.scores?.[scoreName];
    if (typeof score !== "number" || score < range.min || score > range.max) {
      failureReasons.push(`${scoreName} score ${score ?? "missing"} outside ${range.min}-${range.max}`);
    }
  }

  return {
    id: testCase.id,
    tags: assertions.tags ?? [],
    actualDecision: actual.decision,
    pass: failureReasons.length === 0,
    failureReasons
  };
}

async function providerDecision(input, runConfig) {
  const apiKey = process.env[runConfig.providerConfig.envKey];
  if (!apiKey) {
    throw new Error(`Set ${runConfig.providerConfig.envKey} to run provider mode for ${runConfig.providerConfig.label}.`);
  }

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
      messages: buildProviderMessages(input)
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
  return normalizeDecisionPayload(JSON.parse(raw));
}

function buildProviderMessages(input) {
  return [
    {
      role: "system",
      content: [
        "You are BetterMe, a private AI self-control checkpoint.",
        "Return JSON only.",
        "Valid decision values: ALLOW, AI_COOLDOWN, ASK_MORE, BLOCK.",
        "Use AI_COOLDOWN when the user should pause before deciding.",
        "Use ASK_MORE when a bounded purpose, time limit, or exit plan is missing.",
        "Use BLOCK for clearly impulsive, repeated, or high-risk patterns.",
        "Use ALLOW only for specific, bounded, intentional reasons.",
        "Do not shame the user. Do not use moral judgment. Do not generate explicit sexual content.",
        "decisionReasonCategory explains the current decision. memoryUpdate.behaviorReasonCategory describes the user's behavior pattern for future memory.",
        "Mapping rubric: intentional bounded use usually maps to clear_intention; vague boredom/stress/escape/loneliness/habit maps to insufficient_reason; repeated remembered patterns map to repeated_excuse; sensitive impulsive patterns map to high_risk_pattern.",
        "scores.repeatedReason, scores.impulse, and scores.deliberateness must be independent 0-100 ratings and do not need to sum to 100.",
        `Strictness: ${input.strictness}.`,
        `Target: ${input.targetDisplay}.`,
        `Pattern memory: ${JSON.stringify(input.patternMemorySnapshot ?? [])}`,
        'Schema: {"decision":"ALLOW|AI_COOLDOWN|ASK_MORE|BLOCK","userFacingMessage":"string","decisionReasonCategory":"repeated_excuse|clear_intention|high_risk_pattern|low_risk|insufficient_reason","unlockMinutes":number|null,"aiCooldownSeconds":number|null,"nextQuestion":string|null,"scores":{"repeatedReason":number,"impulse":number,"deliberateness":number},"memoryUpdate":{"behaviorReasonCategory":"stress|boredom|loneliness|escape|habit|intentional|other","patternNote":string|null}}'
      ].join("\n")
    },
    ...input.messages.map((message) => ({ role: message.role, content: message.content }))
  ];
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
    nextQuestion: decisionValue === "ASK_MORE" ? message : null,
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

function normalizeDecisionPayload(payload) {
  return {
    ...payload,
    userFacingMessage: String(payload.userFacingMessage ?? payload.nextQuestion ?? ""),
    scores: payload.scores ?? {}
  };
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
  const required = ["id", "title", "input", "eval"];
  for (const key of required) {
    if (!(key in testCase)) {
      throw new Error(`Eval case ${testCase.id ?? "unknown"} missing ${key}.`);
    }
  }
  if (!["gentle", "balanced", "strict", "monk"].includes(testCase.input.strictness)) {
    throw new Error(`Eval case ${testCase.id} has invalid strictness ${testCase.input.strictness}.`);
  }
  if (!Array.isArray(testCase.input.messages)) {
    throw new Error(`Eval case ${testCase.id} has invalid messages.`);
  }
  if (!testCase.eval.expectedOutput?.decision) {
    throw new Error(`Eval case ${testCase.id} missing eval.expectedOutput.decision.`);
  }
}

function normalizeCase(testCase) {
  return {
    ...testCase,
    input: {
      ...testCase.input,
      patternMemorySnapshot: testCase.input.patternMemorySnapshot ?? []
    }
  };
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
