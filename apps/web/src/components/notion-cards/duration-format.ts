const HOURS_PER_DAY = 8;

function trimNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatMixedDuration(hours: number): string {
  const days = Math.floor(hours / HOURS_PER_DAY);
  const remainingHours = trimNumber(hours - days * HOURS_PER_DAY);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (Number(remainingHours) > 0 || parts.length === 0) {
    parts.push(`${remainingHours}h`);
  }

  return parts.join(" ");
}

export function formatNotionDuration(hours: number | null | undefined): string {
  const normalizedHours = Math.max(0, hours ?? 0);

  return `${formatMixedDuration(normalizedHours)} (${trimNumber(normalizedHours)}h)`;
}

export function formatNotionDurationCompact(hours: number | null | undefined): string {
  return formatMixedDuration(Math.max(0, hours ?? 0));
}
