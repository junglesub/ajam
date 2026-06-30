"use client";

import {
  getBusinessCalendarWeeks,
  normalizeVacationName,
  type VacationYearGroup,
  type VacationYearRecord
} from "@timesheet/domain";

import { VacationDateCell } from "./vacation-date-cell";

const weekdayLabels = ["M", "T", "W", "T", "F"];

type VacationYearCalendarProps = {
  connectedDateKeys: Set<string>;
  groups: VacationYearGroup[];
  hoveredDateKey: string;
  holidays: Array<{ dateKey: string; name: string }>;
  onDateClick: (dateKey: string) => void;
  onDateHover: (dateKey: string) => void;
  onDateLeave: () => void;
  todayKey: string;
  vacations: VacationYearRecord[];
  workDateKeys: string[];
  year: number;
};

export function VacationYearCalendar({
  connectedDateKeys,
  groups,
  hoveredDateKey,
  holidays,
  onDateClick,
  onDateHover,
  onDateLeave,
  todayKey,
  vacations,
  workDateKeys,
  year
}: VacationYearCalendarProps) {
  const vacationsByDate = new Map<string, VacationYearRecord[]>();

  for (const vacation of vacations) {
    vacationsByDate.set(vacation.dateKey, [...(vacationsByDate.get(vacation.dateKey) ?? []), vacation]);
  }

  const holidayNameByDate = new Map(holidays.map((holiday) => [holiday.dateKey, holiday.name]));
  const toneByName = new Map(groups.map((group) => [group.name, group.colorClass]));
  const workDateKeySet = new Set(workDateKeys);

  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const weeks = getBusinessCalendarWeeks(year, monthIndex);

          return (
            <div className="rounded-md border border-slate-200 bg-white p-1.5" key={monthIndex}>
              <h2 className="mb-1.5 text-sm font-bold text-slate-950">{monthIndex + 1}월</h2>
              <div className="grid grid-cols-5 gap-0.5">
                {weekdayLabels.map((label, index) => (
                  <div className="text-center text-[10px] font-black text-slate-400" key={`${label}-${index}`}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-0.5 grid gap-0.5">
                {weeks.map((week, weekIndex) => (
                  <div className="grid grid-cols-5 gap-0.5" key={`${monthIndex}-${weekIndex}`}>
                    {week.map((cell, cellIndex) => {
                      if (!cell) {
                        return <div className="aspect-square" key={`blank-${cellIndex}`} />;
                      }

                      const dayVacations = vacationsByDate.get(cell.dateKey) ?? [];
                      const vacationHours = dayVacations.reduce((sum, vacation) => sum + vacation.hours, 0);
                      const vacationName = normalizeVacationName(dayVacations[0]?.name ?? "");
                      const vacationLabel = dayVacations.length > 0 ? dayVacations.map((vacation) => `${normalizeVacationName(vacation.name)} ${vacation.hours}시간`).join(", ") : "휴가 없음";
                      const hasWorkRecord = workDateKeySet.has(cell.dateKey);
                      const holidayName = holidayNameByDate.get(cell.dateKey) ?? "";
                      const connected = connectedDateKeys.has(cell.dateKey);
                      const dimmed = Boolean(hoveredDateKey && connectedDateKeys.size > 0 && !connected);

                      return (
                        <VacationDateCell
                          connected={connected}
                          dateKey={cell.dateKey}
                          day={cell.day}
                          dimmed={dimmed}
                          hasWorkRecord={hasWorkRecord}
                          holidayName={holidayName}
                          hours={vacationHours}
                          key={cell.dateKey}
                          label={vacationLabel}
                          onClick={onDateClick}
                          onHover={onDateHover}
                          onLeave={onDateLeave}
                          temporary={dayVacations.some((vacation) => vacation.status === "TEMPORARY")}
                          today={cell.dateKey === todayKey}
                          tone={toneByName.get(vacationName) ?? "blue"}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
