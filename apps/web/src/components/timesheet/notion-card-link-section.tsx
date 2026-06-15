"use client";

import { Plus, X } from "lucide-react";

import type { TimesheetEntryDraft } from "@timesheet/domain";

import type { NotionCardCandidate } from "./use-notion-card-candidates";

type NotionCardLinkSectionProps = {
  candidates: NotionCardCandidate[];
  disabled?: boolean;
  entry: TimesheetEntryDraft;
  onOpenPicker: () => void;
  onRemoveCard: (notionPageId: string) => void;
};

export function NotionCardLinkSection({ candidates, disabled = false, entry, onOpenPicker, onRemoveCard }: NotionCardLinkSectionProps) {
  if (entry.kind !== "WORK") {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      {entry.notionCards.map((link) => {
        const card = candidates.find((candidate) => candidate.notionPageId === link.notionPageId);

        return (
          <span
            className="inline-flex h-8 max-w-full items-center rounded-md border border-slate-200 bg-white pl-2 pr-1 text-xs font-bold text-slate-700"
            key={link.notionPageId}
          >
            <span className="max-w-[220px] truncate">{card?.title || link.title || link.notionPageId}</span>
            <span className="ml-1 shrink-0 font-semibold text-slate-400">{link.allocatedHours}h</span>
            <button
              aria-label={`${card?.title || link.title || link.notionPageId} 연결 해제`}
              className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              onClick={() => onRemoveCard(link.notionPageId)}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        );
      })}
      <button
        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={onOpenPicker}
        type="button"
      >
        <Plus aria-hidden="true" className="size-3.5" />
        카드
      </button>
    </div>
  );
}
