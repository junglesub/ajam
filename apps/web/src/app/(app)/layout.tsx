import { getAppSetting, getManagedUser, getUserAiSetting, listManagedUsers, listTimesheetAiRewriteRequests } from "@timesheet/db";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { destroySession, getSession } from "@/server/session";

import { AppNav } from "./app-nav";
import { AppRefreshButton } from "./app-refresh-button";
import { AppSettingsButton } from "./app-settings-button";
import { MobileAppMenu } from "./mobile-app-menu";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const currentUser = await getManagedUser(session.userId);

  if (!currentUser) {
    await destroySession();
    redirect("/login");
  }

  const [holidayApiKey, managedUsers, aiSetting, aiRewriteRequests] = await Promise.all([
    currentUser.role === "ADMIN" ? getAppSetting("data_go_kr_service_key") : Promise.resolve(null),
    currentUser.role === "ADMIN" ? listManagedUsers() : Promise.resolve([]),
    getUserAiSetting(currentUser.id),
    listTimesheetAiRewriteRequests(currentUser.id)
  ]);

  return (
    <main className="min-h-full bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur lg:px-5 lg:py-4">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex w-full items-center justify-between lg:hidden">
            <MobileAppMenu
              settingsButton={(
                <AppSettingsButton
                  aiRewriteRequests={aiRewriteRequests}
                  aiSetting={aiSetting}
                  currentUser={currentUser}
                  initialHolidayApiKey={holidayApiKey ?? ""}
                  initialManagedUsers={managedUsers}
                  showLabel
                />
              )}
              username={currentUser.username}
            />
            <AppRefreshButton />
          </div>

          <div className="hidden w-full flex-wrap items-center justify-between gap-4 lg:flex">
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
              <Link className="flex min-w-0 items-center gap-3 rounded-md outline-none transition focus-visible:ring-4 focus-visible:ring-slate-100" href="/timesheet">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white shadow-sm">
                  <CalendarDays aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold leading-6 tracking-normal text-slate-950">업무 기록 관리</h1>
                  <p className="text-sm font-semibold leading-4 text-slate-500">aJam by junglesub</p>
                </div>
              </Link>
              <AppNav />
            </div>

            <div className="flex items-center gap-2">
              <AppRefreshButton />
              <AppSettingsButton
                aiRewriteRequests={aiRewriteRequests}
                aiSetting={aiSetting}
                currentUser={currentUser}
                initialHolidayApiKey={holidayApiKey ?? ""}
                initialManagedUsers={managedUsers}
              />
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-950">{currentUser.username}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
