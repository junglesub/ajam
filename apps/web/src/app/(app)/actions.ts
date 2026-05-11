"use server";

import { redirect } from "next/navigation";

import { destroySession } from "@/server/session";

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
