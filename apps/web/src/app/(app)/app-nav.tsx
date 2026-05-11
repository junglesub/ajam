"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderKanban } from "lucide-react";

import { cn } from "@timesheet/ui";

const navItems = [
  { href: "/timesheet", icon: CalendarDays, label: "업무 기록" },
  { href: "/projects", icon: FolderKanban, label: "프로젝트 관리" }
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="flex flex-wrap items-center gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            className={cn(
              "inline-flex h-9 items-center gap-2 border-b-2 border-transparent px-2.5 text-sm font-bold text-slate-500 transition hover:border-slate-200 hover:text-slate-950",
              isActive && "border-slate-950 text-slate-950"
            )}
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden="true" className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
