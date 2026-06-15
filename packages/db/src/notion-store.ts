import { randomUUID } from "node:crypto";

import type { TimesheetEntryNotionCardDraft } from "@timesheet/domain";

import { prisma } from "./client";
import { decryptSecret, encryptSecret } from "./secret-store";
import { ensureApplicationSchema } from "./settings-store";

export type NotionPropertyDescriptor = {
  id: string;
  name: string;
  type: string;
};

export type DateMappingMode = "separate_properties" | "single_range_property";
export type NotionAuthType = "internal_token" | "oauth";

export type UserNotionConnection = {
  ajamLastUpdateProperty: NotionPropertyDescriptor | null;
  analysisConfigVersion: number;
  authType: NotionAuthType;
  availableHoursProperty: NotionPropertyDescriptor | null;
  categoryProperty: NotionPropertyDescriptor | null;
  databaseId: string;
  dataSourceId: string;
  dataSourceName: string;
  dateMappingMode: DateMappingMode;
  doneStatusValues: string[];
  endDateProperty: NotionPropertyDescriptor | null;
  hasToken: boolean;
  lastSyncError: string;
  lastSyncedAt: string;
  lastWorkedDateProperty: NotionPropertyDescriptor | null;
  notionApiVersion: string;
  sourceInput: string;
  startDateProperty: NotionPropertyDescriptor | null;
  statusProperty: NotionPropertyDescriptor | null;
  titleProperty: NotionPropertyDescriptor | null;
  workDayCountProperty: NotionPropertyDescriptor | null;
  workHoursProperty: NotionPropertyDescriptor | null;
};

export type NotionCardCacheRecord = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  rawPropertiesJson: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
};

export type NotionSyncRunStatus = "success" | "failed";
export type NotionSyncScopeType = "date" | "month" | "schema" | "manual_recent" | "full";

export type NotionSyncRunRecord = {
  cardsFetched: number;
  errorMessage: string;
  finishedAt: string;
  partial: boolean;
  status: NotionSyncRunStatus;
};

type ConnectionRow = {
  accessTokenEncrypted: string;
  ajamLastUpdatePropertyJson: string;
  analysisConfigVersion: number;
  authType: string;
  availableHoursPropertyJson: string;
  categoryPropertyJson: string;
  dataSourceId: string;
  dataSourceName: string;
  databaseId: string;
  dateMappingMode: string;
  doneStatusValuesJson: string;
  endDatePropertyJson: string;
  lastSyncError: string;
  lastSyncedAt: unknown;
  lastWorkedDatePropertyJson: string;
  notionApiVersion: string;
  sourceInput: string;
  startDatePropertyJson: string;
  statusPropertyJson: string;
  titlePropertyJson: string;
  workDayCountPropertyJson: string;
  workHoursPropertyJson: string;
};

type NotionCardCacheRow = Omit<NotionCardCacheRecord, "archived" | "stale"> & {
  archived: number;
  stale: number;
};

type NotionSyncRunRow = Omit<NotionSyncRunRecord, "finishedAt" | "partial"> & {
  finishedAt: unknown;
  partial: number;
};

let notionSchemaReady = false;

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${tableName}")`);

  return rows.some((row) => row.name === columnName);
}

export async function ensureNotionSchema() {
  await ensureApplicationSchema();

  if (notionSchemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UserNotionConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'internal_token',
    "notionApiVersion" TEXT NOT NULL DEFAULT '2026-03-11',
    "accessTokenEncrypted" TEXT NOT NULL DEFAULT '',
    "refreshTokenEncrypted" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" DATETIME,
    "sourceInput" TEXT NOT NULL DEFAULT '',
    "databaseId" TEXT NOT NULL DEFAULT '',
    "dataSourceId" TEXT NOT NULL DEFAULT '',
    "dataSourceName" TEXT NOT NULL DEFAULT '',
    "titlePropertyJson" TEXT NOT NULL DEFAULT '',
    "statusPropertyJson" TEXT NOT NULL DEFAULT '',
    "categoryPropertyJson" TEXT NOT NULL DEFAULT '',
    "startDatePropertyJson" TEXT NOT NULL DEFAULT '',
    "endDatePropertyJson" TEXT NOT NULL DEFAULT '',
    "workHoursPropertyJson" TEXT NOT NULL DEFAULT '',
    "workDayCountPropertyJson" TEXT NOT NULL DEFAULT '',
    "availableHoursPropertyJson" TEXT NOT NULL DEFAULT '',
    "lastWorkedDatePropertyJson" TEXT NOT NULL DEFAULT '',
    "ajamLastUpdatePropertyJson" TEXT NOT NULL DEFAULT '',
    "dateMappingMode" TEXT NOT NULL DEFAULT 'separate_properties',
    "doneStatusValuesJson" TEXT NOT NULL DEFAULT '[]',
    "tokenLastValidatedAt" DATETIME,
    "schemaLastFetchedAt" DATETIME,
    "analysisConfigVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedAt" DATETIME,
    "lastSyncError" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotionConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserNotionConnection_userId_key" ON "UserNotionConnection"("userId")`);
  if (!(await hasColumn("UserNotionConnection", "workHoursPropertyJson"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserNotionConnection" ADD COLUMN "workHoursPropertyJson" TEXT NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn("UserNotionConnection", "workDayCountPropertyJson"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserNotionConnection" ADD COLUMN "workDayCountPropertyJson" TEXT NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn("UserNotionConnection", "availableHoursPropertyJson"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserNotionConnection" ADD COLUMN "availableHoursPropertyJson" TEXT NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn("UserNotionConnection", "lastWorkedDatePropertyJson"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserNotionConnection" ADD COLUMN "lastWorkedDatePropertyJson" TEXT NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn("UserNotionConnection", "ajamLastUpdatePropertyJson"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserNotionConnection" ADD COLUMN "ajamLastUpdatePropertyJson" TEXT NOT NULL DEFAULT ''`);
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NotionCardCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "endDate" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "lastEditedTime" TEXT NOT NULL DEFAULT '',
    "rawPropertiesJson" TEXT NOT NULL DEFAULT '',
    "archived" INTEGER NOT NULL DEFAULT 0,
    "stale" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" DATETIME,
    "analysisConfigVersionUsed" INTEGER NOT NULL DEFAULT 1,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotionCardCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NotionCardCache_userId_notionPageId_key" ON "NotionCardCache"("userId", "notionPageId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_startDate_endDate_idx" ON "NotionCardCache"("userId", "startDate", "endDate")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_status_idx" ON "NotionCardCache"("userId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_category_idx" ON "NotionCardCache"("userId", "category")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WorkEntryNotionCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timesheetEntryId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "allocatedHours" REAL NOT NULL DEFAULT 0 CHECK ("allocatedHours" >= 0),
    "allocationMode" TEXT NOT NULL DEFAULT 'auto',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkEntryNotionCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WorkEntryNotionCard_user_entry_page_key" ON "WorkEntryNotionCard"("userId", "timesheetEntryId", "notionPageId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_dateKey_idx" ON "WorkEntryNotionCard"("userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_notionPageId_idx" ON "WorkEntryNotionCard"("userId", "notionPageId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NotionSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeStartDate" TEXT NOT NULL DEFAULT '',
    "scopeEndDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "cardsFetched" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "analysisConfigVersionUsed" INTEGER NOT NULL DEFAULT 1,
    "partial" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NotionSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionSyncRun_scope_idx" ON "NotionSyncRun"("userId", "scopeType", "scopeStartDate", "scopeEndDate", "finishedAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionSyncRun_status_idx" ON "NotionSyncRun"("userId", "status", "finishedAt")`);

  notionSchemaReady = true;
}

export async function getUserNotionConnection(userId: string): Promise<UserNotionConnection | null> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<ConnectionRow[]>(
    `SELECT "authType", "notionApiVersion", "accessTokenEncrypted", "sourceInput", "databaseId", "dataSourceId", "dataSourceName",
            "titlePropertyJson", "statusPropertyJson", "categoryPropertyJson", "startDatePropertyJson", "endDatePropertyJson",
            "workHoursPropertyJson", "workDayCountPropertyJson", "availableHoursPropertyJson", "lastWorkedDatePropertyJson", "ajamLastUpdatePropertyJson", "dateMappingMode", "doneStatusValuesJson", "analysisConfigVersion",
            strftime('%Y-%m-%dT%H:%M:%fZ', "lastSyncedAt") AS "lastSyncedAt", "lastSyncError"
     FROM "UserNotionConnection"
     WHERE "userId" = ?
     LIMIT 1`,
    userId
  );

  return rows[0] ? mapConnection(rows[0]) : null;
}

export async function getUserNotionAccessToken(userId: string): Promise<string> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<Array<{ accessTokenEncrypted: string }>>(
    `SELECT "accessTokenEncrypted" FROM "UserNotionConnection" WHERE "userId" = ? LIMIT 1`,
    userId
  );
  const encrypted = rows[0]?.accessTokenEncrypted ?? "";

  return encrypted ? decryptSecret(encrypted, "user-notion-token") : "";
}

export async function upsertUserNotionConnection(params: {
  accessToken?: string;
  clearToken?: boolean;
  connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
  userId: string;
}): Promise<UserNotionConnection> {
  await ensureNotionSchema();

  const existing = await prisma.$queryRawUnsafe<Array<{ accessTokenEncrypted: string; analysisConfigVersion: number }>>(
    `SELECT "accessTokenEncrypted", "analysisConfigVersion" FROM "UserNotionConnection" WHERE "userId" = ? LIMIT 1`,
    params.userId
  );
  const accessToken = params.accessToken?.trim();
  const accessTokenEncrypted = params.clearToken
    ? ""
    : accessToken
      ? await encryptSecret(accessToken, "user-notion-token")
      : existing[0]?.accessTokenEncrypted ?? "";
  const nextVersion = Math.max(params.connection.analysisConfigVersion, existing[0]?.analysisConfigVersion ?? 1);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotionConnection" (
       "id", "userId", "authType", "notionApiVersion", "accessTokenEncrypted", "sourceInput", "databaseId", "dataSourceId",
       "dataSourceName", "titlePropertyJson", "statusPropertyJson", "categoryPropertyJson", "startDatePropertyJson",
       "endDatePropertyJson", "workHoursPropertyJson", "workDayCountPropertyJson", "availableHoursPropertyJson", "lastWorkedDatePropertyJson", "ajamLastUpdatePropertyJson", "dateMappingMode", "doneStatusValuesJson", "analysisConfigVersion", "updatedAt"
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("userId") DO UPDATE SET
       "authType" = excluded."authType",
       "notionApiVersion" = excluded."notionApiVersion",
       "accessTokenEncrypted" = excluded."accessTokenEncrypted",
       "sourceInput" = excluded."sourceInput",
       "databaseId" = excluded."databaseId",
       "dataSourceId" = excluded."dataSourceId",
       "dataSourceName" = excluded."dataSourceName",
       "titlePropertyJson" = excluded."titlePropertyJson",
       "statusPropertyJson" = excluded."statusPropertyJson",
       "categoryPropertyJson" = excluded."categoryPropertyJson",
       "startDatePropertyJson" = excluded."startDatePropertyJson",
       "endDatePropertyJson" = excluded."endDatePropertyJson",
       "workHoursPropertyJson" = excluded."workHoursPropertyJson",
       "workDayCountPropertyJson" = excluded."workDayCountPropertyJson",
       "availableHoursPropertyJson" = excluded."availableHoursPropertyJson",
       "lastWorkedDatePropertyJson" = excluded."lastWorkedDatePropertyJson",
       "ajamLastUpdatePropertyJson" = excluded."ajamLastUpdatePropertyJson",
       "dateMappingMode" = excluded."dateMappingMode",
       "doneStatusValuesJson" = excluded."doneStatusValuesJson",
       "analysisConfigVersion" = excluded."analysisConfigVersion",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    params.connection.authType,
    params.connection.notionApiVersion,
    accessTokenEncrypted,
    params.connection.sourceInput,
    params.connection.databaseId,
    params.connection.dataSourceId,
    params.connection.dataSourceName,
    JSON.stringify(params.connection.titleProperty),
    JSON.stringify(params.connection.statusProperty),
    JSON.stringify(params.connection.categoryProperty),
    JSON.stringify(params.connection.startDateProperty),
    JSON.stringify(params.connection.endDateProperty),
    JSON.stringify(params.connection.workHoursProperty),
    JSON.stringify(params.connection.workDayCountProperty),
    JSON.stringify(params.connection.availableHoursProperty),
    JSON.stringify(params.connection.lastWorkedDateProperty),
    JSON.stringify(params.connection.ajamLastUpdateProperty),
    params.connection.dateMappingMode,
    JSON.stringify(params.connection.doneStatusValues),
    nextVersion
  );

  const updated = await getUserNotionConnection(params.userId);

  if (!updated) {
    throw new Error("Notion 연결 설정을 저장하지 못했습니다.");
  }

  return updated;
}

export async function upsertNotionCardCache(params: {
  analysisConfigVersion: number;
  cards: NotionCardCacheRecord[];
  userId: string;
}) {
  await ensureNotionSchema();

  for (const card of params.cards) {
    await upsertNotionCardCacheRecord({
      analysisConfigVersion: params.analysisConfigVersion,
      card,
      execute: prisma.$executeRawUnsafe.bind(prisma),
      userId: params.userId
    });
  }
}

export async function replaceNotionCardCacheForDate(params: {
  analysisConfigVersion: number;
  cards: NotionCardCacheRecord[];
  dateKey: string;
  userId: string;
}) {
  await ensureNotionSchema();

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `UPDATE "NotionCardCache"
       SET "stale" = 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "userId" = ?
         AND trim("startDate") <> ''
         AND "startDate" <= ?
         AND (trim("endDate") = '' OR "endDate" >= ?)`,
      params.userId,
      params.dateKey,
      params.dateKey
    );

    for (const card of params.cards) {
      await upsertNotionCardCacheRecord({
        analysisConfigVersion: params.analysisConfigVersion,
        card,
        execute: transaction.$executeRawUnsafe.bind(transaction),
        userId: params.userId
      });
    }
  });
}

export async function listCachedNotionCards(params: {
  endDateKey: string;
  startDateKey: string;
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<NotionCardCacheRow[]>(
    `SELECT "notionPageId", "title", "status", "category", "startDate", "endDate", "url", "lastEditedTime", "rawPropertiesJson", "archived", "stale"
     FROM "NotionCardCache"
     WHERE "userId" = ?
       AND "stale" = 0
       AND trim("startDate") <> ''
       AND "startDate" <= ?
       AND (trim("endDate") = '' OR "endDate" >= ?)
     ORDER BY "startDate" ASC, "title" ASC`,
    params.userId,
    params.endDateKey,
    params.startDateKey
  );

  return rows.map((row) => ({
    ...row,
    archived: Boolean(row.archived),
    stale: Boolean(row.stale)
  }));
}

async function upsertNotionCardCacheRecord(params: {
  analysisConfigVersion: number;
  card: NotionCardCacheRecord;
  execute: (query: string, ...values: unknown[]) => Promise<unknown>;
  userId: string;
}) {
  await params.execute(
    `INSERT INTO "NotionCardCache" (
       "id", "userId", "notionPageId", "title", "status", "category", "startDate", "endDate", "url", "lastEditedTime",
       "rawPropertiesJson", "archived", "stale", "lastSeenAt", "analysisConfigVersionUsed", "syncedAt", "updatedAt"
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "notionPageId") DO UPDATE SET
       "title" = excluded."title",
       "status" = excluded."status",
       "category" = excluded."category",
       "startDate" = excluded."startDate",
       "endDate" = excluded."endDate",
       "url" = excluded."url",
       "lastEditedTime" = excluded."lastEditedTime",
       "rawPropertiesJson" = excluded."rawPropertiesJson",
       "archived" = excluded."archived",
       "stale" = excluded."stale",
       "lastSeenAt" = CURRENT_TIMESTAMP,
       "analysisConfigVersionUsed" = excluded."analysisConfigVersionUsed",
       "syncedAt" = CURRENT_TIMESTAMP,
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    params.card.notionPageId,
    params.card.title,
    params.card.status,
    params.card.category,
    params.card.startDate,
    params.card.endDate,
    params.card.url,
    params.card.lastEditedTime,
    params.card.rawPropertiesJson,
    params.card.archived ? 1 : 0,
    params.card.stale ? 1 : 0,
    params.analysisConfigVersion
  );
}

export async function listCachedNotionCardsByPageIds(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  await ensureNotionSchema();

  const uniquePageIds = [...new Set(params.notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];

  if (uniquePageIds.length === 0) {
    return [];
  }

  const pageIdPlaceholders = uniquePageIds.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<NotionCardCacheRow[]>(
    `SELECT "notionPageId", "title", "status", "category", "startDate", "endDate", "url", "lastEditedTime", "rawPropertiesJson", "archived", "stale"
     FROM "NotionCardCache"
     WHERE "userId" = ? AND "notionPageId" IN (${pageIdPlaceholders})
     ORDER BY "title" ASC`,
    params.userId,
    ...uniquePageIds
  );

  return rows.map((row) => ({
    ...row,
    archived: Boolean(row.archived),
    stale: Boolean(row.stale)
  }));
}

export async function getLatestNotionSyncRun(params: {
  scopeEndDate: string;
  scopeStartDate: string;
  scopeType: NotionSyncScopeType;
  status?: NotionSyncRunStatus;
  userId: string;
}): Promise<NotionSyncRunRecord | null> {
  await ensureNotionSchema();

  const statusCondition = params.status ? ` AND "status" = ?` : "";
  const rows = await prisma.$queryRawUnsafe<NotionSyncRunRow[]>(
    `SELECT "status", strftime('%Y-%m-%dT%H:%M:%fZ', "finishedAt") AS "finishedAt", "cardsFetched", "errorMessage", "partial"
     FROM "NotionSyncRun"
     WHERE "userId" = ?
       AND "scopeType" = ?
       AND "scopeStartDate" = ?
       AND "scopeEndDate" = ?${statusCondition}
     ORDER BY "finishedAt" DESC
     LIMIT 1`,
    params.userId,
    params.scopeType,
    params.scopeStartDate,
    params.scopeEndDate,
    ...(params.status ? [params.status] : [])
  );
  const row = rows[0];

  return row
    ? {
        ...row,
        finishedAt: normalizeDateTimeString(row.finishedAt),
        partial: Boolean(row.partial)
      }
    : null;
}

export async function sumLinkedNotionHoursByPage(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<Map<string, number>> {
  await ensureNotionSchema();

  const uniquePageIds = [...new Set(params.notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];
  const totals = new Map(uniquePageIds.map((pageId) => [pageId, 0]));

  if (uniquePageIds.length === 0) {
    return totals;
  }

  const pageIdPlaceholders = uniquePageIds.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ notionPageId: string; totalHours: number | null }>>(
    `SELECT "notionPageId", coalesce(sum("allocatedHours"), 0) AS "totalHours"
     FROM "WorkEntryNotionCard"
     WHERE "userId" = ? AND "notionPageId" IN (${pageIdPlaceholders})
     GROUP BY "notionPageId"`,
    params.userId,
    ...uniquePageIds
  );

  for (const row of rows) {
    totals.set(row.notionPageId, Number(row.totalHours ?? 0));
  }

  return totals;
}

export async function countLinkedNotionWorkDaysByPage(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<Map<string, number>> {
  await ensureNotionSchema();

  const uniquePageIds = [...new Set(params.notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];
  const totals = new Map(uniquePageIds.map((pageId) => [pageId, 0]));

  if (uniquePageIds.length === 0) {
    return totals;
  }

  const pageIdPlaceholders = uniquePageIds.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ notionPageId: string; workDayCount: number | null }>>(
    `SELECT "notionPageId", count(DISTINCT "dateKey") AS "workDayCount"
     FROM "WorkEntryNotionCard"
     WHERE "userId" = ? AND "notionPageId" IN (${pageIdPlaceholders})
     GROUP BY "notionPageId"`,
    params.userId,
    ...uniquePageIds
  );

  for (const row of rows) {
    totals.set(row.notionPageId, Number(row.workDayCount ?? 0));
  }

  return totals;
}

export async function getLatestLinkedNotionWorkDateByPage(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<Map<string, string>> {
  await ensureNotionSchema();

  const uniquePageIds = [...new Set(params.notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];
  const dates = new Map(uniquePageIds.map((pageId) => [pageId, ""]));

  if (uniquePageIds.length === 0) {
    return dates;
  }

  const pageIdPlaceholders = uniquePageIds.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ lastWorkedDate: string | null; notionPageId: string }>>(
    `SELECT "notionPageId", max("dateKey") AS "lastWorkedDate"
     FROM "WorkEntryNotionCard"
     WHERE "userId" = ? AND "notionPageId" IN (${pageIdPlaceholders})
     GROUP BY "notionPageId"`,
    params.userId,
    ...uniquePageIds
  );

  for (const row of rows) {
    dates.set(row.notionPageId, row.lastWorkedDate ?? "");
  }

  return dates;
}

export async function replaceEntryNotionCards(params: {
  dateKey: string;
  links: TimesheetEntryNotionCardDraft[];
  timesheetEntryId: string;
  userId: string;
}) {
  await ensureNotionSchema();

  await prisma.$executeRawUnsafe(
    `DELETE FROM "WorkEntryNotionCard" WHERE "userId" = ? AND "timesheetEntryId" = ?`,
    params.userId,
    params.timesheetEntryId
  );

  await insertEntryNotionCards(params);
}

export async function recordNotionSyncRun(params: {
  analysisConfigVersion: number;
  cardsFetched: number;
  errorCode?: string;
  errorMessage?: string;
  partial: boolean;
  scopeEndDate: string;
  scopeStartDate: string;
  scopeType: NotionSyncScopeType;
  status: NotionSyncRunStatus;
  userId: string;
}) {
  await ensureNotionSchema();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "NotionSyncRun" ("id", "userId", "scopeType", "scopeStartDate", "scopeEndDate", "status", "finishedAt", "cardsFetched", "errorCode", "errorMessage", "analysisConfigVersionUsed", "partial")
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
    randomUUID(),
    params.userId,
    params.scopeType,
    params.scopeStartDate,
    params.scopeEndDate,
    params.status,
    params.cardsFetched,
    params.errorCode ?? "",
    params.errorMessage ?? "",
    params.analysisConfigVersion,
    params.partial ? 1 : 0
  );

  await prisma.$executeRawUnsafe(
    `UPDATE "UserNotionConnection"
     SET "lastSyncedAt" = CASE WHEN ? = 'success' THEN CURRENT_TIMESTAMP ELSE "lastSyncedAt" END,
         "lastSyncError" = ?,
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE "userId" = ?`,
    params.status,
    params.status === "failed" ? params.errorMessage ?? "" : "",
    params.userId
  );
}

async function insertEntryNotionCards(params: {
  dateKey: string;
  links: TimesheetEntryNotionCardDraft[];
  timesheetEntryId: string;
  userId: string;
}) {
  for (const link of params.links) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WorkEntryNotionCard" ("id", "userId", "timesheetEntryId", "dateKey", "notionPageId", "allocatedHours", "allocationMode", "source", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      params.userId,
      params.timesheetEntryId,
      params.dateKey,
      link.notionPageId,
      link.allocatedHours,
      link.allocationMode,
      link.source
    );
  }
}

function mapConnection(row: ConnectionRow): UserNotionConnection {
  return {
    ajamLastUpdateProperty: parseJson<NotionPropertyDescriptor | null>(row.ajamLastUpdatePropertyJson, null),
    analysisConfigVersion: row.analysisConfigVersion,
    authType: row.authType === "oauth" ? "oauth" : "internal_token",
    availableHoursProperty: parseJson<NotionPropertyDescriptor | null>(row.availableHoursPropertyJson, null),
    categoryProperty: parseJson<NotionPropertyDescriptor | null>(row.categoryPropertyJson, null),
    databaseId: row.databaseId,
    dataSourceId: row.dataSourceId,
    dataSourceName: row.dataSourceName,
    dateMappingMode: row.dateMappingMode === "single_range_property" ? "single_range_property" : "separate_properties",
    doneStatusValues: parseJson<string[]>(row.doneStatusValuesJson, []),
    endDateProperty: parseJson<NotionPropertyDescriptor | null>(row.endDatePropertyJson, null),
    hasToken: Boolean(row.accessTokenEncrypted),
    lastSyncError: row.lastSyncError,
    lastSyncedAt: normalizeDateTimeString(row.lastSyncedAt),
    lastWorkedDateProperty: parseJson<NotionPropertyDescriptor | null>(row.lastWorkedDatePropertyJson, null),
    notionApiVersion: row.notionApiVersion || "2026-03-11",
    sourceInput: row.sourceInput,
    startDateProperty: parseJson<NotionPropertyDescriptor | null>(row.startDatePropertyJson, null),
    statusProperty: parseJson<NotionPropertyDescriptor | null>(row.statusPropertyJson, null),
    titleProperty: parseJson<NotionPropertyDescriptor | null>(row.titlePropertyJson, null),
    workDayCountProperty: parseJson<NotionPropertyDescriptor | null>(row.workDayCountPropertyJson, null),
    workHoursProperty: parseJson<NotionPropertyDescriptor | null>(row.workHoursPropertyJson, null)
  };
}

function normalizeDateTimeString(value: unknown): string {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
