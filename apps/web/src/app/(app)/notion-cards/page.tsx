import type { Metadata } from "next";

import { NotionCardWorkspace } from "@/components/notion-cards/notion-card-workspace";

import {
  buildNotionMonthlyAnalysisAction,
  getNotionConnectionAction,
  getNotionIconBulkStatusAction,
  getNotionStatusIconSettingsAction,
  getNotionWebhookSettingsAction,
  listNotionCardsForMonthAction,
  listNotionWeeklyDefaultsAction,
  resetNotionWebhookSettingsAction,
  revealNotionWebhookVerificationTokenAction,
  saveNotionConnectionAction,
  saveNotionStatusIconSettingsAction,
  saveNotionWebhookVerificationTokenAction,
  saveNotionWeeklyDefaultsAction,
  startNotionIconBulkAction,
  syncNotionCardFieldsAction,
  syncNotionDateCandidatesAction,
  testNotionDataSourceAction
} from "./actions";

export const metadata: Metadata = {
  title: "Notion 카드"
};

export default async function NotionCardsPage() {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [connection, weeklyDefaults] = await Promise.all([
    getNotionConnectionAction(),
    listNotionWeeklyDefaultsAction()
  ]);

  return (
    <NotionCardWorkspace
      buildMonthlyAnalysisAction={buildNotionMonthlyAnalysisAction}
      getIconBulkStatusAction={getNotionIconBulkStatusAction}
      getStatusIconSettingsAction={getNotionStatusIconSettingsAction}
      initialConnection={connection}
      initialMonth={month}
      initialWeeklyDefaults={weeklyDefaults}
      listCardsForMonthAction={listNotionCardsForMonthAction}
      loadWebhookSettingsAction={getNotionWebhookSettingsAction}
      resetWebhookSettingsAction={resetNotionWebhookSettingsAction}
      revealWebhookVerificationTokenAction={revealNotionWebhookVerificationTokenAction}
      saveConnectionAction={saveNotionConnectionAction}
      saveStatusIconSettingsAction={saveNotionStatusIconSettingsAction}
      saveWebhookVerificationTokenAction={saveNotionWebhookVerificationTokenAction}
      saveWeeklyDefaultsAction={saveNotionWeeklyDefaultsAction}
      startIconBulkAction={startNotionIconBulkAction}
      syncCardFieldsAction={syncNotionCardFieldsAction}
      syncDateCandidatesAction={syncNotionDateCandidatesAction}
      testDataSourceAction={testNotionDataSourceAction}
    />
  );
}
