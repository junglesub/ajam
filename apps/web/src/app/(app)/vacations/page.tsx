import { toBrowserDateKey } from "@timesheet/domain";
import type { Metadata } from "next";

import { VacationYearWorkspace } from "@/components/vacations/vacation-year-workspace";

import {
  deleteVacationDateAction,
  deleteVacationWorkDateAction,
  loadVacationYearAction,
  saveVacationAllowanceAction,
  saveVacationDateAction
} from "./actions";

export const metadata: Metadata = {
  title: "휴가"
};

export default async function VacationsPage() {
  const todayKey = toBrowserDateKey(new Date());
  const initialYear = Number(todayKey.slice(0, 4));
  const initialData = await loadVacationYearAction(initialYear);

  return (
    <VacationYearWorkspace
      deleteVacationDateAction={deleteVacationDateAction}
      deleteVacationWorkDateAction={deleteVacationWorkDateAction}
      initialData={initialData}
      initialTodayKey={todayKey}
      initialYear={initialYear}
      loadVacationYearAction={loadVacationYearAction}
      saveVacationAllowanceAction={saveVacationAllowanceAction}
      saveVacationDateAction={saveVacationDateAction}
    />
  );
}
