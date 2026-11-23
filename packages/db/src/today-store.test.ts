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
  confirmTimesheetFullDay,
  confirmTodayDraft,
  createManagedUser,
  ensureTodaySchema,
  getTodayDraft,
  listActiveTodayDrafts,
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
  const listed = await listActiveTodayDrafts({
    endDateKey: "2026-11-30",
    startDateKey: "2026-11-01",
    userId: userA.id
  });
  assert.deepEqual(listed.map((draft) => draft.dateKey), ["2026-11-17"]);

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

  // 10. confirmTimesheetFullDay rejects stale baseline/revision and preserves full-day edits on success
  const staleFullConfirm = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: "stale-fp",
    dateKey: "2026-11-17",
    day: {
      aiRewriteRequested: true,
      dateKey: "2026-11-17",
      entries: [
        { ...entry1, content: "Full day work", hours: 4 },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationName: "반차", vacationStatus: "CONFIRMED" }
      ],
      holidayName: "",
      shortVersion: "Full summary"
    },
    expectedDraftRevision: postConfirmSave.draft.revision,
    userId: userA.id
  });
  assert.equal(staleFullConfirm.status, "conflict");

  const validFullConfirm = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: postConfirmLoad.confirmedUpdatedAt,
    dateKey: "2026-11-17",
    day: {
      aiRewriteRequested: true,
      dateKey: "2026-11-17",
      entries: [
        { ...entry1, content: "Full day work", hours: 4 },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationName: "반차", vacationStatus: "CONFIRMED" }
      ],
      holidayName: "",
      shortVersion: "Full summary"
    },
    expectedDraftRevision: postConfirmSave.draft.revision,
    userId: userA.id
  });
  assert.equal(validFullConfirm.status, "confirmed");
  if (validFullConfirm.status !== "confirmed") throw new Error("Expected confirmed");
  assert.equal(validFullConfirm.day.shortVersion, "Full summary");
  assert.equal(validFullConfirm.day.aiRewriteRequested, true);
  assert.equal(validFullConfirm.day.entries.length, 2);

  await clearTodayDraft({ dateKey: "2026-11-17", userId: userA.id });
});

test("confirmTimesheetFullDay enforces confirmed A -> draft(A) -> confirmed B rejection, newer draft revision rejection, and full-day preservation", async () => {
  await ensureTodaySchema();
  const user = await createManagedUser({
    email: "full-confirm@example.com",
    password: "password123",
    role: "USER",
    username: "full-confirm"
  });

  // 1. Confirmed A
  await saveTimesheetDay({
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-18",
      entries: [
        { ...createEmptyEntryDraft(0), content: "Confirmed A", hours: 4, kind: "WORK", project: "P1" },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationDeductsAllowance: true, vacationName: "반차", vacationStatus: "CONFIRMED" }
      ],
      holidayName: "",
      shortVersion: "Summary A"
    },
    userId: user.id
  });

  const loadA = await getTodayDraft({ dateKey: "2026-11-18", userId: user.id });
  const fpA = loadA.confirmedUpdatedAt;

  // 2. Draft(A)
  const draftA = await saveTodayDraft({
    confirmedBaselineUpdatedAt: fpA,
    dateKey: "2026-11-18",
    entries: [{ ...createEmptyEntryDraft(0), content: "Draft A", hours: 4, kind: "WORK", project: "P1" }],
    expectedRevision: loadA.draftRevision,
    userId: user.id
  });
  assert.equal(draftA.status, "saved");
  if (draftA.status !== "saved") throw new Error("Expected saved");

  // 3. Confirmed B by another writer
  await saveTimesheetDay({
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-18",
      entries: [{ ...createEmptyEntryDraft(0), content: "Confirmed B", hours: 8, kind: "WORK", project: "P2" }],
      holidayName: "",
      shortVersion: "Summary B"
    },
    userId: user.id
  });

  // 4. Stale full save using fpA rejects and B remains
  const staleBaselineConfirm = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: fpA,
    dateKey: "2026-11-18",
    day: {
      aiRewriteRequested: true,
      dateKey: "2026-11-18",
      entries: [{ ...createEmptyEntryDraft(0), content: "Draft A", hours: 4, kind: "WORK", project: "P1" }],
      holidayName: "",
      shortVersion: "Summary Draft A"
    },
    expectedDraftRevision: draftA.draft.revision,
    userId: user.id
  });
  assert.equal(staleBaselineConfirm.status, "conflict");
  if (staleBaselineConfirm.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(staleBaselineConfirm.reason, "confirmed_changed");

  const loadB = await getTodayDraft({ dateKey: "2026-11-18", userId: user.id });
  assert.equal(loadB.confirmedDay?.shortVersion, "Summary B");

  // 5. Stale draft revision rejects and newer draft remains
  const staleRevConfirm = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: loadB.confirmedUpdatedAt,
    dateKey: "2026-11-18",
    day: {
      aiRewriteRequested: true,
      dateKey: "2026-11-18",
      entries: [{ ...createEmptyEntryDraft(0), content: "Stale rev", hours: 4, kind: "WORK", project: "P1" }],
      holidayName: "",
      shortVersion: "Stale"
    },
    expectedDraftRevision: 0,
    userId: user.id
  });
  assert.equal(staleRevConfirm.status, "conflict");
  if (staleRevConfirm.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(staleRevConfirm.reason, "stale_revision");
  assert.equal(loadB.draft?.entries[0]?.content, "Draft A");

  // 6. Successful full-day save preserves summary/non-WORK/AI, returns new fingerprint/revision, and clears draft
  const successConfirm = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: loadB.confirmedUpdatedAt,
    dateKey: "2026-11-18",
    day: {
      aiRewriteRequested: true,
      dateKey: "2026-11-18",
      entries: [
        { ...createEmptyEntryDraft(0), content: "Final Work", hours: 4, kind: "WORK", project: "P1" },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationDeductsAllowance: false, vacationName: "공가", vacationStatus: "CONFIRMED" }
      ],
      holidayName: "",
      shortVersion: "Final Summary"
    },
    expectedDraftRevision: draftA.draft.revision,
    userId: user.id
  });
  assert.equal(successConfirm.status, "confirmed");
  if (successConfirm.status !== "confirmed") throw new Error("Expected confirmed");
  assert.equal(successConfirm.day.shortVersion, "Final Summary");
  assert.equal(successConfirm.day.aiRewriteRequested, true);
  assert.equal(successConfirm.day.entries[1]?.vacationDeductsAllowance, false);
  const afterSuccess = await getTodayDraft({ dateKey: "2026-11-18", userId: user.id });
  assert.equal(afterSuccess.draft, null);
  assert.equal(afterSuccess.draftRevision, successConfirm.draftRevision);
});

test("confirmTimesheetFullDay with preserveActiveWorkDraft updates linked vacation date B without deleting pending work draft Y", async () => {
  await ensureTodaySchema();
  const user = await createManagedUser({
    email: "linked-vac@example.com",
    password: "password123",
    role: "USER",
    username: "linked-vac"
  });

  // Date A (selected): linked TEMPORARY vacation
  await saveTimesheetDay({
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-20",
      entries: [
        { ...createEmptyEntryDraft(0), hours: 8, kind: "VACATION", vacationDeductsAllowance: true, vacationName: "연차", vacationStatus: "TEMPORARY" }
      ],
      holidayName: "",
      shortVersion: ""
    },
    userId: user.id
  });

  // Date B (non-selected): confirmed work X + linked TEMPORARY vacation
  await saveTimesheetDay({
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-21",
      entries: [
        { ...createEmptyEntryDraft(0), content: "Confirmed Work X", hours: 4, kind: "WORK", project: "ProjX" },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationDeductsAllowance: true, vacationName: "연차", vacationStatus: "TEMPORARY" }
      ],
      holidayName: "",
      shortVersion: "Summary B"
    },
    userId: user.id
  });

  // Pending draft work Y saved on Date B
  const beforeB = await getTodayDraft({ dateKey: "2026-11-21", userId: user.id });
  const draftY = await saveTodayDraft({
    confirmedBaselineUpdatedAt: beforeB.confirmedUpdatedAt,
    dateKey: "2026-11-21",
    entries: [{ ...createEmptyEntryDraft(0), content: "Pending Draft Work Y", hours: 4, kind: "WORK", project: "ProjY" }],
    expectedRevision: 0,
    userId: user.id
  });
  assert.equal(draftY.status, "saved");
  if (draftY.status !== "saved") throw new Error("Expected saved");

  // Linked vacation confirmation from A updates B's vacation status to CONFIRMED using B's confirmed entries (X)
  // while preserving B's active work draft Y
  const confirmB = await confirmTimesheetFullDay({
    confirmedBaselineUpdatedAt: draftY.draft.confirmedBaselineUpdatedAt,
    dateKey: "2026-11-21",
    day: {
      aiRewriteRequested: false,
      dateKey: "2026-11-21",
      entries: [
        { ...createEmptyEntryDraft(0), content: "Confirmed Work X", hours: 4, kind: "WORK", project: "ProjX" },
        { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION", vacationDeductsAllowance: true, vacationName: "연차", vacationStatus: "CONFIRMED" }
      ],
      holidayName: "",
      shortVersion: "Summary B"
    },
    expectedDraftRevision: draftY.draft.revision,
    preserveActiveWorkDraft: true,
    userId: user.id
  });
  assert.equal(confirmB.status, "confirmed");
  if (confirmB.status !== "confirmed") throw new Error("Expected confirmed");

  // Verify B's confirmed record has Work X + CONFIRMED vacation (draft Y was NOT silently confirmed)
  const afterB = await getTodayDraft({ dateKey: "2026-11-21", userId: user.id });
  assert.equal(afterB.confirmedDay?.entries.find((e) => e.kind === "WORK")?.content, "Confirmed Work X");
  assert.equal(afterB.confirmedDay?.entries.find((e) => e.kind === "VACATION")?.vacationStatus, "CONFIRMED");

  // Verify B's pending work draft Y survived intact with updated confirmedBaselineUpdatedAt
  assert.ok(afterB.draft, "Pending work draft Y must survive linked vacation update");
  assert.equal(afterB.draft.entries[0]?.content, "Pending Draft Work Y");
  assert.equal(afterB.draft.confirmedBaselineUpdatedAt, afterB.confirmedUpdatedAt);

  // Subsequent autosave on B's draft Y succeeds using the updated baseline
  const followUpSave = await saveTodayDraft({
    confirmedBaselineUpdatedAt: afterB.draft.confirmedBaselineUpdatedAt,
    dateKey: "2026-11-21",
    entries: [{ ...createEmptyEntryDraft(0), content: "Pending Draft Work Y2", hours: 4, kind: "WORK", project: "ProjY" }],
    expectedRevision: afterB.draft.revision,
    userId: user.id
  });
  assert.equal(followUpSave.status, "saved");
});

test("confirmTimesheetFullDay with preserveActiveWorkDraft rejects concurrent confirmed work edits and never silently rebases an already-stale unseen draft", async () => {
  await ensureTodaySchema();
  const user = await createManagedUser({
    email: "linked-vac-race@example.com",
    password: "password123",
    role: "USER",
    username: "linked-vac-race"
  });

  // 1. Initial confirmed state on B: Work X1 + TEMPORARY vacation
  const sourceDayB = {
    aiRewriteRequested: false,
    dateKey: "2026-11-22",
    entries: [
      { ...createEmptyEntryDraft(0), content: "Confirmed Work X1", hours: 4, kind: "WORK" as const, project: "ProjX" },
      { ...createEmptyEntryDraft(1), hours: 4, kind: "VACATION" as const, vacationDeductsAllowance: true, vacationName: "연차", vacationStatus: "TEMPORARY" as const }
    ],
    holidayName: "",
    shortVersion: "Summary 1"
  };
  await saveTimesheetDay({ day: sourceDayB, userId: user.id });

  // Draft Y created against X1
  const loadX1 = await getTodayDraft({ dateKey: "2026-11-22", userId: user.id });
  const draftY = await saveTodayDraft({
    confirmedBaselineUpdatedAt: loadX1.confirmedUpdatedAt,
    dateKey: "2026-11-22",
    entries: [{ ...createEmptyEntryDraft(0), content: "Unseen Stale Draft Y", hours: 4, kind: "WORK", project: "ProjY" }],
    expectedRevision: 0,
    userId: user.id
  });
  assert.equal(draftY.status, "saved");

  // 2. Another session updates confirmed work on B to X2 (making draft Y stale and sourceDayB outdated)
  const confirmedDayX2 = {
    ...sourceDayB,
    entries: [
      { ...createEmptyEntryDraft(0), content: "Confirmed Work X2", hours: 4, kind: "WORK" as const, project: "ProjX" },
      sourceDayB.entries[1]!
    ]
  };
  await saveTimesheetDay({ day: confirmedDayX2, userId: user.id });

  // 3. Missing baseline with preserveActiveWorkDraft alone is rejected
  const missingBaseline = await confirmTimesheetFullDay({
    dateKey: "2026-11-22",
    day: {
      ...sourceDayB,
      entries: [sourceDayB.entries[0]!, { ...sourceDayB.entries[1]!, vacationStatus: "CONFIRMED" }]
    },
    preserveActiveWorkDraft: true,
    userId: user.id
  });
  assert.equal(missingBaseline.status, "conflict");
  if (missingBaseline.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(missingBaseline.reason, "confirmed_changed");

  // 4. Stale expectedConfirmedDay (X1) is rejected and does NOT overwrite newer confirmed work X2
  const staleSourceConfirm = await confirmTimesheetFullDay({
    dateKey: "2026-11-22",
    day: {
      ...sourceDayB,
      entries: [sourceDayB.entries[0]!, { ...sourceDayB.entries[1]!, vacationStatus: "CONFIRMED" }]
    },
    expectedConfirmedDay: sourceDayB,
    preserveActiveWorkDraft: true,
    userId: user.id
  });
  assert.equal(staleSourceConfirm.status, "conflict");
  if (staleSourceConfirm.status !== "conflict") throw new Error("Expected conflict");
  assert.equal(staleSourceConfirm.reason, "confirmed_changed");
  const afterReject = await getTodayDraft({ dateKey: "2026-11-22", userId: user.id });
  assert.equal(afterReject.confirmedDay?.entries.find((e) => e.kind === "WORK")?.content, "Confirmed Work X2");

  // A newer observed draft baseline must not authorize a request made from the older day.
  assert.ok(loadX1.confirmedDay);
  const staleSourceWithCurrentGuard = await confirmTimesheetFullDay({
    dateKey: "2026-11-22",
    day: loadX1.confirmedDay,
    expectedConfirmedDay: loadX1.confirmedDay,
    confirmedBaselineUpdatedAt: afterReject.confirmedUpdatedAt,
    expectedDraftRevision: afterReject.draftRevision,
    preserveActiveWorkDraft: true,
    userId: user.id
  });
  assert.equal(staleSourceWithCurrentGuard.status, "conflict");

  // 5. Current expectedConfirmedDay (from DB read) succeeds, preserves unseen stale draft Y, and does NOT rebase Y's stale baseline
  assert.ok(afterReject.confirmedDay);
  const currentSourceConfirm = await confirmTimesheetFullDay({
    dateKey: "2026-11-22",
    day: {
      ...afterReject.confirmedDay,
      entries: [afterReject.confirmedDay.entries[0]!, { ...afterReject.confirmedDay.entries[1]!, vacationStatus: "CONFIRMED" }]
    },
    expectedConfirmedDay: afterReject.confirmedDay,
    preserveActiveWorkDraft: true,
    userId: user.id
  });
  assert.equal(currentSourceConfirm.status, "confirmed");
  const afterUpdate = await getTodayDraft({ dateKey: "2026-11-22", userId: user.id });
  assert.equal(afterUpdate.confirmedDay?.entries.find((e) => e.kind === "WORK")?.content, "Confirmed Work X2");
  assert.equal(afterUpdate.confirmedDay?.entries.find((e) => e.kind === "VACATION")?.vacationStatus, "CONFIRMED");
  assert.ok(afterUpdate.draft, "Unseen stale draft Y must not be deleted");
  assert.equal(afterUpdate.draft.entries[0]?.content, "Unseen Stale Draft Y");
  assert.equal(
    afterUpdate.draft.confirmedBaselineUpdatedAt,
    loadX1.confirmedUpdatedAt,
    "Already-stale draft must NOT be silently rebased to the new confirmed fingerprint"
  );
  assert.notEqual(afterUpdate.draft.confirmedBaselineUpdatedAt, afterUpdate.confirmedUpdatedAt);
});
