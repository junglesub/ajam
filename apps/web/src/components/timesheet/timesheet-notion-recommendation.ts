import {
  allocateNotionCardHours,
  type TimesheetDayDraft,
  type TimesheetEntryNotionCardDraft
} from "@timesheet/domain";
import type { NotionCardCandidate } from "./use-notion-card-candidates";

export type NotionWeeklyDefaultCard = {
  allocatedHours: number;
  category: string;
  enabled: boolean;
  endDate: string;
  notionPageId: string;
  startDate: string;
  status: string;
  title: string;
  weekday: number;
};

export function allocateDefaultNotionCards(cards: TimesheetEntryNotionCardDraft[], entryHours: number): TimesheetEntryNotionCardDraft[] {
  return allocateNotionCardHours({
    entryHours,
    links: dedupeNotionCardsByPageId(cards).map((card) => ({
      ...card,
      allocationMode: card.source === "weekday_default" ? "manual" : "auto",
      source: card.source === "weekday_default" ? "weekday_default" : "previous_business_day_default"
    }))
  });
}

function dedupeNotionCardsByPageId(cards: TimesheetEntryNotionCardDraft[]): TimesheetEntryNotionCardDraft[] {
  const cardsByPageId = new Map<string, TimesheetEntryNotionCardDraft>();

  for (const card of cards) {
    const pageId = card.notionPageId.trim();

    if (pageId && !cardsByPageId.has(pageId)) {
      cardsByPageId.set(pageId, {
        ...card,
        notionPageId: pageId
      });
    }
  }

  return Array.from(cardsByPageId.values());
}

function getDateKeyWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();
}

export function createWeekdayDefaultNotionCards(dateKey: string, defaults: NotionWeeklyDefaultCard[]): TimesheetEntryNotionCardDraft[] {
  const weekday = getDateKeyWeekday(dateKey);

  return defaults
    .filter((card) => card.enabled && card.weekday === weekday && card.notionPageId.trim())
    .map((card) => ({
      allocatedHours: card.allocatedHours,
      allocationMode: "manual",
      category: card.category,
      endDate: card.endDate,
      notionPageId: card.notionPageId,
      source: "weekday_default",
      startDate: card.startDate,
      status: card.status,
      title: card.title
    }));
}

export function buildNotionCardSnapshotMap(params: {
  candidatesByDate: Record<string, NotionCardCandidate[]>;
  savedRecords: Record<string, TimesheetDayDraft>;
}): Map<string, Partial<TimesheetEntryNotionCardDraft>> {
  const snapshots = new Map<string, Partial<TimesheetEntryNotionCardDraft>>();

  for (const day of Object.values(params.savedRecords)) {
    for (const link of day.entries.flatMap((entry) => entry.notionCards)) {
      snapshots.set(link.notionPageId, link);
    }
  }

  for (const candidate of Object.values(params.candidatesByDate).flat()) {
    snapshots.set(candidate.notionPageId, candidate);
  }

  return snapshots;
}

export function mergeNotionCardSnapshot(
  card: TimesheetEntryNotionCardDraft,
  snapshot: Partial<TimesheetEntryNotionCardDraft> | undefined
): TimesheetEntryNotionCardDraft {
  if (!snapshot) {
    return card;
  }

  return {
    ...card,
    category: snapshot.category ?? card.category,
    endDate: snapshot.endDate ?? card.endDate,
    lastWorkedDate: snapshot.lastWorkedDate ?? card.lastWorkedDate,
    linkedHours: snapshot.linkedHours ?? card.linkedHours,
    startDate: snapshot.startDate ?? card.startDate,
    status: snapshot.status ?? card.status,
    title: snapshot.title ?? card.title,
    workDayCount: snapshot.workDayCount ?? card.workDayCount
  };
}

export function mergeNotionCardSnapshots(
  cards: TimesheetEntryNotionCardDraft[],
  snapshotsByPageId: Map<string, Partial<TimesheetEntryNotionCardDraft>>
): TimesheetEntryNotionCardDraft[] {
  return cards.map((card) => mergeNotionCardSnapshot(card, snapshotsByPageId.get(card.notionPageId)));
}

export function isNotionCardOpenForDate(card: TimesheetEntryNotionCardDraft, dateKey: string, doneStatusValues: string[]): boolean {
  if (!card.startDate || card.startDate > dateKey) {
    return false;
  }

  if (card.endDate && card.endDate < dateKey) {
    return false;
  }

  return Boolean(card.endDate) || !doneStatusValues.includes(card.status ?? "");
}

export function findLocalPreviousNotionCards(params: {
  dateKey: string;
  doneStatusValues: string[];
  savedRecords: Record<string, TimesheetDayDraft>;
}): { cards: TimesheetEntryNotionCardDraft[]; foundPreviousEntry: boolean } {
  const previousEntry = Object.values(params.savedRecords)
    .flatMap((record) =>
      record.entries.map((entry) => ({
        dateKey: record.dateKey,
        entry
      }))
    )
    .filter((record) =>
      record.dateKey < params.dateKey &&
      record.entry.kind === "WORK" &&
      record.entry.notionCards.some((card) => card.source !== "weekday_default")
    )
    .sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey) ||
      left.entry.sortOrder - right.entry.sortOrder
    )[0];

  if (!previousEntry) {
    return {
      cards: [],
      foundPreviousEntry: false
    };
  }

  return {
    cards: previousEntry.entry.notionCards
      .filter((card) => card.source !== "weekday_default")
      .filter((card) => isNotionCardOpenForDate(card, params.dateKey, params.doneStatusValues))
      .map((card) => ({
        ...card,
        allocatedHours: 0,
        allocationMode: "auto",
        source: "previous_business_day_default"
      })),
    foundPreviousEntry: true
  };
}
