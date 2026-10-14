import assert from "node:assert/strict";
import test from "node:test";

import { isStaleStamp, resolveTabForRole } from "./log-viewer-guards.ts";

test("delayed cross-user responses are stale", () => {
  const current = { userId: "B", generation: 2 };
  assert.equal(isStaleStamp(current, { userId: "A", generation: 2 }), true);
  assert.equal(isStaleStamp(current, { userId: "A", generation: 5 }), true);
});

test("only the current generation passes", () => {
  const current = { userId: "A", generation: 3 };
  assert.equal(isStaleStamp(current, { userId: "A", generation: 2 }), true);
  assert.equal(isStaleStamp(current, { userId: "A", generation: 3 }), false);
  assert.equal(isStaleStamp(current, { userId: "A", generation: 4 }), true);
});

test("filter change and unmount invalidate pending detail stamps", () => {
  let detailGeneration = 7;
  const pending = { userId: "A", generation: detailGeneration };
  detailGeneration += 1;
  assert.equal(isStaleStamp({ userId: "A", generation: detailGeneration }, pending), true);
});

test("admin to user transition leaves the site tab", () => {
  assert.equal(resolveTabForRole(true, "site"), "site");
  assert.equal(resolveTabForRole(true, "mine"), "mine");
  assert.equal(resolveTabForRole(false, "site"), "mine");
  assert.equal(resolveTabForRole(false, "mine"), "mine");
});
