import { createHmac, timingSafeEqual } from "node:crypto";

import { createNotionLog, notionErrorMessage, type NotionLogContext } from "./notion-log";
import { syncSingleNotionCard } from "./notion-sync";
import {
  claimNotionWebhookEvent,
  completeNotionWebhookEvent,
  getNotionWebhookById,
  getUserNotionConnection,
  markNotionCardStale,
  releaseNotionWebhookEvent,
  saveNotionWebhookVerificationToken,
  type UserNotionConnection
} from "./notion-store";

type NotionWebhookEvent = {
  data?: { parent?: { data_source_id?: string }; updated_properties?: string[] };
  entity?: { id?: string; type?: string };
  id?: string;
  type?: string;
  verification_token?: string;
};

export function verifyNotionWebhookSignature(rawBody: string, signature: string, token: string): boolean {
  const expected = `sha256=${createHmac("sha256", token).update(rawBody).digest("hex")}`;

  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function normalizePropertyId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function shouldSyncNotionPropertyEvent(event: NotionWebhookEvent, connection: UserNotionConnection): boolean {
  if (event.type !== "page.properties_updated") {
    return true;
  }

  const inputIds = [
    connection.titleProperty,
    connection.statusProperty,
    connection.categoryProperty,
    connection.startDateProperty,
    connection.endDateProperty
  ]
    .flatMap((property) => property ? [property.id, property.name] : [])
    .map(normalizePropertyId);

  return (event.data?.updated_properties ?? []).map(normalizePropertyId).some((id) => inputIds.includes(id));
}

export async function handleNotionWebhook(params: {
  context?: NotionLogContext;
  connectionId: string;
  rawBody: string;
  signature: string;
}): Promise<"duplicate" | "ignored" | "processed" | "verified"> {
  const log = createNotionLog("webhook_event", params.context);
  const webhook = await getNotionWebhookById(params.connectionId);

  if (!webhook) {
    throw new NotionWebhookError(404, "Webhook 연결을 찾을 수 없습니다.");
  }

  let event: NotionWebhookEvent;
  try {
    event = JSON.parse(params.rawBody) as NotionWebhookEvent;
  } catch {
    throw new NotionWebhookError(400, "Webhook payload가 올바르지 않습니다.");
  }

  if (event.verification_token) {
    if (webhook.verificationToken && webhook.verificationToken !== event.verification_token) {
      throw new NotionWebhookError(409, "이미 verification token을 받은 Webhook입니다.");
    }
    await saveNotionWebhookVerificationToken(params.connectionId, event.verification_token);
    log.write("info", "verified", { connectionId: params.connectionId, userId: webhook.userId });
    return "verified";
  }

  if (!webhook.verificationToken || !params.signature || !verifyNotionWebhookSignature(params.rawBody, params.signature, webhook.verificationToken)) {
    throw new NotionWebhookError(401, "Webhook 서명이 올바르지 않습니다.");
  }

  if (!event.id || event.entity?.type !== "page" || !event.entity.id || !event.type) {
    throw new NotionWebhookError(400, "지원하지 않는 Webhook payload입니다.");
  }

  const fields = { connectionId: params.connectionId, userId: webhook.userId, eventId: event.id, eventType: event.type, pageId: event.entity.id };
  log.write("info", "received", fields);
  const claim = await claimNotionWebhookEvent({ connectionId: params.connectionId, eventId: event.id });
  if (claim === "complete") {
    log.write("info", "duplicate", fields);
    return "duplicate";
  }
  // TODO: Reclaim stale processing claims if crash recovery becomes necessary.
  if (claim === "processing") {
    log.write("warn", "processing_conflict", fields);
    throw new NotionWebhookError(409, "Webhook 이벤트가 이미 처리 중입니다.");
  }

  try {
    if (event.type === "page.deleted") {
      await markNotionCardStale({ notionPageId: event.entity.id, userId: webhook.userId });
      await completeNotionWebhookEvent({ connectionId: params.connectionId, eventId: event.id });
      log.write("info", "processed", { ...fields, action: "mark_stale" });
      return "processed";
    }

    if (!["page.created", "page.properties_updated", "page.undeleted"].includes(event.type)) {
      await completeNotionWebhookEvent({ connectionId: params.connectionId, eventId: event.id });
      log.write("info", "ignored", { ...fields, reason: "unsupported_event" });
      return "ignored";
    }

    const connection = await getUserNotionConnection(webhook.userId);
    if (!connection || (event.data?.parent?.data_source_id && event.data.parent.data_source_id !== connection.dataSourceId) || !shouldSyncNotionPropertyEvent(event, connection)) {
      await completeNotionWebhookEvent({ connectionId: params.connectionId, eventId: event.id });
      const reason = !connection ? "missing_connection"
        : event.data?.parent?.data_source_id && event.data.parent.data_source_id !== connection.dataSourceId
          ? "different_data_source" : "no_input_property_changes";
      log.write("info", "ignored", { ...fields, reason });
      return "ignored";
    }

    await syncSingleNotionCard({ pageId: event.entity.id, userId: webhook.userId, context: log.context });
    await completeNotionWebhookEvent({ connectionId: params.connectionId, eventId: event.id });
  } catch (error) {
    log.write("error", "failed", { ...fields, error: notionErrorMessage(error) });
    await releaseNotionWebhookEvent({
      connectionId: params.connectionId,
      error: error instanceof Error ? error.message : "Notion 자동 동기화에 실패했습니다.",
      eventId: event.id
    });
    throw error;
  }
  log.write("info", "processed", fields);
  return "processed";
}

export class NotionWebhookError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
