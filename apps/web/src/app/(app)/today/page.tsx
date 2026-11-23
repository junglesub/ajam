import { getManagedUser, listProjects } from "@timesheet/db";
import { toBrowserDateKey } from "@timesheet/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TodayWorkspace } from "@/components/today/today-workspace";
import { destroySession, getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "오늘"
};

export default async function TodayPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const currentUser = await getManagedUser(session.userId);
  if (!currentUser) {
    await destroySession();
    redirect("/login");
  }

  const projects = await listProjects({ userId: currentUser.id });
  const initialDateKey = toBrowserDateKey(new Date());

  return (
    <TodayWorkspace
      initialDateKey={initialDateKey}
      projects={projects}
    />
  );
}
