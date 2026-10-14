import assert from "node:assert/strict";
import test from "node:test";

import { getLogPollInterval, shouldApplyLogResponse } from "./log-viewer-state.ts";

test("poll intervals follow visibility and modal state", () => {
  assert.equal(getLogPollInterval(false, false), null);
  assert.equal(getLogPollInterval(false, true), null);
  assert.equal(getLogPollInterval(true, false), 30000);
  assert.equal(getLogPollInterval(true, true), 10000);
});

test("stale or foreign-user responses are ignored", () => {
  assert.equal(shouldApplyLogResponse({ userId: "A", requestId: 2 }, { userId: "B", requestId: 2 }), false);
  assert.equal(shouldApplyLogResponse({ userId: "A", requestId: 3 }, { userId: "A", requestId: 2 }), false);
  assert.equal(shouldApplyLogResponse({ userId: "A", requestId: 2 }, { userId: "A", requestId: 2 }), true);
  assert.equal(shouldApplyLogResponse({ userId: "A", requestId: 2 }, { userId: "A", requestId: 3 }), true);
});
