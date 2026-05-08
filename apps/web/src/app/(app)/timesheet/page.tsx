import { getAppSetting, getManagedUser, listManagedUsers } from "@timesheet/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TimesheetWorkspace } from "@/components/timesheet/timesheet-workspace";
import { destroySession, getSession } from "@/server/session";

import {
  addProjectAction,
  createUserAction,
  deleteTimesheetEntryAction,
  findPreviousProjectAction,
  loadTimesheetMonthAction,
  logoutAction,
  resetAllHolidayCacheAction,
  resetHolidayCacheAction,
  saveHolidayApiKeyAction,
  saveTimesheetEntryAction,
  testHolidayApiKeyAction,
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
  const [initialMonthData, holidayApiKey, managedUsers] = await Promise.all([
    loadTimesheetMonthAction(today.getFullYear(), today.getMonth()),
    currentUser.role === "ADMIN" ? getAppSetting("data_go_kr_service_key") : Promise.resolve(null),
    currentUser.role === "ADMIN" ? listManagedUsers() : Promise.resolve([])
  ]);

  return (
    <TimesheetWorkspace
      addProjectAction={addProjectAction}
      createUserAction={createUserAction}
      currentUser={currentUser}
      deleteEntryAction={deleteTimesheetEntryAction}
      findPreviousProjectAction={findPreviousProjectAction}
      initialHolidayApiKey={holidayApiKey ?? ""}
      initialManagedUsers={managedUsers}
      initialMonthData={initialMonthData}
      loadMonthAction={loadTimesheetMonthAction}
      logoutAction={logoutAction}
      resetAllHolidayCacheAction={resetAllHolidayCacheAction}
      resetHolidayCacheAction={resetHolidayCacheAction}
      saveEntryAction={saveTimesheetEntryAction}
      saveHolidayApiKeyAction={saveHolidayApiKeyAction}
      testHolidayApiKeyAction={testHolidayApiKeyAction}
      updateProfileAction={updateProfileAction}
    />
  );
}
