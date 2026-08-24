"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import confetti from "canvas-confetti";
import {
  clampVacationFillRatio,
  type getBusinessCalendarWeeks,
  normalizeVacationName,
  statusLabel,
  type TimesheetEntryDraft,
  type TimesheetRow,
  type TimesheetStatus,
  type VacationColor,
  type VacationColorPreset,
  type VacationStatus
} from "@timesheet/domain";
import { Badge, cn } from "@timesheet/ui";
import { calendarStatusText, draftPreviewText, hasTimeMismatch, NotionCardWarningIcon, TimeMismatchIcon } from "./timesheet-row-display";

const weekdays = ["월", "화", "수", "목", "금"];

const badgeToneByStatus: Record<TimesheetStatus, "blue" | "gray" | "green" | "orange" | "white"> = {
  COMPLETED: "green",
  FUTURE: "gray",
  HOLIDAY: "orange",
  MISSING: "white",
  VACATION: "blue"
};

const cellToneByStatus: Record<TimesheetStatus, string> = {
  COMPLETED: "border-emerald-200 bg-white hover:border-emerald-300",
  FUTURE: "border-slate-200 bg-slate-100 text-slate-400",
  HOLIDAY: "border-orange-200 bg-orange-50/80 hover:border-orange-300",
  MISSING: "border-slate-200 bg-white hover:border-slate-300",
  VACATION: "timesheet-vacation-only"
};

const vacationFillColor = "var(--timesheet-vacation-fill)";
const temporaryVacationHatchBackground = "var(--temporary-vacation-hatch-background)";

function getWorkVacationMixVacationClipPath(row: TimesheetRow): string | undefined {
  const orderedKinds: Array<"VACATION" | "WORK"> = [];

  for (const entry of row.entries) {
    if ((entry.kind === "WORK" || entry.kind === "VACATION") && !orderedKinds.includes(entry.kind)) {
      orderedKinds.push(entry.kind);
    }
  }

  if (!orderedKinds.includes("WORK") || !orderedKinds.includes("VACATION")) {
    return undefined;
  }

  if (orderedKinds.length < 2) {
    return undefined;
  }

  return orderedKinds[0] === "VACATION"
    ? "polygon(0 0, 100% 0, 0 100%)"
    : "polygon(100% 0, 100% 100%, 0 100%)";
}

function getCalendarCellStyle(row: TimesheetRow | undefined) {
  if (!row) {
    return undefined;
  }

  const vacationClipPath = getWorkVacationMixVacationClipPath(row);
  const isTemporaryVacation = row.hasVacation && row.vacationStatus === "TEMPORARY";

  if (vacationClipPath) {
    return undefined;
  }

  if (isPartialVacationOnlyCell(row)) {
    return undefined;
  }

  if (isTemporaryVacation) {
    return { backgroundImage: temporaryVacationHatchBackground };
  }

  return undefined;
}

function getVacationOnlyEntry(row: TimesheetRow | undefined): TimesheetEntryDraft | undefined {
  if (!row || row.entries.length !== 1) {
    return undefined;
  }

  const [entry] = row.entries;

  return entry?.kind === "VACATION" ? entry : undefined;
}

function isPartialVacationOnlyCell(row: TimesheetRow | undefined): boolean {
  const vacation = getVacationOnlyEntry(row);

  return Boolean(vacation && clampVacationFillRatio(vacation.hours) < 1);
}

function getPartialVacationOnlyOverlayStyle(row: TimesheetRow | undefined) {
  const vacation = getVacationOnlyEntry(row);

  if (!vacation) {
    return undefined;
  }

  const fillRatio = clampVacationFillRatio(vacation.hours);

  if (fillRatio <= 0 || fillRatio >= 1) {
    return undefined;
  }

  const fillStop = `${Math.round(fillRatio * 100)}%`;
  const fillMask = `linear-gradient(135deg, #000 0 ${fillStop}, transparent ${fillStop} 100%)`;
  const isTemporaryVacation = vacation.vacationStatus === "TEMPORARY";

  return {
    backgroundColor: vacationFillColor,
    backgroundImage: isTemporaryVacation ? temporaryVacationHatchBackground : undefined,
    WebkitMaskImage: fillMask,
    maskImage: fillMask
  };
}

function getVacationMixOverlayStyle(row: TimesheetRow | undefined) {
  if (!row) {
    return undefined;
  }

  const vacationClipPath = getWorkVacationMixVacationClipPath(row);

  if (!vacationClipPath) {
    return undefined;
  }

  const isTemporaryVacation = row.vacationStatus === "TEMPORARY";

  return {
    backgroundColor: vacationFillColor,
    backgroundImage: isTemporaryVacation ? temporaryVacationHatchBackground : undefined,
    clipPath: vacationClipPath
  };
}

function vacationBadgeLabel(status: TimesheetStatus, vacationStatus: VacationStatus) {
  if (status === "VACATION" && vacationStatus === "TEMPORARY") {
    return "임시";
  }

  return statusLabel[status];
}

function StatusBadge({ status, vacationStatus = "CONFIRMED" }: { status: TimesheetStatus; vacationStatus?: VacationStatus }) {
  if (status === "FUTURE") {
    return null;
  }

  const usesOutlineDot = status === "VACATION" && vacationStatus === "TEMPORARY";

  return (
    <Badge tone={badgeToneByStatus[status]}>
      <span className={cn("mr-1 size-1.5 rounded-full", usesOutlineDot ? "border border-current bg-transparent" : "bg-current")} />
      {vacationBadgeLabel(status, vacationStatus)}
    </Badge>
  );
}

function VacationDotBadge({ vacationStatus }: { vacationStatus: VacationStatus }) {
  const usesOutlineDot = vacationStatus === "TEMPORARY";

  return (
    <Badge tone="blue">
      <span className={cn("size-1.5 rounded-full", usesOutlineDot ? "border border-current bg-transparent" : "bg-current")} />
    </Badge>
  );
}

function CalendarStatusBadges({ row }: { row: TimesheetRow }) {
  const isVacationOnly = row.hasVacation && row.status === "VACATION";

  if (isVacationOnly) {
    return <StatusBadge status="VACATION" vacationStatus={row.vacationStatus} />;
  }

  return (
    <div className="flex items-center gap-1">
      {row.hasVacation ? <VacationDotBadge vacationStatus={row.vacationStatus} /> : null}
      <StatusBadge status={row.status} />
    </div>
  );
}

function getTimesheetVacationColor(row: TimesheetRow | undefined, vacationColors: Record<string, VacationColor>): VacationColor {
  const vacation = row?.entries.find((entry) => entry.kind === "VACATION");
  return vacationColors[normalizeVacationName(vacation?.vacationName ?? "")] ?? "blue";
}

function getTimesheetVacationColorStyle(color: VacationColor): CSSProperties | undefined {
  return color.startsWith("#") ? ({ "--timesheet-vacation-color": color } as CSSProperties) : undefined;
}

export function CalendarView({
  celebratingDateKey,
  rows,
  selectedDateKey,
  setSelectedDateKey,
  todayKey,
  vacationColors,
  weeks
}: {
  celebratingDateKey: string;
  rows: Record<string, TimesheetRow>;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  todayKey: string;
  vacationColors: Record<string, VacationColor>;
  weeks: ReturnType<typeof getBusinessCalendarWeeks>;
}) {
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousSelectedDateKeyRef = useRef(selectedDateKey);

  useEffect(() => {
    if (previousSelectedDateKeyRef.current === selectedDateKey) {
      return;
    }

    previousSelectedDateKeyRef.current = selectedDateKey;
    dateButtonRefs.current.get(selectedDateKey)?.focus({ preventScroll: true });
  }, [selectedDateKey]);

  useEffect(() => {
    if (!celebratingDateKey) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const element = dateButtonRefs.current.get(celebratingDateKey);

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const origin = {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight
    };

    void confetti({
      colors: ["#fb7185", "#f59e0b", "#34d399", "#38bdf8", "#e879f9", "#a3e635"],
      origin,
      particleCount: 85,
      scalar: 0.85,
      spread: 78,
      startVelocity: 34,
      ticks: 180
    });
  }, [celebratingDateKey]);

  return (
    <div className="p-2 sm:p-4">
      <div className="grid grid-cols-5 border-b border-slate-200 pb-2">
        {weekdays.map((weekday) => (
          <div className="text-center text-xs font-bold text-slate-400 sm:px-2 sm:text-left" key={weekday}>
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid gap-1 pt-2 sm:gap-2 sm:pt-3">
        {weeks.map((week, index) => (
          <div className="grid grid-cols-5 gap-1 sm:gap-2" key={`${index}-${week.map((cell) => cell?.dateKey ?? "blank").join("-")}`}>
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <div className="min-h-16 rounded-md border border-dashed border-slate-100 bg-slate-50/60 sm:min-h-24 lg:min-h-32" key={`blank-${cellIndex}`} />;
              }

              const row = rows[cell.dateKey];
              const vacationMixOverlayStyle = getVacationMixOverlayStyle(row);
              const partialVacationOnlyOverlayStyle = getPartialVacationOnlyOverlayStyle(row);
              const isPartialVacationOnly = isPartialVacationOnlyCell(row);
              const vacationColor = getTimesheetVacationColor(row, vacationColors);
              const presetVacationColor = vacationColor.startsWith("#") ? undefined : vacationColor as VacationColorPreset;
              const calendarCellStyle = {
                ...getCalendarCellStyle(row),
                ...getTimesheetVacationColorStyle(vacationColor)
              };

              return (
                <button
                  className={cn(
                    "relative flex min-h-16 flex-col justify-between overflow-hidden rounded-md border p-1.5 text-left transition sm:min-h-24 sm:p-2 lg:min-h-32 lg:p-3",
                    row?.hasVacation && "timesheet-vacation-theme",
                    row && (isPartialVacationOnly
                      ? cell.dateKey > todayKey
                        ? "timesheet-vacation-border bg-slate-100 text-slate-400"
                        : "timesheet-vacation-border bg-white"
                      : cellToneByStatus[row.status]),
                    selectedDateKey === cell.dateKey && "ring-2 ring-slate-950 ring-offset-2"
                  )}
                  data-timesheet-vacation-color={row?.hasVacation ? presetVacationColor : undefined}
                  id={`timesheet-calendar-date-${cell.dateKey}`}
                  key={cell.dateKey}
                  onClick={() => setSelectedDateKey(cell.dateKey)}
                  ref={(element) => {
                    if (element) {
                      dateButtonRefs.current.set(cell.dateKey, element);
                    } else {
                      dateButtonRefs.current.delete(cell.dateKey);
                    }
                  }}
                  style={calendarCellStyle}
                  type="button"
                >
                  {vacationMixOverlayStyle ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={vacationMixOverlayStyle} /> : null}
                  {partialVacationOnlyOverlayStyle ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={partialVacationOnlyOverlayStyle} /> : null}
                  <div className="relative z-10 flex items-start justify-between gap-2">
                    <span className="flex items-center gap-0.5">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-xs font-bold sm:size-7 sm:text-sm",
                          cell.dateKey === todayKey ? "bg-slate-950 text-white" : row?.status === "HOLIDAY" ? "text-red-600" : "text-slate-950"
                        )}
                      >
                        {cell.day}
                      </span>
                      {row && hasTimeMismatch(row) ? <TimeMismatchIcon hours={row.hours} /> : null}
                      {row?.hasNotionCardWarning ? <NotionCardWarningIcon /> : null}
                    </span>
                    {row ? <div className="hidden sm:block"><CalendarStatusBadges row={row} /></div> : null}
                  </div>
                  <p className="relative z-10 truncate text-center text-[10px] font-semibold text-slate-500 sm:hidden">
                    {row ? vacationBadgeLabel(row.status, row.vacationStatus) : ""}
                  </p>
                  <div className="relative z-10 mt-2 hidden min-w-0 space-y-1 sm:block lg:mt-3">
                    {row?.kind === "WORK" && row.project ? (
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="min-w-0 truncate text-xs font-bold text-slate-950">{row.project}</p>
                        {row.projectCount > 1 ? <span className="shrink-0 text-[10px] font-bold text-slate-500">+{row.projectCount}</span> : null}
                      </div>
                    ) : null}
                    <p className={cn("line-clamp-2 break-words text-sm leading-5 text-slate-600", row && row.entryCount > 1 && "pr-8", row?.status === "MISSING" && !draftPreviewText(row) && "font-bold text-red-600")}>
                      {row ? calendarStatusText(row, selectedDateKey === cell.dateKey) : ""}
                    </p>
                  </div>
                  {row && row.entryCount > 1 ? <span className="absolute bottom-1 right-1 z-20 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white sm:bottom-2 sm:right-2 sm:text-xs lg:bottom-3 lg:right-3 lg:px-2">{row.entryCount}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
