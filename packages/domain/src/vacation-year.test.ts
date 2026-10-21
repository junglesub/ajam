import assert from "node:assert/strict";
import test from "node:test";

import {
  addBusinessDays,
  addDays,
  getBusinessDateKeysUntil,
  getBusinessDateKeysInRange,
  getYearRange
} from "./date.js";
import {
  buildVacationBoundaries,
  buildVacationYearMetricSummary,
  buildVacationYearMetrics,
  clampVacationFillRatio,
  deleteVacationFromDay,
  findConnectedVacationDateKeys,
  findConnectedVacationDateKeysInDirection,
  groupVacationRecordsByName,
  isMatchingVacationEntry,
  isTemporaryVacationStatus,
  isVacationAllowanceDeducted,
  normalizeVacationColor,
  normalizeVacationName,
  replaceVacationEntries
} from "./vacation-year.js";
import { createVacationDay } from "./timesheet.js";
import type { VacationStatus } from "./status.js";

const vacationDays = [
  { dateKey: "2026-01-05", hours: 8, name: "연차", status: "CONFIRMED" as const },
  { dateKey: "2026-01-06", hours: 8, name: "연차", status: "CONFIRMED" as const },
  { dateKey: "2026-01-08", hours: 4, name: "오전반차", status: "CONFIRMED" as const },
  { dateKey: "2026-03-02", hours: 2, name: "", status: "CONFIRMED" as const }
];

test("buildVacationYearMetrics converts hours into days and ratio", () => {
  assert.deepEqual(buildVacationYearMetrics({ allowanceDays: 15, vacations: vacationDays }), {
    allowanceDays: 15,
    consumptionRatio: 0.18,
    remainingDays: 12.25,
    usedDays: 2.75,
    usedHours: 22
  });
});

test("buildVacationYearMetricSummary reports confirmed and temporary-inclusive metrics", () => {
  assert.deepEqual(
    buildVacationYearMetricSummary({
      allowanceDays: 5,
      vacations: [
        { dateKey: "2026-01-05", hours: 8, name: "연차", status: "CONFIRMED" },
        { dateKey: "2026-01-06", hours: 4, name: "반차", status: "TEMPORARY" }
      ]
    }),
    {
      confirmed: {
        allowanceDays: 5,
        consumptionRatio: 0.2,
        remainingDays: 4,
        usedDays: 1,
        usedHours: 8
      },
      withTemporary: {
        allowanceDays: 5,
        consumptionRatio: 0.3,
        remainingDays: 3.5,
        usedDays: 1.5,
        usedHours: 12
      }
    }
  );
});

test("buildVacationYearMetrics excludes vacations that do not deduct from the allowance", () => {
  const metrics = buildVacationYearMetrics({
    allowanceDays: 10,
    vacations: [
      { dateKey: "2026-01-05", hours: 8, name: "연차", status: "CONFIRMED" },
      { dateKey: "2026-01-06", deductsAllowance: false, hours: 8, name: "경조휴가", status: "CONFIRMED" },
      { dateKey: "2026-01-07", deductsAllowance: false, hours: 4, name: "생리휴가", status: "TEMPORARY" }
    ]
  });

  assert.deepEqual(metrics, {
    allowanceDays: 10,
    consumptionRatio: 0.1,
    remainingDays: 9,
    usedDays: 1,
    usedHours: 8
  });
});

test("buildVacationYearMetricSummary keeps allowance exclusion for both status views", () => {
  const summary = buildVacationYearMetricSummary({
    allowanceDays: 5,
    vacations: [
      { dateKey: "2026-01-05", hours: 8, name: "연차", status: "CONFIRMED" },
      { dateKey: "2026-01-06", deductsAllowance: false, hours: 8, name: "경조휴가", status: "CONFIRMED" },
      { dateKey: "2026-01-07", hours: 4, name: "반차", status: "TEMPORARY" },
      { dateKey: "2026-01-08", deductsAllowance: false, hours: 4, name: "생리휴가", status: "TEMPORARY" }
    ]
  });

  assert.deepEqual(summary, {
    confirmed: {
      allowanceDays: 5,
      consumptionRatio: 0.2,
      remainingDays: 4,
      usedDays: 1,
      usedHours: 8
    },
    withTemporary: {
      allowanceDays: 5,
      consumptionRatio: 0.3,
      remainingDays: 3.5,
      usedDays: 1.5,
      usedHours: 12
    }
  });
});

test("isVacationAllowanceDeducted defaults to true unless explicitly excluded", () => {
  assert.equal(isVacationAllowanceDeducted({}), true);
  assert.equal(isVacationAllowanceDeducted({ deductsAllowance: true }), true);
  assert.equal(isVacationAllowanceDeducted({ deductsAllowance: false }), false);
});

test("clampVacationFillRatio clamps display fill to 0..1 against 8 hours", () => {
  assert.equal(clampVacationFillRatio(-1), 0);
  assert.equal(clampVacationFillRatio(2), 0.25);
  assert.equal(clampVacationFillRatio(4), 0.5);
  assert.equal(clampVacationFillRatio(8), 1);
  assert.equal(clampVacationFillRatio(12), 1);
});

test("groupVacationRecordsByName groups blank names under 휴가", () => {
  const groups = groupVacationRecordsByName(vacationDays);

  assert.deepEqual(groups.map((group) => ({
    color: group.color,
    confirmedHours: group.confirmedHours,
    dateKeys: group.dateKeys,
    hours: group.hours,
    name: group.name
  })), [
    { color: "blue", confirmedHours: 16, dateKeys: ["2026-01-05", "2026-01-06"], hours: 16, name: "연차" },
    { color: "amber", confirmedHours: 4, dateKeys: ["2026-01-08"], hours: 4, name: "오전반차" },
    { color: "emerald", confirmedHours: 2, dateKeys: ["2026-03-02"], hours: 2, name: "휴가" }
  ]);
});

test("normalizeVacationColor accepts presets and normalizes six-digit hex", () => {
  assert.equal(normalizeVacationColor("blue"), "blue");
  assert.equal(normalizeVacationColor("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeVacationColor("#abc"), null);
  assert.equal(normalizeVacationColor("red"), null);
});

test("groupVacationRecordsByName reports hours that are excluded from the allowance", () => {
  const groups = groupVacationRecordsByName([
    { dateKey: "2026-01-05", hours: 8, name: "연차", status: "CONFIRMED" },
    { dateKey: "2026-01-06", deductsAllowance: false, hours: 8, name: "연차", status: "CONFIRMED" },
    { dateKey: "2026-01-07", deductsAllowance: false, hours: 4, name: "생리휴가", status: "CONFIRMED" }
  ]);

  assert.deepEqual(groups.map((group) => ({
    hours: group.hours,
    name: group.name,
    nonDeductingDays: group.nonDeductingDays,
    nonDeductingHours: group.nonDeductingHours
  })), [
    { hours: 16, name: "연차", nonDeductingDays: 1, nonDeductingHours: 8 },
    { hours: 4, name: "생리휴가", nonDeductingDays: 0.5, nonDeductingHours: 4 }
  ]);
});

test("groupVacationRecordsByName overrides only saved type colors", () => {
  const groups = groupVacationRecordsByName(vacationDays, { "연차": "#a1b2c3" });

  assert.deepEqual(groups.map(({ color, name }) => ({ color, name })), [
    { color: "#a1b2c3", name: "연차" },
    { color: "amber", name: "오전반차" },
    { color: "emerald", name: "휴가" }
  ]);
});

test("groupVacationRecordsByName groups same names and marks mixed temporary groups", () => {
  const groups = groupVacationRecordsByName([
    { dateKey: "2026-01-05", hours: 8, name: "반차", status: "CONFIRMED" },
    { dateKey: "2026-01-06", hours: 8, name: "반차", status: "TEMPORARY" },
    { dateKey: "2026-01-07", hours: 4, name: "휴가", status: "TEMPORARY" }
  ]);

  assert.deepEqual(groups.map((group) => ({
    color: group.color,
    confirmedHours: group.confirmedHours,
    hours: group.hours,
    name: group.name,
    status: group.status,
    withTemporaryHours: group.withTemporaryHours
  })), [
    { color: "blue", confirmedHours: 8, hours: 16, name: "반차", status: "TEMPORARY", withTemporaryHours: 16 },
    { color: "amber", confirmedHours: 0, hours: 4, name: "휴가", status: "TEMPORARY", withTemporaryHours: 4 }
  ]);
});

test("findConnectedVacationDateKeys walks adjacent business vacations and skips holidays", () => {
  const holidayDateKeys = new Set(["2026-01-07"]);
  const vacationOnlyDateKeys = new Set(["2026-01-05", "2026-01-06", "2026-01-08", "2026-01-12"]);
  const connected = findConnectedVacationDateKeys({
    dateKey: "2026-01-06",
    isSavedHolidayDate: (dateKey) => holidayDateKeys.has(dateKey),
    isSavedVacationOnlyDate: (dateKey) => vacationOnlyDateKeys.has(dateKey)
  });

  assert.deepEqual(connected, ["2026-01-05", "2026-01-06", "2026-01-08"]);
});

test("findConnectedVacationDateKeys does not connect temporary and confirmed vacations", () => {
  const vacationStatuses: Map<string, VacationStatus> = new Map([
    ["2026-01-05", "CONFIRMED"],
    ["2026-01-06", "CONFIRMED"],
    ["2026-01-07", "TEMPORARY"],
    ["2026-01-08", "TEMPORARY"],
    ["2026-01-09", "CONFIRMED"]
  ]);
  const vacationOnlyDateKeys = new Set(vacationStatuses.keys());
  const connectedConfirmed = findConnectedVacationDateKeys({
    dateKey: "2026-01-06",
    getVacationStatus: (dateKey) => vacationStatuses.get(dateKey),
    isSavedHolidayDate: () => false,
    isSavedVacationOnlyDate: (dateKey) => vacationOnlyDateKeys.has(dateKey)
  });
  const connectedTemporary = findConnectedVacationDateKeys({
    dateKey: "2026-01-07",
    getVacationStatus: (dateKey) => vacationStatuses.get(dateKey),
    isSavedHolidayDate: () => false,
    isSavedVacationOnlyDate: (dateKey) => vacationOnlyDateKeys.has(dateKey)
  });

  assert.deepEqual(connectedConfirmed, ["2026-01-05", "2026-01-06"]);
  assert.deepEqual(connectedTemporary, ["2026-01-07", "2026-01-08"]);
});

test("findConnectedVacationDateKeysInDirection preserves directional walk order", () => {
  const vacationOnlyDateKeys = new Set(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]);
  const isSavedVacationOnlyDate = (dateKey: string) => vacationOnlyDateKeys.has(dateKey);

  assert.deepEqual(
    findConnectedVacationDateKeysInDirection({
      dateKey: "2026-01-07",
      direction: -1,
      isSavedHolidayDate: () => false,
      isSavedVacationOnlyDate
    }),
    ["2026-01-06", "2026-01-05"]
  );
  assert.deepEqual(
    findConnectedVacationDateKeysInDirection({
      dateKey: "2026-01-07",
      direction: 1,
      isSavedHolidayDate: () => false,
      isSavedVacationOnlyDate
    }),
    ["2026-01-08"]
  );
});

test("findConnectedVacationDateKeys does not group non-adjacent same-name vacations", () => {
  const vacationOnlyDateKeys = new Set(["2026-01-05", "2026-01-12"]);
  const connected = findConnectedVacationDateKeys({
    dateKey: "2026-01-05",
    isSavedHolidayDate: () => false,
    isSavedVacationOnlyDate: (dateKey) => vacationOnlyDateKeys.has(dateKey)
  });

  assert.deepEqual(connected, ["2026-01-05"]);
});

test("findConnectedVacationDateKeys ignores saved vacation dates that are not vacation-only", () => {
  const vacationOnlyDateKeys = new Set(["2026-01-05"]);
  const connected = findConnectedVacationDateKeys({
    dateKey: "2026-01-06",
    isSavedHolidayDate: () => false,
    isSavedVacationOnlyDate: (dateKey) => vacationOnlyDateKeys.has(dateKey)
  });

  assert.deepEqual(connected, ["2026-01-05"]);
});

test("addDays moves dates by the specified number of days", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("addBusinessDays skips weekends", () => {
  assert.equal(addBusinessDays("2026-01-10", 1), "2026-01-12");
  assert.equal(addBusinessDays("2026-01-11", 1), "2026-01-12");
  assert.equal(addBusinessDays("2026-01-12", -1), "2026-01-09");
  assert.equal(addBusinessDays("2026-01-10", -1), "2026-01-09");
});

test("getBusinessDateKeysInRange uses business days and supports reversed dates", () => {
  assert.deepEqual(
    getBusinessDateKeysInRange("2026-01-12", "2026-01-05"),
    ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-12"]
  );
});

test("getBusinessDateKeysUntil compares against date values", () => {
  assert.deepEqual(
    getBusinessDateKeysUntil(2026, 0, "2026-01-10"),
    ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]
  );
});

test("getYearRange returns start and end keys", () => {
  assert.deepEqual(getYearRange(2026), {
    endDateKey: "2026-12-31",
    startDateKey: "2026-01-01"
  });
});

test("normalizeVacationName defaults to 휴가 for blank labels", () => {
  assert.equal(normalizeVacationName(""), "휴가");
  assert.equal(normalizeVacationName("   "), "휴가");
  assert.equal(normalizeVacationName(" 연차 "), "연차");
});

test("temporary vacation helper uses status only", () => {
  assert.equal(isTemporaryVacationStatus("TEMPORARY"), true);
  assert.equal(isTemporaryVacationStatus("CONFIRMED"), false);
});

test("replaceVacationEntries distinguishes mixed allowance groups and preserves untouched entries", () => {
  const existingDay = {
    aiRewriteRequested: false,
    dateKey: "2026-05-15",
    entries: [
      {
        aiTranslation: "",
        clientId: "entry-1",
        content: "",
        holidayName: "",
        hours: 4,
        id: "id-1",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 0,
        vacationDeductsAllowance: true,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      },
      {
        aiTranslation: "",
        clientId: "entry-2",
        content: "",
        holidayName: "",
        hours: 4,
        id: "id-2",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 1,
        vacationDeductsAllowance: false,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      }
    ],
    holidayName: "",
    shortVersion: ""
  };

  // Case 1: save excluded item unchanged
  const unchangedResult = replaceVacationEntries(existingDay, {
    dateKey: "2026-05-15",
    deductsAllowance: false,
    hours: 4,
    matchDeductsAllowance: false,
    matchName: "연차",
    matchStatus: "CONFIRMED",
    name: "연차",
    status: "CONFIRMED"
  });
  assert.equal(unchangedResult.length, 2);
  assert.equal(unchangedResult[0]?.hours, 4);
  assert.equal(unchangedResult[0]?.vacationDeductsAllowance, true);
  assert.equal(unchangedResult[1]?.hours, 4);
  assert.equal(unchangedResult[1]?.vacationDeductsAllowance, false);

  // Case 2: change hours of excluded item to 2h
  const hoursResult = replaceVacationEntries(existingDay, {
    dateKey: "2026-05-15",
    deductsAllowance: false,
    hours: 2,
    matchDeductsAllowance: false,
    matchName: "연차",
    matchStatus: "CONFIRMED",
    name: "연차",
    status: "CONFIRMED"
  });
  assert.equal(hoursResult.length, 2);
  assert.equal(hoursResult[0]?.hours, 4);
  assert.equal(hoursResult[0]?.vacationDeductsAllowance, true);
  assert.equal(hoursResult[1]?.hours, 2);
  assert.equal(hoursResult[1]?.vacationDeductsAllowance, false);

  // Case 3: change deduction setting of excluded item to true
  const deductResult = replaceVacationEntries(existingDay, {
    dateKey: "2026-05-15",
    deductsAllowance: true,
    hours: 4,
    matchDeductsAllowance: false,
    matchName: "연차",
    matchStatus: "CONFIRMED",
    name: "연차",
    status: "CONFIRMED"
  });
  assert.equal(deductResult.length, 2);
  assert.equal(deductResult[0]?.hours, 4);
  assert.equal(deductResult[0]?.vacationDeductsAllowance, true);
  assert.equal(deductResult[1]?.hours, 4);
  assert.equal(deductResult[1]?.vacationDeductsAllowance, true);
});

test("isMatchingVacationEntry matches by name, status, and allowance exclusion flag", () => {
  const entry = {
    kind: "VACATION" as const,
    vacationDeductsAllowance: false,
    vacationName: "연차",
    vacationStatus: "CONFIRMED" as const
  };

  assert.equal(isMatchingVacationEntry(entry, { name: "연차", status: "CONFIRMED", deductsAllowance: false }), true);
  assert.equal(isMatchingVacationEntry(entry, { name: "연차", status: "CONFIRMED", deductsAllowance: true }), false);
  assert.equal(isMatchingVacationEntry(entry, { name: "연차", status: "CONFIRMED" }), true);
  assert.equal(isMatchingVacationEntry(entry, { name: "반차", status: "CONFIRMED", deductsAllowance: false }), false);
});

test("createVacationDay defaults allowance deduction to true and respects explicit false", () => {
  const defaultDay = createVacationDay("2026-06-01", "연차", 8);
  assert.equal(defaultDay.entries[0]?.vacationDeductsAllowance, true);

  const exemptDay = createVacationDay("2026-06-01", "리프레시", 8, "CONFIRMED", false);
  assert.equal(exemptDay.entries[0]?.vacationDeductsAllowance, false);
});

test("deleteVacationFromDay removes only target allowance group and preserves other entries", () => {
  const mixedDay = {
    aiRewriteRequested: false,
    dateKey: "2026-05-15",
    entries: [
      {
        aiTranslation: "",
        clientId: "work-1",
        content: "업무",
        holidayName: "",
        hours: 4,
        id: "w-1",
        kind: "WORK" as const,
        notionCards: [],
        project: "Proj",
        sortOrder: 0,
        vacationName: "",
        vacationStatus: "CONFIRMED" as const
      },
      {
        aiTranslation: "",
        clientId: "vac-deduct",
        content: "",
        holidayName: "",
        hours: 2,
        id: "v-1",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 1,
        vacationDeductsAllowance: true,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      },
      {
        aiTranslation: "",
        clientId: "vac-exempt",
        content: "",
        holidayName: "",
        hours: 2,
        id: "v-2",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 2,
        vacationDeductsAllowance: false,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      }
    ],
    holidayName: "",
    shortVersion: ""
  };

  // Delete only the exempt item
  const afterDeleteExempt = deleteVacationFromDay(mixedDay, {
    deductsAllowance: false,
    name: "연차",
    status: "CONFIRMED"
  });
  assert.equal(afterDeleteExempt.entries.length, 2);
  assert.equal(afterDeleteExempt.entries[0]?.kind, "WORK");
  assert.equal(afterDeleteExempt.entries[1]?.vacationDeductsAllowance, true);
  assert.equal(afterDeleteExempt.entries[1]?.hours, 2);

  // Delete only the deductible item
  const afterDeleteDeduct = deleteVacationFromDay(mixedDay, {
    deductsAllowance: true,
    name: "연차",
    status: "CONFIRMED"
  });
  assert.equal(afterDeleteDeduct.entries.length, 2);
  assert.equal(afterDeleteDeduct.entries[0]?.kind, "WORK");
  assert.equal(afterDeleteDeduct.entries[1]?.vacationDeductsAllowance, false);
  assert.equal(afterDeleteDeduct.entries[1]?.hours, 2);
});

test("buildVacationBoundaries assigns distinct boundaries to mixed allowance groups and respects order", () => {
  const timesheetDays = [
    // Tuesday: WORK(0), VACATION exempt(1), VACATION deductible(2)
    {
      aiRewriteRequested: false,
      dateKey: "2026-07-07",
      entries: [
        {
          aiTranslation: "",
          clientId: "w-0",
          content: "",
          holidayName: "",
          hours: 2,
          id: "",
          kind: "WORK" as const,
          notionCards: [],
          project: "",
          sortOrder: 0,
          vacationName: "",
          vacationStatus: "CONFIRMED" as const
        },
        {
          aiTranslation: "",
          clientId: "v-exempt",
          content: "",
          holidayName: "",
          hours: 3,
          id: "",
          kind: "VACATION" as const,
          notionCards: [],
          project: "",
          sortOrder: 1,
          vacationDeductsAllowance: false,
          vacationName: "연차",
          vacationStatus: "CONFIRMED" as const
        },
        {
          aiTranslation: "",
          clientId: "v-deduct",
          content: "",
          holidayName: "",
          hours: 3,
          id: "",
          kind: "VACATION" as const,
          notionCards: [],
          project: "",
          sortOrder: 2,
          vacationDeductsAllowance: true,
          vacationName: "연차",
          vacationStatus: "CONFIRMED" as const
        }
      ],
      holidayName: "",
      shortVersion: ""
    },
    // Wednesday: VACATION deductible(0), VACATION exempt(1) [reversed order]
    {
      aiRewriteRequested: false,
      dateKey: "2026-07-08",
      entries: [
        {
          aiTranslation: "",
          clientId: "v-w-deduct",
          content: "",
          holidayName: "",
          hours: 4,
          id: "",
          kind: "VACATION" as const,
          notionCards: [],
          project: "",
          sortOrder: 0,
          vacationDeductsAllowance: true,
          vacationName: "연차",
          vacationStatus: "CONFIRMED" as const
        },
        {
          aiTranslation: "",
          clientId: "v-w-exempt",
          content: "",
          holidayName: "",
          hours: 4,
          id: "",
          kind: "VACATION" as const,
          notionCards: [],
          project: "",
          sortOrder: 1,
          vacationDeductsAllowance: false,
          vacationName: "연차",
          vacationStatus: "CONFIRMED" as const
        }
      ],
      holidayName: "",
      shortVersion: ""
    }
  ];

  const boundaries = buildVacationBoundaries(timesheetDays, []);

  // Tuesday boundaries
  const tueExempt = boundaries.find((b) => b.dateKey === "2026-07-07" && b.deductsAllowance === false);
  const tueDeduct = boundaries.find((b) => b.dateKey === "2026-07-07" && b.deductsAllowance === true);
  assert.equal(tueExempt?.startsDay, false);
  assert.equal(tueExempt?.endsDay, false);
  assert.equal(tueDeduct?.startsDay, false);
  assert.equal(tueDeduct?.endsDay, true);

  // Wednesday boundaries: deductible is first (startsDay: true), exempt is last (endsDay: true)
  const wedDeduct = boundaries.find((b) => b.dateKey === "2026-07-08" && b.deductsAllowance === true);
  const wedExempt = boundaries.find((b) => b.dateKey === "2026-07-08" && b.deductsAllowance === false);
  assert.equal(wedDeduct?.startsDay, true);
  assert.equal(wedDeduct?.endsDay, false);
  assert.equal(wedExempt?.startsDay, false);
  assert.equal(wedExempt?.endsDay, true);
});

test("replaceVacationEntries handles reversed array order for together-save and allowance toggle", () => {
  // Day with deductible first, exempt second
  const reversedDay = {
    aiRewriteRequested: false,
    dateKey: "2026-07-07",
    entries: [
      {
        aiTranslation: "",
        clientId: "entry-deduct",
        content: "",
        holidayName: "",
        hours: 4,
        id: "id-d",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 0,
        vacationDeductsAllowance: true,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      },
      {
        aiTranslation: "",
        clientId: "entry-exempt",
        content: "",
        holidayName: "",
        hours: 4,
        id: "id-e",
        kind: "VACATION" as const,
        notionCards: [],
        project: "",
        sortOrder: 1,
        vacationDeductsAllowance: false,
        vacationName: "연차",
        vacationStatus: "CONFIRMED" as const
      }
    ],
    holidayName: "",
    shortVersion: ""
  };

  // Modify only the deductible item to TEMPORARY with preserveHours
  const togetherSaveResult = replaceVacationEntries(reversedDay, {
    dateKey: "2026-07-07",
    deductsAllowance: true,
    hours: 4,
    matchDeductsAllowance: true,
    matchName: "연차",
    matchStatus: "CONFIRMED",
    name: "연차",
    preserveHours: true,
    status: "TEMPORARY"
  });

  assert.equal(togetherSaveResult.length, 2);
  assert.equal(togetherSaveResult[0]?.vacationStatus, "TEMPORARY");
  assert.equal(togetherSaveResult[0]?.vacationDeductsAllowance, true);
  assert.equal(togetherSaveResult[0]?.hours, 4);
  // Exempt item is untouched!
  assert.equal(togetherSaveResult[1]?.vacationStatus, "CONFIRMED");
  assert.equal(togetherSaveResult[1]?.vacationDeductsAllowance, false);
  assert.equal(togetherSaveResult[1]?.hours, 4);

  // Toggle allowance: change deductible to exempt
  const toggleResult = replaceVacationEntries(reversedDay, {
    dateKey: "2026-07-07",
    deductsAllowance: false,
    hours: 4,
    matchDeductsAllowance: true,
    matchName: "연차",
    matchStatus: "CONFIRMED",
    name: "연차",
    preserveHours: true,
    status: "CONFIRMED"
  });

  assert.equal(toggleResult.length, 2);
  assert.equal(toggleResult[0]?.vacationDeductsAllowance, false);
  assert.equal(toggleResult[1]?.vacationDeductsAllowance, false);
});
