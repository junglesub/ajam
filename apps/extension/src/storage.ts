export type StoredConnection = {
  accessToken: string;
  accessTokenExpiresAt: string;
  baseUrl: string;
  connectedUsername: string;
  refreshToken: string;
  scopes: string[];
};

export type PendingConnection = {
  approvalTabId?: number;
  baseUrl: string;
  startedAt: string;
};

export type StoredSettings = {
  categoryDisabledByKey: Record<string, string[]>;
  categoryOrderByKey: Record<string, string[]>;
  connection?: StoredConnection;
  lastMonth: string;
  pendingConnection?: PendingConnection;
  zoomOutBeforeMacro: boolean;
};

type StoredSettingsRecord = {
  categoryDisabledByKey?: unknown;
  categoryOrderByKey?: unknown;
  connection?: unknown;
  lastMonth?: unknown;
  pendingConnection?: unknown;
  zoomOutBeforeMacro?: unknown;
};

function getCurrentMonth(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function createDefaultSettings(): StoredSettings {
  return {
    categoryDisabledByKey: {},
    categoryOrderByKey: {},
    lastMonth: getCurrentMonth(),
    zoomOutBeforeMacro: false
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCategoryOrderByKey(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isStringArray);
}

function isStoredConnection(value: unknown): value is StoredConnection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<StoredConnection>;

  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.accessTokenExpiresAt === "string" &&
    typeof candidate.baseUrl === "string" &&
    typeof candidate.connectedUsername === "string" &&
    typeof candidate.refreshToken === "string" &&
    isStringArray(candidate.scopes)
  );
}

function isPendingConnection(value: unknown): value is PendingConnection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<PendingConnection>;

  return (
    typeof candidate.baseUrl === "string" &&
    candidate.baseUrl.trim().length > 0 &&
    typeof candidate.startedAt === "string" &&
    (candidate.approvalTabId === undefined || typeof candidate.approvalTabId === "number")
  );
}

export async function getSettings(): Promise<StoredSettings> {
  const defaults = createDefaultSettings();
  const stored = (await chrome.storage.local.get({ ...defaults, connection: null, pendingConnection: null })) as StoredSettingsRecord;
  const settings: StoredSettings = {
    categoryDisabledByKey: isCategoryOrderByKey(stored.categoryDisabledByKey)
      ? stored.categoryDisabledByKey
      : defaults.categoryDisabledByKey,
    categoryOrderByKey: isCategoryOrderByKey(stored.categoryOrderByKey) ? stored.categoryOrderByKey : defaults.categoryOrderByKey,
    lastMonth: typeof stored.lastMonth === "string" && stored.lastMonth ? stored.lastMonth : defaults.lastMonth,
    zoomOutBeforeMacro: typeof stored.zoomOutBeforeMacro === "boolean" ? stored.zoomOutBeforeMacro : defaults.zoomOutBeforeMacro
  };

  if (isStoredConnection(stored.connection)) {
    settings.connection = stored.connection;
  }

  if (isPendingConnection(stored.pendingConnection)) {
    settings.pendingConnection = stored.pendingConnection;
  }

  return settings;
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({
    categoryDisabledByKey: settings.categoryDisabledByKey,
    categoryOrderByKey: settings.categoryOrderByKey,
    connection: settings.connection ?? null,
    lastMonth: settings.lastMonth,
    pendingConnection: settings.pendingConnection ?? null,
    zoomOutBeforeMacro: settings.zoomOutBeforeMacro
  });
}
