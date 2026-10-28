import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyEntryDraft, createVacationDay } from "@timesheet/domain";
import { findConnectedVacationDates, getVacationBoundary, updateVacationEntryForConnectedSave } from "./timesheet-vacation-utils";

test("connections cross weekends and holidays but stop at mixed-day boundaries", () => {
  const monday = createVacationDay("2026-10-26", "Leave", 4);
  const tuesday = createVacationDay("2026-10-27", "Leave", 8);
  const work = { ...createEmptyEntryDraft(1), kind: "WORK" as const };
  const mixed = { ...tuesday, entries: [...tuesday.entries, work] };
  assert.deepEqual(getVacationBoundary(mixed, "CONFIRMED", " Leave "), { startsDay: true, endsDay: false });
  assert.deepEqual(findConnectedVacationDates("2026-10-23", 1, (key) => ({ [monday.dateKey]: monday, [mixed.dateKey]: mixed })[key], () => false, "CONFIRMED", "Leave"), [monday.dateKey, mixed.dateKey]);
  assert.deepEqual(findConnectedVacationDates("2026-10-23", 1, (key) => key === tuesday.dateKey ? tuesday : undefined, (key) => key === monday.dateKey, "CONFIRMED", "Leave"), [tuesday.dateKey]);
  assert.equal(getVacationBoundary(monday, "TEMPORARY", "Leave"), null);
});

test("connected updates retain hours, exemption, other entries and the input", () => {
  const day = createVacationDay("2026-10-26", "Leave", 4, "TEMPORARY", false);
  const other = { ...day.entries[0]!, vacationStatus: "CONFIRMED" as const };
  const input = { ...day, entries: [day.entries[0]!, other] };
  const result = updateVacationEntryForConnectedSave(input, "New", " Leave ", "TEMPORARY", "CONFIRMED");
  assert.equal(result.entries[0]?.hours, 4);
  assert.equal(result.entries[0]?.vacationDeductsAllowance, false);
  assert.equal(result.entries[0]?.vacationName, "New");
  assert.equal(result.entries[1], other);
  assert.equal(input.entries[0]?.vacationName, "Leave");
});

test("backward search crosses holidays and stops after a vacation at the end of a mixed day", () => {
  const friday = createVacationDay("2026-10-23", "Leave", 4);
  const tuesday = createVacationDay("2026-10-27", "Leave", 8);
  const work = { ...createEmptyEntryDraft(0), kind: "WORK" as const };
  const mixed = { ...friday, entries: [work, ...friday.entries] };
  const days = { [mixed.dateKey]: mixed, [tuesday.dateKey]: tuesday };
  assert.deepEqual(
    findConnectedVacationDates("2026-10-28", -1, (key) => days[key], (key) => key === "2026-10-26", "CONFIRMED", "Leave"),
    [tuesday.dateKey, friday.dateKey]
  );
  const blocked = { ...mixed, entries: [...mixed.entries].reverse() };
  assert.deepEqual(findConnectedVacationDates("2026-10-26", -1, () => blocked, () => false), []);
});
