import { withRequestLog } from "@timesheet/db/logging";
import { createNotionLog, notionErrorMessage, handleNotionWebhook, NotionWebhookError } from "@timesheet/db";
import { NextResponse } from "next/server";

export const POST = withRequestLog("/api/notion/webhook/[connectionId]", async (request: Request, context: { params: Promise<{ connectionId: string }> }) => {
  const { connectionId } = await context.params;
  const log = createNotionLog("webhook_request", { source: "webhook" });
  log.write("info", "received", { connectionId });
  try {
    const rawBody = await request.text();
    const result = await handleNotionWebhook({
      context: log.context,
      connectionId,
      rawBody,
      signature: request.headers.get("x-notion-signature") ?? ""
    });
    log.write("info", result, { connectionId, status: 200 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof NotionWebhookError ? error.status : 500;
    log.write(status < 500 ? "warn" : "error", "failed", { connectionId, status, error: notionErrorMessage(error) });
    return NextResponse.json({
      error: error instanceof NotionWebhookError ? error.message : "Notion Webhook 처리에 실패했습니다."
    }, { status });
  }
});
