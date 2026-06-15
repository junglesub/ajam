"use client";

import { Layers3 } from "lucide-react";
import type { NotionCategorySummary as NotionCategorySummaryItem } from "@timesheet/domain";

import { formatNotionDuration } from "./duration-format";

type NotionCategorySummaryProps = {
  items: NotionCategorySummaryItem[];
};

export function NotionCategorySummary({ items }: NotionCategorySummaryProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
          <Layers3 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-950">분류 요약</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">캐시된 카드 기준</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-sm font-semibold text-slate-500">요약할 카드가 없습니다.</div>
        ) : (
          items.map((summary) => (
            <div className="grid gap-1 px-5 py-3" key={summary.category}>
              <div className="flex items-center justify-between gap-4">
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">{summary.category}</span>
                <span className="shrink-0 text-sm font-semibold text-slate-500">{summary.cardCount}개</span>
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-500">
                기간 추정 {formatNotionDuration(summary.estimatedHours)} · 업무 기간 {formatNotionDuration(summary.linkedHours)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
