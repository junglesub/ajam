import { revokeExtensionConnection } from "@timesheet/db";
import { NextResponse } from "next/server";

import { authenticateExtensionRequest } from "@/server/extension-auth";

export async function POST(request: Request) {
  const auth = await authenticateExtensionRequest(request, "monthly_time_macro:read");

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await revokeExtensionConnection(auth.connectionId, auth.userId);

  return NextResponse.json({ ok: true });
}
