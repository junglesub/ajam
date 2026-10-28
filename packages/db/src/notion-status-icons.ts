import { isValidEmoji } from "@timesheet/domain";
import { prisma } from "./client";
import { pickRawNotionProperty } from "./notion-property";
import { ensureNotionSchema, getUserNotionConnection, type UserNotionConnection } from "./notion-store";

export type NotionStatusIconSettings = {
  dataSourceId: string;
  emojiByOptionId: Record<string, string>;
  enabled: boolean;
  statusPropertyId: string;
};

export type NotionPageLike = {
  archived?: boolean;
  icon?: { emoji?: string; type: string } | null;
  id: string;
  in_trash?: boolean;
  is_archived?: boolean;
  last_edited_time?: string;
  parent?: { data_source_id?: string; database_id?: string; id?: string; type?: string };
  properties?: Record<string, unknown>;
};

export type NotionTargetIconDecision = {
  action: "skip" | "update";
  currentEmoji?: string;
  optionId?: string;
  reason?:
    | "archived_or_trashed"
    | "different_data_source"
    | "no_status_option"
    | "same_icon"
    | "scope_mismatch"
    | "settings_disabled"
    | "unmapped_option";
  targetEmoji?: string;
};

export { isValidEmoji };

export function validateStatusIconSettings(input: unknown): NotionStatusIconSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("올바르지 않은 아이콘 설정입니다.");
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.enabled !== "boolean") {
    throw new Error("enabled 속성은 boolean이어야 합니다.");
  }
  const enabled = raw.enabled;
  const dataSourceId = typeof raw.dataSourceId === "string" ? raw.dataSourceId.trim() : "";
  const statusPropertyId = typeof raw.statusPropertyId === "string" ? raw.statusPropertyId.trim() : "";

  if (!dataSourceId || dataSourceId.length > 100) {
    throw new Error("데이터 소스 ID가 올바르지 않습니다.");
  }
  if (!statusPropertyId || statusPropertyId.length > 100) {
    throw new Error("상태 속성 ID가 올바르지 않습니다.");
  }

  if (raw.emojiByOptionId === null || typeof raw.emojiByOptionId !== "object" || Array.isArray(raw.emojiByOptionId)) {
    throw new Error("옵션 매핑 형식이 올바르지 않습니다.");
  }
  const rawMapping = raw.emojiByOptionId as Record<string, unknown>;
  const keys = Object.keys(rawMapping);
  if (keys.length > 200) {
    throw new Error("매핑할 수 있는 상태 옵션은 최대 200개입니다.");
  }

  const emojiByOptionId: Record<string, string> = {};

  for (const [optionId, emojiVal] of Object.entries(rawMapping)) {
    const trimmedId = optionId.trim();
    if (!trimmedId || trimmedId.length > 100) {
      continue;
    }
    if (typeof emojiVal !== "string") {
      continue;
    }
    const trimmedEmoji = emojiVal.trim();
    if (!trimmedEmoji) {
      continue;
    }
    if (!isValidEmoji(trimmedEmoji)) {
      throw new Error(`올바르지 않은 이모지입니다: ${trimmedEmoji}`);
    }
    emojiByOptionId[trimmedId] = trimmedEmoji;
  }

  return {
    dataSourceId,
    emojiByOptionId,
    enabled,
    statusPropertyId
  };
}

export function parseStatusIconSettings(json: string | null | undefined): NotionStatusIconSettings | null {
  if (!json || typeof json !== "string" || !json.trim()) {
    return null;
  }
  try {
    return validateStatusIconSettings(JSON.parse(json));
  } catch {
    return null;
  }
}

export function assertMatchingScope(
  settings: NotionStatusIconSettings,
  connection: Pick<UserNotionConnection, "dataSourceId" | "statusProperty">,
  allowedOptionIds?: string[]
): void {
  if (!connection.dataSourceId || settings.dataSourceId !== connection.dataSourceId) {
    throw new Error("설정된 Notion 데이터 소스와 일치하지 않습니다.");
  }
  if (!connection.statusProperty?.id || settings.statusPropertyId !== connection.statusProperty.id) {
    throw new Error("설정된 상태 속성과 일치하지 않습니다.");
  }
  if (allowedOptionIds && Array.isArray(allowedOptionIds)) {
    for (const optionId of Object.keys(settings.emojiByOptionId)) {
      if (!allowedOptionIds.includes(optionId)) {
        throw new Error(`알 수 없는 상태 옵션입니다: ${optionId}`);
      }
    }
  }
}

export function determineTargetIcon(
  page: NotionPageLike,
  connection: Pick<UserNotionConnection, "dataSourceId" | "statusProperty">,
  settings: NotionStatusIconSettings | null
): NotionTargetIconDecision {
  if (!settings || !settings.enabled) {
    return { action: "skip", reason: "settings_disabled" };
  }

  if (settings.dataSourceId !== connection.dataSourceId || settings.statusPropertyId !== connection.statusProperty?.id) {
    return { action: "skip", reason: "scope_mismatch" };
  }

  const isArchivedOrTrashed =
    Boolean(page.archived) ||
    Boolean(page.in_trash) ||
    Boolean(page.is_archived);
  if (isArchivedOrTrashed) {
    return { action: "skip", reason: "archived_or_trashed" };
  }

  if (page.parent) {
    const parentType = page.parent.type;
    if (parentType && parentType !== "data_source_id") {
      return { action: "skip", reason: "different_data_source" };
    }
    const parentDataSourceId =
      page.parent.data_source_id ??
      (parentType === "data_source_id" ? page.parent.id : undefined);
    if (parentDataSourceId && parentDataSourceId !== connection.dataSourceId) {
      return { action: "skip", reason: "different_data_source" };
    }
  }

  const rawStatus = pickRawNotionProperty(page.properties ?? {}, connection.statusProperty) as
    | {
        select?: { id?: string; name?: string };
        status?: { id?: string; name?: string };
      }
    | undefined;

  const optionId = rawStatus?.status?.id ?? rawStatus?.select?.id ?? "";
  if (!optionId) {
    return { action: "skip", reason: "no_status_option" };
  }

  const targetEmoji = settings.emojiByOptionId[optionId];
  if (!targetEmoji) {
    return { action: "skip", optionId, reason: "unmapped_option" };
  }

  const currentEmoji = page.icon?.type === "emoji" ? page.icon.emoji : undefined;
  if (currentEmoji === targetEmoji) {
    return { action: "skip", currentEmoji, optionId, reason: "same_icon", targetEmoji };
  }

  return { action: "update", currentEmoji, optionId, targetEmoji };
}

// Global registry for page locks to prevent lock-split during HMR or duplicated modules
const globalRegistry = globalThis as unknown as {
  __ajamNotionPageLocks?: Map<string, Promise<unknown>>;
};
globalRegistry.__ajamNotionPageLocks ??= new Map<string, Promise<unknown>>();
const pageLocks = globalRegistry.__ajamNotionPageLocks;

export async function withPageLock<T>(pageId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = pageLocks.get(pageId) ?? Promise.resolve();
  let release: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  pageLocks.set(pageId, nextLock);

  try {
    await currentLock;
    return await fn();
  } finally {
    release();
    if (pageLocks.get(pageId) === nextLock) {
      pageLocks.delete(pageId);
    }
  }
}

export async function getNotionStatusIconSettings(userId: string): Promise<NotionStatusIconSettings | null> {
  await ensureNotionSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ statusIconMappingJson: string }>>(
    `SELECT "statusIconMappingJson" FROM "UserNotionConnection" WHERE "userId" = ? LIMIT 1`,
    userId
  );
  if (!rows[0] || !rows[0].statusIconMappingJson) {
    return null;
  }
  return parseStatusIconSettings(rows[0].statusIconMappingJson);
}

export async function saveNotionStatusIconSettings(params: {
  allowedOptionIds?: string[];
  settings: NotionStatusIconSettings;
  userId: string;
}): Promise<NotionStatusIconSettings> {
  await ensureNotionSchema();
  const connection = await getUserNotionConnection(params.userId);
  if (!connection || !connection.hasToken || !connection.dataSourceId || !connection.statusProperty?.id) {
    throw new Error("Notion 연결 또는 상태 속성이 설정되어 있지 않습니다.");
  }
  const validated = validateStatusIconSettings(params.settings);
  assertMatchingScope(validated, connection, params.allowedOptionIds);

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "UserNotionConnection"
     SET "statusIconMappingJson" = ?, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "userId" = ?`,
    JSON.stringify(validated),
    params.userId
  );
  if (updated === 0) {
    throw new Error("Notion 연결 정보를 찾을 수 없거나 갱신되지 않았습니다.");
  }
  return validated;
}
