import { normalizeNotionDateToDateKey } from "@timesheet/domain";

import {
  getUserNotionAccessToken,
  getUserNotionConnection,
  recordNotionSyncRun,
  replaceNotionCardCacheForDate,
  upsertNotionCardCache,
  type NotionCardCacheRecord,
  type NotionPropertyDescriptor,
  type UserNotionConnection
} from "./notion-store";
import { getNotionPropertyKey, pickRawNotionProperty } from "./notion-property";

export type NotionDataSourceSchema = {
  id: string;
  name?: string;
  properties: Record<string, { id: string; name?: string; type: string }>;
};

type NotionPage = {
  archived?: boolean;
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
  url?: string;
};

type QueryResponse = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: NotionPage[];
};

const notionApiVersion = "2026-03-11";
const pageSize = 100;
const maxPagesPerSync = 20;

export async function retrieveNotionDataSourceSchema(params: {
  dataSourceId: string;
  token: string;
}): Promise<NotionDataSourceSchema> {
  const response = await notionFetch({
    method: "GET",
    path: `/v1/data_sources/${encodeURIComponent(params.dataSourceId)}`,
    token: params.token
  });

  return response as NotionDataSourceSchema;
}

export async function syncNotionCardsForDate(params: {
  dateKey: string;
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  const connection = await requireConnection(params.userId);
  const token = await getUserNotionAccessToken(params.userId);

  try {
    const result = await queryDataSourcePages({
      connection,
      filter: buildDateCandidateFilter({ connection, dateKey: params.dateKey }),
      token
    });
    const cards = result.pages.map((page) => normalizePage({ connection, page }));

    if (result.partial) {
      await upsertNotionCardCache({
        analysisConfigVersion: connection.analysisConfigVersion,
        cards,
        userId: params.userId
      });
    } else {
      await replaceNotionCardCacheForDate({
        analysisConfigVersion: connection.analysisConfigVersion,
        cards,
        dateKey: params.dateKey,
        userId: params.userId
      });
    }
    await recordNotionSyncRun({
      analysisConfigVersion: connection.analysisConfigVersion,
      cardsFetched: cards.length,
      partial: result.partial,
      scopeEndDate: params.dateKey,
      scopeStartDate: params.dateKey,
      scopeType: "date",
      status: "success",
      userId: params.userId
    });

    return cards;
  } catch (error) {
    await recordNotionSyncRun({
      analysisConfigVersion: connection.analysisConfigVersion,
      cardsFetched: 0,
      errorCode: getNotionErrorCode(error),
      errorMessage: getNotionErrorMessage(error),
      partial: false,
      scopeEndDate: params.dateKey,
      scopeStartDate: params.dateKey,
      scopeType: "date",
      status: "failed",
      userId: params.userId
    });
    throw error;
  }
}

async function queryDataSourcePages(params: {
  connection: UserNotionConnection;
  filter: unknown;
  token: string;
}): Promise<{ pages: NotionPage[]; partial: boolean }> {
  const pages: NotionPage[] = [];
  let startCursor = "";
  let requestCount = 0;

  while (requestCount < maxPagesPerSync) {
    const response = (await notionFetch({
      body: {
        filter: params.filter,
        page_size: pageSize,
        start_cursor: startCursor || undefined
      },
      method: "POST",
      path: `/v1/data_sources/${encodeURIComponent(params.connection.dataSourceId)}/query`,
      token: params.token
    })) as QueryResponse;

    pages.push(...(response.results ?? []));
    requestCount += 1;

    if (!response.has_more || !response.next_cursor) {
      return { pages, partial: false };
    }

    startCursor = response.next_cursor;
  }

  return { pages, partial: true };
}

function buildDateCandidateFilter(params: { connection: UserNotionConnection; dateKey: string }): unknown {
  const startProperty = params.connection.startDateProperty;
  const endProperty =
    params.connection.dateMappingMode === "single_range_property"
      ? params.connection.startDateProperty
      : params.connection.endDateProperty;

  if (!startProperty) {
    throw new Error("Notion 시작 날짜 필드 매핑이 필요합니다.");
  }

  const startPropertyKey = getNotionPropertyKey(startProperty);
  const endPropertyKey = getNotionPropertyKey(endProperty);
  const startFilter = {
    property: startPropertyKey,
    date: { on_or_before: params.dateKey }
  };

  if (!endPropertyKey) {
    return startFilter;
  }

  return {
    and: [
      startFilter,
      {
        or: [
          { property: endPropertyKey, date: { is_empty: true } },
          { property: endPropertyKey, date: { on_or_after: params.dateKey } }
        ]
      }
    ]
  };
}

function normalizePage(params: { connection: UserNotionConnection; page: NotionPage }): NotionCardCacheRecord {
  const properties = params.page.properties ?? {};
  const title = getPropertyText(properties, params.connection.titleProperty);
  const status = getPropertyText(properties, params.connection.statusProperty);
  const category = getPropertyText(properties, params.connection.categoryProperty);
  const dateValues = getDateValues(properties, params.connection);
  const rawPropertiesJson = JSON.stringify({
    category: pickRawProperty(properties, params.connection.categoryProperty),
    date:
      params.connection.dateMappingMode === "single_range_property"
        ? pickRawProperty(properties, params.connection.startDateProperty)
        : undefined,
    endDate: pickRawProperty(properties, params.connection.endDateProperty),
    startDate: pickRawProperty(properties, params.connection.startDateProperty),
    status: pickRawProperty(properties, params.connection.statusProperty),
    title: pickRawProperty(properties, params.connection.titleProperty)
  });

  return {
    archived: Boolean(params.page.archived),
    category,
    endDate: dateValues.endDate,
    lastEditedTime: params.page.last_edited_time ?? "",
    notionPageId: params.page.id,
    rawPropertiesJson,
    stale: false,
    startDate: dateValues.startDate,
    status,
    title,
    url: params.page.url ?? ""
  };
}

function getDateValues(properties: Record<string, unknown>, connection: UserNotionConnection) {
  const startRaw = pickRawProperty(properties, connection.startDateProperty);
  const endRaw =
    connection.dateMappingMode === "single_range_property" ? startRaw : pickRawProperty(properties, connection.endDateProperty);

  return {
    endDate: normalizeRawDate(endRaw, connection.dateMappingMode === "single_range_property" ? "end" : "start"),
    startDate: normalizeRawDate(startRaw, "start")
  };
}

function normalizeRawDate(value: unknown, part: "start" | "end"): string {
  const date = (value as { date?: { end?: string; start?: string } } | undefined)?.date;
  const rawValue = part === "start" ? date?.start : date?.end;

  return rawValue ? normalizeNotionDateToDateKey(rawValue) : "";
}

function getPropertyText(properties: Record<string, unknown>, descriptor: NotionPropertyDescriptor | null): string {
  const property = pickRawProperty(properties, descriptor) as
    | {
        rich_text?: Array<{ plain_text?: string }>;
        multi_select?: Array<{ name?: string }>;
        select?: { name?: string };
        status?: { name?: string };
        title?: Array<{ plain_text?: string }>;
      }
    | undefined;

  return (
    property?.title?.map((item) => item.plain_text ?? "").join("").trim() ||
    property?.rich_text?.map((item) => item.plain_text ?? "").join("").trim() ||
    property?.multi_select?.map((item) => item.name ?? "").filter(Boolean).join(", ").trim() ||
    property?.status?.name?.trim() ||
    property?.select?.name?.trim() ||
    ""
  );
}

function pickRawProperty(properties: Record<string, unknown>, descriptor: NotionPropertyDescriptor | null): unknown {
  return pickRawNotionProperty(properties, descriptor);
}

async function requireConnection(userId: string): Promise<UserNotionConnection> {
  const connection = await getUserNotionConnection(userId);
  const token = await getUserNotionAccessToken(userId);

  if (!connection || !connection.dataSourceId || !token) {
    throw new Error("Notion 연결 설정이 필요합니다.");
  }

  return connection;
}

async function notionFetch(params: {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  token: string;
}): Promise<unknown> {
  const response = await fetch(`https://api.notion.com${params.path}`, {
    body: params.body ? JSON.stringify(params.body) : undefined,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
      "Notion-Version": notionApiVersion
    },
    method: params.method
  });

  if (!response.ok) {
    throw new Error(mapNotionStatus(response.status));
  }

  return response.json();
}

function mapNotionStatus(status: number): string {
  if (status === 404) {
    return "데이터 소스를 찾을 수 없거나 이 integration에 공유되지 않았습니다. Notion의 Add connections를 확인해 주세요. (404)";
  }

  if (status === 403) {
    return "이 integration에 읽기 권한이 없습니다. Notion integration capability 설정을 확인해 주세요. (403)";
  }

  if (status === 429) {
    return "Notion 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (429)";
  }

  return `Notion 요청에 실패했습니다. (${status})`;
}

function getNotionErrorCode(error: unknown): string {
  return error instanceof Error ? (error.message.match(/\((\d+)\)/)?.[1] ?? "") : "";
}

function getNotionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Notion 동기화에 실패했습니다.";
}
