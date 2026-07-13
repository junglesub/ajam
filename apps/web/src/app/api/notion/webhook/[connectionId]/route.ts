import { handleNotionWebhook, NotionWebhookError } from "@timesheet/db";
import { NextResponse } from "next/server";

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params;
  const rawBody = await request.text();

  try {
    const result = await handleNotionWebhook({
      connectionId,
      rawBody,
      signature: request.headers.get("x-notion-signature") ?? ""
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof NotionWebhookError ? error.status : 500;
    return NextResponse.json({
      error: error instanceof NotionWebhookError ? error.message : "Notion Webhook 처리에 실패했습니다."
    }, { status });
  }
}
