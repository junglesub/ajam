import assert from "node:assert/strict";
import test from "node:test";

import { resolveLogViewer } from "../../../apps/web/src/server/log-viewer-access";

test("null session or deleted user resolves to null", async () => {
  assert.equal(await resolveLogViewer(null, async () => null), null);
  assert.equal(await resolveLogViewer({ userId: "ghost" }, async () => null), null);
  assert.equal(await resolveLogViewer(null, async () => ({ id: "A", role: "USER" })), null);
});

test("follows current DB role, not stale cookie role", async () => {
  assert.deepEqual(await resolveLogViewer({ userId: "A" }, async () => ({ id: "A", role: "USER" })), { userId: "A", role: "USER" });
  assert.deepEqual(await resolveLogViewer({ userId: "A" }, async () => ({ id: "A", role: "ADMIN" })), { userId: "A", role: "ADMIN" });
  assert.deepEqual(await resolveLogViewer({ userId: "A" }, async () => ({ id: "A", role: "USER" })), { userId: "A", role: "USER" });
});
