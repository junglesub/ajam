# Month-End AI Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `AI 월말 정리` tab that exports monthly timesheet JSON, provides LLM prompts, validates pasted LLM JSON, previews changes, and applies only `aiTranslation` and `shortVersion` updates.

**Architecture:** Put JSON payload construction, prompt generation, validation, and patch extraction in `@timesheet/domain` as pure functions. The Next.js app uses server actions for authoritative month loading and saving, then a focused client workspace handles copy/paste, preview, validation feedback, and apply state.

**Tech Stack:** pnpm monorepo, Next.js App Router server actions, React 19 client component, TypeScript, Node built-in test runner for domain tests, existing `@timesheet/db`, `@timesheet/domain`, and `@timesheet/ui` packages.

---

## File Structure

- Create `packages/domain/src/monthly-ai-summary.ts`: pure types and functions for export payloads, prompts, import validation, and patches.
- Modify `packages/domain/src/index.ts`: export the new monthly AI summary API.
- Modify `packages/domain/package.json`: add a `test` script using Node's built-in test runner against compiled TypeScript output.
- Create `packages/domain/src/monthly-ai-summary.test.ts`: focused tests for payload generation and validation.
- Modify `packages/domain/tsconfig.json`: include Node test types only if needed by TypeScript.
- Create `apps/web/src/app/(app)/ai-summary/actions.ts`: authenticated server actions for loading export payloads and applying validated imports.
- Create `apps/web/src/app/(app)/ai-summary/page.tsx`: server page for the new tab.
- Create `apps/web/src/components/ai-summary/month-end-ai-summary-workspace.tsx`: client UI for month selection, prompt/export copy, import validation, preview, and apply.
- Modify `apps/web/src/app/(app)/app-nav.tsx`: add the new navigation item.
- Modify `docs/timesheet-workflow.md`: document implementation decisions and verification after code lands.

---

### Task 1: Domain Contract And Tests

**Files:**
- Create: `packages/domain/src/monthly-ai-summary.ts`
- Create: `packages/domain/src/monthly-ai-summary.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/package.json`

- [ ] **Step 1: Write the failing domain tests**

Create `packages/domain/src/monthly-ai-summary.test.ts`:

```ts
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
        aiTranslation: "",
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
      }
    ]
  },
  {
    dateKey: "2026-05-05",
    holidayName: "어린이날",
    shortVersion: "",
    entries: [
      {
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
      aiTranslation: "",
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
  });

  it("builds prompts that include the JSON insertion markers", () => {
    assert.match(buildMonthlyAiSummaryPrompt(), /\[PASTE_JSON_HERE\]/);
    assert.match(buildMonthlyAiSummaryRevisionPrompt(), /\[WRITE_REVISION_REQUEST_HERE\]/);
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

  it("rejects changed immutable fields", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: [
        {
          ...baseline.days[0]!,
          entries: [{ ...baseline.days[0]!.entries[0]!, project: "Changed Project" }]
        },
        baseline.days[1]!
      ]
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-01 entry work-1 changed immutable field project."
    ]);
  });

  it("rejects summaries on days without work entries", () => {
    const baseline = buildMonthlyAiSummaryExport({ days, month: "2026-05" });
    const imported: MonthlyAiSummaryPayload = {
      ...baseline,
      days: baseline.days.map((day) =>
        day.dateKey === "2026-05-05" ? { ...day, shortVersion: "Holiday." } : day
      )
    };

    const result = validateMonthlyAiSummaryImport({ baseline, imported });

    assert.deepEqual(result.errors, [
      "2026-05-05 cannot set shortVersion because it has no WORK entries."
    ]);
  });
});
```

- [ ] **Step 2: Add the package test script**

Modify `packages/domain/package.json`:

```json
{
  "name": "@timesheet/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "tsc --noEmit false --outDir .test-build --rootDir src && node --test .test-build/**/*.test.js",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @timesheet/domain test`

Expected: FAIL because `monthly-ai-summary.js` cannot be resolved or exported functions are missing.

- [ ] **Step 4: Implement the domain module**

Create `packages/domain/src/monthly-ai-summary.ts`:

```ts
import type { TimesheetDayDraft, TimesheetEntryDraft } from "./timesheet";

export const monthlyAiSummarySchemaVersion = 1;

export type MonthlyAiSummaryEntry = Pick<
  TimesheetEntryDraft,
  "aiTranslation" | "clientId" | "content" | "holidayName" | "hours" | "id" | "kind" | "project" | "sortOrder" | "vacationName"
>;

export type MonthlyAiSummaryDay = {
  dateKey: string;
  entries: MonthlyAiSummaryEntry[];
  holidayName: string;
  shortVersion: string;
};

export type MonthlyAiSummaryPayload = {
  days: MonthlyAiSummaryDay[];
  month: string;
  schemaVersion: typeof monthlyAiSummarySchemaVersion;
};

export type MonthlyAiSummaryPatch = {
  dateKey: string;
  entries: Array<{ aiTranslation: string; id: string }>;
  shortVersion: string;
};

export type MonthlyAiSummaryValidationResult = {
  errors: string[];
};

const immutableEntryFields = [
  "clientId",
  "content",
  "holidayName",
  "hours",
  "id",
  "kind",
  "project",
  "sortOrder",
  "vacationName"
] as const;

export function buildMonthlyAiSummaryExport(params: {
  days: TimesheetDayDraft[];
  month: string;
}): MonthlyAiSummaryPayload {
  return {
    days: params.days.map((day) => ({
      dateKey: day.dateKey,
      entries: day.entries.map(toMonthlyAiSummaryEntry),
      holidayName: day.holidayName,
      shortVersion: day.shortVersion
    })),
    month: params.month,
    schemaVersion: monthlyAiSummarySchemaVersion
  };
}

function toMonthlyAiSummaryEntry(entry: TimesheetEntryDraft): MonthlyAiSummaryEntry {
  return {
    aiTranslation: entry.kind === "WORK" ? entry.aiTranslation : "",
    clientId: entry.clientId,
    content: entry.kind === "WORK" ? entry.content : "",
    holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
    hours: entry.hours,
    id: entry.id,
    kind: entry.kind,
    project: entry.kind === "WORK" ? entry.project : "",
    sortOrder: entry.sortOrder,
    vacationName: entry.kind === "VACATION" ? entry.vacationName : ""
  };
}

export function validateMonthlyAiSummaryImport(params: {
  baseline: MonthlyAiSummaryPayload;
  imported: MonthlyAiSummaryPayload;
}): MonthlyAiSummaryValidationResult {
  const errors: string[] = [];
  const { baseline, imported } = params;

  if (imported.schemaVersion !== baseline.schemaVersion) {
    errors.push(`schemaVersion must be ${baseline.schemaVersion}.`);
  }

  if (imported.month !== baseline.month) {
    errors.push(`month must be ${baseline.month}.`);
  }

  if (imported.days.length !== baseline.days.length) {
    errors.push("days length changed.");
  }

  for (const baselineDay of baseline.days) {
    const importedDay = imported.days.find((day) => day.dateKey === baselineDay.dateKey);

    if (!importedDay) {
      errors.push(`${baselineDay.dateKey} is missing.`);
      continue;
    }

    if (importedDay.holidayName !== baselineDay.holidayName) {
      errors.push(`${baselineDay.dateKey} changed immutable field holidayName.`);
    }

    const hasWorkEntries = baselineDay.entries.some((entry) => entry.kind === "WORK");

    if (!hasWorkEntries && importedDay.shortVersion !== baselineDay.shortVersion) {
      errors.push(`${baselineDay.dateKey} cannot set shortVersion because it has no WORK entries.`);
    }

    if (importedDay.entries.length !== baselineDay.entries.length) {
      errors.push(`${baselineDay.dateKey} entries length changed.`);
      continue;
    }

    for (const baselineEntry of baselineDay.entries) {
      const entryKey = getEntryKey(baselineEntry);
      const importedEntry = importedDay.entries.find((entry) => getEntryKey(entry) === entryKey);

      if (!importedEntry) {
        errors.push(`${baselineDay.dateKey} entry ${entryKey} is missing.`);
        continue;
      }

      for (const field of immutableEntryFields) {
        if (importedEntry[field] !== baselineEntry[field]) {
          errors.push(`${baselineDay.dateKey} entry ${entryKey} changed immutable field ${field}.`);
        }
      }

      if (baselineEntry.kind !== "WORK" && importedEntry.aiTranslation !== "") {
        errors.push(`${baselineDay.dateKey} entry ${entryKey} cannot set aiTranslation for ${baselineEntry.kind}.`);
      }
    }
  }

  return { errors };
}

export function getMonthlyAiSummaryPatches(params: {
  baseline: MonthlyAiSummaryPayload;
  imported: MonthlyAiSummaryPayload;
}): MonthlyAiSummaryPatch[] {
  return params.baseline.days.flatMap((baselineDay) => {
    const importedDay = params.imported.days.find((day) => day.dateKey === baselineDay.dateKey);

    if (!importedDay) {
      return [];
    }

    const entries = baselineDay.entries
      .filter((entry) => entry.kind === "WORK")
      .flatMap((baselineEntry) => {
        const importedEntry = importedDay.entries.find((entry) => getEntryKey(entry) === getEntryKey(baselineEntry));

        if (!importedEntry || importedEntry.aiTranslation === baselineEntry.aiTranslation) {
          return [];
        }

        return [{ aiTranslation: importedEntry.aiTranslation, id: getEntryKey(baselineEntry) }];
      });

    const shortVersion = importedDay.shortVersion;
    const shortVersionChanged = shortVersion !== baselineDay.shortVersion;

    if (entries.length === 0 && !shortVersionChanged) {
      return [];
    }

    return [
      {
        dateKey: baselineDay.dateKey,
        entries,
        shortVersion: shortVersionChanged ? shortVersion : baselineDay.shortVersion
      }
    ];
  });
}

function getEntryKey(entry: Pick<MonthlyAiSummaryEntry, "clientId" | "id">): string {
  return entry.id || entry.clientId;
}

export function buildMonthlyAiSummaryPrompt(): string {
  return `You are helping me prepare a concise English monthly work report.

I will provide a JSON export of my monthly timesheet.
Return ONLY valid JSON. Do not include Markdown, comments, explanations, or extra text.

Your task:
1. Preserve the exact JSON structure.
2. Do not change any IDs, dateKey values, kind values, project names, hours, vacation entries, holiday entries, or Korean source content.
3. For each WORK entry, fill or rewrite aiTranslation in concise, natural English.
4. For each day that has one or more WORK entries, fill shortVersion with a short English summary for calendar display.
5. Keep all English suitable for a professional monthly report.
6. Keep translations brief, context-aware, and polished.
7. If the Korean content is vague, infer the most likely business meaning from the project name and nearby entries, but do not invent specific facts.
8. If a WORK entry has empty content, set aiTranslation to an empty string unless the project name alone clearly indicates the work.
9. For VACATION and HOLIDAY entries, keep aiTranslation empty and do not create a work summary from them.
10. Use past-tense or noun-phrase style consistently, such as:
    - "Implemented user login flow."
    - "Updated monthly timesheet UI."
    - "Reviewed deployment configuration."
11. shortVersion must be shorter than aiTranslation and should summarize the day, not repeat every detail.
12. If a day has multiple WORK entries, shortVersion should summarize the combined work in one concise sentence or phrase.

Output requirements:
- Return the full JSON object.
- The output must be parseable by JSON.parse.
- Keep all existing fields.
- Only modify aiTranslation and shortVersion.
- Do not wrap the JSON in code fences.

Here is the JSON export:

[PASTE_JSON_HERE]`;
}

export function buildMonthlyAiSummaryRevisionPrompt(): string {
  return `Revise the English fields in this timesheet JSON according to my instruction.

Instruction:
[WRITE_REVISION_REQUEST_HERE]

Rules:
1. Return ONLY valid JSON.
2. Preserve the exact JSON structure.
3. Do not change IDs, dateKey values, kind values, project names, hours, Korean content, vacation entries, or holiday entries.
4. Only modify aiTranslation and shortVersion.
5. Keep the English concise, professional, context-aware, and suitable for a monthly report.
6. Do not invent specific facts that are not supported by the Korean source content or project name.
7. The output must be parseable by JSON.parse.
8. Do not include Markdown, comments, explanations, or code fences.

Current JSON:

[PASTE_CURRENT_JSON_HERE]`;
}
```

- [ ] **Step 5: Export the new domain API**

Modify `packages/domain/src/index.ts` and add:

```ts
export {
  buildMonthlyAiSummaryExport,
  buildMonthlyAiSummaryPrompt,
  buildMonthlyAiSummaryRevisionPrompt,
  getMonthlyAiSummaryPatches,
  monthlyAiSummarySchemaVersion,
  validateMonthlyAiSummaryImport
} from "./monthly-ai-summary";
export type {
  MonthlyAiSummaryDay,
  MonthlyAiSummaryEntry,
  MonthlyAiSummaryPatch,
  MonthlyAiSummaryPayload,
  MonthlyAiSummaryValidationResult
} from "./monthly-ai-summary";
```

- [ ] **Step 6: Run the domain tests**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS with 5 tests passing.

- [ ] **Step 7: Remove test build output if created**

Run: `if (Test-Path -LiteralPath 'packages\domain\.test-build') { Remove-Item -Recurse -Force -LiteralPath 'packages\domain\.test-build' }`

Expected: `.test-build` is removed. If the path does not exist, no action is needed.

- [ ] **Step 8: Commit the domain contract**

```bash
git add packages/domain/package.json packages/domain/src/index.ts packages/domain/src/monthly-ai-summary.ts packages/domain/src/monthly-ai-summary.test.ts
git commit -m "feat(domain): add monthly AI summary contract"
```

---

### Task 2: Server Actions And Route

**Files:**
- Create: `apps/web/src/app/(app)/ai-summary/actions.ts`
- Create: `apps/web/src/app/(app)/ai-summary/page.tsx`
- Modify: `apps/web/src/app/(app)/app-nav.tsx`

- [ ] **Step 1: Create authenticated server actions**

Create `apps/web/src/app/(app)/ai-summary/actions.ts`:

```ts
"use server";

import {
  buildMonthlyAiSummaryExport,
  getMonthlyAiSummaryPatches,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryPayload
} from "@timesheet/domain";
import {
  getManagedUser,
  listHolidays,
  listProjects,
  listTimesheetEntries,
  listVacations,
  saveTimesheetDay,
  type StoredTimesheetDraft,
  type StoredTimesheetEntry
} from "@timesheet/db";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";

export type MonthlyAiSummaryLoadResult = {
  payload: MonthlyAiSummaryPayload;
  projects: string[];
};

export type MonthlyAiSummaryApplyResult = {
  appliedDateKeys: string[];
};

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    endDateKey: toDateKey(year, monthIndex, lastDay),
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    startDateKey: toDateKey(year, monthIndex, 1)
  };
}

async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return user;
}

function mergeLegacyVacations(entries: StoredTimesheetDraft[], vacations: Array<{ dateKey: string; hours: number; name: string }>): StoredTimesheetDraft[] {
  const days = new Map(entries.map((entry) => [entry.dateKey, { ...entry, entries: [...entry.entries] }]));

  for (const vacation of vacations) {
    const day = days.get(vacation.dateKey) ?? {
      dateKey: vacation.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: ""
    };

    if (day.entries.some((entry) => entry.kind === "VACATION")) {
      days.set(vacation.dateKey, day);
      continue;
    }

    const vacationEntry: StoredTimesheetEntry = {
      aiTranslation: "",
      clientId: `legacy-vacation-${vacation.dateKey}`,
      content: "",
      holidayName: "",
      hours: vacation.hours,
      id: "",
      kind: "VACATION",
      project: "",
      sortOrder: day.entries.length,
      vacationName: vacation.name
    };

    day.entries.push(vacationEntry);
    days.set(vacation.dateKey, day);
  }

  return Array.from(days.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

async function loadMonthlyAiSummaryDays(params: { monthIndex: number; userId: string; year: number }) {
  const range = getMonthRange(params.year, params.monthIndex);
  const [entries, holidays, projects, vacations] = await Promise.all([
    listTimesheetEntries({ endDateKey: range.endDateKey, startDateKey: range.startDateKey, userId: params.userId }),
    listHolidays({ endDateKey: range.endDateKey, startDateKey: range.startDateKey }).catch(() => []),
    listProjects({ userId: params.userId }),
    listVacations({ endDateKey: range.endDateKey, startDateKey: range.startDateKey, userId: params.userId })
  ]);

  const daysByDate = new Map(mergeLegacyVacations(entries, vacations).map((day) => [day.dateKey, day]));

  for (const holiday of holidays) {
    const day = daysByDate.get(holiday.dateKey) ?? {
      dateKey: holiday.dateKey,
      entries: [],
      holidayName: holiday.name,
      shortVersion: ""
    };

    daysByDate.set(holiday.dateKey, {
      ...day,
      holidayName: day.holidayName || holiday.name
    });
  }

  return {
    days: Array.from(daysByDate.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
    month: range.month,
    projects
  };
}

export async function loadMonthlyAiSummaryAction(year: number, monthIndex: number): Promise<MonthlyAiSummaryLoadResult> {
  const user = await requireSession();
  const { days, month, projects } = await loadMonthlyAiSummaryDays({ monthIndex, userId: user.id, year });

  return {
    payload: buildMonthlyAiSummaryExport({ days, month }),
    projects
  };
}

export async function applyMonthlyAiSummaryAction(params: {
  imported: MonthlyAiSummaryPayload;
  monthIndex: number;
  year: number;
}): Promise<MonthlyAiSummaryApplyResult> {
  const user = await requireSession();
  const { days, month } = await loadMonthlyAiSummaryDays({ monthIndex: params.monthIndex, userId: user.id, year: params.year });
  const baseline = buildMonthlyAiSummaryExport({ days, month });
  const validation = validateMonthlyAiSummaryImport({ baseline, imported: params.imported });

  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }

  const patches = getMonthlyAiSummaryPatches({ baseline, imported: params.imported });
  const daysByDate = new Map(days.map((day) => [day.dateKey, day]));

  for (const patch of patches) {
    const day = daysByDate.get(patch.dateKey);

    if (!day) {
      throw new Error(`${patch.dateKey} 기록을 찾을 수 없습니다.`);
    }

    await saveTimesheetDay({
      day: {
        ...day,
        shortVersion: patch.shortVersion,
        entries: day.entries.map((entry) => {
          const patchedEntry = patch.entries.find((candidate) => candidate.id === (entry.id || entry.clientId));

          return patchedEntry ? { ...entry, aiTranslation: patchedEntry.aiTranslation } : entry;
        })
      },
      userId: user.id
    });
  }

  return {
    appliedDateKeys: patches.map((patch) => patch.dateKey)
  };
}
```

- [ ] **Step 2: Create the route page**

Create `apps/web/src/app/(app)/ai-summary/page.tsx`:

```tsx
import type { Metadata } from "next";

import { MonthEndAiSummaryWorkspace } from "@/components/ai-summary/month-end-ai-summary-workspace";

import { applyMonthlyAiSummaryAction, loadMonthlyAiSummaryAction } from "./actions";

export const metadata: Metadata = {
  title: "AI 월말 정리"
};

export default async function AiSummaryPage() {
  const today = new Date();
  const initialYear = today.getFullYear();
  const initialMonthIndex = today.getMonth();
  const initialData = await loadMonthlyAiSummaryAction(initialYear, initialMonthIndex);

  return (
    <MonthEndAiSummaryWorkspace
      applyMonthlyAiSummaryAction={applyMonthlyAiSummaryAction}
      initialData={initialData}
      initialMonthIndex={initialMonthIndex}
      initialYear={initialYear}
      loadMonthlyAiSummaryAction={loadMonthlyAiSummaryAction}
    />
  );
}
```

- [ ] **Step 3: Add the navigation item**

Modify `apps/web/src/app/(app)/app-nav.tsx`:

```tsx
import { Bot, CalendarDays, FolderKanban } from "lucide-react";
```

Then update `navItems`:

```tsx
const navItems = [
  { href: "/timesheet", icon: CalendarDays, label: "업무 기록" },
  { href: "/ai-summary", icon: Bot, label: "AI 월말 정리" },
  { href: "/projects", icon: FolderKanban, label: "프로젝트 관리" }
];
```

- [ ] **Step 4: Run typecheck to expose missing UI**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: FAIL because `MonthEndAiSummaryWorkspace` does not exist yet.

- [ ] **Step 5: Commit server route scaffolding after Task 3 passes**

Do not commit at this task's failing state. Commit after Task 3 completes and typecheck passes:

```bash
git add apps/web/src/app/(app)/ai-summary/actions.ts apps/web/src/app/(app)/ai-summary/page.tsx apps/web/src/app/(app)/app-nav.tsx
git commit -m "feat(web): add monthly AI summary route"
```

---

### Task 3: Client Workspace UI

**Files:**
- Create: `apps/web/src/components/ai-summary/month-end-ai-summary-workspace.tsx`

- [ ] **Step 1: Create the client component**

Create `apps/web/src/components/ai-summary/month-end-ai-summary-workspace.tsx`:

```tsx
"use client";

import {
  buildMonthlyAiSummaryPrompt,
  buildMonthlyAiSummaryRevisionPrompt,
  getMonthlyAiSummaryPatches,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryPayload
} from "@timesheet/domain";
import { Badge, Button, Textarea, cn } from "@timesheet/ui";
import { CheckCircle2, Clipboard, ClipboardCheck, FileJson, RefreshCw, Save, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";

type MonthlyAiSummaryLoadResult = {
  payload: MonthlyAiSummaryPayload;
  projects: string[];
};

type MonthlyAiSummaryApplyResult = {
  appliedDateKeys: string[];
};

type MonthEndAiSummaryWorkspaceProps = {
  applyMonthlyAiSummaryAction: (params: {
    imported: MonthlyAiSummaryPayload;
    monthIndex: number;
    year: number;
  }) => Promise<MonthlyAiSummaryApplyResult>;
  initialData: MonthlyAiSummaryLoadResult;
  initialMonthIndex: number;
  initialYear: number;
  loadMonthlyAiSummaryAction: (year: number, monthIndex: number) => Promise<MonthlyAiSummaryLoadResult>;
};

type CopyState = "idle" | "copied" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

export function MonthEndAiSummaryWorkspace({
  applyMonthlyAiSummaryAction,
  initialData,
  initialMonthIndex,
  initialYear,
  loadMonthlyAiSummaryAction
}: MonthEndAiSummaryWorkspaceProps) {
  const [year, setYear] = useState(initialYear);
  const [monthIndex, setMonthIndex] = useState(initialMonthIndex);
  const [data, setData] = useState(initialData);
  const [importText, setImportText] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [isPending, startTransition] = useTransition();

  const exportJson = useMemo(() => JSON.stringify(data.payload, null, 2), [data.payload]);
  const mainPrompt = useMemo(() => buildMonthlyAiSummaryPrompt().replace("[PASTE_JSON_HERE]", exportJson), [exportJson]);
  const revisionPrompt = useMemo(() => {
    const currentJson = importText.trim() || exportJson;

    return buildMonthlyAiSummaryRevisionPrompt()
      .replace("[WRITE_REVISION_REQUEST_HERE]", revisionInstruction.trim() || "Make the English more concise and report-ready.")
      .replace("[PASTE_CURRENT_JSON_HERE]", currentJson);
  }, [exportJson, importText, revisionInstruction]);

  const parsedImport = useMemo(() => {
    if (!importText.trim()) {
      return { errors: ["LLM이 반환한 JSON을 붙여넣어 주세요."], payload: null as MonthlyAiSummaryPayload | null };
    }

    try {
      return { errors: [], payload: JSON.parse(importText) as MonthlyAiSummaryPayload };
    } catch (error) {
      return {
        errors: [error instanceof Error ? error.message : "JSON을 파싱할 수 없습니다."],
        payload: null as MonthlyAiSummaryPayload | null
      };
    }
  }, [importText]);

  const validation = useMemo(() => {
    if (!parsedImport.payload) {
      return { errors: parsedImport.errors, patches: [] };
    }

    const result = validateMonthlyAiSummaryImport({ baseline: data.payload, imported: parsedImport.payload });
    const patches = result.errors.length > 0 ? [] : getMonthlyAiSummaryPatches({ baseline: data.payload, imported: parsedImport.payload });

    return {
      errors: result.errors,
      patches
    };
  }, [data.payload, parsedImport]);

  function changeMonth(delta: number) {
    const next = new Date(year, monthIndex + delta, 1);
    const nextYear = next.getFullYear();
    const nextMonthIndex = next.getMonth();

    startTransition(async () => {
      const nextData = await loadMonthlyAiSummaryAction(nextYear, nextMonthIndex);
      setYear(nextYear);
      setMonthIndex(nextMonthIndex);
      setData(nextData);
      setImportText("");
      setSaveState("idle");
      setSaveError("");
    });
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("error");
    }
  }

  function applyImport() {
    if (!parsedImport.payload || validation.errors.length > 0) {
      return;
    }

    setSaveState("saving");
    setSaveError("");

    startTransition(async () => {
      try {
        const result = await applyMonthlyAiSummaryAction({ imported: parsedImport.payload!, monthIndex, year });
        const refreshed = await loadMonthlyAiSummaryAction(year, monthIndex);

        setData(refreshed);
        setImportText(JSON.stringify(refreshed.payload, null, 2));
        setSaveState("saved");
        setSaveError(result.appliedDateKeys.length === 0 ? "변경된 날짜가 없습니다." : "");
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "저장하지 못했습니다.");
      }
    });
  }

  const monthLabel = `${year}년 ${monthIndex + 1}월`;
  const hasValidationErrors = validation.errors.length > 0;

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-normal text-slate-950">AI 월말 정리</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{monthLabel} 업무 기록을 JSON으로 정리합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={isPending} onClick={() => changeMonth(-1)} type="button" variant="secondary">
              이전 달
            </Button>
            <Button disabled={isPending} onClick={() => changeMonth(1)} type="button" variant="secondary">
              다음 달
            </Button>
          </div>
        </div>

        <Panel icon={<Sparkles className="size-4" />} title="LLM 프롬프트">
          <div className="flex flex-wrap gap-2 pb-3">
            <Button onClick={() => copyText(mainPrompt)} type="button">
              {copyState === "copied" ? <ClipboardCheck aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
              프롬프트 복사
            </Button>
            <Button onClick={() => copyText(exportJson)} type="button" variant="secondary">
              <FileJson aria-hidden="true" className="size-4" />
              JSON만 복사
            </Button>
          </div>
          <Textarea readOnly rows={18} value={mainPrompt} />
        </Panel>

        <Panel icon={<RefreshCw className="size-4" />} title="수정 요청 프롬프트">
          <div className="space-y-3">
            <Textarea
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder="예: Make it shorter and use executive report tone."
              rows={3}
              value={revisionInstruction}
            />
            <Button onClick={() => copyText(revisionPrompt)} type="button" variant="secondary">
              <Clipboard aria-hidden="true" className="size-4" />
              수정 프롬프트 복사
            </Button>
            <Textarea readOnly rows={10} value={revisionPrompt} />
          </div>
        </Panel>
      </section>

      <aside className="space-y-4">
        <Panel icon={<FileJson className="size-4" />} title="결과 붙여넣기">
          <Textarea
            onChange={(event) => {
              setImportText(event.target.value);
              setSaveState("idle");
              setSaveError("");
            }}
            placeholder="LLM이 반환한 JSON을 여기에 붙여넣으세요."
            rows={18}
            value={importText}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Status errors={validation.errors} patchCount={validation.patches.length} />
            <Button disabled={!parsedImport.payload || hasValidationErrors || saveState === "saving"} onClick={applyImport} type="button">
              <Save aria-hidden="true" className="size-4" />
              {saveState === "saving" ? "적용 중" : "적용"}
            </Button>
          </div>
          {saveState === "saved" ? <p className="mt-2 text-sm font-semibold text-emerald-700">적용했습니다.</p> : null}
          {saveError ? <p className={cn("mt-2 text-sm font-semibold", saveState === "error" ? "text-red-600" : "text-slate-500")}>{saveError}</p> : null}
        </Panel>

        <Panel icon={<CheckCircle2 className="size-4" />} title="변경 미리보기">
          {validation.patches.length === 0 ? (
            <p className="text-sm font-medium text-slate-500">검증 가능한 변경사항이 아직 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {validation.patches.map((patch) => (
                <div className="rounded-md border border-slate-200 bg-white p-3" key={patch.dateKey}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-950">{patch.dateKey}</p>
                    <Badge tone="green">{patch.entries.length + (patch.shortVersion ? 1 : 0)} changes</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-600">{patch.shortVersion}</p>
                  <div className="mt-2 space-y-1">
                    {patch.entries.map((entry) => (
                      <p className="text-sm text-slate-500" key={entry.id}>{entry.aiTranslation}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </aside>
    </main>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-slate-950">
        {icon}
        <h3 className="text-base font-bold tracking-normal">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Status({ errors, patchCount }: { errors: string[]; patchCount: number }) {
  if (errors.length > 0) {
    return <p className="text-sm font-semibold text-red-600">{errors[0]}</p>;
  }

  return <p className="text-sm font-semibold text-emerald-700">{patchCount}개 날짜 변경 가능</p>;
}
```

- [ ] **Step 2: Run web typecheck**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 3: Run full repository typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit the UI**

```bash
git add apps/web/src/components/ai-summary/month-end-ai-summary-workspace.tsx apps/web/src/app/(app)/ai-summary/actions.ts apps/web/src/app/(app)/ai-summary/page.tsx apps/web/src/app/(app)/app-nav.tsx
git commit -m "feat(web): add month-end AI summary tab"
```

---

### Task 4: Documentation And Final Verification

**Files:**
- Modify: `docs/timesheet-workflow.md`

- [ ] **Step 1: Update the workflow document**

Append these bullets to the `Month-End AI Summary` section in `docs/timesheet-workflow.md`:

```md
- The implementation uses a dedicated server action to build the authoritative month export payload.
- Applying imported JSON revalidates against current server-side data before saving.
- The UI owns its own month selector and defaults to the current month.
- Domain tests cover export payloads, prompt markers, immutable-field rejection, and valid patch extraction.
```

- [ ] **Step 2: Run domain tests**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

- [ ] **Step 3: Run full typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 5: Do not run build unless the user explicitly asks**

Per repository instructions, stop after lint/typecheck/test verification. Do not run `pnpm build`.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/timesheet-workflow.md
git commit -m "docs: update AI summary workflow verification"
```

---

## Self-Review

- Spec coverage: The plan covers the new tab, export JSON, strict prompt, revision prompt, import validation, preview, apply action, and documentation. The non-goal of no direct LLM API is preserved.
- Placeholder scan: The only bracket markers are literal prompt placeholders that the app intentionally shows to users.
- Type consistency: The plan consistently uses `MonthlyAiSummaryPayload`, `MonthlyAiSummaryPatch`, `buildMonthlyAiSummaryExport`, `validateMonthlyAiSummaryImport`, and `getMonthlyAiSummaryPatches` across domain, server actions, and UI.
