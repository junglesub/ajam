"use server";

import {
  buildNotionCardAvailableHours,
  buildNotionCardEstimate,
  buildNotionCategorySummary,
  toBrowserDateKey,
  type NotionCategorySummary
} from "@timesheet/domain";
import {
  getManagedUser,
  getUserNotionAccessToken,
  getUserNotionConnection,
  listCachedNotionCards,
  listHolidays,
  listTimesheetEntries,
  listVacations,
  retrieveNotionDataSourceSchema,
  syncNotionCardsForDate,
  syncNotionWorkHoursForPages,
  upsertUserNotionConnection,
  type NotionCardCacheRecord,
  type UserNotionConnection
} from "@timesheet/db";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";

async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return user;
}

export type NotionMonthlyAnalysisCard = NotionCardCacheRecord & {
  availableHours: {
    availableDays: number;
    availableHours: number;
    unavailableReason?: "missing_start_date";
  };
  estimate: {
    dayEquivalent: number;
    estimatedHours: number;
    fallbackDateCount: number;
    totalBusinessDays: number;
    unavailableReason?: "missing_start_date" | "done_without_end_date";
  };
  linkedHours: number;
  workDayCount: number;
};

export type NotionMonthlyAnalysis = {
  cards: NotionMonthlyAnalysisCard[];
  categorySummary: NotionCategorySummary[];
};

export type NotionFieldUpdatePrompt = {
  affectedCardCount: number;
  fieldLabels: string[];
  notionPageIds: string[];
};

export type NotionDateCandidatesSyncResult = {
  cards: NotionCardCacheRecord[];
  notionFieldUpdate: NotionFieldUpdatePrompt | null;
};

function getMonthRange(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  const startDateKey = `${year}-${String(monthValue).padStart(2, "0")}-01`;
  const endDateKey = `${year}-${String(monthValue).padStart(2, "0")}-${String(new Date(year ?? 0, monthValue ?? 1, 0).getDate()).padStart(2, "0")}`;

  return { endDateKey, startDateKey };
}

function getAvailabilityRange(cards: NotionCardCacheRecord[], todayDateKey: string) {
  const ranges = cards
    .filter((card) => card.startDate)
    .map((card) => ({
      endDateKey: card.endDate || todayDateKey,
      startDateKey: card.startDate
    }));

  if (ranges.length === 0) {
    return null;
  }

  return {
    endDateKey: ranges.reduce((latest, range) => range.endDateKey > latest ? range.endDateKey : latest, ranges[0]!.endDateKey),
    startDateKey: ranges.reduce((earliest, range) => range.startDateKey < earliest ? range.startDateKey : earliest, ranges[0]!.startDateKey)
  };
}

export async function getNotionConnectionAction() {
  const user = await requireSession();

  return getUserNotionConnection(user.id);
}

export async function saveNotionConnectionAction(params: {
  accessToken?: string;
  clearToken?: boolean;
  connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
}) {
  const user = await requireSession();

  return upsertUserNotionConnection({ ...params, userId: user.id });
}

export async function testNotionDataSourceAction(params: { dataSourceId: string; token?: string }) {
  const user = await requireSession();
  const token = params.token?.trim() || await getUserNotionAccessToken(user.id);

  if (!token) {
    throw new Error("토큰을 입력하거나 기존 토큰을 먼저 저장해 주세요.");
  }

  const schema = await retrieveNotionDataSourceSchema({
    dataSourceId: params.dataSourceId.trim(),
    token
  });

  return {
    id: schema.id,
    name: schema.name ?? "",
    properties: schema.properties
  };
}

export async function syncNotionDateCandidatesAction(dateKey: string): Promise<NotionDateCandidatesSyncResult> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const [connection, cards] = await Promise.all([
    getUserNotionConnection(user.id),
    syncNotionCardsForDate({ dateKey, userId: user.id })
  ]);

  return {
    cards,
    notionFieldUpdate: buildNotionFieldUpdatePrompt({
      cards,
      connection
    })
  };
}

export async function syncNotionCardFieldsAction(notionPageIds: string[]) {
  const user = await requireSession();
  const uniquePageIds = [...new Set(notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];

  if (uniquePageIds.length === 0) {
    return { updated: 0 };
  }

  return syncNotionWorkHoursForPages({ notionPageIds: uniquePageIds, userId: user.id });
}

function buildNotionFieldUpdatePrompt(params: {
  cards: NotionCardCacheRecord[];
  connection: UserNotionConnection | null;
}): NotionFieldUpdatePrompt | null {
  const notionPageIds = [...new Set(params.cards.map((card) => card.notionPageId.trim()).filter(Boolean))];

  if (notionPageIds.length === 0 || !params.connection?.hasToken) {
    return null;
  }

  const fieldLabels = [
    {
      label: "가용 시간",
      property: params.connection.availableHoursProperty,
      type: "number"
    },
    {
      label: "업무 기간 시간",
      property: params.connection.workHoursProperty,
      type: "number"
    },
    {
      label: "작업일수",
      property: params.connection.workDayCountProperty,
      type: "number"
    },
    {
      label: "마지막 작업일",
      property: params.connection.lastWorkedDateProperty,
      type: "date"
    },
    {
      label: "aJam 업데이트 시간",
      property: params.connection.ajamLastUpdateProperty,
      type: "date"
    }
  ].flatMap(({ label, property, type }) => {
    if (!(property?.id || property?.name) || (property.type && property.type !== type)) {
      return [];
    }

    return [label];
  });

  if (fieldLabels.length === 0) {
    return null;
  }

  return {
    affectedCardCount: notionPageIds.length,
    fieldLabels,
    notionPageIds
  };
}

export async function listNotionCardsForMonthAction(month: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("월 형식이 올바르지 않습니다.");
  }

  const { endDateKey, startDateKey } = getMonthRange(month);

  return listCachedNotionCards({ endDateKey, startDateKey, userId: user.id });
}

export async function buildNotionMonthlyAnalysisAction(month: string): Promise<NotionMonthlyAnalysis> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("월 형식이 올바르지 않습니다.");
  }

  const { endDateKey, startDateKey } = getMonthRange(month);
  const [connection, days, cards, holidays, vacations] = await Promise.all([
    getUserNotionConnection(user.id),
    listTimesheetEntries({ endDateKey, startDateKey, userId: user.id }),
    listCachedNotionCards({ endDateKey, startDateKey, userId: user.id }),
    listHolidays({ endDateKey, startDateKey }).catch(() => []),
    listVacations({ endDateKey, startDateKey, userId: user.id })
  ]);
  const savedWorkHoursByDate = new Map(
    days.map((day) => [
      day.dateKey,
      day.entries.filter((entry) => entry.kind === "WORK").reduce((sum, entry) => sum + entry.hours, 0)
    ])
  );
  const linkedPageIds = new Set(days.flatMap((day) => day.entries.flatMap((entry) => entry.notionCards.map((link) => link.notionPageId))));
  const mappedCards = cards.filter((card) => linkedPageIds.has(card.notionPageId));
  const holidayDateKeys = holidays.map((holiday) => holiday.dateKey);
  const vacationDateKeys = vacations.map((vacation) => vacation.dateKey);
  const doneStatusValues = connection?.doneStatusValues ?? [];
  const todayDateKey = toBrowserDateKey(new Date());
  const availabilityRange = getAvailabilityRange(mappedCards, todayDateKey);
  const [availabilityHolidays, availabilityVacations] = availabilityRange
    ? await Promise.all([
        listHolidays(availabilityRange).catch(() => []),
        listVacations({ ...availabilityRange, userId: user.id })
      ])
    : [[], []];
  const availabilityHolidayDateKeys = availabilityHolidays.map((holiday) => holiday.dateKey);
  const availabilityVacationDateKeys = availabilityVacations.map((vacation) => vacation.dateKey);
  const analysisCards = mappedCards.map((card) => {
    const availableHours = buildNotionCardAvailableHours({
      card,
      holidayDateKeys: availabilityHolidayDateKeys,
      todayDateKey,
      vacationDateKeys: availabilityVacationDateKeys
    });
    const estimate = buildNotionCardEstimate({
      card,
      doneStatusValues,
      holidayDateKeys,
      mappedCards,
      month,
      savedWorkHoursByDate,
      vacationDateKeys
    });
    const linkedHours = days.reduce(
      (sum, day) =>
        sum +
        day.entries.reduce(
          (entrySum, entry) =>
            entrySum +
            entry.notionCards
              .filter((link) => link.notionPageId === card.notionPageId)
              .reduce((linkSum, link) => linkSum + link.allocatedHours, 0),
          0
        ),
      0
    );
    const workDayCount = days.filter((day) =>
      day.entries.some(
        (entry) => entry.kind === "WORK" && entry.notionCards.some((link) => link.notionPageId === card.notionPageId)
      )
    ).length;

    return { ...card, availableHours, estimate, linkedHours, workDayCount };
  });

  return {
    cards: analysisCards,
    categorySummary: buildNotionCategorySummary({
      cards: analysisCards.map((card) => ({
        category: card.category,
        estimatedHours: card.estimate.estimatedHours,
        linkedHours: card.linkedHours,
        notionPageId: card.notionPageId
      }))
    })
  };
}
