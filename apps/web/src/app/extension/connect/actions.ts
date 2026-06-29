"use server";

import { createExtensionConnectionCode, createExtensionConnectionCodeDisplay } from "@timesheet/db";
import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

const extensionConnectPath = "/extension/connect";
const extensionConnectLoginPath = "/login?next=/extension/connect";

export async function approveExtensionConnectionAction(): Promise<void> {
  const session = await getSession();

  if (!session) {
    redirect(extensionConnectLoginPath);
  }

  const { code, expiresAt } = await createExtensionConnectionCode({
    label: "Chrome extension",
    userId: session.userId
  });
  const { nonce } = await createExtensionConnectionCodeDisplay({
    code,
    expiresAt,
    userId: session.userId
  });

  redirect(`${extensionConnectPath}/success?nonce=${encodeURIComponent(nonce)}`);
}
