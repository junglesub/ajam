import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { shouldSyncNotionPropertyEvent, verifyNotionWebhookSignature } from "./notion-webhook";
import type { UserNotionConnection } from "./notion-store";

const connection = {
  titleProperty: { id: "title%3Aid", name: "제목", type: "title" },
  statusProperty: { id: "status", name: "상태", type: "status" },
  categoryProperty: null,
  startDateProperty: null,
  endDateProperty: null
} as UserNotionConnection;

test("verifies Notion HMAC signatures", () => {
  const body = '{"id":"event"}';
  const token = "secret";
  const signature = `sha256=${createHmac("sha256", token).update(body).digest("hex")}`;

  assert.equal(verifyNotionWebhookSignature(body, signature, token), true);
  assert.equal(verifyNotionWebhookSignature(body, `${signature.slice(0, -1)}0`, token), false);
});

test("syncs input properties and ignores aJam output-only changes", () => {
  assert.equal(shouldSyncNotionPropertyEvent({
    data: { updated_properties: ["title:id"] },
    type: "page.properties_updated"
  }, connection), true);
  assert.equal(shouldSyncNotionPropertyEvent({
    data: { updated_properties: ["ajam-hours"] },
    type: "page.properties_updated"
  }, connection), false);
});
