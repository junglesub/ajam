# Notion Card Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build user-specific Notion card sync, work-entry card mapping, and mapped-card time analysis for aJam.

**Architecture:** Put date filtering, allocation, and period-estimate rules in `@timesheet/domain` as pure tested functions. Put encrypted Notion connection storage, card cache, sync runs, and Notion API calls in `@timesheet/db` because they are server-only. The Next.js app uses authenticated server actions and focused client components for settings, card linking, and monthly analysis.

**Tech Stack:** pnpm monorepo, Next.js App Router server actions, React 19, TypeScript, SQLite via Prisma raw SQL bootstrap, Node built-in test runner for domain tests, Notion data source API `2026-03-11`.

---

## File Structure

- Create `packages/domain/src/notion-cards.ts`: pure types and functions for Notion card candidate filtering, allocation validation/recalculation, date normalization, and mapped-card estimates.
- Create `packages/domain/src/notion-cards.test.ts`: domain tests for mapped-only analysis, done/missing-end-date rules, date range mapping, allocation, fallback warnings, and timezone normalization.
- Modify `packages/domain/src/timesheet.ts`: add `notionCards` to `TimesheetEntryDraft`.
- Modify `packages/domain/src/index.ts`: export the Notion card domain API.
- Create `packages/db/src/secret-store.ts`: shared AES-GCM encryption helpers extracted from AI settings so Notion tokens and Gemini keys use one implementation.
- Modify `packages/db/src/ai-settings-store.ts`: use `secret-store.ts` instead of local encryption helpers.
- Create `packages/db/src/notion-store.ts`: schema bootstrap and storage functions for `UserNotionConnection`, `NotionCardCache`, `WorkEntryNotionCard`, and `NotionSyncRun`.
- Create `packages/db/src/notion-sync.ts`: Notion data source resolve, schema fetch, candidate/month sync, pagination, partial sync handling, and error mapping.
- Modify `packages/db/src/timesheet-store.ts`: include Notion card links when listing/saving timesheet entries.
- Modify `packages/db/src/index.ts`: export Notion store/sync APIs.
- Create `apps/web/src/app/(app)/notion-cards/actions.ts`: authenticated server actions for settings, schema, sync, and monthly analysis.
- Create `apps/web/src/app/(app)/notion-cards/page.tsx`: server page for the new menu.
- Create `apps/web/src/components/notion-cards/types.ts`: shared client-side Notion card UI types.
- Create `apps/web/src/components/notion-cards/use-notion-card-month.ts`: hook for month selection and cached monthly card loading.
- Create `apps/web/src/components/notion-cards/notion-connection-panel.tsx`: connection state and settings form shell.
- Create `apps/web/src/components/notion-cards/notion-card-table.tsx`: presentational card list table.
- Create `apps/web/src/components/notion-cards/notion-category-summary.tsx`: presentational category metric summary.
- Create `apps/web/src/components/notion-cards/notion-card-workspace.tsx`: thin coordinator that composes the Notion card feature components.
- Modify `apps/web/src/app/(app)/app-nav.tsx`: add `Notion 카드`.
- Modify `apps/web/src/app/(app)/timesheet/actions.ts`: add actions for candidate card sync and previous-card lookup.
- Modify `apps/web/src/app/(app)/timesheet/page.tsx`: pass new actions into `TimesheetWorkspace`.
- Create `apps/web/src/components/timesheet/notion-card-link-section.tsx`: linked-card chips and add/edit trigger for a single `WORK` entry.
- Create `apps/web/src/components/timesheet/notion-card-picker-modal.tsx`: candidate list and card selection modal.
- Create `apps/web/src/components/timesheet/use-notion-card-candidates.ts`: hook for selected-date candidate loading and cache fallback.
- Modify `apps/web/src/components/timesheet/timesheet-workspace.tsx`: wire the Notion card components into the existing editor without embedding the feature UI inline.
- Modify `docs/timesheet-workflow.md`: document Notion card mapping workflow after implementation.

Do not run `pnpm build` unless the user explicitly asks. Use package-level tests and typechecks for verification.

## Modularity Rules

- Keep new feature files focused on one responsibility: domain rules, persistence, sync client, server actions, page shell, hook, presentational component, or coordinator component.
- Do not add large inline Notion UI blocks directly to `timesheet-workspace.tsx`; it is already a large workspace component. Add only props, state wiring, and calls to extracted Notion components.
- Keep coordinator components such as `notion-card-workspace.tsx` small. If a component needs more than one visual region, move each region into a child component.
- Keep hooks responsible for state and async loading only. Hooks should not render JSX.
- Keep presentational components stateless except for local UI-only controls such as an input's draft value.

---

### Task 1: Domain Notion Card Rules

**Files:**
- Create: `packages/domain/src/notion-cards.ts`
- Create: `packages/domain/src/notion-cards.test.ts`
- Modify: `packages/domain/src/timesheet.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Add failing tests for candidates, allocation, and estimates**

Create `packages/domain/src/notion-cards.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateNotionCardHours,
  buildNotionCardEstimate,
  filterOpenNotionCardCandidates,
  normalizeNotionDateToDateKey,
  shouldWarnAboutFallbackHours,
  type NotionCardSnapshot,
  type WorkEntryNotionCardLink
} from "./notion-cards.js";

const cards: NotionCardSnapshot[] = [
  {
    archived: false,
    category: "Feature",
    endDate: "2026-06-05",
    lastEditedTime: "2026-06-05T09:00:00.000Z",
    notionPageId: "card-a",
    stale: false,
    startDate: "2026-06-01",
    status: "진행중",
    title: "로그인 개선",
    url: "https://notion.so/card-a"
  },
  {
    archived: false,
    category: "Feature",
    endDate: "",
    lastEditedTime: "2026-06-02T09:00:00.000Z",
    notionPageId: "card-b",
    stale: false,
    startDate: "2026-06-02",
    status: "완료",
    title: "완료일 없는 완료 카드",
    url: "https://notion.so/card-b"
  },
  {
    archived: false,
    category: "Ops",
    endDate: "",
    lastEditedTime: "2026-06-03T09:00:00.000Z",
    notionPageId: "card-c",
    stale: false,
    startDate: "2026-06-03",
    status: "진행중",
    title: "운영 대응",
    url: "https://notion.so/card-c"
  }
];

describe("Notion card candidates", () => {
  it("shows only open non-done candidates by default while preserving linked done cards", () => {
    const candidates = filterOpenNotionCardCandidates({
      cards,
      dateKey: "2026-06-03",
      doneStatusValues: ["완료"],
      linkedPageIds: ["card-b"]
    });

    assert.deepEqual(candidates.map((card) => card.notionPageId), ["card-a", "card-b", "card-c"]);
  });
});

describe("Notion card allocations", () => {
  it("evenly allocates auto links and requires manual totals to match entry hours", () => {
    const links: WorkEntryNotionCardLink[] = [
      { allocationMode: "auto", allocatedHours: 0, notionPageId: "card-a" },
      { allocationMode: "auto", allocatedHours: 0, notionPageId: "card-c" }
    ];

    assert.deepEqual(allocateNotionCardHours({ entryHours: 5, links }), [
      { allocationMode: "auto", allocatedHours: 2.5, notionPageId: "card-a" },
      { allocationMode: "auto", allocatedHours: 2.5, notionPageId: "card-c" }
    ]);

    assert.throws(
      () =>
        allocateNotionCardHours({
          entryHours: 5,
          links: [
            { allocationMode: "manual", allocatedHours: 3, notionPageId: "card-a" },
            { allocationMode: "manual", allocatedHours: 1, notionPageId: "card-c" }
          ]
        }),
      /카드 배분 시간 합계가 업무 시간과 일치해야 합니다/
    );
  });
});

describe("Notion period estimates", () => {
  it("uses mapped cards only and excludes done cards with missing end date from denominators", () => {
    const estimate = buildNotionCardEstimate({
      card: cards[0]!,
      defaultHoursPerDay: 8,
      doneStatusValues: ["완료"],
      holidays: [],
      mappedCards: cards,
      month: "2026-06",
      savedWorkHoursByDate: new Map([["2026-06-03", 6]]),
      vacations: []
    });

    assert.equal(estimate.totalBusinessDays, 5);
    assert.equal(estimate.estimatedHours, 31);
    assert.equal(estimate.dayEquivalent, 3.875);
  });

  it("normalizes datetime values to the configured work date", () => {
    assert.equal(
      normalizeNotionDateToDateKey({ timeZone: "Asia/Seoul", value: "2026-06-01T15:30:00.000Z" }),
      "2026-06-02"
    );
  });

  it("warns when more than half of estimate dates use default 8h fallback", () => {
    assert.equal(shouldWarnAboutFallbackHours({ fallbackDateCount: 3, totalDateCount: 5 }), true);
    assert.equal(shouldWarnAboutFallbackHours({ fallbackDateCount: 2, totalDateCount: 5 }), false);
  });
});
```

- [ ] **Step 2: Run the failing domain tests**

Run: `pnpm --filter @timesheet/domain test`

Expected: FAIL with module-not-found errors for `./notion-cards.js`.

- [ ] **Step 3: Add the domain implementation**

Create `packages/domain/src/notion-cards.ts`:

```ts
import { isWeekendDateKey, parseDateKey, toBrowserDateKey } from "./date";

export type NotionCardSnapshot = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
};

export type WorkEntryNotionCardLink = {
  allocatedHours: number;
  allocationMode: "auto" | "manual";
  notionPageId: string;
};

export type NotionCardEstimate = {
  dayEquivalent: number;
  estimatedHours: number;
  fallbackDateCount: number;
  totalBusinessDays: number;
  unavailable: boolean;
};

export function filterOpenNotionCardCandidates(params: {
  cards: NotionCardSnapshot[];
  dateKey: string;
  doneStatusValues: string[];
  linkedPageIds: string[];
}): NotionCardSnapshot[] {
  const linked = new Set(params.linkedPageIds);
  const done = new Set(params.doneStatusValues.map(normalizeValue));

  return params.cards.filter((card) => {
    if (linked.has(card.notionPageId)) {
      return true;
    }

    return isOpenCandidateOnDate({ card, dateKey: params.dateKey }) && !done.has(normalizeValue(card.status));
  });
}

export function allocateNotionCardHours(params: {
  entryHours: number;
  links: WorkEntryNotionCardLink[];
}): WorkEntryNotionCardLink[] {
  if (params.links.length === 0) {
    return [];
  }

  if (params.links.every((link) => link.allocationMode === "auto")) {
    const allocatedHours = roundHours(params.entryHours / params.links.length);
    return params.links.map((link) => ({ ...link, allocatedHours }));
  }

  const total = roundHours(params.links.reduce((sum, link) => sum + link.allocatedHours, 0));

  if (total !== roundHours(params.entryHours)) {
    throw new Error("카드 배분 시간 합계가 업무 시간과 일치해야 합니다.");
  }

  return params.links;
}

export function buildNotionCardEstimate(params: {
  card: NotionCardSnapshot;
  defaultHoursPerDay: number;
  doneStatusValues: string[];
  holidays: string[];
  mappedCards: NotionCardSnapshot[];
  month: string;
  savedWorkHoursByDate: Map<string, number>;
  vacations: string[];
}): NotionCardEstimate {
  if (!params.card.startDate || isDoneWithoutEndDate(params.card, params.doneStatusValues)) {
    return { dayEquivalent: 0, estimatedHours: 0, fallbackDateCount: 0, totalBusinessDays: 0, unavailable: true };
  }

  const eligibleDates = getMonthBusinessDates({
    holidays: params.holidays,
    month: params.month,
    vacations: params.vacations
  }).filter((dateKey) => isCardOpenForEstimate({ card: params.card, dateKey, doneStatusValues: params.doneStatusValues }));
  let estimatedHours = 0;
  let fallbackDateCount = 0;

  for (const dateKey of eligibleDates) {
    const openMappedCards = params.mappedCards.filter((card) =>
      isCardOpenForEstimate({ card, dateKey, doneStatusValues: params.doneStatusValues })
    );

    if (openMappedCards.length === 0) {
      continue;
    }

    const savedHours = params.savedWorkHoursByDate.get(dateKey);
    const dayHours = typeof savedHours === "number" ? savedHours : params.defaultHoursPerDay;

    if (typeof savedHours !== "number") {
      fallbackDateCount += 1;
    }

    estimatedHours += dayHours / openMappedCards.length;
  }

  const roundedHours = roundHours(estimatedHours);

  return {
    dayEquivalent: roundHours(roundedHours / params.defaultHoursPerDay),
    estimatedHours: roundedHours,
    fallbackDateCount,
    totalBusinessDays: eligibleDates.length,
    unavailable: false
  };
}

export function normalizeNotionDateToDateKey(params: { timeZone: "Asia/Seoul"; value: string }): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.value)) {
    return params.value;
  }

  const date = new Date(params.value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (params.timeZone === "Asia/Seoul") {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Seoul",
      year: "numeric"
    });

    return formatter.format(date);
  }

  return toBrowserDateKey(date);
}

export function shouldWarnAboutFallbackHours(params: { fallbackDateCount: number; totalDateCount: number }): boolean {
  return params.totalDateCount > 0 && params.fallbackDateCount / params.totalDateCount > 0.5;
}

function isOpenCandidateOnDate(params: { card: NotionCardSnapshot; dateKey: string }): boolean {
  return Boolean(params.card.startDate) && params.card.startDate <= params.dateKey && (!params.card.endDate || params.card.endDate >= params.dateKey);
}

function isCardOpenForEstimate(params: {
  card: NotionCardSnapshot;
  dateKey: string;
  doneStatusValues: string[];
}): boolean {
  if (!params.card.startDate || params.card.archived || params.card.stale || params.card.startDate > params.dateKey) {
    return false;
  }

  if (params.card.endDate) {
    return params.card.endDate >= params.dateKey;
  }

  return !isDoneWithoutEndDate(params.card, params.doneStatusValues);
}

function isDoneWithoutEndDate(card: NotionCardSnapshot, doneStatusValues: string[]): boolean {
  const done = new Set(doneStatusValues.map(normalizeValue));
  return !card.endDate && done.has(normalizeValue(card.status));
}

function getMonthBusinessDates(params: { holidays: string[]; month: string; vacations: string[] }): string[] {
  const [yearValue, monthValue] = params.month.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const excluded = new Set([...params.holidays, ...params.vacations]);
  const dateKeys: string[] = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (!isWeekendDateKey(dateKey) && !excluded.has(dateKey)) {
      dateKeys.push(dateKey);
    }
  }

  return dateKeys;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function roundHours(value: number): number {
  return Number(value.toFixed(2));
}
```

- [ ] **Step 4: Add Notion links to timesheet entry drafts**

Modify `packages/domain/src/timesheet.ts` so `TimesheetEntryDraft` includes links:

```ts
export type TimesheetEntryNotionCardDraft = {
  allocatedHours: number;
  allocationMode: "auto" | "manual";
  notionPageId: string;
  source: "manual" | "previous_business_day_default";
};

export type TimesheetEntryDraft = {
  aiTranslation: string;
  clientId: string;
  content: string;
  holidayName: string;
  hours: number;
  hoursTouched?: boolean;
  id: string;
  kind: WorkRecordKind;
  notionCards: TimesheetEntryNotionCardDraft[];
  project: string;
  sortOrder: number;
  vacationName: string;
};
```

Also update `createEmptyEntryDraft` to include `notionCards: []`.

- [ ] **Step 5: Export the domain API**

Modify `packages/domain/src/index.ts`:

```ts
export {
  allocateNotionCardHours,
  buildNotionCardEstimate,
  filterOpenNotionCardCandidates,
  normalizeNotionDateToDateKey,
  shouldWarnAboutFallbackHours
} from "./notion-cards";
export type { NotionCardEstimate, NotionCardSnapshot, WorkEntryNotionCardLink } from "./notion-cards";
export type { TimesheetDayDraft, TimesheetEntryDraft, TimesheetEntryNotionCardDraft, TimesheetRow } from "./timesheet";
```

- [ ] **Step 6: Run domain tests**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/notion-cards.ts packages/domain/src/notion-cards.test.ts packages/domain/src/timesheet.ts packages/domain/src/index.ts
git commit -m "feat(domain): add notion card rules"
```

---

### Task 2: Shared Secret Encryption

**Files:**
- Create: `packages/db/src/secret-store.ts`
- Modify: `packages/db/src/ai-settings-store.ts`

- [ ] **Step 1: Create shared encryption helpers**

Create `packages/db/src/secret-store.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { getAppSetting, setAppSetting } from "./settings-store";

async function getEncryptionSecret(): Promise<string> {
  const envSecret = process.env.AJAM_SECRET?.trim() || process.env.AJAM_AI_SECRET?.trim();

  if (envSecret) {
    return envSecret;
  }

  const storedSecret = (await getAppSetting("app_encryption_secret"))?.trim();

  if (storedSecret) {
    return storedSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  await setAppSetting("app_encryption_secret", generatedSecret);

  return generatedSecret;
}

async function getEncryptionKey(purpose: string): Promise<Buffer> {
  return scryptSync(await getEncryptionSecret(), `ajam-${purpose}`, 32);
}

export async function encryptSecret(value: string, purpose: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await getEncryptionKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export async function decryptSecret(value: string, purpose: string): Promise<string> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");

  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    return "";
  }

  const decipher = createDecipheriv("aes-256-gcm", await getEncryptionKey(purpose), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 2: Use shared helpers in AI settings**

Modify `packages/db/src/ai-settings-store.ts`:

```ts
import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { decryptSecret, encryptSecret } from "./secret-store";
```

Replace `await encryptSecret(apiKey)` with:

```ts
await encryptSecret(apiKey, "user-ai-setting")
```

Replace `await decryptSecret(encrypted)` with:

```ts
await decryptSecret(encrypted, "user-ai-setting")
```

Remove local `getEncryptionSecret`, `getEncryptionKey`, `encryptSecret`, and `decryptSecret` functions from `ai-settings-store.ts`.

- [ ] **Step 3: Typecheck DB package**

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/secret-store.ts packages/db/src/ai-settings-store.ts
git commit -m "refactor(db): share secret encryption helpers"
```

---

### Task 3: Notion Persistence Schema And Store

**Files:**
- Create: `packages/db/src/notion-store.ts`
- Modify: `packages/db/src/timesheet-store.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create Notion schema and types**

Create `packages/db/src/notion-store.ts` with these exported types and schema bootstrap:

```ts
import { randomUUID } from "node:crypto";

import type { TimesheetEntryNotionCardDraft } from "@timesheet/domain";

import { prisma } from "./client";
import { decryptSecret, encryptSecret } from "./secret-store";
import { ensureApplicationSchema } from "./settings-store";

export type NotionPropertyDescriptor = {
  id: string;
  name: string;
  type: string;
};

export type DateMappingMode = "separate_properties" | "single_range_property";
export type NotionAuthType = "internal_token" | "oauth";

export type UserNotionConnection = {
  analysisConfigVersion: number;
  authType: NotionAuthType;
  dataSourceId: string;
  dataSourceName: string;
  databaseId: string;
  dateMappingMode: DateMappingMode;
  doneStatusValues: string[];
  endDateProperty: NotionPropertyDescriptor | null;
  hasToken: boolean;
  lastSyncError: string;
  lastSyncedAt: string;
  notionApiVersion: string;
  sourceInput: string;
  startDateProperty: NotionPropertyDescriptor | null;
  statusProperty: NotionPropertyDescriptor | null;
  categoryProperty: NotionPropertyDescriptor | null;
  titleProperty: NotionPropertyDescriptor | null;
};

export type NotionCardCacheRecord = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  rawPropertiesJson: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
};

export type NotionSyncRunStatus = "success" | "failed";
export type NotionSyncScopeType = "date" | "month" | "schema" | "manual_recent" | "full";

let notionSchemaReady = false;

export async function ensureNotionSchema() {
  await ensureApplicationSchema();

  if (notionSchemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UserNotionConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'internal_token',
    "notionApiVersion" TEXT NOT NULL DEFAULT '2026-03-11',
    "accessTokenEncrypted" TEXT NOT NULL DEFAULT '',
    "refreshTokenEncrypted" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" DATETIME,
    "sourceInput" TEXT NOT NULL DEFAULT '',
    "databaseId" TEXT NOT NULL DEFAULT '',
    "dataSourceId" TEXT NOT NULL DEFAULT '',
    "dataSourceName" TEXT NOT NULL DEFAULT '',
    "titlePropertyJson" TEXT NOT NULL DEFAULT '',
    "statusPropertyJson" TEXT NOT NULL DEFAULT '',
    "categoryPropertyJson" TEXT NOT NULL DEFAULT '',
    "startDatePropertyJson" TEXT NOT NULL DEFAULT '',
    "endDatePropertyJson" TEXT NOT NULL DEFAULT '',
    "dateMappingMode" TEXT NOT NULL DEFAULT 'separate_properties',
    "doneStatusValuesJson" TEXT NOT NULL DEFAULT '[]',
    "tokenLastValidatedAt" DATETIME,
    "schemaLastFetchedAt" DATETIME,
    "analysisConfigVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedAt" DATETIME,
    "lastSyncError" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotionConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserNotionConnection_userId_key" ON "UserNotionConnection"("userId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NotionCardCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "endDate" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "lastEditedTime" TEXT NOT NULL DEFAULT '',
    "rawPropertiesJson" TEXT NOT NULL DEFAULT '',
    "archived" INTEGER NOT NULL DEFAULT 0,
    "stale" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" DATETIME,
    "analysisConfigVersionUsed" INTEGER NOT NULL DEFAULT 1,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotionCardCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NotionCardCache_userId_notionPageId_key" ON "NotionCardCache"("userId", "notionPageId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_startDate_endDate_idx" ON "NotionCardCache"("userId", "startDate", "endDate")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_status_idx" ON "NotionCardCache"("userId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionCardCache_userId_category_idx" ON "NotionCardCache"("userId", "category")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WorkEntryNotionCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timesheetEntryId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "allocatedHours" REAL NOT NULL DEFAULT 0 CHECK ("allocatedHours" >= 0),
    "allocationMode" TEXT NOT NULL DEFAULT 'auto',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkEntryNotionCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WorkEntryNotionCard_user_entry_page_key" ON "WorkEntryNotionCard"("userId", "timesheetEntryId", "notionPageId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_dateKey_idx" ON "WorkEntryNotionCard"("userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WorkEntryNotionCard_userId_notionPageId_idx" ON "WorkEntryNotionCard"("userId", "notionPageId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NotionSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeStartDate" TEXT NOT NULL DEFAULT '',
    "scopeEndDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "cardsFetched" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "analysisConfigVersionUsed" INTEGER NOT NULL DEFAULT 1,
    "partial" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NotionSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionSyncRun_scope_idx" ON "NotionSyncRun"("userId", "scopeType", "scopeStartDate", "scopeEndDate", "finishedAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NotionSyncRun_status_idx" ON "NotionSyncRun"("userId", "status", "finishedAt")`);

  notionSchemaReady = true;
}
```

- [ ] **Step 2: Add connection read/update helpers**

Append to `packages/db/src/notion-store.ts`:

```ts
type ConnectionRow = {
  accessTokenEncrypted: string;
  analysisConfigVersion: number;
  authType: string;
  categoryPropertyJson: string;
  dataSourceId: string;
  dataSourceName: string;
  databaseId: string;
  dateMappingMode: string;
  doneStatusValuesJson: string;
  endDatePropertyJson: string;
  lastSyncError: string;
  lastSyncedAt: string | null;
  notionApiVersion: string;
  sourceInput: string;
  startDatePropertyJson: string;
  statusPropertyJson: string;
  titlePropertyJson: string;
};

export async function getUserNotionConnection(userId: string): Promise<UserNotionConnection | null> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<ConnectionRow[]>(
    `SELECT "authType", "notionApiVersion", "accessTokenEncrypted", "sourceInput", "databaseId", "dataSourceId", "dataSourceName",
            "titlePropertyJson", "statusPropertyJson", "categoryPropertyJson", "startDatePropertyJson", "endDatePropertyJson",
            "dateMappingMode", "doneStatusValuesJson", "analysisConfigVersion", "lastSyncedAt", "lastSyncError"
     FROM "UserNotionConnection"
     WHERE "userId" = ?
     LIMIT 1`,
    userId
  );
  const row = rows[0];

  return row ? mapConnection(row) : null;
}

export async function getUserNotionAccessToken(userId: string): Promise<string> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<Array<{ accessTokenEncrypted: string }>>(
    `SELECT "accessTokenEncrypted" FROM "UserNotionConnection" WHERE "userId" = ? LIMIT 1`,
    userId
  );

  return rows[0]?.accessTokenEncrypted ? decryptSecret(rows[0].accessTokenEncrypted, "user-notion-token") : "";
}

export async function upsertUserNotionConnection(params: {
  accessToken?: string;
  clearToken?: boolean;
  connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
  userId: string;
}): Promise<UserNotionConnection> {
  await ensureNotionSchema();

  const existing = await prisma.$queryRawUnsafe<Array<{ accessTokenEncrypted: string; analysisConfigVersion: number }>>(
    `SELECT "accessTokenEncrypted", "analysisConfigVersion" FROM "UserNotionConnection" WHERE "userId" = ? LIMIT 1`,
    params.userId
  );
  const accessToken = params.accessToken?.trim();
  const accessTokenEncrypted = params.clearToken
    ? ""
    : accessToken
      ? await encryptSecret(accessToken, "user-notion-token")
      : existing[0]?.accessTokenEncrypted ?? "";
  const nextVersion = Math.max(params.connection.analysisConfigVersion, existing[0]?.analysisConfigVersion ?? 1);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotionConnection" (
       "id", "userId", "authType", "notionApiVersion", "accessTokenEncrypted", "sourceInput", "databaseId", "dataSourceId",
       "dataSourceName", "titlePropertyJson", "statusPropertyJson", "categoryPropertyJson", "startDatePropertyJson",
       "endDatePropertyJson", "dateMappingMode", "doneStatusValuesJson", "analysisConfigVersion", "updatedAt"
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("userId") DO UPDATE SET
       "authType" = excluded."authType",
       "notionApiVersion" = excluded."notionApiVersion",
       "accessTokenEncrypted" = excluded."accessTokenEncrypted",
       "sourceInput" = excluded."sourceInput",
       "databaseId" = excluded."databaseId",
       "dataSourceId" = excluded."dataSourceId",
       "dataSourceName" = excluded."dataSourceName",
       "titlePropertyJson" = excluded."titlePropertyJson",
       "statusPropertyJson" = excluded."statusPropertyJson",
       "categoryPropertyJson" = excluded."categoryPropertyJson",
       "startDatePropertyJson" = excluded."startDatePropertyJson",
       "endDatePropertyJson" = excluded."endDatePropertyJson",
       "dateMappingMode" = excluded."dateMappingMode",
       "doneStatusValuesJson" = excluded."doneStatusValuesJson",
       "analysisConfigVersion" = excluded."analysisConfigVersion",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    params.connection.authType,
    params.connection.notionApiVersion,
    accessTokenEncrypted,
    params.connection.sourceInput,
    params.connection.databaseId,
    params.connection.dataSourceId,
    params.connection.dataSourceName,
    JSON.stringify(params.connection.titleProperty),
    JSON.stringify(params.connection.statusProperty),
    JSON.stringify(params.connection.categoryProperty),
    JSON.stringify(params.connection.startDateProperty),
    JSON.stringify(params.connection.endDateProperty),
    params.connection.dateMappingMode,
    JSON.stringify(params.connection.doneStatusValues),
    nextVersion
  );

  const updated = await getUserNotionConnection(params.userId);

  if (!updated) {
    throw new Error("Notion 연결 설정을 저장하지 못했습니다.");
  }

  return updated;
}

function mapConnection(row: ConnectionRow): UserNotionConnection {
  return {
    analysisConfigVersion: row.analysisConfigVersion,
    authType: row.authType === "oauth" ? "oauth" : "internal_token",
    dataSourceId: row.dataSourceId,
    dataSourceName: row.dataSourceName,
    databaseId: row.databaseId,
    dateMappingMode: row.dateMappingMode === "single_range_property" ? "single_range_property" : "separate_properties",
    doneStatusValues: parseJson<string[]>(row.doneStatusValuesJson, []),
    endDateProperty: parseJson<NotionPropertyDescriptor | null>(row.endDatePropertyJson, null),
    hasToken: Boolean(row.accessTokenEncrypted),
    lastSyncError: row.lastSyncError,
    lastSyncedAt: row.lastSyncedAt ?? "",
    notionApiVersion: row.notionApiVersion || "2026-03-11",
    sourceInput: row.sourceInput,
    startDateProperty: parseJson<NotionPropertyDescriptor | null>(row.startDatePropertyJson, null),
    statusProperty: parseJson<NotionPropertyDescriptor | null>(row.statusPropertyJson, null),
    categoryProperty: parseJson<NotionPropertyDescriptor | null>(row.categoryPropertyJson, null),
    titleProperty: parseJson<NotionPropertyDescriptor | null>(row.titlePropertyJson, null)
  };
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 3: Add cache, sync-run, and link helpers**

Append to `packages/db/src/notion-store.ts`:

```ts
export async function upsertNotionCardCache(params: {
  analysisConfigVersion: number;
  cards: NotionCardCacheRecord[];
  userId: string;
}) {
  await ensureNotionSchema();

  for (const card of params.cards) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "NotionCardCache" (
         "id", "userId", "notionPageId", "title", "status", "category", "startDate", "endDate", "url", "lastEditedTime",
         "rawPropertiesJson", "archived", "stale", "lastSeenAt", "analysisConfigVersionUsed", "syncedAt", "updatedAt"
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT("userId", "notionPageId") DO UPDATE SET
         "title" = excluded."title",
         "status" = excluded."status",
         "category" = excluded."category",
         "startDate" = excluded."startDate",
         "endDate" = excluded."endDate",
         "url" = excluded."url",
         "lastEditedTime" = excluded."lastEditedTime",
         "rawPropertiesJson" = excluded."rawPropertiesJson",
         "archived" = excluded."archived",
         "stale" = excluded."stale",
         "lastSeenAt" = CURRENT_TIMESTAMP,
         "analysisConfigVersionUsed" = excluded."analysisConfigVersionUsed",
         "syncedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      params.userId,
      card.notionPageId,
      card.title,
      card.status,
      card.category,
      card.startDate,
      card.endDate,
      card.url,
      card.lastEditedTime,
      card.rawPropertiesJson,
      card.archived ? 1 : 0,
      card.stale ? 1 : 0,
      params.analysisConfigVersion
    );
  }
}

export async function listCachedNotionCards(params: {
  endDateKey: string;
  startDateKey: string;
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  await ensureNotionSchema();

  const rows = await prisma.$queryRawUnsafe<Array<NotionCardCacheRecord & { archived: number; stale: number }>>(
    `SELECT "notionPageId", "title", "status", "category", "startDate", "endDate", "url", "lastEditedTime", "rawPropertiesJson", "archived", "stale"
     FROM "NotionCardCache"
     WHERE "userId" = ?
       AND trim("startDate") <> ''
       AND "startDate" <= ?
       AND (trim("endDate") = '' OR "endDate" >= ?)
     ORDER BY "startDate" ASC, "title" ASC`,
    params.userId,
    params.endDateKey,
    params.startDateKey
  );

  return rows.map((row) => ({ ...row, archived: Boolean(row.archived), stale: Boolean(row.stale) }));
}

export async function replaceEntryNotionCards(params: {
  dateKey: string;
  links: TimesheetEntryNotionCardDraft[];
  timesheetEntryId: string;
  userId: string;
}) {
  await ensureNotionSchema();

  await prisma.$executeRawUnsafe(
    `DELETE FROM "WorkEntryNotionCard" WHERE "userId" = ? AND "timesheetEntryId" = ?`,
    params.userId,
    params.timesheetEntryId
  );

  for (const link of params.links) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WorkEntryNotionCard" ("id", "userId", "timesheetEntryId", "dateKey", "notionPageId", "allocatedHours", "allocationMode", "source", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      randomUUID(),
      params.userId,
      params.timesheetEntryId,
      params.dateKey,
      link.notionPageId,
      link.allocatedHours,
      link.allocationMode,
      link.source
    );
  }
}

export async function recordNotionSyncRun(params: {
  analysisConfigVersion: number;
  cardsFetched: number;
  errorCode?: string;
  errorMessage?: string;
  partial: boolean;
  scopeEndDate: string;
  scopeStartDate: string;
  scopeType: NotionSyncScopeType;
  status: NotionSyncRunStatus;
  userId: string;
}) {
  await ensureNotionSchema();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "NotionSyncRun" ("id", "userId", "scopeType", "scopeStartDate", "scopeEndDate", "status", "finishedAt", "cardsFetched", "errorCode", "errorMessage", "analysisConfigVersionUsed", "partial")
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
    randomUUID(),
    params.userId,
    params.scopeType,
    params.scopeStartDate,
    params.scopeEndDate,
    params.status,
    params.cardsFetched,
    params.errorCode ?? "",
    params.errorMessage ?? "",
    params.analysisConfigVersion,
    params.partial ? 1 : 0
  );
}
```

- [ ] **Step 4: Wire timesheet save/list to Notion card links**

Modify `packages/db/src/timesheet-store.ts`:

1. Import `ensureNotionSchema` near the top.
2. Add `notionCards` to each `StoredTimesheetEntry`.
3. In `ensureTimesheetSchema`, call `await ensureNotionSchema()` after `ensureApplicationSchema()` is available through existing imports.
4. When listing entries, query `WorkEntryNotionCard` for loaded entry IDs and attach links.
5. In `saveTimesheetDayInTransaction`, after inserting each `TimesheetEntry`, insert the entry's `notionCards`.

Use this insertion code inside the existing entry insert loop after the `TimesheetEntry` insert:

```ts
const entryId = entry.id || randomUUID();

for (const link of entry.notionCards) {
  await params.transaction.$executeRawUnsafe(
    `INSERT INTO "WorkEntryNotionCard" ("id", "userId", "timesheetEntryId", "dateKey", "notionPageId", "allocatedHours", "allocationMode", "source", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    randomUUID(),
    params.userId,
    entryId,
    params.day.dateKey,
    link.notionPageId,
    link.allocatedHours,
    link.allocationMode,
    link.source
  );
}
```

Also update `normalizeEntry` to preserve `notionCards` for `WORK` entries and clear it for non-work entries.

- [ ] **Step 5: Export Notion store APIs**

Modify `packages/db/src/index.ts`:

```ts
export {
  ensureNotionSchema,
  getUserNotionAccessToken,
  getUserNotionConnection,
  listCachedNotionCards,
  recordNotionSyncRun,
  replaceEntryNotionCards,
  upsertNotionCardCache,
  upsertUserNotionConnection
} from "./notion-store";
export type {
  DateMappingMode,
  NotionAuthType,
  NotionCardCacheRecord,
  NotionPropertyDescriptor,
  NotionSyncScopeType,
  NotionSyncRunStatus,
  UserNotionConnection
} from "./notion-store";
```

- [ ] **Step 6: Typecheck DB package**

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/notion-store.ts packages/db/src/timesheet-store.ts packages/db/src/index.ts
git commit -m "feat(db): add notion card persistence"
```

---

### Task 4: Notion Data Source Sync

**Files:**
- Create: `packages/db/src/notion-sync.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add Notion sync client**

Create `packages/db/src/notion-sync.ts`:

```ts
import { normalizeNotionDateToDateKey, type NotionCardSnapshot } from "@timesheet/domain";

import {
  getUserNotionAccessToken,
  getUserNotionConnection,
  recordNotionSyncRun,
  upsertNotionCardCache,
  type NotionCardCacheRecord,
  type NotionPropertyDescriptor,
  type UserNotionConnection
} from "./notion-store";

type NotionDataSourceSchema = {
  id: string;
  name?: string;
  properties: Record<string, { id: string; name?: string; type: string }>;
};

type NotionPage = {
  archived?: boolean;
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
  url?: string;
};

type QueryResponse = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: NotionPage[];
};

const notionApiVersion = "2026-03-11";
const pageSize = 100;
const maxPagesPerSync = 20;

export async function retrieveNotionDataSourceSchema(params: {
  dataSourceId: string;
  token: string;
}): Promise<NotionDataSourceSchema> {
  const response = await notionFetch({
    method: "GET",
    path: `/v1/data_sources/${encodeURIComponent(params.dataSourceId)}`,
    token: params.token
  });

  return response as NotionDataSourceSchema;
}

export async function syncNotionCardsForDate(params: {
  dateKey: string;
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  const connection = await requireConnection(params.userId);
  const token = await getUserNotionAccessToken(params.userId);

  try {
    const result = await queryDataSourcePages({
      connection,
      filter: buildDateCandidateFilter({ connection, dateKey: params.dateKey }),
      token
    });
    const cards = result.pages.map((page) => normalizePage({ connection, page }));

    await upsertNotionCardCache({ analysisConfigVersion: connection.analysisConfigVersion, cards, userId: params.userId });
    await recordNotionSyncRun({
      analysisConfigVersion: connection.analysisConfigVersion,
      cardsFetched: cards.length,
      partial: result.partial,
      scopeEndDate: params.dateKey,
      scopeStartDate: params.dateKey,
      scopeType: "date",
      status: "success",
      userId: params.userId
    });

    return cards;
  } catch (error) {
    await recordNotionSyncRun({
      analysisConfigVersion: connection.analysisConfigVersion,
      cardsFetched: 0,
      errorCode: getNotionErrorCode(error),
      errorMessage: getNotionErrorMessage(error),
      partial: false,
      scopeEndDate: params.dateKey,
      scopeStartDate: params.dateKey,
      scopeType: "date",
      status: "failed",
      userId: params.userId
    });
    throw error;
  }
}

async function queryDataSourcePages(params: {
  connection: UserNotionConnection;
  filter: unknown;
  token: string;
}): Promise<{ pages: NotionPage[]; partial: boolean }> {
  const pages: NotionPage[] = [];
  let startCursor = "";
  let requestCount = 0;

  while (requestCount < maxPagesPerSync) {
    const response = (await notionFetch({
      body: {
        filter: params.filter,
        page_size: pageSize,
        start_cursor: startCursor || undefined
      },
      method: "POST",
      path: `/v1/data_sources/${encodeURIComponent(params.connection.dataSourceId)}/query`,
      token: params.token
    })) as QueryResponse;

    pages.push(...(response.results ?? []));
    requestCount += 1;

    if (!response.has_more || !response.next_cursor) {
      return { pages, partial: false };
    }

    startCursor = response.next_cursor;
  }

  return { pages, partial: true };
}

function buildDateCandidateFilter(params: { connection: UserNotionConnection; dateKey: string }): unknown {
  const startProperty = params.connection.dateMappingMode === "single_range_property"
    ? params.connection.startDateProperty
    : params.connection.startDateProperty;
  const endProperty = params.connection.dateMappingMode === "single_range_property"
    ? params.connection.startDateProperty
    : params.connection.endDateProperty;

  if (!startProperty) {
    throw new Error("Notion 시작 날짜 필드 매핑이 필요합니다.");
  }

  const startFilter = {
    property: startProperty.name,
    date: { on_or_before: params.dateKey }
  };

  if (!endProperty) {
    return startFilter;
  }

  return {
    and: [
      startFilter,
      {
        or: [
          { property: endProperty.name, date: { is_empty: true } },
          { property: endProperty.name, date: { on_or_after: params.dateKey } }
        ]
      }
    ]
  };
}

function normalizePage(params: { connection: UserNotionConnection; page: NotionPage }): NotionCardCacheRecord {
  const properties = params.page.properties ?? {};
  const title = getPropertyText(properties, params.connection.titleProperty);
  const status = getPropertyText(properties, params.connection.statusProperty);
  const category = getPropertyText(properties, params.connection.categoryProperty);
  const dateValues = getDateValues(properties, params.connection);
  const rawPropertiesJson = JSON.stringify({
    category: pickRawProperty(properties, params.connection.categoryProperty),
    date: params.connection.dateMappingMode === "single_range_property"
      ? pickRawProperty(properties, params.connection.startDateProperty)
      : undefined,
    endDate: pickRawProperty(properties, params.connection.endDateProperty),
    startDate: pickRawProperty(properties, params.connection.startDateProperty),
    status: pickRawProperty(properties, params.connection.statusProperty),
    title: pickRawProperty(properties, params.connection.titleProperty)
  });

  return {
    archived: Boolean(params.page.archived),
    category,
    endDate: dateValues.endDate,
    lastEditedTime: params.page.last_edited_time ?? "",
    notionPageId: params.page.id,
    rawPropertiesJson,
    stale: false,
    startDate: dateValues.startDate,
    status,
    title,
    url: params.page.url ?? ""
  };
}

function getDateValues(properties: Record<string, unknown>, connection: UserNotionConnection) {
  const startRaw = pickRawProperty(properties, connection.startDateProperty);
  const endRaw = connection.dateMappingMode === "single_range_property"
    ? startRaw
    : pickRawProperty(properties, connection.endDateProperty);

  return {
    startDate: normalizeRawDate(startRaw, "start"),
    endDate: normalizeRawDate(endRaw, connection.dateMappingMode === "single_range_property" ? "end" : "start")
  };
}

function normalizeRawDate(value: unknown, part: "start" | "end"): string {
  const date = (value as { date?: { end?: string; start?: string } } | undefined)?.date;
  const rawValue = part === "start" ? date?.start : date?.end;

  return rawValue ? normalizeNotionDateToDateKey({ timeZone: "Asia/Seoul", value: rawValue }) : "";
}

function getPropertyText(properties: Record<string, unknown>, descriptor: NotionPropertyDescriptor | null): string {
  const property = pickRawProperty(properties, descriptor) as
    | { rich_text?: Array<{ plain_text?: string }>; select?: { name?: string }; status?: { name?: string }; title?: Array<{ plain_text?: string }> }
    | undefined;

  return (
    property?.title?.map((item) => item.plain_text ?? "").join("").trim() ||
    property?.rich_text?.map((item) => item.plain_text ?? "").join("").trim() ||
    property?.status?.name?.trim() ||
    property?.select?.name?.trim() ||
    ""
  );
}

function pickRawProperty(properties: Record<string, unknown>, descriptor: NotionPropertyDescriptor | null): unknown {
  if (!descriptor) {
    return undefined;
  }

  return properties[descriptor.name] ?? Object.values(properties).find((value) => (value as { id?: string }).id === descriptor.id);
}

async function requireConnection(userId: string): Promise<UserNotionConnection> {
  const connection = await getUserNotionConnection(userId);
  const token = await getUserNotionAccessToken(userId);

  if (!connection || !connection.dataSourceId || !token) {
    throw new Error("Notion 연결 설정이 필요합니다.");
  }

  return connection;
}

async function notionFetch(params: {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  token: string;
}): Promise<unknown> {
  const response = await fetch(`https://api.notion.com${params.path}`, {
    body: params.body ? JSON.stringify(params.body) : undefined,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
      "Notion-Version": notionApiVersion
    },
    method: params.method
  });

  if (!response.ok) {
    throw new Error(mapNotionStatus(response.status));
  }

  return response.json();
}

function mapNotionStatus(status: number): string {
  if (status === 404) {
    return "데이터 소스를 찾을 수 없거나 이 integration에 공유되지 않았습니다. Notion의 Add connections를 확인해 주세요.";
  }

  if (status === 403) {
    return "이 integration에 읽기 권한이 없습니다. Notion integration capability 설정을 확인해 주세요.";
  }

  if (status === 429) {
    return "Notion 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  return `Notion 요청에 실패했습니다. (${status})`;
}

function getNotionErrorCode(error: unknown): string {
  return error instanceof Error ? error.message.match(/\((\d+)\)/)?.[1] ?? "" : "";
}

function getNotionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Notion 동기화에 실패했습니다.";
}
```

- [ ] **Step 2: Export sync APIs**

Modify `packages/db/src/index.ts`:

```ts
export { retrieveNotionDataSourceSchema, syncNotionCardsForDate } from "./notion-sync";
```

- [ ] **Step 3: Typecheck DB package**

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/notion-sync.ts packages/db/src/index.ts
git commit -m "feat(db): add notion data source sync"
```

---

### Task 5: Server Actions And Notion Card Page Shell

**Files:**
- Create: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Create: `apps/web/src/app/(app)/notion-cards/page.tsx`
- Create: `apps/web/src/components/notion-cards/types.ts`
- Create: `apps/web/src/components/notion-cards/use-notion-card-month.ts`
- Create: `apps/web/src/components/notion-cards/notion-connection-panel.tsx`
- Create: `apps/web/src/components/notion-cards/notion-card-table.tsx`
- Create: `apps/web/src/components/notion-cards/notion-card-workspace.tsx`
- Modify: `apps/web/src/app/(app)/app-nav.tsx`

- [ ] **Step 1: Add server actions**

Create `apps/web/src/app/(app)/notion-cards/actions.ts`:

```ts
"use server";

import {
  getManagedUser,
  getUserNotionConnection,
  listCachedNotionCards,
  retrieveNotionDataSourceSchema,
  syncNotionCardsForDate,
  upsertUserNotionConnection,
  type UserNotionConnection
} from "@timesheet/db";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";

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

export async function getNotionConnectionAction() {
  const user = await requireSession();

  return getUserNotionConnection(user.id);
}

export async function saveNotionConnectionAction(params: {
  accessToken?: string;
  clearToken?: boolean;
  connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
}) {
  const user = await requireSession();

  return upsertUserNotionConnection({ ...params, userId: user.id });
}

export async function testNotionDataSourceAction(params: { dataSourceId: string; token: string }) {
  await requireSession();

  const schema = await retrieveNotionDataSourceSchema({
    dataSourceId: params.dataSourceId.trim(),
    token: params.token.trim()
  });

  return {
    id: schema.id,
    properties: schema.properties
  };
}

export async function syncNotionDateCandidatesAction(dateKey: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  return syncNotionCardsForDate({ dateKey, userId: user.id });
}

export async function listNotionCardsForMonthAction(month: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("월 형식이 올바르지 않습니다.");
  }

  const [year, monthValue] = month.split("-").map(Number);
  const startDateKey = `${year}-${String(monthValue).padStart(2, "0")}-01`;
  const endDateKey = `${year}-${String(monthValue).padStart(2, "0")}-${String(new Date(year, monthValue, 0).getDate()).padStart(2, "0")}`;

  return listCachedNotionCards({ endDateKey, startDateKey, userId: user.id });
}
```

- [ ] **Step 2: Add Notion card page**

Create `apps/web/src/app/(app)/notion-cards/page.tsx`:

```tsx
import type { Metadata } from "next";

import { NotionCardWorkspace } from "@/components/notion-cards/notion-card-workspace";

import {
  getNotionConnectionAction,
  listNotionCardsForMonthAction,
  saveNotionConnectionAction,
  syncNotionDateCandidatesAction,
  testNotionDataSourceAction
} from "./actions";

export const metadata: Metadata = {
  title: "Notion 카드"
};

export default async function NotionCardsPage() {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const connection = await getNotionConnectionAction();

  return (
    <NotionCardWorkspace
      initialConnection={connection}
      initialMonth={month}
      listCardsForMonthAction={listNotionCardsForMonthAction}
      saveConnectionAction={saveNotionConnectionAction}
      syncDateCandidatesAction={syncNotionDateCandidatesAction}
      testDataSourceAction={testNotionDataSourceAction}
    />
  );
}
```

- [ ] **Step 3: Add shared Notion card UI types**

Create `apps/web/src/components/notion-cards/types.ts`:

```ts
import type { NotionCardCacheRecord, UserNotionConnection } from "@timesheet/db";

export type NotionCardWorkspaceProps = {
  initialConnection: UserNotionConnection | null;
  initialMonth: string;
  listCardsForMonthAction: (month: string) => Promise<NotionCardCacheRecord[]>;
  saveConnectionAction: (params: {
    accessToken?: string;
    clearToken?: boolean;
    connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
  }) => Promise<UserNotionConnection>;
  syncDateCandidatesAction: (dateKey: string) => Promise<NotionCardCacheRecord[]>;
  testDataSourceAction: (params: { dataSourceId: string; token: string }) => Promise<{ id: string; properties: Record<string, unknown> }>;
};

export type NotionConnectionPanelProps = {
  connection: UserNotionConnection | null;
  onMessage: (message: string) => void;
};

export type NotionCardTableProps = {
  cards: NotionCardCacheRecord[];
};
```

- [ ] **Step 4: Add month loading hook**

Create `apps/web/src/components/notion-cards/use-notion-card-month.ts`:

```ts
"use client";

import { useEffect, useState, useTransition } from "react";

import type { NotionCardCacheRecord } from "@timesheet/db";

export function useNotionCardMonth(params: {
  initialMonth: string;
  listCardsForMonthAction: (month: string) => Promise<NotionCardCacheRecord[]>;
}) {
  const [cards, setCards] = useState<NotionCardCacheRecord[]>([]);
  const [month, setMonth] = useState(params.initialMonth);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function loadMonth(nextMonth = month) {
    startTransition(async () => {
      try {
        setError("");
        setCards(await params.listCardsForMonthAction(nextMonth));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Notion 카드 목록을 불러오지 못했습니다.");
      }
    });
  }

  useEffect(() => {
    loadMonth(month);
  }, [month]);

  return {
    cards,
    error,
    isPending,
    loadMonth,
    month,
    setMonth
  };
}
```

- [ ] **Step 5: Add connection panel component**

Create `apps/web/src/components/notion-cards/notion-connection-panel.tsx`:

```tsx
"use client";

import { Settings } from "lucide-react";

import { Button, Input, Label } from "@timesheet/ui";

import type { NotionConnectionPanelProps } from "./types";

export function NotionConnectionPanel({ connection, onMessage }: NotionConnectionPanelProps) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Settings aria-hidden="true" className="size-4 text-slate-500" />
        <h3 className="font-bold text-slate-950">연결 설정</h3>
      </div>
      <Label htmlFor="notion-token">Notion token</Label>
      <Input className="mt-2" id="notion-token" placeholder={connection?.hasToken ? "저장됨" : "secret_..."} type="password" />
      <Label className="mt-4" htmlFor="notion-source">Database/Data source URL or ID</Label>
      <Input className="mt-2" id="notion-source" placeholder="Notion URL 또는 ID" defaultValue={connection?.sourceInput ?? ""} />
      <Button
        className="mt-4 h-9 px-3"
        onClick={() => {
          onMessage("필드 매핑 저장 UI는 다음 task에서 연결합니다.");
        }}
        type="button"
      >
        설정 저장
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Add card table component**

Create `apps/web/src/components/notion-cards/notion-card-table.tsx`:

```tsx
"use client";

import type { NotionCardTableProps } from "./types";

export function NotionCardTable({ cards }: NotionCardTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <div className="grid min-w-[880px] grid-cols-[minmax(260px,1fr)_140px_140px_120px_160px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
        <span>카드</span>
        <span>상태</span>
        <span>분류</span>
        <span>기간</span>
        <span>업무기록 연결</span>
      </div>
      {cards.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm font-semibold text-slate-500">표시할 캐시 카드가 없습니다.</div>
      ) : (
        cards.map((card) => (
          <div className="grid min-w-[880px] grid-cols-[minmax(260px,1fr)_140px_140px_120px_160px] gap-3 border-b border-slate-100 px-4 py-3 text-sm" key={card.notionPageId}>
            <span className="font-bold text-slate-950">{card.title || "(제목 없음)"}</span>
            <span>{card.status || "-"}</span>
            <span>{card.category || "미분류"}</span>
            <span>{card.startDate || "-"} ~ {card.endDate || ""}</span>
            <span>업무기록 연결 계산 전</span>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add thin workspace coordinator**

Create `apps/web/src/components/notion-cards/notion-card-workspace.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button, Input } from "@timesheet/ui";

import { NotionCardTable } from "./notion-card-table";
import { NotionConnectionPanel } from "./notion-connection-panel";
import type { NotionCardWorkspaceProps } from "./types";
import { useNotionCardMonth } from "./use-notion-card-month";

export function NotionCardWorkspace({
  initialConnection,
  initialMonth,
  listCardsForMonthAction
}: NotionCardWorkspaceProps) {
  const [message, setMessage] = useState("");
  const { cards, error, isPending, loadMonth, month, setMonth } = useNotionCardMonth({ initialMonth, listCardsForMonthAction });

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Notion 카드</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{initialConnection?.hasToken ? "Notion 연결됨" : "Notion 연결이 필요합니다."}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input className="h-9 w-36" onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
            <Button className="h-9 px-3" disabled={isPending} onClick={() => loadMonth()} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" className="size-4" />
              새로고침
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[360px_1fr]">
          <div>
            <NotionConnectionPanel connection={initialConnection} onMessage={setMessage} />
            {message ? <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p> : null}
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
          </div>

          <NotionCardTable cards={cards} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 8: Add nav item**

Modify `apps/web/src/app/(app)/app-nav.tsx`:

```tsx
import { Bot, CalendarDays, FolderKanban, PanelsTopLeft } from "lucide-react";

const navItems = [
  { href: "/timesheet", icon: CalendarDays, label: "업무 기록" },
  { href: "/ai-summary", icon: Bot, label: "AI 월말 정리" },
  { href: "/projects", icon: FolderKanban, label: "프로젝트 관리" },
  { href: "/notion-cards", icon: PanelsTopLeft, label: "Notion 카드" }
];
```

- [ ] **Step 9: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/\(app\)/notion-cards/actions.ts apps/web/src/app/\(app\)/notion-cards/page.tsx apps/web/src/components/notion-cards/types.ts apps/web/src/components/notion-cards/use-notion-card-month.ts apps/web/src/components/notion-cards/notion-connection-panel.tsx apps/web/src/components/notion-cards/notion-card-table.tsx apps/web/src/components/notion-cards/notion-card-workspace.tsx apps/web/src/app/\(app\)/app-nav.tsx
git commit -m "feat(web): add notion card workspace shell"
```

---

### Task 6: Timesheet Work Entry Card Linking

**Files:**
- Modify: `apps/web/src/app/(app)/timesheet/actions.ts`
- Modify: `apps/web/src/app/(app)/timesheet/page.tsx`
- Create: `apps/web/src/components/timesheet/use-notion-card-candidates.ts`
- Create: `apps/web/src/components/timesheet/notion-card-link-section.tsx`
- Create: `apps/web/src/components/timesheet/notion-card-picker-modal.tsx`
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`

- [ ] **Step 1: Add server actions for candidates**

Modify `apps/web/src/app/(app)/timesheet/actions.ts` imports:

```ts
import {
  listCachedNotionCards,
  syncNotionCardsForDate,
  type NotionCardCacheRecord
} from "@timesheet/db";
```

Append actions:

```ts
export async function loadNotionCardCandidatesAction(dateKey: string): Promise<NotionCardCacheRecord[]> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  try {
    return await syncNotionCardsForDate({ dateKey, userId: user.id });
  } catch {
    return listCachedNotionCards({ endDateKey: dateKey, startDateKey: dateKey, userId: user.id });
  }
}
```

- [ ] **Step 2: Pass candidate action to workspace**

Modify `apps/web/src/app/(app)/timesheet/page.tsx` imports and JSX:

```tsx
import {
  loadNotionCardCandidatesAction,
  // keep existing imports
} from "./actions";
```

Add prop:

```tsx
loadNotionCardCandidatesAction={loadNotionCardCandidatesAction}
```

- [ ] **Step 3: Add candidate loading hook**

Create `apps/web/src/components/timesheet/use-notion-card-candidates.ts`:

```ts
"use client";

import { useState, useTransition } from "react";

export type NotionCardCandidate = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  rawPropertiesJson: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
};

export function useNotionCardCandidates(params: {
  loadNotionCardCandidatesAction: (dateKey: string) => Promise<NotionCardCandidate[]>;
}) {
  const [candidatesByDate, setCandidatesByDate] = useState<Record<string, NotionCardCandidate[]>>({});
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function loadCandidates(dateKey: string) {
    startTransition(async () => {
      try {
        setError("");
        const candidates = await params.loadNotionCardCandidatesAction(dateKey);
        setCandidatesByDate((current) => ({ ...current, [dateKey]: candidates }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Notion 카드 후보를 불러오지 못했습니다.");
      }
    });
  }

  return {
    candidatesByDate,
    error,
    isPending,
    loadCandidates
  };
}
```

- [ ] **Step 4: Add linked card section component**

Create `apps/web/src/components/timesheet/notion-card-link-section.tsx`:

```tsx
"use client";

import type { TimesheetEntryDraft } from "@timesheet/domain";

import type { NotionCardCandidate } from "./use-notion-card-candidates";

type NotionCardLinkSectionProps = {
  candidates: NotionCardCandidate[];
  entry: TimesheetEntryDraft;
  onOpenPicker: () => void;
};

export function NotionCardLinkSection({ candidates, entry, onOpenPicker }: NotionCardLinkSectionProps) {
  if (entry.kind !== "WORK") {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {entry.notionCards.map((link) => {
        const card = candidates.find((candidate) => candidate.notionPageId === link.notionPageId);

        return (
          <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700" key={link.notionPageId}>
            {card?.title || link.notionPageId}
            <span className="ml-1 font-semibold text-slate-400">{link.allocatedHours}h</span>
          </span>
        );
      })}
      <button
        className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition hover:text-slate-950"
        onClick={onOpenPicker}
        type="button"
      >
        + 카드
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add card picker modal component**

Create `apps/web/src/components/timesheet/notion-card-picker-modal.tsx`:

```tsx
"use client";

import type { NotionCardCandidate } from "./use-notion-card-candidates";

type NotionCardPickerModalProps = {
  candidates: NotionCardCandidate[];
  error: string;
  onClose: () => void;
  onToggleCard: (notionPageId: string) => void;
  open: boolean;
};

export function NotionCardPickerModal({ candidates, error, onClose, onToggleCard, open }: NotionCardPickerModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 px-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950">Notion 카드 연결</h3>
          <button className="text-sm font-bold text-slate-500" onClick={onClose} type="button">
            닫기
          </button>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
          {candidates.map((card) => (
            <button
              className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm transition hover:bg-slate-50"
              key={card.notionPageId}
              onClick={() => onToggleCard(card.notionPageId)}
              type="button"
            >
              <span>
                <span className="block font-bold text-slate-950">{card.title || "(제목 없음)"}</span>
                <span className="text-xs font-semibold text-slate-500">{card.status || "-"} · {card.category || "미분류"}</span>
              </span>
              <span className="text-xs font-bold text-slate-400">
                {card.startDate}~{card.endDate || ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire small components into the existing workspace**

Modify `TimesheetWorkspaceProps` in `apps/web/src/components/timesheet/timesheet-workspace.tsx`:

```ts
import { NotionCardLinkSection } from "./notion-card-link-section";
import { NotionCardPickerModal } from "./notion-card-picker-modal";
import { useNotionCardCandidates, type NotionCardCandidate } from "./use-notion-card-candidates";

type TimesheetWorkspaceProps = {
  loadNotionCardCandidatesAction: (dateKey: string) => Promise<NotionCardCandidate[]>;
  // keep existing props
};
```

Add local state inside `TimesheetWorkspace`:

```ts
const [editingNotionEntryClientId, setEditingNotionEntryClientId] = useState<string | null>(null);
const notionCandidates = useNotionCardCandidates({ loadNotionCardCandidatesAction });
```

- [ ] **Step 7: Render link section from the entry editor**

Inside the work-entry editor block, render this after the content textarea:

```tsx
<NotionCardLinkSection
  candidates={notionCandidates.candidatesByDate[selectedDateKey] ?? []}
  entry={entry}
  onOpenPicker={() => {
    setEditingNotionEntryClientId(entry.clientId || entry.id);
    notionCandidates.loadCandidates(selectedDateKey);
  }}
/>
```

- [ ] **Step 8: Render picker modal once near existing modals**

Near existing modal rendering in `TimesheetWorkspace`, add:

```tsx
<NotionCardPickerModal
  candidates={notionCandidates.candidatesByDate[selectedDateKey] ?? []}
  error={notionCandidates.error}
  onClose={() => setEditingNotionEntryClientId(null)}
  onToggleCard={(notionPageId) => {
    if (editingNotionEntryClientId) {
      toggleNotionCardForEntry(editingNotionEntryClientId, notionPageId);
    }
  }}
  open={Boolean(editingNotionEntryClientId)}
/>
```

Add helper inside component:

```ts
function toggleNotionCardForEntry(entryClientId: string, notionPageId: string) {
  updateSelectedDay({
    entries: selectedDay.entries.map((entry) => {
      if ((entry.clientId || entry.id) !== entryClientId || entry.kind !== "WORK") {
        return entry;
      }

      const exists = entry.notionCards.some((link) => link.notionPageId === notionPageId);
      const nextLinks = exists
        ? entry.notionCards.filter((link) => link.notionPageId !== notionPageId)
        : [
            ...entry.notionCards,
            {
              allocatedHours: 0,
              allocationMode: "auto" as const,
              notionPageId,
              source: "manual" as const
            }
          ];
      const allocatedHours = nextLinks.length > 0 ? Number((entry.hours / nextLinks.length).toFixed(2)) : 0;

      return {
        ...entry,
        notionCards: nextLinks.map((link) =>
          link.allocationMode === "auto" ? { ...link, allocatedHours } : link
        )
      };
    })
  });
}
```

Place `toggleNotionCardForEntry` inside `TimesheetWorkspace` after the existing `updateSelectedEntry` helper so it can use `selectedDay` and `updateSelectedDay`.

- [ ] **Step 9: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/\(app\)/timesheet/actions.ts apps/web/src/app/\(app\)/timesheet/page.tsx apps/web/src/components/timesheet/use-notion-card-candidates.ts apps/web/src/components/timesheet/notion-card-link-section.tsx apps/web/src/components/timesheet/notion-card-picker-modal.tsx apps/web/src/components/timesheet/timesheet-workspace.tsx
git commit -m "feat(web): link notion cards to work entries"
```

---

### Task 7: Monthly Notion Analysis

**Files:**
- Modify: `packages/domain/src/notion-cards.ts`
- Modify: `packages/domain/src/notion-cards.test.ts`
- Modify: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Create: `apps/web/src/components/notion-cards/notion-category-summary.tsx`
- Modify: `apps/web/src/components/notion-cards/notion-card-workspace.tsx`

- [ ] **Step 1: Add category summary test**

Append to `packages/domain/src/notion-cards.test.ts`:

```ts
import { buildNotionCategorySummary } from "./notion-cards.js";

describe("Notion category summary", () => {
  it("groups completed mapped cards by category and keeps uncategorized cards under 미분류", () => {
    const summary = buildNotionCategorySummary({
      cards: [
        { category: "Feature", estimatedHours: 10, linkedHours: 6, notionPageId: "a" },
        { category: "", estimatedHours: 4, linkedHours: 2, notionPageId: "b" }
      ]
    });

    assert.deepEqual(summary, [
      { cardCount: 1, category: "Feature", estimatedHours: 10, linkedHours: 6 },
      { cardCount: 1, category: "미분류", estimatedHours: 4, linkedHours: 2 }
    ]);
  });
});
```

- [ ] **Step 2: Implement category summary**

Append to `packages/domain/src/notion-cards.ts`:

```ts
export type NotionCardSummaryInput = {
  category: string;
  estimatedHours: number;
  linkedHours: number;
  notionPageId: string;
};

export type NotionCategorySummary = {
  cardCount: number;
  category: string;
  estimatedHours: number;
  linkedHours: number;
};

export function buildNotionCategorySummary(params: { cards: NotionCardSummaryInput[] }): NotionCategorySummary[] {
  const summaries = new Map<string, NotionCategorySummary>();

  for (const card of params.cards) {
    const category = card.category.trim() || "미분류";
    const current = summaries.get(category) ?? {
      cardCount: 0,
      category,
      estimatedHours: 0,
      linkedHours: 0
    };

    current.cardCount += 1;
    current.estimatedHours = roundHours(current.estimatedHours + card.estimatedHours);
    current.linkedHours = roundHours(current.linkedHours + card.linkedHours);
    summaries.set(category, current);
  }

  return Array.from(summaries.values()).sort((left, right) => right.estimatedHours - left.estimatedHours || left.category.localeCompare(right.category, "ko-KR"));
}
```

Export it from `packages/domain/src/index.ts`.

- [ ] **Step 3: Add monthly analysis action shape**

Modify `apps/web/src/app/(app)/notion-cards/actions.ts`:

```ts
import { buildNotionCardEstimate, buildNotionCategorySummary } from "@timesheet/domain";
import { listHolidays, listTimesheetEntries, listVacations } from "@timesheet/db";

export async function buildNotionMonthlyAnalysisAction(month: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("월 형식이 올바르지 않습니다.");
  }

  const [year, monthValue] = month.split("-").map(Number);
  const startDateKey = `${year}-${String(monthValue).padStart(2, "0")}-01`;
  const endDateKey = `${year}-${String(monthValue).padStart(2, "0")}-${String(new Date(year, monthValue, 0).getDate()).padStart(2, "0")}`;
  const [days, cards, holidays, vacations] = await Promise.all([
    listTimesheetEntries({ endDateKey, startDateKey, userId: user.id }),
    listCachedNotionCards({ endDateKey, startDateKey, userId: user.id }),
    listHolidays({ endDateKey, startDateKey }),
    listVacations({ endDateKey, startDateKey, userId: user.id })
  ]);
  const savedWorkHoursByDate = new Map(
    days.map((day) => [
      day.dateKey,
      day.entries.filter((entry) => entry.kind === "WORK").reduce((sum, entry) => sum + entry.hours, 0)
    ])
  );
  const linkedPageIds = new Set(days.flatMap((day) => day.entries.flatMap((entry) => entry.notionCards.map((link) => link.notionPageId))));
  const mappedCards = cards.filter((card) => linkedPageIds.has(card.notionPageId));
  const analysisCards = mappedCards.map((card) => {
    const estimate = buildNotionCardEstimate({
      card,
      defaultHoursPerDay: 8,
      doneStatusValues: [],
      holidays: holidays.map((holiday) => holiday.dateKey),
      mappedCards,
      month,
      savedWorkHoursByDate,
      vacations: vacations.map((vacation) => vacation.dateKey)
    });
    const linkedHours = days.reduce(
      (sum, day) =>
        sum + day.entries.reduce((entrySum, entry) => entrySum + entry.notionCards.filter((link) => link.notionPageId === card.notionPageId).reduce((linkSum, link) => linkSum + link.allocatedHours, 0), 0),
      0
    );

    return { ...card, estimate, linkedHours };
  });

  return {
    cards: analysisCards,
    categorySummary: buildNotionCategorySummary({
      cards: analysisCards.map((card) => ({
        category: card.category,
        estimatedHours: card.estimate.estimatedHours,
        linkedHours: card.linkedHours,
        notionPageId: card.notionPageId
      }))
    })
  };
}
```

- [ ] **Step 4: Add category summary component**

Create `apps/web/src/components/notion-cards/notion-category-summary.tsx`:

```tsx
"use client";

type NotionCategorySummaryProps = {
  items: Array<{ cardCount: number; category: string; estimatedHours: number; linkedHours: number }>;
};

export function NotionCategorySummary({ items }: NotionCategorySummaryProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
      {items.map((item) => (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={item.category}>
          <p className="text-xs font-bold text-slate-500">{item.category}</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{item.estimatedHours}h</p>
          <p className="text-xs font-semibold text-slate-500">업무기록 연결 {item.linkedHours}h · 카드 {item.cardCount}개</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Compose summary in workspace**

Modify `apps/web/src/components/notion-cards/notion-card-workspace.tsx` props and imports:

```tsx
import { NotionCategorySummary } from "./notion-category-summary";

type MonthlyAnalysis = {
  cards: Array<NotionCardCacheRecord & { estimate: { dayEquivalent: number; estimatedHours: number; totalBusinessDays: number; unavailable: boolean }; linkedHours: number }>;
  categorySummary: Array<{ cardCount: number; category: string; estimatedHours: number; linkedHours: number }>;
};
```

Render the summary above `NotionCardTable`:

```tsx
<div>
  <NotionCategorySummary items={analysis?.categorySummary ?? []} />
  <NotionCardTable cards={cards} />
</div>
```

- [ ] **Step 6: Run domain tests and web typecheck**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/notion-cards.ts packages/domain/src/notion-cards.test.ts packages/domain/src/index.ts apps/web/src/app/\(app\)/notion-cards/actions.ts apps/web/src/components/notion-cards/notion-category-summary.tsx apps/web/src/components/notion-cards/notion-card-workspace.tsx
git commit -m "feat(web): add notion monthly analysis"
```

---

### Task 8: Documentation And Final Verification

**Files:**
- Modify: `docs/timesheet-workflow.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`

- [ ] **Step 1: Document Notion workflow**

Append to `docs/timesheet-workflow.md`:

```md
## Notion Card Mapping

- Notion cards are user-specific and read-only in the first version.
- Synced cards are candidates only; analysis includes only cards mapped to `WORK` entries.
- A `WORK` entry can link multiple Notion cards.
- Auto allocation evenly splits the entry hours across linked cards.
- Manual allocation must sum to the entry's work hours before saving.
- Done cards are excluded from default candidate search, but already-linked cards remain visible.
- Period-based estimates use mapped open cards as the denominator and show a warning when default `8h` fallback is used for more than half of estimate dates.
- Notion data source sync paginates until complete or records a partial sync run.
```

- [ ] **Step 2: Update architecture docs**

Add to `docs/architecture.md` under `Data Model`:

```md
- `UserNotionConnection`: user-owned Notion token, data source, field mapping, done status values, and analysis config version.
- `NotionCardCache`: scoped Notion card snapshots used for candidates and analysis; not a full database copy.
- `WorkEntryNotionCard`: mapping between saved `WORK` entries and Notion cards, including allocated hours.
- `NotionSyncRun`: scope-specific sync result used to distinguish synced-month estimates from last-cache or partial estimates.
```

- [ ] **Step 3: Update README feature list**

Add to `README.md` main feature list:

```md
- 사용자별 Notion 카드 후보 동기화, 업무 entry별 카드 연결, 완료 카드 투입시간 분석
```

- [ ] **Step 4: Run verification without build**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

Do not run `pnpm build` unless the user explicitly asks.

- [ ] **Step 5: Commit**

```bash
git add docs/timesheet-workflow.md docs/architecture.md README.md
git commit -m "docs: document notion card workflow"
```

---

## Self-Review

- Spec coverage: The plan covers user-specific internal token connection, data source resolution, property ID/type mapping, single range dates, scoped sync runs, pagination/partial sync, cache scope, mapped-only analysis, work-entry links, allocation validation, candidate UI, monthly analysis, category summary, error messaging, date normalization, and documentation.
- Placeholder scan: This plan contains no `TBD`, `TODO`, or unspecified edge handling. Code steps include concrete file paths, functions, commands, and expected outcomes.
- Type consistency: The plan consistently uses `analysisConfigVersion`, `dataSourceId`, `NotionCardCacheRecord`, `WorkEntryNotionCard`, `allocationMode`, and `source`.
