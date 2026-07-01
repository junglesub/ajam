import { syncNotionCardsForDate } from "./notion-sync";
import { getUserNotionConnection } from "./notion-store";
import { syncNotionWorkHoursForPages } from "./notion-work-hours-sync";
import { listManagedUsers } from "./settings-store";

export type NotionDailyMaintenanceUserResult = {
  cardsSynced: number;
  cardsUpdated: number;
  error: string;
  skippedReason: string;
  userId: string;
  username: string;
};

export type NotionDailyMaintenanceResult = {
  cardsSynced: number;
  cardsUpdated: number;
  dateKey: string;
  errors: Array<{
    message: string;
    userId: string;
    username: string;
  }>;
  userResults: NotionDailyMaintenanceUserResult[];
  usersChecked: number;
  usersSkipped: number;
  usersUpdated: number;
  lookbackDays: number;
};

export async function runNotionDailyMaintenance(params: {
  dateKey: string;
  lookbackDays?: number;
}): Promise<NotionDailyMaintenanceResult> {
  const users = await listManagedUsers();
  const lookbackDays = normalizeLookbackDays(params.lookbackDays);
  const syncDateKeys = buildLookbackDateKeys(params.dateKey, lookbackDays);
  const lookbackStartDateKey = syncDateKeys[0] ?? params.dateKey;
  const userResults: NotionDailyMaintenanceUserResult[] = [];
  let cardsSynced = 0;
  let cardsUpdated = 0;
  let usersSkipped = 0;
  let usersUpdated = 0;

  for (const user of users) {
    const connection = await getUserNotionConnection(user.id);

    if (!connection?.hasToken || !connection.dataSourceId) {
      usersSkipped += 1;
      userResults.push({
        cardsSynced: 0,
        cardsUpdated: 0,
        error: "",
        skippedReason: "missing_connection",
        userId: user.id,
        username: user.username
      });
      continue;
    }

    try {
      const syncedCards: Awaited<ReturnType<typeof syncNotionCardsForDate>> = [];

      for (const dateKey of syncDateKeys) {
        syncedCards.push(...await syncNotionCardsForDate({
          dateKey,
          userId: user.id
        }));
      }

      const updatePageIds = Array.from(new Map(
        syncedCards
          .filter((card) => shouldUpdateCardDuringMaintenance({
            card,
            currentDateKey: params.dateKey,
            doneStatusValues: connection.doneStatusValues,
            lookbackStartDateKey
          }))
          .map((card) => [card.notionPageId, card.notionPageId])
      ).values());
      const syncResult = await syncNotionWorkHoursForPages({
        includeLastWorkedDate: false,
        notionPageIds: updatePageIds,
        userId: user.id
      });

      cardsSynced += syncedCards.length;
      cardsUpdated += syncResult.updated;

      if (syncResult.updated > 0) {
        usersUpdated += 1;
      }

      if (syncResult.skippedReason || syncResult.errors.length > 0) {
        usersSkipped += 1;
      }

      userResults.push({
        cardsSynced: syncedCards.length,
        cardsUpdated: syncResult.updated,
        error: syncResult.errors.map((error) => `${error.notionPageId}: ${error.message}`).join("\n"),
        skippedReason: syncResult.skippedReason ?? "",
        userId: user.id,
        username: user.username
      });
    } catch (error) {
      usersSkipped += 1;
      userResults.push({
        cardsSynced: 0,
        cardsUpdated: 0,
        error: error instanceof Error ? error.message : "Notion daily maintenance failed.",
        skippedReason: "",
        userId: user.id,
        username: user.username
      });
    }
  }

  return {
    cardsSynced,
    cardsUpdated,
    dateKey: params.dateKey,
    errors: userResults.flatMap((result) =>
      result.error
        ? [{
            message: result.error,
            userId: result.userId,
            username: result.username
          }]
        : []
    ),
    lookbackDays,
    userResults,
    usersChecked: users.length,
    usersSkipped,
    usersUpdated
  };
}

function shouldUpdateCardDuringMaintenance(params: {
  card: Awaited<ReturnType<typeof syncNotionCardsForDate>>[number];
  currentDateKey: string;
  doneStatusValues: string[];
  lookbackStartDateKey: string;
}): boolean {
  if (params.card.archived || params.card.stale) {
    return false;
  }

  const isDone = params.doneStatusValues.includes(params.card.status);

  if (!params.card.endDate) {
    return !isDone;
  }

  return params.card.endDate >= params.lookbackStartDateKey && params.card.endDate <= params.currentDateKey;
}

function buildLookbackDateKeys(dateKey: string, lookbackDays: number): string[] {
  return Array.from({ length: lookbackDays }, (_, index) => addDays(dateKey, index - (lookbackDays - 1)));
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));

  return date.toISOString().slice(0, 10);
}

function normalizeLookbackDays(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 2;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 31);
}
