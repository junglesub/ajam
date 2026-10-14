import { listCachedNotionCardsByPageIds, listTimesheetEntries } from "@timesheet/db";
import {
  buildYearEndReviewData,
  validateYearEndReviewPeriod,
  type NotionCardSnapshot,
  type YearEndReviewData,
  type YearEndReviewPeriod
} from "@timesheet/domain";

const NOTION_PAGE_ID_BATCH_SIZE = 200;

/**
 * Reads the current user's saved WORK records and their linked Notion card cache for one period.
 * Read-only: it never calls the Notion API, writes to the database or turns failures into empty data.
 */
export async function loadYearEndReviewData(params: {
  period: YearEndReviewPeriod;
  userId: string;
}): Promise<YearEndReviewData> {
  validateYearEndReviewPeriod(params.period);

  const days = await listTimesheetEntries({
    endDateKey: params.period.endDateKey,
    startDateKey: params.period.startDateKey,
    userId: params.userId
  });
  const notionPageIds = [
    ...new Set(
      days.flatMap((day) =>
        day.entries
          .filter((entry) => entry.kind === "WORK")
          .flatMap((entry) => entry.notionCards.map((card) => card.notionPageId.trim()))
          .filter(Boolean)
      )
    )
  ];
  const cards = await listNotionCardSnapshots({ notionPageIds, userId: params.userId });

  return buildYearEndReviewData({
    cards,
    days,
    loadedAt: new Date().toISOString(),
    period: params.period
  });
}

async function listNotionCardSnapshots(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<NotionCardSnapshot[]> {
  const cards: NotionCardSnapshot[] = [];

  for (let index = 0; index < params.notionPageIds.length; index += NOTION_PAGE_ID_BATCH_SIZE) {
    const records = await listCachedNotionCardsByPageIds({
      notionPageIds: params.notionPageIds.slice(index, index + NOTION_PAGE_ID_BATCH_SIZE),
      userId: params.userId
    });

    for (const record of records) {
      cards.push({
        archived: record.archived,
        category: record.category,
        endDate: record.endDate,
        lastEditedTime: record.lastEditedTime,
        notionPageId: record.notionPageId,
        stale: record.stale,
        startDate: record.startDate,
        status: record.status,
        title: record.title,
        url: record.url
      });
    }
  }

  return cards;
}
