"use client";

import { CalendarDays, Calculator, Clock3, type LucideIcon } from "lucide-react";

import { formatNotionDuration } from "./duration-format";
import type { NotionAnalysisCard } from "./types";

type NotionDurationTotalsProps = {
  cards: NotionAnalysisCard[];
};

export function NotionDurationTotals({ cards }: NotionDurationTotalsProps) {
  const availableHours = cards.reduce(
    (sum, card) => sum + (card.availableHours?.unavailableReason ? 0 : (card.availableHours?.availableHours ?? 0)),
    0
  );
  const availableUnavailableCount = cards.filter((card) => card.availableHours?.unavailableReason).length;
  const linkedHours = cards.reduce((sum, card) => sum + (card.linkedHours ?? 0), 0);
  const workDayCount = cards.reduce((sum, card) => sum + (card.workDayCount ?? 0), 0);
  const estimateUnavailableCount = cards.filter((card) => card.estimate?.unavailableReason).length;
  const estimatedHours = cards.reduce(
    (sum, card) => sum + (card.estimate?.unavailableReason ? 0 : (card.estimate?.estimatedHours ?? 0)),
    0
  );

  return (
    <div className="grid gap-3 border-b border-slate-200 bg-white px-5 py-4 md:grid-cols-4">
      <TotalItem icon={CalendarDays} label="작업일수 합계" value={`${workDayCount}일`} />
      <TotalItem
        extra={availableUnavailableCount > 0 ? `계산 불가 ${availableUnavailableCount}개 제외` : undefined}
        icon={Clock3}
        label="가용 시간 합계"
        value={formatNotionDuration(availableHours)}
      />
      <TotalItem icon={Clock3} label="업무 기간 합계" value={formatNotionDuration(linkedHours)} />
      <TotalItem
        extra={estimateUnavailableCount > 0 ? `계산 불가 ${estimateUnavailableCount}개 제외` : undefined}
        icon={Calculator}
        label="기간 추정 합계"
        value={formatNotionDuration(estimatedHours)}
      />
    </div>
  );
}

function TotalItem({
  extra,
  icon: Icon,
  label,
  value
}: {
  extra?: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-950">{value}</p>
        {extra ? <p className="mt-0.5 text-xs font-semibold text-amber-600">{extra}</p> : null}
      </div>
    </div>
  );
}
