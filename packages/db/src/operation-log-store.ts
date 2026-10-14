import { prisma } from "./client";
import type { LogFields, OperationLogEvent } from "./operation-log";

export type StoredLogLevel = "info" | "warn" | "error";
export type LogScope = "mine" | "site";
export type LogViewer = { role: "ADMIN" | "USER"; userId: string };
export type LogQuery = {
  beforeId?: number;
  component?: string;
  levels?: StoredLogLevel[];
  periodDays: 1 | 7 | 30;
  scope: LogScope;
  unreadOnly?: boolean;
};
export type VisibleOperationLog = {
  component: string;
  dateKey: string | null;
  durationMs: number;
  id: number;
  level: StoredLogLevel;
  metadata: Record<string, string | number | boolean>;
  operation: string;
  operationId: string;
  result: string;
  source: string | null;
  timestamp: string;
  unread: boolean;
  userId: string | null;
};
export type LogPage = { items: VisibleOperationLog[]; nextCursor: number | null; snapshotMaxId: number };
export type LogDetail = { item: VisibleOperationLog; related: LogPage };
export type UnreadLogSummary = { canViewSite: boolean; mine: number; mineMaxId: number; site: number; siteMaxId: number; total: number };
export type PersistableOperationLog = {
  component: string;
  dateKey: string | null;
  durationMs: number;
  eventId: string;
  level: StoredLogLevel;
  metadataJson: string;
  operation: string;
  operationId: string;
  result: string;
  source: string | null;
  timestamp: string;
  userId: string | null;
};

const PAGE_SIZE = 50;
const MAX_TOTAL = 50000;
const INFO_RETENTION_DAYS = 7;
const WARN_RETENTION_DAYS = 30;

const ALLOWED_METADATA_KEYS = new Set([
  "method", "status", "errorType", "errorCode", "reason", "skippedReason",
  "slow", "partial", "requestCount", "requestLimit", "retryAfter", "requestId",
  "pageId", "dataSourceId", "connectionId", "eventId", "eventType", "fieldKinds",
  "lastSuccessAt", "cardsFetched", "daysApplied", "usersChecked", "failedUsers",
  "skippedUsers", "failed", "skipped", "usersSkipped", "usersUpdated", "cardsSynced",
  "cardsUpdated", "daysChecked", "targetDays", "entriesRequested", "notionFailed",
  "pagesRequested", "updated", "action", "fieldCount", "route", "routeType",
  "environment", "buildVersion", "nodeVersion", "remembered", "year", "month",
  "daysAppliedCount", "appliedDateKeys", "lookbackDays", "usersCheckedCount",
  "responsePresent", "targetDaysCount", "daysAppliedLength", "cardsRequested",
  "dataSource", "statusCode", "count", "limit", "total", "remaining"
]);

const COMMON_ALLOWED: Array<{ component: string; operations: Set<string> | null }> = [
  { component: "server", operations: new Set(["startup"]) },
  { component: "http", operations: null },
  { component: "auth", operations: null },
  { component: "db", operations: null },
  { component: "holiday", operations: new Set(["api", "month", "list", "fallback"]) },
  { component: "ai", operations: new Set(["scheduled_cleanup"]) },
  { component: "notion", operations: new Set(["maintenance"]) }
];

function isCommonAllowed(component: string, operation: string): boolean {
  for (const entry of COMMON_ALLOWED) {
    if (entry.component !== component) continue;
    if (entry.operations === null) {
      if (component === "db") return operation === "client_init" || operation.startsWith("schema_");
      return true;
    }
    if (entry.operations.has(operation)) return true;
  }
  return false;
}

function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function truncateString(value: string): string {
  return value.length > 256 ? value.slice(0, 256) : value;
}

export function projectOperationLog(event: OperationLogEvent): PersistableOperationLog | null {
  if (event.level === "debug") return null;
  if (event.level !== "info" && event.level !== "warn" && event.level !== "error") return null;
  if (!event.eventId || typeof event.eventId !== "string" || event.eventId.length > 128) return null;
  if (!event.component || typeof event.component !== "string" || event.component.length > 64) return null;
  if (!event.operation || typeof event.operation !== "string" || event.operation.length > 128) return null;
  if (!event.result || typeof event.result !== "string" || event.result.length > 64) return null;
  if (!event.operationId || typeof event.operationId !== "string") return null;
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) return null;
  const userId = event.userId ?? null;
  if (event.userId !== undefined && event.userId !== null && !isValidUserId(event.userId)) return null;
  if (userId === null) {
    if (!isCommonAllowed(event.component, event.operation)) return null;
  }
  const metadata: Record<string, string | number | boolean> = {};
  const fields: LogFields = event.fields ?? {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (key === "userId" || key === "username" || key === "email") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      metadata[key] = value;
    } else if (typeof value === "string") {
      if (!value) continue;
      metadata[key] = truncateString(value);
    } else if (typeof value === "boolean") {
      metadata[key] = value;
    }
  }
  if (userId === null) {
    delete metadata.pageId;
    delete metadata.dataSourceId;
    delete metadata.connectionId;
  }
  let metadataJson: string;
  try {
    metadataJson = JSON.stringify(metadata);
  } catch {
    return null;
  }
  if (Buffer.byteLength(metadataJson, "utf8") > 4096) return null;
  const dateKey = typeof event.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey) ? event.dateKey : null;
  const source = typeof event.source === "string" && event.source ? truncateString(event.source) : null;
  return {
    component: event.component, operation: event.operation, result: event.result,
    timestamp: new Date(event.timestamp).toISOString(), level: event.level,
    operationId: event.operationId, userId, source, dateKey,
    durationMs: Number.isFinite(event.durationMs) && event.durationMs >= 0 ? Math.floor(event.durationMs) : 0,
    eventId: event.eventId, metadataJson
  };
}

let operationLogSchemaReady = false;

export async function ensureOperationLogSchema(): Promise<void> {
  if (operationLogSchemaReady) return;
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OperationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT,
    "dateKey" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT NOT NULL DEFAULT '{}'
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OperationLog_eventId_key" ON "OperationLog"("eventId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OperationLog_userId_id_idx" ON "OperationLog"("userId", "id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OperationLog_level_id_idx" ON "OperationLog"("level", "id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OperationLog_operationId_id_idx" ON "OperationLog"("operationId", "id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OperationLog_level_timestamp_idx" ON "OperationLog"("level", "timestamp")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OperationLogRead" (
    "viewerUserId" TEXT NOT NULL,
    "logId" INTEGER NOT NULL,
    "readAt" TEXT NOT NULL,
    CONSTRAINT "OperationLogRead_pkey" PRIMARY KEY ("viewerUserId", "logId"),
    CONSTRAINT "OperationLogRead_logId_fkey" FOREIGN KEY ("logId") REFERENCES "OperationLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OperationLogRead_logId_idx" ON "OperationLogRead"("logId")`);
    operationLogSchemaReady = true;
  } catch (error) {
    operationLogSchemaReady = false;
    throw error;
  }
}

function retentionCutoffs(now: Date): { infoCutoff: string; warnCutoff: string } {
  return {
    infoCutoff: new Date(now.getTime() - INFO_RETENTION_DAYS * 86400000).toISOString(),
    warnCutoff: new Date(now.getTime() - WARN_RETENTION_DAYS * 86400000).toISOString()
  };
}

function retentionCondition(): string {
  // Strictly newer than the cutoff stays visible. Prune deletes timestamp <=
  // cutoff, so both sides agree that cutoff-or-older rows are gone.
  return `(("level" = 'info' AND "timestamp" > ?) OR ("level" IN ('warn','error') AND "timestamp" > ?))`;
}

function visibilityCondition(scope: LogScope, viewer: LogViewer): { params: unknown[]; sql: string } {
  if (scope === "mine") return { sql: `"userId" = ?`, params: [viewer.userId] };
  return { sql: `"userId" IS NULL AND "level" IN ('warn','error')`, params: [] };
}

type LogRow = {
  component: string; dateKey: string | null; durationMs: number; id: number; level: string;
  metadataJson: string; operation: string; operationId: string; result: string;
  source: string | null; timestamp: string; userId: string | null; readAt: string | null;
};

function mapRow(row: LogRow): VisibleOperationLog {
  let metadata: Record<string, string | number | boolean> = {};
  try {
    const parsed = JSON.parse(row.metadataJson) as unknown;
    if (parsed && typeof parsed === "object") metadata = parsed as Record<string, string | number | boolean>;
  } catch {
    metadata = {};
  }
  const unread = (row.level === "warn" || row.level === "error") && row.readAt === null;
  return {
    id: row.id, timestamp: row.timestamp, level: row.level as StoredLogLevel,
    component: row.component, operation: row.operation, result: row.result,
    operationId: row.operationId, durationMs: row.durationMs,
    userId: row.userId, source: row.source, dateKey: row.dateKey,
    metadata, unread
  };
}

async function cleanOrphanReceipts(): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM "OperationLogRead" WHERE "logId" NOT IN (SELECT "id" FROM "OperationLog")`);
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "OperationLogRead" WHERE "viewerUserId" NOT IN (SELECT "id" FROM "User")`);
  } catch {
    // User table may not exist in isolated fixtures.
  }
}

const CAP_DELETE_CHUNK = 1000;

async function enforceTotalCap(): Promise<void> {
  const countRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(`SELECT COUNT(*) AS "count" FROM "OperationLog"`);
  let overflow = Number(countRows[0]?.count ?? 0) - MAX_TOTAL;
  while (overflow > 0) {
    const chunk = Math.min(overflow, CAP_DELETE_CHUNK);
    // Oldest info rows first so recent failures survive the cap.
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "OperationLog" WHERE "id" IN (SELECT "id" FROM "OperationLog" WHERE "level" = 'info' ORDER BY "id" ASC LIMIT ?)`,
      chunk
    );
    overflow -= Number(deleted ?? chunk);
    if (Number(deleted ?? 0) < chunk) {
      const deletedOld = await prisma.$executeRawUnsafe(
        `DELETE FROM "OperationLog" WHERE "id" IN (SELECT "id" FROM "OperationLog" ORDER BY "id" ASC LIMIT ?)`,
        overflow > 0 ? Math.min(overflow, CAP_DELETE_CHUNK) : 0
      );
      overflow -= Number(deletedOld ?? 0);
      if (Number(deletedOld ?? 0) === 0) break;
    }
  }
  if (overflow > 0) {
    await cleanOrphanReceipts();
  }
}

export async function appendOperationLogs(events: OperationLogEvent[]): Promise<void> {
  const rows = events.map(projectOperationLog).filter((row): row is PersistableOperationLog => row !== null);
  if (rows.length === 0) return;
  await ensureOperationLogSchema();
  const batches: PersistableOperationLog[][] = [];
  for (let i = 0; i < rows.length; i += 100) batches.push(rows.slice(i, i + 100));
  for (const batch of batches) {
    const placeholders = batch.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(", ");
    const params: unknown[] = batch.flatMap((row) => [
      row.eventId, row.timestamp, row.level, row.component, row.operation, row.result,
      row.operationId, row.userId, row.source, row.dateKey, row.durationMs, row.metadataJson
    ]);
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "OperationLog" ("eventId","timestamp","level","component","operation","result","operationId","userId","source","dateKey","durationMs","metadataJson") VALUES ${placeholders}`,
      ...params
    );
  }
  await enforceTotalCap();
}

export async function listVisibleOperationLogs(viewer: LogViewer, query: LogQuery, now = new Date()): Promise<LogPage> {
  await ensureOperationLogSchema();
  if (query.scope === "site" && viewer.role !== "ADMIN") throw new Error("forbidden");
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  const periodCutoff = new Date(now.getTime() - query.periodDays * 86400000).toISOString();
  const vis = visibilityCondition(query.scope, viewer);
  // Fix the snapshot first so rows inserted between the two SELECTs stay
  // outside this page and mark-all can never swallow unseen logs.
  const snapshotRows = await prisma.$queryRawUnsafe<Array<{ maxId: number | bigint | null }>>(
    `SELECT MAX("id") AS "maxId" FROM "OperationLog" WHERE ${retentionCondition()} AND (${vis.sql})`,
    infoCutoff, warnCutoff, ...vis.params
  );
  const snapshotMaxId = Number(snapshotRows[0]?.maxId ?? 0);
  const where: string[] = [`${retentionCondition()}`, `(${vis.sql})`, `"timestamp" >= ?`, `"OperationLog"."id" <= ?`];
  const params: unknown[] = [infoCutoff, warnCutoff, ...vis.params, periodCutoff, snapshotMaxId];
  if (query.levels && query.levels.length > 0) {
    where.push(`"level" IN (${query.levels.map(() => "?").join(",")})`);
    params.push(...query.levels);
  }
  if (query.component) {
    where.push(`"component" = ?`);
    params.push(query.component);
  }
  if (query.unreadOnly) {
    where.push(`"level" IN ('warn','error')`);
  }
  if (typeof query.beforeId === "number" && Number.isSafeInteger(query.beforeId) && query.beforeId > 0) {
    where.push(`"OperationLog"."id" < ?`);
    params.push(query.beforeId);
  }
  const unreadJoin = `LEFT JOIN "OperationLogRead" ON "OperationLogRead"."logId" = "OperationLog"."id" AND "OperationLogRead"."viewerUserId" = ?`;
  const unreadParams: unknown[] = [viewer.userId];
  let unreadFilter = "";
  if (query.unreadOnly) {
    unreadFilter = `AND "OperationLogRead"."readAt" IS NULL`;
  }
  const items = await prisma.$queryRawUnsafe<LogRow[]>(
    `SELECT "OperationLog"."id","timestamp","level","component","operation","result","operationId","userId","source","dateKey","durationMs","metadataJson","OperationLogRead"."readAt" AS "readAt"
     FROM "OperationLog" ${unreadJoin} WHERE ${where.join(" AND ")} ${unreadFilter}
     ORDER BY "OperationLog"."id" DESC LIMIT ${PAGE_SIZE + 1}`,
    ...unreadParams, ...params
  );
  const hasMore = items.length > PAGE_SIZE;
  const pageItems = (hasMore ? items.slice(0, PAGE_SIZE) : items).map(mapRow);
  return { items: pageItems, nextCursor: hasMore ? pageItems[pageItems.length - 1]!.id : null, snapshotMaxId };
}

export async function getVisibleOperationLogDetail(viewer: LogViewer, id: number, beforeRelatedId?: number, now = new Date()): Promise<LogDetail | null> {
  await ensureOperationLogSchema();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  const rows = await prisma.$queryRawUnsafe<LogRow[]>(
    `SELECT "OperationLog"."id","timestamp","level","component","operation","result","operationId","userId","source","dateKey","durationMs","metadataJson","OperationLogRead"."readAt" AS "readAt"
     FROM "OperationLog" LEFT JOIN "OperationLogRead" ON "OperationLogRead"."logId" = "OperationLog"."id" AND "OperationLogRead"."viewerUserId" = ?
     WHERE "OperationLog"."id" = ? AND ${retentionCondition()}`,
    viewer.userId, id, infoCutoff, warnCutoff
  );
  const row = rows[0];
  if (!row) return null;
  const isMine = row.userId === viewer.userId;
  const isSiteCommon = row.userId === null && (row.level === "warn" || row.level === "error") && viewer.role === "ADMIN";
  if (!isMine && !isSiteCommon) return null;
  const item = mapRow(row);
  // Related logs share the detail's operationId but must pass the same
  // visibility gate: the owner's own rows, or warn/error common rows for ADMIN.
  // Common info rows stay console-only and never appear as related.
  const relatedUserSql = isMine ? `"userId" = ?` : `"userId" IS NULL AND "level" IN ('warn','error')`;
  const relatedUserParams: unknown[] = isMine ? [viewer.userId] : [];
  const relatedClauses = [`"operationId" = ?`, `"OperationLog"."id" <> ?`, `(${relatedUserSql})`, retentionCondition()];
  const relatedParams: unknown[] = [row.operationId, row.id, ...relatedUserParams, infoCutoff, warnCutoff];
  if (typeof beforeRelatedId === "number" && Number.isSafeInteger(beforeRelatedId) && beforeRelatedId > 0) {
    relatedClauses.push(`"OperationLog"."id" < ?`);
    relatedParams.push(beforeRelatedId);
  }
  const relatedRows = await prisma.$queryRawUnsafe<LogRow[]>(
    `SELECT "OperationLog"."id","timestamp","level","component","operation","result","operationId","userId","source","dateKey","durationMs","metadataJson","OperationLogRead"."readAt" AS "readAt"
     FROM "OperationLog" LEFT JOIN "OperationLogRead" ON "OperationLogRead"."logId" = "OperationLog"."id" AND "OperationLogRead"."viewerUserId" = ?
     WHERE ${relatedClauses.join(" AND ")}
     ORDER BY "OperationLog"."id" DESC LIMIT ${PAGE_SIZE + 1}`,
    viewer.userId, ...relatedParams
  );
  const hasMore = relatedRows.length > PAGE_SIZE;
  const relatedItems = (hasMore ? relatedRows.slice(0, PAGE_SIZE) : relatedRows).map(mapRow);
  const snapshotRows = await prisma.$queryRawUnsafe<Array<{ maxId: number | bigint | null }>>(
    `SELECT MAX("id") AS "maxId" FROM "OperationLog" WHERE "operationId" = ? AND (${relatedUserSql})`,
    row.operationId, ...relatedUserParams
  );
  return {
    item,
    related: {
      items: relatedItems,
      nextCursor: hasMore ? relatedItems[relatedItems.length - 1]!.id : null,
      snapshotMaxId: Number(snapshotRows[0]?.maxId ?? 0)
    }
  };
}

export async function getUnreadLogSummary(viewer: LogViewer, now = new Date()): Promise<UnreadLogSummary> {
  await ensureOperationLogSchema();
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  const mineRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
    `SELECT COUNT(*) AS "count" FROM "OperationLog" LEFT JOIN "OperationLogRead" ON "OperationLogRead"."logId" = "OperationLog"."id" AND "OperationLogRead"."viewerUserId" = ?
     WHERE "userId" = ? AND "level" IN ('warn','error') AND "OperationLogRead"."readAt" IS NULL AND ${retentionCondition()}`,
    viewer.userId, viewer.userId, infoCutoff, warnCutoff
  );
  const mine = Number(mineRows[0]?.count ?? 0);
  // Scope maxima cover every level (including info) so the popup can notice
  // new logs that never enter the unread warn/error counts.
  const mineMaxRows = await prisma.$queryRawUnsafe<Array<{ maxId: number | bigint | null }>>(
    `SELECT MAX("id") AS "maxId" FROM "OperationLog" WHERE "userId" = ? AND ${retentionCondition()}`,
    viewer.userId, infoCutoff, warnCutoff
  );
  const mineMaxId = Number(mineMaxRows[0]?.maxId ?? 0);
  let site = 0;
  let siteMaxId = 0;
  if (viewer.role === "ADMIN") {
    const siteRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      `SELECT COUNT(*) AS "count" FROM "OperationLog" LEFT JOIN "OperationLogRead" ON "OperationLogRead"."logId" = "OperationLog"."id" AND "OperationLogRead"."viewerUserId" = ?
       WHERE "userId" IS NULL AND "level" IN ('warn','error') AND "OperationLogRead"."readAt" IS NULL AND ${retentionCondition()}`,
      viewer.userId, infoCutoff, warnCutoff
    );
    site = Number(siteRows[0]?.count ?? 0);
    const siteMaxRows = await prisma.$queryRawUnsafe<Array<{ maxId: number | bigint | null }>>(
      `SELECT MAX("id") AS "maxId" FROM "OperationLog" WHERE "userId" IS NULL AND "level" IN ('warn','error') AND ${retentionCondition()}`,
      infoCutoff, warnCutoff
    );
    siteMaxId = Number(siteMaxRows[0]?.maxId ?? 0);
  }
  return { mine, mineMaxId, site, siteMaxId, total: mine + site, canViewSite: viewer.role === "ADMIN" };
}

export async function markOperationLogRead(viewer: LogViewer, id: number, now = new Date()): Promise<boolean> {
  await ensureOperationLogSchema();
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; level: string; userId: string | null }>>(
    `SELECT "id","level","userId" FROM "OperationLog" WHERE "id" = ? AND ${retentionCondition()} LIMIT 1`,
    id, infoCutoff, warnCutoff
  );
  const target = rows[0];
  if (!target) return false;
  const isMine = target.userId === viewer.userId;
  const isSiteCommon = target.userId === null && (target.level === "warn" || target.level === "error") && viewer.role === "ADMIN";
  if (!isMine && !isSiteCommon) return false;
  if (target.level === "info") return true;
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "OperationLogRead" ("viewerUserId","logId","readAt") VALUES (?, ?, ?)`,
    viewer.userId, id, now.toISOString()
  );
  return true;
}

export async function markAllOperationLogsRead(viewer: LogViewer, scope: LogScope, snapshotMaxId: number, now = new Date()): Promise<void> {
  await ensureOperationLogSchema();
  if (!Number.isSafeInteger(snapshotMaxId) || snapshotMaxId < 0) return;
  if (snapshotMaxId === 0) return;
  if (scope === "site" && viewer.role !== "ADMIN") return;
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  const vis = visibilityCondition(scope, viewer);
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "OperationLogRead" ("viewerUserId","logId","readAt")
     SELECT ?, "id", ? FROM "OperationLog" WHERE "id" <= ? AND "level" IN ('warn','error') AND (${vis.sql}) AND ${retentionCondition()}`,
    viewer.userId, now.toISOString(), snapshotMaxId, ...vis.params, infoCutoff, warnCutoff
  );
}

export async function pruneOperationLogs(now: Date): Promise<void> {
  await ensureOperationLogSchema();
  const { infoCutoff, warnCutoff } = retentionCutoffs(now);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "OperationLog" WHERE ("level" = 'info' AND "timestamp" <= ?) OR ("level" IN ('warn','error') AND "timestamp" <= ?)`,
    infoCutoff, warnCutoff
  );
  await cleanOrphanReceipts();
  await enforceTotalCap();
  await cleanOrphanReceipts();
}
