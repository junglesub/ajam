# Mobile App Navigation Drawer Design

## Goal

Replace the crowded compact header below `lg` with only a menu button and the existing refresh button, while keeping all navigation and account actions available in an accessible side drawer.

## Responsive layout

- Below `lg`, the header is one compact row: menu button on the left and refresh on the right.
- The brand, horizontal navigation, settings trigger, and username are hidden from the compact header.
- At `lg` and above, the existing desktop brand, horizontal navigation, refresh, settings, and username layout remains unchanged.

## Drawer

- The menu button opens a left-side drawer through a body portal so header backdrop effects cannot constrain the viewport overlay.
- The drawer contains the aJam brand, the five existing navigation destinations, and a bottom account area with username, labeled settings control, and direct logout.
- Navigation items reuse the existing `AppNav` data and active-route logic in a vertical variant; choosing a destination closes the drawer.
- The drawer closes from its close button, backdrop, or Escape.
- Opening locks body scrolling and moves focus to the drawer. Tab and Shift+Tab remain inside the drawer, and closing restores focus to the menu button.

## Components

- `AppNav` gains a `sidebar` variant and optional navigation callback; the default desktop rendering remains unchanged.
- A new `MobileAppMenu` client component owns drawer state, focus, body locking, and logout presentation.
- `AppSettingsButton` gains an optional labeled trigger for the drawer while preserving its icon-only default.
- The authenticated app layout renders separate mobile and desktop header rows at the `lg` breakpoint and supplies the existing settings data to both contexts.

## Verification

- At 425px, confirm the header shows exactly `메뉴 열기` and `현재 화면 새로고침`, and its height is one compact row.
- Confirm the drawer exposes all five destinations, active-page state, username, settings, and logout.
- Confirm backdrop, close button, Escape, and route selection close the drawer; body scroll and trigger focus are restored.
- Confirm there is no horizontal overflow and the desktop classes preserve the existing header from `lg` upward.
- Run lint, focused TypeScript, repository tests, and `git diff --check` only after implementation. Do not run a build.
