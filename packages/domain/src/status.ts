export type TimesheetStatus = "HOLIDAY" | "VACATION" | "COMPLETED" | "MISSING" | "FUTURE";

export type WorkRecordKind = "WORK" | "VACATION" | "HOLIDAY";
export type VacationStatus = "CONFIRMED" | "TEMPORARY";

export const statusLabel: Record<TimesheetStatus, string> = {
  COMPLETED: "완료",
  FUTURE: "미래",
  HOLIDAY: "공휴일",
  MISSING: "입력안됨",
  VACATION: "휴가"
};

export const statusTone: Record<TimesheetStatus, string> = {
  COMPLETED: "green",
  FUTURE: "gray",
  HOLIDAY: "orange",
  MISSING: "white",
  VACATION: "blue"
};

export function resolveStatus(params: {
  dateKey: string;
  todayKey: string;
  kind?: WorkRecordKind;
  hasContent?: boolean;
}): TimesheetStatus {
  if (params.kind === "HOLIDAY") {
    return "HOLIDAY";
  }

  if (params.kind === "VACATION") {
    return "VACATION";
  }

  if (params.dateKey > params.todayKey) {
    return "FUTURE";
  }

  return params.hasContent ? "COMPLETED" : "MISSING";
}
