import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { getAppSetting, setAppSetting } from "./settings-store";

async function getEncryptionSecret(): Promise<string> {
  const envSecret = process.env.AJAM_SECRET?.trim() || process.env.AJAM_AI_SECRET?.trim();

  if (envSecret) {
    return envSecret;
  }

  const storedSecret = (await getAppSetting("app_encryption_secret"))?.trim();

  if (storedSecret) {
    return storedSecret;
  }

  const legacyAiSecret = (await getAppSetting("ai_encryption_secret"))?.trim();

  if (legacyAiSecret) {
    await setAppSetting("app_encryption_secret", legacyAiSecret);
    return legacyAiSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  await setAppSetting("app_encryption_secret", generatedSecret);

  return generatedSecret;
}

async function getEncryptionKey(purpose: string): Promise<Buffer> {
  return scryptSync(await getEncryptionSecret(), `ajam-${purpose}`, 32);
}

export async function encryptSecret(value: string, purpose: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await getEncryptionKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export async function decryptSecret(value: string, purpose: string): Promise<string> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    return "";
  }

  const decipher = createDecipheriv("aes-256-gcm", await getEncryptionKey(purpose), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
