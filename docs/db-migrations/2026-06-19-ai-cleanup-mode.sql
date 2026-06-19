-- Adds per-user AI cleanup execution mode and per-day scheduled rewrite requests.
-- Existing users keep the current save-time behavior through the immediate default.

ALTER TABLE "UserAiSetting"
  ADD COLUMN "cleanupMode" TEXT NOT NULL DEFAULT 'immediate';

ALTER TABLE "TimesheetDay"
  ADD COLUMN "aiRewriteRequested" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserAiSetting"
SET "cleanupMode" = 'immediate'
WHERE "cleanupMode" IS NULL OR trim("cleanupMode") = '';

UPDATE "TimesheetDay"
SET "aiRewriteRequested" = 0
WHERE "aiRewriteRequested" IS NULL;
