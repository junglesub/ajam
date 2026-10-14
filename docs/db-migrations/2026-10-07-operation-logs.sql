CREATE TABLE IF NOT EXISTS "OperationLog" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "OperationLog_eventId_key"
  ON "OperationLog"("eventId");

CREATE INDEX IF NOT EXISTS "OperationLog_userId_id_idx"
  ON "OperationLog"("userId", "id");

CREATE INDEX IF NOT EXISTS "OperationLog_level_id_idx"
  ON "OperationLog"("level", "id");

CREATE INDEX IF NOT EXISTS "OperationLog_operationId_id_idx"
  ON "OperationLog"("operationId", "id");

CREATE INDEX IF NOT EXISTS "OperationLog_level_timestamp_idx"
  ON "OperationLog"("level", "timestamp");

CREATE TABLE IF NOT EXISTS "OperationLogRead" (
  "viewerUserId" TEXT NOT NULL,
  "logId" INTEGER NOT NULL,
  CONSTRAINT "OperationLogRead_pkey" PRIMARY KEY ("viewerUserId", "logId"),
  CONSTRAINT "OperationLogRead_logId_fkey" FOREIGN KEY ("logId")
    REFERENCES "OperationLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OperationLogRead_logId_idx"
  ON "OperationLogRead"("logId");
