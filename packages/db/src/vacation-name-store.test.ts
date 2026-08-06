import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("vacation type names are renamed only for the selected user and year", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-vacation-name-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, store] = await Promise.all([import("./client"), import("./timesheet-store")]);

  try {
    await store.ensureTimesheetSchema();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      "user-1",
      "tester-1",
      "hash",
      "user-2",
      "tester-2",
      "hash"
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TimesheetEntry" ("id", "userId", "dateKey", "kind", "vacationName") VALUES
        ('entry-1', 'user-1', '2026-01-05', 'VACATION', ''),
        ('entry-2', 'user-1', '2026-02-05', 'VACATION', '휴가'),
        ('entry-3', 'user-1', '2027-01-05', 'VACATION', '휴가'),
        ('entry-4', 'user-2', '2026-01-05', 'VACATION', '휴가'),
        ('entry-5', 'user-1', '2026-02-06', 'VACATION', char(9) || '휴가' || char(10))`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Vacation" ("id", "userId", "dateKey", "name", "hours") VALUES ('vacation-1', 'user-1', '2026-03-05', char(160) || '휴가' || char(12288), 8)`
    );

    const changed = await store.renameVacationTypeForYear({
      endDateKey: "2026-12-31",
      newName: " 대체 휴가 ",
      oldName: "휴가",
      startDateKey: "2026-01-01",
      userId: "user-1"
    });
    const rows = await prisma.$queryRawUnsafe<Array<{ dateKey: string; name: string; source: string; userId: string }>>(
      `SELECT "userId", "dateKey", "vacationName" AS "name", 'entry' AS "source" FROM "TimesheetEntry"
       UNION ALL
       SELECT "userId", "dateKey", "name", 'legacy' AS "source" FROM "Vacation"
       ORDER BY "source", "userId", "dateKey"`
    );

    assert.equal(changed, 4);
    assert.deepEqual(rows, [
      { dateKey: "2026-01-05", name: "대체 휴가", source: "entry", userId: "user-1" },
      { dateKey: "2026-02-05", name: "대체 휴가", source: "entry", userId: "user-1" },
      { dateKey: "2026-02-06", name: "대체 휴가", source: "entry", userId: "user-1" },
      { dateKey: "2027-01-05", name: "휴가", source: "entry", userId: "user-1" },
      { dateKey: "2026-01-05", name: "휴가", source: "entry", userId: "user-2" },
      { dateKey: "2026-03-05", name: "대체 휴가", source: "legacy", userId: "user-1" }
    ]);
    await assert.rejects(
      () =>
        store.renameVacationTypeForYear({
          endDateKey: "2026-12-31",
          newName: "   ",
          oldName: "대체 휴가",
          startDateKey: "2026-01-01",
          userId: "user-1"
        }),
      /이름/
    );
  } finally {
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
