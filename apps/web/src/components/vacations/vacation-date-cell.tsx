"use client";

import { clampVacationFillRatio } from "@timesheet/domain";
import { cn } from "@timesheet/ui";

type VacationDateCellProps = {
  connected: boolean;
  dateKey: string;
  day: number;
  dimmed: boolean;
  hasWorkRecord: boolean;
  holidayName: string;
  hours: number;
  label: string;
  onClick: (dateKey: string) => void;
  onHover: (dateKey: string) => void;
  onLeave: () => void;
  temporary: boolean;
  today: boolean;
  tone: "amber" | "blue" | "cyan" | "emerald" | "rose" | "violet";
};

const fillClassByTone: Record<VacationDateCellProps["tone"], string> = {
  amber: "bg-amber-300",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400"
};

export function VacationDateCell({
  connected,
  dateKey,
  day,
  dimmed,
  hasWorkRecord,
  holidayName,
  hours,
  label,
  onClick,
  onHover,
  onLeave,
  temporary,
  today,
  tone
}: VacationDateCellProps) {
  const fillRatio = clampVacationFillRatio(hours);
  const hasVacation = fillRatio > 0;
  const hasMarkerBackground = hasVacation || hasWorkRecord;

  return (
    <button
      aria-label={`${dateKey} ${today ? "오늘 " : ""}${holidayName ? `${holidayName} ` : ""}${hasWorkRecord ? "업무 기록 있음 " : ""}${label || "휴가 없음"}`}
      className="grid aspect-square place-items-center rounded-md p-px outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950"
      onClick={() => onClick(dateKey)}
      onMouseEnter={() => onHover(dateKey)}
      onMouseLeave={onLeave}
      title={holidayName || undefined}
      type="button"
    >
      <span
        className={cn(
          "relative grid size-full max-h-6 max-w-6 place-items-center overflow-hidden rounded-full text-[9px] font-black text-slate-700 transition",
          hasMarkerBackground && "bg-slate-100",
          today && "outline-2 outline-slate-950 outline-offset-1 text-slate-950",
          dimmed && "opacity-40",
          connected && "vacation-connected-date bg-slate-200 opacity-100"
        )}
      >
        {hasVacation ? (
          <>
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 bottom-0", fillClassByTone[tone])}
              style={{ height: `${fillRatio * 100}%` }}
            />
            {temporary ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.28)",
                  backgroundImage: "repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.78) 0 2px, rgba(255, 255, 255, 0.18) 2px 4px)",
                  height: `${fillRatio * 100}%`
                }}
              />
            ) : null}
          </>
        ) : null}
        <span className={cn("relative z-10", holidayName && "text-red-600")}>{day}</span>
      </span>
    </button>
  );
}
