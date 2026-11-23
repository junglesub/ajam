import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDraft, createEmptyEntryDraft } from "@timesheet/domain";
import {
  executeFlushEditorDraft,
  executeSaveCurrentWorkDraft,
  shouldScheduleWorkDraftAutosave,
  workEntriesSignature
} from "./timesheet-draft-autosave";

test("executeFlushEditorDraft serializes deferred A -> B with sequential revisions and no stuck saving", async () => {
  let latestDay = {
    ...createEmptyDraft("2026-11-17"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }]
  };
  let known: { confirmedBaselineUpdatedAt: string; revision: number } | undefined = {
    confirmedBaselineUpdatedAt: "fp-1",
    revision: 0
  };
  let draftSaveState: "error" | "idle" | "saved" | "saving" = "idle";
  const updatedAt = "2026-11-17T08:00:00.000Z";
  let isDirty = true;
  const sentCalls: Array<{ content: string; expectedRevision: number | undefined }> = [];
  let resolveA!: (value: {
    draft: { confirmedBaselineUpdatedAt: string; entries: typeof latestDay.entries; revision: number };
    status: "saved";
  }) => void;

  const runFlush = () =>
    executeFlushEditorDraft({
      dateKey: "2026-11-17",
      getEpoch: () => 0,
      getKnownDraft: () => known,
      getLatestSnapshot: () => ({ dateKey: "2026-11-17", day: latestDay }),
      getSavedDay: () => undefined,
      onDraftSaved: (snap) => {
        if (snap.revision === 2) assert.equal(snap.updatedAt, updatedAt);
        known = { confirmedBaselineUpdatedAt: snap.confirmedBaselineUpdatedAt, revision: snap.revision };
      },
      onError: () => {},
      onSettledUpToDate: (clearDirty) => {
        if (clearDirty) isDirty = false;
      },
      onStateChange: (s) => {
        draftSaveState = s;
      },
      saveEditorDraftAction: (input) => {
        sentCalls.push({
          content: input.entries[0]?.content ?? "",
          expectedRevision: input.expectedRevision
        });
        if (sentCalls.length === 1) {
          return new Promise((resolve) => {
            resolveA = resolve;
          });
        }
        return Promise.resolve({
          draft: { confirmedBaselineUpdatedAt: "fp-1", entries: input.entries, revision: 2, updatedAt },
          status: "saved" as const
        });
      }
    });

  const flushA = runFlush();

  // User types Work B while A is in flight
  const entriesA = [...latestDay.entries];
  latestDay = {
    ...latestDay,
    entries: [{ ...createEmptyEntryDraft(0), content: "Work B", project: "P1" }]
  };

  resolveA({
    draft: { confirmedBaselineUpdatedAt: "fp-1", entries: entriesA, revision: 1 },
    status: "saved"
  });
  await flushA;

  assert.equal(draftSaveState, "idle");
  assert.equal(isDirty, true);
  assert.equal(known?.revision, 1);

  // Follow-up autosave submits B with expectedRevision 1 and settles saved/clean
  await runFlush();
  assert.deepEqual(sentCalls, [
    { content: "Work A", expectedRevision: 0 },
    { content: "Work B", expectedRevision: 1 }
  ]);
  assert.equal(known?.revision, 2);
  assert.equal(draftSaveState, "saved");
  assert.equal(isDirty, false);
});

test("summary/vacation edit during pending WORK save remains dirty and blocks silent navigation", async () => {
  let latestDay = {
    ...createEmptyDraft("2026-11-17"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }],
    shortVersion: ""
  };
  let isDirty = true;
  let lastSavedWorkSignature = "";
  let draftSaveState: "error" | "idle" | "saved" | "saving" = "idle";

  const flush = () =>
    executeFlushEditorDraft({
      dateKey: "2026-11-17",
      getEpoch: () => 0,
      getKnownDraft: () => ({ confirmedBaselineUpdatedAt: "fp-1", revision: 0 }),
      getLatestSnapshot: () => ({ dateKey: "2026-11-17", day: latestDay }),
      getSavedDay: () => createEmptyDraft("2026-11-17"),
      onDraftSaved: (_snap, sig) => {
        lastSavedWorkSignature = sig;
      },
      onError: () => {},
      onSettledUpToDate: (clearDirty) => {
        if (clearDirty) isDirty = false;
      },
      onStateChange: (s) => {
        draftSaveState = s;
      },
      saveEditorDraftAction: async (input) => ({
        draft: { confirmedBaselineUpdatedAt: "fp-1", entries: input.entries, revision: 1 },
        status: "saved"
      })
    });

  // Edit shortVersion while WORK is saved
  latestDay = { ...latestDay, shortVersion: "Unsaved summary" };
  const canNavigate = await executeSaveCurrentWorkDraft({
    dateKey: "2026-11-17",
    flushEditorDraft: flush,
    getLatestSnapshot: () => ({ dateKey: "2026-11-17", day: latestDay }),
    getSavedDay: () => createEmptyDraft("2026-11-17")
  });

  assert.equal(isDirty, true);
  assert.equal(canNavigate, false);
  // Summary-only dirty state must NOT reschedule WORK autosave
  assert.equal(
    shouldScheduleWorkDraftAutosave({
      currentWorkSignature: workEntriesSignature(latestDay.entries),
      draftSaveState,
      isDirty,
      isWeekend: false,
      lastSavedWorkSignature,
      saveState: "idle",
      selectedKind: "WORK"
    }),
    false
  );
});

test("error/conflict stops automatic retry loops and work-only fully saved navigation succeeds", async () => {
  const day = {
    ...createEmptyDraft("2026-11-17"),
    entries: [{ ...createEmptyEntryDraft(0), content: "Work A", project: "P1" }]
  };
  assert.equal(
    shouldScheduleWorkDraftAutosave({
      currentWorkSignature: workEntriesSignature(day.entries),
      draftSaveState: "error",
      isDirty: true,
      isWeekend: false,
      lastSavedWorkSignature: "",
      saveState: "idle",
      selectedKind: "WORK"
    }),
    false
  );

  const canNavigate = await executeSaveCurrentWorkDraft({
    dateKey: "2026-11-17",
    flushEditorDraft: async () => true,
    getLatestSnapshot: () => ({ dateKey: "2026-11-17", day }),
    getSavedDay: () => createEmptyDraft("2026-11-17")
  });
  assert.equal(canNavigate, true);

  // Discarding clears lastSavedWorkSignature, so re-typing A schedules autosave again
  assert.equal(
    shouldScheduleWorkDraftAutosave({
      currentWorkSignature: workEntriesSignature(day.entries),
      draftSaveState: "idle",
      isDirty: true,
      isWeekend: false,
      lastSavedWorkSignature: "",
      saveState: "idle",
      selectedKind: "WORK"
    }),
    true
  );
});
