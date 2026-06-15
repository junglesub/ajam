-- Notion card sync schema reference for SQLite.
--
-- The application still applies this schema through runtime bootstrap in
-- packages/db/src/notion-store.ts. Keep this document aligned with that file so
-- operators can inspect or apply the schema explicitly when needed.

CREATE TABLE IF NOT EXISTS "UserNotionConnection" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserNotionConnection_userId_key" ON "UserNotionConnection"("userId");

-- If UserNotionConnection already exists from an earlier bootstrap, add only
-- the columns that are missing. SQLite versions used by this app do not rely on
-- ALTER TABLE ADD COLUMN IF NOT EXISTS, so check PRAGMA table_info first.
-- ALTER TABLE "UserNotionConnection" ADD COLUMN "workHoursPropertyJson" TEXT NOT NULL DEFAULT '';
-- ALTER TABLE "UserNotionConnection" ADD COLUMN "workDayCountPropertyJson" TEXT NOT NULL DEFAULT '';
-- ALTER TABLE "UserNotionConnection" ADD COLUMN "availableHoursPropertyJson" TEXT NOT NULL DEFAULT '';
-- ALTER TABLE "UserNotionConnection" ADD COLUMN "lastWorkedDatePropertyJson" TEXT NOT NULL DEFAULT '';
-- ALTER TABLE "UserNotionConnection" ADD COLUMN "ajamLastUpdatePropertyJson" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "NotionCardCache" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotionCardCache_userId_notionPageId_key" ON "NotionCardCache"("userId", "notionPageId");
CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_startDate_endDate_idx" ON "NotionCardCache"("userId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_status_idx" ON "NotionCardCache"("userId", "status");
CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_category_idx" ON "NotionCardCache"("userId", "category");

CREATE TABLE IF NOT EXISTS "WorkEntryNotionCard" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkEntryNotionCard_user_entry_page_key" ON "WorkEntryNotionCard"("userId", "timesheetEntryId", "notionPageId");
CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_dateKey_idx" ON "WorkEntryNotionCard"("userId", "dateKey");
CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_notionPageId_idx" ON "WorkEntryNotionCard"("userId", "notionPageId");

CREATE TABLE IF NOT EXISTS "NotionSyncRun" (
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
);

CREATE INDEX IF NOT EXISTS "NotionSyncRun_scope_idx" ON "NotionSyncRun"("userId", "scopeType", "scopeStartDate", "scopeEndDate", "finishedAt");
CREATE INDEX IF NOT EXISTS "NotionSyncRun_status_idx" ON "NotionSyncRun"("userId", "status", "finishedAt");
