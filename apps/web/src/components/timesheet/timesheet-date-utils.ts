import {
  isWeekendDateKey,
  parseDateKey,
  toBrowserDateKey
} from "@timesheet/domain";

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toBrowserDateKey(date);
}

export function addBusinessDays(dateKey: string, direction: -1 | 1): string {
  let next = addDays(dateKey, direction);

  while (isWeekendDateKey(next)) {
    next = addDays(next, direction);
  }

  return next;
}

export function getBusinessDateKeysInRange(startDateKey: string, endDateKey: string): string[] {
  const start = startDateKey <= endDateKey ? startDateKey : endDateKey;
  const end = startDateKey <= endDateKey ? endDateKey : startDateKey;
  const dateKeys: string[] = [];
  const cursor = parseDateKey(start);

  while (toBrowserDateKey(cursor) <= end) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      dateKeys.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

export function getDateKeyMonthCursor(dateKey: string): { monthIndex: number; year: number } {
  const date = parseDateKey(dateKey);

  return {
    monthIndex: date.getMonth(),
    year: date.getFullYear()
  };
}

export function getInclusiveDateSpan(startDateKey: string, endDateKey: string): number {
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.floor((end - start) / dayMs) + 1;
}

export function getDefaultSelectedDateForMonth(year: number, monthIndex: number): string {
  const cursor = new Date(year, monthIndex, 1);

  while (cursor.getMonth() === monthIndex) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      return dateKey;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return toBrowserDateKey(new Date(year, monthIndex, 1));
}