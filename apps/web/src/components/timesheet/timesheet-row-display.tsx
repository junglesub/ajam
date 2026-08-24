import { getDisplayContent, type TimesheetRow } from "@timesheet/domain";
import { AlertTriangle, Clock3 } from "lucide-react";

export function truncateContent(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 42) {
    return trimmed;
  }

  return `${trimmed.slice(0, 42)}...`;
}

export function draftPreviewText(row: TimesheetRow): string {
  return truncateContent(row.previewContent);
}

export function statusText(row: TimesheetRow): string {
  if (row.hasVacation && row.entries.every((entry) => entry.kind === "VACATION")) {
    return row.vacationName || "휴가";
  }

  if (row.status === "MISSING") {
    if (row.kind === "WORK" && row.project.trim() && !draftPreviewText(row)) {
      return "작성 예정";
    }

    return draftPreviewText(row) || "미기입";
  }

  return truncateContent(getDisplayContent(row)) || (row.kind === "WORK" ? "(내용 없음)" : "작성 예정");
}

export function calendarStatusText(row: TimesheetRow, isSelected: boolean): string {
  if (isSelected && row.status === "MISSING" && row.kind === "WORK" && !draftPreviewText(row)) {
    return "작성 예정";
  }

  return statusText(row);
}

export function hasTimeMismatch(row: TimesheetRow): boolean {
  return row.entryCount > 0 && row.status !== "MISSING" && row.status !== "HOLIDAY" && Math.abs(row.hours - 8) > 0.001;
}

export function TimeMismatchIcon({ hours }: { hours: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-orange-600"
      title={`총 시간이 8시간이 아닙니다. 현재 ${hours}h입니다.`}
    >
      <Clock3 aria-label="총 시간 경고" className="size-3.5" />
    </span>
  );
}

export function NotionCardWarningIcon() {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-amber-500"
      title="Notion 카드가 없거나 배분 시간이 업무 시간과 맞지 않습니다."
    >
      <AlertTriangle aria-label="Notion 카드 경고" className="size-3.5" />
    </span>
  );
}