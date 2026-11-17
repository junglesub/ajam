import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmptyEntryDraft } from "@timesheet/domain";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajam-today-store-test-"));
const dbPath = path.join(tempDir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;

const {
  clearTodayDraft,
  confirmTodayDraft,
  createManagedUser,
  ensureTodaySchema,
  getTodayDraft,
  prisma,
  saveTimesheetDay,
  saveTodayDraft
} = await import("./index.js");

test.after(async () => {
  await prisma.$disconnect();
  fs.rmSync(tempDir, { force: true, recursive: true });
});

test("today-store persists incomplete drafts, isolates users/dates, detects stale revisions and races, and preserves vacation on confirm", async () => {
  await ensureTodaySchema();

  const userA = await createManagedUser({
    email: "today-a@example.com",
    password: "password123",
    role: "USER",
    username: "today-a"
  });
  const userB = await createManagedUser({
    email: "today-b@example.com",
    password: "password123",
    role: "USER",
    username: "today-b"
  });

  // 1. Save incomplete draft for userA on 2026-11-17
  const entry1 = {
    ...createEmptyEntryDraft(0),
    clientId: "tab-1",
    content: "Drafting work",
    hours: 4,
    project: "Alpha"
  };
  const save1 = await saveTodayDraft({
    confirmedBaselineUpdatedAt: "",
    dateKey: "2026-11-17",
    entries: [entry1],
    expectedRevision: 0,
    userId: userA.id
  });
  assert.equal(save1.status, "saved");
  if (save1.status !== "saved") throw new Error("Expected saved");
  assert.equal(save1.draft.revision, 1);

  // 2. Restore incomplete draft & verify user/date isolation
  const loadedA = await getTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
  assert.equal(loadedA.draft?.entries.length, 1);
  assert.equal(loadedA.draft?.entries[0]?.project, "Alpha");
  assert.equal(loadedA.draft?.revision, 1);

  const loadedB = await getTodayDraft({ dateKey: "2026-11-17", userId: userB.id });
  assert.equal(loadedB.draft, null);

  const loadedOtherDate = await getTodayDraft({ dateKey: "2026-11-18", userId: userA.id });
  assert.equal(loadedOtherDate.draft, null);

  // 3. Out-of-order save (stale revision 0 when current is 1)
  const staleSave = await saveTodayDraft({
    confirmedBaselineUpdatedAt: "",
    dateKey: "2026-11-17",
    entries: [entry1],
    expectedRevision: 0,
    userId: userA.id
  });
  assert.equal(staleSave.status, "conflict");
  if (staleSave.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(staleSave.reason, "stale_revision");
  assert.equal(staleSave.currentRevision, 1);

  // 4. Existing mixed work/vacation day preservation on confirm
  await saveTimesheetDay({
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-17",
      entries: [
        {
          ...createEmptyEntryDraft(0),
          content: "Old work",
          hours: 4,
          kind: "WORK",
          project: "OldProj"
        },
        {
          ...createEmptyEntryDraft(1),
          hours: 4,
          kind: "VACATION",
          vacationName: "반차",
          vacationStatus: "CONFIRMED"
        }
      ],
      holidayName: "",
      shortVersion: ""
    },
    userId: userA.id
  });

  // 5. Save racing confirmation (baseline "" no longer matches confirmed record)
  const raceSave = await saveTodayDraft({
    confirmedBaselineUpdatedAt: "",
    dateKey: "2026-11-17",
    entries: [entry1],
    expectedRevision: 1,
    userId: userA.id
  });
  assert.equal(raceSave.status, "conflict");
  if (raceSave.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(raceSave.reason, "confirmed_changed");

  // 6. Confirm with stale baseline fails and preserves draft
  const staleConfirm = await confirmTodayDraft({
    confirmedBaselineUpdatedAt: "",
    dateKey: "2026-11-17",
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-17",
      entries: [entry1],
      holidayName: "",
      shortVersion: ""
    },
    expectedDraftRevision: 1,
    userId: userA.id
  });
  assert.equal(staleConfirm.status, "conflict");
  const stillHasDraft = await getTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
  assert.ok(stillHasDraft.draft);

  // 7. Confirm with fresh baseline succeeds, preserves VACATION, and clears draft
  const freshConfirm = await confirmTodayDraft({
    confirmedBaselineUpdatedAt: stillHasDraft.confirmedUpdatedAt,
    dateKey: "2026-11-17",
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-17",
      entries: [entry1],
      holidayName: "",
      shortVersion: ""
    },
    expectedDraftRevision: stillHasDraft.draft!.revision,
    userId: userA.id
  });
  assert.equal(freshConfirm.status, "confirmed");
  if (freshConfirm.status !== "confirmed") throw new Error("Expected confirmed");
  assert.equal(freshConfirm.day.entries.length, 2);
  assert.equal(freshConfirm.day.entries[0]?.kind, "WORK");
  assert.equal(freshConfirm.day.entries[0]?.project, "Alpha");
  assert.equal(freshConfirm.day.entries[1]?.kind, "VACATION");
  assert.equal(freshConfirm.day.entries[1]?.vacationName, "반차");

  const afterConfirm = await getTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
  assert.equal(afterConfirm.draft, null);

  // 8. ABA prevention: stale expectedRevision=1 cannot revive or overwrite after confirm
  const abaSave = await saveTodayDraft({
    confirmedBaselineUpdatedAt: freshConfirm.confirmedUpdatedAt,
    dateKey: "2026-11-17",
    entries: [entry1],
    expectedRevision: 1,
    userId: userA.id
  });
  assert.equal(abaSave.status, "conflict");
  if (abaSave.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(abaSave.reason, "stale_revision");

  // 9. Post-confirm reuse using only public return values (load -> edit -> save)
  const postConfirmLoad = await getTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
  assert.equal(postConfirmLoad.draft, null);
  const postConfirmSave = await saveTodayDraft({
    confirmedBaselineUpdatedAt: postConfirmLoad.confirmedUpdatedAt,
    dateKey: "2026-11-17",
    entries: [{ ...entry1, content: "Post-confirm edit" }],
    expectedRevision: postConfirmLoad.draftRevision,
    userId: userA.id
  });
  assert.equal(postConfirmSave.status, "saved");

  await clearTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
});
