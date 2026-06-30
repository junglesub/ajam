"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@timesheet/ui";

import type { VacationWorkDay } from "./types";

type VacationWorkRecordModalProps = {
  deleting: boolean;
  error: string;
  onClose: () => void;
  onDeleteWork: () => void;
  workDay: VacationWorkDay;
};

function getPreviewContent(content: string): string {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine || "내용 없음";
}

export function VacationWorkRecordModal({
  deleting,
  error,
  onClose,
  onDeleteWork,
  workDay
}: VacationWorkRecordModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="text-lg font-bold text-slate-950">업무 기록 확인</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{workDay.dateKey}</p>
        <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
          {workDay.records.map((record, index) => (
            <div className="grid gap-1 px-3 py-2 text-sm" key={`${record.project}-${index}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-bold text-slate-900">{record.project || "프로젝트 없음"}</span>
                <span className="shrink-0 font-black text-slate-700">{record.hours}h</span>
              </div>
              <p className="truncate text-xs font-semibold text-slate-500">{getPreviewContent(record.content)}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          업무 기록이 있는 날짜에는 먼저 업무 기록을 삭제해야 휴가를 추가할 수 있습니다.
        </p>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button disabled={deleting} onClick={onClose} type="button" variant="secondary">
            닫기
          </Button>
          <Button disabled={deleting} onClick={onDeleteWork} type="button" variant="danger">
            업무 기록 삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
