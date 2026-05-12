import { PROVIDERS } from "../shared/constants";
import type { CheckpointDecision, ProviderId } from "../shared/types";
import { parseCheckpointDecision } from "./checkpoint-schema";
import type { ChatMessage } from "./context-builder";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function requestCheckpointDecision(input: {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  trackId: string;
}): Promise<CheckpointDecision> {
  if (input.apiKey.startsWith("demo-")) {
    return runDemoModel(input.trackId, input.messages);
  }

  const provider = PROVIDERS.find((item) => item.id === input.provider);
  if (!provider) {
    throw new Error("Unknown provider.");
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider request failed: ${response.status} ${text.slice(0, 160)}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Provider returned an empty response.");
  }
  return parseCheckpointDecision(content, input.trackId);
}

function latestUserMessage(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
}

function runDemoModel(trackId: string, messages: ChatMessage[]): CheckpointDecision {
  const user = latestUserMessage(messages);
  const repeated = messages.some(
    (message) => message.role === "system" && message.content.toLowerCase().includes(user.slice(0, 24))
  );
  const vague = user.length < 30 || /\bjust|bored|quick|stress|tired|habit\b/i.test(user);
  const intentional = /\bwork|research|specific|timer|10 minutes|15 minutes|client|interview|portfolio\b/i.test(user);

  let payload: Omit<CheckpointDecision, "id" | "trackId" | "createdAt" | "rawProvider">;
  if (repeated || (vague && user.includes("bored"))) {
    payload = {
      decision: "BLOCK",
      userFacingMessage:
        "This sounds like the same impulse pattern rather than a deliberate plan. I am blocking this until tomorrow.",
      reasoningCategory: "repeated_excuse",
      unlockMinutes: null,
      delaySeconds: null,
      nextQuestion: null,
      scores: { repeatedReason: 85, impulse: 88, deliberateness: 18 },
      memoryUpdate: {
        reasonCategory: "boredom",
        patternNote: "User tends to frame boredom as a reason to continue."
      }
    };
  } else if (intentional) {
    payload = {
      decision: "ALLOW",
      userFacingMessage: "Your reason is specific and bounded. I will allow a short unlock.",
      reasoningCategory: "clear_intention",
      unlockMinutes: 10,
      delaySeconds: null,
      nextQuestion: null,
      scores: { repeatedReason: 10, impulse: 22, deliberateness: 82 },
      memoryUpdate: {
        reasonCategory: "intentional",
        patternNote: "Specific bounded work-related reason."
      }
    };
  } else if (vague) {
    payload = {
      decision: "ASK_MORE",
      userFacingMessage: "What exact task will you do there, and when will you leave?",
      reasoningCategory: "insufficient_reason",
      unlockMinutes: null,
      delaySeconds: null,
      nextQuestion: "What exact task will you do there, and when will you leave?",
      scores: { repeatedReason: 20, impulse: 65, deliberateness: 35 },
      memoryUpdate: { reasonCategory: "other", patternNote: "Vague initial reason." }
    };
  } else {
    payload = {
      decision: "DELAY",
      userFacingMessage: "Pause for five minutes, then give a more concrete plan if you still want to continue.",
      reasoningCategory: "high_risk_pattern",
      unlockMinutes: null,
      delaySeconds: 300,
      nextQuestion: null,
      scores: { repeatedReason: 25, impulse: 58, deliberateness: 45 },
      memoryUpdate: { reasonCategory: "habit", patternNote: "Reason needs a short delay before retry." }
    };
  }

  return {
    ...payload,
    id: `decision_demo_${Date.now()}`,
    trackId,
    createdAt: new Date().toISOString(),
    rawProvider: JSON.stringify(payload)
  };
}
