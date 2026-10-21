"use client";

import { clampVacationFillRatio, type VacationColor, type VacationColorPreset } from "@timesheet/domain";
import { cn } from "@timesheet/ui";
import { useId, type CSSProperties } from "react";

type VacationDateCellProps = {
  connected: boolean;
  color: VacationColor;
  dateKey: string;
  day: number;
  dimmed: boolean;
  hasWorkRecord: boolean;
  holidayName: string;
  hours: number;
  label: string;
  nonDeductingHours: number;
  nonDeductingTemporary: boolean;
  onClick: (dateKey: string) => void;
  onHover: (dateKey: string) => void;
  onLeave: () => void;
  temporary: boolean;
  today: boolean;
};

const fillClassByTone: Record<VacationColorPreset, string> = {
  amber: "bg-amber-300",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400"
};

export function VacationDateCell({
  connected,
  color,
  dateKey,
  day,
  dimmed,
  hasWorkRecord,
  holidayName,
  hours,
  label,
  nonDeductingHours,
  nonDeductingTemporary,
  onClick,
  onHover,
  onLeave,
  temporary,
  today
}: VacationDateCellProps) {
  const stripeId = useId();
  const fillRatio = clampVacationFillRatio(hours - nonDeductingHours);
  const outlineRatio = clampVacationFillRatio(nonDeductingHours);
  const hasVacation = hours > 0;
  const hasMarkerBackground = fillRatio > 0 || hasWorkRecord;
  const customColor = color.startsWith("#") ? color : null;
  const presetColor = customColor ? null : color as VacationColorPreset;

  return (
    <button
      aria-label={`${dateKey} ${today ? "오늘 " : ""}${holidayName ? `${holidayName} ` : ""}${hasWorkRecord ? "업무 기록 있음 " : ""}${label || "휴가 없음"}`}
      className="grid h-7 place-items-center rounded-md p-px outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 xl:aspect-square xl:h-auto"
      onClick={() => onClick(dateKey)}
      onMouseEnter={() => onHover(dateKey)}
      onMouseLeave={onLeave}
      title={holidayName || undefined}
      type="button"
    >
      <span
        className={cn(
          "relative grid size-full max-h-6 max-w-6 place-items-center overflow-hidden rounded-full text-[9px] font-black text-slate-700 transition",
          hasVacation && "timesheet-vacation-theme",
          hasMarkerBackground && "vacation-marker-date bg-slate-100",
          today && "vacation-today-date outline-2 outline-slate-950 outline-offset-1 text-slate-950",
          dimmed && "opacity-40",
          connected && "vacation-connected-date bg-slate-200 opacity-100"
        )}
        data-timesheet-vacation-color={presetColor ?? undefined}
        style={{ "--timesheet-vacation-color": customColor ?? undefined } as CSSProperties}
      >
        {fillRatio > 0 ? (
          <>
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 bottom-0", customColor ? "vacation-custom-color" : fillClassByTone[presetColor!])}
              data-vacation-tone={presetColor ?? undefined}
              style={{
                "--vacation-custom-color": customColor ?? undefined,
                height: `${fillRatio * 100}%`
              } as CSSProperties}
            />
            {temporary ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0"
                data-vacation-temporary="true"
                style={{
                  backgroundColor: "var(--vacation-date-temporary-overlay)",
                  backgroundImage: "var(--vacation-date-temporary-hatch)",
                  height: `${fillRatio * 100}%`
                }}
              />
            ) : null}
          </>
        ) : null}
        {outlineRatio > 0 ? (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full -rotate-90" viewBox="0 0 24 24">
            {nonDeductingTemporary ? (
              <defs>
                <pattern height="4" id={stripeId} patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="4">
                  <rect fill="var(--timesheet-vacation-color)" height="4" width="2" />
                </pattern>
              </defs>
            ) : null}
            <circle
              cx="12"
              cy="12"
              fill="none"
              pathLength="100"
              r="10"
              stroke={nonDeductingTemporary ? `url(#${stripeId})` : "var(--timesheet-vacation-color)"}
              strokeDasharray={outlineRatio < 1 ? `${outlineRatio * 100} 100` : undefined}
              strokeWidth="3"
            />
          </svg>
        ) : null}
        <span className={cn("relative z-10", holidayName && "text-red-600")}>{day}</span>
      </span>
    </button>
  );
}
