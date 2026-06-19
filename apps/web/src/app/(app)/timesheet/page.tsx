import { getAppSetting, getManagedUser, getUserAiSetting, getUserNotionConnection, listManagedUsers, listUserNotionWeeklyDefaultCards } from "@timesheet/db";
import { toBrowserDateKey } from "@timesheet/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TimesheetWorkspace } from "@/components/timesheet/timesheet-workspace";
import { destroySession, getSession } from "@/server/session";

import {
  addProjectAction,
  createUserAction,
  deleteTimesheetEntryAction,
  findPreviousOpenNotionCardsAction,
  findPreviousProjectAction,
  loadNotionCardCandidatesAction,
  loadTimesheetMonthAction,
  refreshNotionCardCandidatesAction,
  resetAllHolidayCacheAction,
  resetHolidayCacheAction,
  runTimesheetAiCleanupAction,
  saveHolidayApiKeyAction,
  saveTimesheetEntryAction,
  testHolidayApiKeyAction,
  testGeminiApiKeyAction,
  updateUserAiSettingAction,
  updateProfileAction
} from "./actions";

export const metadata: Metadata = {
  title: "월간 업무 기록"
};

export default async function TimesheetPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const currentUser = await getManagedUser(session.userId);

  if (!currentUser) {
    await destroySession();
    redirect("/login");
  }

  const today = new Date();
  const initialTodayKey = toBrowserDateKey(today);
  const [initialMonthData, holidayApiKey, managedUsers, aiSetting, notionConnection, notionWeeklyDefaults] = await Promise.all([
    loadTimesheetMonthAction(today.getFullYear(), today.getMonth()),
    currentUser.role === "ADMIN" ? getAppSetting("data_go_kr_service_key") : Promise.resolve(null),
    currentUser.role === "ADMIN" ? listManagedUsers() : Promise.resolve([]),
    getUserAiSetting(currentUser.id),
    getUserNotionConnection(currentUser.id),
    listUserNotionWeeklyDefaultCards(currentUser.id)
  ]);

  return (
    <TimesheetWorkspace
      addProjectAction={addProjectAction}
      createUserAction={createUserAction}
      currentUser={currentUser}
      deleteEntryAction={deleteTimesheetEntryAction}
      findPreviousNotionCardsAction={findPreviousOpenNotionCardsAction}
      findPreviousProjectAction={findPreviousProjectAction}
      initialHolidayApiKey={holidayApiKey ?? ""}
      initialManagedUsers={managedUsers}
      initialMonthIndex={today.getMonth()}
      initialMonthData={initialMonthData}
      initialNotionDoneStatusValues={notionConnection?.doneStatusValues ?? []}
      initialNotionWeeklyDefaults={notionWeeklyDefaults}
      initialTodayKey={initialTodayKey}
      initialYear={today.getFullYear()}
      loadMonthAction={loadTimesheetMonthAction}
      loadNotionCardCandidatesAction={loadNotionCardCandidatesAction}
      refreshNotionCardCandidatesAction={refreshNotionCardCandidatesAction}
      resetAllHolidayCacheAction={resetAllHolidayCacheAction}
      resetHolidayCacheAction={resetHolidayCacheAction}
      runAiCleanupAction={runTimesheetAiCleanupAction}
      saveEntryAction={saveTimesheetEntryAction}
      saveHolidayApiKeyAction={saveHolidayApiKeyAction}
      initialAiSetting={aiSetting}
      testHolidayApiKeyAction={testHolidayApiKeyAction}
      testGeminiApiKeyAction={testGeminiApiKeyAction}
      updateAiSettingAction={updateUserAiSettingAction}
      updateProfileAction={updateProfileAction}
    />
  );
}
