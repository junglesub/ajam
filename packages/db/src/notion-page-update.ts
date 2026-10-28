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

export type NotionPageIconPatch = {
  emoji: string;
  type: "emoji";
};

export type NotionPagePatchResult = {
  archived?: boolean;
  icon?: { emoji?: string; type: string } | null;
  id: string;
  last_edited_time?: string;
  parent?: { data_source_id?: string; id?: string; type?: string };
  properties?: Record<string, unknown>;
  url?: string;
};

export async function updateNotionPageProperties(params: {
  ajamLastUpdatePropertyKey?: string;
  context?: NotionLogContext;
  icon?: NotionPageIconPatch | null;
  logSeverity?: "error" | "warn" | "none";
  onAttempt?: () => void;
  pageId: string;
  properties?: Record<string, NotionPagePropertyPatch>;
  token: string;
}): Promise<NotionPagePatchResult> {
  const requestedAt = new Date().toISOString();
  const hasProperties = Boolean(params.properties && Object.keys(params.properties).length > 0);
  const properties = {
    ...(params.properties ?? {}),
    ...(params.ajamLastUpdatePropertyKey && (hasProperties || params.icon)
      ? {
          [params.ajamLastUpdatePropertyKey]: {
            date: {
              start: requestedAt
            }
          }
        }
      : {})
  };

  const body: Record<string, unknown> = {};
  if (Object.keys(properties).length > 0) {
    body.properties = properties;
  }
  if (params.icon !== undefined) {
    body.icon = params.icon;
  }

  const response = await requestNotionApi({
    body,
    context: params.context,
    errorMessage: mapNotionStatus,
    logSeverity: params.logSeverity,
    method: "PATCH",
    onAttempt: params.onAttempt,
    path: `/v1/pages/${encodeURIComponent(params.pageId)}`,
    token: params.token
  });

  return (await response.json()) as NotionPagePatchResult;
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
