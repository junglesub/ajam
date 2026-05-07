export type DateKey = `${number}-${number}-${number}`;

export type CalendarCell = {
  dateKey: string;
  day: number;
  weekday: number;
};

export type CalendarWeek = Array<CalendarCell | null>;

const weekdays = [1, 2, 3, 4, 5];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function toBrowserDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function formatKoreanDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    weekday: "short"
  });

  return formatter.format(date);
}

export function isWeekendDateKey(dateKey: string): boolean {
  const weekday = parseDateKey(dateKey).getDay();

  return weekday === 0 || weekday === 6;
}

export function getBusinessCalendarWeeks(year: number, monthIndex: number): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  let week: CalendarWeek = Array.from({ length: weekdays.length }, () => null);
  const cursor = new Date(year, monthIndex, 1);

  while (cursor.getMonth() === monthIndex) {
    const weekday = cursor.getDay();

    if (weekdays.includes(weekday)) {
      const index = weekdays.indexOf(weekday);
      week[index] = {
        dateKey: toBrowserDateKey(cursor),
        day: cursor.getDate(),
        weekday
      };
    }

    if (weekday === 5) {
      weeks.push(week);
      week = Array.from({ length: weekdays.length }, () => null);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (week.some(Boolean)) {
    weeks.push(week);
  }

  return weeks;
}

export function getBusinessDateKeysUntil(year: number, monthIndex: number, todayKey: string): string[] {
  const dateKeys: string[] = [];
  const cursor = new Date(year, monthIndex, 1);

  while (cursor.getMonth() === monthIndex) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey) && dateKey <= todayKey) {
      dateKeys.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

export function getMonthLabel(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, monthIndex, 1));
}
