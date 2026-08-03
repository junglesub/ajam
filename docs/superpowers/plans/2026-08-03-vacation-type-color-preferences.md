# Vacation Type Color Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user choose a preset or custom color for a normalized vacation type and keep that preference across years with automatic light/dark rendering.

**Architecture:** Domain code owns the six preset IDs, hex validation, and group color override. A small SQLite-backed store persists one color per `(userId, name)` and the existing vacation-year server action transports the preference map. The existing summary panel edits colors, while calendar and summary rendering share CSS behavior for preset and custom values.

**Tech Stack:** TypeScript, React 19, Next.js server actions, Prisma 7 with SQLite, Tailwind CSS 4, Node test runner.

## Global Constraints

- Add no dependency; use the native `<input type="color">` and CSS `color-mix(in oklab, ...)`.
- Accept only `blue`, `amber`, `emerald`, `rose`, `violet`, `cyan`, lowercase-normalized six-digit hex, or `null` for automatic mode.
- Store one raw color per user and normalized vacation name; apply it across all years.
- Keep automatic rank-based colors when no preference exists.
- Derive light and dark custom-color tints in CSS; do not store theme variants.
- Update product, architecture, decision, and migration documentation.
- Run tests, lint, and typechecks; do not run a production build.

---

### Task 1: Domain Color Contract

**Files:**
- Modify: `packages/domain/src/vacation-year.ts`
- Modify: `packages/domain/src/vacation-year.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `VACATION_COLOR_PRESETS`, `VacationColorPreset`, `VacationColor`, `normalizeVacationColor(value: string): VacationColor | null`.
- Produces: `groupVacationRecordsByName(vacations, colorPreferences?)`, where `colorPreferences` is `Readonly<Record<string, VacationColor>>` and `VacationYearGroup.color` is the resolved color.

- [ ] **Step 1: Write failing domain tests**

Add tests proving that all six presets pass unchanged, `#A1B2C3` normalizes to `#a1b2c3`, shorthand/invalid values return `null`, a preference overrides the automatic group color, and a missing preference keeps the existing sequence.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --filter @timesheet/domain test`

Expected: FAIL because the color contract and override argument do not exist.

- [ ] **Step 3: Implement the minimum shared contract**

In `vacation-year.ts`, export the preset tuple, derive the preset union, define the hex-inclusive color type, validate with `/^#[0-9a-f]{6}$/`, and replace `colorClass` with `color`. Normalize preference keys through the existing `normalizeVacationName` behavior before resolving `preference ?? automaticPreset`.

In `index.ts`, export the new values and types and remove the old `VacationYearColorClass` export.

- [ ] **Step 4: Run the focused test and confirm pass**

Run: `pnpm --filter @timesheet/domain test`

Expected: PASS.

### Task 2: Per-user Persistence And Server Data Flow

**Files:**
- Create: `packages/db/src/vacation-color-store.ts`
- Create: `packages/db/src/vacation-color-store.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/web/src/app/(app)/vacations/actions.ts`
- Modify: `apps/web/src/components/vacations/types.ts`

**Interfaces:**
- Produces: `listVacationTypeColorPreferences(userId): Promise<Array<{ name: string; color: VacationColor }>>`.
- Produces: `setVacationTypeColorPreference({ userId, name, color }): Promise<void>`, where `color` is `VacationColor | null` and `null` deletes.
- Produces: `saveVacationTypeColorAction(year, name, color): Promise<VacationYearData>`.
- Extends: `VacationYearData.colorPreferences: Record<string, VacationColor>`.

- [ ] **Step 1: Write a failing isolated DB test**

Use a temporary SQLite file, set `DATABASE_URL` before dynamically importing the store, insert the minimum `User` row, then assert preset upsert, custom-color replacement, listing, and `null` deletion. Disconnect Prisma and remove the temporary directory in test cleanup.

- [ ] **Step 2: Add the DB test script and confirm failure**

Add `"test": "node --import tsx --test src/vacation-color-store.test.ts"` to `packages/db/package.json`.

Run: `pnpm --filter @timesheet/db test`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Add the model and focused runtime store**

Add `VacationTypeColorPreference` with `id`, `userId`, `name`, `color`, timestamps, user cascade relation, and `@@unique([userId, name])` to the Prisma schema and User relation list.

Implement one lazily ensured table and unique index following the existing raw-SQL store pattern. Normalize the name with `normalizeVacationName`, validate colors with `normalizeVacationColor`, bind all values as SQL parameters, upsert on `(userId, name)`, and delete on `null`.

- [ ] **Step 4: Export the store and run its test**

Export the two functions and preference type from `packages/db/src/index.ts`.

Run: `pnpm --filter @timesheet/db test`

Expected: PASS.

- [ ] **Step 5: Carry preferences through existing vacation data**

In `loadVacationYearAction`, fetch preferences in the existing `Promise.all` and serialize them with `Object.fromEntries` into `VacationYearData.colorPreferences`.

Add `saveVacationTypeColorAction`: authenticate, validate year, reject blank names, normalize and validate non-null color, call the store, revalidate `/vacations`, and return `loadVacationYearAction(year)`.

### Task 3: Color Editor And Theme-aware Rendering

**Files:**
- Modify: `apps/web/src/app/(app)/vacations/page.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `apps/web/src/components/vacations/vacation-summary-panel.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-calendar.tsx`
- Modify: `apps/web/src/components/vacations/vacation-date-cell.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `VacationYearData.colorPreferences`, `VacationYearGroup.color`, `VACATION_COLOR_PRESETS`.
- Consumes: `saveVacationTypeColorAction(year, name, color)`.

- [ ] **Step 1: Wire preference state into grouping and mutations**

Pass the save action from the page to the workspace. Store `colorPreferences` beside the existing year data, refresh it in `applyVacationYearData`, and call `groupVacationRecordsByName(vacations, colorPreferences)`. Add a save handler that applies returned data and does not broadcast unrelated views.

- [ ] **Step 2: Add the accessible single-row editor**

Turn each summary swatch into a button with an `aria-label` containing the vacation name and `aria-expanded`. Keep one open name in local state. Render six labeled preset buttons, native `<input type="color">`, and `자동 배정`; disable controls while saving and display `저장 중` or a row-local error. Close the editor only after a successful save.

- [ ] **Step 3: Render preset and custom colors in both consumers**

Update calendar lookup and date-cell props from preset-only tone to `VacationColor`. For presets, retain the existing classes and `data-vacation-tone`. For custom hex, set `--vacation-custom-color` and a `vacation-custom-color` class on calendar fills and summary swatches.

- [ ] **Step 4: Add automatic light/dark CSS tinting**

Define `.vacation-custom-color` with `background-color: color-mix(in oklab, var(--vacation-custom-color) 40%, white)` and a dark-theme override mixing the same raw color 40% with `#1f1f1f`. Keep the existing preset dark overrides unchanged.

### Task 4: Documentation And Verification

**Files:**
- Create: `docs/db-migrations/2026-08-03-vacation-type-color-preferences.sql`
- Modify: `docs/product-brief.md`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`

- [ ] **Step 1: Document product behavior and architecture**

Record per-user, cross-year behavior, automatic fallback, native custom picker, raw hex storage, CSS theme adjustment, and the deliberate choice not to add a vacation-type entity or store theme variants.

- [ ] **Step 2: Add reference migration SQL**

Document an idempotent `VacationTypeColorPreference` table and `(userId, name)` unique index matching the runtime schema and cascade relationship.

- [ ] **Step 3: Run all tests**

Run: `pnpm -r --if-present test`

Expected: all domain and DB tests pass.

- [ ] **Step 4: Run lint and typechecks without a build**

Run: `pnpm lint`

Run: `pnpm typecheck`

Expected: both pass. Do not run `pnpm build`.

- [ ] **Step 5: Review the final diff and commit**

Run: `git diff --check` and `git status --short`.

Commit with an Angular-style message such as `feat(vacation): customize type colors` after verification.

### Task 5: Compact Custom And Automatic Color Controls

**Files:**
- Modify: `apps/web/src/components/vacations/vacation-summary-panel.tsx`
- Modify: `docs/product-brief.md`

**Interfaces:**
- Consumes: `VACATION_COLOR_PRESETS`, the existing sorted `groups`, and `onColorSave(name, color)`.
- Produces: an immediate-save custom color control and a visible automatic-color preview without changing persistence or domain APIs.

- [ ] **Step 1: Replace the custom text controls**

Import `Pencil` from `lucide-react` and a ref from React. Render a round button with a conic rainbow gradient and centered pencil icon. Its click calls `customColorInputRef.current?.click()` on a visually hidden, uncontrolled native color input. The DOM owns in-progress picker values; one native `change` listener reads the confirmed value and saves after the picker closes, preventing an in-progress picker from being disabled or unmounted. Remove the separate `적용` button.

- [ ] **Step 2: Replace automatic assignment text with a preview circle**

Read the `index` argument from `groups.map`. Resolve `automaticColor = VACATION_COLOR_PRESETS[index % VACATION_COLOR_PRESETS.length]!`. Render the automatic action as a round preset-colored button with `data-vacation-tone={automaticColor}`, centered `A`, Korean `aria-label`, and `aria-pressed={preferredColor === undefined}`. Clicking it calls `saveColor(group.name, null)`.

- [ ] **Step 3: Preserve accessibility and saving behavior**

Give the custom button `aria-label={`${group.name} 직접 색상 선택`}`, `aria-pressed={preferredColor?.startsWith("#") ?? false}`, and the same disabled state as other controls. Keep the hidden input labeled and disabled while saving. Preserve row-local `aria-live` saving/error feedback.

- [ ] **Step 4: Document and verify**

Update the product brief to note compact visual custom/automatic controls. Run `pnpm --filter @timesheet/web typecheck`, `pnpm lint`, and `git diff --check`. Do not run a production build.

- [ ] **Step 5: Commit**

Stage the summary panel, product brief, design update, and plan update. Commit with `feat(vacation): refine color controls`.
