# Chrome Extension Time Macro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Chrome extension MVP that connects to aJam, loads monthly time macro data, and types hours from the user's current cursor position.

**Architecture:** Put pure month/category/macro logic in `packages/domain`, extension connection persistence in `packages/db`, API/auth/page surfaces in `apps/web`, and the unpacked Chrome extension in `apps/extension`. The extension uses a dedicated connection-code token flow and vanilla TypeScript compiled by `tsc`.

**Tech Stack:** pnpm workspace, TypeScript, Next.js App Router, SQLite via existing DB bootstrap, Chrome Manifest V3, Node `crypto`, `node:test`.

---

## File Structure

- Create `packages/domain/src/monthly-time-macro.ts`: pure monthly macro export and step generation.
- Create `packages/domain/src/monthly-time-macro.test.ts`: domain tests for grouping, weekends, blanks, and category boundaries.
- Modify `packages/domain/src/index.ts`: export the monthly macro functions and types.
- Create `packages/db/src/extension-auth-store.ts`: extension connection schema, connection codes, refresh token hashing, monthly export loading.
- Modify `packages/db/src/index.ts`: export extension auth store functions and types.
- Create `apps/web/src/server/extension-auth.ts`: access token signing, bearer verification, extension API authentication.
- Create `apps/web/src/app/extension/connect/actions.ts`: server action that creates a one-time connection code.
- Create `apps/web/src/app/extension/connect/page.tsx`: logged-in approval screen for `aJam 연결`.
- Create `apps/web/src/app/extension/connect/success/page.tsx`: displays the one-time code after approval.
- Create `apps/web/src/app/api/extension/auth/exchange/route.ts`: exchange one-time code for tokens.
- Create `apps/web/src/app/api/extension/auth/refresh/route.ts`: rotate refresh token and return a new access token.
- Create `apps/web/src/app/api/extension/auth/revoke/route.ts`: revoke the current extension connection.
- Create `apps/web/src/app/api/extension/monthly-time-macro/route.ts`: extension-authenticated monthly export endpoint.
- Create `apps/extension/package.json`: extension package scripts.
- Create `apps/extension/tsconfig.json`: extension TypeScript build config.
- Create `apps/extension/src/manifest.json`: Manifest V3 definition.
- Create `apps/extension/src/chrome.d.ts`: minimal Chrome extension type declarations.
- Create `apps/extension/src/popup.html`: popup shell.
- Create `apps/extension/src/popup.css`: popup styling.
- Create `apps/extension/src/storage.ts`: typed Chrome local storage helpers.
- Create `apps/extension/src/api.ts`: aJam token exchange, refresh, revoke, monthly export client.
- Create `apps/extension/src/macro.ts`: macro step generation adapter and active-tab executor.
- Create `apps/extension/src/content-script.ts`: focus-based typing and tabbing.
- Create `apps/extension/src/popup.ts`: popup state, connection, preview, ordering, run/stop wiring.
- Create `apps/extension/src/test-page.html`: local manual verification page.
- Create `apps/extension/README.md`: load and verify instructions.
- Modify `package.json`: add `extension:typecheck` and `extension:build` scripts without changing global install behavior.
- Modify `docs/timesheet-workflow.md`: add extension time macro notes.

---

### Task 1: Domain Monthly Macro Builder

**Files:**
- Create: `packages/domain/src/monthly-time-macro.ts`
- Create: `packages/domain/src/monthly-time-macro.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/domain/src/monthly-time-macro.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMonthlyTimeMacroExport, buildMonthlyTimeMacroSteps } from "./monthly-time-macro.js";

describe("monthly time macro export", () => {
  it("groups work by project, vacation by name, and holidays under 공휴일", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        {
          dateKey: "2026-06-01",
          entries: [
            { kind: "WORK", project: "Project A", vacationName: "", holidayName: "", hours: 4 },
            { kind: "WORK", project: "Project A", vacationName: "", holidayName: "", hours: 2 },
            { kind: "WORK", project: "Project B", vacationName: "", holidayName: "", hours: 2 }
          ]
        },
        {
          dateKey: "2026-06-02",
          entries: [{ kind: "VACATION", project: "", vacationName: "연차", holidayName: "", hours: 8 }]
        },
        {
          dateKey: "2026-06-03",
          entries: [{ kind: "HOLIDAY", project: "", vacationName: "", holidayName: "선거일", hours: 0 }]
        }
      ],
      holidays: [{ dateKey: "2026-06-06", name: "현충일" }],
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
    assert.equal(exportData.categories[1]?.days.find((day) => day.dateKey === "2026-06-01")?.value, "2");
    assert.equal(exportData.categories[2]?.days.find((day) => day.dateKey === "2026-06-02")?.value, "8");
    assert.equal(exportData.categories[3]?.days.find((day) => day.dateKey === "2026-06-03")?.value, "");
  });

  it("builds focus-based macro steps with no weekend tabs and five category-boundary tabs", () => {
    const exportData = buildMonthlyTimeMacroExport({
      days: [
        { dateKey: "2026-02-02", entries: [{ kind: "WORK", project: "Project A", vacationName: "", holidayName: "", hours: 8 }] },
        { dateKey: "2026-02-03", entries: [{ kind: "WORK", project: "Project B", vacationName: "", holidayName: "", hours: 8 }] }
      ],
      holidays: [],
      month: "2026-02"
    });
    const steps = buildMonthlyTimeMacroSteps({
      categoryOrder: ["work:Project A", "work:Project B"],
      exportData
    });

    assert.equal(steps.filter((step) => step.type === "type").length, 2);
    assert.equal(steps.filter((step) => step.type === "tab").length, 20 + 5 + 20 + 5);
    assert.deepEqual(steps.slice(0, 3), [
      { categoryId: "work:Project A", dateKey: "2026-02-02", type: "type", value: "8" },
      { categoryId: "work:Project A", dateKey: "2026-02-02", type: "tab" },
      { categoryId: "work:Project A", dateKey: "2026-02-03", type: "tab" }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @timesheet/domain test`

Expected: FAIL because `monthly-time-macro.ts` does not exist.

- [ ] **Step 3: Implement monthly macro logic**

Create `packages/domain/src/monthly-time-macro.ts`:

```ts
export type MonthlyTimeMacroEntry = {
  holidayName: string;
  hours: number;
  kind: "WORK" | "VACATION" | "HOLIDAY";
  project: string;
  vacationName: string;
};

export type MonthlyTimeMacroDayInput = {
  dateKey: string;
  entries: MonthlyTimeMacroEntry[];
};

export type MonthlyTimeMacroHolidayInput = {
  dateKey: string;
  name: string;
};

export type MonthlyTimeMacroCategoryKind = "work" | "vacation" | "holiday";

export type MonthlyTimeMacroDay = {
  dateKey: string;
  day: number;
  hours: number;
  value: string;
  weekday: number;
};

export type MonthlyTimeMacroCategory = {
  days: MonthlyTimeMacroDay[];
  id: string;
  kind: MonthlyTimeMacroCategoryKind;
  label: string;
};

export type MonthlyTimeMacroExport = {
  categories: MonthlyTimeMacroCategory[];
  daysInMonth: number;
  month: string;
};

export type MonthlyTimeMacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

function assertMonth(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Invalid month");
  }
}

function getDaysInMonth(month: string): number {
  assertMonth(month);
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
}

function getDateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function getWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "";
  }

  const rounded = Math.round((hours + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function addHours(categories: Map<string, MonthlyTimeMacroCategory>, params: {
  dateKey: string;
  hours: number;
  id: string;
  kind: MonthlyTimeMacroCategoryKind;
  label: string;
  month: string;
}): void {
  const category = categories.get(params.id) ?? {
    days: createBlankDays(params.month),
    id: params.id,
    kind: params.kind,
    label: params.label
  };
  const day = category.days.find((candidate) => candidate.dateKey === params.dateKey);

  if (day) {
    day.hours = Math.round((day.hours + params.hours + Number.EPSILON) * 100) / 100;
    day.value = formatHours(day.hours);
  }

  categories.set(params.id, category);
}

function createBlankDays(month: string): MonthlyTimeMacroDay[] {
  return Array.from({ length: getDaysInMonth(month) }, (_, index) => {
    const day = index + 1;
    const dateKey = getDateKey(month, day);

    return {
      dateKey,
      day,
      hours: 0,
      value: "",
      weekday: getWeekday(dateKey)
    };
  });
}

function categorySort(left: MonthlyTimeMacroCategory, right: MonthlyTimeMacroCategory): number {
  const order: Record<MonthlyTimeMacroCategoryKind, number> = { work: 0, vacation: 1, holiday: 2 };
  return order[left.kind] - order[right.kind] || left.label.localeCompare(right.label, "ko-KR");
}

export function buildMonthlyTimeMacroExport(params: {
  days: MonthlyTimeMacroDayInput[];
  holidays: MonthlyTimeMacroHolidayInput[];
  month: string;
}): MonthlyTimeMacroExport {
  assertMonth(params.month);

  const categories = new Map<string, MonthlyTimeMacroCategory>();

  for (const day of params.days) {
    if (!day.dateKey.startsWith(`${params.month}-`)) {
      continue;
    }

    for (const entry of day.entries) {
      if (entry.kind === "WORK") {
        const label = entry.project.trim() || "프로젝트 없음";
        addHours(categories, { dateKey: day.dateKey, hours: entry.hours, id: `work:${label}`, kind: "work", label, month: params.month });
      }

      if (entry.kind === "VACATION") {
        const label = entry.vacationName.trim() || "휴가";
        addHours(categories, { dateKey: day.dateKey, hours: entry.hours, id: `vacation:${label}`, kind: "vacation", label, month: params.month });
      }

      if (entry.kind === "HOLIDAY") {
        addHours(categories, { dateKey: day.dateKey, hours: 0, id: "holiday:공휴일", kind: "holiday", label: "공휴일", month: params.month });
      }
    }
  }

  for (const holiday of params.holidays) {
    if (holiday.dateKey.startsWith(`${params.month}-`)) {
      addHours(categories, { dateKey: holiday.dateKey, hours: 0, id: "holiday:공휴일", kind: "holiday", label: "공휴일", month: params.month });
    }
  }

  return {
    categories: [...categories.values()].sort(categorySort),
    daysInMonth: getDaysInMonth(params.month),
    month: params.month
  };
}

export function buildMonthlyTimeMacroSteps(params: {
  categoryOrder: string[];
  exportData: MonthlyTimeMacroExport;
}): MonthlyTimeMacroStep[] {
  const orderedIds = [...params.categoryOrder, ...params.exportData.categories.map((category) => category.id)]
    .filter((id, index, values) => values.indexOf(id) === index);
  const categoriesById = new Map(params.exportData.categories.map((category) => [category.id, category]));
  const steps: MonthlyTimeMacroStep[] = [];

  for (const categoryId of orderedIds) {
    const category = categoriesById.get(categoryId);

    if (!category) {
      continue;
    }

    for (const day of category.days) {
      if (isWeekend(day.weekday)) {
        continue;
      }

      if (day.value) {
        steps.push({ categoryId, dateKey: day.dateKey, type: "type", value: day.value });
      }

      steps.push({ categoryId, dateKey: day.dateKey, type: "tab" });
    }

    const lastDay = category.days[category.days.length - 1];
    const boundaryDateKey = lastDay?.dateKey ?? `${params.exportData.month}-01`;

    for (let index = 0; index < 5; index += 1) {
      steps.push({ categoryId, dateKey: boundaryDateKey, type: "tab" });
    }
  }

  return steps;
}
```

- [ ] **Step 4: Export domain API**

Modify `packages/domain/src/index.ts` by adding:

```ts
export { buildMonthlyTimeMacroExport, buildMonthlyTimeMacroSteps } from "./monthly-time-macro";
export type {
  MonthlyTimeMacroCategory,
  MonthlyTimeMacroCategoryKind,
  MonthlyTimeMacroDay,
  MonthlyTimeMacroDayInput,
  MonthlyTimeMacroEntry,
  MonthlyTimeMacroExport,
  MonthlyTimeMacroHolidayInput,
  MonthlyTimeMacroStep
} from "./monthly-time-macro";
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/monthly-time-macro.ts packages/domain/src/monthly-time-macro.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add monthly time macro builder"
```

---

### Task 2: DB Extension Connection Store

**Files:**
- Create: `packages/db/src/extension-auth-store.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add store file with schema and token helpers**

Create `packages/db/src/extension-auth-store.ts`:

```ts
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { buildMonthlyTimeMacroExport, type MonthlyTimeMacroExport } from "@timesheet/domain";

import { prisma } from "./client";
import { ensureTimesheetSchema, listHolidays, listTimesheetEntries } from "./timesheet-store";

export type ExtensionConnection = {
  createdAt: string;
  id: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: string;
  userId: string;
};

export type ExtensionConnectionCode = {
  code: string;
  expiresAt: string;
};

export type ExtensionRefreshResult = {
  connection: ExtensionConnection;
  refreshToken: string;
};

type ExtensionConnectionRow = ExtensionConnection & {
  refreshTokenHash: string;
};

type ExtensionConnectionCodeRow = {
  codeHash: string;
  connectionLabel: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  scopes: string;
  usedAt: string | null;
  userId: string;
};

let extensionSchemaReady = false;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function createSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function getMonthRange(month: string): { endDateKey: string; startDateKey: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Invalid month");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const endDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();

  return {
    endDateKey: `${month}-${String(endDay).padStart(2, "0")}`,
    startDateKey: `${month}-01`
  };
}

export async function ensureExtensionAuthSchema(): Promise<void> {
  if (extensionSchemaReady) {
    return;
  }

  await ensureTimesheetSchema();

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExtensionConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Chrome extension',
    "refreshTokenHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ExtensionConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExtensionConnection_userId_idx" ON "ExtensionConnection"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnection_refreshTokenHash_key" ON "ExtensionConnection"("refreshTokenHash")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ExtensionConnectionCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "connectionLabel" TEXT NOT NULL DEFAULT 'Chrome extension',
    "scopes" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionConnectionCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnectionCode_codeHash_key" ON "ExtensionConnectionCode"("codeHash")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExtensionConnectionCode_userId_idx" ON "ExtensionConnectionCode"("userId")`);

  extensionSchemaReady = true;
}

export async function createExtensionConnectionCode(params: {
  label?: string;
  scopes?: string[];
  userId: string;
}): Promise<ExtensionConnectionCode> {
  await ensureExtensionAuthSchema();

  const code = createSecret("ajam_code");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ExtensionConnectionCode" ("id", "userId", "codeHash", "connectionLabel", "scopes", "expiresAt", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    randomUUID(),
    params.userId,
    hashSecret(code),
    params.label?.trim() || "Chrome extension",
    (params.scopes ?? ["monthly_time_macro:read"]).join(" "),
    toIso(expiresAt)
  );

  return { code, expiresAt: toIso(expiresAt) };
}

export async function exchangeExtensionConnectionCode(code: string): Promise<ExtensionRefreshResult | null> {
  await ensureExtensionAuthSchema();

  const codeHash = hashSecret(code.trim());
  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionCodeRow[]>(
    `SELECT "id", "userId", "codeHash", "connectionLabel", "scopes", "expiresAt", "usedAt", "createdAt"
     FROM "ExtensionConnectionCode"
     WHERE "codeHash" = ?
     LIMIT 1`,
    codeHash
  );
  const row = rows[0];

  if (!row || row.usedAt || new Date(row.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const refreshToken = createSecret("ajam_refresh");
  const connectionId = randomUUID();

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(`UPDATE "ExtensionConnectionCode" SET "usedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`, row.id);
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ExtensionConnection" ("id", "userId", "label", "refreshTokenHash", "scopes", "createdAt")
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      connectionId,
      row.userId,
      row.connectionLabel,
      hashSecret(refreshToken),
      row.scopes
    );
  });

  return {
    connection: {
      createdAt: new Date().toISOString(),
      id: connectionId,
      label: row.connectionLabel,
      lastUsedAt: null,
      revokedAt: null,
      scopes: row.scopes,
      userId: row.userId
    },
    refreshToken
  };
}

export async function rotateExtensionRefreshToken(refreshToken: string): Promise<ExtensionRefreshResult | null> {
  await ensureExtensionAuthSchema();

  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionRow[]>(
    `SELECT "id", "userId", "label", "refreshTokenHash", "scopes", "createdAt", "lastUsedAt", "revokedAt"
     FROM "ExtensionConnection"
     WHERE "refreshTokenHash" = ? AND "revokedAt" IS NULL
     LIMIT 1`,
    hashSecret(refreshToken.trim())
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  const nextRefreshToken = createSecret("ajam_refresh");

  await prisma.$executeRawUnsafe(
    `UPDATE "ExtensionConnection"
     SET "refreshTokenHash" = ?, "lastUsedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    hashSecret(nextRefreshToken),
    row.id
  );

  return {
    connection: {
      createdAt: row.createdAt,
      id: row.id,
      label: row.label,
      lastUsedAt: new Date().toISOString(),
      revokedAt: row.revokedAt,
      scopes: row.scopes,
      userId: row.userId
    },
    refreshToken: nextRefreshToken
  };
}

export async function revokeExtensionConnection(connectionId: string, userId: string): Promise<void> {
  await ensureExtensionAuthSchema();

  await prisma.$executeRawUnsafe(
    `UPDATE "ExtensionConnection"
     SET "revokedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "userId" = ?`,
    connectionId,
    userId
  );
}

export async function getExtensionConnection(connectionId: string): Promise<ExtensionConnection | null> {
  await ensureExtensionAuthSchema();

  const rows = await prisma.$queryRawUnsafe<ExtensionConnectionRow[]>(
    `SELECT "id", "userId", "label", "refreshTokenHash", "scopes", "createdAt", "lastUsedAt", "revokedAt"
     FROM "ExtensionConnection"
     WHERE "id" = ? AND "revokedAt" IS NULL
     LIMIT 1`,
    connectionId
  );
  const row = rows[0];

  return row
    ? {
        createdAt: row.createdAt,
        id: row.id,
        label: row.label,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
        scopes: row.scopes,
        userId: row.userId
      }
    : null;
}

export async function getMonthlyTimeMacroExportForUser(params: {
  month: string;
  userId: string;
}): Promise<MonthlyTimeMacroExport> {
  const range = getMonthRange(params.month);
  const [days, holidays] = await Promise.all([
    listTimesheetEntries({ ...range, userId: params.userId }),
    listHolidays(range)
  ]);

  return buildMonthlyTimeMacroExport({
    days,
    holidays,
    month: params.month
  });
}
```

- [ ] **Step 2: Export DB functions**

Modify `packages/db/src/index.ts` by adding:

```ts
export {
  createExtensionConnectionCode,
  ensureExtensionAuthSchema,
  exchangeExtensionConnectionCode,
  getExtensionConnection,
  getMonthlyTimeMacroExportForUser,
  revokeExtensionConnection,
  rotateExtensionRefreshToken
} from "./extension-auth-store";
export type { ExtensionConnection, ExtensionConnectionCode, ExtensionRefreshResult } from "./extension-auth-store";
```

- [ ] **Step 3: Typecheck DB package**

Run: `pnpm --filter @timesheet/db typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/extension-auth-store.ts packages/db/src/index.ts
git commit -m "feat(db): add extension connection store"
```

---

### Task 3: Web Extension Auth Helper

**Files:**
- Create: `apps/web/src/server/extension-auth.ts`

- [ ] **Step 1: Implement access token signing and verification**

Create `apps/web/src/server/extension-auth.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

import { getAppSetting, getExtensionConnection, setAppSetting } from "@timesheet/db";
import { randomBytes } from "node:crypto";

const extensionSecretSettingKey = "extension_access_token_secret";
const accessTokenMaxAgeSeconds = 15 * 60;

export type ExtensionAccessTokenPayload = {
  connectionId: string;
  exp: number;
  scopes: string[];
  sub: string;
  username?: string;
};

export type AuthenticatedExtension = {
  connectionId: string;
  scopes: string[];
  userId: string;
};

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

async function getExtensionSecret(): Promise<string> {
  const stored = (await getAppSetting(extensionSecretSettingKey))?.trim();

  if (stored) {
    return stored;
  }

  const generated = randomBytes(32).toString("base64url");
  await setAppSetting(extensionSecretSettingKey, generated);

  return generated;
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await getExtensionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createExtensionAccessToken(params: {
  connectionId: string;
  scopes: string[];
  userId: string;
  username?: string;
}): Promise<{ accessToken: string; expiresAt: string }> {
  const expiresAtMs = Date.now() + accessTokenMaxAgeSeconds * 1000;
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      connectionId: params.connectionId,
      exp: Math.floor(expiresAtMs / 1000),
      scopes: params.scopes,
      sub: params.userId,
      username: params.username
    } satisfies ExtensionAccessTokenPayload)
  );
  const signature = await sign(`${header}.${payload}`);

  return {
    accessToken: `${header}.${payload}.${signature}`,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
}

export async function authenticateExtensionRequest(request: Request, requiredScope: string): Promise<AuthenticatedExtension | null> {
  const token = getBearerToken(request);
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature || !safeEqual(signature, await sign(`${header}.${payload}`))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ExtensionAccessTokenPayload;

    if (parsed.exp <= Math.floor(Date.now() / 1000) || !parsed.scopes.includes(requiredScope)) {
      return null;
    }

    const connection = await getExtensionConnection(parsed.connectionId);

    if (!connection || connection.userId !== parsed.sub) {
      return null;
    }

    return {
      connectionId: parsed.connectionId,
      scopes: parsed.scopes,
      userId: parsed.sub
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/server/extension-auth.ts
git commit -m "feat(web): add extension token authentication"
```

---

### Task 4: aJam Connection Page And Auth Routes

**Files:**
- Create: `apps/web/src/app/extension/connect/actions.ts`
- Create: `apps/web/src/app/extension/connect/page.tsx`
- Create: `apps/web/src/app/extension/connect/success/page.tsx`
- Create: `apps/web/src/app/api/extension/auth/exchange/route.ts`
- Create: `apps/web/src/app/api/extension/auth/refresh/route.ts`
- Create: `apps/web/src/app/api/extension/auth/revoke/route.ts`

- [ ] **Step 1: Create connection approval action**

Create `apps/web/src/app/extension/connect/actions.ts`:

```ts
"use server";

import { createExtensionConnectionCode } from "@timesheet/db";
import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

export async function approveExtensionConnectionAction(): Promise<void> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { code } = await createExtensionConnectionCode({
    label: "Chrome extension",
    userId: session.userId
  });

  redirect(`/extension/connect/success?code=${encodeURIComponent(code)}`);
}
```

- [ ] **Step 2: Create connection page**

Create `apps/web/src/app/extension/connect/page.tsx`:

```tsx
import { Button } from "@timesheet/ui";
import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

import { approveExtensionConnectionAction } from "./actions";

export default async function ExtensionConnectPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">aJam 연결</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Chrome extension을 연결합니다</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          연결하면 Chrome extension이 월간 업무, 휴가, 공휴일 시간 입력 데이터를 읽을 수 있습니다. 비밀번호는 공유하지 않습니다.
        </p>
        <form action={approveExtensionConnectionAction} className="mt-6">
          <Button type="submit">aJam 연결 승인</Button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Create connection success page**

Create `apps/web/src/app/extension/connect/success/page.tsx`:

```tsx
export default async function ExtensionConnectSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const code = params.code?.trim() ?? "";

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">aJam 연결</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">연결 코드가 발급되었습니다</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">아래 코드를 Chrome extension 팝업에 붙여넣어 연결을 완료하세요.</p>
        <code className="mt-5 block break-all rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-950">{code}</code>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Create exchange route**

Create `apps/web/src/app/api/extension/auth/exchange/route.ts`:

```ts
import { exchangeExtensionConnectionCode, getManagedUser } from "@timesheet/db";
import { NextResponse } from "next/server";

import { createExtensionAccessToken } from "@/server/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const result = body.code ? await exchangeExtensionConnectionCode(body.code) : null;

  if (!result) {
    return NextResponse.json({ error: "Invalid connection code" }, { status: 400 });
  }

  const user = await getManagedUser(result.connection.userId);
  const scopes = result.connection.scopes.split(" ").filter(Boolean);
  const access = await createExtensionAccessToken({
    connectionId: result.connection.id,
    scopes,
    userId: result.connection.userId,
    username: user?.username
  });

  return NextResponse.json({
    ...access,
    connectedUsername: user?.username ?? "",
    refreshToken: result.refreshToken,
    scopes
  });
}
```

- [ ] **Step 5: Create refresh route**

Create `apps/web/src/app/api/extension/auth/refresh/route.ts`:

```ts
import { getManagedUser, rotateExtensionRefreshToken } from "@timesheet/db";
import { NextResponse } from "next/server";

import { createExtensionAccessToken } from "@/server/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { refreshToken?: string };
  const result = body.refreshToken ? await rotateExtensionRefreshToken(body.refreshToken) : null;

  if (!result) {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }

  const user = await getManagedUser(result.connection.userId);
  const scopes = result.connection.scopes.split(" ").filter(Boolean);
  const access = await createExtensionAccessToken({
    connectionId: result.connection.id,
    scopes,
    userId: result.connection.userId,
    username: user?.username
  });

  return NextResponse.json({
    ...access,
    connectedUsername: user?.username ?? "",
    refreshToken: result.refreshToken,
    scopes
  });
}
```

- [ ] **Step 6: Create revoke route**

Create `apps/web/src/app/api/extension/auth/revoke/route.ts`:

```ts
import { revokeExtensionConnection } from "@timesheet/db";
import { NextResponse } from "next/server";

import { authenticateExtensionRequest } from "@/server/extension-auth";

export async function POST(request: Request) {
  const auth = await authenticateExtensionRequest(request, "monthly_time_macro:read");

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await revokeExtensionConnection(auth.connectionId, auth.userId);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/extension/connect/actions.ts apps/web/src/app/extension/connect/page.tsx apps/web/src/app/extension/connect/success/page.tsx apps/web/src/app/api/extension/auth/exchange/route.ts apps/web/src/app/api/extension/auth/refresh/route.ts apps/web/src/app/api/extension/auth/revoke/route.ts
git commit -m "feat(web): add extension connection flow"
```

---

### Task 5: Monthly Time Macro Export API

**Files:**
- Create: `apps/web/src/app/api/extension/monthly-time-macro/route.ts`

- [ ] **Step 1: Implement extension-authenticated monthly export route**

Create `apps/web/src/app/api/extension/monthly-time-macro/route.ts`:

```ts
import { getMonthlyTimeMacroExportForUser } from "@timesheet/db";
import { NextResponse } from "next/server";

import { authenticateExtensionRequest } from "@/server/extension-auth";

function getMonth(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("month")?.trim() ?? "";
}

export async function GET(request: Request) {
  const auth = await authenticateExtensionRequest(request, "monthly_time_macro:read");

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = getMonth(request);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const data = await getMonthlyTimeMacroExportForUser({
    month,
    userId: auth.userId
  });

  return NextResponse.json({
    ...data,
    ok: true
  });
}
```

- [ ] **Step 2: Typecheck web package**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/extension/monthly-time-macro/route.ts
git commit -m "feat(web): expose extension monthly macro export"
```

---

### Task 6: Chrome Extension Scaffold

**Files:**
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/src/manifest.json`
- Create: `apps/extension/src/chrome.d.ts`
- Create: `apps/extension/src/popup.html`
- Create: `apps/extension/src/popup.css`
- Modify: `package.json`

- [ ] **Step 1: Create extension package**

Create `apps/extension/package.json`:

```json
{
  "name": "@timesheet/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc && node scripts/copy-static.mjs",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create manifest**

Create `apps/extension/src/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "aJam",
  "description": "aJam 월말 시간 입력 매크로",
  "version": "0.1.0",
  "action": {
    "default_popup": "popup.html"
  },
  "permissions": ["activeTab", "scripting", "storage", "tabs"],
  "host_permissions": ["http://localhost:*/*", "https://*/*"]
}
```

- [ ] **Step 4: Create minimal Chrome type declarations**

Create `apps/extension/src/chrome.d.ts`:

```ts
declare const chrome: {
  runtime: {
    onMessage: {
      addListener(callback: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void): void;
    };
  };
  scripting: {
    executeScript(options: { files: string[]; target: { tabId: number } }): Promise<unknown>;
  };
  storage: {
    local: {
      get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    create(options: { url: string }): Promise<{ id?: number }>;
    query(options: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
    remove(tabId: number): Promise<void>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};
```

- [ ] **Step 5: Create popup shell and CSS**

Create `apps/extension/src/popup.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="popup.css" />
    <title>aJam</title>
  </head>
  <body>
    <main class="popup">
      <section class="connection">
        <strong id="connectionState">연결 필요</strong>
        <button id="connectButton" type="button">aJam 연결</button>
      </section>
      <nav class="modes" aria-label="입력 모드">
        <button id="timeModeButton" class="active" type="button">시간 입력</button>
        <button id="contentModeButton" disabled type="button">내용 입력</button>
      </nav>
      <label class="field">
        <span>aJam 주소</span>
        <input id="baseUrlInput" type="url" value="http://localhost:3000" />
      </label>
      <label class="field">
        <span>월</span>
        <input id="monthInput" type="month" />
      </label>
      <section>
        <div class="sectionTitle">
          <strong>카테고리 순서</strong>
          <button id="refreshButton" type="button">새로고침</button>
        </div>
        <ol id="categoryList" class="categoryList"></ol>
      </section>
      <dl class="preview">
        <div><dt>카테고리</dt><dd id="categoryCount">0</dd></div>
        <div><dt>입력</dt><dd id="filledCount">0</dd></div>
        <div><dt>빈칸 이동</dt><dd id="blankCount">0</dd></div>
      </dl>
      <p id="statusMessage" class="status"></p>
      <button id="runButton" class="primary" type="button">시간 입력 실행</button>
      <button id="stopButton" class="secondary" type="button" hidden>중지</button>
    </main>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

Create `apps/extension/src/popup.css` with compact fixed-width styling:

```css
body {
  margin: 0;
  width: 360px;
  background: #f8fafc;
  color: #0f172a;
  font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
input {
  font: inherit;
}

button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  padding: 7px 10px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.popup {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.connection,
.sectionTitle,
.preview,
.modes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modes button {
  flex: 1;
}

.modes .active,
.primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.field {
  display: grid;
  gap: 5px;
}

.field span,
.sectionTitle strong {
  font-weight: 700;
}

.field input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
}

.categoryList {
  display: grid;
  gap: 6px;
  margin: 0;
  max-height: 150px;
  overflow: auto;
  padding: 0;
}

.categoryList li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 5px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  padding: 7px;
}

.preview {
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 0;
}

.preview div {
  display: grid;
  gap: 2px;
  text-align: center;
}

.preview dt {
  color: #64748b;
}

.preview dd {
  margin: 0;
  font-weight: 800;
}

.status {
  min-height: 18px;
  margin: 0;
  color: #475569;
}
```

- [ ] **Step 6: Add static copy script**

Create `apps/extension/scripts/copy-static.mjs`:

```js
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

for (const file of ["manifest.json", "popup.html", "popup.css", "test-page.html"]) {
  await copyFile(`src/${file}`, `dist/${file}`);
}
```

- [ ] **Step 7: Add root scripts**

Modify root `package.json` scripts:

```json
"extension:build": "pnpm --filter @timesheet/extension build",
"extension:typecheck": "pnpm --filter @timesheet/extension typecheck"
```

- [ ] **Step 8: Defer typecheck until extension TypeScript files exist**

Do not run the extension typecheck yet. Task 7 adds the first `.ts` implementation files, and typecheck runs there.

- [ ] **Step 9: Commit**

```bash
git add apps/extension/package.json apps/extension/tsconfig.json apps/extension/src/manifest.json apps/extension/src/chrome.d.ts apps/extension/src/popup.html apps/extension/src/popup.css apps/extension/scripts/copy-static.mjs package.json
git commit -m "feat(extension): scaffold chrome extension"
```

---

### Task 7: Extension API, Storage, And Macro Execution

**Files:**
- Create: `apps/extension/src/storage.ts`
- Create: `apps/extension/src/api.ts`
- Create: `apps/extension/src/macro.ts`
- Create: `apps/extension/src/content-script.ts`
- Create: `apps/extension/src/test-page.html`

- [ ] **Step 1: Implement storage types**

Create `apps/extension/src/storage.ts`:

```ts
export type StoredConnection = {
  accessToken: string;
  accessTokenExpiresAt: string;
  baseUrl: string;
  connectedUsername: string;
  refreshToken: string;
  scopes: string[];
};

export type StoredSettings = {
  categoryOrderByKey: Record<string, string[]>;
  connection?: StoredConnection;
  lastMonth: string;
};

const defaultSettings: StoredSettings = {
  categoryOrderByKey: {},
  lastMonth: new Date().toISOString().slice(0, 7)
};

export async function getSettings(): Promise<StoredSettings> {
  const result = await chrome.storage.local.get(defaultSettings);
  return result as StoredSettings;
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set(settings);
}
```

- [ ] **Step 2: Implement API client**

Create `apps/extension/src/api.ts`:

```ts
import type { StoredConnection } from "./storage.js";

export type MonthlyTimeMacroDay = {
  dateKey: string;
  day: number;
  hours: number;
  value: string;
  weekday: number;
};

export type MonthlyTimeMacroCategory = {
  days: MonthlyTimeMacroDay[];
  id: string;
  kind: "work" | "vacation" | "holiday";
  label: string;
};

export type MonthlyTimeMacroExport = {
  categories: MonthlyTimeMacroCategory[];
  daysInMonth: number;
  month: string;
  ok?: boolean;
};

type TokenResponse = {
  accessToken: string;
  connectedUsername: string;
  expiresAt: string;
  refreshToken: string;
  scopes: string[];
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getConnectUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/extension/connect`;
}

export async function exchangeCode(baseUrl: string, code: string): Promise<TokenResponse> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/extension/auth/exchange`, {
    body: JSON.stringify({ code }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  return readJson<TokenResponse>(response);
}

export async function refreshConnection(connection: StoredConnection): Promise<StoredConnection> {
  const response = await fetch(`${normalizeBaseUrl(connection.baseUrl)}/api/extension/auth/refresh`, {
    body: JSON.stringify({ refreshToken: connection.refreshToken }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const token = await readJson<TokenResponse>(response);

  return {
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.expiresAt,
    baseUrl: connection.baseUrl,
    connectedUsername: token.connectedUsername,
    refreshToken: token.refreshToken,
    scopes: token.scopes
  };
}

export async function getValidConnection(connection: StoredConnection): Promise<StoredConnection> {
  if (new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 30_000) {
    return connection;
  }

  return refreshConnection(connection);
}

export async function fetchMonthlyTimeMacro(connection: StoredConnection, month: string): Promise<MonthlyTimeMacroExport> {
  const response = await fetch(`${normalizeBaseUrl(connection.baseUrl)}/api/extension/monthly-time-macro?month=${encodeURIComponent(month)}`, {
    headers: {
      authorization: `Bearer ${connection.accessToken}`
    }
  });

  return readJson<MonthlyTimeMacroExport>(response);
}
```

- [ ] **Step 3: Implement macro runner bridge**

Create `apps/extension/src/macro.ts`:

```ts
import type { MonthlyTimeMacroExport } from "./api.js";

export type MacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export function buildMacroSteps(exportData: MonthlyTimeMacroExport, categoryOrder: string[]): MacroStep[] {
  const orderedIds = [...categoryOrder, ...exportData.categories.map((category) => category.id)]
    .filter((id, index, values) => values.indexOf(id) === index);
  const categoriesById = new Map(exportData.categories.map((category) => [category.id, category]));
  const steps: MacroStep[] = [];

  for (const categoryId of orderedIds) {
    const category = categoriesById.get(categoryId);

    if (!category) {
      continue;
    }

    for (const day of category.days) {
      if (isWeekend(day.weekday)) {
        continue;
      }

      if (day.value) {
        steps.push({ categoryId, dateKey: day.dateKey, type: "type", value: day.value });
      }

      steps.push({ categoryId, dateKey: day.dateKey, type: "tab" });
    }

    const lastDay = category.days[category.days.length - 1];

    for (let index = 0; index < 5; index += 1) {
      steps.push({ categoryId, dateKey: lastDay?.dateKey ?? `${exportData.month}-01`, type: "tab" });
    }
  }

  return steps;
}

export async function runMacroInActiveTab(steps: MacroStep[]): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.id) {
    throw new Error("활성 탭을 찾을 수 없습니다.");
  }

  await chrome.scripting.executeScript({
    files: ["content-script.js"],
    target: { tabId: tab.id }
  });

  const response = await chrome.tabs.sendMessage(tab.id, { steps, type: "RUN_AJAM_TIME_MACRO" });

  if (!response?.ok) {
    throw new Error(response?.error ?? "시간 입력을 실행하지 못했습니다.");
  }
}
```

- [ ] **Step 4: Implement content script**

Create `apps/extension/src/content-script.ts`:

```ts
type MacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getEditableElement(): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  const active = document.activeElement;

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return active;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }

  return null;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement, value: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.textContent = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function pressTab(): void {
  const active = document.activeElement;
  active?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
  active?.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Tab" }));

  if (active instanceof HTMLElement) {
    const focusable = [...document.querySelectorAll<HTMLElement>("input, textarea, button, select, [tabindex], [contenteditable='true']")]
      .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
    const index = focusable.indexOf(active);
    const next = focusable[index + 1];
    next?.focus();
  }
}

async function run(steps: MacroStep[]): Promise<void> {
  if (!getEditableElement()) {
    throw new Error("첫 시간 입력칸에 커서를 둔 뒤 다시 실행해 주세요.");
  }

  stopped = false;

  for (const step of steps) {
    if (stopped) {
      throw new Error("사용자가 중지했습니다.");
    }

    if (step.type === "type") {
      const editable = getEditableElement();

      if (!editable) {
        throw new Error(`${step.dateKey} 입력 중 커서 위치를 찾을 수 없습니다.`);
      }

      setValue(editable, step.value);
    } else {
      pressTab();
    }

    await sleep(80);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "STOP_AJAM_TIME_MACRO") {
    stopped = true;
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "RUN_AJAM_TIME_MACRO") {
    run(message.steps as MacroStep[])
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : "실행 실패", ok: false }));
    return true;
  }

  return false;
});
```

- [ ] **Step 5: Add manual test page**

Create `apps/extension/src/test-page.html` with at least 70 inputs so two-category months can be tested:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>aJam macro test page</title>
    <style>
      input { width: 48px; margin: 3px; }
      section { margin: 16px 0; }
    </style>
  </head>
  <body>
    <h1>aJam macro test page</h1>
    <section id="inputs"></section>
    <script>
      const root = document.querySelector("#inputs");
      for (let index = 1; index <= 80; index += 1) {
        const input = document.createElement("input");
        input.setAttribute("aria-label", `field ${index}`);
        root.append(input);
      }
    </script>
  </body>
</html>
```

- [ ] **Step 6: Typecheck extension**

Run: `pnpm --filter @timesheet/extension typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/storage.ts apps/extension/src/api.ts apps/extension/src/macro.ts apps/extension/src/content-script.ts apps/extension/src/test-page.html
git commit -m "feat(extension): add macro execution core"
```

---

### Task 8: Extension Popup Behavior

**Files:**
- Create: `apps/extension/src/popup.ts`

- [ ] **Step 1: Implement popup controller**

Create `apps/extension/src/popup.ts`:

```ts
import { exchangeCode, fetchMonthlyTimeMacro, getConnectUrl, getValidConnection, type MonthlyTimeMacroExport } from "./api.js";
import { buildMacroSteps, runMacroInActiveTab } from "./macro.js";
import { getSettings, saveSettings, type StoredSettings } from "./storage.js";

const connectionState = document.querySelector<HTMLStrongElement>("#connectionState")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connectButton")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#baseUrlInput")!;
const monthInput = document.querySelector<HTMLInputElement>("#monthInput")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refreshButton")!;
const categoryList = document.querySelector<HTMLOListElement>("#categoryList")!;
const categoryCount = document.querySelector<HTMLElement>("#categoryCount")!;
const filledCount = document.querySelector<HTMLElement>("#filledCount")!;
const blankCount = document.querySelector<HTMLElement>("#blankCount")!;
const statusMessage = document.querySelector<HTMLElement>("#statusMessage")!;
const runButton = document.querySelector<HTMLButtonElement>("#runButton")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stopButton")!;

let settings: StoredSettings;
let exportData: MonthlyTimeMacroExport | null = null;

function orderKey(): string {
  return `${settings.connection?.baseUrl ?? baseUrlInput.value}:${settings.connection?.connectedUsername ?? "anonymous"}`;
}

function setStatus(message: string): void {
  statusMessage.textContent = message;
}

function getCategoryOrder(): string[] {
  return settings.categoryOrderByKey[orderKey()] ?? [];
}

async function setCategoryOrder(order: string[]): Promise<void> {
  settings.categoryOrderByKey[orderKey()] = order;
  await saveSettings(settings);
}

function getOrderedCategories(data: MonthlyTimeMacroExport) {
  const order = getCategoryOrder();
  const ids = [...order, ...data.categories.map((category) => category.id)].filter((id, index, values) => values.indexOf(id) === index);
  const byId = new Map(data.categories.map((category) => [category.id, category]));

  return ids.map((id) => byId.get(id)).filter((category) => Boolean(category));
}

function renderConnection(): void {
  if (settings.connection) {
    connectionState.textContent = `${settings.connection.connectedUsername || "aJam"} 연결됨`;
    connectButton.textContent = "다시 연결";
    baseUrlInput.value = settings.connection.baseUrl;
    return;
  }

  connectionState.textContent = "연결 필요";
  connectButton.textContent = "aJam 연결";
}

function renderPreview(): void {
  if (!exportData) {
    categoryList.replaceChildren();
    categoryCount.textContent = "0";
    filledCount.textContent = "0";
    blankCount.textContent = "0";
    return;
  }

  const categories = getOrderedCategories(exportData);
  const order = categories.map((category) => category!.id);
  const filled = categories.flatMap((category) => category!.days).filter((day) => day.value && day.weekday !== 0 && day.weekday !== 6).length;
  const blanks = categories.flatMap((category) => category!.days).filter((day) => !day.value && day.weekday !== 0 && day.weekday !== 6).length;

  categoryList.replaceChildren(
    ...categories.map((category, index) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const up = document.createElement("button");
      const down = document.createElement("button");

      label.textContent = category!.label;
      up.textContent = "↑";
      down.textContent = "↓";
      up.disabled = index === 0;
      down.disabled = index === categories.length - 1;
      up.addEventListener("click", async () => {
        [order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
        await setCategoryOrder(order);
        renderPreview();
      });
      down.addEventListener("click", async () => {
        [order[index + 1], order[index]] = [order[index]!, order[index + 1]!];
        await setCategoryOrder(order);
        renderPreview();
      });

      item.append(label, up, down);
      return item;
    })
  );
  categoryCount.textContent = String(categories.length);
  filledCount.textContent = String(filled);
  blankCount.textContent = String(blanks);
}

async function loadExport(): Promise<void> {
  if (!settings.connection) {
    setStatus("먼저 aJam을 연결해 주세요.");
    return;
  }

  const connection = await getValidConnection(settings.connection);
  settings.connection = connection;
  settings.lastMonth = monthInput.value;
  await saveSettings(settings);
  exportData = await fetchMonthlyTimeMacro(connection, monthInput.value);
  renderConnection();
  renderPreview();
  setStatus("월간 데이터를 불러왔습니다.");
}

connectButton.addEventListener("click", async () => {
  const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "");
  const tab = await chrome.tabs.create({ url: getConnectUrl(baseUrl) });

  setStatus("aJam 승인 후 주소의 code 값을 복사해 붙여넣습니다.");
  const code = window.prompt("aJam 연결 승인 후 표시된 code 값을 붙여넣어 주세요.");

  if (!code) {
    return;
  }

  const token = await exchangeCode(baseUrl, code);
  settings.connection = {
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.expiresAt,
    baseUrl,
    connectedUsername: token.connectedUsername,
    refreshToken: token.refreshToken,
    scopes: token.scopes
  };
  await saveSettings(settings);
  await chrome.tabs.remove(tab.id!);
  renderConnection();
  setStatus("aJam 연결이 완료되었습니다.");
});

refreshButton.addEventListener("click", () => {
  loadExport().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "불러오기 실패"));
});

runButton.addEventListener("click", async () => {
  if (!exportData) {
    await loadExport();
  }

  if (!exportData) {
    return;
  }

  runButton.hidden = true;
  stopButton.hidden = false;
  setStatus("시간 입력 중입니다.");

  try {
    await runMacroInActiveTab(buildMacroSteps(exportData, getCategoryOrder()));
    setStatus("시간 입력이 완료되었습니다.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "시간 입력 실패");
  } finally {
    runButton.hidden = false;
    stopButton.hidden = true;
  }
});

stopButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { type: "STOP_AJAM_TIME_MACRO" });
  }
});

settings = await getSettings();
monthInput.value = settings.lastMonth;
renderConnection();
renderPreview();
```

- [ ] **Step 2: Build extension package**

Run: `pnpm --filter @timesheet/extension build`

Expected: PASS and `apps/extension/dist` contains `manifest.json`, popup assets, and compiled JS.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/popup.ts
git commit -m "feat(extension): add time entry popup"
```

---

### Task 9: Documentation And Verification

**Files:**
- Create: `apps/extension/README.md`
- Modify: `docs/timesheet-workflow.md`

- [ ] **Step 1: Document extension usage**

Create `apps/extension/README.md`:

```md
# aJam Chrome Extension

This package contains the unpacked Chrome extension for the monthly time-entry macro.

## Local Build

```bash
pnpm --filter @timesheet/extension build
```

Load `apps/extension/dist` from `chrome://extensions` with developer mode enabled.

## Time Entry Flow

1. Open the extension popup.
2. Set the aJam base URL.
3. Click `aJam 연결`.
4. Approve the connection in aJam.
5. Paste the connection code into the popup.
6. Select a month and refresh data.
7. Open the external timesheet page.
8. Place the cursor in the first time input.
9. Click `시간 입력 실행`.

The macro types from the current cursor position. It does not submit the external page.
```

- [ ] **Step 2: Update workflow docs**

Add this section to `docs/timesheet-workflow.md` before `## Verification`:

```md
## Chrome Extension Time Macro

- The Chrome extension time-entry MVP reads monthly macro data through extension-specific auth, not through the normal web session cookie.
- Users connect the extension with `aJam 연결`, then the extension stores its own access token and refresh token locally.
- The monthly export groups work by project, vacation by vacation name, and holidays under `공휴일`.
- Macro execution starts from the user's current focused input in the external timesheet page.
- Weekends do not receive values or Tab movement.
- Weekday cells receive a value when the selected category has hours for that date, then move with Tab.
- Empty weekday cells move with Tab only.
- After each category reaches the end of the month, the macro sends five extra Tab actions before the next category.
- Content entry mode is intentionally deferred.
```

- [ ] **Step 3: Run targeted verification**

Run:

```bash
pnpm --filter @timesheet/domain test
pnpm --filter @timesheet/db typecheck
pnpm --filter @timesheet/web typecheck
pnpm --filter @timesheet/extension typecheck
```

Expected: all PASS.

- [ ] **Step 4: Manual verification**

Manual steps:

1. Run `pnpm --filter @timesheet/extension build`.
2. Load `apps/extension/dist` in Chrome as an unpacked extension.
3. Start the aJam web app only if the user has approved running the dev server.
4. Connect the extension to aJam.
5. Open `apps/extension/dist/test-page.html` in Chrome.
6. Focus the first input.
7. Run `시간 입력 실행`.
8. Confirm values and focus movement match the popup preview.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/README.md docs/timesheet-workflow.md
git commit -m "docs(extension): document time macro workflow"
```

---

## Final Verification

Run targeted checks only:

```bash
pnpm --filter @timesheet/domain test
pnpm --filter @timesheet/db typecheck
pnpm --filter @timesheet/web typecheck
pnpm --filter @timesheet/extension typecheck
```

Do not run `pnpm build` unless the user explicitly asks for a build.

## Plan Self-Review

- Spec coverage: the plan covers extension auth, monthly export, category ordering, focus-based macro execution, weekend skipping, five boundary Tabs, disabled content mode, storage, docs, and verification.
- Placeholder scan: no `TBD`, `TODO`, or incomplete implementation instructions are intentionally left in this plan.
- Type consistency: names used across tasks are consistent: `ExtensionConnection`, `monthly_time_macro:read`, `buildMonthlyTimeMacroExport`, `buildMonthlyTimeMacroSteps`, and `/api/extension/monthly-time-macro`.
