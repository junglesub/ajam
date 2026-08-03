# App Route Loading Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing loading visual in the page-content area during slow main-menu navigation.

**Architecture:** Use the App Router's native `(app)/loading.tsx` Suspense boundary. Extract one presentational loading component for both that route fallback and the timesheet's existing browser-date synchronization, and remove custom pending navigation state from the menu.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS

## Global Constraints

- Keep the authenticated header and menu visible while page content loads.
- Do not add a loading provider, event bus, skeleton system, dependency, or per-page route state.
- Preserve normal `Link` behavior and `aria-current="page"`.
- Do not run a production build unless the user asks for it.

---

### Task 1: Replace menu pending state with a shared route loading screen

**Files:**
- Create: `apps/web/src/components/app-loading-screen.tsx`
- Create: `apps/web/src/app/(app)/loading.tsx`
- Modify: `apps/web/src/app/(app)/app-nav.tsx`
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/product-brief.md`
- Modify: `docs/superpowers/specs/2026-08-03-menu-navigation-pending-feedback-design.md`

**Interfaces:**
- Produces: `AppLoadingScreen({ description?, title? }: { description?: string; title?: string })`.
- Consumes: Next.js route-level `loading.tsx` convention and the timesheet `isInitialMonthSyncing` branch.

- [x] **Step 1: Create the shared loading visual**

```tsx
type AppLoadingScreenProps = {
  description?: string;
  title?: string;
};

export function AppLoadingScreen({
  description = "필요한 데이터를 준비하고 있습니다.",
  title = "화면을 불러오는 중"
}: AppLoadingScreenProps) {
  return (
    <div aria-live="polite" className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-6 py-16" role="status">
      <div className="flex flex-col items-center gap-4 text-center">
        <div aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
        <div>
          <p className="text-base font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Add the native App Router fallback**

Create `apps/web/src/app/(app)/loading.tsx`:

```tsx
import { AppLoadingScreen } from "@/components/app-loading-screen";

export default function Loading() {
  return <AppLoadingScreen />;
}
```

- [x] **Step 3: Remove menu-owned loading state**

Remove `LoaderCircle`, `useEffect`, `useState`, `pendingNavigation`, `aria-busy`, `onNavigate`, and pending highlighting from `app-nav.tsx`. Retain the existing active-route styling and:

```tsx
aria-current={isActive ? "page" : undefined}
```

- [x] **Step 4: Reuse the component in the timesheet**

Import `AppLoadingScreen` in `timesheet-workspace.tsx` and replace the `isInitialMonthSyncing` markup with:

```tsx
return (
  <AppLoadingScreen
    description="현재 날짜 기준으로 공휴일과 기록을 확인하고 있습니다."
    title="월간 업무 기록을 불러오는 중"
  />
);
```

- [x] **Step 5: Update product documentation**

Replace the menu-loading UX principle with:

```markdown
- 주요 메뉴 이동은 헤더를 유지하고 콘텐츠 영역에 즉시 로딩 상태를 표시한다.
```

- [x] **Step 6: Verify**

Run:

```powershell
pnpm.cmd -r --if-present test
pnpm.cmd lint
pnpm.cmd --filter @timesheet/web typecheck
git diff --check
```

Expected: 49 domain tests pass and every command exits with code 0. Confirm the diff contains no `onNavigate`, custom navigation state, dependency change, or production build output.

- [x] **Step 7: Commit**

```powershell
git add -- 'apps/web/src/app/(app)/app-nav.tsx' 'apps/web/src/app/(app)/loading.tsx' 'apps/web/src/components/app-loading-screen.tsx' 'apps/web/src/components/timesheet/timesheet-workspace.tsx' 'docs/product-brief.md' 'docs/superpowers/specs/2026-08-03-menu-navigation-pending-feedback-design.md' 'docs/superpowers/plans/2026-08-03-menu-navigation-pending-feedback.md'
git commit -m "fix(web): show loading state in page content"
```
