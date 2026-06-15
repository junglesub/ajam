import {
  buildNotionCardAvailableHours,
  toBrowserDateKey
} from "@timesheet/domain";

import { updateNotionPageProperties, type NotionPagePropertyPatch } from "./notion-page-update";
import { getNotionPropertyKey, isMappedNotionPropertyType } from "./notion-property";
import {
  countLinkedNotionWorkDaysByPage,
  getLatestLinkedNotionWorkDateByPage,
  getUserNotionAccessToken,
  getUserNotionConnection,
  listCachedNotionCardsByPageIds,
  sumLinkedNotionHoursByPage
} from "./notion-store";
import { listHolidays, listVacations } from "./timesheet-store";

export type NotionWorkHoursSyncResult = {
  errors: Array<{
    message: string;
    notionPageId: string;
  }>;
  failed: number;
  skippedReason?:
    | "missing_connection"
    | "missing_token"
    | "missing_number_properties"
    | "invalid_number_properties";
  updated: number;
};

export async function syncNotionWorkHoursForPages(params: {
  includeLastWorkedDate?: boolean;
  notionPageIds: string[];
  userId: string;
}): Promise<NotionWorkHoursSyncResult> {
  const notionPageIds = [...new Set(params.notionPageIds.map((pageId) => pageId.trim()).filter(Boolean))];

  if (notionPageIds.length === 0) {
    return { errors: [], failed: 0, updated: 0 };
  }

  const [connection, token] = await Promise.all([
    getUserNotionConnection(params.userId),
    getUserNotionAccessToken(params.userId)
  ]);

  if (!connection) {
    return { errors: [], failed: 0, skippedReason: "missing_connection", updated: 0 };
  }

  if (!token) {
    return { errors: [], failed: 0, skippedReason: "missing_token", updated: 0 };
  }

  const ajamLastUpdatePropertyKey = isMappedNotionPropertyType(connection.ajamLastUpdateProperty, "date")
    ? getNotionPropertyKey(connection.ajamLastUpdateProperty)
    : undefined;
  const properties = [
    {
      descriptor: connection.availableHoursProperty,
      kind: "availableHours" as const
    },
    {
      descriptor: connection.workHoursProperty,
      kind: "hours" as const
    },
    {
      descriptor: connection.workDayCountProperty,
      kind: "workDayCount" as const
    },
    ...(params.includeLastWorkedDate === false
      ? []
      : [{
          descriptor: connection.lastWorkedDateProperty,
          kind: "lastWorkedDate" as const
        }])
  ].filter((property) => Boolean(getNotionPropertyKey(property.descriptor)));

  const validProperties = properties.filter((property) => {
    if (!property.descriptor?.type) {
      return true;
    }

    return property.kind === "lastWorkedDate"
      ? property.descriptor.type === "date"
      : property.descriptor.type === "number";
  });

  if (properties.length === 0) {
    return { errors: [], failed: 0, skippedReason: "missing_number_properties", updated: 0 };
  }

  if (validProperties.length === 0) {
    return { errors: [], failed: 0, skippedReason: "invalid_number_properties", updated: 0 };
  }

  const shouldSyncAvailableHours = validProperties.some((property) => property.kind === "availableHours");
  const shouldSyncLastWorkedDate = validProperties.some((property) => property.kind === "lastWorkedDate");
  const todayDateKey = toBrowserDateKey(new Date());
  const [hourTotals, workDayCounts, availableHoursByPage, lastWorkedDatesByPage] = await Promise.all([
    sumLinkedNotionHoursByPage({
      notionPageIds,
      userId: params.userId
    }),
    countLinkedNotionWorkDaysByPage({
      notionPageIds,
      userId: params.userId
    }),
    shouldSyncAvailableHours
      ? buildAvailableHoursByPage({
          notionPageIds,
          todayDateKey,
          userId: params.userId
        })
      : Promise.resolve(new Map<string, number>()),
    shouldSyncLastWorkedDate
      ? getLatestLinkedNotionWorkDateByPage({
          notionPageIds,
          userId: params.userId
        })
      : Promise.resolve(new Map<string, string>())
  ]);
  const errors: NotionWorkHoursSyncResult["errors"] = [];
  let updated = 0;

  for (const pageId of notionPageIds) {
    const pageProperties: Record<string, NotionPagePropertyPatch> = {};

    for (const property of validProperties) {
      const propertyKey = getNotionPropertyKey(property.descriptor);

      if (!propertyKey) {
        continue;
      }

      if (property.kind === "lastWorkedDate") {
        const lastWorkedDate = lastWorkedDatesByPage.get(pageId) ?? "";

        pageProperties[propertyKey] = {
          date: lastWorkedDate ? { start: lastWorkedDate } : null
        };
        continue;
      }

      const value = property.kind === "hours"
        ? hourTotals.get(pageId) ?? 0
        : property.kind === "workDayCount"
          ? workDayCounts.get(pageId) ?? 0
          : availableHoursByPage.get(pageId) ?? 0;

      pageProperties[propertyKey] = {
        number: value
      };
    }

    try {
      await updateNotionPageProperties({
        ajamLastUpdatePropertyKey,
        pageId,
        properties: pageProperties,
        token
      });
      updated += 1;
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : "Notion 페이지 업데이트에 실패했습니다.",
        notionPageId: pageId
      });
    }
  }

  return { errors, failed: errors.length, updated };
}

async function buildAvailableHoursByPage(params: {
  notionPageIds: string[];
  todayDateKey: string;
  userId: string;
}): Promise<Map<string, number>> {
  const cards = await listCachedNotionCardsByPageIds({
    notionPageIds: params.notionPageIds,
    userId: params.userId
  });
  const availableHours = new Map(params.notionPageIds.map((pageId) => [pageId, 0]));
  const dateRanges = cards
    .filter((card) => card.startDate)
    .map((card) => ({
      endDateKey: card.endDate || params.todayDateKey,
      startDateKey: card.startDate
    }));

  if (dateRanges.length === 0) {
    return availableHours;
  }

  const startDateKey = dateRanges.reduce((earliest, range) =>
    range.startDateKey < earliest ? range.startDateKey : earliest,
  dateRanges[0]!.startDateKey);
  const endDateKey = dateRanges.reduce((latest, range) =>
    range.endDateKey > latest ? range.endDateKey : latest,
  dateRanges[0]!.endDateKey);
  const [holidays, vacations] = await Promise.all([
    listHolidays({ endDateKey, startDateKey }).catch(() => []),
    listVacations({ endDateKey, startDateKey, userId: params.userId })
  ]);
  const holidayDateKeys = holidays.map((holiday) => holiday.dateKey);
  const vacationDateKeys = vacations.map((vacation) => vacation.dateKey);

  for (const card of cards) {
    const availability = buildNotionCardAvailableHours({
      card,
      holidayDateKeys,
      todayDateKey: params.todayDateKey,
      vacationDateKeys
    });

    availableHours.set(card.notionPageId, availability.availableHours);
  }

  return availableHours;
}
