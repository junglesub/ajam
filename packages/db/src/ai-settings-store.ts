import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";

import { prisma } from "./client";
import { ensureApplicationSchema, getAppSetting, setAppSetting } from "./settings-store";

export type AiProvider = "GEMINI";

export type UserAiSetting = {
  apiKeySaved: boolean;
  backfillLimit: number;
  backfillMissing: boolean;
  contextDays: number;
  enabled: boolean;
  model: string;
  provider: AiProvider;
};

export type UserAiSettingUpdate = {
  apiKey?: string;
  backfillLimit: number;
  backfillMissing: boolean;
  clearApiKey?: boolean;
  contextDays: number;
  enabled: boolean;
  model: string;
};

type UserAiSettingRow = {
  apiKeyEncrypted: string;
  backfillLimit: number;
  backfillMissing: number;
  contextDays: number;
  enabled: number;
  model: string;
  provider: string;
};

const defaultAiModel = "gemini-3.1-flash-lite";
const defaultAiSetting: UserAiSetting = {
  apiKeySaved: false,
  backfillLimit: 3,
  backfillMissing: true,
  contextDays: 5,
  enabled: false,
  model: defaultAiModel,
  provider: "GEMINI"
};
let aiSchemaReady = false;

export async function ensureUserAiSettingSchema() {
  await ensureApplicationSchema();

  if (aiSchemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UserAiSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GEMINI',
    "apiKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    "enabled" INTEGER NOT NULL DEFAULT 0,
    "contextDays" INTEGER NOT NULL DEFAULT 5,
    "backfillMissing" INTEGER NOT NULL DEFAULT 1,
    "backfillLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAiSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserAiSetting_userId_provider_key" ON "UserAiSetting"("userId", "provider")`);

  aiSchemaReady = true;
}

export async function getUserAiSetting(userId: string): Promise<UserAiSetting> {
  await ensureUserAiSettingSchema();

  const rows = await prisma.$queryRawUnsafe<UserAiSettingRow[]>(
    `SELECT "provider", "apiKeyEncrypted", "model", "enabled", "contextDays", "backfillMissing", "backfillLimit"
     FROM "UserAiSetting"
     WHERE "userId" = ? AND "provider" = 'GEMINI'
     LIMIT 1`,
    userId
  );
  const row = rows[0];

  if (!row) {
    return { ...defaultAiSetting };
  }

  return {
    apiKeySaved: Boolean(row.apiKeyEncrypted),
    backfillLimit: normalizeOption(row.backfillLimit, [1, 3, 5], defaultAiSetting.backfillLimit),
    backfillMissing: Boolean(row.backfillMissing),
    contextDays: normalizeOption(row.contextDays, [0, 3, 5, 10], defaultAiSetting.contextDays),
    enabled: Boolean(row.enabled),
    model: normalizeModel(row.model),
    provider: "GEMINI"
  };
}

export async function getUserGeminiApiKey(userId: string): Promise<string> {
  await ensureUserAiSettingSchema();

  const rows = await prisma.$queryRawUnsafe<Array<{ apiKeyEncrypted: string }>>(
    `SELECT "apiKeyEncrypted"
     FROM "UserAiSetting"
     WHERE "userId" = ? AND "provider" = 'GEMINI'
     LIMIT 1`,
    userId
  );
  const encrypted = rows[0]?.apiKeyEncrypted ?? "";

  return encrypted ? await decryptSecret(encrypted) : "";
}

export async function updateUserAiSetting(userId: string, input: UserAiSettingUpdate): Promise<UserAiSetting> {
  await ensureUserAiSettingSchema();

  const existingRows = await prisma.$queryRawUnsafe<Array<{ apiKeyEncrypted: string }>>(
    `SELECT "apiKeyEncrypted"
     FROM "UserAiSetting"
     WHERE "userId" = ? AND "provider" = 'GEMINI'
     LIMIT 1`,
    userId
  );
  const apiKey = input.apiKey?.trim();
  const apiKeyEncrypted = input.clearApiKey ? "" : apiKey ? await encryptSecret(apiKey) : existingRows[0]?.apiKeyEncrypted ?? "";
  const model = normalizeModel(input.model);
  const contextDays = normalizeOption(input.contextDays, [0, 3, 5, 10], defaultAiSetting.contextDays);
  const backfillLimit = normalizeOption(input.backfillLimit, [1, 3, 5], defaultAiSetting.backfillLimit);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserAiSetting" ("id", "userId", "provider", "apiKeyEncrypted", "model", "enabled", "contextDays", "backfillMissing", "backfillLimit", "createdAt", "updatedAt")
     VALUES (?, ?, 'GEMINI', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "provider") DO UPDATE SET
       "apiKeyEncrypted" = excluded."apiKeyEncrypted",
       "model" = excluded."model",
       "enabled" = excluded."enabled",
       "contextDays" = excluded."contextDays",
       "backfillMissing" = excluded."backfillMissing",
       "backfillLimit" = excluded."backfillLimit",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    userId,
    apiKeyEncrypted,
    model,
    input.enabled ? 1 : 0,
    contextDays,
    input.backfillMissing ? 1 : 0,
    backfillLimit
  );

  return getUserAiSetting(userId);
}

function normalizeModel(model: string): string {
  return model.trim() || defaultAiModel;
}

function normalizeOption(value: number, allowed: number[], fallback: number): number {
  return allowed.includes(value) ? value : fallback;
}

async function getEncryptionSecret(): Promise<string> {
  const envSecret = process.env.AJAM_AI_SECRET?.trim();

  if (envSecret) {
    return envSecret;
  }

  const storedSecret = (await getAppSetting("ai_encryption_secret"))?.trim();

  if (storedSecret) {
    return storedSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  await setAppSetting("ai_encryption_secret", generatedSecret);

  return generatedSecret;
}

async function getEncryptionKey(): Promise<Buffer> {
  const secret = await getEncryptionSecret();

  return scryptSync(secret, "ajam-user-ai-setting", 32);
}

async function encryptSecret(value: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

async function decryptSecret(value: string): Promise<string> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    return "";
  }

  const decipher = createDecipheriv("aes-256-gcm", await getEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
