import { isWeekendDateKey, toBrowserDateKey } from "./date.js";

export type NotionCardSnapshot = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
};

export type WorkEntryNotionCardLink = {
  allocatedHours: number;
  allocationMode: "auto" | "manual";
  notionPageId: string;
  source: "manual" | "previous_business_day_default";
};

export type NotionCardEstimate = {
  dayEquivalent: number;
  estimatedHours: number;
  fallbackDateCount: number;
  totalBusinessDays: number;
  unavailableReason?: "missing_start_date" | "done_without_end_date";
};

export type NotionCardAvailableHours = {
  availableDays: number;
  availableHours: number;
  unavailableReason?: "missing_start_date";
};

export type NotionCardSummaryInput = {
  category: string;
  estimatedHours: number;
  linkedHours: number;
  notionPageId: string;
};

export type NotionCategorySummary = {
  cardCount: number;
  category: string;
  estimatedHours: number;
  linkedHours: number;
};

type FilterOpenNotionCardCandidatesParams = {
  cards: NotionCardSnapshot[];
  dateKey: string;
  doneStatusValues: string[];
  linkedPageIds?: string[];
};

type BuildNotionCardEstimateParams = {
  card: NotionCardSnapshot;
  defaultHoursPerBusinessDay?: number;
  doneStatusValues: string[];
  holidayDateKeys?: string[];
  mappedCards: NotionCardSnapshot[];
  month: string;
  savedWorkHoursByDate?: Map<string, number>;
  vacationDateKeys?: string[];
};

type BuildNotionCardAvailableHoursParams = {
  card: NotionCardSnapshot;
  defaultHoursPerBusinessDay?: number;
  holidayDateKeys?: string[];
  todayDateKey: string;
  vacationDateKeys?: string[];
};

type AllocateNotionCardHoursParams = {
  entryHours: number;
  links: WorkEntryNotionCardLink[];
};

const KOREA_TIME_ZONE = "Asia/Seoul";
const DEFAULT_HOURS_PER_BUSINESS_DAY = 8;

export function normalizeNotionDateToDateKey(value: string, timeZone = KOREA_TIME_ZONE): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

export function filterOpenNotionCardCandidates({
  cards,
  dateKey,
  doneStatusValues,
  linkedPageIds = []
}: FilterOpenNotionCardCandidatesParams): NotionCardSnapshot[] {
  const linkedPageIdSet = new Set(linkedPageIds);

  return cards.filter((card) => {
    if (linkedPageIdSet.has(card.notionPageId)) {
      return true;
    }

    return isCardOpenOnDate(card, dateKey) && !isDoneStatus(card.status, doneStatusValues);
  });
}

export function buildNotionCardEstimate({
  card,
  defaultHoursPerBusinessDay = DEFAULT_HOURS_PER_BUSINESS_DAY,
  doneStatusValues,
  holidayDateKeys = [],
  mappedCards,
  month,
  savedWorkHoursByDate = new Map(),
  vacationDateKeys = []
}: BuildNotionCardEstimateParams): NotionCardEstimate {
  if (!card.startDate) {
    return {
      dayEquivalent: 0,
      estimatedHours: 0,
      fallbackDateCount: 0,
      totalBusinessDays: 0,
      unavailableReason: "missing_start_date"
    };
  }

  if (isDoneStatus(card.status, doneStatusValues) && !card.endDate) {
    return {
      dayEquivalent: 0,
      estimatedHours: 0,
      fallbackDateCount: 0,
      totalBusinessDays: 0,
      unavailableReason: "done_without_end_date"
    };
  }

  const excludedDateKeys = new Set([...holidayDateKeys, ...vacationDateKeys]);
  const businessDateKeys = getMonthBusinessDateKeys(month).filter((dateKey) => !excludedDateKeys.has(dateKey));
  const activeDateKeys = businessDateKeys.filter((dateKey) => isCardOpenForEstimate(card, dateKey, doneStatusValues));

  let estimatedHours = 0;
  let fallbackDateCount = 0;

  for (const dateKey of activeDateKeys) {
    const openMappedCards = mappedCards.filter((mappedCard) =>
      isCardOpenForEstimate(mappedCard, dateKey, doneStatusValues)
    );

    if (openMappedCards.length === 0) {
      continue;
    }

    const savedHours = savedWorkHoursByDate.get(dateKey);
    const dayHours = savedHours ?? defaultHoursPerBusinessDay;

    if (savedHours === undefined) {
      fallbackDateCount += 1;
    }

    estimatedHours += dayHours / openMappedCards.length;
  }

  const roundedEstimatedHours = roundToTwoDecimals(estimatedHours);

  return {
    dayEquivalent: roundToTwoDecimals(roundedEstimatedHours / defaultHoursPerBusinessDay),
    estimatedHours: roundedEstimatedHours,
    fallbackDateCount,
    totalBusinessDays: activeDateKeys.length
  };
}

export function buildNotionCardAvailableHours({
  card,
  defaultHoursPerBusinessDay = DEFAULT_HOURS_PER_BUSINESS_DAY,
  holidayDateKeys = [],
  todayDateKey,
  vacationDateKeys = []
}: BuildNotionCardAvailableHoursParams): NotionCardAvailableHours {
  if (!card.startDate) {
    return {
      availableDays: 0,
      availableHours: 0,
      unavailableReason: "missing_start_date"
    };
  }

  const endDateKey = card.endDate || todayDateKey;
  const excludedDateKeys = new Set([...holidayDateKeys, ...vacationDateKeys]);
  const availableDays = getDateKeysBetween(card.startDate, endDateKey).filter(
    (dateKey) => !isWeekendDateKey(dateKey) && !excludedDateKeys.has(dateKey)
  ).length;

  return {
    availableDays,
    availableHours: roundToTwoDecimals(availableDays * defaultHoursPerBusinessDay)
  };
}

export function allocateNotionCardHours({
  entryHours,
  links
}: AllocateNotionCardHoursParams): WorkEntryNotionCardLink[] {
  if (links.length === 0) {
    return [];
  }

  if (!Number.isFinite(entryHours) || entryHours < 0) {
    throw new Error("Work entry hours must be a non-negative number.");
  }

  for (const link of links) {
    if (!Number.isFinite(link.allocatedHours) || link.allocatedHours < 0) {
      throw new Error("Notion card allocated hours must be non-negative numbers.");
    }
  }

  const hasManualAllocation = links.some((link) => link.allocationMode === "manual");

  if (hasManualAllocation) {
    const allocatedTotal = links.reduce((total, link) => total + link.allocatedHours, 0);

    if (roundToTwoDecimals(allocatedTotal) !== roundToTwoDecimals(entryHours)) {
      throw new Error("Notion card allocated hours must equal the work entry hours.");
    }

    return links;
  }

  const totalCents = Math.round(roundToTwoDecimals(entryHours) * 100);
  const baseCents = Math.floor(totalCents / links.length);
  const remainderCents = totalCents - baseCents * links.length;

  return links.map((link, index) => ({
    ...link,
    allocatedHours: (baseCents + (index < remainderCents ? 1 : 0)) / 100
  }));
}

export function shouldWarnAboutFallbackHours(fallbackDateCount: number): boolean {
  return fallbackDateCount > 0;
}

export function buildNotionCategorySummary(params: { cards: NotionCardSummaryInput[] }): NotionCategorySummary[] {
  const summaries = new Map<string, NotionCategorySummary>();

  for (const card of params.cards) {
    for (const category of getCategoryNames(card.category)) {
      const current = summaries.get(category) ?? {
        cardCount: 0,
        category,
        estimatedHours: 0,
        linkedHours: 0
      };

      current.cardCount += 1;
      current.estimatedHours = roundToTwoDecimals(current.estimatedHours + card.estimatedHours);
      current.linkedHours = roundToTwoDecimals(current.linkedHours + card.linkedHours);
      summaries.set(category, current);
    }
  }

  return Array.from(summaries.values()).sort(
    (left, right) => right.estimatedHours - left.estimatedHours || left.category.localeCompare(right.category, "ko-KR")
  );
}

function getCategoryNames(value: string): string[] {
  const categories = value.split(",").map((category) => category.trim()).filter(Boolean);

  return categories.length > 0 ? categories : ["미분류"];
}

function isCardOpenOnDate(card: NotionCardSnapshot, dateKey: string): boolean {
  if (card.archived || card.stale || !card.startDate || card.startDate > dateKey) {
    return false;
  }

  return !card.endDate || card.endDate >= dateKey;
}

function isCardOpenForEstimate(card: NotionCardSnapshot, dateKey: string, doneStatusValues: string[]): boolean {
  if (!isCardOpenOnDate(card, dateKey)) {
    return false;
  }

  return Boolean(card.endDate) || !isDoneStatus(card.status, doneStatusValues);
}

function isDoneStatus(status: string, doneStatusValues: string[]): boolean {
  return doneStatusValues.includes(status);
}

function getMonthBusinessDateKeys(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const cursor = new Date(year ?? 0, (monthNumber ?? 1) - 1, 1);
  const dateKeys: string[] = [];

  while (cursor.getMonth() === (monthNumber ?? 1) - 1) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      dateKeys.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

function getDateKeysBetween(startDateKey: string, endDateKey: string): string[] {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);

  if (start > end) {
    return [];
  }

  const dateKeys: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dateKeys.push(toBrowserDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
