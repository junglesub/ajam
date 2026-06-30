import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMonthlyAiSummaryExport,
  buildMonthlyAiSummaryPrompt,
  buildMonthlyAiSummaryRevisionPrompt,
  getMonthlyAiSummaryPatches,
  validateMonthlyAiSummaryBaseline,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryImportPayload,
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
        notionCards: [],
        project: "aJam",
        sortOrder: 0,
        vacationName: "",
        vacationStatus: "CONFIRMED"
      },
      {
        aiTranslation: "must be cleared",
        clientId: "vacation-1",
        content: "must be cleared",
        holidayName: "must be cleared",
        hours: 4,
        id: "vacation-1",
        kind: "VACATION",
        notionCards: [],
        project: "must be cleared",
        sortOrder: 1,
        vacationName: "반차",
        vacationStatus: "CONFIRMED"
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
        notionCards: [],
        project: "must be cleared",
        sortOrder: 0,
        vacationName: "must be cleared",
        vacationStatus: "CONFIRMED"
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
    assert.match(prompt, /Return a smaller patch JSON/);
    assert.match(prompt, /If the Korean content is vague/);
    assert.match(prompt, /If a WORK entry has empty content/);
    assert.match(prompt, /Implemented user login flow/);
    assert.match(prompt, /shortVersion must be shorter/);
    assert.match(prompt, /Do not include content, project, hours/);
    assert.match(prompt, /Do not wrap the JSON in code fences/);
    assert.match(revisionPrompt, /Do not invent specific facts/);
    assert.match(revisionPrompt, /Do not include Markdown, comments, explanations, or code fences/);
  });
});

describe("monthly AI summary import validation", () => {
  it("allows baseline snapshots with only mutable English field drift", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const current: MonthlyAiSummaryPayload = {
      ...baseline,
      days: baseline.days.map((day) =>
        day.dateKey === "2026-05-01"
          ? {
              ...day,
              shortVersion: "Already changed elsewhere.",
              entries: day.entries.map((entry) =>
                entry.kind === "WORK" ? { ...entry, aiTranslation: "Already translated elsewhere." } : entry
              )
            }
          : day
      )
    };

    const result = validateMonthlyAiSummaryBaseline({ baseline, current });

    assert.deepEqual(result.errors, []);
  });

  it("rejects baseline snapshots with structural drift", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const current: MonthlyAiSummaryPayload = {
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

    const result = validateMonthlyAiSummaryBaseline({ baseline, current });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry work-1 changed immutable field project."
    ]);
  });

  it("allows only aiTranslation and shortVersion changes", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      schemaVersion: 1,
      month: "2026-05",
      days: [
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI.",
          entries: [{ id: "work-1", aiTranslation: "Updated the login screen." }]
        }
      ]
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

  it("does not emit shortVersion patches for days without work entries", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      schemaVersion: 1,
      month: "2026-05",
      days: [
        {
          dateKey: "2026-05-05",
          shortVersion: "Holiday.",
          entries: []
        }
      ]
    };

    const patches = getMonthlyAiSummaryPatches({ baseline, imported });

    assert.deepEqual(patches, []);
  });

  it("rejects payload-level and day-level structural changes", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      month: "2026-06",
      schemaVersion: 2 as MonthlyAiSummaryImportPayload["schemaVersion"],
      days: [
        {
          dateKey: "2026-05-02",
          shortVersion: "Unknown day.",
          entries: []
        }
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "schemaVersion must be 1.",
      "month must be 2026-05.",
      "2026-05-02 is unknown."
    ]);
  });

  it("rejects duplicate days and unknown entries", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      schemaVersion: 1,
      month: "2026-05",
      days: [
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI.",
          entries: [{ id: "unknown-entry", aiTranslation: "Updated the login screen." }]
        },
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI again.",
          entries: [
            { id: "work-1", aiTranslation: "Updated the login screen." },
            { id: "work-1", aiTranslation: "Duplicate." }
          ]
        }
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry unknown-entry is unknown.",
      "2026-05-01 is duplicated."
    ]);
  });

  it("rejects duplicate entries", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      schemaVersion: 1,
      month: "2026-05",
      days: [
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI.",
          entries: [
            { id: "work-1", aiTranslation: "Updated the login screen." },
            { id: "work-1", aiTranslation: "Duplicate." }
          ]
        }
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry work-1 is duplicated."
    ]);
  });

  it("rejects unsupported fields in patch JSON", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported = {
      schemaVersion: 1,
      month: "2026-05",
      content: "must not be returned",
      days: [
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI.",
          project: "must not be returned",
          entries: [
            {
              id: "work-1",
              aiTranslation: "Updated the login screen.",
              content: "must not be returned"
            }
          ]
        }
      ]
    } as unknown as MonthlyAiSummaryImportPayload;

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "payload contains unsupported field content.",
      "2026-05-01 contains unsupported field project.",
      "2026-05-01 entry work-1 contains unsupported field content."
    ]);
  });

  it("rejects aiTranslation and summaries on non-work entries or days", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryImportPayload = {
      schemaVersion: 1,
      month: "2026-05",
      days: [
        {
          dateKey: "2026-05-01",
          shortVersion: "Updated login UI.",
          entries: [{ id: "vacation-1", aiTranslation: "Vacation." }]
        },
        {
          dateKey: "2026-05-05",
          shortVersion: "Holiday.",
          entries: [{ id: "holiday-1", aiTranslation: "Holiday." }]
        }
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry vacation-1 cannot set aiTranslation for VACATION.",
      "2026-05-05 cannot set shortVersion because it has no WORK entries.",
      "2026-05-05 entry holiday-1 cannot set aiTranslation for HOLIDAY."
    ]);
  });
});
