import assert from "node:assert/strict";
import { createServer } from "vite";
import { validateCaseShape } from "./ai-check-contract-shape.mjs";

const server = await createServer({
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true }
});

try {
  const { normalizeAICooldownSeconds } = await server.ssrLoadModule("/src/shared/constants.ts");
  const {
    AI_CHECK_CONTRACT,
    AI_CHECK_DECISION_POLICY_RULES,
    AI_CHECK_DECISIONS,
    AI_CHECK_OUTPUT_EXAMPLE,
    AI_CHECK_OUTPUT_SCHEMA_SUMMARY,
    AI_CHECK_SCORING_RULES
  } = await server.ssrLoadModule("/src/shared/ai-check-contract.ts");
  const { buildStaticContractPrompt, buildStaticContractPromptParts } = await server.ssrLoadModule("/src/ai/prompt.ts");
  const {
    buildProviderMessages,
    buildRoundSnapshot,
    buildTrustedRoundContext,
    buildTrustedTurnContext
  } = await server.ssrLoadModule("/src/ai/context-builder.ts");
  const { parseCheckpointDecision, validateDecisionConstraints } = await server.ssrLoadModule("/src/ai/checkpoint-schema.ts");
  const { deriveDecisionPointSnapshotFromHistory } = await server.ssrLoadModule("/src/ai/decision-point-snapshot.ts");
  const { getDecisionMeter } = await server.ssrLoadModule("/src/ai/decision-meter.ts");
  const { requestCheckpointDecision } = await server.ssrLoadModule("/src/ai/provider-client.ts");

  const clamped = normalizeAICooldownSeconds("balanced", 20);
  assert.deepEqual(clamped, {
    originalSeconds: 20,
    normalizedSeconds: 60,
    minSeconds: 60,
    maxSeconds: 300
  });

  assert.equal(normalizeAICooldownSeconds("balanced", 700), null);

  assert.deepEqual(AI_CHECK_DECISIONS, ["ALLOW", "AI_COOLDOWN", "ASK_MORE", "BLOCK"]);
  assert.deepEqual(
    AI_CHECK_CONTRACT.sections.output.fields.map((field) => field.path),
    [
      "decision",
      "userFacingMessage",
      "decisionReasonCategory",
      "unlockMinutes",
      "aiCooldownSeconds",
      "scores.repeatedReason",
      "scores.impulse",
      "scores.deliberateness",
      "memoryUpdate.behaviorReasonCategory",
      "memoryUpdate.patternNote"
    ]
  );
  assert.deepEqual(
    AI_CHECK_CONTRACT.sections.evaluation.fields
      .map((field) => field.path)
      .filter((path) => path.startsWith("versions.")),
    ["versions.promptVersion", "versions.outputSchemaVersion", "versions.evaluationSchemaVersion"]
  );
  assert.deepEqual(AI_CHECK_CONTRACT.sections.evaluation.example.versions, AI_CHECK_CONTRACT.current);
  assert.ok(AI_CHECK_CONTRACT.sections.evaluation.fields.some((field) => field.path === "status"));
  const legacyEvalShapeErrors = validateCaseShape(
    AI_CHECK_CONTRACT,
    {
      ...AI_CHECK_CONTRACT.sections.evaluation.example,
      eval: {
        ...AI_CHECK_CONTRACT.sections.evaluation.example.eval,
        allowedDecisions: ["ALLOW"],
        mustAskAbout: ["duration"],
        expectedCooldownRangeSeconds: { min: 60, max: 300 }
      }
    },
    { label: "legacy eval shape" }
  );
  assert.ok(legacyEvalShapeErrors.some((error) => error.includes("allowedDecisions is not defined")));
  assert.ok(legacyEvalShapeErrors.some((error) => error.includes("mustAskAbout is not defined")));
  assert.ok(legacyEvalShapeErrors.some((error) => error.includes("expectedCooldownRangeSeconds is not defined")));

  const prompt = buildStaticContractPrompt();
  const promptParts = buildStaticContractPromptParts();
  assert.equal(
    prompt,
    promptParts
      .map((part) => part.text)
      .join("\n")
  );
  assert.ok(promptParts.some((part) => part.sourcePaths?.includes("AI_CHECK_CONTRACT.enums.decisions")));
  assert.ok(promptParts.some((part) => part.sourcePaths?.includes("AI_CHECK_CONTRACT.promptProgram.decisionPolicyRules")));
  assert.ok(promptParts.some((part) => part.sourcePaths?.includes("AI_CHECK_CONTRACT.promptProgram.scoringRules")));
  assert.ok(promptParts.some((part) => part.sourcePaths?.includes("AI_CHECK_CONTRACT.sections.output.example")));
  assert.ok(prompt.includes("<betterme_system_contract>"));
  assert.ok(prompt.includes(`<output_example>\n${JSON.stringify(AI_CHECK_OUTPUT_EXAMPLE, null, 2)}\n</output_example>`));
  assert.ok(prompt.includes(`<output_schema_summary>\n${AI_CHECK_OUTPUT_SCHEMA_SUMMARY}\n</output_schema_summary>`));
  assert.ok(prompt.includes(`<decision_policy>\n${AI_CHECK_DECISION_POLICY_RULES.map((rule) => `- ${rule.rule}`).join("\n")}\n</decision_policy>`));
  assert.ok(prompt.includes(`<scoring_rules>\n${AI_CHECK_SCORING_RULES.map((rule) => rule.rule).join("\n")}\n</scoring_rules>`));
  assert.ok(prompt.includes(`<decision_values>\n${AI_CHECK_DECISIONS.join(", ")}\n</decision_values>`));
  assert.ok(!prompt.includes("Assistant turn count before this response"));

  const roundSnapshot = buildRoundSnapshot({
    sessionId: "session_test",
    targetId: "target_test",
    targetDisplay: "youtube.com",
    strictness: "balanced",
    maxAssistantTurns: AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns,
    patternMemorySnapshot: []
  });
  const turnOneMessages = buildProviderMessages({
    round: roundSnapshot,
    messages: [{ role: "user", content: "I just want one quick video." }],
    turn: {
      assistantTurnCount: 0,
      nextAssistantTurn: 1,
      maxAssistantTurns: roundSnapshot.maxAssistantTurns,
      isFinalTurn: false
    }
  });
  const turnTwoMessages = buildProviderMessages({
    round: roundSnapshot,
    messages: [
      { role: "user", content: "I just want one quick video." },
      { role: "assistant", content: "What do you need it for?" },
      { role: "user", content: "Homework." }
    ],
    turn: {
      assistantTurnCount: 1,
      nextAssistantTurn: 2,
      maxAssistantTurns: roundSnapshot.maxAssistantTurns,
      isFinalTurn: false
    }
  });
  assert.equal(turnOneMessages[0].role, "system");
  assert.equal(turnOneMessages[1].role, "user");
  assert.equal(turnOneMessages.at(-1).role, "user");
  assert.equal(turnOneMessages[0].content, turnTwoMessages[0].content);
  assert.equal(turnOneMessages[1].content, turnTwoMessages[1].content);
  assert.notEqual(turnOneMessages.at(-1).content, turnTwoMessages.at(-1).content);
  assert.ok(buildTrustedRoundContext(roundSnapshot).includes("<strictness>\nbalanced\n</strictness>"));
  assert.ok(
    buildTrustedTurnContext({
      assistantTurnCount: 4,
      nextAssistantTurn: 5,
      maxAssistantTurns: 5,
      isFinalTurn: true
    }).includes("Do not return ASK_MORE")
  );

  const turnLevelSession = {
    id: "session_turn_level",
    targetId: "target_youtube",
    targetDisplay: "youtube.com",
    status: "active",
    startedAt: "2026-05-24T00:00:00.000Z",
    expiresAt: "2026-05-24T00:10:00.000Z",
    assistantTurnCount: 3,
    maxAssistantTurns: 5,
    strictness: "balanced",
    roundSnapshot
  };
  const turnLevelMessages = [
    {
      id: "msg_open",
      sessionId: turnLevelSession.id,
      role: "assistant",
      source: "local_opening",
      content: "You're trying to open youtube.com. What are you here to do, and why now?",
      createdAt: "2026-05-24T00:00:01.000Z"
    },
    {
      id: "msg_user_1",
      sessionId: turnLevelSession.id,
      role: "user",
      source: "user",
      content: "I want a break.",
      createdAt: "2026-05-24T00:00:02.000Z"
    },
    {
      id: "msg_assistant_1",
      sessionId: turnLevelSession.id,
      role: "assistant",
      source: "llm",
      content: "What will you watch and for how long?",
      createdAt: "2026-05-24T00:00:03.000Z"
    },
    {
      id: "msg_user_2",
      sessionId: turnLevelSession.id,
      role: "user",
      source: "user",
      content: "Maybe live music for 15 minutes.",
      createdAt: "2026-05-24T00:00:04.000Z"
    },
    {
      id: "msg_assistant_2",
      sessionId: turnLevelSession.id,
      role: "assistant",
      source: "llm",
      content: "Enjoy your break.",
      createdAt: "2026-05-24T00:00:05.000Z"
    },
    {
      id: "msg_user_3",
      sessionId: turnLevelSession.id,
      role: "user",
      source: "user",
      content: "Actually I will keep watching.",
      createdAt: "2026-05-24T00:00:06.000Z"
    },
    {
      id: "msg_assistant_3",
      sessionId: turnLevelSession.id,
      role: "assistant",
      source: "llm",
      content: "One more question.",
      createdAt: "2026-05-24T00:00:07.000Z"
    }
  ];
  const turnLevelDecisions = [
    {
      id: "decision_1",
      sessionId: turnLevelSession.id,
      decision: "ASK_MORE",
      userFacingMessage: "What will you watch and for how long?",
      decisionReasonCategory: "insufficient_reason",
      unlockMinutes: null,
      aiCooldownSeconds: null,
      scores: { repeatedReason: 0, impulse: 55, deliberateness: 45 },
      memoryUpdate: { behaviorReasonCategory: "other", patternNote: null },
      createdAt: "2026-05-24T00:00:03.000Z"
    },
    {
      id: "decision_2",
      sessionId: turnLevelSession.id,
      decision: "ALLOW",
      userFacingMessage: "Enjoy your break.",
      decisionReasonCategory: "clear_intention",
      unlockMinutes: 15,
      aiCooldownSeconds: null,
      scores: { repeatedReason: 0, impulse: 20, deliberateness: 85 },
      memoryUpdate: { behaviorReasonCategory: "intentional", patternNote: "User gave a bounded break." },
      createdAt: "2026-05-24T00:00:05.000Z",
      rawProvider: "{\"decision\":\"ALLOW\"}"
    },
    {
      id: "decision_3",
      sessionId: turnLevelSession.id,
      decision: "ASK_MORE",
      userFacingMessage: "One more question.",
      decisionReasonCategory: "insufficient_reason",
      unlockMinutes: null,
      aiCooldownSeconds: null,
      scores: { repeatedReason: 0, impulse: 65, deliberateness: 35 },
      memoryUpdate: { behaviorReasonCategory: "other", patternNote: null },
      createdAt: "2026-05-24T00:00:07.000Z"
    }
  ];
  const selectedTurnSnapshot = deriveDecisionPointSnapshotFromHistory({
    session: turnLevelSession,
    messages: turnLevelMessages,
    decisions: turnLevelDecisions,
    decision: turnLevelDecisions[1]
  });
  assert.equal(selectedTurnSnapshot.decisionOrdinal, 2);
  assert.equal(selectedTurnSnapshot.selectedAssistantMessageId, "msg_assistant_2");
  assert.equal(selectedTurnSnapshot.triggeringUserMessageId, "msg_user_2");
  assert.deepEqual(
    selectedTurnSnapshot.input.messages.map((message) => message.content),
    [
      "You're trying to open youtube.com. What are you here to do, and why now?",
      "I want a break.",
      "What will you watch and for how long?",
      "Maybe live music for 15 minutes."
    ]
  );
  assert.equal(selectedTurnSnapshot.input.sessionContext.assistantTurnCount, 1);
  assert.equal(selectedTurnSnapshot.input.sessionContext.isFinalTurn, false);
  assert.ok(!selectedTurnSnapshot.input.messages.some((message) => message.content.includes("keep watching")));
  assert.equal(selectedTurnSnapshot.actualOutput?.parsed.decision, "ALLOW");

  const contractExampleDecision = parseCheckpointDecision(JSON.stringify(AI_CHECK_OUTPUT_EXAMPLE), "session_contract");
  validateDecisionConstraints(contractExampleDecision, "balanced");

  const cooldownDecision = parseCheckpointDecision(
    JSON.stringify({
      decision: "AI_COOLDOWN",
      userFacingMessage: "Pause first.",
      decisionReasonCategory: "insufficient_reason",
      unlockMinutes: null,
      aiCooldownSeconds: 20,
      scores: {
        repeatedReason: 40,
        impulse: 75,
        deliberateness: 30
      },
      memoryUpdate: {
        behaviorReasonCategory: "habit",
        patternNote: "Weak reason while blocked."
      }
    }),
    "session_test"
  );
  validateDecisionConstraints(cooldownDecision, "balanced");
  assert.equal(cooldownDecision.aiCooldownSeconds, 60);
  assert.equal(cooldownDecision.aiCooldownNormalization?.originalSeconds, 20);

  const finalAskMore = parseCheckpointDecision(
    JSON.stringify({
      decision: "ASK_MORE",
      userFacingMessage: "One more thing.",
      decisionReasonCategory: "insufficient_reason",
      unlockMinutes: null,
      aiCooldownSeconds: null,
      scores: {
        repeatedReason: 20,
        impulse: 50,
        deliberateness: 40
      },
      memoryUpdate: {
        behaviorReasonCategory: "other",
        patternNote: null
      }
    }),
    "session_test"
  );
  assert.throws(
    () => validateDecisionConstraints(finalAskMore, "balanced", { isFinalTurn: true }),
    /final AI Check turn/
  );

  const meter = getDecisionMeter(cooldownDecision);
  assert.equal(meter.label, "Leaning cooldown");
  assert.ok(meter.value >= 25 && meter.value <= 58);

  const relaxedCategoryDecision = parseCheckpointDecision(
    JSON.stringify({
      decision: "ASK_MORE",
      userFacingMessage: "What would make this deliberate?",
      decisionReasonCategory: "vague reason",
      unlockMinutes: null,
      aiCooldownSeconds: null,
      scores: {
        repeatedReason: 20,
        impulse: 50,
        deliberateness: 40
      },
      memoryUpdate: {
        behaviorReasonCategory: "relaxation",
        patternNote: null
      }
    }),
    "session_test"
  );
  assert.equal(relaxedCategoryDecision.decisionReasonCategory, "insufficient_reason");
  assert.equal(relaxedCategoryDecision.memoryUpdate.behaviorReasonCategory, "other");

  assert.throws(
    () =>
      parseCheckpointDecision(
        JSON.stringify({
          decision: "ASK_MORE",
          userFacingMessage: "What is the specific task?",
          decisionReasonCategory: "insufficient_reason",
          unlockMinutes: null,
          aiCooldownSeconds: null,
          scores: {
            repeatedReason: 10,
            impulse: 120,
            deliberateness: 40
          },
          memoryUpdate: {
            behaviorReasonCategory: "other",
            patternNote: null
          }
        }),
        "session_test"
      ),
    /outside 0-100|<= 100/
  );

  const capturedRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    capturedRequests.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}"))
    });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "ASK_MORE",
                userFacingMessage: "What is the specific task?",
                decisionReasonCategory: "insufficient_reason",
                unlockMinutes: null,
                aiCooldownSeconds: null,
                scores: {
                  repeatedReason: 10,
                  impulse: 50,
                  deliberateness: 45
                },
                memoryUpdate: {
                  behaviorReasonCategory: "other",
                  patternNote: null
                }
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await requestCheckpointDecision({
      provider: "openai",
      model: "gpt-5.4-mini",
      apiKey: "test",
      messages: [{ role: "system", content: "Return json." }],
      sessionId: "session_test",
      strictness: "balanced"
    });
    await requestCheckpointDecision({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "test",
      messages: [{ role: "system", content: "Return json." }],
      sessionId: "session_test",
      strictness: "balanced"
    });
    await requestCheckpointDecision({
      provider: "kimi",
      model: "kimi-k2.6",
      apiKey: "test",
      messages: [{ role: "system", content: "Return json." }],
      sessionId: "session_test",
      strictness: "balanced"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    capturedRequests.map((request) => request.url),
    [
      "https://api.openai.com/v1/chat/completions",
      "https://api.deepseek.com/chat/completions",
      "https://api.moonshot.ai/v1/chat/completions"
    ]
  );
  for (const request of capturedRequests) {
    assert.equal(Array.isArray(request.body.messages), true);
    assert.equal(request.body.response_format.type, "json_object");
  }

  console.log("AI_CHECK_LOGIC_OK true");
} finally {
  await server.close();
}
