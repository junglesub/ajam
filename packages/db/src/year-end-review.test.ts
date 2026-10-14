import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildYearEndReviewSummary } from "@timesheet/domain";

const periodMarch = {
  browserTodayDateKey: "2026-10-14",
  endDateKey: "2026-03-31",
  startDateKey: "2026-03-01"
};
const periodApril = {
  browserTodayDateKey: "2026-10-14",
  endDateKey: "2026-04-30",
  startDateKey: "2026-04-01"
};
const periodEmpty = {
  browserTodayDateKey: "2026-10-14",
  endDateKey: "2026-06-30",
  startDateKey: "2026-06-01"
};

test("year-end review loader isolates users and reads linked cards in batches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-year-end-review-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [loader, { prisma }, { ensureApplicationSchema }, notion, store] = await Promise.all([
    import("../../../apps/web/src/server/year-end-review"),
    import("./client"),
    import("./settings-store"),
    import("./notion-store"),
    import("./timesheet-store")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();
    await notion.ensureNotionSchema();
    await insertUser(prisma, "A", "user-a");
    await insertUser(prisma, "B", "user-b");

    await notion.upsertNotionCardCache({
      analysisConfigVersion: 1,
      cards: [
        {
          archived: false,
          category: "개발",
          endDate: "",
          lastEditedTime: "2026-03-01T00:00:00.000Z",
          notionPageId: "card-a",
          rawPropertiesJson: "{\"accessToken\":\"private-test-marker\"}",
          stale: true,
          startDate: "",
          status: "In Progress",
          title: "카드 A",
          url: "https://notion.so/card-a"
        },
        {
          archived: false,
          category: "운영",
          endDate: "",
          lastEditedTime: "2026-03-01T00:00:00.000Z",
          notionPageId: "card-a2",
          rawPropertiesJson: "",
          stale: false,
          startDate: "2026-03-01",
          status: "Done",
          title: "카드 A2",
          url: "https://notion.so/card-a2"
        }
      ],
      userId: "A"
    });
    await notion.upsertNotionCardCache({
      analysisConfigVersion: 1,
      cards: [
        {
          archived: false,
          category: "개발",
          endDate: "",
          lastEditedTime: "2026-03-01T00:00:00.000Z",
          notionPageId: "card-b",
          rawPropertiesJson: "",
          stale: false,
          startDate: "2026-03-01",
          status: "In Progress",
          title: "B-only-title",
          url: "https://notion.so/card-b"
        }
      ],
      userId: "B"
    });

    await insertWorkEntry(prisma, { content: "A 업무", dateKey: "2026-03-02", id: "A-in-period", userId: "A" });
    await insertLink(prisma, { allocatedHours: 4, dateKey: "2026-03-02", entryId: "A-in-period", notionPageId: "card-a", userId: "A" });
    await insertLink(prisma, { allocatedHours: 4, dateKey: "2026-03-02", entryId: "A-in-period", notionPageId: "card-a2", userId: "A" });
    await insertWorkEntry(prisma, { content: "캐시 없는 카드 업무", dateKey: "2026-03-03", id: "A-missing-cache", userId: "A" });
    await insertLink(prisma, { allocatedHours: 8, dateKey: "2026-03-03", entryId: "A-missing-cache", notionPageId: "card-no-cache", userId: "A" });
    await insertWorkEntry(prisma, { content: "미연결 업무", dateKey: "2026-03-04", id: "A-unlinked", userId: "A" });
    await insertWorkEntry(prisma, { content: "기간 밖 업무", dateKey: "2025-12-31", id: "A-out-of-period", userId: "A" });
    await insertWorkEntry(prisma, { content: "B 업무", dateKey: "2026-03-02", id: "B-only-entry", userId: "B" });
    await insertLink(prisma, { allocatedHours: 8, dateKey: "2026-03-02", entryId: "B-only-entry", notionPageId: "card-b", userId: "B" });

    await insertWorkEntry(prisma, { content: "배치 업무", dateKey: "2026-04-01", id: "A-batch", userId: "A" });

    for (let index = 0; index < 201; index += 1) {
      await insertLink(prisma, {
        allocatedHours: 8 / 201,
        dateKey: "2026-04-01",
        entryId: "A-batch",
        notionPageId: `batch-card-${index}`,
        userId: "A"
      });
    }

    await notion.upsertNotionCardCache({
      analysisConfigVersion: 1,
      cards: [
        {
          archived: false,
          category: "개발",
          endDate: "",
          lastEditedTime: "2026-04-01T00:00:00.000Z",
          notionPageId: "batch-card-200",
          rawPropertiesJson: "",
          stale: false,
          startDate: "2026-04-01",
          status: "In Progress",
          title: "배치 카드 200",
          url: "https://notion.so/batch-card-200"
        }
      ],
      userId: "A"
    });

    const aData = await loader.loadYearEndReviewData({ period: periodMarch, userId: "A" });

    assert.deepEqual(
      aData.entries.map((entry) => entry.id).sort(),
      ["A-in-period", "A-missing-cache", "A-unlinked"]
    );
    assert.equal(aData.entries.find((entry) => entry.id === "A-in-period")?.content, "A 업무");
    assert.ok(!aData.entries.some((entry) => entry.id === "B-only-entry"));
    assert.ok(!aData.cards.some((card) => card.title === "B-only-title"));
    assert.ok(aData.cards.some((card) => card.metadataMissing));
    assert.deepEqual(
      aData.links.map((link) => link.notionPageId).sort(),
      ["card-a", "card-a2", "card-no-cache"]
    );
    assert.ok(aData.warnings.some((warning) => warning.code === "card_stale"));
    assert.ok(aData.warnings.some((warning) => warning.code === "unlinked_work"));
    assert.ok(!JSON.stringify(aData).includes("private-test-marker"));
    assert.ok(!JSON.stringify(aData).includes("B-only-entry"));
    assert.ok(!JSON.stringify(aData).includes("B-only-title"));

    const batchData = await loader.loadYearEndReviewData({ period: periodApril, userId: "A" });

    assert.equal(batchData.cards.length, 201);
    assert.ok(batchData.cards.some((card) => card.title === "배치 카드 200"));

    const batchSummary = buildYearEndReviewSummary(batchData);

    assert.equal(batchSummary.recordedHours, 8);
    assert.equal(batchSummary.allocatedHours, 8);
    assert.equal(batchSummary.allocationMismatchCount, 0);
    assert.equal(batchSummary.overallocatedHours, 0);

    const emptyData = await loader.loadYearEndReviewData({ period: periodEmpty, userId: "A" });

    assert.deepEqual(emptyData.entries, []);
    assert.deepEqual(emptyData.cards, []);
    assert.deepEqual(emptyData.days, []);
    assert.ok(emptyData.loadedAt);

    await prisma.$executeRawUnsafe(`DROP TABLE "WorkEntryNotionCard"`);

    await assert.rejects(() =>
      loader.loadYearEndReviewData({
        period: { browserTodayDateKey: "2026-10-14", endDateKey: "2026-10-14", startDateKey: "2026-10-15" },
        userId: "A"
      })
    );
    await assert.rejects(() => loader.loadYearEndReviewData({ period: periodMarch, userId: "A" }));
  } finally {
    await prisma.$disconnect();

    const resolvedDirectory = resolve(directory);

    assert.ok(resolvedDirectory.startsWith(resolve(tmpdir())) && resolvedDirectory !== resolve(tmpdir()));
    await rm(resolvedDirectory, { force: true, recursive: true });
  }
});

async function insertUser(prisma: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }, id: string, username: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    username,
    "hash"
  );
}

async function insertWorkEntry(
  prisma: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> },
  params: { content: string; dateKey: string; id: string; userId: string }
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "TimesheetEntry" (
       "id", "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "shortVersion",
       "vacationName", "vacationStatus", "holidayName", "sortOrder", "createdAt", "updatedAt"
     )
     VALUES (?, ?, ?, 'WORK', '', 8, ?, '', '', '', 'CONFIRMED', '', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    params.id,
    params.userId,
    params.dateKey,
    params.content
  );
}

async function insertLink(
  prisma: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> },
  params: { allocatedHours: number; dateKey: string; entryId: string; notionPageId: string; userId: string }
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "WorkEntryNotionCard" (
       "id", "userId", "timesheetEntryId", "dateKey", "notionPageId", "allocatedHours", "allocationMode", "source",
       "createdAt", "updatedAt"
     )
     VALUES (?, ?, ?, ?, ?, ?, 'manual', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    randomUUID(),
    params.userId,
    params.entryId,
    params.dateKey,
    params.notionPageId,
    params.allocatedHours
  );
}
