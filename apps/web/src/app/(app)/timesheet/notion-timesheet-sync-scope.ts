import type { StoredTimesheetDraft } from "@timesheet/db";
import { allocateNotionCardHours, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";

type ChangedNotionPageIdParams = {
  afterDay: StoredTimesheetDraft;
  beforeDays: StoredTimesheetDraft[];
};

type NotionPageContribution = {
  dateKeys: Set<string>;
  hourCents: number;
};

export function collectChangedNotionPageIdsForTimesheetSave({
  afterDay,
  beforeDays
}: ChangedNotionPageIdParams): string[] {
  const before = collectNotionPageContributions(beforeDays);
  const after = collectNotionPageContributions([afterDay]);
  const pageIds = new Set([...before.keys(), ...after.keys()]);

  return [...pageIds].filter((pageId) => !isSameContribution(before.get(pageId), after.get(pageId))).sort();
}

function collectNotionPageContributions(days: StoredTimesheetDraft[]): Map<string, NotionPageContribution> {
  const contributions = new Map<string, NotionPageContribution>();

  for (const day of days) {
    for (const entry of day.entries) {
      if (entry.kind !== "WORK") {
        continue;
      }

      const allocatedLinks = allocateNotionCardHours({
        entryHours: normalizeHours(entry.hours),
        links: normalizeNotionLinks(entry.notionCards)
      });

      for (const link of allocatedLinks) {
        const pageId = link.notionPageId.trim();

        if (!pageId) {
          continue;
        }

        const contribution = contributions.get(pageId) ?? {
          dateKeys: new Set<string>(),
          hourCents: 0
        };

        contribution.dateKeys.add(day.dateKey);
        contribution.hourCents += toHourCents(link.allocatedHours);
        contributions.set(pageId, contribution);
      }
    }
  }

  return contributions;
}

function isSameContribution(left?: NotionPageContribution, right?: NotionPageContribution): boolean {
  if (!left || !right) {
    return !left && !right;
  }

  return left.hourCents === right.hourCents && toDateKeySignature(left.dateKeys) === toDateKeySignature(right.dateKeys);
}

function normalizeNotionLinks(links: TimesheetEntryNotionCardDraft[]): TimesheetEntryNotionCardDraft[] {
  return links
    .map((link) => ({
      ...link,
      allocatedHours: Number.isFinite(link.allocatedHours) ? link.allocatedHours : 0,
      allocationMode: link.allocationMode === "manual" ? "manual" as const : "auto" as const,
      notionPageId: link.notionPageId.trim()
    }))
    .filter((link) => link.notionPageId);
}

function normalizeHours(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDateKeySignature(dateKeys: Set<string>): string {
  return [...dateKeys].sort().join("|");
}

function toHourCents(value: number): number {
  return Math.round(normalizeHours(value) * 100);
}
