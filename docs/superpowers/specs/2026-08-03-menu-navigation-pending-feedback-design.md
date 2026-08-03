# App Route Loading Feedback Design

## Context

Every main-menu destination loads initial data in an async App Router page. The menu currently changes its own icon while navigation is pending, but the area the user is waiting for does not show progress. The timesheet workspace already has a content loading screen for its browser-timezone synchronization, while the app route group has no `loading.tsx` fallback.

## Design

Remove the menu-owned pending state and spinner. Keep normal Next.js `Link` navigation and the existing `aria-current="page"` marker.

Extract the existing timesheet loading visual into `apps/web/src/components/app-loading-screen.tsx`. The component renders a centered spinner, title, and description in the content area. It accepts optional text so route navigation can use generic copy while the timesheet keeps its specific month-sync explanation.

Add `apps/web/src/app/(app)/loading.tsx` and render the shared component there. Next.js will use this file as the Suspense fallback for pages under the authenticated app layout, so the header and menu remain mounted while only the page content is replaced during slow navigation. Fast or already-prefetched navigation may complete without visibly showing the fallback.

Use the same shared component for `TimesheetWorkspace`'s existing initial browser-date synchronization instead of its fixed full-viewport markup. Do not add a client loading provider, navigation event bus, skeleton system, dependency, or per-page loading state.

## Accessibility

The shared loading screen uses `role="status"`, `aria-live="polite"`, and a decorative spinner hidden from assistive technology. The current menu item retains `aria-current="page"` until the new route becomes current.

## Documentation

Update `docs/product-brief.md` to state that main-menu navigation retains the header and shows loading feedback in the content area.

## Verification

Run all available package tests, workspace lint, and the web typecheck. Do not run a production build unless the user asks for it.
