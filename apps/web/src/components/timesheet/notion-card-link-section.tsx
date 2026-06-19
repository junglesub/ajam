"use client";

import { Plus, RotateCcw, X } from "lucide-react";

import type { TimesheetEntryDraft } from "@timesheet/domain";

import type { NotionCardCandidate } from "./use-notion-card-candidates";

type NotionCardLinkSectionProps = {
  allocationError?: string;
  candidates: NotionCardCandidate[];
  disabled?: boolean;
  entry: TimesheetEntryDraft;
  isAutoLoading?: boolean;
  onAllocatedHoursChange: (notionPageId: string, allocatedHours: number) => void;
  onOpenPicker: () => void;
  onRemoveCard: (notionPageId: string) => void;
  onResetAutoAllocation: () => void;
};

export function NotionCardLinkSection({
  allocationError = "",
  candidates,
  disabled = false,
  entry,
  isAutoLoading = false,
  onAllocatedHoursChange,
  onOpenPicker,
  onRemoveCard,
  onResetAutoAllocation
}: NotionCardLinkSectionProps) {
  if (entry.kind !== "WORK") {
    return null;
  }

  const allocationTotal = roundHours(entry.notionCards.reduce((sum, link) => sum + link.allocatedHours, 0));
  const hasManualAllocation = entry.notionCards.some((link) => link.allocationMode === "manual");

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      {entry.notionCards.length > 0 ? (
        <div className="space-y-2">
          {entry.notionCards.map((link) => {
            const card = candidates.find((candidate) => candidate.notionPageId === link.notionPageId);
            const title = card?.title || link.title || link.notionPageId;

            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_86px_28px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                key={link.notionPageId}
              >
                <div className="min-w-0">
                  <span className="block truncate font-bold text-slate-950">{title}</span>
                  <span className="block truncate font-semibold text-slate-400">
                    {card?.status || link.status || "-"} · {card?.category || link.category || "미분류"}
                  </span>
                </div>
                <label className="flex items-center gap-1">
                  <input
                    aria-label={`${title} 배분 시간`}
                    className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    disabled={disabled}
                    min={0}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.valueAsNumber;

                      if (Number.isFinite(nextValue)) {
                        onAllocatedHoursChange(link.notionPageId, nextValue);
                      }
                    }}
                    step={0.25}
                    type="number"
                    value={link.allocatedHours}
                  />
                  <span className="font-bold text-slate-400">h</span>
                </label>
                <button
                  aria-label={`${title} 연결 해제`}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => onRemoveCard(link.notionPageId)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : isAutoLoading ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_86px_28px] items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
            <div className="min-w-0 space-y-1.5">
              <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded-md bg-slate-100" />
            <div className="size-7 animate-pulse rounded-md bg-slate-100" />
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={onOpenPicker}
            type="button"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            카드
          </button>
          {hasManualAllocation ? (
            <button
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={onResetAutoAllocation}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              자동 배분
            </button>
          ) : null}
        </div>
        {entry.notionCards.length > 0 ? (
          <span className={allocationError ? "text-xs font-bold text-red-600" : "text-xs font-bold text-slate-400"}>
            {allocationError || `${allocationTotal}h / ${entry.hours}h`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function roundHours(value: number): number {
  return Number(value.toFixed(2));
}
