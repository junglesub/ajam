import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { StoredTimesheetDay } from "./timesheet-store";

function createVacationDay(dateKey: string): StoredTimesheetDay {
  return {
    aiRewriteRequested: false,
    dateKey,
    entries: [
      {
        aiTranslation: "",
        clientId: "vacation-entry-1",
        content: "",
        holidayName: "",
        hours: 8,
        id: "",
        kind: "VACATION",
        notionCards: [],
        project: "",
        sortOrder: 0,
        vacationName: "연차",
        vacationStatus: "CONFIRMED"
      }
    ],
    holidayName: "",
    shortVersion: ""
  };
}

test("vacation deletion cleans up empty TimesheetDay rows and list skips ghost days", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-timesheet-store-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./timesheet-store")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      "user-1",
      "tester",
      "hash"
    );

    await store.saveTimesheetDay({ day: createVacationDay("2026-01-05"), userId: "user-1" });
    const withVacation = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
    assert.equal(withVacation.length, 1);
    assert.equal(withVacation[0]?.entries.length, 1);
    assert.equal(withVacation[0]?.entries[0]?.kind, "VACATION");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Vacation" ("id", "userId", "dateKey", "name", "hours", "status", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      "user-1",
      "2026-01-06",
      "연차",
      8,
      "CONFIRMED"
    );

    await store.saveTimesheetDay({ day: { ...createVacationDay("2026-01-05"), entries: [] }, userId: "user-1" });
    await store.saveTimesheetDay({ day: { ...createVacationDay("2026-01-06"), entries: [] }, userId: "user-1" });

    const afterDelete = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
    assert.deepEqual(afterDelete, []);

    const dayRows = await prisma.$queryRawUnsafe<Array<{ dateKey: string }>>(
      `SELECT "dateKey" FROM "TimesheetDay" WHERE "userId" = ? AND "dateKey" IN (?, ?)`,
      "user-1",
      "2026-01-05",
      "2026-01-06"
    );
    assert.equal(dayRows.length, 0);

    const vacationRows = await prisma.$queryRawUnsafe<Array<{ dateKey: string }>>(
      `SELECT "dateKey" FROM "Vacation" WHERE "userId" = ? AND "dateKey" IN (?, ?)`,
      "user-1",
      "2026-01-05",
      "2026-01-06"
    );
    assert.equal(vacationRows.length, 0);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'AI 요약', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      "user-1",
      "2026-01-08"
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
       VALUES (?, ?, ?, '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      "user-1",
      "2026-01-09"
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
       VALUES (?, ?, ?, '', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      "user-1",
      "2026-01-07"
    );

    const days = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
    assert.deepEqual(
      days.map((day) => ({ aiRewriteRequested: day.aiRewriteRequested, dateKey: day.dateKey, entries: day.entries.length, shortVersion: day.shortVersion })),
      [
        { aiRewriteRequested: false, dateKey: "2026-01-08", entries: 0, shortVersion: "AI 요약" },
        { aiRewriteRequested: true, dateKey: "2026-01-09", entries: 0, shortVersion: "" }
      ]
    );
  } finally {
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
