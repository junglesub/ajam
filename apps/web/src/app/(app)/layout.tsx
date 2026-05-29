import { getManagedUser } from "@timesheet/db";
import { Button } from "@timesheet/ui";
import { CalendarDays, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { destroySession, getSession } from "@/server/session";

import { AppNav } from "./app-nav";
import { logoutAction } from "./actions";

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

  return (
    <main className="min-h-full bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
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
            <div className="hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:block">
              <span className="font-semibold text-slate-950">{currentUser.username}</span> 계정
            </div>
            <form action={logoutAction}>
              <Button className="h-9 px-3" type="submit" variant="secondary">
                <LogOut aria-hidden="true" className="size-4" />
                로그아웃
              </Button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
