"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@timesheet/ui";
import { LogIn, ShieldCheck, X } from "lucide-react";

import { LoginForm } from "./login-form";

export function LoginContainer({
  children,
  next
}: {
  children?: React.ReactNode;
  next: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setIsOpen(false);
      }
    };

    mediaQuery.addEventListener("change", listener);

    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let frameId: number | null = null;

    if (isOpen) {
      wasOpenRef.current = true;
      frameId = requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      ctaRef.current?.focus();
    }

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    let originalOverflow: string | null = null;

    const updateScrollLock = () => {
      if (mediaQuery.matches) {
        if (originalOverflow === null) {
          originalOverflow = document.body.style.overflow;
        }
        document.body.style.overflow = "hidden";
      } else if (originalOverflow !== null) {
        document.body.style.overflow = originalOverflow;
        originalOverflow = null;
      }
    };

    updateScrollLock();

    const listener = () => updateScrollLock();
    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
      if (originalOverflow !== null) {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === "Escape" && window.innerWidth < 1024) {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (!isOpen || window.innerWidth >= 1024) {
      return;
    }

    if (event.key === "Tab" && dialogRef.current) {
      const focusableSelector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableElements =
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (
          document.activeElement === firstElement ||
          document.activeElement === dialogRef.current
        ) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    }
  };

  const isModalActive = isMobile && isOpen;

  return (
    <>
      <div className="absolute right-6 top-7 sm:right-10 sm:top-8 lg:hidden">
        <button
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-800/90 px-3 text-sm font-bold text-white shadow-md ring-1 ring-white/20 transition hover:bg-slate-700 active:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setIsOpen(true)}
          ref={ctaRef}
          type="button"
        >
          <LogIn aria-hidden="true" className="size-4" />
          로그인
        </button>
      </div>

      {children}

      <div
        className={cn(
          "text-slate-950",
          isOpen
            ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 lg:static lg:z-auto lg:flex lg:w-full lg:items-center lg:justify-center lg:bg-slate-50 lg:px-6 lg:py-10 lg:sm:px-10 lg:col-start-2 lg:row-start-1"
            : "hidden lg:flex lg:w-full lg:items-center lg:justify-center lg:bg-slate-50 lg:px-6 lg:py-10 lg:sm:px-10 lg:col-start-2 lg:row-start-1"
        )}
        onMouseDown={(event) => {
          if (
            event.target === event.currentTarget &&
            isOpen &&
            window.innerWidth < 1024
          ) {
            handleClose();
          }
        }}
        role="presentation"
      >
        <div
          aria-labelledby={isModalActive ? "login-dialog-title" : undefined}
          aria-modal={isModalActive ? "true" : undefined}
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl outline-none sm:p-8 lg:rounded-none lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none"
          onKeyDown={handleDialogKeyDown}
          ref={dialogRef}
          role={isModalActive ? "dialog" : undefined}
          tabIndex={-1}
        >
          <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-md bg-slate-950 text-white shadow-lg shadow-slate-950/20">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">로그인</p>
                <h2 className="text-2xl font-bold text-slate-950" id="login-dialog-title">
                  업무 기록 시작
                </h2>
              </div>
            </div>
            <button
              aria-label="로그인 창 닫기"
              className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 lg:hidden"
              onClick={handleClose}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </>
  );
}
