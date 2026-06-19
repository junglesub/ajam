import type { TimesheetStatus, WorkRecordKind } from "./status";

export type TimesheetEntryNotionCardDraft = {
  allocatedHours: number;
  allocationMode: "auto" | "manual";
  category?: string;
  endDate?: string;
  notionPageId: string;
  source: "manual" | "previous_business_day_default" | "weekday_default";
  startDate?: string;
  status?: string;
  title?: string;
};

export type TimesheetEntryDraft = {
  aiTranslation: string;
  clientId: string;
  content: string;
  holidayName: string;
  hours: number;
  hoursTouched?: boolean;
  id: string;
  kind: WorkRecordKind;
  notionCards: TimesheetEntryNotionCardDraft[];
  project: string;
  sortOrder: number;
  vacationName: string;
};

export type TimesheetDayDraft = {
  dateKey: string;
  entries: TimesheetEntryDraft[];
  holidayName: string;
  shortVersion: string;
};

export type TimesheetRow = TimesheetDayDraft & {
  aiTranslation: string;
  content: string;
  entryCount: number;
  hasNotionCardWarning: boolean;
  hasVacation: boolean;
  hasUnlinkedNotionWork: boolean;
  hours: number;
  kind: WorkRecordKind;
  previewContent: string;
  project: string;
  projectCount: number;
  status: TimesheetStatus;
  vacationName: string;
};

export function createEmptyEntryDraft(sortOrder = 0): TimesheetEntryDraft {
  return {
    aiTranslation: "",
    clientId: "",
    content: "",
    holidayName: "",
    hours: 8,
    hoursTouched: false,
    id: "",
    kind: "WORK",
    notionCards: [],
    project: "",
    sortOrder,
    vacationName: ""
  };
}

export function createEmptyDraft(dateKey: string): TimesheetDayDraft {
  return {
    dateKey,
    entries: [],
    holidayName: "",
    shortVersion: ""
  };
}

export function getDisplayContent(row: TimesheetRow): string {
  if (row.status === "HOLIDAY") {
    return row.holidayName || "공휴일";
  }

  if (row.status === "MISSING") {
    return "미기입";
  }

  if (row.status === "FUTURE") {
    return "작성 예정";
  }

  return row.previewContent;
}
