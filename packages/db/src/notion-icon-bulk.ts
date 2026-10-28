import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { NotionApiError, requestNotionApi } from "./notion-api";
import { createNotionLog, notionErrorMessage, type NotionLogContext } from "./notion-log";
import { updateNotionPageProperties, type NotionPagePatchResult } from "./notion-page-update";
import { pickRawNotionProperty } from "./notion-property";
import {
  assertMatchingScope,
  determineTargetIcon,
  getNotionStatusIconSettings,
  withPageLock,
  type NotionPageLike,
  type NotionStatusIconSettings
} from "./notion-status-icons";
import {
  ensureNotionSchema,
  getUserNotionAccessToken,
  getUserNotionConnection,
  type UserNotionConnection
} from "./notion-store";

export type NotionIconBulkJobStatusType =
  | "completed"
  | "failed"
  | "interrupted"
  | "partial"
  | "running";

export type NotionIconBulkJobStatus = {
  createdAt: string;
  dataSourceId: string;
  discoveredCount: number;
  errorCode: string;
  errorMessage: string;
  failedCount: number;
  finishedAt: string | null;
  id: string;
  processedCount: number;
  requestCount: number;
  skippedCount: number;
  startedAt: string;
  status: NotionIconBulkJobStatusType;
  statusPropertyId: string;
  totalCount: number | null;
  totalKnown: boolean;
  updatedAt: string;
  updatedCount: number;
  userId: string;
  serverInstanceId: string;
  settingsFingerprint: string;
};

type NotionIconBulkJobRow = {
  createdAt: unknown;
  dataSourceId: string;
  discoveredCount: number;
  errorCode: string;
  errorMessage: string;
  failedCount: number;
  finishedAt: unknown;
  id: string;
  processedCount: number;
  requestCount: number;
  serverInstanceId: string;
  settingsFingerprint: string;
  skippedCount: number;
  startedAt: unknown;
  status: string;
  statusPropertyId: string;
  totalCount: number | null;
  totalKnown: number;
  updatedAt: unknown;
  updatedCount: number;
  userId: string;
};

// Global process registry for HMR and duplicate module safety
const globalRegistry = globalThis as unknown as {
  __ajamNotionProcessId?: string;
};
export const SERVER_PROCESS_ID = (globalRegistry.__ajamNotionProcessId ??= randomUUID());

const notionIconBulkJobSelectSql = `SELECT "id", "userId", "dataSourceId", "statusPropertyId", "settingsFingerprint", "status",
            "discoveredCount", "processedCount", "updatedCount", "skippedCount", "failedCount",
            "requestCount", "totalKnown", "totalCount", "serverInstanceId", "errorMessage", "errorCode",
            strftime('%Y-%m-%dT%H:%M:%fZ', "startedAt") AS "startedAt",
            strftime('%Y-%m-%dT%H:%M:%fZ', "finishedAt") AS "finishedAt",
            strftime('%Y-%m-%dT%H:%M:%fZ', "createdAt") AS "createdAt",
            strftime('%Y-%m-%dT%H:%M:%fZ', "updatedAt") AS "updatedAt"
     FROM "NotionIconBulkJob"`;

let customSleepFn: ((ms: number) => Promise<void>) | null = null;
export function setBulkSleepFnForTest(fn: ((ms: number) => Promise<void>) | null): void {
  customSleepFn = fn;
}

export function computeRetryDelaySeconds(error: unknown, attempt: number): number {
  if (error instanceof NotionApiError && error.retryAfter && Number.isFinite(error.retryAfter) && error.retryAfter > 0) {
    return Math.ceil(error.retryAfter);
  }
  return Math.min(Math.pow(2, Math.max(0, attempt - 1)), 10);
}

export function isRetryableThrottledError(error: unknown): boolean {
  if (!(error instanceof NotionApiError)) {
    return false;
  }
  if (error.status === 429) {
    return error.code !== "public_api_request_blocked";
  }
  return error.status === 529;
}

async function doSleep(ms: number, injectedSleep?: (ms: number) => Promise<void>): Promise<void> {
  const runner = injectedSleep ?? customSleepFn ?? sleep;
  await runner(ms);
}

let bulkSchemaReady = false;

export async function ensureNotionIconBulkSchema(): Promise<void> {
  await ensureNotionSchema();
  if (bulkSchemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NotionIconBulkJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "statusPropertyId" TEXT NOT NULL,
    "settingsFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "totalKnown" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER,
    "serverInstanceId" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "errorCode" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotionIconBulkJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NotionIconBulkJob_userId_createdAt_idx" ON "NotionIconBulkJob"("userId", "createdAt" DESC)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NotionIconBulkJob_userId_status_idx" ON "NotionIconBulkJob"("userId", "status")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "NotionIconBulkJob_active_user" ON "NotionIconBulkJob"("userId") WHERE "status" = 'running'`
  );

  bulkSchemaReady = true;
}

function mapJobRow(row: NotionIconBulkJobRow): NotionIconBulkJobStatus {
  return {
    createdAt: normalizeIsoString(row.createdAt),
    dataSourceId: row.dataSourceId,
    discoveredCount: row.discoveredCount,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    failedCount: row.failedCount,
    finishedAt: row.finishedAt ? normalizeIsoString(row.finishedAt) : null,
    id: row.id,
    processedCount: row.processedCount,
    requestCount: row.requestCount,
    skippedCount: row.skippedCount,
    startedAt: normalizeIsoString(row.startedAt),
    status: row.status as NotionIconBulkJobStatusType,
    statusPropertyId: row.statusPropertyId,
    totalCount: row.totalCount,
    totalKnown: Boolean(row.totalKnown),
    updatedAt: normalizeIsoString(row.updatedAt),
    updatedCount: row.updatedCount,
    userId: row.userId,
    serverInstanceId: row.serverInstanceId,
    settingsFingerprint: row.settingsFingerprint
  };
}

function normalizeIsoString(value: unknown): string {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function computeSettingsFingerprint(
  connection: Pick<UserNotionConnection, "dataSourceId" | "statusProperty">,
  settings: NotionStatusIconSettings
): string {
  const mappingEntries = Object.entries(settings.emojiByOptionId).sort(([a], [b]) => a.localeCompare(b));
  const mappingStr = JSON.stringify(mappingEntries);
  return `${connection.dataSourceId}:${connection.statusProperty?.id ?? ""}:${settings.statusPropertyId}:${settings.enabled ? "1" : "0"}:${mappingStr}`;
}

export async function getLatestNotionIconBulkJob(userId: string): Promise<NotionIconBulkJobStatus | null> {
  await ensureNotionIconBulkSchema();
  
  const rows = await prisma.$queryRawUnsafe<NotionIconBulkJobRow[]>(
    `${notionIconBulkJobSelectSql}
     WHERE "userId" = ?
     ORDER BY "createdAt" DESC, rowid DESC
     LIMIT 1`,
    userId
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  // Interruption detection: if running job belongs to a different server instance, mark interrupted
  if (row.status === "running") {
    if (row.serverInstanceId !== SERVER_PROCESS_ID) {
      await prisma.$executeRawUnsafe(
        `UPDATE "NotionIconBulkJob"
         SET "status" = 'interrupted',
             "errorMessage" = '서버 재시작으로 작업이 중단되었습니다.',
             "finishedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ? AND "status" = 'running'`,
        row.id
      );

      createNotionLog("icon_bulk_sync", {
        operationId: row.id,
        source: "notion_icon_bulk",
        userId
      }).write("warn", "interrupted", {
        count: row.processedCount,
        dataSourceId: row.dataSourceId,
        failed: row.failedCount,
        reason: "server_interrupted",
        requestCount: row.requestCount,
        skipped: row.skippedCount,
        updated: row.updatedCount
      });

      return {
        ...mapJobRow(row),
        errorMessage: "서버 재시작으로 작업이 중단되었습니다.",
        finishedAt: new Date().toISOString(),
        status: "interrupted"
      };
    }
  }

  return mapJobRow(row);
}

export async function startNotionIconBulk(userId: string): Promise<{
  job: NotionIconBulkJobStatus;
  startedNew: boolean;
}> {
  await ensureNotionIconBulkSchema();

  const [connection, settings] = await Promise.all([
    getUserNotionConnection(userId),
    getNotionStatusIconSettings(userId)
  ]);

  if (!connection || !connection.hasToken || !settings || !settings.enabled) {
    throw new Error("Notion 상태별 아이콘 설정이 활성화되어 있지 않거나 연결 정보가 없습니다.");
  }

  assertMatchingScope(settings, connection);

  // Check if there is already an active running job in the DB
  const existingRows = await prisma.$queryRawUnsafe<NotionIconBulkJobRow[]>(
    `${notionIconBulkJobSelectSql}
     WHERE "userId" = ? AND "status" = 'running'
     LIMIT 1`,
    userId
  );

  if (existingRows[0]) {
    const active = existingRows[0];
    if (active.serverInstanceId === SERVER_PROCESS_ID) {
      return { job: mapJobRow(active), startedNew: false };
    }
    // Abandoned job from previous server instance: mark interrupted
    await prisma.$executeRawUnsafe(
      `UPDATE "NotionIconBulkJob"
       SET "status" = 'interrupted',
           "errorMessage" = '이전 프로세스에서 중단된 작업입니다.',
           "finishedAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "status" = 'running'`,
      active.id
    );
  }

  const jobId = randomUUID();
  const fingerprint = computeSettingsFingerprint(connection, settings);

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "NotionIconBulkJob" (
        "id", "userId", "dataSourceId", "statusPropertyId", "settingsFingerprint",
        "status", "serverInstanceId", "startedAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      jobId,
      userId,
      settings.dataSourceId,
      settings.statusPropertyId,
      fingerprint,
      SERVER_PROCESS_ID
    );
  } catch (_err) {
    // Catch unique constraint race: return the currently running job
    const active = await getLatestNotionIconBulkJob(userId);
    if (active && active.status === "running") {
      return { job: active, startedNew: false };
    }
    throw _err;
  }

  const exactCreated = await prisma.$queryRawUnsafe<NotionIconBulkJobRow[]>(
    `${notionIconBulkJobSelectSql}
     WHERE "id" = ? AND "userId" = ?
     LIMIT 1`,
    jobId,
    userId
  );

  if (!exactCreated[0]) {
    throw new Error("작업 상태 생성에 실패했습니다.");
  }

  return { job: mapJobRow(exactCreated[0]), startedNew: true };
}

export async function runNotionIconBulkJob(params: {
  context?: NotionLogContext;
  jobId: string;
  pacingMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  userId: string;
}): Promise<void> {
  await ensureNotionIconBulkSchema();

  // 1. Load and validate the specific authenticated user's running job row & ownership
  const jobRows = await prisma.$queryRawUnsafe<NotionIconBulkJobRow[]>(
    `${notionIconBulkJobSelectSql}
     WHERE "id" = ? AND "userId" = ?
     LIMIT 1`,
    params.jobId,
    params.userId
  );

  const existingJob = jobRows[0] ? mapJobRow(jobRows[0]) : null;
  
  if (!existingJob || existingJob.status !== "running") {
    // Invalid or already terminal job: must never perform writes
    return;
  }
  
  if (existingJob.serverInstanceId !== SERVER_PROCESS_ID) {
    // Owned by a different server instance
    return;
  }

  const log = createNotionLog("icon_bulk_sync", {
    ...params.context,
    operationId: params.jobId,
    source: "notion_icon_bulk",
    userId: params.userId
  });

  let processedCount = 0;
  let discoveredCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let requestCount = 0;
  let totalKnown = false;
  let totalCount: number | null = null;
  let isPartial = false;
  let errorCode = "";
  let errorMessage = "";
  let finalStatus: NotionIconBulkJobStatusType = "completed";

  const pacingMs = params.pacingMs ?? 350;
  let lastProgressLoggedAt = Date.now();
  let lastDbUpdatedAt = Date.now();

  const syncDbProgress = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastDbUpdatedAt < 3000) {
      return;
    }
    lastDbUpdatedAt = now;
    await prisma.$executeRawUnsafe(
      `UPDATE "NotionIconBulkJob"
       SET "discoveredCount" = ?,
           "processedCount" = ?,
           "updatedCount" = ?,
           "skippedCount" = ?,
           "failedCount" = ?,
           "requestCount" = ?,
           "totalKnown" = ?,
           "totalCount" = ?,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "userId" = ?`,
      discoveredCount,
      processedCount,
      updatedCount,
      skippedCount,
      failedCount,
      requestCount,
      totalKnown ? 1 : 0,
      totalCount,
      params.jobId,
      params.userId
    );
  };

  const maybeLogProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressLoggedAt < 5000) {
      return;
    }
    lastProgressLoggedAt = now;
    log.write("info", "progress", {
      count: processedCount,
      dataSourceId: existingJob.dataSourceId,
      failed: failedCount,
      requestCount,
      skipped: skippedCount,
      total: totalKnown && totalCount !== null ? totalCount : undefined,
      updated: updatedCount
    });
  };

  const expectedFingerprint = existingJob.settingsFingerprint;

  // Reusable live config verification helper
  const verifyLiveConfig = async (): Promise<{
    conn: UserNotionConnection;
    settings: NotionStatusIconSettings;
    token: string;
  } | null> => {
    const [conn, liveToken, sett] = await Promise.all([
      getUserNotionConnection(params.userId),
      getUserNotionAccessToken(params.userId),
      getNotionStatusIconSettings(params.userId)
    ]);
    if (!conn || !conn.hasToken || !liveToken || !sett || !sett.enabled) {
      
      return null;
    }
    if (
      sett.dataSourceId !== existingJob.dataSourceId ||
      sett.statusPropertyId !== existingJob.statusPropertyId ||
      computeSettingsFingerprint(conn, sett) !== expectedFingerprint
    ) {
      return null;
    }
    return { conn, settings: sett, token: liveToken };
  };

  try {
    // 2. Validate recorded start fingerprint against current settings BEFORE any Notion request
    const initialLive = await verifyLiveConfig();
    
    if (!initialLive) {
      finalStatus = "interrupted";
      errorCode = "SETTINGS_CHANGED";
      errorMessage = "작업 시작 후 아이콘 설정 또는 데이터 소스가 변경되어 중단되었습니다.";
      log.write("warn", "interrupted", {
        count: 0,
        dataSourceId: existingJob.dataSourceId,
        errorCode,
        failed: 0,
        reason: "startup_config_mismatch",
        requestCount: 0,
        skipped: 0,
        updated: 0
      });
      return;
    }

    log.write("info", "started", {
      count: 0,
      dataSourceId: existingJob.dataSourceId
    });

    let cursor: string | null = null;
    const maxQueryPages = 100;
    let queryRequests = 0;
    let hasSettingsChanged = false;
    let isFatalAuthError = false;

    while (queryRequests < maxQueryPages && !hasSettingsChanged && !isFatalAuthError) {
      // 1. Verify settings fingerprint has not changed at batch boundary
      const boundaryLive = await verifyLiveConfig();
      if (!boundaryLive) {
        hasSettingsChanged = true;
        break;
      }

      // 2. Query next batch of pages with shared 429/529 retry & auth stop
      type NotionQueryBatch = {
        has_more?: boolean;
        next_cursor?: string | null;
        request_status?: { type?: string };
        results?: NotionPageLike[];
      };
      let queryResponse: NotionQueryBatch | null = null;

      let queryAttempt = 0;
      const maxRetries = 3;

      while (queryAttempt <= maxRetries) {
        const live = await verifyLiveConfig();
        if (!live) {
          hasSettingsChanged = true;
          break;
        }

        try {
          const queryRes = await requestNotionApi({
            body: {
              page_size: 100,
              sorts: [{ direction: "ascending", timestamp: "created_time" }],
              start_cursor: cursor || undefined
            },
            context: log.context,
            errorMessage: (status) => `Notion 데이터 소스 조회 실패 (${status})`,
            logSeverity: "none",
            method: "POST",
            onAttempt: () => {
              requestCount += 1;
            },
            path: `/v1/data_sources/${encodeURIComponent(existingJob.dataSourceId)}/query`,
            token: live.token
          });
          queryRequests += 1;
          queryResponse = (await queryRes.json()) as NotionQueryBatch;
          break;
        } catch (error) {
          if (error instanceof NotionApiError) {
            // Fatal auth in query: job must never be completed!
            if (error.status === 401 || error.status === 403) {
              isFatalAuthError = true;
              finalStatus = "failed";
              errorCode = String(error.status);
              errorMessage = "Notion 인증 또는 권한 오류로 중단되었습니다.";
              log.write("error", "failed", {
                errorCode,
                error: notionErrorMessage(error),
                requestCount
              });
              break;
            }

            // Rate limit or server overload
            const isThrottled = isRetryableThrottledError(error);
            if (isThrottled) {
              queryAttempt += 1;
              if (queryAttempt > maxRetries) {
                finalStatus = "failed";
                errorCode = String(error.status);
                errorMessage = `Notion 데이터 소스 조회 재시도 초과 (${error.status})`;
                log.write("error", "failed", {
                  errorCode,
                  error: notionErrorMessage(error),
                  requestCount
                });
                break;
              }

              const delaySeconds = computeRetryDelaySeconds(error, queryAttempt);

              log.write("warn", "retrying", {
                errorCode: String(error.status),
                retryAfter: delaySeconds,
                status: error.status
              });

              await doSleep(delaySeconds * 1000, params.sleepFn);
              const postSleep = await verifyLiveConfig();
              if (!postSleep) {
                hasSettingsChanged = true;
                break;
              }
              continue;
            }
          }

          // Permanent failure or exhaustion
          finalStatus = "failed";
          errorCode = error instanceof NotionApiError ? String(error.status) : "QUERY_FAILED";
          errorMessage = "Notion 데이터 소스 조회에 실패했습니다.";
          log.write("error", "failed", {
            errorCode,
            error: notionErrorMessage(error),
            requestCount
          });
          break;
        }
      }

      if (hasSettingsChanged || isFatalAuthError || !queryResponse) {
        break;
      }

      const activeBatch: NotionQueryBatch = queryResponse;
      const rawResults = activeBatch.results ?? [];
      discoveredCount += rawResults.length;
      await syncDbProgress();

      // Guard incomplete response
      if (activeBatch.request_status?.type === "incomplete") {
        isPartial = true;
        errorCode = "INCOMPLETE_QUERY";
        errorMessage = "Notion 쿼리가 불완전하게 완료되어 전체 페이지가 조회되지 않았습니다.";
      }

      // 3. Process each page in the batch
      for (const page of rawResults) {
        if (hasSettingsChanged || isFatalAuthError) {
          break;
        }

        // Exclude trash and archived pages
        if (page.archived || (page as Record<string, unknown>).in_trash || (page as Record<string, unknown>).is_archived) {
          skippedCount += 1;
          processedCount += 1;
          continue;
        }

        // Process with same-page lock
        await withPageLock(page.id, async () => {
          // Re-verify connection and settings inside lock before write
          const latest = await verifyLiveConfig();
          if (!latest) {
            hasSettingsChanged = true;
            return;
          }

          let candidatePage = page;
          let skipWrite = false;

          // Check if local cache has newer observation
          const cached = await prisma.$queryRawUnsafe<
            Array<{ lastEditedTime: string; rawPropertiesJson: string }>
          >(
            `SELECT "lastEditedTime", "rawPropertiesJson" FROM "NotionCardCache" WHERE "userId" = ? AND "notionPageId" = ? LIMIT 1`,
            params.userId,
            page.id
          );

          const cachedRow = cached[0];
          const pageTime = page.last_edited_time ?? "";
          const cacheTime = cachedRow?.lastEditedTime ?? "";

          // Shared exception GET helper with 429/529 retry & auth propagation
          const fetchPageRefresh = async (): Promise<NotionPageLike | null> => {
            let getAttempt = 0;
            while (getAttempt <= maxRetries) {
              const live = await verifyLiveConfig();
              if (!live) {
                hasSettingsChanged = true;
                return null;
              }
              try {
                const freshRes = await requestNotionApi({
                  context: log.context,
                  errorMessage: (status) => `페이지 조회 실패 (${status})`,
                  logSeverity: "none",
                  method: "GET",
                  onAttempt: () => {
                    requestCount += 1;
                  },
                  path: `/v1/pages/${encodeURIComponent(page.id)}`,
                  token: live.token
                });
                return (await freshRes.json()) as NotionPageLike;
              } catch (err) {
                if (err instanceof NotionApiError) {
                  if (err.status === 401 || err.status === 403) {
                    isFatalAuthError = true;
                    finalStatus = "failed";
                    errorCode = String(err.status);
                    errorMessage = "Notion 인증 또는 권한 오류로 중단되었습니다.";
                    log.write("error", "failed", {
                      errorCode,
                      error: notionErrorMessage(err),
                      pageId: page.id,
                      requestCount
                    });
                    return null;
                  }
                  const isThrottled = isRetryableThrottledError(err);
                  if (isThrottled) {
                    getAttempt += 1;
                    if (getAttempt > maxRetries) {
                      return null;
                    }
                    const delaySeconds = computeRetryDelaySeconds(err, getAttempt);
                    log.write("warn", "retrying", {
                      errorCode: String(err.status),
                      pageId: page.id,
                      retryAfter: delaySeconds,
                      status: err.status
                    });
                    await doSleep(delaySeconds * 1000, params.sleepFn);
                    const postSleep = await verifyLiveConfig();
                    if (!postSleep) {
                      hasSettingsChanged = true;
                      return null;
                    }
                    continue;
                  }
                }
                return null;
              }
            }
            return null;
          };

          if (cacheTime && pageTime && cacheTime > pageTime) {
            // Newer cache: perform exception GET
            const fresh = await fetchPageRefresh();
            if (fresh) {
              candidatePage = fresh;
            } else if (isFatalAuthError) {
              return;
            } else {
              // NEVER PATCH KNOWN STALE DATA: isolate failure and skip write
              failedCount += 1;
              processedCount += 1;
              log.write("error", "page_failed", {
                errorCode: "GET_FAILED",
                pageId: page.id,
                reason: "stale_refresh_failed"
              });
              skipWrite = true;
            }
          } else if (cacheTime && pageTime && cacheTime === pageTime && cachedRow?.rawPropertiesJson) {
            // Equal timestamp: check if status differs
            let cachedOptionId: string | undefined;
            try {
              const parsed = JSON.parse(cachedRow.rawPropertiesJson);
              const rawStatus = pickRawNotionProperty(parsed, latest.conn.statusProperty) as
                | { select?: { id?: string }; status?: { id?: string } }
                | undefined;
              cachedOptionId = rawStatus?.status?.id ?? rawStatus?.select?.id;
            } catch {
              // Ignore parse error
            }
            const pageRawStatus = pickRawNotionProperty(page.properties ?? {}, latest.conn.statusProperty) as
              | { select?: { id?: string }; status?: { id?: string } }
              | undefined;
            const pageOptionId = pageRawStatus?.status?.id ?? pageRawStatus?.select?.id;

            if (cachedOptionId && pageOptionId && cachedOptionId !== pageOptionId) {
              // Conflicting status at same timestamp: exception GET
              const fresh = await fetchPageRefresh();
              if (fresh) {
                candidatePage = fresh;
              } else if (isFatalAuthError) {
                return;
              } else {
                failedCount += 1;
                processedCount += 1;
                log.write("error", "page_failed", {
                  errorCode: "GET_FAILED",
                  pageId: page.id,
                  reason: "equal_time_refresh_failed"
                });
                skipWrite = true;
              }
            }
          }

          if (skipWrite || isFatalAuthError || hasSettingsChanged) {
            return;
          }

          // Evaluate icon decision with verified latest config
          const decision = determineTargetIcon(candidatePage, latest.conn, latest.settings);
          if (decision.action === "skip") {
            skippedCount += 1;
            processedCount += 1;
            return;
          }

            // Write icon PATCH with retry & ambiguous verification
          try {
            const patchRes = await patchPageIconWithBoundedRetry({
              context: log.context,
              initialEmoji: decision.targetEmoji!,
              log,
              onAttempt: () => {
                requestCount += 1;
              },
              pageId: candidatePage.id,
              sleepFn: params.sleepFn,
              verifyLiveConfig
            });

            if (patchRes.outcome === "skipped") {
              skippedCount += 1;
              processedCount += 1;
              return;
            }

            // If updated page has a new status, bounded correction (at most 1)
            const postLive = await verifyLiveConfig();
            if (postLive) {
              const postDecision = determineTargetIcon(patchRes.page as NotionPageLike, postLive.conn, postLive.settings);
              if (postDecision.action === "update" && postDecision.targetEmoji && postDecision.targetEmoji !== decision.targetEmoji) {
                await patchPageIconWithBoundedRetry({
                  context: log.context,
                  initialEmoji: postDecision.targetEmoji,
                  log,
                  onAttempt: () => {
                    requestCount += 1;
                  },
                  pageId: candidatePage.id,
                  sleepFn: params.sleepFn,
                  verifyLiveConfig
                });
              }
            }

            updatedCount += 1;
          } catch (patchErr) {
            if (patchErr instanceof NotionApiError && (patchErr.status === 401 || patchErr.status === 403)) {
              isFatalAuthError = true;
              finalStatus = "failed";
              errorCode = String(patchErr.status);
              errorMessage = "Notion 인증 또는 권한 오류로 중단되었습니다.";
              log.write("error", "failed", {
                errorCode,
                error: notionErrorMessage(patchErr),
                pageId: candidatePage.id,
                requestCount
              });
              return;
            }
            if (patchErr instanceof Error && patchErr.message === "SETTINGS_CHANGED") {
              hasSettingsChanged = true;
              return;
            }
            failedCount += 1;
            if (patchErr instanceof Error && patchErr.message === "RECONCILIATION_FAILED") {
              log.write("error", "page_failed", {
                errorCode: "RECONCILIATION_FAILED",
                pageId: candidatePage.id,
                reason: "reconciliation_unverified"
              });
            } else {
              log.write("error", "page_failed", {
                errorCode: patchErr instanceof NotionApiError ? String(patchErr.status) : "PATCH_FAILED",
                pageId: candidatePage.id
              });
            }
          }

          processedCount += 1;
        });

        maybeLogProgress();
        await syncDbProgress();

        if (pacingMs > 0) {
          await sleep(pacingMs);
        }
      }

      if (hasSettingsChanged || isFatalAuthError) {
        break;
      }

      if (!activeBatch.has_more || !activeBatch.next_cursor || isPartial) {
        totalKnown = !isPartial;
        totalCount = discoveredCount;
        break;
      }

      cursor = activeBatch.next_cursor;
    }

    if (hasSettingsChanged) {
      finalStatus = "interrupted";
      errorCode = "SETTINGS_CHANGED";
      errorMessage = "작업 도중 설정이 변경되어 동기화가 중단되었습니다.";
      log.write("warn", "interrupted", {
        count: processedCount,
        dataSourceId: existingJob.dataSourceId,
        errorCode,
        failed: failedCount,
        reason: "settings_changed",
        requestCount,
        skipped: skippedCount,
        updated: updatedCount
      });
      return;
    }

    if (isFatalAuthError) {
      finalStatus = "failed";
      errorCode = errorCode || "AUTH_FAILED";
      errorMessage = errorMessage || "Notion 인증 또는 권한 오류로 중단되었습니다.";
      return;
    }

    if (finalStatus === "failed") {
      return;
    }

    if (queryRequests >= maxQueryPages && !totalKnown) {
      isPartial = true;
      errorCode = "CAP_REACHED";
      errorMessage = "최대 지원 페이지 수에 도달하여 일부 페이지만 처리되었습니다.";
    }

    finalStatus = isPartial ? "partial" : failedCount > 0 ? (updatedCount > 0 ? "partial" : "failed") : "completed";
    if (finalStatus === "completed") {
      log.write("info", "completed", {
        count: processedCount,
        dataSourceId: existingJob.dataSourceId,
        failed: failedCount,
        requestCount,
        skipped: skippedCount,
        updated: updatedCount
      });
    } else if (finalStatus === "failed") {
      log.write("error", "failed", {
        count: processedCount,
        dataSourceId: existingJob.dataSourceId,
        errorCode: errorCode || "JOB_FAILED",
        failed: failedCount,
        requestCount,
        skipped: skippedCount,
        updated: updatedCount
      });
    } else {
      log.write("warn", "partial", {
        count: processedCount,
        dataSourceId: existingJob.dataSourceId,
        errorCode,
        failed: failedCount,
        requestCount,
        skipped: skippedCount,
        updated: updatedCount
      });
    }
  } catch (error) {
    finalStatus = "failed";
    errorCode = "UNHANDLED_EXCEPTION";
    errorMessage = "작업 중 예외가 발생했습니다.";
    log.write("error", "failed", {
      errorCode,
      error: notionErrorMessage(error),
      requestCount
    });
  } finally {
    await prisma.$executeRawUnsafe(
      `UPDATE "NotionIconBulkJob"
       SET "status" = ?,
           "discoveredCount" = ?,
           "processedCount" = ?,
           "updatedCount" = ?,
           "skippedCount" = ?,
           "failedCount" = ?,
           "requestCount" = ?,
           "totalKnown" = ?,
           "totalCount" = ?,
           "errorMessage" = ?,
           "errorCode" = ?,
           "finishedAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "userId" = ?`,
      finalStatus,
      discoveredCount,
      processedCount,
      updatedCount,
      skippedCount,
      failedCount,
      requestCount,
      totalKnown ? 1 : 0,
      totalCount,
      errorMessage,
      errorCode,
      params.jobId,
      params.userId
    );
  }
}

export type PatchPageIconResult =
  | { outcome: "updated"; page: NotionPagePatchResult }
  | { outcome: "skipped"; page: NotionPagePatchResult; reason: string };

async function patchPageIconWithBoundedRetry(params: {
  context?: NotionLogContext;
  initialEmoji: string;
  log: ReturnType<typeof createNotionLog>;
  onAttempt?: () => void;
  pageId: string;
  sleepFn?: (ms: number) => Promise<void>;
  verifyLiveConfig: () => Promise<{
    conn: UserNotionConnection;
    settings: NotionStatusIconSettings;
    token: string;
  } | null>;
}): Promise<PatchPageIconResult> {
  const maxRetries = 3;
  let attempt = 0;
  let currentEmoji = params.initialEmoji;

  while (attempt <= maxRetries) {
    const live = await params.verifyLiveConfig();
    if (!live) {
      throw new Error("SETTINGS_CHANGED");
    }

    try {
      const page = await updateNotionPageProperties({
        context: params.context,
        icon: { emoji: currentEmoji, type: "emoji" },
        logSeverity: "none",
        onAttempt: params.onAttempt,
        pageId: params.pageId,
        token: live.token
      });
      return { outcome: "updated", page };
    } catch (error) {
      if (error instanceof NotionApiError) {
        // 1) Auth / Permission: stop immediately
        if (error.status === 401 || error.status === 403) {
          throw error;
        }

        // 2) Retryable rate limit or server overload: 429 (not blocked) or 529
        if (isRetryableThrottledError(error)) {
          attempt += 1;
          if (attempt > maxRetries) {
            throw error;
          }

          const delaySeconds = computeRetryDelaySeconds(error, attempt);

          params.log.write("warn", "retrying", {
            errorCode: String(error.status),
            pageId: params.pageId,
            retryAfter: delaySeconds,
            status: error.status
          });

          await doSleep(delaySeconds * 1000, params.sleepFn);
          const postSleep = await params.verifyLiveConfig();
          if (!postSleep) {
            throw new Error("SETTINGS_CHANGED");
          }
          continue;
        }

        // 3) Permanent client failure: 4xx (including blocked 429, 400, 404, etc.)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
      }

      // 4) 500, 502, 503, 504, or network failure: ambiguous write!
      attempt += 1;
      if (attempt > maxRetries) {
        throw error;
      }

      const delaySeconds = Math.min(attempt, 5);
      params.log.write("warn", "retrying", {
        errorCode: error instanceof NotionApiError ? String(error.status) : "NETWORK_ERROR",
        pageId: params.pageId,
        retryAfter: delaySeconds,
        status: error instanceof NotionApiError ? error.status : 0
      });

      await doSleep(delaySeconds * 1000, params.sleepFn);
      const postSleep = await params.verifyLiveConfig();
      if (!postSleep) {
        throw new Error("SETTINGS_CHANGED");
      }

      // Reconciliation GET to verify whether in-flight write committed
      let verifiedPage: NotionPageLike | null = null;
      let verifyGetAttempt = 0;
      const maxVerifyGetRetries = 2;

      while (verifyGetAttempt <= maxVerifyGetRetries) {
        try {
          const verifyRes = await requestNotionApi({
            context: params.context,
            errorMessage: (status) => `검증 조회 실패 (${status})`,
            logSeverity: "none",
            method: "GET",
            onAttempt: params.onAttempt,
            path: `/v1/pages/${encodeURIComponent(params.pageId)}`,
            token: postSleep.token
          });
          verifiedPage = (await verifyRes.json()) as NotionPageLike;
          break;
        } catch (verifyErr) {
          if (verifyErr instanceof NotionApiError) {
            if (verifyErr.status === 401 || verifyErr.status === 403) {
              // Fatal auth from verification must propagate immediately
              throw verifyErr;
            }
            if (isRetryableThrottledError(verifyErr)) {
              verifyGetAttempt += 1;
              if (verifyGetAttempt > maxVerifyGetRetries) {
                // Throttling exhausted in verification: throw, DO NOT FALL THROUGH TO EARLY PATCH!
                throw verifyErr;
              }
              const delaySeconds = computeRetryDelaySeconds(verifyErr, verifyGetAttempt);
              params.log.write("warn", "retrying", {
                errorCode: String(verifyErr.status),
                pageId: params.pageId,
                retryAfter: delaySeconds,
                status: verifyErr.status
              });
              await doSleep(delaySeconds * 1000, params.sleepFn);
              const postVerifySleep = await params.verifyLiveConfig();
              if (!postVerifySleep) {
                throw new Error("SETTINGS_CHANGED");
              }
              continue;
            }
          }
          // Non-throttled error during verification: stop verification attempts
          break;
        }
      }

      if (!verifiedPage) {
        throw new Error("RECONCILIATION_FAILED");
      }

      // Reuse common determineTargetIcon helper for full target eligibility
      const verifyDecision = determineTargetIcon(
        verifiedPage,
        postSleep.conn,
        postSleep.settings
      );

      if (verifyDecision.action === "skip") {
        // If already up-to-date with target icon, log verified success
        if (verifyDecision.reason === "same_icon") {
          params.log.write("info", "verified", {
            pageId: params.pageId,
            status: 200
          });
          return { outcome: "updated", page: verifiedPage as NotionPagePatchResult };
        }
        // Ineligible, trashed, foreign source, unmapped: skip further writes
        return {
          outcome: "skipped",
          page: verifiedPage as NotionPagePatchResult,
          reason: verifyDecision.reason ?? "ineligible"
        };
      }

      // Status changed to another mapped option: update emoji for next attempt (never resend old emoji!)
      currentEmoji = verifyDecision.targetEmoji!;
    }
  }

  throw new Error(`페이지 아이콘 업데이트 실패: ${params.pageId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
