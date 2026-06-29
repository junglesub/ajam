import { createHash, randomBytes, randomUUID } from "node:crypto";

import { buildMonthlyTimeMacroExport, type MonthlyTimeMacroExport } from "@timesheet/domain";

import { prisma } from "./client";
import {
  ensureTimesheetSchema,
  listHolidays,
  listTimesheetEntries,
  listVacations,
  type StoredTimesheetDay,
  type StoredTimesheetEntry,
  type VacationRecord
} from "./timesheet-store";

const defaultConnectionLabel = "Chrome extension";
const defaultScopes = ["monthly_time_macro:read"];
const connectionCodeMaxAgeMs = 5 * 60 * 1000;

export type ExtensionConnection = {
  createdAt: string;
  id: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: string;
  userId: string;
};

export type ExtensionConnectionCode = {
  code: string;
  expiresAt: string;
};

export type ExtensionConnectionCodeDisplay = {
  expiresAt: string;
  nonce: string;
};

export type ExtensionRefreshResult = {
  connection: ExtensionConnection;
  refreshToken: string;
};

type ExtensionConnectionRow = {
  createdAt: unknown;
  id: string;
  label: string;
  lastUsedAt: unknown;
  refreshTokenHash: string;
  revokedAt: unknown;
  scopes: string;
  userId: string;
};

type ExtensionConnectionCodeRow = {
  codeHash: string;
  connectionLabel: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  scopes: string;
  usedAt: string | null;
  userId: string;
};

type ExtensionConnectionCodeDisplayRow = {
  code: string;
  displayExpiresAt: string;
  id: string;
  nonceHash: string;
  userId: string;
};

let extensionSchemaReady = false;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function createSecret(prefix: "ajam_code" | "ajam_display" | "ajam_refresh"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function normalizeLabel(label: string | undefined): string {
  return label?.trim() || defaultConnectionLabel;
}

function normalizeScopes(scopes: string[] | undefined): string {
  const normalized = (scopes ?? defaultScopes).map((scope) => scope.trim()).filter(Boolean);
  return (normalized.length > 0 ? normalized : defaultScopes).join(" ");
}

function normalizeDateString(value: string): string {
  const trimmed = value.trim();
  const sqliteTimestamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(trimmed);

  if (sqliteTimestamp) {
    return `${sqliteTimestamp[1]}T${sqliteTimestamp[2]}.000Z`;
  }

  return value;
}

function normalizeRequiredDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return normalizeDateString(value);
  }

  return "";
}

function normalizeNullableDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.trim() ? normalizeDateString(value) : null;
  }

  return null;
}

function mapConnection(row: ExtensionConnectionRow): ExtensionConnection {
  return {
    createdAt: normalizeRequiredDate(row.createdAt),
    id: row.id,
    label: row.label,
    lastUsedAt: normalizeNullableDate(row.lastUsedAt),
    revokedAt: normalizeNullableDate(row.revokedAt),
    scopes: row.scopes,
    userId: row.userId
  };
}

function getMonthRange(month: string): { endDateKey: string; startDateKey: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthNumber = match ? Number(match[2]) : Number.NaN;

  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Invalid month");
  }

  const year = Number(match[1]);
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    endDateKey: `${month}-${String(endDay).padStart(2, "0")}`,
    startDateKey: `${month}-01`
  };
}

export async function ensureExtensionAuthSchema(): Promise<void> {
  if (extensionSchemaReady) {
    return;
  }

  await ensureTimesheetSchema();

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExtensionConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Chrome extension',
    "refreshTokenHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ExtensionConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnection_refreshTokenHash_key" ON "ExtensionConnection"("refreshTokenHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExtensionConnection_userId_idx" ON "ExtensionConnection"("userId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExtensionConnectionCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "connectionLabel" TEXT NOT NULL DEFAULT 'Chrome extension',
    "scopes" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionConnectionCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnectionCode_codeHash_key" ON "ExtensionConnectionCode"("codeHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExtensionConnectionCode_userId_idx" ON "ExtensionConnectionCode"("userId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExtensionConnectionCodeDisplay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayExpiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionConnectionCodeDisplay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnectionCodeDisplay_nonceHash_key" ON "ExtensionConnectionCodeDisplay"("nonceHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExtensionConnectionCodeDisplay_userId_idx" ON "ExtensionConnectionCodeDisplay"("userId")`);

  extensionSchemaReady = true;
}

export async function createExtensionConnectionCode(params: {
  label?: string;
  scopes?: string[];
  userId: string;
}): Promise<ExtensionConnectionCode> {
  await ensureExtensionAuthSchema();

  const code = createSecret("ajam_code");
  const expiresAt = new Date(Date.now() + connectionCodeMaxAgeMs);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ExtensionConnectionCode" ("id", "userId", "codeHash", "connectionLabel", "scopes", "expiresAt", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    randomUUID(),
    params.userId,
    hashSecret(code),
    normalizeLabel(params.label),
    normalizeScopes(params.scopes),
    toIso(expiresAt)
  );

  return {
    code,
    expiresAt: toIso(expiresAt)
  };
}

export async function createExtensionConnectionCodeDisplay(params: {
  code: string;
  expiresAt: string;
  userId: string;
}): Promise<ExtensionConnectionCodeDisplay> {
  await ensureExtensionAuthSchema();

  const nonce = createSecret("ajam_display");

  await prisma.$executeRawUnsafe(`DELETE FROM "ExtensionConnectionCodeDisplay" WHERE "displayExpiresAt" <= ?`, toIso(new Date()));
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ExtensionConnectionCodeDisplay" ("id", "userId", "nonceHash", "code", "displayExpiresAt", "createdAt")
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    randomUUID(),
    params.userId,
    hashSecret(nonce),
    params.code,
    params.expiresAt
  );

  return {
    expiresAt: params.expiresAt,
    nonce
  };
}

export async function getExtensionConnectionCodeForDisplay(params: {
  nonce: string;
  userId: string;
}): Promise<string | null> {
  await ensureExtensionAuthSchema();

  const nowIso = toIso(new Date());
  const nonceHash = hashSecret(params.nonce.trim());

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(`DELETE FROM "ExtensionConnectionCodeDisplay" WHERE "displayExpiresAt" <= ?`, nowIso);

    const rows = await transaction.$queryRawUnsafe<ExtensionConnectionCodeDisplayRow[]>(
      `SELECT "id", "userId", "nonceHash", "code", "displayExpiresAt"
       FROM "ExtensionConnectionCodeDisplay"
       WHERE "nonceHash" = ? AND "userId" = ? AND "displayExpiresAt" > ?
       LIMIT 1`,
      nonceHash,
      params.userId,
      nowIso
    );
    const row = rows[0];

    if (!row) {
      return null;
    }

    const deletedCount = await transaction.$executeRawUnsafe(
      `DELETE FROM "ExtensionConnectionCodeDisplay"
       WHERE "id" = ? AND "userId" = ? AND "displayExpiresAt" > ?`,
      row.id,
      params.userId,
      nowIso
    );

    return deletedCount > 0 ? row.code : null;
  });
}

export async function exchangeExtensionConnectionCode(code: string): Promise<ExtensionRefreshResult | null> {
  await ensureExtensionAuthSchema();

  const codeHash = hashSecret(code.trim());
  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionCodeRow[]>(
    `SELECT "id", "userId", "codeHash", "connectionLabel", "scopes", "expiresAt", "usedAt", "createdAt"
     FROM "ExtensionConnectionCode"
     WHERE "codeHash" = ?
     LIMIT 1`,
    codeHash
  );
  const row = rows[0];
  const nowIso = toIso(new Date());

  if (!row || row.usedAt || new Date(row.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const refreshToken = createSecret("ajam_refresh");
  const connectionId = randomUUID();

  try {
    await prisma.$transaction(async (transaction) => {
      const updatedCount = await transaction.$executeRawUnsafe(
        `UPDATE "ExtensionConnectionCode"
         SET "usedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ? AND "usedAt" IS NULL AND "expiresAt" > ?`,
        row.id,
        nowIso
      );

      if (updatedCount === 0) {
        throw new Error("Extension connection code is no longer valid.");
      }

      await transaction.$executeRawUnsafe(
        `INSERT INTO "ExtensionConnection" ("id", "userId", "label", "refreshTokenHash", "scopes", "createdAt")
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        connectionId,
        row.userId,
        row.connectionLabel,
        hashSecret(refreshToken),
        row.scopes
      );

      await transaction.$executeRawUnsafe(`DELETE FROM "ExtensionConnectionCodeDisplay" WHERE "code" = ?`, code.trim());
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Extension connection code is no longer valid.") {
      return null;
    }

    throw error;
  }

  const connection = await getExtensionConnection(connectionId);

  if (!connection) {
    return null;
  }

  return {
    connection,
    refreshToken
  };
}

export async function rotateExtensionRefreshToken(refreshToken: string): Promise<ExtensionRefreshResult | null> {
  await ensureExtensionAuthSchema();

  const currentRefreshTokenHash = hashSecret(refreshToken.trim());
  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionRow[]>(
    `SELECT "id", "userId", "label", "refreshTokenHash", "scopes", "createdAt", "lastUsedAt", "revokedAt"
     FROM "ExtensionConnection"
     WHERE "refreshTokenHash" = ? AND "revokedAt" IS NULL
     LIMIT 1`,
    currentRefreshTokenHash
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  const nextRefreshToken = createSecret("ajam_refresh");
  const updatedCount = await prisma.$executeRawUnsafe(
    `UPDATE "ExtensionConnection"
     SET "refreshTokenHash" = ?, "lastUsedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "refreshTokenHash" = ? AND "revokedAt" IS NULL`,
    hashSecret(nextRefreshToken),
    row.id,
    currentRefreshTokenHash
  );

  if (updatedCount === 0) {
    return null;
  }

  const connection = await getExtensionConnection(row.id);

  if (!connection) {
    return null;
  }

  return {
    connection,
    refreshToken: nextRefreshToken
  };
}

export async function revokeExtensionConnection(connectionId: string, userId: string): Promise<void> {
  await ensureExtensionAuthSchema();

  await prisma.$executeRawUnsafe(
    `UPDATE "ExtensionConnection"
     SET "revokedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "userId" = ?`,
    connectionId,
    userId
  );
}

export async function getExtensionConnection(connectionId: string): Promise<ExtensionConnection | null> {
  await ensureExtensionAuthSchema();

  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionRow[]>(
    `SELECT "id", "userId", "label", "refreshTokenHash", "scopes", "createdAt", "lastUsedAt", "revokedAt"
     FROM "ExtensionConnection"
     WHERE "id" = ? AND "revokedAt" IS NULL
     LIMIT 1`,
    connectionId
  );
  const row = rows[0];

  return row ? mapConnection(row) : null;
}

function mergeLegacyVacations(days: StoredTimesheetDay[], vacations: VacationRecord[]): StoredTimesheetDay[] {
  const daysByDate = new Map(days.map((day) => [day.dateKey, { ...day, entries: [...day.entries] }]));

  for (const vacation of vacations) {
    const day = daysByDate.get(vacation.dateKey) ?? {
      aiRewriteRequested: false,
      dateKey: vacation.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: ""
    };

    if (day.entries.some((entry) => entry.kind === "VACATION")) {
      daysByDate.set(vacation.dateKey, day);
      continue;
    }

    const vacationEntry: StoredTimesheetEntry = {
      aiTranslation: "",
      clientId: `legacy-vacation-${vacation.dateKey}`,
      content: "",
      holidayName: "",
      hours: vacation.hours,
      id: "",
      kind: "VACATION",
      notionCards: [],
      project: "",
      sortOrder: day.entries.length,
      vacationName: vacation.name
    };

    day.entries.push(vacationEntry);
    daysByDate.set(vacation.dateKey, day);
  }

  return Array.from(daysByDate.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export async function getMonthlyTimeMacroExportForUser(params: {
  month: string;
  userId: string;
}): Promise<MonthlyTimeMacroExport> {
  const range = getMonthRange(params.month);
  const [days, holidays, vacations] = await Promise.all([
    listTimesheetEntries({ ...range, userId: params.userId }),
    listHolidays(range),
    listVacations({ ...range, userId: params.userId })
  ]);

  return buildMonthlyTimeMacroExport({
    days: mergeLegacyVacations(days, vacations),
    holidays,
    month: params.month
  });
}
