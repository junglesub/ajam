"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";

import { requestViewRefresh, useViewRefreshLoading, type ViewRefreshScope } from "@/lib/view-refresh";

function getScope(pathname: string): ViewRefreshScope {
  if (pathname.startsWith("/ai-summary")) {
    return "ai-summary";
  }

  if (pathname.startsWith("/notion-cards")) {
    return "notion-cards";
  }

  if (pathname.startsWith("/projects")) {
    return "projects";
  }

  if (pathname.startsWith("/vacations")) {
    return "vacations";
  }

  return "timesheet";
}

export function AppRefreshButton() {
  const pathname = usePathname();
  const scope = getScope(pathname);
  const isRefreshing = useViewRefreshLoading(scope);

  function refreshCurrentView() {
    requestViewRefresh(scope);
  }

  return (
    <button
      aria-label="현재 화면 새로고침"
      className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
      disabled={isRefreshing}
      onClick={refreshCurrentView}
      title="현재 화면 새로고침"
      type="button"
    >
      <RefreshCw aria-hidden="true" className={isRefreshing ? "size-5 animate-spin" : "size-5"} strokeWidth={2.4} />
    </button>
  );
}
