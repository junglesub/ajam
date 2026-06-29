import { exchangeExtensionConnectionCode, getManagedUser } from "@timesheet/db";
import { NextResponse } from "next/server";

import { createExtensionAccessToken } from "@/server/extension-auth";

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch((): Record<string, unknown> => ({}));

  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const code = typeof body.code === "string" ? body.code : "";
  const result = code ? await exchangeExtensionConnectionCode(code) : null;

  if (!result) {
    return NextResponse.json({ error: "Invalid connection code" }, { status: 400 });
  }

  const user = await getManagedUser(result.connection.userId);
  const scopes = result.connection.scopes.split(" ").filter(Boolean);
  const access = await createExtensionAccessToken({
    connectionId: result.connection.id,
    scopes,
    userId: result.connection.userId,
    username: user?.username
  });

  return NextResponse.json({
    ...access,
    connectedUsername: user?.username ?? "",
    refreshToken: result.refreshToken,
    scopes
  });
}
