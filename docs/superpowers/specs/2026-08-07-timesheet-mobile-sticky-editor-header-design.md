# Timesheet Mobile Sticky Editor Header Design

## Goal

Keep the selected date, previous/next date controls, and close control visible while the mobile daily-editor popup scrolls.

## Design

- Reuse the existing popup header; do not create a second header or change the popup DOM structure.
- Below `lg`, make the header `sticky` at `top: 0`, give it an opaque white background, and place it above scrolling form content.
- When the selected date changes while the mobile popup is open, reset its scroll position to the top after React updates the date.
- At `lg` and above, restore static positioning so the desktop right-side editor remains unchanged.
- Preserve the existing sticky save/action area at the bottom of the mobile popup.

## Verification

- At the 425px browser viewport, confirm the header keeps the same top coordinate at the popup's top, middle, and bottom scroll positions.
- Scroll down, move to the next date without closing the popup, and confirm the popup scroll position returns to `0`.
- Confirm the sticky save/action area remains pinned and the page has no horizontal overflow.
- Run focused lint, TypeScript checking without declaration emit, and `git diff --check`. Do not run a build.
