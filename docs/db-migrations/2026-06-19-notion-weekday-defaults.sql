-- Adds user-owned weekday Notion default cards.
-- Runtime bootstrap also creates this table through ensureNotionSchema().

CREATE TABLE IF NOT EXISTS "UserNotionWeeklyDefaultCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 1 AND 5),
  "notionPageId" TEXT NOT NULL,
  "allocatedHours" REAL NOT NULL DEFAULT 0 CHECK ("allocatedHours" >= 0),
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotionWeeklyDefaultCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserNotionWeeklyDefaultCard_user_weekday_page_key"
  ON "UserNotionWeeklyDefaultCard"("userId", "weekday", "notionPageId");

CREATE INDEX IF NOT EXISTS "UserNotionWeeklyDefaultCard_userId_weekday_idx"
  ON "UserNotionWeeklyDefaultCard"("userId", "weekday");
