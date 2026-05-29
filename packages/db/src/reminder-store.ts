import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { ensureApplicationSchema } from "./settings-store";
import { ensureTimesheetSchema, listHolidays } from "./timesheet-store";

export type DailyTimesheetReminderTarget = {
  dateKey: string;
  email: string;
  userId: string;
  username: string;
};

export type DailyTimesheetReminderResult = {
  dateKey: string;
  skippedReason?: "HOLIDAY" | "WEEKEND";
  targets: DailyTimesheetReminderTarget[];
};

const dailyReminderType = "daily-timesheet";

type ReminderTargetRow = {
  dateKey: string | null;
  email: string;
  hasFilledWork: number | bigint | null;
  hasHolidayEntry: number | bigint | null;
  hasVacation: number | bigint | null;
  reminderSentAt: string | null;
  userId: string;
  username: string;
};

type TableInfoRow = {
  name: string;
};

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<TableInfoRow[]>(`PRAGMA table_info("${tableName}")`);
  return rows.some((row) => row.name === columnName);
}

function isWeekendDateKey(dateKey: string): boolean {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();

  return weekday === 0 || weekday === 6;
}

export async function ensureReminderSchema() {
  await ensureApplicationSchema();
  await ensureTimesheetSchema();

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);

  if (!(await hasColumn("ReminderLog", "sentTo"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ReminderLog" ADD COLUMN "sentTo" TEXT NOT NULL DEFAULT ''`);
  }

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ReminderLog_type_userId_dateKey_key" ON "ReminderLog"("type", "userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReminderLog_dateKey_type_idx" ON "ReminderLog"("dateKey", "type")`);
}

export async function listDailyTimesheetReminderTargets(params: { dateKey: string; includeAlreadySent?: boolean }): Promise<DailyTimesheetReminderResult> {
  await ensureReminderSchema();

  if (isWeekendDateKey(params.dateKey)) {
    return {
      dateKey: params.dateKey,
      skippedReason: "WEEKEND",
      targets: []
    };
  }

  const holidays = await listHolidays({ endDateKey: params.dateKey, startDateKey: params.dateKey });

  if (holidays.some((holiday) => holiday.dateKey === params.dateKey)) {
    return {
      dateKey: params.dateKey,
      skippedReason: "HOLIDAY",
      targets: []
    };
  }

  const rows = await prisma.$queryRawUnsafe<ReminderTargetRow[]>(
    `SELECT
       "User"."id" AS "userId",
       "User"."username" AS "username",
       "User"."email" AS "email",
       max("TimesheetEntry"."dateKey") AS "dateKey",
       max(CASE WHEN "TimesheetEntry"."kind" = 'WORK' AND trim("TimesheetEntry"."content") <> '' THEN 1 ELSE 0 END) AS "hasFilledWork",
       max(CASE WHEN "TimesheetEntry"."kind" = 'VACATION' THEN 1 ELSE 0 END) AS "hasVacation",
       max(CASE WHEN "TimesheetEntry"."kind" = 'HOLIDAY' THEN 1 ELSE 0 END) AS "hasHolidayEntry",
       max("ReminderLog"."sentAt") AS "reminderSentAt"
     FROM "User"
     LEFT JOIN "TimesheetEntry"
       ON "TimesheetEntry"."userId" = "User"."id"
      AND "TimesheetEntry"."dateKey" = ?
     LEFT JOIN "ReminderLog"
       ON "ReminderLog"."userId" = "User"."id"
      AND "ReminderLog"."dateKey" = ?
      AND "ReminderLog"."type" = ?
     WHERE trim("User"."email") <> ''
     GROUP BY "User"."id", "User"."username", "User"."email"
     ORDER BY "User"."username" ASC`,
    params.dateKey,
    params.dateKey,
    dailyReminderType
  );

  const targets = rows.flatMap((row) => {
    const hasFilledWork = Number(row.hasFilledWork ?? 0) > 0;
    const hasVacation = Number(row.hasVacation ?? 0) > 0;
    const hasHolidayEntry = Number(row.hasHolidayEntry ?? 0) > 0;

    if (hasFilledWork || hasVacation || hasHolidayEntry || (!params.includeAlreadySent && row.reminderSentAt)) {
      return [];
    }

    return [
      {
        dateKey: params.dateKey,
        email: row.email,
        userId: row.userId,
        username: row.username
      }
    ];
  });

  return {
    dateKey: params.dateKey,
    targets
  };
}

export async function markDailyTimesheetReminderSent(params: { dateKey: string; email: string; userId: string }) {
  await ensureReminderSchema();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ReminderLog" ("id", "type", "userId", "dateKey", "sentTo", "sentAt")
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("type", "userId", "dateKey") DO UPDATE SET "sentTo" = excluded."sentTo", "sentAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    dailyReminderType,
    params.userId,
    params.dateKey,
    params.email.trim().toLowerCase()
  );
}
