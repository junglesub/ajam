import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDraft, createEmptyEntryDraft, type TimesheetDayDraft } from "@timesheet/domain";
import { applyExternalSavedDays, consumeGuardedSaveResult } from "./timesheet-draft-confirm";
import { daySignature } from "./timesheet-draft-discard";
import { sanitizeDayForSave } from "./timesheet-draft-utils";

test("applyExternalSavedDays reads latest refs and preserves dirty input typed while AI request was in flight", () => {
  let records: Record<string, TimesheetDayDraft> = {
    "2026-11-18": {
      ...createEmptyDraft("2026-11-18"),
      entries: [{ ...createEmptyEntryDraft(0), content: "Work B", project: "P1" }],
      shortVersion: "Summary new"
    }
  };
  let savedRecords: Record<string, TimesheetDayDraft> = {};
  const isDirty = true;

  // Older AI result A arrives while user has already typed Work B / Summary new
  const aiDayA = {
    ...createEmptyDraft("2026-11-18"),
    entries: [{ ...createEmptyEntryDraft(0), content: "AI A", project: "P1" }],
    shortVersion: "AI Summary A"
  };

  applyExternalSavedDays({
    days: [aiDayA],
    getIsDirty: () => isDirty,
    getSelectedDateKey: () => "2026-11-18",
    getTodayDrafts: () => ({}),
    onClearWorkSignature: () => {},
    onUpdateRecords: (updater) => {
      records = updater(records);
    },
    onUpdateSavedDateKeys: () => {},
    onUpdateSavedRecords: (updater) => {
      savedRecords = updater(savedRecords);
    }
  });

  // savedRecords updated to AI A, but records preserves Work B / Summary new
  assert.equal(savedRecords["2026-11-18"]?.shortVersion, "AI Summary A");
  assert.equal(records["2026-11-18"]?.shortVersion, "Summary new");
  assert.equal(records["2026-11-18"]?.entries[0]?.content, "Work B");
});

test("consumeGuardedSaveResult adopts canonical IDs when unchanged and preserves newer edits when dirty", () => {
  const submittedDay = {
    ...createEmptyDraft("2026-11-18"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }]
  };
  const canonicalDay = {
    ...submittedDay,
    entries: [{ ...submittedDay.entries[0]!, id: "server-id-1" }]
  };

  let adopted = false;
  let tombstone: { confirmedBaselineUpdatedAt: string; revision: number } | null = null;
  let clearedRev: number | undefined;

  // 1. Unchanged -> adopts canonical IDs
  consumeGuardedSaveResult({
    dateKey: "2026-11-18",
    expectedDraftRevision: 2,
    getLatestSnapshot: () => ({ dateKey: "2026-11-18", day: submittedDay }),
    onClearPendingDraft: (_d, rev) => {
      clearedRev = rev;
    },
    onClearWorkSignature: () => {},
    onSetTombstone: (_d, t) => {
      tombstone = t;
    },
    onUpdateConfirmedDay: (_d, _c, adopt) => {
      adopted = adopt;
    },
    result: { confirmedUpdatedAt: "fp-2", day: canonicalDay, draftRevision: 3 },
    submittedDaySignature: daySignature(submittedDay)
  });

  assert.equal(adopted, true);
  assert.equal(clearedRev, 2);
  assert.deepEqual(tombstone, { confirmedBaselineUpdatedAt: "fp-2", revision: 3 });

  // 2. Newer edit typed while pending -> preserves newer edit (adoptIntoRecords = false)
  const newerDay = {
    ...submittedDay,
    entries: [{ ...createEmptyEntryDraft(0), content: "Work B", project: "P1" }]
  };
  let adoptedAfterEdit = true;
  consumeGuardedSaveResult({
    dateKey: "2026-11-18",
    expectedDraftRevision: 3,
    getLatestSnapshot: () => ({ dateKey: "2026-11-18", day: newerDay }),
    onClearPendingDraft: () => {},
    onClearWorkSignature: () => {},
    onSetTombstone: () => {},
    onUpdateConfirmedDay: (_d, _c, adopt) => {
      adoptedAfterEdit = adopt;
    },
    result: { confirmedUpdatedAt: "fp-3", day: canonicalDay, draftRevision: 4 },
    submittedDaySignature: daySignature(submittedDay)
  });

  assert.equal(adoptedAfterEdit, false);
});

test("consumeGuardedSaveResult adopts canonical IDs when original raw day has hoursTouched=false and sanitizeDayForSave strips it", () => {
  const rawDay: TimesheetDayDraft = {
    ...createEmptyDraft("2026-11-18"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", hoursTouched: false, project: "P1" }]
  };
  const sanitized = sanitizeDayForSave(rawDay);
  assert.notEqual(daySignature(rawDay), daySignature(sanitized));

  let adopted = false;
  consumeGuardedSaveResult({
    dateKey: "2026-11-18",
    expectedDraftRevision: 0,
    getLatestSnapshot: () => ({ dateKey: "2026-11-18", day: rawDay }),
    onClearPendingDraft: () => {},
    onClearWorkSignature: () => {},
    onSetTombstone: () => {},
    onUpdateConfirmedDay: (_d, _c, adopt) => {
      adopted = adopt;
    },
    result: { confirmedUpdatedAt: "fp-2", day: sanitized, draftRevision: 1 },
    submittedDaySignature: daySignature(rawDay)
  });

  assert.equal(adopted, true);
});
