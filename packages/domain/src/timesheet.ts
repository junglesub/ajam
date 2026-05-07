import type { TimesheetStatus, WorkRecordKind } from "./status";

export type TimesheetDraft = {
  aiTranslation: string;
  content: string;
  dateKey: string;
  holidayName: string;
  hours: number;
  kind: WorkRecordKind;
  project: string;
  shortVersion: string;
  vacationName: string;
};

export type TimesheetRow = TimesheetDraft & {
  status: TimesheetStatus;
};

export function createEmptyDraft(dateKey: string): TimesheetDraft {
  return {
    aiTranslation: "",
    content: "",
    dateKey,
    holidayName: "",
    hours: 8,
    kind: "WORK",
    project: "",
    shortVersion: "",
    vacationName: ""
  };
}

export function getDisplayContent(row: TimesheetRow): string {
  if (row.status === "HOLIDAY") {
    return row.holidayName || "공휴일";
  }

  if (row.status === "VACATION") {
    return row.vacationName || "휴가";
  }

  if (row.status === "MISSING") {
    return "미기입";
  }

  if (row.status === "FUTURE") {
    return "작성 예정";
  }

  return row.shortVersion || row.content;
}
