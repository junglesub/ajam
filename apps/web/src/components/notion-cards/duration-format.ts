const HOURS_PER_DAY = 8;

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatDayValue(hours: number): string {
  return trimNumber(hours / HOURS_PER_DAY);
}

export function formatNotionDuration(hours: number | null | undefined): string {
  const normalizedHours = Math.max(0, hours ?? 0);

  return `${formatDayValue(normalizedHours)}d (${trimNumber(normalizedHours)}h)`;
}
