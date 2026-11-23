import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createVacationDay } from "@timesheet/domain";
import { CalendarView } from "./timesheet-calendar-view";
import { rowFromDraft } from "./timesheet-draft-utils";

const dateKey = "2026-10-28";
function render(vacations: ReturnType<typeof createVacationDay>["entries"]) {
  const day = { ...createVacationDay(dateKey, "휴가", 8), entries: vacations };
  const row = rowFromDraft(dateKey, dateKey, day, true);
  return renderToStaticMarkup(createElement(CalendarView, {
    celebratingDateKey: "", pendingDraftDates: new Set<string>(), rows: { [dateKey]: row }, selectedDateKey: dateKey,
    setSelectedDateKey: () => {}, todayKey: dateKey, vacationColors: {},
    weeks: [[{ dateKey, day: 28, weekday: 3 }]]
  }));
}
const entry = (hours: number, status: "CONFIRMED" | "TEMPORARY", deducts: boolean) =>
  createVacationDay(dateKey, "휴가", hours, status, deducts).entries[0]!;

test("calendar renders temporary exempt leave as outlined and hatched without a fill", () => {
  const html = render([entry(8, "TEMPORARY", false)]);
  assert.match(html, /timesheet-public-leave/);
  assert.match(html, /임시 공가/);
  assert.match(html, /temporary-vacation-hatch-background/);
  assert.doesNotMatch(html, /mask-image/);
});

test("calendar combines exempt and deducting leave while filling only deducting hours", () => {
  const html = render([entry(4, "CONFIRMED", true), entry(4, "TEMPORARY", false)]);
  assert.match(html, /임시 공가/);
  assert.match(html, /50%/);
  assert.doesNotMatch(html, /timesheet-public-leave/);
});
