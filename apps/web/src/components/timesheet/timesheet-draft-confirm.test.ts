import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDraft, createEmptyEntryDraft, type TimesheetDayDraft } from "@timesheet/domain";
import { applyExternalSavedDays, applyPreservedDraftVacationResult, consumeGuardedSaveResult } from "./timesheet-draft-confirm";
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

test("saveSelectedDraft vacation status override adopts canonical day and clears dirty when user did not edit", () => {
  const selectedDay: TimesheetDayDraft = {
    ...createEmptyDraft("2026-11-18"),
    entries: [
      {
        ...createEmptyEntryDraft(0),
        clientId: "vac-client-1",
        hours: 8,
        kind: "VACATION",
        vacationDeductsAllowance: true,
        vacationName: "연차",
        vacationStatus: "TEMPORARY"
      }
    ]
  };
  const originalSourceSig = daySignature(selectedDay);

  // Request-only override changes vacationStatus to CONFIRMED (as in saveSelectedDraft)
  const dayToSave: TimesheetDayDraft = {
    ...selectedDay,
    entries: selectedDay.entries.map((e) => ({ ...e, vacationStatus: "CONFIRMED" }))
  };
  assert.notEqual(originalSourceSig, daySignature(dayToSave));

  const canonicalDay: TimesheetDayDraft = {
    ...sanitizeDayForSave(dayToSave),
    entries: [{ ...sanitizeDayForSave(dayToSave).entries[0]!, clientId: "vac-client-1", id: "server-vac-1" }]
  };

  let records: Record<string, TimesheetDayDraft> = { "2026-11-18": selectedDay };
  let savedRecords: Record<string, TimesheetDayDraft> = {};
  let isDirty = true;
  let clearedRev: number | undefined;
  let tombstone: { confirmedBaselineUpdatedAt: string; revision: number } | null = null;

  consumeGuardedSaveResult({
    dateKey: "2026-11-18",
    expectedDraftRevision: 4,
    getLatestSnapshot: () => ({ dateKey: "2026-11-18", day: records["2026-11-18"] }),
    onClearPendingDraft: (_d, rev) => {
      clearedRev = rev;
    },
    onClearWorkSignature: () => {},
    onSetTombstone: (_d, t) => {
      tombstone = t;
    },
    onUpdateConfirmedDay: (key, canonical, adopt) => {
      savedRecords = { ...savedRecords, [key]: canonical };
      if (adopt) {
        records = { ...records, [key]: canonical };
        if (key === "2026-11-18") {
          isDirty = false;
        }
      }
    },
    result: { confirmedUpdatedAt: "fp-vac-1", day: canonicalDay, draftRevision: 5 },
    submittedDaySignature: originalSourceSig
  });

  assert.equal(isDirty, false);
  assert.equal(records["2026-11-18"]?.entries[0]?.id, "server-vac-1");
  assert.equal(records["2026-11-18"]?.entries[0]?.vacationStatus, "CONFIRMED");
  assert.equal(clearedRev, 4);
  assert.deepEqual(tombstone, { confirmedBaselineUpdatedAt: "fp-vac-1", revision: 5 });
});

test("connected/range vacation save preserves newer edits and dirty state when user edits while pending", () => {
  const sourceDay: TimesheetDayDraft = {
    ...createEmptyDraft("2026-11-19"),
    entries: [
      {
        ...createEmptyEntryDraft(0),
        clientId: "vac-2",
        hours: 4,
        kind: "VACATION",
        vacationDeductsAllowance: true,
        vacationName: "반차",
        vacationStatus: "TEMPORARY"
      }
    ],
    shortVersion: "Original summary"
  };
  const originalSnapSig = daySignature(sourceDay);

  // User types newer input on 2026-11-19 while range/connected save is pending
  const editedDay: TimesheetDayDraft = {
    ...sourceDay,
    entries: [
      ...sourceDay.entries,
      { ...createEmptyEntryDraft(1), content: "Urgent follow-up", hours: 4, project: "P1" }
    ],
    shortVersion: "Updated while saving"
  };

  let records: Record<string, TimesheetDayDraft> = {
    "2026-11-18": createEmptyDraft("2026-11-18"),
    "2026-11-19": editedDay
  };
  let savedRecords: Record<string, TimesheetDayDraft> = {};
  let isDirty = true;
  const tombstones: Record<string, { confirmedBaselineUpdatedAt: string; revision: number }> = {};

  const applyConfirm = (dateKey: string, canonicalDay: TimesheetDayDraft, submittedSig: string, rev: number) => {
    consumeGuardedSaveResult({
      dateKey,
      expectedDraftRevision: rev - 1,
      getLatestSnapshot: () => ({ dateKey: "2026-11-19", day: records["2026-11-19"] }),
      onClearPendingDraft: () => {},
      onClearWorkSignature: () => {},
      onSetTombstone: (key, t) => {
        tombstones[key] = t;
      },
      onUpdateConfirmedDay: (key, canonical, adopt) => {
        savedRecords = { ...savedRecords, [key]: canonical };
        if (adopt) {
          records = { ...records, [key]: canonical };
          if (key === "2026-11-19") {
            isDirty = false;
          }
        }
      },
      result: { confirmedUpdatedAt: `fp-${dateKey}`, day: canonicalDay, draftRevision: rev },
      submittedDaySignature: submittedSig
    });
  };

  // Date 1 (not selectedDateKey) succeeds and is adopted
  const canonicalDay1: TimesheetDayDraft = {
    ...createEmptyDraft("2026-11-18"),
    entries: [
      {
        ...createEmptyEntryDraft(0),
        hours: 8,
        id: "server-vac-18",
        kind: "VACATION",
        vacationDeductsAllowance: true,
        vacationName: "연차",
        vacationStatus: "CONFIRMED"
      }
    ]
  };
  applyConfirm("2026-11-18", canonicalDay1, daySignature(records["2026-11-18"]), 2);

  // Date 2 (selectedDateKey) was constructed from sourceDay before user's edit
  const canonicalDay2: TimesheetDayDraft = {
    ...sourceDay,
    entries: [{ ...sourceDay.entries[0]!, id: "server-vac-19", vacationStatus: "CONFIRMED" }]
  };
  applyConfirm("2026-11-19", canonicalDay2, originalSnapSig, 3);

  // Date 1 adopted; Date 2 savedRecords updated, but editor keeps newer input and dirty warning
  assert.equal(records["2026-11-18"]?.entries[0]?.id, "server-vac-18");
  assert.equal(savedRecords["2026-11-19"]?.entries[0]?.id, "server-vac-19");
  assert.equal(records["2026-11-19"]?.shortVersion, "Updated while saving");
  assert.equal(records["2026-11-19"]?.entries.length, 2);
  assert.equal(isDirty, true);
  assert.deepEqual(tombstones["2026-11-19"], { confirmedBaselineUpdatedAt: "fp-2026-11-19", revision: 3 });
});

test("applyPreservedDraftVacationResult preserves newer live edits and newer draft revision when other date becomes selected while pending", () => {
  const sourceDay: TimesheetDayDraft = {
    ...createEmptyDraft("2026-11-21"),
    entries: [
      { ...createEmptyEntryDraft(0), content: "Confirmed X", hours: 4, kind: "WORK", project: "P1" },
      { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationDeductsAllowance: true, vacationName: "연차", vacationStatus: "TEMPORARY" }
    ]
  };
  const activeDraftAtStart = {
    confirmedBaselineUpdatedAt: "fp-1",
    dateKey: "2026-11-21",
    entries: [{ ...createEmptyEntryDraft(0), content: "Draft Y1", hours: 4, kind: "WORK" as const, project: "P2" }],
    revision: 1
  };
  const newerDraft = {
    ...activeDraftAtStart,
    entries: [{ ...createEmptyEntryDraft(0), content: "Draft Y2", hours: 4, kind: "WORK" as const, project: "P2" }],
    revision: 2
  };
  const liveEditedDay: TimesheetDayDraft = {
    ...sourceDay,
    entries: [{ ...createEmptyEntryDraft(0), content: "Live Typing Y3", hours: 4, kind: "WORK", project: "P2" }],
    shortVersion: "Live summary"
  };

  let savedDay: TimesheetDayDraft | undefined;
  let updatedDraftCalled = false;
  let updatedRecordsCalled = false;

  applyPreservedDraftVacationResult({
    activeDraft: activeDraftAtStart,
    dateKey: "2026-11-21",
    getIsDirty: () => true,
    getLatestDraft: () => newerDraft,
    getLatestSnapshot: () => ({ dateKey: "2026-11-21", day: liveEditedDay }),
    onUpdateDraft: () => {
      updatedDraftCalled = true;
    },
    onUpdateRecords: () => {
      updatedRecordsCalled = true;
    },
    onUpdateSavedDay: (_key, canonical) => {
      savedDay = canonical;
    },
    result: {
      confirmedUpdatedAt: "fp-2",
      day: {
        ...sourceDay,
        entries: [sourceDay.entries[0]!, { ...sourceDay.entries[1]!, id: "server-vac-21", vacationStatus: "CONFIRMED" }]
      },
      draftRevision: 1
    },
    submittedDaySignature: daySignature(sourceDay)
  });

  assert.equal(savedDay?.entries[1]?.id, "server-vac-21");
  assert.equal(updatedDraftCalled, false, "Must not overwrite newer draft revision 2 with older revision 1");
  assert.equal(updatedRecordsCalled, false, "Must not overwrite live dirty edits on newly selected date");
});
