"use client";

import { formatKoreanDate, type VacationStatus } from "@timesheet/domain";
import { Button, Input, cn } from "@timesheet/ui";
import { Field, ModalShell, ProgressBar, ShortcutHint } from "./timesheet-ui-primitives";

type VacationSaveActionItem = {
  label: string;
  status: VacationStatus;
  variant: "primary" | "secondary" | "ghost";
};

export function VacationRangeModal({
  canEditStart,
  conflictCount,
  error,
  fallbackStatus,
  message,
  onApply,
  onClose,
  onEndChange,
  onHoursChange,
  onNameChange,
  onStartChange,
  primaryAction,
  progress,
  rangeEnd,
  rangeHours,
  rangeName,
  rangeStart,
  saving,
  secondaryActions,
  showError
}: {
  canEditStart: boolean;
  conflictCount: number;
  error: string;
  fallbackStatus: VacationStatus;
  message: string;
  onApply: (confirmReplace: boolean, status: VacationStatus) => void;
  onClose: () => void;
  onEndChange: (value: string) => void;
  onHoursChange: (value: number) => void;
  onNameChange: (value: string) => void;
  onStartChange: (value: string) => void;
  primaryAction?: VacationSaveActionItem;
  progress: { completed: number; total: number };
  rangeEnd: string;
  rangeHours: number;
  rangeName: string;
  rangeStart: string;
  saving: boolean;
  secondaryActions: VacationSaveActionItem[];
  showError: boolean;
}) {
  return (
    <ModalShell
      onClose={onClose}
      onConfirm={() => onApply(conflictCount > 0, primaryAction?.status ?? fallbackStatus)}
      title="휴가 기간 설정"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {canEditStart ? (
            <Field label="시작날짜">
              <Input disabled={saving} onChange={(event) => onStartChange(event.target.value)} type="date" value={rangeStart} />
            </Field>
          ) : (
            <Field label="시작날짜">
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                {formatKoreanDate(rangeStart)}
              </div>
            </Field>
          )}
          <Field label="끝날짜">
            <Input disabled={saving} min={rangeStart} onChange={(event) => onEndChange(event.target.value)} type="date" value={rangeEnd} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <Field label="휴가 유형">
            <Input disabled={saving} onChange={(event) => onNameChange(event.target.value)} placeholder="예: 연차, 오전 반차" value={rangeName} />
          </Field>
          <Field label="휴가 시간">
            <Input disabled={saving} max={24} min={0} onChange={(event) => onHoursChange(Number(event.target.value))} step={0.5} type="number" value={rangeHours} />
          </Field>
        </div>
        {conflictCount > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-900">
            기존 기록이 있는 {conflictCount}일이 휴가로 교체됩니다. 공휴일은 교체하지 않습니다.
          </div>
        ) : null}
        {progress.total > 0 ? (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>저장 진행</span>
              <span>{progress.completed}/{progress.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-slate-950 transition-all"
                style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
        {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
        {showError ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          {secondaryActions.map((action) => (
            <Button
              className={cn(action.variant === "ghost" && "px-2")}
              disabled={saving}
              key={action.status}
              onClick={() => onApply(conflictCount > 0, action.status)}
              type="button"
              variant={action.variant}
            >
              {action.label}
            </Button>
          ))}
          {primaryAction ? (
            <Button disabled={saving} onClick={() => onApply(conflictCount > 0, primaryAction.status)} type="button">
              {saving ? "저장 중" : conflictCount > 0 ? `교체하고 ${primaryAction.label}` : primaryAction.label}
              <ShortcutHint keys={["↵"]} />
            </Button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

export function ConnectedVacationDeleteModal({
  dateCount,
  endDateKey,
  onCancel,
  onDeleteAll,
  onDeleteCurrentDate,
  progress,
  saving,
  startDateKey
}: {
  dateCount: number;
  endDateKey: string;
  onCancel: () => void;
  onDeleteAll: () => void;
  onDeleteCurrentDate: () => void;
  progress: { completed: number; total: number };
  saving: boolean;
  startDateKey: string;
}) {
  return (
    <ModalShell onClose={onCancel} onConfirm={onDeleteAll} title="연결된 휴가 삭제">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          붙어있는 휴가 {dateCount}일이 있습니다. 연결된 휴가를 함께 삭제할까요?
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          {formatKoreanDate(startDateKey)} - {formatKoreanDate(endDateKey)}
        </div>
        <ProgressBar label="삭제 진행" progress={progress} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button disabled={saving} onClick={onDeleteCurrentDate} type="button" variant="secondary">
            현재 날짜만 삭제
          </Button>
          <Button disabled={saving} onClick={onDeleteAll} type="button" variant="danger">
            {saving ? "삭제 중" : "함께 삭제"}
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ConnectedVacationSaveModal({
  actionLabel,
  dateCount,
  endDateKey,
  onCancel,
  onSaveAll,
  onSaveCurrentDate,
  progress,
  saving,
  startDateKey
}: {
  actionLabel: string;
  dateCount: number;
  endDateKey: string;
  onCancel: () => void;
  onSaveAll: () => void;
  onSaveCurrentDate: () => void;
  progress: { completed: number; total: number };
  saving: boolean;
  startDateKey: string;
}) {
  return (
    <ModalShell onClose={onCancel} onConfirm={onSaveAll} title="연결된 휴가 수정">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          붙어있는 휴가 {dateCount}일이 있습니다. 현재 휴가 유형과 상태를 연결된 휴가에 함께 적용할까요? 각 날짜의 휴가 시간은 유지됩니다.
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          {formatKoreanDate(startDateKey)} - {formatKoreanDate(endDateKey)}
        </div>
        <ProgressBar label="저장 진행" progress={progress} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button disabled={saving} onClick={onSaveCurrentDate} type="button" variant="secondary">
            현재 날짜만 {actionLabel}
          </Button>
          <Button disabled={saving} onClick={onSaveAll} type="button">
            {saving ? "저장 중" : `함께 ${actionLabel}`}
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
