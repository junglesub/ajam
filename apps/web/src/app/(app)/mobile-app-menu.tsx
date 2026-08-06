"use client";

import { CalendarDays, LogOut, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AppNav } from "./app-nav";
import { logoutAction } from "./timesheet/actions";

type MobileAppMenuProps = {
  settingsButton: ReactNode;
  username: string;
};

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function MobileAppMenu({ settingsButton, username }: MobileAppMenuProps) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const focusFrame = requestAnimationFrame(() => drawerRef.current?.focus());

    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current?.contains(document.activeElement)) {
        return;
      }

      const focusableElements = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="메뉴 열기"
        className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <Menu aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </button>

      {open ? createPortal(
        <div
          className="fixed inset-0 z-50 bg-slate-950/40"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
          role="presentation"
        >
          <aside
            aria-labelledby="mobile-app-menu-title"
            aria-modal="true"
            className="flex h-full w-80 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-2xl outline-none"
            ref={drawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white shadow-sm">
                  <CalendarDays aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-950" id="mobile-app-menu-title">업무 기록 관리</h2>
                  <p className="truncate text-xs font-semibold text-slate-500">aJam by junglesub</p>
                </div>
              </div>
              <button
                aria-label="메뉴 닫기"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <AppNav onNavigate={() => setOpen(false)} variant="sidebar" />
            </div>

            <div className="border-t border-slate-200 p-3">
              <div className="mb-2 rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">로그인 사용자</p>
                <p className="mt-0.5 truncate text-sm font-bold text-slate-950">{username}</p>
              </div>
              {settingsButton}
              <form action={logoutAction}>
                <button
                  className="inline-flex h-10 w-full items-center justify-start gap-3 rounded-md px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
                  type="submit"
                >
                  <LogOut aria-hidden="true" className="size-5" />
                  로그아웃
                </button>
              </form>
            </div>
          </aside>
        </div>,
        document.body
      ) : null}
    </>
  );
}
