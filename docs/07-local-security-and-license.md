# Local Security and License Spec

## Security Position

BetterMe MVP is a local BYOK extension.

Security goals:

- Do not store API key plaintext in `chrome.storage.local`.
- Do not send API key to BetterMe.
- Do not expose API key to content scripts.
- Reduce static leakage risk from Chrome profile files.
- Keep UX simple: no repeated passphrase.

Non-goals:

- Perfect protection from malware.
- Perfect protection from a user modifying the extension.
- Hiding prompts or code from users.
- Strong DRM.

OpenAI reference: [API Key Safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)

## API Key Encryption Design

Use Web Crypto:

- AES-GCM encryption.
- Non-extractable CryptoKey.
- CryptoKey stored in IndexedDB.
- Ciphertext stored in IndexedDB or `chrome.storage.local`.

### Save Flow

```text
User enters API key
  -> background service worker receives key
  -> generate AES-GCM CryptoKey with extractable=false
  -> store CryptoKey in IndexedDB
  -> encrypt API key with random IV
  -> store ciphertext + IV + metadata
  -> discard plaintext key
```

### Use Flow

```text
AI request starts
  -> background service worker loads CryptoKey from IndexedDB
  -> loads ciphertext + IV
  -> decrypts API key in memory
  -> calls provider
  -> discards plaintext reference
```

### Stored Record

```ts
interface EncryptedApiKeyRecord {
  id: string;
  provider: "openai" | "deepseek" | "kimi";
  label: string;
  ciphertextBase64: string;
  ivBase64: string;
  algorithm: "AES-GCM";
  keyStoreId: string;
  createdAt: string;
  updatedAt: string;
}
```

## What This Protects

This protects against:

- Plaintext key appearing in local storage files.
- Accidental export of API key.
- Simple file-scanning malware looking for API key patterns.
- Debug dumps that include storage values.

This does not protect against:

- Malware running inside the browser process.
- A modified extension calling the decrypt function.
- A user inspecting extension code.
- Prompt or logic copying.

## Why No Passphrase

Passphrase would be stronger if the passphrase is never stored, but it creates repeated friction.

Product decision:

- Do not require repeated passphrase in MVP.
- Use best-effort local encryption.
- Clearly document the security model.

## Content Script Boundary

Content scripts should not:

- Read encrypted API key records.
- Request plaintext key.
- Call provider endpoints.
- Access AI Track internals unless necessary for UI.

Use `chrome.storage.local.setAccessLevel` if applicable to restrict storage access to trusted extension contexts.

Reference: [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Prompt and Code Visibility

All extension code can be inspected by users.

Therefore:

- Do not treat system prompts as secret.
- Do not put proprietary shared provider keys in extension code.
- Do not rely on local-only license checks as strong enforcement.

Product moat should come from:

- UX quality.
- Blocking reliability.
- Memory design.
- Prompt iteration.
- Brand.
- Distribution.
- Future cloud features.

## License MVP

MVP license:

- Local mock only.
- `mockLifetimeUnlocked: true` in dev settings.
- No payment.
- No real license endpoint.

Local state:

```ts
interface LicenseState {
  status: "free" | "lifetime_mock";
  unlockedFeatures: Array<
    | "ai_check"
    | "pattern_memory"
    | "advanced_strictness"
    | "provider_config"
  >;
  updatedAt: string;
}
```

## Future License Endpoint

Future endpoint:

```text
POST /license/activate
POST /license/verify
POST /license/deactivate
```

Future device rule:

- 3 devices per license.

Future extension state:

```ts
interface RemoteLicenseState {
  licenseKeyHash: string;
  deviceId: string;
  status: "active" | "inactive" | "expired" | "revoked";
  maxDevices: number;
  lastVerifiedAt: string;
  gracePeriodUntil: string;
}
```

Verification policy:

- Activation requires network.
- Periodic verify every few days.
- Offline grace period, for example 7-14 days.
- Failed verification downgrades to Free after grace period.
- Do not delete user local data when license becomes invalid.

## Privacy Copy Draft

Settings page should say:

```text
Your API key is encrypted and stored locally in this browser. BetterMe does not receive it. AI Check requests are sent directly from the extension to the LLM provider you choose. Provider usage and billing are controlled by your provider account.
```

## Data Export/Delete

Export should include:

- blocked sites
- settings
- AI Track summaries
- Pattern Memory

Export should not include:

- plaintext API key
- encrypted API key by default
- CryptoKey material

Delete should support:

- delete provider API key
- delete AI history
- delete all local BetterMe data

