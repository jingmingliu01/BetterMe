import { PROVIDERS } from "../shared/constants";
import type { AccessState, AIReadiness, ProviderId, UserSettings } from "../shared/types";

export function deriveAIReadiness(input: {
  settings: UserSettings;
  accessState: AccessState;
  targetExists: boolean;
  providerKeyReady: boolean;
}): AIReadiness {
  if (!input.targetExists) {
    return "target_missing";
  }
  if (input.accessState === "block_held_until_tomorrow") {
    return "blocked_by_hold";
  }
  if (input.accessState === "cooling_down") {
    return "cooling_down";
  }
  if (input.accessState === "temporarily_unlocked") {
    return "temporarily_unlocked";
  }

  const provider = PROVIDERS.find((item) => item.id === input.settings.provider);
  if (!provider || !provider.models.includes(input.settings.model)) {
    return "invalid_provider_model";
  }
  if (!input.providerKeyReady) {
    return "missing_provider_key";
  }
  return "ready";
}

export function getAIReadinessMessage(readiness: AIReadiness, provider?: ProviderId): string {
  const providerLabel = PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
  switch (readiness) {
    case "missing_provider_key":
      return providerLabel
        ? `Save a ${providerLabel} API key to use AI Check.`
        : "Save a provider API key to use AI Check.";
    case "invalid_provider_model":
      return "The selected provider model is no longer available. Choose a valid model in Settings.";
    case "blocked_by_hold":
      return "This target is blocked until tomorrow.";
    case "cooling_down":
      return "AI Check is paused while Basic Cooldown is active.";
    case "temporarily_unlocked":
      return "This site is already temporarily unlocked.";
    case "target_missing":
      return "This blocked target no longer exists.";
    default:
      return "";
  }
}
