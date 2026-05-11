"use server";

import { getManagedUser, listProjectSummaries, renameProject, type ProjectSummary } from "@timesheet/db";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";

async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return user;
}

export async function loadProjectSummariesAction(): Promise<ProjectSummary[]> {
  const user = await requireSession();

  return listProjectSummaries({ userId: user.id });
}

export async function renameProjectAction(params: { fromName: string; toName: string }): Promise<ProjectSummary[]> {
  const user = await requireSession();

  await renameProject({
    fromName: params.fromName,
    toName: params.toName,
    userId: user.id
  });

  return listProjectSummaries({ userId: user.id });
}
