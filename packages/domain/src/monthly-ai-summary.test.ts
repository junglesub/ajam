import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMonthlyAiSummaryExport,
  buildMonthlyAiSummaryPrompt,
  buildMonthlyAiSummaryRevisionPrompt,
  getMonthlyAiSummaryPatches,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryPayload
} from "./monthly-ai-summary.js";
import type { TimesheetDayDraft } from "./timesheet.js";

const days: TimesheetDayDraft[] = [
  {
    dateKey: "2026-05-01",
    holidayName: "",
    shortVersion: "",
    entries: [
      {
        aiTranslation: "stale non-work value",
        clientId: "work-1",
        content: "로그인 화면 수정",
        holidayName: "",
        hours: 4,
        id: "work-1",
        kind: "WORK",
        project: "aJam",
        sortOrder: 0,
        vacationName: ""
      },
      {
        aiTranslation: "must be cleared",
        clientId: "vacation-1",
        content: "must be cleared",
        holidayName: "must be cleared",
        hours: 4,
        id: "vacation-1",
        kind: "VACATION",
        project: "must be cleared",
        sortOrder: 1,
        vacationName: "반차"
      }
    ]
  },
  {
    dateKey: "2026-05-05",
    holidayName: "어린이날",
    shortVersion: "",
    entries: [
      {
        aiTranslation: "must be cleared",
        clientId: "holiday-1",
        content: "must be cleared",
        holidayName: "어린이날",
        hours: 0,
        id: "holiday-1",
        kind: "HOLIDAY",
        project: "must be cleared",
        sortOrder: 0,
        vacationName: "must be cleared"
      }
    ]
  }
];

describe("monthly AI summary export", () => {
  it("builds a stable month payload with only report-relevant entry fields", () => {
    const payload = buildMonthlyAiSummaryExport({ days, month: "2026-05" });

    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.month, "2026-05");
    assert.deepEqual(payload.days[0]?.entries[0], {
      aiTranslation: "stale non-work value",
      clientId: "work-1",
      content: "로그인 화면 수정",
      holidayName: "",
      hours: 4,
      id: "work-1",
      kind: "WORK",
      project: "aJam",
      sortOrder: 0,
      vacationName: ""
    });
    assert.deepEqual(payload.days[0]?.entries[1], {
      aiTranslation: "",
      clientId: "vacation-1",
      content: "",
      holidayName: "",
      hours: 4,
      id: "vacation-1",
      kind: "VACATION",
      project: "",
      sortOrder: 1,
      vacationName: "반차"
    });
    assert.deepEqual(payload.days[1]?.entries[0], {
      aiTranslation: "",
      clientId: "holiday-1",
      content: "",
      holidayName: "어린이날",
      hours: 0,
      id: "holiday-1",
      kind: "HOLIDAY",
      project: "",
      sortOrder: 0,
      vacationName: ""
    });
  });

  it("builds prompts that include the JSON insertion markers", () => {
    assert.match(buildMonthlyAiSummaryPrompt(), /\[PASTE_JSON_HERE\]/);
    assert.match(buildMonthlyAiSummaryRevisionPrompt(), /\[WRITE_REVISION_REQUEST_HERE\]/);
    assert.match(buildMonthlyAiSummaryRevisionPrompt(), /\[PASTE_CURRENT_JSON_HERE\]/);
  });

  it("builds prompts with the required strict report guidance", () => {
    const prompt = buildMonthlyAiSummaryPrompt();
    const revisionPrompt = buildMonthlyAiSummaryRevisionPrompt();

    assert.match(prompt, /monthly work report/);
    assert.match(prompt, /If the Korean content is vague/);
    assert.match(prompt, /If a WORK entry has empty content/);
    assert.match(prompt, /Implemented user login flow/);
    assert.match(prompt, /shortVersion must be shorter/);
    assert.match(prompt, /Do not wrap the JSON in code fences/);
    assert.match(revisionPrompt, /Do not invent specific facts/);
    assert.match(revisionPrompt, /Do not include Markdown, comments, explanations, or code fences/);
  });
});

describe("monthly AI summary import validation", () => {
  it("allows only aiTranslation and shortVersion changes", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: baseline.days.map((day) =>
        day.dateKey === "2026-05-01"
          ? {
              ...day,
              shortVersion: "Updated login UI.",
              entries: day.entries.map((entry) =>
                entry.kind === "WORK" ? { ...entry, aiTranslation: "Updated the login screen." } : entry
              )
            }
          : day
      )
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });
    const patches = getMonthlyAiSummaryPatches({ baseline, imported });

    assert.deepEqual(result.errors, []);
    assert.deepEqual(patches, [
      {
        dateKey: "2026-05-01",
        entries: [{ aiTranslation: "Updated the login screen.", id: "work-1" }],
        shortVersion: "Updated login UI."
      }
    ]);
  });

  it("rejects payload-level and day-level structural changes", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      month: "2026-06",
      schemaVersion: 2 as MonthlyAiSummaryPayload["schemaVersion"],
      days: [
        {
          ...baseline.days[0]!,
          dateKey: "2026-05-02",
          holidayName: "Changed"
        }
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "schemaVersion must be 1.",
      "month must be 2026-05.",
      "days length changed.",
      "2026-05-01 is missing.",
      "2026-05-05 is missing."
    ]);
  });

  it("rejects changed immutable fields", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: [
        {
          ...baseline.days[0]!,
          entries: [
            { ...baseline.days[0]!.entries[0]!, project: "Changed Project" },
            baseline.days[0]!.entries[1]!
          ]
        },
        baseline.days[1]!
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry work-1 changed immutable field project."
    ]);
  });

  it("rejects missing entries and changed entry count", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: [
        {
          ...baseline.days[0]!,
          entries: [baseline.days[0]!.entries[1]!]
        },
        baseline.days[1]!
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entries length changed.",
      "2026-05-01 entry work-1 is missing."
    ]);
  });

  it("rejects aiTranslation and summaries on non-work entries or days", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: baseline.days.map((day) => {
        if (day.dateKey === "2026-05-01") {
          return {
            ...day,
            entries: day.entries.map((entry) =>
              entry.kind === "VACATION" ? { ...entry, aiTranslation: "Vacation." } : entry
            )
          };
        }

        return { ...day, shortVersion: "Holiday." };
      })
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry vacation-1 cannot set aiTranslation for VACATION.",
      "2026-05-05 cannot set shortVersion because it has no WORK entries."
    ]);
  });
});
