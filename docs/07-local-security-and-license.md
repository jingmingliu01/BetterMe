# 本地安全与 License 规格

## 1. Security Position

BetterMe MVP 是 local BYOK extension。

安全目标：

- API Key 不以 plaintext 存在 `chrome.storage.local`。
- API Key 不发送给 BetterMe。
- API Key 不暴露给 content script。
- 降低 Chrome profile 文件泄露时的风险。
- 不要求用户每次输入 passphrase。

非目标：

- 防住本机 malware。
- 防住用户修改 extension 代码。
- 隐藏 prompt。
- 强 DRM。

参考：[OpenAI API Key Safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)

## 2. API Key Encryption Design

使用 Web Crypto：

- AES-GCM。
- Non-extractable CryptoKey。
- CryptoKey 存 IndexedDB。
- Ciphertext 存 IndexedDB 或 `chrome.storage.local`。

### Save Flow

```text
User enters API key
  -> background receives key
  -> generate AES-GCM CryptoKey with extractable=false
  -> store CryptoKey in IndexedDB
  -> encrypt API key with random IV
  -> store ciphertext + IV + metadata
  -> discard plaintext key
```

### Use Flow

```text
AI request starts
  -> background loads CryptoKey from IndexedDB
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

## 3. 这个方案防什么

能防：

- API Key 明文出现在 local storage 文件。
- 用户导出数据时误导出 API Key。
- 简单扫文件的 malware。
- storage dump 暴露 key。

不能防：

- 已经控制浏览器进程的 malware。
- 修改 extension 代码的人。
- 用户自己查看打包后的 JS。
- Prompt 被复制。

## 4. 为什么不做 Passphrase

Passphrase 更安全，但用户体验差。

当前决策：

- MVP 不要求 repeated passphrase。
- 使用 best-effort local encryption。
- 在 UI 中清楚说明安全边界。

## 5. Content Script Boundary

Content script 不应该：

- 读 encrypted API key records。
- 请求 plaintext API key。
- 调 provider endpoint。
- 访问 AI Track 内部数据，除非未来 overlay 必须用。

如果可用，可以调用 `chrome.storage.local.setAccessLevel`，把敏感 storage 限制在 trusted extension contexts。

参考：[chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## 6. Prompt and Code Visibility

所有 extension code 都在用户机器上。

因此：

- 不把 prompt 当商业机密。
- 不把你的共享 provider API Key 放进 extension。
- 不依赖本地 license check 作为强安全。

产品壁垒应该来自：

- UX。
- Blocking reliability。
- Memory design。
- Prompt iteration。
- Brand。
- Distribution。
- 未来 cloud features。

## 7. License MVP

MVP license：

- Local mock only。
- Dev settings 中提供 `mockLifetimeUnlocked`。
- 不接 payment。
- 不接真实 License Endpoint。

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

## 8. Future License Endpoint

未来 endpoint：

```text
POST /license/activate
POST /license/verify
POST /license/deactivate
```

设备规则：

- 每个 license 默认 3 台设备。

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

验证策略：

- Activation 必须联网。
- 每隔几天 verify。
- 离线给 grace period，例如 7-14 天。
- verify 失败且 grace period 结束后降级到 Free。
- 不删除用户本地数据。

## 9. Settings Privacy Copy

Settings 里建议写：

```text
Your API key is encrypted and stored locally in this browser. BetterMe does not receive it. AI Check requests are sent directly from the extension to the LLM provider you choose. Provider usage and billing are controlled by your provider account.
```

## 10. Data Export/Delete

Export 包含：

- blocked sites。
- settings。
- AI Track summaries。
- Pattern Memory。

Export 默认不包含：

- plaintext API Key。
- encrypted API key。
- CryptoKey material。

Delete 支持：

- delete provider API Key。
- delete AI history。
- delete all BetterMe local data。
