# Mobile App Navigation Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded header below `lg` with menu and refresh buttons while moving navigation and account actions into an accessible left drawer.

**Architecture:** Keep the authenticated layout server-rendered and add one focused client component for mobile drawer state and focus management. Reuse `AppNav` through a vertical variant and preserve the current desktop header in a separate `lg:flex` row.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind CSS 4, Lucide React

## Global Constraints

- Below `lg`, the header shows only `메뉴 열기` and `현재 화면 새로고침`.
- The drawer includes brand, five current destinations, username, labeled settings, and logout.
- Desktop header behavior and appearance remain unchanged from `lg` upward.
- Use existing dependencies and server actions only.
- Run tests and lint only after every implementation and documentation edit is complete.
- Do not run a build.

---

### Task 1: Reusable navigation variants

**Files:**
- Modify: `apps/web/src/app/(app)/app-nav.tsx`
- Modify: `apps/web/src/app/(app)/app-settings-button.tsx`

**Interfaces:**
- Consumes: existing `navItems`, pathname active-state logic, and settings modal behavior.
- Produces: `AppNav({ onNavigate?, variant? })` and `AppSettingsButton({ showLabel? })` with unchanged defaults.

- [ ] **Step 1: Add the sidebar navigation variant**

Add props:

```tsx
type AppNavProps = {
  onNavigate?: () => void;
  variant?: "desktop" | "sidebar";
};
```

Use `variant === "sidebar"` to render a vertical full-width nav and full-width links with rounded active backgrounds; call `onNavigate` from each link. Keep the existing horizontal classes as the default branch.

- [ ] **Step 2: Add the labeled settings trigger**

Extend `AppSettingsButtonProps` with `showLabel?: boolean`, default it to `false`, and choose complete trigger class strings rather than conflicting fixed-size overrides. The labeled form is a full-width, left-aligned row containing the existing settings icon and the text `설정`; modal contents remain unchanged.

### Task 2: Accessible mobile drawer

**Files:**
- Create: `apps/web/src/app/(app)/mobile-app-menu.tsx`

**Interfaces:**
- Consumes: `AppNav`, `logoutAction`, a `settingsButton: ReactNode`, and `username: string`.
- Produces: `MobileAppMenu({ settingsButton, username })` with a 36px menu trigger and a body-portal drawer.

- [ ] **Step 1: Build the drawer shell**

Create a client component using `Menu`, `X`, `CalendarDays`, and `LogOut`. The closed state renders only the menu trigger. The open state portals a full-screen backdrop and a left `<aside role="dialog" aria-modal="true" aria-labelledby="mobile-app-menu-title">` no wider than `320px`.

- [ ] **Step 2: Add drawer contents**

Render the brand and close button at the top, `<AppNav variant="sidebar" onNavigate={closeMenu} />` in the scrollable middle, and a bottom account area containing username, `settingsButton`, and a logout form using `logoutAction`.

- [ ] **Step 3: Add interaction and focus handling**

When open, save and lock `document.body.style.overflow`, focus the drawer on the next animation frame, close on Escape, and cycle Tab/Shift+Tab between drawer focusable elements. Close from the backdrop, close button, or navigation callback. Restore body overflow and menu-trigger focus on close.

### Task 3: Responsive authenticated header

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `docs/product-brief.md`
- Modify: `docs/timesheet-workflow.md`

**Interfaces:**
- Consumes: current user/settings data, `MobileAppMenu`, `AppRefreshButton`, and the unchanged desktop header controls.
- Produces: separate mobile and desktop header rows at the `lg` breakpoint.

- [ ] **Step 1: Render the compact mobile row**

Use a `flex w-full items-center justify-between lg:hidden` row containing `MobileAppMenu` on the left and `AppRefreshButton` on the right. Pass a labeled `AppSettingsButton` as the drawer's `settingsButton`.

- [ ] **Step 2: Preserve the desktop row**

Wrap the existing brand/navigation and refresh/settings/username groups in `hidden w-full items-center justify-between gap-4 lg:flex`. Keep their existing inner markup and classes.

- [ ] **Step 3: Compact only the mobile header spacing**

Use `px-3 py-2 lg:px-5 lg:py-4` on the header and remove mobile wrapping from the shared outer container. Do not change desktop spacing.

- [ ] **Step 4: Document the responsive navigation**

Record the compact mobile controls, drawer contents, closing behavior, focus/body-scroll behavior, and unchanged desktop layout in `docs/product-brief.md` and the header note in `docs/timesheet-workflow.md`.

### Task 4: Final verification and commit

**Files:**
- Verify all files from Tasks 1–3.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verified branch state and implementation commit.

- [ ] **Step 1: Run all static and automated checks**

```powershell
node node_modules/eslint/bin/eslint.js 'apps/web/src/app/(app)/app-nav.tsx' 'apps/web/src/app/(app)/app-settings-button.tsx' 'apps/web/src/app/(app)/mobile-app-menu.tsx' 'apps/web/src/app/(app)/layout.tsx'
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --declaration false --declarationMap false
pnpm -r --if-present test
git diff --check
```

Expected: lint and type checking exit successfully; 53 repository tests pass; whitespace check is clean.

- [ ] **Step 2: Verify the 425px browser state**

Confirm the header height is one compact row and only two visible buttons exist. Open the drawer and verify all five destinations, active state, username, settings, and logout. Confirm body overflow is locked, page width equals viewport width, Escape restores body overflow and focus to the trigger, route selection closes the drawer, and no PostCSS error appears.

- [ ] **Step 3: Commit the implementation**

```powershell
git add -- 'apps/web/src/app/(app)/app-nav.tsx' 'apps/web/src/app/(app)/app-settings-button.tsx' 'apps/web/src/app/(app)/mobile-app-menu.tsx' 'apps/web/src/app/(app)/layout.tsx' 'docs/product-brief.md' 'docs/timesheet-workflow.md' 'docs/superpowers/plans/2026-08-07-mobile-app-navigation-drawer.md'
git commit -m "feat(nav): add compact mobile drawer"
```
