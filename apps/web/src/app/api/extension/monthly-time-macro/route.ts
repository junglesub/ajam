import { getMonthlyTimeMacroExportForUser } from "@timesheet/db";
import { NextResponse } from "next/server";

import { authenticateExtensionRequest } from "@/server/extension-auth";

function getMonth(request: Request): string {
  const url = new URL(request.url);

  return url.searchParams.get("month") ?? "";
}

function isValidMonth(month: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  return year >= 1000 && monthNumber >= 1 && monthNumber <= 12;
}

export async function GET(request: Request) {
  const auth = await authenticateExtensionRequest(request, "monthly_time_macro:read");

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = getMonth(request);

  if (!isValidMonth(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const data = await getMonthlyTimeMacroExportForUser({
    month,
    userId: auth.userId
  });

  return NextResponse.json({
    ...data,
    ok: true
  });
}
