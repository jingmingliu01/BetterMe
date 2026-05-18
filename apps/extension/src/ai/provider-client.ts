import { PROVIDERS } from "../shared/constants";
import type { CheckpointDecision, ProviderErrorCode, ProviderId, StrictnessLevel } from "../shared/types";
import { parseCheckpointDecision, validateDecisionConstraints } from "./checkpoint-schema";
import type { ChatMessage } from "./context-builder";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class ProviderRequestError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderRequestError";
    this.code = code;
  }
}

export async function requestCheckpointDecision(input: {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  sessionId: string;
  strictness: StrictnessLevel;
}): Promise<CheckpointDecision> {
  const provider = PROVIDERS.find((item) => item.id === input.provider);
  if (!provider) {
    throw new ProviderRequestError("unknown_provider_error", "Unknown provider.");
  }
  if (!provider.models.includes(input.model)) {
    throw new ProviderRequestError("invalid_model", "Selected model is not available for this provider.");
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderRequestError("provider_timeout", "Provider request timed out. Try again in a moment.");
    }
    throw new ProviderRequestError("network_error", "Provider network request failed.");
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderRequestError(
      classifyStatus(response.status, text),
      `Provider request failed: ${response.status} ${text.slice(0, 160)}`
    );
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new ProviderRequestError("bad_provider_response", "Provider returned an empty response.");
  }
  const decision = parseCheckpointDecision(content, input.sessionId);
  validateDecisionConstraints(decision, input.strictness);
  return decision;
}

function classifyStatus(status: number, body: string): ProviderErrorCode {
  const normalized = body.toLowerCase();
  if (status === 401 || status === 403) {
    return "invalid_key";
  }
  if (status === 404 || normalized.includes("model")) {
    return "invalid_model";
  }
  if (status === 429) {
    return normalized.includes("quota") || normalized.includes("insufficient") ? "insufficient_quota" : "rate_limited";
  }
  return "unknown_provider_error";
}
