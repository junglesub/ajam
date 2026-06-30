"use client";

import type { VacationYearGroup, VacationYearMetricSummary } from "@timesheet/domain";
import { Input, Label, cn } from "@timesheet/ui";

type VacationSummaryPanelProps = {
  allowanceDraft: string;
  allowanceError: string;
  groups: VacationYearGroup[];
  metricSummary: VacationYearMetricSummary;
  onAllowanceChange: (value: string) => void;
  onAllowanceSave: () => void;
  saveState: "error" | "idle" | "saved" | "saving";
};

const swatchClassByTone: Record<VacationYearGroup["colorClass"], string> = {
  amber: "bg-amber-300",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400"
};

function formatDays(days: number): string {
  return `${Number(days.toFixed(2))}일`;
}

function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function MetricCard({
  inclusiveValue,
  label,
  value
}: {
  inclusiveValue: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[10px] font-bold leading-tight text-slate-500">임시 포함 {inclusiveValue}</p>
    </div>
  );
}

export function VacationSummaryPanel({
  allowanceDraft,
  allowanceError,
  groups,
  metricSummary,
  onAllowanceChange,
  onAllowanceSave,
  saveState
}: VacationSummaryPanelProps) {
  const { confirmed, withTemporary } = metricSummary;

  return (
    <aside className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <Label>연차 총량</Label>
          <div className="flex gap-2">
            <Input
              min={0}
              onBlur={onAllowanceSave}
              onChange={(event) => onAllowanceChange(event.target.value)}
              step={0.5}
              type="number"
              value={allowanceDraft}
            />
          </div>
          <p className={cn("text-xs font-semibold", saveState === "error" ? "text-red-600" : "text-slate-500")}>
            {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : allowanceError}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <MetricCard inclusiveValue={formatDays(withTemporary.usedDays)} label="사용" value={formatDays(confirmed.usedDays)} />
          <MetricCard inclusiveValue={formatDays(withTemporary.remainingDays)} label="잔여" value={formatDays(confirmed.remainingDays)} />
          <MetricCard inclusiveValue={formatHours(withTemporary.usedHours)} label="시간" value={formatHours(confirmed.usedHours)} />
          <MetricCard inclusiveValue={formatPercent(withTemporary.consumptionRatio)} label="소진률" value={formatPercent(confirmed.consumptionRatio)} />
        </div>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">휴가 유형</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {groups.length === 0 ? <p className="py-3 text-sm font-semibold text-slate-500">저장된 휴가가 없습니다.</p> : null}
          {groups.map((group) => (
            <div className="flex items-center justify-between gap-3 py-3 text-sm" key={group.name}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", swatchClassByTone[group.colorClass])} />
                <span className="truncate font-bold text-slate-800">{group.name}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-black text-slate-950">{formatDays(group.confirmedDays)}</span>
                <span className="block text-[10px] font-bold leading-tight text-slate-500">임시 포함 {formatDays(group.withTemporaryDays)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
