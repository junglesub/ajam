import { runNotionDailyMaintenance } from "@timesheet/db";
import { NextResponse } from "next/server";

type DailyMaintenanceRequestBody = {
  dateKey?: string;
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
    return false;
  }

  return getBearerToken(request) === expectedToken;
}

async function parseBody(request: Request): Promise<DailyMaintenanceRequestBody> {
  try {
    return (await request.json()) as DailyMaintenanceRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (!verifyToken(request)) {
    return unauthorized();
  }

  const body = await parseBody(request);
  const dateKey = body.dateKey?.trim() || getSeoulDateKey();

  if (!isValidDateKey(dateKey)) {
    return NextResponse.json({ error: "Invalid dateKey" }, { status: 400 });
  }

  const result = await runNotionDailyMaintenance({ dateKey });

  return NextResponse.json({
    ...result,
    ok: result.errors.length === 0
  });
}
