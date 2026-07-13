import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { adjacentListTarget, browserMonth, shiftMonth, shouldIgnoreCalendarShortcut } from "./calendar-shortcuts.ts";

function shortcutEvent(overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    metaKey: false,
    repeat: false,
    target: null,
    ...overrides
  };
}

describe("calendar shortcut suppression", () => {
  it("allows an unmodified shortcut outside an editor", () => {
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent()), false);
  });

  it("ignores editable targets", () => {
    const target = { closest: (selector) => selector.includes("input") ? target : null };

    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ target })), true);
  });

  it("ignores marked shortcut regions", () => {
    const target = { closest: (selector) => selector.includes("[data-calendar-shortcuts-ignore]") ? target : null };

    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ target })), true);
  });

  it("ignores modifiers, composition, repeats, and open modals", () => {
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ ctrlKey: true })), true);
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ metaKey: true })), true);
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ altKey: true })), true);
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ isComposing: true })), true);
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent({ repeat: true })), true);
    assert.equal(shouldIgnoreCalendarShortcut(shortcutEvent(), true), true);
  });
});

describe("calendar month navigation", () => {
  it("crosses year boundaries", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });

  it("returns the browser-local current month", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    assert.equal(browserMonth(), expected);
  });
});

describe("list row navigation", () => {
  const targets = [
    { dateKey: "2026-07-13", entryClientId: "first" },
    { dateKey: "2026-07-13", entryClientId: "second" },
    { dateKey: "2026-07-10", entryClientId: "" }
  ];

  it("moves between rendered entries on the same date", () => {
    assert.deepEqual(adjacentListTarget(targets, "2026-07-13", "first", 1), targets[1]);
    assert.deepEqual(adjacentListTarget(targets, "2026-07-13", "second", 1), targets[2]);
  });

  it("stops at list boundaries", () => {
    assert.equal(adjacentListTarget(targets, "2026-07-13", "first", -1), undefined);
    assert.equal(adjacentListTarget(targets, "2026-07-10", "", 1), undefined);
  });

  it("enters from the matching edge when the selection is outside the list", () => {
    assert.deepEqual(adjacentListTarget(targets, "2026-07-31", "", 1), targets[0]);
    assert.deepEqual(adjacentListTarget(targets, "2026-07-31", "", -1), targets[2]);
  });
});
