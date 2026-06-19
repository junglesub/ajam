import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { decryptSecret, encryptSecret } from "./secret-store";
import { ensureApplicationSchema } from "./settings-store";

export type AiProvider = "GEMINI";
export type AiCleanupMode = "immediate" | "manual" | "scheduled";

export type UserAiSetting = {
  apiKeySaved: boolean;
  backfillLimit: number;
  backfillMissing: boolean;
  contextDays: number;
  cleanupMode: AiCleanupMode;
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
  cleanupMode: AiCleanupMode;
  enabled: boolean;
  model: string;
};

type UserAiSettingRow = {
  apiKeyEncrypted: string;
  backfillLimit: number;
  backfillMissing: number;
  contextDays: number;
  cleanupMode: string;
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
  cleanupMode: "immediate",
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
    "cleanupMode" TEXT NOT NULL DEFAULT 'immediate',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAiSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserAiSetting_userId_provider_key" ON "UserAiSetting"("userId", "provider")`);
  if (!(await hasColumn("UserAiSetting", "cleanupMode"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserAiSetting" ADD COLUMN "cleanupMode" TEXT NOT NULL DEFAULT 'immediate'`);
  }

  aiSchemaReady = true;
}

export async function getUserAiSetting(userId: string): Promise<UserAiSetting> {
  await ensureUserAiSettingSchema();

  const rows = await prisma.$queryRawUnsafe<UserAiSettingRow[]>(
    `SELECT "provider", "apiKeyEncrypted", "model", "enabled", "contextDays", "backfillMissing", "backfillLimit", "cleanupMode"
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
    cleanupMode: normalizeCleanupMode(row.cleanupMode),
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

  return encrypted ? await decryptSecret(encrypted, "user-ai-setting") : "";
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
  const apiKeyEncrypted = input.clearApiKey
    ? ""
    : apiKey
      ? await encryptSecret(apiKey, "user-ai-setting")
      : existingRows[0]?.apiKeyEncrypted ?? "";
  const model = normalizeModel(input.model);
  const contextDays = normalizeOption(input.contextDays, [0, 3, 5, 10], defaultAiSetting.contextDays);
  const backfillLimit = normalizeOption(input.backfillLimit, [1, 3, 5], defaultAiSetting.backfillLimit);
  const cleanupMode = normalizeCleanupMode(input.cleanupMode);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserAiSetting" ("id", "userId", "provider", "apiKeyEncrypted", "model", "enabled", "contextDays", "backfillMissing", "backfillLimit", "cleanupMode", "createdAt", "updatedAt")
     VALUES (?, ?, 'GEMINI', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "provider") DO UPDATE SET
       "apiKeyEncrypted" = excluded."apiKeyEncrypted",
       "model" = excluded."model",
       "enabled" = excluded."enabled",
       "contextDays" = excluded."contextDays",
       "backfillMissing" = excluded."backfillMissing",
       "backfillLimit" = excluded."backfillLimit",
       "cleanupMode" = excluded."cleanupMode",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    userId,
    apiKeyEncrypted,
    model,
    input.enabled ? 1 : 0,
    contextDays,
    input.backfillMissing ? 1 : 0,
    backfillLimit,
    cleanupMode
  );

  return getUserAiSetting(userId);
}

function normalizeModel(model: string): string {
  return model.trim() || defaultAiModel;
}

function normalizeCleanupMode(value: string | undefined): AiCleanupMode {
  return value === "manual" || value === "scheduled" ? value : "immediate";
}

function normalizeOption(value: number, allowed: number[], fallback: number): number {
  return allowed.includes(value) ? value : fallback;
}

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${tableName}")`);

  return rows.some((row) => row.name === columnName);
}
