import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { StoredTimesheetDay } from "./timesheet-store";

function makeSimpleVacationDay(dateKey: string, options: { deductsAllowance?: boolean } = {}): StoredTimesheetDay {
  return {
    aiRewriteRequested: false,
    dateKey,
    entries: [
      {
        aiTranslation: "",
        clientId: "vacation-entry-1",
        content: "",
        holidayName: "",
        hours: 8,
        id: "",
        kind: "VACATION",
        notionCards: [],
        project: "",
        sortOrder: 0,
        vacationDeductsAllowance: options.deductsAllowance ?? true,
        vacationName: "연차",
        vacationStatus: "CONFIRMED"
      }
    ],
    holidayName: "",
    shortVersion: ""
  };
}

test("timesheet store operations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-timesheet-store-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store, { createVacationDay, deleteVacationFromDay, replaceVacationEntries }] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./timesheet-store"),
    import("@timesheet/domain")
  ]);

  try {
    await ensureApplicationSchema();
    await store.ensureTimesheetSchema();

    await t.test("vacation deletion cleans up empty TimesheetDay rows and list skips ghost days", async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        "user-1",
        "tester",
        "hash"
      );

      await store.saveTimesheetDay({ day: makeSimpleVacationDay("2026-01-05"), userId: "user-1" });
      const withVacation = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
      assert.equal(withVacation.length, 1);
      assert.equal(withVacation[0]?.entries.length, 1);
      assert.equal(withVacation[0]?.entries[0]?.kind, "VACATION");
      assert.equal(withVacation[0]?.entries[0]?.vacationDeductsAllowance, true);
      assert.deepEqual(
        await store.listVacations({ endDateKey: "2026-01-05", startDateKey: "2026-01-05", userId: "user-1" }),
        [{ dateKey: "2026-01-05", deductsAllowance: true, hours: 8, name: "연차", status: "CONFIRMED" }]
      );

      await store.saveTimesheetDay({ day: makeSimpleVacationDay("2026-01-07", { deductsAllowance: false }), userId: "user-1" });
      assert.deepEqual(
        await store.listVacations({ endDateKey: "2026-01-07", startDateKey: "2026-01-07", userId: "user-1" }),
        [{ dateKey: "2026-01-07", deductsAllowance: false, hours: 8, name: "연차", status: "CONFIRMED" }]
      );
      const withExcludedVacation = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
      assert.equal(withExcludedVacation.find((day) => day.dateKey === "2026-01-07")?.entries[0]?.vacationDeductsAllowance, false);
      await store.saveTimesheetDay({ day: { ...makeSimpleVacationDay("2026-01-07"), entries: [] }, userId: "user-1" });

      await prisma.$executeRawUnsafe(
        `INSERT INTO "Vacation" ("id", "userId", "dateKey", "name", "hours", "status", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        "user-1",
        "2026-01-06",
        "연차",
        8,
        "CONFIRMED"
      );

      await store.saveTimesheetDay({ day: { ...makeSimpleVacationDay("2026-01-05"), entries: [] }, userId: "user-1" });
      await store.saveTimesheetDay({ day: { ...makeSimpleVacationDay("2026-01-06"), entries: [] }, userId: "user-1" });

      const afterDelete = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
      assert.deepEqual(afterDelete, []);

      const dayRows = await prisma.$queryRawUnsafe<Array<{ dateKey: string }>>(
        `SELECT "dateKey" FROM "TimesheetDay" WHERE "userId" = ? AND "dateKey" IN (?, ?)`,
        "user-1",
        "2026-01-05",
        "2026-01-06"
      );
      assert.equal(dayRows.length, 0);

      const vacationRows = await prisma.$queryRawUnsafe<Array<{ dateKey: string }>>(
        `SELECT "dateKey" FROM "Vacation" WHERE "userId" = ? AND "dateKey" IN (?, ?)`,
        "user-1",
        "2026-01-05",
        "2026-01-06"
      );
      assert.equal(vacationRows.length, 0);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
         VALUES (?, ?, ?, 'AI 요약', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        "user-1",
        "2026-01-08"
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
         VALUES (?, ?, ?, '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        "user-1",
        "2026-01-09"
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
         VALUES (?, ?, ?, '', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        "user-1",
        "2026-01-07"
      );

      const days = await store.listTimesheetEntries({ endDateKey: "2026-01-31", startDateKey: "2026-01-01", userId: "user-1" });
      assert.deepEqual(
        days.map((day) => ({ aiRewriteRequested: day.aiRewriteRequested, dateKey: day.dateKey, entries: day.entries.length, shortVersion: day.shortVersion })),
        [
          { aiRewriteRequested: false, dateKey: "2026-01-08", entries: 0, shortVersion: "AI 요약" },
          { aiRewriteRequested: true, dateKey: "2026-01-09", entries: 0, shortVersion: "" }
        ]
      );
    });

    await t.test("mixed allowance group handles unchanged save, hour edit, allowance edit, and selective deletion", async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        "user-mix",
        "tester-mix",
        "hash"
      );

      // Initial state: 4h deductible and 4h exempt on 2026-05-15
      const mixedDay: StoredTimesheetDay = {
        aiRewriteRequested: false,
        dateKey: "2026-05-15",
        entries: [
          {
            aiTranslation: "",
            clientId: "entry-deduct",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 0,
            vacationDeductsAllowance: true,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          },
          {
            aiTranslation: "",
            clientId: "entry-exempt",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 1,
            vacationDeductsAllowance: false,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: ""
      };

      await store.saveTimesheetDay({ day: mixedDay, userId: "user-mix" });

      // Verify initial group query returns 2 records
      const initialVacations = await store.listVacations({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(initialVacations.length, 2);
      assert.deepEqual(
        initialVacations.map((v) => ({ deductsAllowance: v.deductsAllowance, hours: v.hours })),
        [{ deductsAllowance: false, hours: 4 }, { deductsAllowance: true, hours: 4 }]
      );

      // 1. 그대로 저장: saving exempt item unchanged
      const [dayBeforeSave] = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      const unchangedDay: StoredTimesheetDay = {
        ...dayBeforeSave!,
        entries: replaceVacationEntries(dayBeforeSave!, {
          dateKey: "2026-05-15",
          deductsAllowance: false,
          hours: 4,
          matchDeductsAllowance: false,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          status: "CONFIRMED"
        })
      };
      await store.saveTimesheetDay({ day: unchangedDay, userId: "user-mix" });

      const afterUnchanged = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(afterUnchanged[0]?.entries.length, 2);
      assert.equal(afterUnchanged[0]?.entries.reduce((sum, e) => sum + e.hours, 0), 8);
      const unchangedVacations = await store.listVacations({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(unchangedVacations.length, 2);
      assert.deepEqual(
        unchangedVacations.map((v) => ({ deductsAllowance: v.deductsAllowance, hours: v.hours })),
        [{ deductsAllowance: false, hours: 4 }, { deductsAllowance: true, hours: 4 }]
      );

      // 2. 시간 변경: change hours of exempt item from 4h to 2h
      const [dayBeforeHours] = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      const hoursEditedDay: StoredTimesheetDay = {
        ...dayBeforeHours!,
        entries: replaceVacationEntries(dayBeforeHours!, {
          dateKey: "2026-05-15",
          deductsAllowance: false,
          hours: 2,
          matchDeductsAllowance: false,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          status: "CONFIRMED"
        })
      };
      await store.saveTimesheetDay({ day: hoursEditedDay, userId: "user-mix" });

      const afterHours = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(afterHours[0]?.entries.length, 2);
      assert.equal(afterHours[0]?.entries.reduce((sum, e) => sum + e.hours, 0), 6);
      const afterHoursVacations = await store.listVacations({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.deepEqual(
        afterHoursVacations.map((v) => ({ deductsAllowance: v.deductsAllowance, hours: v.hours })),
        [{ deductsAllowance: false, hours: 2 }, { deductsAllowance: true, hours: 4 }]
      );

      // 3. 차감 설정 변경: change deductsAllowance of exempt item from false to true
      const [dayBeforeDeduct] = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      const deductEditedDay: StoredTimesheetDay = {
        ...dayBeforeDeduct!,
        entries: replaceVacationEntries(dayBeforeDeduct!, {
          dateKey: "2026-05-15",
          deductsAllowance: true,
          hours: 4,
          matchDeductsAllowance: false,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          status: "CONFIRMED"
        })
      };
      await store.saveTimesheetDay({ day: deductEditedDay, userId: "user-mix" });

      const afterDeductVacations = await store.listVacations({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(afterDeductVacations.length, 1);
      assert.equal(afterDeductVacations[0]?.deductsAllowance, true);
      assert.equal(afterDeductVacations[0]?.hours, 8);

      // 4. 선택 삭제: restore mixed pair and delete only the exempt item
      await store.saveTimesheetDay({ day: mixedDay, userId: "user-mix" });
      const [dayBeforeDelete] = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      const deletedDay = deleteVacationFromDay(dayBeforeDelete!, { deductsAllowance: false, name: "연차", status: "CONFIRMED" });
      await store.saveTimesheetDay({ day: deletedDay, userId: "user-mix" });

      const afterDeleteEntries = await store.listTimesheetEntries({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.equal(afterDeleteEntries[0]?.entries.length, 1);
      assert.equal(afterDeleteEntries[0]?.entries[0]?.hours, 4);
      assert.equal(afterDeleteEntries[0]?.entries[0]?.vacationDeductsAllowance, true);
      const afterDeleteVacations = await store.listVacations({ endDateKey: "2026-05-15", startDateKey: "2026-05-15", userId: "user-mix" });
      assert.deepEqual(afterDeleteVacations, [{ dateKey: "2026-05-15", deductsAllowance: true, hours: 4, name: "연차", status: "CONFIRMED" }]);
    });

    await t.test("vacation range save preserves allowance exclusion on original and new dates", async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        "user-range",
        "tester-range",
        "hash"
      );

      // Initial state: 2026-06-01 has an excluded vacation
      const initialDay = createVacationDay("2026-06-01", "연차", 8, "CONFIRMED", false);
      await store.saveTimesheetDay({ day: initialDay, userId: "user-range" });

      // Range save extending 2026-06-01 to 2026-06-03:
      // Production path: user selects 2026-06-01 entry, modal captures its vacationDeductsAllowance (false),
      // and passes it into createVacationDay for all target dates.
      const selectedAllowance = initialDay.entries[0]!.vacationDeductsAllowance !== false; // false
      const rangeDates = ["2026-06-01", "2026-06-02", "2026-06-03"];
      for (const dateKey of rangeDates) {
        const day = createVacationDay(dateKey, "연차", 8, "CONFIRMED", selectedAllowance);
        await store.saveTimesheetDay({ day, userId: "user-range" });
      }

      // Verify all dates retain vacationDeductsAllowance: false
      const savedEntries = await store.listTimesheetEntries({ endDateKey: "2026-06-03", startDateKey: "2026-06-01", userId: "user-range" });
      assert.equal(savedEntries.length, 3);
      for (const savedDay of savedEntries) {
        assert.equal(savedDay.entries.length, 1);
        assert.equal(savedDay.entries[0]?.vacationDeductsAllowance, false);
        assert.equal(savedDay.entries[0]?.hours, 8);
        assert.equal(savedDay.entries[0]?.vacationName, "연차");
      }

      const vacations = await store.listVacations({ endDateKey: "2026-06-03", startDateKey: "2026-06-01", userId: "user-range" });
      assert.equal(vacations.length, 3);
      assert.deepEqual(
        vacations.map((v) => ({ dateKey: v.dateKey, deductsAllowance: v.deductsAllowance })),
        [
          { dateKey: "2026-06-01", deductsAllowance: false },
          { dateKey: "2026-06-02", deductsAllowance: false },
          { dateKey: "2026-06-03", deductsAllowance: false }
        ]
      );

      // Verify default behavior: omitting the flag defaults to true in production helper
      const defaultDay = createVacationDay("2026-06-04", "연차", 8);
      assert.equal(defaultDay.entries[0]?.vacationDeductsAllowance, true);
      await store.saveTimesheetDay({ day: defaultDay, userId: "user-range" });
      const defaultVacations = await store.listVacations({ endDateKey: "2026-06-04", startDateKey: "2026-06-04", userId: "user-range" });
      assert.equal(defaultVacations[0]?.deductsAllowance, true);
    });

    await t.test("connected save and delete preserves untouched allowance groups on neighboring dates in both array orders", async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        "user-connected",
        "tester-connected",
        "hash"
      );

      // Order 1: Tuesday has [exempt 4h, deductible 4h]
      const tuesdayOrder1: StoredTimesheetDay = {
        aiRewriteRequested: false,
        dateKey: "2026-07-07",
        entries: [
          {
            aiTranslation: "",
            clientId: "tue-exempt",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 0,
            vacationDeductsAllowance: false,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          },
          {
            aiTranslation: "",
            clientId: "tue-deduct",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 1,
            vacationDeductsAllowance: true,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: ""
      };

      // --- Order 1 Together-Delete targeting deductible group ---
      await store.saveTimesheetDay({ day: tuesdayOrder1, userId: "user-connected" });
      const tuesdayAfterDelete1 = deleteVacationFromDay(tuesdayOrder1, { deductsAllowance: true, name: "연차", status: "CONFIRMED" });
      await store.saveTimesheetDay({ day: tuesdayAfterDelete1, userId: "user-connected" });

      const vacsAfterDelete1 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterDelete1.length, 1);
      assert.equal(vacsAfterDelete1[0]?.deductsAllowance, false);
      assert.equal(vacsAfterDelete1[0]?.hours, 4);

      // --- Order 1 Together-Save targeting deductible group (change status to TEMPORARY) ---
      await store.saveTimesheetDay({ day: tuesdayOrder1, userId: "user-connected" });
      const tuesdayAfterSave1: StoredTimesheetDay = {
        ...tuesdayOrder1,
        entries: replaceVacationEntries(tuesdayOrder1, {
          dateKey: "2026-07-07",
          deductsAllowance: true,
          hours: 4,
          matchDeductsAllowance: true,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          preserveHours: true,
          status: "TEMPORARY"
        })
      };
      await store.saveTimesheetDay({ day: tuesdayAfterSave1, userId: "user-connected" });
      const vacsAfterSave1 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterSave1.length, 2);
      const exempt1 = vacsAfterSave1.find((v) => v.deductsAllowance === false);
      assert.equal(exempt1?.status, "CONFIRMED");
      assert.equal(exempt1?.hours, 4);
      const deduct1 = vacsAfterSave1.find((v) => v.deductsAllowance === true);
      assert.equal(deduct1?.status, "TEMPORARY");
      assert.equal(deduct1?.hours, 4);

      // --- Order 1 Together-Save with Allowance Toggle (change deductible to exempt) ---
      await store.saveTimesheetDay({ day: tuesdayOrder1, userId: "user-connected" });
      const tuesdayAfterToggle1: StoredTimesheetDay = {
        ...tuesdayOrder1,
        entries: replaceVacationEntries(tuesdayOrder1, {
          dateKey: "2026-07-07",
          deductsAllowance: false,
          hours: 4,
          matchDeductsAllowance: true,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          preserveHours: true,
          status: "CONFIRMED"
        })
      };
      await store.saveTimesheetDay({ day: tuesdayAfterToggle1, userId: "user-connected" });
      const vacsAfterToggle1 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterToggle1.length, 1);
      assert.equal(vacsAfterToggle1[0]?.deductsAllowance, false);
      assert.equal(vacsAfterToggle1[0]?.hours, 8);

      // Order 2: Tuesday has [deductible 4h, exempt 4h] (REVERSED order)
      const tuesdayOrder2: StoredTimesheetDay = {
        aiRewriteRequested: false,
        dateKey: "2026-07-07",
        entries: [
          {
            aiTranslation: "",
            clientId: "tue-deduct-rev",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 0,
            vacationDeductsAllowance: true,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          },
          {
            aiTranslation: "",
            clientId: "tue-exempt-rev",
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 1,
            vacationDeductsAllowance: false,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: ""
      };

      // --- Order 2 Together-Delete ---
      await store.saveTimesheetDay({ day: tuesdayOrder2, userId: "user-connected" });
      const tuesdayAfterDelete2 = deleteVacationFromDay(tuesdayOrder2, { deductsAllowance: true, name: "연차", status: "CONFIRMED" });
      await store.saveTimesheetDay({ day: tuesdayAfterDelete2, userId: "user-connected" });
      const vacsAfterDelete2 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterDelete2.length, 1);
      assert.equal(vacsAfterDelete2[0]?.deductsAllowance, false);
      assert.equal(vacsAfterDelete2[0]?.hours, 4);

      // --- Order 2 Together-Save (change status to TEMPORARY) ---
      await store.saveTimesheetDay({ day: tuesdayOrder2, userId: "user-connected" });
      const tuesdayAfterSave2: StoredTimesheetDay = {
        ...tuesdayOrder2,
        entries: replaceVacationEntries(tuesdayOrder2, {
          dateKey: "2026-07-07",
          deductsAllowance: true,
          hours: 4,
          matchDeductsAllowance: true,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          preserveHours: true,
          status: "TEMPORARY"
        })
      };
      await store.saveTimesheetDay({ day: tuesdayAfterSave2, userId: "user-connected" });
      const vacsAfterSave2 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterSave2.length, 2);
      const exempt2 = vacsAfterSave2.find((v) => v.deductsAllowance === false);
      assert.equal(exempt2?.status, "CONFIRMED");
      assert.equal(exempt2?.hours, 4);
      const deduct2 = vacsAfterSave2.find((v) => v.deductsAllowance === true);
      assert.equal(deduct2?.status, "TEMPORARY");
      assert.equal(deduct2?.hours, 4);

      // --- Order 2 Together-Save with Allowance Toggle ---
      await store.saveTimesheetDay({ day: tuesdayOrder2, userId: "user-connected" });
      const tuesdayAfterToggle2: StoredTimesheetDay = {
        ...tuesdayOrder2,
        entries: replaceVacationEntries(tuesdayOrder2, {
          dateKey: "2026-07-07",
          deductsAllowance: false,
          hours: 4,
          matchDeductsAllowance: true,
          matchName: "연차",
          matchStatus: "CONFIRMED",
          name: "연차",
          preserveHours: true,
          status: "CONFIRMED"
        })
      };
      await store.saveTimesheetDay({ day: tuesdayAfterToggle2, userId: "user-connected" });
      const vacsAfterToggle2 = await store.listVacations({ endDateKey: "2026-07-07", startDateKey: "2026-07-07", userId: "user-connected" });
      assert.equal(vacsAfterToggle2.length, 1);
      assert.equal(vacsAfterToggle2[0]?.deductsAllowance, false);
      assert.equal(vacsAfterToggle2[0]?.hours, 8);
    });
  } finally {
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
