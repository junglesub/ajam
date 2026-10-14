import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildYearEndReviewDaySavePayload } from "@timesheet/domain";

test("year-end review day edits round-trip a full saved day", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-year-end-review-day-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./timesheet-store")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();
    await insertUser(prisma, "A", "user-a");

    await store.saveTimesheetDay({
      day: {
        aiRewriteRequested: true,
        dateKey: "2026-03-02",
        entries: [
          emptyEntry({ content: "수정 대상", hours: 8, kind: "WORK", project: "P1", sortOrder: 0 }),
          emptyEntry({ content: "숨겨진 기록", hours: 3, kind: "WORK", project: "P2", sortOrder: 1 }),
          emptyEntry({ hours: 8, kind: "VACATION", sortOrder: 2, vacationName: "연차" }),
          emptyEntry({ holidayName: "어린이날", hours: 8, kind: "HOLIDAY", sortOrder: 3 })
        ],
        holidayName: "",
        shortVersion: "3월 2일 요약"
      },
      userId: "A"
    });

    const [savedDay] = await store.listTimesheetEntries({
      endDateKey: "2026-03-02",
      startDateKey: "2026-03-02",
      userId: "A"
    });
    const editTarget = savedDay?.entries.find((entry) => entry.content === "수정 대상");

    assert.equal(savedDay?.entries.length, 4);
    assert.ok(editTarget?.id);

    await store.saveTimesheetDay({
      day: {
        ...buildYearEndReviewDaySavePayload({
        day: savedDay!,
        edits: [
          {
            aiTranslation: "Edited translation",
            content: "수정됨",
            entryId: editTarget!.id,
            hours: 6,
            notionCards: [{ allocatedHours: 6, allocationMode: "manual", notionPageId: "card-a", source: "manual" }],
            project: "P9"
          }
        ],
        shortVersion: "새 요약"
        }),
        aiRewriteRequested: Boolean(savedDay!.aiRewriteRequested)
      },
      userId: "A"
    });

    const [roundTripped] = await store.listTimesheetEntries({
      endDateKey: "2026-03-02",
      startDateKey: "2026-03-02",
      userId: "A"
    });
    const edited = roundTripped?.entries.find((entry) => entry.content === "수정됨");
    const hidden = roundTripped?.entries.find((entry) => entry.content === "숨겨진 기록");
    const vacation = roundTripped?.entries.find((entry) => entry.kind === "VACATION");
    const holiday = roundTripped?.entries.find((entry) => entry.kind === "HOLIDAY");

    assert.equal(roundTripped?.entries.length, 4);
    assert.equal(roundTripped?.shortVersion, "새 요약");
    assert.equal(roundTripped?.aiRewriteRequested, true);
    assert.equal(edited?.hours, 6);
    assert.equal(edited?.project, "P9");
    assert.equal(edited?.aiTranslation, "Edited translation");
    assert.equal(edited?.notionCards[0]?.allocatedHours, 6);
    assert.equal(hidden?.hours, 3);
    assert.equal(hidden?.project, "P2");
    assert.equal(vacation?.vacationName, "연차");
    assert.equal(vacation?.hours, 8);
    assert.equal(holiday?.holidayName, "어린이날");
    assert.deepEqual(
      roundTripped?.entries.map((entry) => entry.id).sort(),
      savedDay?.entries.map((entry) => entry.id).sort()
    );
  } finally {
    await prisma.$disconnect();

    const resolvedDirectory = resolve(directory);

    assert.ok(resolvedDirectory.startsWith(resolve(tmpdir())) && resolvedDirectory !== resolve(tmpdir()));
    await rm(resolvedDirectory, { force: true, recursive: true });
  }
});

function emptyEntry(overrides: Partial<{ content: string; holidayName: string; hours: number; kind: "WORK" | "VACATION" | "HOLIDAY"; project: string; sortOrder: number; vacationName: string }>) {
  return {
    aiTranslation: "",
    clientId: "",
    content: "",
    holidayName: "",
    hours: 0,
    id: "",
    kind: "WORK" as const,
    notionCards: [],
    project: "",
    sortOrder: 0,
    vacationName: "",
    vacationStatus: "CONFIRMED" as const,
    ...overrides
  };
}


async function insertUser(prisma: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }, id: string, username: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    username,
    "hash"
  );
}
