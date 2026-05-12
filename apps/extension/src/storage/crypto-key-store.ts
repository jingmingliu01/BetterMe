import type { ProviderId } from "../shared/types";
import { getRecord, putRecord, deleteRecord } from "./indexed-db";

interface StoredCryptoKey {
  id: string;
  key: CryptoKey;
}

interface EncryptedApiKeyRecord {
  id: ProviderId;
  provider: ProviderId;
  ciphertextBase64: string;
  ivBase64: string;
  updatedAt: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function generateCryptoKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function saveCryptoKey(id: string, key: CryptoKey): Promise<void> {
  await putRecord<StoredCryptoKey>("cryptoKeys", { id, key });
}

export async function loadCryptoKey(id: string): Promise<CryptoKey | null> {
  const record = await getRecord<StoredCryptoKey>("cryptoKeys", id);
  return record?.key ?? null;
}

async function getOrCreateProviderKey(provider: ProviderId): Promise<CryptoKey> {
  const id = `provider:${provider}`;
  const existing = await loadCryptoKey(id);
  if (existing) {
    return existing;
  }
  const key = await generateCryptoKey();
  await saveCryptoKey(id, key);
  return key;
}

export async function encryptApiKey(
  apiKey: string,
  key: CryptoKey
): Promise<{ ciphertextBase64: string; ivBase64: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    ciphertextBase64: arrayBufferToBase64(ciphertext),
    ivBase64: arrayBufferToBase64(iv.buffer)
  };
}

export async function decryptApiKey(record: EncryptedApiKeyRecord, key: CryptoKey): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(record.ivBase64) },
    key,
    base64ToArrayBuffer(record.ciphertextBase64)
  );
  return new TextDecoder().decode(plaintext);
}

export async function saveEncryptedApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  const key = await getOrCreateProviderKey(provider);
  const encrypted = await encryptApiKey(apiKey, key);
  await putRecord<EncryptedApiKeyRecord>("encryptedApiKeys", {
    id: provider,
    provider,
    ...encrypted,
    updatedAt: new Date().toISOString()
  });
}

export async function loadDecryptedApiKey(provider: ProviderId): Promise<string | null> {
  const key = await loadCryptoKey(`provider:${provider}`);
  const record = await getRecord<EncryptedApiKeyRecord>("encryptedApiKeys", provider);
  if (!key || !record) {
    return null;
  }
  return decryptApiKey(record, key);
}

export async function hasApiKey(provider: ProviderId): Promise<boolean> {
  return Boolean(await getRecord<EncryptedApiKeyRecord>("encryptedApiKeys", provider));
}

export async function deleteApiKey(provider: ProviderId): Promise<void> {
  await deleteRecord("encryptedApiKeys", provider);
  await deleteRecord("cryptoKeys", `provider:${provider}`);
}
