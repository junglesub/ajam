import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyDraft, createEmptyEntryDraft } from "@timesheet/domain";
import { isScheduledCleanupPending, isScheduledOverwrite, performAiCleanup, overwriteDecisionPatch, reconcileAiRequests, shouldPromptForRewrite } from "./use-timesheet-ai";

const setting = { enabled: true, apiKeySaved: true, cleanupMode: "scheduled" };
const work = { ...createEmptyEntryDraft(), clientId: "one", content: "Work" };
const day = { ...createEmptyDraft("2026-10-28"), entries: [work] };

test("queue reconciliation replaces and removes obsolete requests", () => {
  const requests = reconcileAiRequests([], [day]);
  assert.equal(requests[0]?.cleanupType, "fill_missing");
  assert.equal(reconcileAiRequests(requests, [{ ...day, aiRewriteRequested: true }])[0]?.cleanupType, "rewrite");
  assert.deepEqual(reconcileAiRequests(requests, [{ ...day, entries: [] }]), []);
});

test("rewrite and scheduled conditions respect saved content, settings and future days", () => {
  const saved = { ...day, shortVersion: "summary", entries: [{ ...work, aiTranslation: "translation" }] };
  const changed = { ...saved, entries: [{ ...saved.entries[0]!, content: "Changed" }] };
  assert.equal(shouldPromptForRewrite(setting, saved, changed), true);
  assert.equal(shouldPromptForRewrite({ ...setting, enabled: false }, saved, changed), false);
  assert.equal(isScheduledOverwrite(setting, saved, { ...changed, aiRewriteRequested: true }), true);
  assert.equal(isScheduledCleanupPending(setting, day, true, false), true);
  assert.equal(isScheduledCleanupPending(setting, day, true, true), false);
  assert.equal(isScheduledCleanupPending({ ...setting, cleanupMode: "manual" }, day, true, false), false);
});

test("cleanup skips disabled, awaits success and reports failure", async () => {
  let calls = 0;
  let resolve!: (result: { appliedDateKeys: string[]; days: typeof day[]; message: string; skipped: boolean }) => void;
  const cleanup = () => { calls++; return new Promise< { appliedDateKeys: string[]; days: typeof day[]; message: string; skipped: boolean }>((done) => { resolve = done; }); };
  assert.equal((await performAiCleanup(day.dateKey, undefined, { ...setting, enabled: false }, cleanup)).kind, "disabled");
  assert.equal(calls, 0);
  const pending = performAiCleanup(day.dateKey, { overwriteCurrentDate: true }, setting, cleanup);
  assert.equal(calls, 1);
  resolve({ appliedDateKeys: [day.dateKey], days: [day], message: "done", skipped: false });
  const outcome = await pending;
  assert.equal(outcome.kind, "result");
  if (outcome.kind === "result") assert.equal(outcome.result.days[0], day);
  const failure = await performAiCleanup(day.dateKey, undefined, setting, async () => { throw new Error("failed"); });
  assert.deepEqual(failure, { kind: "error", message: "failed" });
  const applyFailure = await performAiCleanup(day.dateKey, undefined, setting,
    async () => ({ appliedDateKeys: [], days: [day], message: "done", skipped: false }),
    () => { throw new Error("apply failed"); });
  assert.deepEqual(applyFailure, { kind: "error", message: "apply failed" });
});

test("overwrite decisions preserve current-selection revert policy", () => {
  const prompt = { field: "translation" as const, previousValue: "old", entryClientId: "old-selection" };
  assert.deepEqual(overwriteDecisionPatch(prompt, "keep"), {});
  assert.deepEqual(overwriteDecisionPatch(prompt, "revert"), { entry: { aiTranslation: "old" } });
  assert.deepEqual(overwriteDecisionPatch({ field: "summary", previousValue: "old" }, "revert"), { day: { shortVersion: "old" } });
  assert.deepEqual(overwriteDecisionPatch(prompt, "disable"), { day: { aiRewriteRequested: false } });
});
