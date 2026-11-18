import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDraft, createEmptyEntryDraft } from "@timesheet/domain";
import { executeDiscardTimesheetDraft } from "./timesheet-draft-discard";

test("executeDiscardTimesheetDraft preserves newer work and shortVersion edits made while clear is pending", async () => {
  let latestDay = {
    ...createEmptyDraft("2026-11-17"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }],
    shortVersion: "Summary old"
  };
  let isDirty = true;
  let restoredConfirmed = false;
  let tombstone: { confirmedBaselineUpdatedAt: string; revision: number } | null = null;
  let resolveClear!: (value: { confirmedUpdatedAt?: string; draftRevision?: number; status: "cleared" | "conflict" }) => void;

  const promise = executeDiscardTimesheetDraft({
    clearEditorDraftAction: () =>
      new Promise((resolve) => {
        resolveClear = resolve;
      }),
    dateKey: "2026-11-17",
    getLatestSnapshot: () => ({ dateKey: "2026-11-17", day: latestDay }),
    known: { confirmedBaselineUpdatedAt: "fp-1", revision: 2 },
    onClearedLocal: (restoreConfirmed) => {
      restoredConfirmed = restoreConfirmed;
      if (restoreConfirmed) {
        isDirty = false;
      }
    },
    onError: () => {},
    onTombstone: (t) => {
      tombstone = t;
    }
  });

  // User edits work AND shortVersion while clear is pending
  latestDay = {
    ...latestDay,
    entries: [{ ...createEmptyEntryDraft(0), content: "Work B", project: "P1" }],
    shortVersion: "Summary new"
  };

  resolveClear({ confirmedUpdatedAt: "fp-1", draftRevision: 3, status: "cleared" });
  const ok = await promise;

  assert.equal(ok, true);
  assert.equal(restoredConfirmed, false);
  assert.equal(isDirty, true);
  assert.equal(latestDay.shortVersion, "Summary new");
  assert.equal(latestDay.entries[0]?.content, "Work B");
  assert.deepEqual(tombstone, { confirmedBaselineUpdatedAt: "fp-1", revision: 3 });
});

test("executeDiscardTimesheetDraft restores confirmed day when unchanged", async () => {
  const latestDay = {
    ...createEmptyDraft("2026-11-17"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }],
    shortVersion: "Summary old"
  };
  let isDirty = true;
  let restoredConfirmed = false;

  const ok = await executeDiscardTimesheetDraft({
    clearEditorDraftAction: async () => ({ confirmedUpdatedAt: "fp-1", draftRevision: 3, status: "cleared" }),
    dateKey: "2026-11-17",
    getLatestSnapshot: () => ({ dateKey: "2026-11-17", day: latestDay }),
    known: { confirmedBaselineUpdatedAt: "fp-1", revision: 2 },
    onClearedLocal: (restoreConfirmed) => {
      restoredConfirmed = restoreConfirmed;
      if (restoreConfirmed) {
        isDirty = false;
      }
    },
    onError: () => {},
    onTombstone: () => {}
  });

  assert.equal(ok, true);
  assert.equal(restoredConfirmed, true);
  assert.equal(isDirty, false);
});
