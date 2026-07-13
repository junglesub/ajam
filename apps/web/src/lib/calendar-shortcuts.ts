export type CalendarShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  metaKey: boolean;
  repeat: boolean;
  target: unknown;
};

const editableSelector = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-calendar-shortcuts-ignore]";

export function shouldIgnoreCalendarShortcut(event: CalendarShortcutEvent, modalOpen = false): boolean {
  if (modalOpen || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) {
    return true;
  }

  const closest = (event.target as { closest?: (selector: string) => unknown } | null)?.closest;

  return typeof closest === "function" && Boolean(closest.call(event.target, editableSelector));
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(year!, monthNumber! - 1 + delta, 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function browserMonth(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function adjacentListTarget<T extends { dateKey: string; entryClientId: string }>(
  targets: readonly T[],
  selectedDateKey: string,
  selectedEntryId: string,
  direction: -1 | 1
): T | undefined {
  const exactIndex = targets.findIndex((target) => target.dateKey === selectedDateKey && target.entryClientId === selectedEntryId);
  const currentIndex = exactIndex >= 0 ? exactIndex : targets.findIndex((target) => target.dateKey === selectedDateKey);

  if (currentIndex < 0) {
    return direction > 0 ? targets[0] : targets.at(-1);
  }

  return targets[currentIndex + direction];
}
