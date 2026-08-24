import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateNotionCardHours,
  buildNotionCardAvailableHours,
  buildNotionCategorySummary,
  buildNotionCardEstimate,
  filterOpenNotionCardCandidates,
  getNotionCardWorkDateRanges,
  getNotionCardWorkDateRole,
  getSavedNotionCardDateRanges,
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

  it("keeps rounded auto allocations equal to the entry total", () => {
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
        notionPageId: "card-b",
        source: "manual"
      },
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-c",
        source: "manual"
      }
    ];
    const allocated = allocateNotionCardHours({ entryHours: 8, links });

    assert.deepEqual(
      allocated.map((link) => link.allocatedHours),
      [2.67, 2.67, 2.66]
    );
    assert.equal(allocated.reduce((sum, link) => sum + link.allocatedHours, 0), 8);
  });

  it("preserves all-manual allocations even when they do not match entry hours", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 2,
        allocationMode: "manual",
        notionPageId: "card-a",
        source: "manual"
      }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 3, links }), [
      { ...links[0], allocatedHours: 2 }
    ]);
  });

  it("preserves manual allocations and splits the remaining time across auto links", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 3,
        allocationMode: "manual",
        notionPageId: "card-a",
        source: "manual"
      },
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-b",
        source: "manual"
      },
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-c",
        source: "manual"
      }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 4, links }), [
      { ...links[0], allocatedHours: 3 },
      { ...links[1], allocatedHours: 0.5 },
      { ...links[2], allocatedHours: 0.5 }
    ]);
  });

  it("preserves manual overflow and sets auto allocations to zero", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 5,
        allocationMode: "manual",
        notionPageId: "card-a",
        source: "manual"
      },
      {
        allocatedHours: 0,
        allocationMode: "auto",
        notionPageId: "card-b",
        source: "manual"
      }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 4, links }), [
      { ...links[0], allocatedHours: 5 },
      { ...links[1], allocatedHours: 0 }
    ]);
  });

  it("normalizes manual allocation precision before storing", () => {
    const links: WorkEntryNotionCardLink[] = [
      {
        allocatedHours: 4.001,
        allocationMode: "manual",
        notionPageId: "card-a",
        source: "manual"
      },
      {
        allocatedHours: 3.999,
        allocationMode: "manual",
        notionPageId: "card-b",
        source: "manual"
      }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 8.001, links }), [
      { ...links[0], allocatedHours: 4 },
      { ...links[1], allocatedHours: 4 }
    ]);
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
        { category: "Feature, Ops", estimatedHours: 3, linkedHours: 1, notionPageId: "c" },
        { category: "", estimatedHours: 4, linkedHours: 2, notionPageId: "b" }
      ]
    });

    assert.deepEqual(summary, [
      { cardCount: 2, category: "Feature", estimatedHours: 13, linkedHours: 7 },
      { cardCount: 1, category: "미분류", estimatedHours: 4, linkedHours: 2 },
      { cardCount: 1, category: "Ops", estimatedHours: 3, linkedHours: 1 }
    ]);
  });
});

describe("Notion card work date ranges", () => {
  it("collects sorted first and last worked dates per card across days and entries", () => {
    const ranges = getNotionCardWorkDateRanges([
      {
        dateKey: "2026-06-03",
        entries: [{ kind: "WORK", notionCards: [{ notionPageId: "card-a" }] }]
      },
      {
        dateKey: "2026-06-01",
        entries: [
          { kind: "WORK", notionCards: [{ notionPageId: "card-a" }, { notionPageId: "card-b" }] }
        ]
      },
      {
        dateKey: "2026-06-02",
        entries: [{ kind: "VACATION", notionCards: [{ notionPageId: "card-c" }] }]
      },
      {
        dateKey: "2026-06-04",
        entries: [{ kind: "WORK", notionCards: [] }]
      }
    ]);

    assert.equal(ranges.size, 2);
    assert.deepEqual(ranges.get("card-a"), { firstDateKey: "2026-06-01", lastDateKey: "2026-06-03", totalDays: 2 });
    assert.deepEqual(ranges.get("card-b"), { firstDateKey: "2026-06-01", lastDateKey: "2026-06-01", totalDays: 1 });
  });

  it("ignores cards without a page id", () => {
    const ranges = getNotionCardWorkDateRanges([
      {
        dateKey: "2026-06-01",
        entries: [{ kind: "WORK", notionCards: [{ notionPageId: "" }] }]
      }
    ]);

    assert.equal(ranges.size, 0);
  });
});

describe("Notion card work date role", () => {
  const ranges = getNotionCardWorkDateRanges([
    {
      dateKey: "2026-06-02",
      entries: [{ kind: "WORK", notionCards: [{ notionPageId: "card-multi" }] }]
    },
    {
      dateKey: "2026-06-05",
      entries: [{ kind: "WORK", notionCards: [{ notionPageId: "card-multi" }] }]
    },
    {
      dateKey: "2026-06-03",
      entries: [{ kind: "WORK", notionCards: [{ notionPageId: "card-single" }] }]
    }
  ]);

  it("returns first for the earliest worked date of a multi-day card", () => {
    assert.equal(getNotionCardWorkDateRole("2026-06-02", "card-multi", ranges), "first");
  });

  it("returns last for the latest worked date of a multi-day card", () => {
    assert.equal(getNotionCardWorkDateRole("2026-06-05", "card-multi", ranges), "last");
  });

  it("returns middle for dates between first and last", () => {
    assert.equal(getNotionCardWorkDateRole("2026-06-03", "card-multi", ranges), "middle");
  });

  it("returns single when the card was worked on only that one date", () => {
    assert.equal(getNotionCardWorkDateRole("2026-06-03", "card-single", ranges), "single");
  });

  it("returns none when the card has no worked dates", () => {
    assert.equal(getNotionCardWorkDateRole("2026-06-03", "card-unknown", ranges), "none");
  });
});

describe("Saved Notion card date ranges (persisted state only)", () => {
  const monthDateKeys = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-30"];
  const listDateKeys = ["2026-06-03", "2026-06-02", "2026-06-01"];

  function savedDay(dateKey: string, notionPageIds: string[]) {
    return {
      dateKey,
      entries: [{ kind: "WORK", notionCards: notionPageIds.map((notionPageId) => ({ notionPageId })) }]
    };
  }

  it("ignores unsaved drafts: a draft with a linked card does not affect Start/End roles", () => {
    const records = { "2026-06-01": savedDay("2026-06-01", ["card-a"]) };
    void records;

    // Only persisted records are passed; the draft above never reaches this call.
    const ranges = getSavedNotionCardDateRanges({}, monthDateKeys);

    assert.equal(ranges.has("card-a"), false);
    assert.equal(getNotionCardWorkDateRole("2026-06-01", "card-a", ranges), "none");
  });

  it("reflects a successful save immediately once the record is added to persisted state", () => {
    const savedRecords = { "2026-06-01": savedDay("2026-06-01", ["card-a"]) };

    for (const dateKeys of [monthDateKeys, listDateKeys]) {
      const ranges = getSavedNotionCardDateRanges(savedRecords, dateKeys);
      assert.equal(getNotionCardWorkDateRole("2026-06-01", "card-a", ranges), "single");
    }
  });

  it("keeps using the previous persisted version while an already saved record has unsaved edits", () => {
    const savedRecords = {
      "2026-06-01": savedDay("2026-06-01", ["card-a"]),
      "2026-06-02": savedDay("2026-06-02", ["card-a"])
    };

    // Draft edit removed the card link on 2026-06-02 but was not saved,
    // so persisted state still contains both dates.
    const ranges = getSavedNotionCardDateRanges(savedRecords, monthDateKeys);

    assert.equal(getNotionCardWorkDateRole("2026-06-02", "card-a", ranges), "last");
  });

  it("leaves roles untouched when a save fails and persisted state does not change", () => {
    const beforeFailedSave = getSavedNotionCardDateRanges(
      { "2026-06-01": savedDay("2026-06-01", ["card-a"]) },
      monthDateKeys
    );

    const afterFailedSave = getSavedNotionCardDateRanges(
      { "2026-06-01": savedDay("2026-06-01", ["card-a"]) },
      monthDateKeys
    );

    assert.deepEqual(afterFailedSave, beforeFailedSave);
    assert.equal(getNotionCardWorkDateRole("2026-06-01", "card-a", afterFailedSave), "single");
  });

  it("scopes CalendarView (month keys) and ListView (list keys) ranges to their own persisted dates", () => {
    const savedRecords = {
      "2026-05-29": savedDay("2026-05-29", ["card-may"]),
      "2026-06-01": savedDay("2026-06-01", ["card-june"]),
      "2026-07-01": savedDay("2026-07-01", ["card-july"])
    };

    const calendarRanges = getSavedNotionCardDateRanges(savedRecords, monthDateKeys);
    assert.equal(calendarRanges.has("card-june"), true);
    assert.equal(calendarRanges.has("card-may"), false);
    assert.equal(calendarRanges.has("card-july"), false);

    const listViewRanges = getSavedNotionCardDateRanges(savedRecords, listDateKeys);
    assert.deepEqual(listViewRanges.get("card-june"), { firstDateKey: "2026-06-01", lastDateKey: "2026-06-01", totalDays: 1 });
    assert.equal(listViewRanges.has("card-may"), false);
  });

  it("never derives ranges from drafts even when drafts exist for the same cards", () => {
    const savedRecords = { "2026-06-01": savedDay("2026-06-01", ["card-a"]) };
    // The draft extends card-a to 2026-06-02 and adds a draft-only card,
    // but neither affects roles until saved.
    const draftRecords = {
      "2026-06-01": savedDay("2026-06-01", ["card-a", "draft-only-card"]),
      "2026-06-02": savedDay("2026-06-02", ["card-a"])
    };
    void draftRecords;

    const ranges = getSavedNotionCardDateRanges(savedRecords, monthDateKeys);

    assert.equal(ranges.has("draft-only-card"), false);
    assert.equal(getNotionCardWorkDateRole("2026-06-01", "card-a", ranges), "single");
    // The unsaved date is not part of the persisted range; "middle" renders no badge.
    assert.equal(getNotionCardWorkDateRole("2026-06-02", "card-a", ranges), "middle");
    assert.ok(!["first", "last", "single"].includes(getNotionCardWorkDateRole("2026-06-02", "card-a", ranges)));
  });
});
