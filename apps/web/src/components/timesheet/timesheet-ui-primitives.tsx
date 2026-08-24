"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Label, cn } from "@timesheet/ui";

export function Metric({
  icon: Icon,
  label,
  tone,
  value
}: {
  icon: LucideIcon;
  label: string;
  tone?: "red";
  value: string;
}) {
  return (
    <div
      aria-label={`${label} ${value}`}
      className="flex min-w-0 flex-col items-center justify-center gap-1 border-r border-slate-200 px-1 py-1 last:border-r-0 sm:flex-row sm:gap-3 sm:px-4 sm:py-2"
      role="group"
      title={`${label} ${value}`}
    >
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm sm:size-9", tone === "red" && "text-red-600")}>
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div aria-hidden="true" className="hidden min-w-0 text-center min-[360px]:block sm:text-left">
        <p className="hidden text-xs font-semibold text-slate-500 sm:block">{label}</p>
        <p className={cn("truncate text-sm font-bold text-slate-950 sm:text-lg", tone === "red" && "text-red-600")}>{value}</p>
      </div>
    </div>
  );
}

export function ProgressBar({ label, progress }: { label: string; progress: { completed: number; total: number } }) {
  if (progress.total <= 0) {
    return null;
  }

  const percentage = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span>{progress.completed}/{progress.total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-current/20 bg-current/10 px-1.5 font-mono text-[10px] font-black leading-none tracking-normal">
      {children}
    </kbd>
  );
}

export function ShortcutHint({ keys }: { keys: ReactNode[] }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1 opacity-80">
      {keys.map((key, index) => (
        <ShortcutKey key={index}>{key}</ShortcutKey>
      ))}
    </span>
  );
}

export function ModalShell({ children, onClose, onConfirm, title }: { children: ReactNode; onClose: () => void; onConfirm?: () => void; title: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Enter" || !onConfirm) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.closest("button")) {
      return;
    }

    event.preventDefault();
    onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-labelledby="modal-title" aria-modal="true" className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20 outline-none" ref={dialogRef} role="dialog" tabIndex={-1}>
        <h2 className="text-lg font-bold text-slate-950" id="modal-title">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}