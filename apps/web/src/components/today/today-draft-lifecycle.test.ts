import assert from "node:assert/strict";
import test from "node:test";
import type { TodayDraftSaveResult } from "@timesheet/db";
import { allocateNotionCardHours, createEmptyEntryDraft } from "@timesheet/domain";
import { TodayDraftLifecycle, type TodayLifecycleSnapshot } from "./today-draft-lifecycle.js";

test("TodayDraftLifecycle serializes deferred autosaves, flushes before confirm, and surfaces notionSyncWarning", async () => {
  const snapshots: TodayLifecycleSnapshot[] = [];
  let resolveFirstSave!: (value: TodayDraftSaveResult) => void;
  const saveCalls: Array<{ expectedRevision: number; content: string }> = [];

  const lifecycle = new TodayDraftLifecycle(
    "2026-11-17",
    [{ ...createEmptyEntryDraft(0), clientId: "tab-1" }],
    {
      confirm: async (params) => ({
        confirmedUpdatedAt: "fp-2",
        day: {
          ...params.day,
          aiRewriteRequested: Boolean(params.day.aiRewriteRequested),
          entries: params.day.entries.map((e, i) => ({ ...e, id: `entry-${i}` }))
        },
        draftRevision: params.expectedDraftRevision + 1,
        notionSyncError: "Card A sync warning",
        status: "confirmed"
      }),
      load: async () => ({
        confirmedDay: null,
        confirmedUpdatedAt: "fp-1",
        draft: null,
        draftRevision: 0
      }),
      save: async (params) => {
        saveCalls.push({
          content: params.entries[0]?.content ?? "",
          expectedRevision: params.expectedRevision
        });
        if (saveCalls.length === 1) {
          return new Promise((resolve) => {
            resolveFirstSave = resolve;
          });
        }
        return {
          draft: {
            confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
            dateKey: params.dateKey,
            entries: params.entries,
            id: "draft-1",
            revision: params.expectedRevision + 1,
            updatedAt: "2026-11-17T00:00:00.000Z",
            userId: "u1"
          },
          status: "saved"
        };
      }
    },
    (s) => snapshots.push(s)
  );

  await lifecycle.loadDate("2026-11-17", () => "tab-1", () => ({ ...createEmptyEntryDraft(0), clientId: "tab-1" }));
  assert.equal(lifecycle.getSnapshot().loaded, true);

  // Edit A starts save A (deferred)
  lifecycle.applyLocalEdit((prev) => [{ ...prev[0]!, content: "Edit A" }]);
  const flushPromise = lifecycle.flushSave();

  // Edit B occurs while A is in flight
  lifecycle.applyLocalEdit((prev) => [{ ...prev[0]!, content: "Edit B" }]);

  // Resolve A with revision 1
  resolveFirstSave({
    draft: {
      confirmedBaselineUpdatedAt: "fp-1",
      dateKey: "2026-11-17",
      entries: [{ ...createEmptyEntryDraft(0), clientId: "tab-1", content: "Edit A" }],
      id: "draft-1",
      revision: 1,
      updatedAt: "2026-11-17T00:00:00.000Z",
      userId: "u1"
    },
    status: "saved"
  });

  const flushed = await flushPromise;
  assert.equal(flushed, true);
  assert.equal(saveCalls.length, 2);
  assert.deepEqual(saveCalls[0], { content: "Edit A", expectedRevision: 0 });
  assert.deepEqual(saveCalls[1], { content: "Edit B", expectedRevision: 1 });
  assert.equal(lifecycle.getSnapshot().revision, 2);
  assert.equal(lifecycle.getSnapshot().saveStatus, "saved");

  // Confirm flushes and surfaces notionSyncWarning
  await lifecycle.confirmDay(() => "tab-1");
  assert.equal(lifecycle.getSnapshot().confirmSuccess, "오늘 업무 기록이 확정되었습니다.");
  assert.equal(lifecycle.getSnapshot().notionSyncWarning, "Card A sync warning");
  assert.equal(lifecycle.getSnapshot().revision, 3);
});

test("TodayDraftLifecycle.confirmDay flushes dirty-immediate edit without prior flushSave", async () => {
  const saveCalls: number[] = [];
  const confirmCalls: Array<{ content: string; revision: number }> = [];

  const lifecycle = new TodayDraftLifecycle(
    "2026-11-17",
    [{ ...createEmptyEntryDraft(0), clientId: "tab-1" }],
    {
      confirm: async (params) => {
        confirmCalls.push({
          content: params.day.entries[0]?.content ?? "",
          revision: params.expectedDraftRevision
        });
        return {
          confirmedUpdatedAt: "fp-2",
          day: {
            ...params.day,
            aiRewriteRequested: false,
            entries: params.day.entries.map((e, i) => ({ ...e, id: `entry-${i}` }))
          },
          draftRevision: params.expectedDraftRevision + 1,
          notionSyncError: "",
          status: "confirmed"
        };
      },
      load: async () => ({
        confirmedDay: null,
        confirmedUpdatedAt: "fp-1",
        draft: null,
        draftRevision: 0
      }),
      save: async (params) => {
        saveCalls.push(params.expectedRevision);
        return {
          draft: {
            confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
            dateKey: params.dateKey,
            entries: params.entries,
            id: "draft-1",
            revision: params.expectedRevision + 1,
            updatedAt: "2026-11-17T00:00:00.000Z",
            userId: "u1"
          },
          status: "saved"
        };
      }
    },
    () => {}
  );

  await lifecycle.loadDate("2026-11-17", () => "tab-1", () => ({ ...createEmptyEntryDraft(0), clientId: "tab-1" }));
  lifecycle.applyLocalEdit((prev) => [{ ...prev[0]!, content: "Immediate dirty" }]);
  await lifecycle.confirmDay(() => "tab-1");

  assert.deepEqual(saveCalls, [0]);
  assert.deepEqual(confirmCalls, [{ content: "Immediate dirty", revision: 1 }]);
  assert.equal(lifecycle.getSnapshot().confirmSuccess, "오늘 업무 기록이 확정되었습니다.");
});

test("allocateNotionCardHours preserves 1h weekday_default and splits remainder across previous cards", () => {
  const allocated = allocateNotionCardHours({
    entryHours: 8,
    links: [
      { allocatedHours: 1, allocationMode: "manual", notionPageId: "w1", source: "weekday_default" },
      { allocatedHours: 0, allocationMode: "auto", notionPageId: "p1", source: "previous_business_day_default" },
      { allocatedHours: 0, allocationMode: "auto", notionPageId: "p2", source: "previous_business_day_default" }
    ]
  });
  assert.deepEqual(
    allocated.map((c) => ({ id: c.notionPageId, hours: c.allocatedHours, source: c.source })),
    [
      { id: "w1", hours: 1, source: "weekday_default" },
      { id: "p1", hours: 3.5, source: "previous_business_day_default" },
      { id: "p2", hours: 3.5, source: "previous_business_day_default" }
    ]
  );
});
