import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateNotionCardHours,
  buildNotionCardAvailableHours,
  buildNotionCategorySummary,
  buildNotionCardEstimate,
  filterOpenNotionCardCandidates,
  normalizeNotionDateToDateKey,
  shouldWarnAboutFallbackHours,
  type NotionCardSnapshot,
  type WorkEntryNotionCardLink
} from "./notion-cards.js";

const cards: NotionCardSnapshot[] = [
  {
    archived: false,
    category: "Feature",
    endDate: "2026-06-05",
    lastEditedTime: "2026-06-05T09:00:00.000Z",
    notionPageId: "card-a",
    stale: false,
    startDate: "2026-06-01",
    status: "진행중",
    title: "로그인 개선",
    url: "https://notion.so/card-a"
  },
  {
    archived: false,
    category: "Feature",
    endDate: "",
    lastEditedTime: "2026-06-02T09:00:00.000Z",
    notionPageId: "card-b",
    stale: false,
    startDate: "2026-06-02",
    status: "완료",
    title: "완료일 없는 완료 카드",
    url: "https://notion.so/card-b"
  },
  {
    archived: false,
    category: "Ops",
    endDate: "",
    lastEditedTime: "2026-06-03T09:00:00.000Z",
    notionPageId: "card-c",
    stale: false,
    startDate: "2026-06-03",
    status: "진행중",
    title: "운영 대응",
    url: "https://notion.so/card-c"
  }
];

describe("Notion card candidates", () => {
  it("shows open non-done candidates by default while preserving linked done cards", () => {
    const candidates = filterOpenNotionCardCandidates({
      cards,
      dateKey: "2026-06-03",
      doneStatusValues: ["완료"],
      linkedPageIds: ["card-b"]
    });

    assert.deepEqual(
      candidates.map((card) => card.notionPageId),
      ["card-a", "card-b", "card-c"]
    );
  });

  it("excludes done cards that are not already linked", () => {
    const candidates = filterOpenNotionCardCandidates({
      cards,
      dateKey: "2026-06-03",
      doneStatusValues: ["완료"]
    });

    assert.deepEqual(
      candidates.map((card) => card.notionPageId),
      ["card-a", "card-c"]
    );
  });
});

describe("Notion card estimates", () => {
  it("splits saved and fallback work hours across mapped cards active on each business day", () => {
    const estimate = buildNotionCardEstimate({
      card: cards[0]!,
      doneStatusValues: ["완료"],
      mappedCards: cards,
      month: "2026-06",
      savedWorkHoursByDate: new Map([["2026-06-03", 6]])
    });

    assert.deepEqual(estimate, {
      dayEquivalent: 3.38,
      estimatedHours: 27,
      fallbackDateCount: 4,
      totalBusinessDays: 5
    });
  });

  it("marks done cards without an end date as unavailable for period estimates", () => {
    const estimate = buildNotionCardEstimate({
      card: cards[1]!,
      doneStatusValues: ["완료"],
      mappedCards: cards,
      month: "2026-06"
    });

    assert.equal(estimate.unavailableReason, "done_without_end_date");
  });

  it("can show a fallback-hours warning when saved work hours were missing", () => {
    assert.equal(shouldWarnAboutFallbackHours(1), true);
    assert.equal(shouldWarnAboutFallbackHours(0), false);
  });
});

describe("Notion card available hours", () => {
  it("counts working days between start and end dates while excluding holidays and vacations", () => {
    const availability = buildNotionCardAvailableHours({
      card: cards[0]!,
      holidayDateKeys: ["2026-06-03"],
      todayDateKey: "2026-06-10",
      vacationDateKeys: ["2026-06-04"]
    });

    assert.deepEqual(availability, {
      availableDays: 3,
      availableHours: 24
    });
  });

  it("uses today when the card has no end date", () => {
    const availability = buildNotionCardAvailableHours({
      card: cards[2]!,
      todayDateKey: "2026-06-05"
    });

    assert.deepEqual(availability, {
      availableDays: 3,
      availableHours: 24
    });
  });

  it("marks cards without a start date as unavailable", () => {
    const availability = buildNotionCardAvailableHours({
      card: {
        ...cards[0]!,
        startDate: ""
      },
      todayDateKey: "2026-06-05"
    });

    assert.equal(availability.unavailableReason, "missing_start_date");
  });
});

describe("Notion work entry allocations", () => {
  it("splits auto allocations evenly", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-a",
        source: "manual"
      },
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-c",
        source: "manual"
      }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 7, links }), [
      { ...links[0], allocatedHours: 3.5 },
      { ...links[1], allocatedHours: 3.5 }
    ]);
  });

  it("rejects manual allocations that do not match entry hours", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 2,
        allocationMode: "manual",
        notionPageId: "card-a",
        source: "manual"
      }
    ];

    assert.throws(() => allocateNotionCardHours({ entryHours: 3, links }), /allocated hours/);
  });
});

describe("Notion date normalization", () => {
  it("normalizes Notion timestamps to Korea date keys", () => {
    assert.equal(normalizeNotionDateToDateKey("2026-06-01T15:10:00.000Z"), "2026-06-02");
  });
});

describe("Notion category summary", () => {
  it("groups mapped cards by category and keeps uncategorized cards under 미분류", () => {
    const summary = buildNotionCategorySummary({
      cards: [
        { category: "Feature", estimatedHours: 10, linkedHours: 6, notionPageId: "a" },
        { category: "", estimatedHours: 4, linkedHours: 2, notionPageId: "b" }
      ]
    });

    assert.deepEqual(summary, [
      { cardCount: 1, category: "Feature", estimatedHours: 10, linkedHours: 6 },
      { cardCount: 1, category: "미분류", estimatedHours: 4, linkedHours: 2 }
    ]);
  });
});
