import { requestNotionApi } from "./notion-api";
import type { NotionLogContext } from "./notion-log";

export type NotionPagePropertyPatch =
  | {
      number: number;
    }
  | {
      date: {
        start: string;
      } | null;
    };

export async function updateNotionPageProperties(params: {
  ajamLastUpdatePropertyKey?: string;
  pageId: string;
  properties: Record<string, NotionPagePropertyPatch>;
  token: string;
  context?: NotionLogContext;
}) {
  const requestedAt = new Date().toISOString();
  const properties = {
    ...params.properties,
    ...(params.ajamLastUpdatePropertyKey
      ? {
          [params.ajamLastUpdatePropertyKey]: {
            date: {
              start: requestedAt
            }
          }
        }
      : {})
  };
  await requestNotionApi({
    method: "PATCH", path: `/v1/pages/${encodeURIComponent(params.pageId)}`,
    body: { properties }, token: params.token, context: params.context, errorMessage: mapNotionStatus
  });
}

function mapNotionStatus(status: number): string {
  if (status === 404) {
    return "Notion 페이지를 찾을 수 없거나 이 integration에 공유되지 않았습니다. Notion의 Add connections를 확인해 주세요. (404)";
  }

  if (status === 403) {
    return "이 integration에 Notion 페이지 업데이트 권한이 없습니다. Notion integration capability 설정을 확인해 주세요. (403)";
  }

  if (status === 429) {
    return "Notion 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (429)";
  }

  return `Notion 페이지 업데이트에 실패했습니다. (${status})`;
}
