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
};

export async function runNotionDailyMaintenance(params: {
  dateKey: string;
}): Promise<NotionDailyMaintenanceResult> {
  const users = await listManagedUsers();
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
      const cards = await syncNotionCardsForDate({
        dateKey: params.dateKey,
        userId: user.id
      });
      const activePageIds = cards
        .filter((card) =>
          !card.archived &&
          !card.stale &&
          !card.endDate &&
          !connection.doneStatusValues.includes(card.status)
        )
        .map((card) => card.notionPageId);
      const syncResult = await syncNotionWorkHoursForPages({
        includeLastWorkedDate: false,
        notionPageIds: activePageIds,
        userId: user.id
      });

      cardsSynced += cards.length;
      cardsUpdated += syncResult.updated;

      if (syncResult.updated > 0) {
        usersUpdated += 1;
      }

      if (syncResult.skippedReason || syncResult.errors.length > 0) {
        usersSkipped += 1;
      }

      userResults.push({
        cardsSynced: cards.length,
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
    userResults,
    usersChecked: users.length,
    usersSkipped,
    usersUpdated
  };
}
