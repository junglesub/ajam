# Vacation Year Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new authenticated 휴가 tab with annual allowance tracking, a compact year calendar, modal vacation editing, and connected-vacation hover/edit behavior.

**Architecture:** Add pure vacation-year helpers in `@timesheet/domain`, persistence helpers in `@timesheet/db`, and a focused `/vacations` App Router page. Reuse the existing timesheet save/delete path for vacation dates so `Vacation` and `TimesheetEntry` stay synchronized.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma schema with SQLite runtime bootstrap, pnpm workspace scripts, Node test runner for domain tests.

---

## File Structure

- Modify `packages/domain/src/date.ts`: add year-level business calendar/date helpers.
- Create `packages/domain/src/vacation-year.ts`: metrics, fill ratios, grouping, colors, and connected-vacation detection.
- Create `packages/domain/src/vacation-year.test.ts`: pure unit tests for metrics, fill, grouping, and connected-vacation behavior.
- Modify `packages/domain/src/index.ts`: export the new vacation helpers and types.
- Modify `packages/db/prisma/schema.prisma`: add `VacationAllowance` relation/model.
- Modify `packages/db/src/timesheet-store.ts`: runtime schema bootstrap plus `getVacationAllowance`, `upsertVacationAllowance`, and year vacation list support.
- Modify `packages/db/src/index.ts`: export new DB helpers/types.
- Create `apps/web/src/app/(app)/vacations/actions.ts`: authenticated server actions for yearly data, allowance save, vacation save, and vacation delete.
- Create `apps/web/src/app/(app)/vacations/page.tsx`: authenticated server page that loads the initial year.
- Modify `apps/web/src/app/(app)/app-nav.tsx`: add the 휴가 tab.
- Create `apps/web/src/components/vacations/types.ts`: shared vacation page action/client types.
- Create `apps/web/src/components/vacations/vacation-year-workspace.tsx`: client state, hover state, modal state, and action orchestration.
- Create `apps/web/src/components/vacations/vacation-year-calendar.tsx`: 12-month compact calendar layout.
- Create `apps/web/src/components/vacations/vacation-date-cell.tsx`: square hitbox and circular fill marker.
- Create `apps/web/src/components/vacations/vacation-summary-panel.tsx`: allowance metrics and vacation type groups.
- Create `apps/web/src/components/vacations/vacation-edit-modal.tsx`: create/edit/delete modal with single-date and connected-date choices.
- Modify `README.md`, `docs/product-brief.md`, and `docs/architecture.md`: document the new page, allowance model, and flow.

## Task 1: Domain Helpers

**Files:**
- Modify: `packages/domain/src/date.ts`
- Create: `packages/domain/src/vacation-year.ts`
- Create: `packages/domain/src/vacation-year.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Add failing domain tests**

Create `packages/domain/src/vacation-year.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVacationYearMetrics,
  clampVacationFillRatio,
  findConnectedVacationDateKeys,
  groupVacationRecordsByName
} from "./vacation-year";

const vacationDays = [
  { dateKey: "2026-01-05", hours: 8, name: "연차" },
  { dateKey: "2026-01-06", hours: 8, name: "연차" },
  { dateKey: "2026-01-08", hours: 4, name: "오전반차" },
  { dateKey: "2026-03-02", hours: 2, name: "" }
];

test("buildVacationYearMetrics converts hours into days and ratio", () => {
  assert.deepEqual(buildVacationYearMetrics({ allowanceDays: 15, vacations: vacationDays }), {
    allowanceDays: 15,
    consumptionRatio: 0.15,
    remainingDays: 12.75,
    usedDays: 2.25,
    usedHours: 18
  });
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
    dateKeys: group.dateKeys,
    hours: group.hours,
    name: group.name
  })), [
    { colorClass: "blue", dateKeys: ["2026-01-05", "2026-01-06"], hours: 16, name: "연차" },
    { colorClass: "amber", dateKeys: ["2026-01-08"], hours: 4, name: "오전반차" },
    { colorClass: "emerald", dateKeys: ["2026-03-02"], hours: 2, name: "휴가" }
  ]);
});

test("findConnectedVacationDateKeys walks adjacent business vacations and skips holidays", () => {
  const connected = findConnectedVacationDateKeys({
    dateKey: "2026-01-06",
    holidayDateKeys: ["2026-01-07"],
    vacationDateKeys: ["2026-01-05", "2026-01-06", "2026-01-08", "2026-01-12"]
  });

  assert.deepEqual(connected, ["2026-01-05", "2026-01-06", "2026-01-08"]);
});

test("findConnectedVacationDateKeys does not group non-adjacent same-name vacations", () => {
  const connected = findConnectedVacationDateKeys({
    dateKey: "2026-01-05",
    holidayDateKeys: [],
    vacationDateKeys: ["2026-01-05", "2026-01-12"]
  });

  assert.deepEqual(connected, ["2026-01-05"]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @timesheet/domain test`

Expected: FAIL because `packages/domain/src/vacation-year.ts` does not exist.

- [ ] **Step 3: Add date helpers**

Append to `packages/domain/src/date.ts`:

```ts
export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toBrowserDateKey(date);
}

export function addBusinessDays(dateKey: string, direction: -1 | 1): string {
  let next = addDays(dateKey, direction);

  while (isWeekendDateKey(next)) {
    next = addDays(next, direction);
  }

  return next;
}

export function getBusinessDateKeysInRange(startDateKey: string, endDateKey: string): string[] {
  const start = startDateKey <= endDateKey ? startDateKey : endDateKey;
  const end = startDateKey <= endDateKey ? endDateKey : startDateKey;
  const dateKeys: string[] = [];
  const cursor = parseDateKey(start);

  while (toBrowserDateKey(cursor) <= end) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      dateKeys.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

export function getYearRange(year: number): { endDateKey: string; startDateKey: string } {
  return {
    endDateKey: `${year}-12-31`,
    startDateKey: `${year}-01-01`
  };
}
```

- [ ] **Step 4: Add vacation-year helpers**

Create `packages/domain/src/vacation-year.ts`:

```ts
import { addBusinessDays } from "./date";

export type VacationYearRecord = {
  dateKey: string;
  hours: number;
  name: string;
};

export type VacationYearMetrics = {
  allowanceDays: number;
  consumptionRatio: number;
  remainingDays: number;
  usedDays: number;
  usedHours: number;
};

export type VacationYearGroup = {
  colorClass: VacationYearColorClass;
  dateKeys: string[];
  days: number;
  hours: number;
  name: string;
};

export type VacationYearColorClass = "blue" | "amber" | "emerald" | "rose" | "violet" | "cyan";

const colorClasses: VacationYearColorClass[] = ["blue", "amber", "emerald", "rose", "violet", "cyan"];

function roundVacationNumber(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeVacationName(name: string): string {
  return name.trim() || "휴가";
}

export function clampVacationFillRatio(hours: number): number {
  return Math.min(Math.max(hours / 8, 0), 1);
}

export function buildVacationYearMetrics(params: {
  allowanceDays: number;
  vacations: VacationYearRecord[];
}): VacationYearMetrics {
  const usedHours = roundVacationNumber(params.vacations.reduce((sum, vacation) => sum + vacation.hours, 0));
  const usedDays = roundVacationNumber(usedHours / 8);
  const allowanceDays = roundVacationNumber(Math.max(params.allowanceDays, 0));
  const remainingDays = roundVacationNumber(allowanceDays - usedDays);
  const consumptionRatio = allowanceDays > 0 ? roundVacationNumber(usedDays / allowanceDays) : 0;

  return {
    allowanceDays,
    consumptionRatio,
    remainingDays,
    usedDays,
    usedHours
  };
}

export function groupVacationRecordsByName(vacations: VacationYearRecord[]): VacationYearGroup[] {
  const groups = new Map<string, VacationYearRecord[]>();

  for (const vacation of vacations) {
    const name = normalizeVacationName(vacation.name);
    groups.set(name, [...(groups.get(name) ?? []), vacation]);
  }

  return Array.from(groups.entries())
    .map(([name, records], index) => {
      const hours = roundVacationNumber(records.reduce((sum, vacation) => sum + vacation.hours, 0));

      return {
        colorClass: colorClasses[index % colorClasses.length]!,
        dateKeys: records.map((record) => record.dateKey).sort(),
        days: roundVacationNumber(hours / 8),
        hours,
        name
      };
    })
    .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, "ko-KR"));
}

export function findConnectedVacationDateKeys(params: {
  dateKey: string;
  holidayDateKeys: string[];
  vacationDateKeys: string[];
}): string[] {
  const holidays = new Set(params.holidayDateKeys);
  const vacations = new Set(params.vacationDateKeys);
  const connected = new Set<string>(vacations.has(params.dateKey) ? [params.dateKey] : []);

  for (const direction of [-1, 1] as const) {
    let cursor = addBusinessDays(params.dateKey, direction);

    while (holidays.has(cursor) || vacations.has(cursor)) {
      if (vacations.has(cursor)) {
        connected.add(cursor);
      }

      cursor = addBusinessDays(cursor, direction);
    }
  }

  return Array.from(connected).sort();
}
```

- [ ] **Step 5: Export helpers**

Modify `packages/domain/src/index.ts` to include:

```ts
export {
  addBusinessDays,
  addDays,
  formatKoreanDate,
  getBusinessCalendarWeeks,
  getBusinessDateKeysInRange,
  getBusinessDateKeysUntil,
  getMonthLabel,
  getYearRange,
  isWeekendDateKey,
  parseDateKey,
  toBrowserDateKey
} from "./date";
```

Add after the existing timesheet exports:

```ts
export {
  buildVacationYearMetrics,
  clampVacationFillRatio,
  findConnectedVacationDateKeys,
  groupVacationRecordsByName,
  normalizeVacationName
} from "./vacation-year";
export type {
  VacationYearColorClass,
  VacationYearGroup,
  VacationYearMetrics,
  VacationYearRecord
} from "./vacation-year";
```

- [ ] **Step 6: Verify domain tests pass**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/date.ts packages/domain/src/index.ts packages/domain/src/vacation-year.ts packages/domain/src/vacation-year.test.ts
git commit -m "feat(domain): add vacation year helpers"
```

## Task 2: Vacation Allowance Persistence

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/timesheet-store.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

- [x] **Step 1: Add Prisma model**

In `packages/db/prisma/schema.prisma`, add `vacationAllowances VacationAllowance[]` to `model User`.

Add:

```prisma
model VacationAllowance {
  id        String   @id @default(cuid())
  userId    String
  year      Int
  days      Float    @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, year])
}
```

- [x] **Step 2: Add runtime schema and helpers**

In `packages/db/src/timesheet-store.ts`, add:

```ts
export type VacationAllowanceRecord = {
  days: number;
  userId: string;
  year: number;
};
```

Inside `ensureTimesheetSchema`, near the existing `Vacation` table creation, add:

```ts
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VacationAllowance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacationAllowance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "VacationAllowance_userId_year_key" ON "VacationAllowance"("userId", "year")`);
```

Add helper functions near `listVacations`:

```ts
export async function getVacationAllowance(params: { userId: string; year: number }): Promise<VacationAllowanceRecord | null> {
  await ensureTimesheetSchema();

  const rows = await prisma.$queryRawUnsafe<VacationAllowanceRecord[]>(
    `SELECT "userId", "year", "days" FROM "VacationAllowance" WHERE "userId" = ? AND "year" = ? LIMIT 1`,
    params.userId,
    params.year
  );

  return rows[0] ?? null;
}

export async function upsertVacationAllowance(params: { days: number; userId: string; year: number }): Promise<VacationAllowanceRecord> {
  await ensureTimesheetSchema();

  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "VacationAllowance" ("id", "userId", "year", "days", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "year") DO UPDATE SET "days" = excluded."days", "updatedAt" = CURRENT_TIMESTAMP`,
    id,
    params.userId,
    params.year,
    params.days
  );

  return {
    days: params.days,
    userId: params.userId,
    year: params.year
  };
}
```

Confirm `randomUUID` is already imported at the top of `timesheet-store.ts`; if not, add:

```ts
import { randomUUID } from "node:crypto";
```

- [x] **Step 3: Export DB helpers**

Modify `packages/db/src/index.ts` timesheet export list to include:

```ts
getVacationAllowance,
upsertVacationAllowance
```

Modify the type export list to include:

```ts
VacationAllowanceRecord
```

- [x] **Step 4: Generate Prisma client**

Run: `pnpm db:generate`

Expected: PASS and ignored local generated client files update under `packages/db/src/generated/`.

- [x] **Step 5: Typecheck DB package**

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/src/timesheet-store.ts packages/db/src/index.ts pnpm-workspace.yaml package.json
git commit -m "feat(db): store vacation allowances"
```

## Task 3: Vacation Server Actions and Route

**Files:**
- Create: `apps/web/src/components/vacations/types.ts`
- Create: `apps/web/src/app/(app)/vacations/actions.ts`
- Create: `apps/web/src/app/(app)/vacations/page.tsx`
- Modify: `apps/web/src/app/(app)/app-nav.tsx`

- [x] **Step 1: Create shared vacation types**

Create `apps/web/src/components/vacations/types.ts`:

```ts
import type { VacationYearRecord } from "@timesheet/domain";

export type VacationDateInput = {
  dateKey: string;
  hours: number;
  name: string;
};

export type VacationYearData = {
  allowanceDays: number;
  holidays: Array<{ dateKey: string; name: string }>;
  vacations: VacationYearRecord[];
};
```

- [x] **Step 2: Create server actions**

Create `apps/web/src/app/(app)/vacations/actions.ts`:

```ts
"use server";

import {
  deleteTimesheetEntry,
  getManagedUser,
  getVacationAllowance,
  listHolidays,
  listVacations,
  saveTimesheetDay,
  upsertVacationAllowance,
  type VacationRecord
} from "@timesheet/db";
import { createEmptyDraft, createEmptyEntryDraft, getYearRange, type TimesheetDayDraft } from "@timesheet/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { VacationDateInput, VacationYearData } from "@/components/vacations/types";
import { destroySession, getSession } from "@/server/session";

async function requireSessionUser() {
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

function assertValidYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("연도가 올바르지 않습니다.");
  }
}

function assertValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
}

function createVacationDraft(input: VacationDateInput): TimesheetDayDraft {
  const entry = createEmptyEntryDraft(0);

  return {
    ...createEmptyDraft(input.dateKey),
    entries: [
      {
        ...entry,
        hours: input.hours,
        kind: "VACATION",
        vacationName: input.name.trim() || "휴가"
      }
    ]
  };
}

export async function loadVacationYearAction(year: number): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidYear(year);

  const range = getYearRange(year);
  const [allowance, holidays, vacations] = await Promise.all([
    getVacationAllowance({ userId: user.id, year }),
    listHolidays(range).catch(() => []),
    listVacations({ ...range, userId: user.id })
  ]);

  return {
    allowanceDays: allowance?.days ?? 0,
    holidays,
    vacations
  };
}

export async function saveVacationAllowanceAction(year: number, days: number): Promise<number> {
  const user = await requireSessionUser();
  assertValidYear(year);

  if (!Number.isFinite(days) || days < 0 || days > 366) {
    throw new Error("연차 개수가 올바르지 않습니다.");
  }

  const allowance = await upsertVacationAllowance({
    days,
    userId: user.id,
    year
  });

  revalidatePath("/vacations");

  return allowance.days;
}

export async function saveVacationDateAction(input: VacationDateInput): Promise<VacationRecord[]> {
  const user = await requireSessionUser();
  assertValidDateKey(input.dateKey);

  if (!Number.isFinite(input.hours) || input.hours < 0 || input.hours > 24) {
    throw new Error("휴가 시간이 올바르지 않습니다.");
  }

  await saveTimesheetDay({
    day: createVacationDraft(input),
    userId: user.id
  });

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  const year = Number(input.dateKey.slice(0, 4));
  return listVacations({ ...getYearRange(year), userId: user.id });
}

export async function deleteVacationDateAction(dateKey: string): Promise<VacationRecord[]> {
  const user = await requireSessionUser();
  assertValidDateKey(dateKey);

  await deleteTimesheetEntry({ dateKey, userId: user.id });

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  const year = Number(dateKey.slice(0, 4));
  return listVacations({ ...getYearRange(year), userId: user.id });
}
```

- [x] **Step 2: Create route page**

Create `apps/web/src/app/(app)/vacations/page.tsx`:

```tsx
import { toBrowserDateKey } from "@timesheet/domain";
import type { Metadata } from "next";

import { VacationYearWorkspace } from "@/components/vacations/vacation-year-workspace";

import {
  deleteVacationDateAction,
  loadVacationYearAction,
  saveVacationAllowanceAction,
  saveVacationDateAction
} from "./actions";

export const metadata: Metadata = {
  title: "휴가"
};

export default async function VacationsPage() {
  const todayKey = toBrowserDateKey(new Date());
  const initialYear = Number(todayKey.slice(0, 4));
  const initialData = await loadVacationYearAction(initialYear);

  return (
    <VacationYearWorkspace
      deleteVacationDateAction={deleteVacationDateAction}
      initialData={initialData}
      initialTodayKey={todayKey}
      initialYear={initialYear}
      loadVacationYearAction={loadVacationYearAction}
      saveVacationAllowanceAction={saveVacationAllowanceAction}
      saveVacationDateAction={saveVacationDateAction}
    />
  );
}
```

- [x] **Step 3: Add navigation item**

Modify `apps/web/src/app/(app)/app-nav.tsx`:

```tsx
import { Bot, CalendarDays, FolderKanban, Palmtree, Rows3 } from "lucide-react";
```

Add after 업무 기록:

```ts
{ href: "/vacations", icon: Palmtree, label: "휴가" },
```

- [ ] **Step 4: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: FAIL because UI components are not created yet.

- [x] **Step 5: Carry route changes into Task 4**

Keep the Task 3 route files in the working tree while creating Task 4 UI files. Commit the route and UI together in Task 4 after `pnpm --filter @timesheet/web typecheck` passes.

## Task 4: Vacation UI Components

**Files:**
- Create: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Create: `apps/web/src/components/vacations/vacation-year-calendar.tsx`
- Create: `apps/web/src/components/vacations/vacation-date-cell.tsx`
- Create: `apps/web/src/components/vacations/vacation-summary-panel.tsx`
- Create: `apps/web/src/components/vacations/vacation-edit-modal.tsx`

- [x] **Step 1: Create date cell component**

Create `apps/web/src/components/vacations/vacation-date-cell.tsx`:

```tsx
"use client";

import { clampVacationFillRatio } from "@timesheet/domain";
import { cn } from "@timesheet/ui";

type VacationDateCellProps = {
  connected: boolean;
  dateKey: string;
  day: number;
  dimmed: boolean;
  hours: number;
  label: string;
  onClick: (dateKey: string) => void;
  onHover: (dateKey: string) => void;
  onLeave: () => void;
  tone: "amber" | "blue" | "cyan" | "emerald" | "rose" | "violet";
};

const fillClassByTone: Record<VacationDateCellProps["tone"], string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500"
};

export function VacationDateCell({
  connected,
  dateKey,
  day,
  dimmed,
  hours,
  label,
  onClick,
  onHover,
  onLeave,
  tone
}: VacationDateCellProps) {
  const fillRatio = clampVacationFillRatio(hours);

  return (
    <button
      aria-label={`${dateKey} ${label || "휴가 없음"}`}
      className="grid aspect-square place-items-center rounded-md p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950"
      onClick={() => onClick(dateKey)}
      onMouseEnter={() => onHover(dateKey)}
      onMouseLeave={onLeave}
      type="button"
    >
      <span
        className={cn(
          "relative grid size-full max-h-7 max-w-7 place-items-center overflow-hidden rounded-full bg-slate-100 text-[10px] font-black text-slate-700 transition",
          dimmed && "opacity-40",
          connected && "vacation-connected-date bg-slate-200 opacity-100"
        )}
      >
        {fillRatio > 0 ? (
          <span
            aria-hidden="true"
            className={cn("absolute inset-x-0 bottom-0", fillClassByTone[tone])}
            style={{ height: `${fillRatio * 100}%` }}
          />
        ) : null}
        <span className="relative z-10">{day}</span>
      </span>
    </button>
  );
}
```

- [x] **Step 2: Create year calendar component**

Create `apps/web/src/components/vacations/vacation-year-calendar.tsx`:

```tsx
"use client";

import { getBusinessCalendarWeeks, type VacationYearGroup, type VacationYearRecord } from "@timesheet/domain";

import { VacationDateCell } from "./vacation-date-cell";

const weekdayLabels = ["M", "T", "W", "T", "F"];

type VacationYearCalendarProps = {
  connectedDateKeys: Set<string>;
  groups: VacationYearGroup[];
  hoveredDateKey: string;
  onDateClick: (dateKey: string) => void;
  onDateHover: (dateKey: string) => void;
  onDateLeave: () => void;
  vacations: VacationYearRecord[];
  year: number;
};

export function VacationYearCalendar({
  connectedDateKeys,
  groups,
  hoveredDateKey,
  onDateClick,
  onDateHover,
  onDateLeave,
  vacations,
  year
}: VacationYearCalendarProps) {
  const vacationsByDate = new Map(vacations.map((vacation) => [vacation.dateKey, vacation]));
  const toneByName = new Map(groups.map((group) => [group.name, group.colorClass]));

  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const weeks = getBusinessCalendarWeeks(year, monthIndex);

          return (
            <div className="rounded-md border border-slate-200 bg-white p-2" key={monthIndex}>
              <h2 className="mb-2 text-sm font-bold text-slate-950">{monthIndex + 1}월</h2>
              <div className="grid grid-cols-5 gap-1">
                {weekdayLabels.map((label, index) => (
                  <div className="text-center text-[10px] font-black text-slate-400" key={`${label}-${index}`}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid gap-1">
                {weeks.map((week, weekIndex) => (
                  <div className="grid grid-cols-5 gap-1" key={`${monthIndex}-${weekIndex}`}>
                    {week.map((cell, cellIndex) => {
                      if (!cell) {
                        return <div className="aspect-square" key={`blank-${cellIndex}`} />;
                      }

                      const vacation = vacationsByDate.get(cell.dateKey);
                      const name = vacation?.name.trim() || "휴가";
                      const connected = connectedDateKeys.has(cell.dateKey);
                      const dimmed = Boolean(hoveredDateKey && connectedDateKeys.size > 0 && !connected);

                      return (
                        <VacationDateCell
                          connected={connected}
                          dateKey={cell.dateKey}
                          day={cell.day}
                          dimmed={dimmed}
                          hours={vacation?.hours ?? 0}
                          key={cell.dateKey}
                          label={vacation ? `${name} ${vacation.hours}시간` : "휴가 없음"}
                          onClick={onDateClick}
                          onHover={onDateHover}
                          onLeave={onDateLeave}
                          tone={toneByName.get(name) ?? "blue"}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [x] **Step 3: Create summary panel**

Create `apps/web/src/components/vacations/vacation-summary-panel.tsx`:

```tsx
"use client";

import type { VacationYearGroup, VacationYearMetrics } from "@timesheet/domain";
import { Input, Label, cn } from "@timesheet/ui";

type VacationSummaryPanelProps = {
  allowanceDraft: string;
  allowanceError: string;
  groups: VacationYearGroup[];
  metrics: VacationYearMetrics;
  onAllowanceChange: (value: string) => void;
  onAllowanceSave: () => void;
  saveState: "error" | "idle" | "saved" | "saving";
};

const swatchClassByTone: Record<VacationYearGroup["colorClass"], string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500"
};

function formatDays(days: number): string {
  return `${Number(days.toFixed(2))}일`;
}

export function VacationSummaryPanel({
  allowanceDraft,
  allowanceError,
  groups,
  metrics,
  onAllowanceChange,
  onAllowanceSave,
  saveState
}: VacationSummaryPanelProps) {
  return (
    <aside className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <Label>연차 총량</Label>
          <div className="flex gap-2">
            <Input
              min={0}
              onBlur={onAllowanceSave}
              onChange={(event) => onAllowanceChange(event.target.value)}
              step={0.5}
              type="number"
              value={allowanceDraft}
            />
          </div>
          <p className={cn("text-xs font-semibold", saveState === "error" ? "text-red-600" : "text-slate-500")}>
            {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : allowanceError}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">사용</p>
            <p className="text-lg font-black text-slate-950">{formatDays(metrics.usedDays)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">잔여</p>
            <p className="text-lg font-black text-slate-950">{formatDays(metrics.remainingDays)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">시간</p>
            <p className="text-lg font-black text-slate-950">{metrics.usedHours}h</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">소진률</p>
            <p className="text-lg font-black text-slate-950">{Math.round(metrics.consumptionRatio * 100)}%</p>
          </div>
        </div>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">휴가 유형</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {groups.length === 0 ? <p className="py-3 text-sm font-semibold text-slate-500">저장된 휴가가 없습니다.</p> : null}
          {groups.map((group) => (
            <div className="flex items-center justify-between gap-3 py-3 text-sm" key={group.name}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 rounded-full", swatchClassByTone[group.colorClass])} />
                <span className="truncate font-bold text-slate-800">{group.name}</span>
              </span>
              <span className="shrink-0 font-black text-slate-950">{formatDays(group.days)}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
```

- [x] **Step 4: Create edit modal**

Create `apps/web/src/components/vacations/vacation-edit-modal.tsx`:

```tsx
"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Button, Input, Label } from "@timesheet/ui";

export type VacationEditDraft = {
  dateKey: string;
  hours: number;
  name: string;
};

type VacationEditModalProps = {
  connectedCount: number;
  draft: VacationEditDraft;
  error: string;
  mode: "create" | "edit";
  onClose: () => void;
  onDeleteConnected: () => void;
  onDeleteSingle: () => void;
  onDraftChange: (draft: VacationEditDraft) => void;
  onSaveConnected: () => void;
  onSaveSingle: () => void;
  saving: boolean;
};

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function VacationEditModal({
  connectedCount,
  draft,
  error,
  mode,
  onClose,
  onDeleteConnected,
  onDeleteSingle,
  onDraftChange,
  onSaveConnected,
  onSaveSingle,
  saving
}: VacationEditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6" onKeyDown={handleKeyDown} role="presentation">
      <div aria-modal="true" className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none" ref={dialogRef} role="dialog" tabIndex={-1}>
        <h2 className="text-lg font-bold text-slate-950">{mode === "edit" ? "휴가 수정" : "휴가 입력"}</h2>
        <div className="mt-4 space-y-4">
          <Field label="날짜">
            <Input disabled={saving} onChange={(event) => onDraftChange({ ...draft, dateKey: event.target.value })} type="date" value={draft.dateKey} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="휴가 유형">
              <Input disabled={saving} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="예: 연차, 오전반차" value={draft.name} />
            </Field>
            <Field label="휴가 시간">
              <Input disabled={saving} max={24} min={0} onChange={(event) => onDraftChange({ ...draft, hours: Number(event.target.value) })} step={0.5} type="number" value={draft.hours} />
            </Field>
          </div>
          {connectedCount > 1 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              연결된 휴가 {connectedCount}일이 있습니다. 현재 날짜만 적용하거나 연결된 휴가에 함께 적용할 수 있습니다.
            </p>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button disabled={saving} onClick={onClose} type="button" variant="secondary">취소</Button>
            {mode === "edit" ? (
              <Button disabled={saving} onClick={onDeleteSingle} type="button" variant="danger">현재 날짜 삭제</Button>
            ) : null}
            {mode === "edit" && connectedCount > 1 ? (
              <Button disabled={saving} onClick={onDeleteConnected} type="button" variant="danger">연결 휴가 삭제</Button>
            ) : null}
            <Button disabled={saving} onClick={onSaveSingle} type="button" variant={connectedCount > 1 ? "secondary" : "primary"}>
              현재 날짜만 저장
            </Button>
            {connectedCount > 1 ? (
              <Button disabled={saving} onClick={onSaveConnected} type="button">
                연결 휴가 함께 저장
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 5: Create workspace**

Create `apps/web/src/components/vacations/vacation-year-workspace.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import {
  buildVacationYearMetrics,
  findConnectedVacationDateKeys,
  getYearRange,
  groupVacationRecordsByName,
  type VacationYearRecord
} from "@timesheet/domain";
import { Button } from "@timesheet/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { VacationDateInput, VacationYearData } from "./types";
import { VacationEditModal, type VacationEditDraft } from "./vacation-edit-modal";
import { VacationSummaryPanel } from "./vacation-summary-panel";
import { VacationYearCalendar } from "./vacation-year-calendar";

type SaveState = "error" | "idle" | "saved" | "saving";

type VacationYearWorkspaceProps = {
  deleteVacationDateAction: (dateKey: string) => Promise<VacationYearRecord[]>;
  initialData: VacationYearData;
  initialTodayKey: string;
  initialYear: number;
  loadVacationYearAction: (year: number) => Promise<VacationYearData>;
  saveVacationAllowanceAction: (year: number, days: number) => Promise<number>;
  saveVacationDateAction: (input: VacationDateInput) => Promise<VacationYearRecord[]>;
};

export function VacationYearWorkspace({
  deleteVacationDateAction,
  initialData,
  initialYear,
  loadVacationYearAction,
  saveVacationAllowanceAction,
  saveVacationDateAction
}: VacationYearWorkspaceProps) {
  const [year, setYear] = useState(initialYear);
  const [allowanceDays, setAllowanceDays] = useState(initialData.allowanceDays);
  const [allowanceDraft, setAllowanceDraft] = useState(String(initialData.allowanceDays || ""));
  const [allowanceState, setAllowanceState] = useState<SaveState>("idle");
  const [allowanceError, setAllowanceError] = useState("");
  const [holidays, setHolidays] = useState(initialData.holidays);
  const [vacations, setVacations] = useState<VacationYearRecord[]>(initialData.vacations);
  const [hoveredDateKey, setHoveredDateKey] = useState("");
  const [modalDraft, setModalDraft] = useState<VacationEditDraft | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  const groups = useMemo(() => groupVacationRecordsByName(vacations), [vacations]);
  const metrics = useMemo(() => buildVacationYearMetrics({ allowanceDays, vacations }), [allowanceDays, vacations]);
  const holidayDateKeys = useMemo(() => holidays.map((holiday) => holiday.dateKey), [holidays]);
  const vacationDateKeys = useMemo(() => vacations.map((vacation) => vacation.dateKey), [vacations]);
  const connectedDateKeys = useMemo(() => {
    if (!hoveredDateKey || !vacationDateKeys.includes(hoveredDateKey)) {
      return new Set<string>();
    }

    return new Set(findConnectedVacationDateKeys({ dateKey: hoveredDateKey, holidayDateKeys, vacationDateKeys }));
  }, [holidayDateKeys, hoveredDateKey, vacationDateKeys]);

  async function loadYear(nextYear: number) {
    const data = await loadVacationYearAction(nextYear);
    setYear(nextYear);
    setAllowanceDays(data.allowanceDays);
    setAllowanceDraft(String(data.allowanceDays || ""));
    setHolidays(data.holidays);
    setVacations(data.vacations);
    setHoveredDateKey("");
  }

  async function saveAllowance() {
    const days = Number(allowanceDraft);

    if (!Number.isFinite(days) || days < 0) {
      setAllowanceState("error");
      setAllowanceError("연차 개수를 확인해 주세요.");
      return;
    }

    setAllowanceState("saving");
    setAllowanceError("");

    try {
      const saved = await saveVacationAllowanceAction(year, days);
      setAllowanceDays(saved);
      setAllowanceDraft(String(saved || ""));
      setAllowanceState("saved");
    } catch {
      setAllowanceState("error");
      setAllowanceError("연차 개수를 저장하지 못했습니다.");
    }
  }

  function openDateModal(dateKey: string) {
    const vacation = vacations.find((item) => item.dateKey === dateKey);
    setModalMode(vacation ? "edit" : "create");
    setModalDraft({
      dateKey,
      hours: vacation?.hours ?? 8,
      name: vacation?.name || "휴가"
    });
    setModalError("");
  }

  function getModalConnectedDateKeys() {
    if (!modalDraft || !vacationDateKeys.includes(modalDraft.dateKey)) {
      return modalDraft ? [modalDraft.dateKey] : [];
    }

    return findConnectedVacationDateKeys({
      dateKey: modalDraft.dateKey,
      holidayDateKeys,
      vacationDateKeys
    });
  }

  async function saveModal(dateKeys: string[]) {
    if (!modalDraft) {
      return;
    }

    setModalSaving(true);
    setModalError("");

    try {
      let nextVacations = vacations;
      for (const dateKey of dateKeys) {
        nextVacations = await saveVacationDateAction({
          dateKey,
          hours: modalDraft.hours,
          name: modalDraft.name
        });
      }
      setVacations(nextVacations);
      setModalDraft(null);
    } catch {
      setModalError("휴가를 저장하지 못했습니다.");
    } finally {
      setModalSaving(false);
    }
  }

  async function deleteModal(dateKeys: string[]) {
    setModalSaving(true);
    setModalError("");

    try {
      let nextVacations = vacations;
      for (const dateKey of dateKeys) {
        nextVacations = await deleteVacationDateAction(dateKey);
      }
      setVacations(nextVacations);
      setModalDraft(null);
    } catch {
      setModalError("휴가를 삭제하지 못했습니다.");
    } finally {
      setModalSaving(false);
    }
  }

  const connectedModalDateKeys = getModalConnectedDateKeys();

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">휴가</h1>
          <p className="text-sm font-semibold text-slate-500">{getYearRange(year).startDateKey} - {getYearRange(year).endDateKey}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="h-9 px-3" onClick={() => void loadYear(year - 1)} type="button" variant="secondary">
            <ChevronLeft aria-hidden="true" className="size-4" />
            이전
          </Button>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-950">{year}</div>
          <Button className="h-9 px-3" onClick={() => void loadYear(year + 1)} type="button" variant="secondary">
            다음
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <VacationYearCalendar
          connectedDateKeys={connectedDateKeys}
          groups={groups}
          hoveredDateKey={hoveredDateKey}
          onDateClick={openDateModal}
          onDateHover={setHoveredDateKey}
          onDateLeave={() => setHoveredDateKey("")}
          vacations={vacations}
          year={year}
        />
        <VacationSummaryPanel
          allowanceDraft={allowanceDraft}
          allowanceError={allowanceError}
          groups={groups}
          metrics={metrics}
          onAllowanceChange={(value) => {
            setAllowanceDraft(value);
            setAllowanceState("idle");
          }}
          onAllowanceSave={() => void saveAllowance()}
          saveState={allowanceState}
        />
      </div>

      {modalDraft ? (
        <VacationEditModal
          connectedCount={connectedModalDateKeys.length}
          draft={modalDraft}
          error={modalError}
          mode={modalMode}
          onClose={() => setModalDraft(null)}
          onDeleteConnected={() => void deleteModal(connectedModalDateKeys)}
          onDeleteSingle={() => void deleteModal([modalDraft.dateKey])}
          onDraftChange={setModalDraft}
          onSaveConnected={() => void saveModal(connectedModalDateKeys)}
          onSaveSingle={() => void saveModal([modalDraft.dateKey])}
          saving={modalSaving}
        />
      ) : null}
    </div>
  );
}
```

- [x] **Step 6: Add connected-date CSS**

Append to `apps/web/src/app/globals.css`:

```css
.vacation-connected-date {
  box-shadow: 0 0 0 4px rgb(15 23 42 / 8%), 0 4px 10px rgb(15 23 42 / 10%);
  outline: 1.5px solid rgb(15 23 42 / 78%);
  outline-offset: 1px;
}
```

- [x] **Step 7: Verify web typecheck**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [x] **Step 8: Commit route and UI**

```bash
git add apps/web/src/app/'(app)'/app-nav.tsx apps/web/src/app/'(app)'/vacations apps/web/src/components/vacations apps/web/src/app/globals.css
git commit -m "feat(web): add vacation year overview"
```

## Task 5: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/product-brief.md`
- Modify: `docs/architecture.md`

- [x] **Step 1: Update README feature list**

In `README.md`, add a feature bullet:

```md
- 연도별 휴가 탭, 연차 총량 입력, 소진률, 유형별 휴가 묶음, 연간 컴팩트 캘린더
```

- [x] **Step 2: Update product brief current scope**

In `docs/product-brief.md`, add to Current Scope:

```md
- 연도별 휴가 탭에서 연차 총량, 소진률, 유형별 묶음, 연간 컴팩트 캘린더 확인 및 휴가 입력/수정
```

- [x] **Step 3: Update architecture data model**

In `docs/architecture.md`, add to Data Model:

```md
- `VacationAllowance`: 사용자별 연도별 연차 총량을 저장한다. 휴가 사용량은 기존 `Vacation` 기록의 시간을 8시간 기준 일수로 환산한다.
```

Add to Data Flow:

```md
- `/vacations`는 선택 연도의 `VacationAllowance`, `Vacation`, `Holiday` 데이터를 조회해 연간 휴가 캘린더와 유형별 요약을 표시한다. 휴가 입력/수정/삭제는 기존 timesheet 저장 경로를 사용하되 같은 날짜의 업무/공휴일 기록은 보존한다.
```

- [x] **Step 4: Commit docs**

```bash
git add README.md docs/product-brief.md docs/architecture.md
git commit -m "docs(vacation): document year overview"
```

## Task 6: Final Verification

**Files:**
- No new files unless fixes are required.

- [x] **Step 1: Run focused domain tests**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [x] **Step 3: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [x] **Step 4: Start dev server only if the user explicitly approves**

Because repository instructions say not to build unless the user asks, do not run `pnpm build`. Also do not start `pnpm dev` unless visual verification is explicitly requested.

If the user approves visual verification, run:

```bash
pnpm dev
```

Open `/vacations`, verify:

- The 휴가 nav tab appears and becomes active.
- Wide desktop layouts show January through June on the first calendar row.
- `M T W T F` weekday labels render.
- Clicking a work-record date without vacation opens the work-record confirmation modal before vacation input.
- Deleting from that modal removes WORK entries only, then allows vacation input.
- Date hitboxes remain dense and square, and date markers are circular.
- Plain dates do not paint a circle background; dates with a saved work record use the subtle circle background.
- Today's date has a distinct static thick outline.
- 8h, 4h, and 2h fills display as full, half, and quarter.
- Vacation fill colors and type swatches use the softer color tone.
- Weekday holidays render the date number in red.
- API holidays and user-entered holiday entries both render as red holiday dates.
- API holiday load failures show a compact warning on the page.
- Hovering a connected vacation group uses medium static outline/glow and no animation.
- Single-date save works.
- Connected-date save works.
- Single-date delete works.
- Connected-date delete works.

- [x] **Step 5: Commit fixes if verification required changes**

If any verification fixes were needed:

```bash
git add packages/domain/src packages/db/prisma/schema.prisma packages/db/src apps/web/src README.md docs/product-brief.md docs/architecture.md
git commit -m "fix(vacation): polish year overview"
```

## Self-Review Notes

- Spec coverage: tasks cover navigation, annual allowance persistence, metrics, full-year compact calendar, `M T W T F`, circular fill markers, type grouping, modal create/edit/delete, existing connected-vacation logic, hover emphasis, reduced motion, docs, and tests.
- Scope: this is one coherent feature and does not need separate specs.
- Build: the plan excludes `pnpm build` unless the user asks, matching repository instructions.
