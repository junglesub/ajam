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
  buildVacationYearMetricSummary,
  buildVacationYearMetrics,
  clampVacationFillRatio,
  findConnectedVacationDateKeys,
  findConnectedVacationDateKeysInDirection,
  groupVacationRecordsByName,
  isTemporaryVacationStatus,
  normalizeVacationName
} from "./vacation-year.js";
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
    colorClass: group.colorClass,
    confirmedHours: group.confirmedHours,
    dateKeys: group.dateKeys,
    hours: group.hours,
    name: group.name
  })), [
    { colorClass: "blue", confirmedHours: 16, dateKeys: ["2026-01-05", "2026-01-06"], hours: 16, name: "연차" },
    { colorClass: "amber", confirmedHours: 4, dateKeys: ["2026-01-08"], hours: 4, name: "오전반차" },
    { colorClass: "emerald", confirmedHours: 2, dateKeys: ["2026-03-02"], hours: 2, name: "휴가" }
  ]);
});

test("groupVacationRecordsByName groups same names and marks mixed temporary groups", () => {
  const groups = groupVacationRecordsByName([
    { dateKey: "2026-01-05", hours: 8, name: "반차", status: "CONFIRMED" },
    { dateKey: "2026-01-06", hours: 8, name: "반차", status: "TEMPORARY" },
    { dateKey: "2026-01-07", hours: 4, name: "휴가", status: "TEMPORARY" }
  ]);

  assert.deepEqual(groups.map((group) => ({
    colorClass: group.colorClass,
    confirmedHours: group.confirmedHours,
    hours: group.hours,
    name: group.name,
    status: group.status,
    withTemporaryHours: group.withTemporaryHours
  })), [
    { colorClass: "blue", confirmedHours: 8, hours: 16, name: "반차", status: "TEMPORARY", withTemporaryHours: 16 },
    { colorClass: "amber", confirmedHours: 0, hours: 4, name: "휴가", status: "TEMPORARY", withTemporaryHours: 4 }
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
