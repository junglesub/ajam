export type MonthlyTimeMacroEntry = {
  holidayName: string;
  hours: number;
  kind: "WORK" | "VACATION" | "HOLIDAY";
  project: string;
  vacationName: string;
};

export type MonthlyTimeMacroDayInput = {
  dateKey: string;
  entries: MonthlyTimeMacroEntry[];
  shortVersion: string;
};

export type MonthlyTimeMacroHolidayInput = {
  dateKey: string;
  name: string;
};

export type MonthlyTimeMacroCategoryKind = "work" | "vacation" | "holiday";

export type MonthlyTimeMacroDay = {
  contentValue: string;
  dateKey: string;
  day: number;
  hours: number;
  value: string;
  weekday: number;
};

export type MonthlyTimeMacroCategory = {
  days: MonthlyTimeMacroDay[];
  id: string;
  kind: MonthlyTimeMacroCategoryKind;
  label: string;
};

export type MonthlyTimeMacroExport = {
  categories: MonthlyTimeMacroCategory[];
  daysInMonth: number;
  month: string;
};

export type MonthlyTimeMacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

type AddHoursParams = {
  contentValue?: string;
  dateKey: string;
  hours: number;
  id: string;
  kind: MonthlyTimeMacroCategoryKind;
  label: string;
  month: string;
};

const categoryKindOrder: Record<MonthlyTimeMacroCategoryKind, number> = {
  work: 0,
  vacation: 1,
  holiday: 2
};

function assertMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthNumber = match ? Number(match[2]) : Number.NaN;

  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Invalid month");
  }
}

function getDaysInMonth(month: string): number {
  assertMonth(month);

  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
}

function getDateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function getWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "";
  }

  const rounded = Math.round((hours + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function getHolidayMacroHours(hours: number): number {
  return hours > 0 ? hours : 8;
}

function createBlankDays(month: string): MonthlyTimeMacroDay[] {
  return Array.from({ length: getDaysInMonth(month) }, (_, index) => {
    const day = index + 1;
    const dateKey = getDateKey(month, day);

    return {
      contentValue: "",
      dateKey,
      day,
      hours: 0,
      value: "",
      weekday: getWeekday(dateKey)
    };
  });
}

function addHours(categories: Map<string, MonthlyTimeMacroCategory>, params: AddHoursParams): void {
  const category = categories.get(params.id) ?? {
    days: createBlankDays(params.month),
    id: params.id,
    kind: params.kind,
    label: params.label
  };
  const day = category.days.find((candidate) => candidate.dateKey === params.dateKey);

  if (!day) {
    return;
  }

  day.hours = Math.round((day.hours + params.hours + Number.EPSILON) * 100) / 100;
  day.value = formatHours(day.hours);

  if (params.contentValue?.trim()) {
    day.contentValue = params.contentValue.trim();
  }

  categories.set(params.id, category);
}

function addHolidayHours(categories: Map<string, MonthlyTimeMacroCategory>, params: Omit<AddHoursParams, "hours" | "id" | "kind" | "label"> & { hours: number }): void {
  const category = categories.get("holiday:공휴일") ?? {
    days: createBlankDays(params.month),
    id: "holiday:공휴일",
    kind: "holiday" as const,
    label: "공휴일"
  };
  const day = category.days.find((candidate) => candidate.dateKey === params.dateKey);

  if (!day) {
    return;
  }

  day.hours = Math.max(day.hours, getHolidayMacroHours(params.hours));
  day.value = formatHours(day.hours);
  categories.set(category.id, category);
}

function categorySort(left: MonthlyTimeMacroCategory, right: MonthlyTimeMacroCategory): number {
  return categoryKindOrder[left.kind] - categoryKindOrder[right.kind] || left.label.localeCompare(right.label, "ko-KR");
}

export function buildMonthlyTimeMacroExport(params: {
  days: MonthlyTimeMacroDayInput[];
  holidays: MonthlyTimeMacroHolidayInput[];
  month: string;
}): MonthlyTimeMacroExport {
  assertMonth(params.month);

  const categories = new Map<string, MonthlyTimeMacroCategory>();

  for (const day of params.days) {
    if (!day.dateKey.startsWith(`${params.month}-`)) {
      continue;
    }

    for (const entry of day.entries) {
      if (entry.kind === "WORK") {
        const label = entry.project.trim() || "프로젝트 없음";
        addHours(categories, {
          dateKey: day.dateKey,
          contentValue: day.shortVersion,
          hours: entry.hours,
          id: `work:${label}`,
          kind: "work",
          label,
          month: params.month
        });
      }

      if (entry.kind === "VACATION") {
        const label = entry.vacationName.trim() || "휴가";
        addHours(categories, {
          dateKey: day.dateKey,
          hours: entry.hours,
          id: `vacation:${label}`,
          kind: "vacation",
          label,
          month: params.month
        });
      }

      if (entry.kind === "HOLIDAY") {
        addHolidayHours(categories, {
          dateKey: day.dateKey,
          hours: entry.hours,
          month: params.month
        });
      }
    }
  }

  for (const holiday of params.holidays) {
    if (holiday.dateKey.startsWith(`${params.month}-`)) {
      addHolidayHours(categories, {
        dateKey: holiday.dateKey,
        hours: 0,
        month: params.month
      });
    }
  }

  return {
    categories: [...categories.values()].sort(categorySort),
    daysInMonth: getDaysInMonth(params.month),
    month: params.month
  };
}

export function buildMonthlyTimeMacroSteps(params: {
  categoryOrder: string[];
  exportData: MonthlyTimeMacroExport;
}): MonthlyTimeMacroStep[] {
  const orderedIds = [...params.categoryOrder, ...params.exportData.categories.map((category) => category.id)].filter(
    (id, index, values) => values.indexOf(id) === index
  );
  const categoriesById = new Map(params.exportData.categories.map((category) => [category.id, category]));
  const categories = orderedIds.map((categoryId) => categoriesById.get(categoryId)).filter((category) => category !== undefined);
  const steps: MonthlyTimeMacroStep[] = [];

  for (const [categoryIndex, category] of categories.entries()) {
    const isLastCategory = categoryIndex === categories.length - 1;
    const businessDays = category.days.filter((day) => !isWeekend(day.weekday));
    let lastWeekdayDateKey: string | null = null;

    for (const [dayIndex, day] of businessDays.entries()) {
      const isLastDay = dayIndex === businessDays.length - 1;

      lastWeekdayDateKey = day.dateKey;

      if (day.value) {
        steps.push({ categoryId: category.id, dateKey: day.dateKey, type: "type", value: day.value });
      }

      if (!isLastCategory || !isLastDay) {
        steps.push({ categoryId: category.id, dateKey: day.dateKey, type: "tab" });
      }
    }

    const boundaryDateKey = lastWeekdayDateKey ?? `${params.exportData.month}-01`;

    if (!isLastCategory) {
      for (let index = 0; index < 4; index += 1) {
        steps.push({ categoryId: category.id, dateKey: boundaryDateKey, type: "tab" });
      }
    }
  }

  return steps;
}
