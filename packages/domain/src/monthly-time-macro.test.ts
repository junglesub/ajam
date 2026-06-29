import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMonthlyTimeMacroExport, buildMonthlyTimeMacroSteps } from "./monthly-time-macro.js";

describe("monthly time macro export", () => {
  it("groups work by project, vacation by name, and exports zero-hour holidays as 8 hours", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        {
          dateKey: "2026-06-01",
          entries: [
            { holidayName: "", hours: 4, kind: "WORK", project: "Project A", vacationName: "" },
            { holidayName: "", hours: 2, kind: "WORK", project: "Project A", vacationName: "" },
            { holidayName: "", hours: 2, kind: "WORK", project: "Project B", vacationName: "" }
          ],
          shortVersion: "June first summary"
        },
        {
          dateKey: "2026-06-02",
          entries: [{ holidayName: "", hours: 8, kind: "VACATION", project: "", vacationName: "연차" }],
          shortVersion: ""
        },
        {
          dateKey: "2026-06-03",
          entries: [{ holidayName: "선거일", hours: 0, kind: "HOLIDAY", project: "", vacationName: "" }],
          shortVersion: ""
        }
      ],
      holidays: [
        { dateKey: "2026-06-03", name: "선거일" },
        { dateKey: "2026-06-06", name: "현충일" }
      ],
      month: "2026-06"
    });

    assert.equal(exportData.daysInMonth, 30);
    assert.deepEqual(
      exportData.categories.map((category) => [category.id, category.kind, category.label]),
      [
        ["work:Project A", "work", "Project A"],
        ["work:Project B", "work", "Project B"],
        ["vacation:연차", "vacation", "연차"],
        ["holiday:공휴일", "holiday", "공휴일"]
      ]
    );
    assert.equal(exportData.categories[0]?.days.find((day) => day.dateKey === "2026-06-01")?.value, "6");
    assert.equal(exportData.categories[0]?.days.find((day) => day.dateKey === "2026-06-01")?.contentValue, "June first summary");
    assert.equal(exportData.categories[1]?.days.find((day) => day.dateKey === "2026-06-01")?.contentValue, "June first summary");
    assert.equal(exportData.categories[1]?.days.find((day) => day.dateKey === "2026-06-01")?.value, "2");
    assert.equal(exportData.categories[2]?.days.find((day) => day.dateKey === "2026-06-02")?.value, "8");
    assert.equal(exportData.categories[3]?.days.find((day) => day.dateKey === "2026-06-03")?.value, "8");
    assert.equal(exportData.categories[3]?.days.find((day) => day.dateKey === "2026-06-03")?.hours, 8);
    assert.equal(exportData.categories[3]?.days.find((day) => day.dateKey === "2026-06-06")?.value, "8");
  });

  it("uses fallback labels for blank work projects and vacation names", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        {
          dateKey: "2026-06-04",
          entries: [
            { holidayName: "", hours: 3.5, kind: "WORK", project: "  ", vacationName: "" },
            { holidayName: "", hours: 4, kind: "VACATION", project: "", vacationName: " " }
          ],
          shortVersion: ""
        }
      ],
      holidays: [],
      month: "2026-06"
    });

    assert.deepEqual(
      exportData.categories.map((category) => [category.id, category.label]),
      [
        ["work:프로젝트 없음", "프로젝트 없음"],
        ["vacation:휴가", "휴가"]
      ]
    );
    assert.equal(exportData.categories[0]?.days.find((day) => day.dateKey === "2026-06-04")?.value, "3.5");
    assert.equal(exportData.categories[1]?.days.find((day) => day.dateKey === "2026-06-04")?.value, "4");
  });

  it("does not create categories for invalid dates that look like the selected month", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        {
          dateKey: "2026-06-31",
          entries: [{ holidayName: "", hours: 8, kind: "WORK", project: "Project A", vacationName: "" }],
          shortVersion: ""
        }
      ],
      holidays: [{ dateKey: "2026-06-31", name: "Invalid holiday" }],
      month: "2026-06"
    });

    assert.deepEqual(exportData.categories, []);
  });

  it("builds focus-based macro steps with no weekend tabs and no trailing tab after the final category", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        {
          dateKey: "2026-02-02",
          entries: [{ holidayName: "", hours: 8, kind: "WORK", project: "Project A", vacationName: "" }],
          shortVersion: "Project A summary"
        },
        {
          dateKey: "2026-02-03",
          entries: [{ holidayName: "", hours: 8, kind: "WORK", project: "Project B", vacationName: "" }],
          shortVersion: "Project B summary"
        }
      ],
      holidays: [],
      month: "2026-02"
    });

    const steps = buildMonthlyTimeMacroSteps({
      categoryOrder: ["work:Project B"],
      exportData
    });

    assert.equal(steps.filter((step) => step.type === "type").length, 2);
    assert.equal(steps.filter((step) => step.type === "tab").length, 20 + 4 + 19);
    assert.deepEqual(steps.slice(0, 4), [
      { categoryId: "work:Project B", dateKey: "2026-02-02", type: "tab" },
      { categoryId: "work:Project B", dateKey: "2026-02-03", type: "type", value: "8" },
      { categoryId: "work:Project B", dateKey: "2026-02-03", type: "tab" },
      { categoryId: "work:Project B", dateKey: "2026-02-04", type: "tab" }
    ]);
    assert.deepEqual(steps.slice(21, 25), [
      { categoryId: "work:Project B", dateKey: "2026-02-27", type: "tab" },
      { categoryId: "work:Project B", dateKey: "2026-02-27", type: "tab" },
      { categoryId: "work:Project B", dateKey: "2026-02-27", type: "tab" },
      { categoryId: "work:Project B", dateKey: "2026-02-27", type: "tab" }
    ]);
    assert.equal(steps.slice(21, 25).filter((step) => step.type === "tab").length, 4);
    assert.deepEqual(
      [...new Set(steps.map((step) => step.dateKey))].filter(
        (dateKey) => dateKey === "2026-02-01" || dateKey === "2026-02-07" || dateKey === "2026-02-28"
      ),
      []
    );
    assert.equal(steps[25]?.categoryId, "work:Project A");
    assert.equal(steps[steps.length - 1]?.categoryId, "work:Project A");
    assert.equal(steps[steps.length - 1]?.dateKey, "2026-02-26");
    assert.equal(steps[steps.length - 1]?.type, "tab");
    assert.equal(steps.some((step) => step.categoryId === "work:Project A" && step.dateKey === "2026-02-27"), false);
  });
});
