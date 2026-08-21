import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("prefillDummyTimesheetData generates realistic days without Notion when withNotion is false", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-prefill-test-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store, { prefillDummyTimesheetData }] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./timesheet-store"),
    import("./dummy-prefill")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      "user-dummy-1",
      "dummyuser",
      "hash"
    );

    const result = await prefillDummyTimesheetData({
      month: 7, // August (0-indexed 7)
      userId: "user-dummy-1",
      withNotion: false,
      year: 2026
    });

    assert.equal(result.userId, "user-dummy-1");
    assert.equal(result.year, 2026);
    assert.equal(result.month, 8);
    assert.equal(result.withNotion, false);
    assert.equal(result.notionCardsCreated, 0);
    assert.ok(result.daysCreated > 0);

    const days = await store.listTimesheetEntries({
      endDateKey: "2026-08-31",
      startDateKey: "2026-08-01",
      userId: "user-dummy-1"
    });

    assert.ok(days.length > 0);
    // Verify no Notion cards attached when withNotion is false
    for (const day of days) {
      for (const entry of day.entries) {
        assert.equal(entry.notionCards.length, 0);
      }
    }

    const projects = await store.listProjects({ userId: "user-dummy-1" });
    assert.ok(projects.length >= 4);

    const vacationAllowance = await store.getVacationAllowance({
      userId: "user-dummy-1",
      year: 2026
    });
    assert.equal(vacationAllowance?.days, 15);
  } finally {
    await prisma.$disconnect();
  }
});

test("prefillDummyTimesheetData generates mock Notion cards and links them when withNotion is true", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-prefill-notion-test-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store, notionStore, { prefillDummyTimesheetData }] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./timesheet-store"),
    import("./notion-store"),
    import("./dummy-prefill")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      "user-dummy-2",
      "dummyuser2",
      "hash"
    );

    const result = await prefillDummyTimesheetData({
      month: 7, // August
      userId: "user-dummy-2",
      withNotion: true,
      year: 2026
    });

    assert.equal(result.userId, "user-dummy-2");
    assert.equal(result.withNotion, true);
    assert.ok(result.notionCardsCreated > 0);

    const cachedCards = await notionStore.listCachedNotionCards({
      endDateKey: "2026-08-31",
      startDateKey: "2026-08-01",
      userId: "user-dummy-2"
    });
    assert.ok(cachedCards.length > 0);

    const days = await store.listTimesheetEntries({
      endDateKey: "2026-08-31",
      startDateKey: "2026-08-01",
      userId: "user-dummy-2"
    });

    const workDays = days.filter((d) => d.entries.some((e) => e.kind === "WORK"));
    assert.ok(workDays.length > 0);

    // Verify at least one work entry has linked Notion cards
    const hasLinkedCards = workDays.some((d) =>
      d.entries.some((e) => e.kind === "WORK" && e.notionCards.length > 0)
    );
    assert.ok(hasLinkedCards);

    // Verify idempotent re-run does not error or conflict
    await prefillDummyTimesheetData({
      month: 7,
      userId: "user-dummy-2",
      withNotion: true,
      year: 2026
    });
  } finally {
    await prisma.$disconnect();
  }
});
