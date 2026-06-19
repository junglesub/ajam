import type {
  NotionCardCacheRecord,
  NotionDataSourceSchema,
  NotionPropertyDescriptor,
  UserNotionWeeklyDefaultCard,
  UserNotionConnection
} from "@timesheet/db";
import type { NotionCategorySummary } from "@timesheet/domain";

export type NotionSchemaProperty = NotionDataSourceSchema["properties"][string];

export type NotionCardWorkspaceProps = {
  buildMonthlyAnalysisAction: (month: string) => Promise<NotionMonthlyAnalysis>;
  initialConnection: UserNotionConnection | null;
  initialMonth: string;
  initialWeeklyDefaults: UserNotionWeeklyDefaultCard[];
  listCardsForMonthAction: (month: string) => Promise<NotionCardCacheRecord[]>;
  saveConnectionAction: (params: {
    accessToken?: string;
    clearToken?: boolean;
    connection: Omit<UserNotionConnection, "hasToken" | "lastSyncError" | "lastSyncedAt">;
  }) => Promise<UserNotionConnection>;
  saveWeeklyDefaultsAction: (cards: Array<{
    allocatedHours: number;
    enabled: boolean;
    notionPageId: string;
    weekday: number;
  }>) => Promise<UserNotionWeeklyDefaultCard[]>;
  syncCardFieldsAction: (notionPageIds: string[]) => Promise<NotionFieldSyncResult>;
  syncDateCandidatesAction: (dateKey: string) => Promise<NotionDateCandidatesSyncResult>;
  testDataSourceAction: (params: {
    dataSourceId: string;
    token?: string;
  }) => Promise<{ id: string; name: string; properties: Record<string, NotionSchemaProperty> }>;
};

export type { UserNotionWeeklyDefaultCard };

export type NotionFieldSyncResult = {
  errors: Array<{
    message: string;
    notionPageId: string;
  }>;
  failed: number;
  updated: number;
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

export type NotionAnalysisCard = NotionCardCacheRecord & {
  availableHours?: {
    availableDays: number;
    availableHours: number;
    unavailableReason?: "missing_start_date";
  };
  estimate?: {
    dayEquivalent: number;
    estimatedHours: number;
    fallbackDateCount: number;
    totalBusinessDays: number;
    unavailableReason?: "missing_start_date" | "done_without_end_date";
  };
  linkedHours?: number;
  workDayCount?: number;
};

export type NotionMonthlyAnalysis = {
  cards: NotionAnalysisCard[];
  categorySummary: NotionCategorySummary[];
};

export type NotionConnectionPanelProps = {
  connection: UserNotionConnection | null;
  onConnectionSaved: (connection: UserNotionConnection) => void;
  onMessage: (message: string) => void;
  saveConnectionAction: NotionCardWorkspaceProps["saveConnectionAction"];
  testDataSourceAction: NotionCardWorkspaceProps["testDataSourceAction"];
};

export type NotionCardTableProps = {
  cards: NotionAnalysisCard[];
};

export function toPropertyDescriptor(
  property: NotionSchemaProperty | undefined,
  fallbackName = ""
): NotionPropertyDescriptor | null {
  if (!property && !fallbackName) {
    return null;
  }

  return {
    id: property?.id ?? fallbackName,
    name: property?.name ?? fallbackName,
    type: property?.type ?? ""
  };
}
