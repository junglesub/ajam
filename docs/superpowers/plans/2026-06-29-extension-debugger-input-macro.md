# Extension Debugger Input Macro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Chrome extension enter monthly time values through user-like keyboard input after the user clicks the starting cell.

**Architecture:** Keep the content script responsible for overlay, click detection, iframe coordination, and progress display. Add a background service worker that attaches Chrome Debugger to the active tab and sends text/Tab key events to the currently focused page target. The DOM/event fallback was later disabled so a page cannot receive input through two macro paths.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Chrome Debugger API, existing content script and popup flow.

---

### Task 1: Add Debugger Driver

**Files:**
- Create: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/chrome.d.ts`
- Modify: `apps/extension/src/manifest.json`

- [x] **Step 1: Add a background service worker** that listens for `RUN_AJAM_DEBUGGER_INPUT_MACRO`, attaches `chrome.debugger` to the sender tab, sends text and Tab events, reports progress to the content script, and detaches in `finally`.
- [x] **Step 2: Extend local Chrome typings** for `chrome.debugger`, `chrome.runtime.sendMessage`, and message sender tab IDs used by the service worker.
- [x] **Step 3: Add `"debugger"` permission and `"background": { "service_worker": "background.js", "type": "module" }` to the manifest.

### Task 2: Start Debugger Macro From Click Overlay

**Files:**
- Modify: `apps/extension/src/content-script.ts`

- [x] **Step 1:** After the user clicks the starting input/cell, leave the real click/focus intact and wait 1000 ms before running.
- [x] **Step 2:** Send `RUN_AJAM_DEBUGGER_INPUT_MACRO` to the background script with the macro steps.
- [x] **Step 3:** Receive `AJAM_TIME_MACRO_PROGRESS` messages and update the overlay with completed/total/remaining counts.
- [x] **Step 4:** Disable the existing DOM/event macro fallback so Debugger input is the only runtime input path.

### Task 3: Documentation and Verification

**Files:**
- Modify: `apps/extension/README.md`
- Modify: `docs/timesheet-workflow.md`

- [x] **Step 1:** Document that the extension uses Chrome Debugger keyboard input after the user click and 1 second delay.
- [x] **Step 2:** Run `corepack pnpm --filter @timesheet/extension typecheck`.
- [x] **Step 3:** Run `corepack pnpm --filter @timesheet/extension build`.
- [x] **Step 4:** Run `git diff --check`.
- [x] **Step 5:** Commit with `feat(extension): use debugger input macro`.
