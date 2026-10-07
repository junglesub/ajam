import { withRequestLog, createOperationLog } from "@timesheet/db/logging";
import { listDailyTimesheetReminderTargets, markDailyTimesheetReminderSent } from "@timesheet/db";
import { NextResponse } from "next/server";

type ReminderRequestBody =
  | {
      action?: "list";
      dateKey?: string;
      includeAlreadySent?: boolean;
    }
  | {
      action: "mark-sent";
      dateKey: string;
      email: string;
      userId: string;
    };

function getSeoulDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDateKey(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
}

function verifyToken(request: Request): boolean {
  const expectedToken = process.env.AJAM_INTERNAL_API_TOKEN?.trim();

  if (!expectedToken) {
    createOperationLog("auth", "internal_api").write("warn", "rejected", { reason: "token_not_configured" });
    return false;
  }

  const valid = getBearerToken(request) === expectedToken;
  if (!valid) createOperationLog("auth", "internal_api").write("warn", "rejected", { reason: "missing_or_invalid_token" });
  return valid;
}

async function parseBody(request: Request): Promise<ReminderRequestBody> {
  try {
    const body = await request.json() as ReminderRequestBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      createOperationLog("http", "internal_body").write("warn", "invalid_shape");
    } else if (body.dateKey !== undefined && typeof body.dateKey !== "string") {
      createOperationLog("http", "internal_body").write("warn", "invalid_date_type");
    }
    return body;
  } catch {
    createOperationLog("http", "internal_body").write("warn", "defaulted", { reason: "invalid_json" });
    return {};
  }
}

export const POST = withRequestLog("/api/internal/reminders/daily-timesheet", async (request: Request) => {
  if (!verifyToken(request)) {
    return unauthorized();
  }

  const body = await parseBody(request);

  if (body.action === "mark-sent") {
    if (!isValidDateKey(body.dateKey)) {
      createOperationLog("http", "internal_input").write("warn", "rejected", { reason: "invalid_date" });
      return NextResponse.json({ error: "Invalid dateKey" }, { status: 400 });
    }

    if (!body.email?.trim() || !body.userId?.trim()) {
      createOperationLog("http", "internal_input").write("warn", "rejected", { reason: "missing_recipient" });
      return NextResponse.json({ error: "Missing email or userId" }, { status: 400 });
    }

    await markDailyTimesheetReminderSent({
      dateKey: body.dateKey,
      email: body.email,
      userId: body.userId
    });

    return NextResponse.json({ ok: true });
  }

  const dateKey = body.dateKey?.trim() || getSeoulDateKey();

  if (!isValidDateKey(dateKey)) {
    createOperationLog("http", "internal_input").write("warn", "rejected", { reason: "invalid_date" });
    return NextResponse.json({ error: "Invalid dateKey" }, { status: 400 });
  }

  const result = await listDailyTimesheetReminderTargets({
    dateKey,
    includeAlreadySent: body.includeAlreadySent
  });

  return NextResponse.json({
    ...result,
    ok: true
  });
});
