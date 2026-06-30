"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Badge, Button, Input, Label, cn } from "@timesheet/ui";
import type { VacationStatus } from "@timesheet/domain";

export type VacationEditDraft = {
  dateKey: string;
  hours: number;
  matchName?: string;
  matchStatus?: VacationStatus;
  name: string;
  status: VacationStatus;
};

export type VacationEditOption = {
  hours: number;
  label: string;
  name: string;
  status: VacationStatus;
};

type VacationEditModalProps = {
  draft: VacationEditDraft;
  error: string;
  mode: "create" | "edit";
  onClose: () => void;
  onDelete: () => void;
  onDraftChange: (draft: VacationEditDraft) => void;
  onSave: (status: VacationStatus) => void;
  saving: boolean;
  vacationOptions?: VacationEditOption[];
};

type SaveAction = {
  label: string;
  status: VacationStatus;
  variant: "primary" | "secondary" | "ghost";
};

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function getSaveActions(mode: "create" | "edit", status: VacationStatus): SaveAction[] {
  if (mode === "create") {
    return [
      { label: "저장", status: "CONFIRMED", variant: "primary" },
      { label: "임시저장", status: "TEMPORARY", variant: "secondary" }
    ];
  }

  if (status === "TEMPORARY") {
    return [
      { label: "임시저장", status: "TEMPORARY", variant: "primary" },
      { label: "등록", status: "CONFIRMED", variant: "secondary" }
    ];
  }

  return [
    { label: "저장", status: "CONFIRMED", variant: "primary" },
    { label: "임시로 변경", status: "TEMPORARY", variant: "ghost" }
  ];
}

export function VacationEditModal({
  draft,
  error,
  mode,
  onClose,
  onDelete,
  onDraftChange,
  onSave,
  saving,
  vacationOptions = []
}: VacationEditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveActions = getSaveActions(mode, draft.status);
  const primarySaveAction = saveActions.find((action) => action.variant === "primary");
  const secondarySaveActions = saveActions.filter((action) => action.variant !== "primary");

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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-950">{mode === "edit" ? "휴가 수정" : "휴가 입력"}</h2>
          {draft.status === "TEMPORARY" ? <Badge tone="blue">임시</Badge> : null}
        </div>
        <div className="mt-4 space-y-4">
          <Field label="날짜">
            <Input className="cursor-default bg-slate-50" readOnly type="date" value={draft.dateKey} />
          </Field>
          {mode === "edit" && vacationOptions.length > 1 ? (
            <Field label="수정할 휴가">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
                disabled={saving}
                onChange={(event) => {
                  const option = vacationOptions[Number(event.target.value)];

                  if (option) {
                    onDraftChange({ ...draft, hours: option.hours, matchName: option.name, matchStatus: option.status, name: option.name, status: option.status });
                  }
                }}
                value={Math.max(
                  vacationOptions.findIndex((option) => option.status === (draft.matchStatus ?? draft.status) && option.name === (draft.matchName ?? draft.name)),
                  0
                )}
              >
                {vacationOptions.map((option, index) => (
                  <option key={`${option.status}-${option.name}-${option.hours}-${index}`} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="휴가 유형">
              <Input disabled={saving} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="휴가" value={draft.name} />
            </Field>
            <Field label="휴가 시간">
              <Input disabled={saving} max={24} min={0} onChange={(event) => onDraftChange({ ...draft, hours: Number(event.target.value) })} step={0.5} type="number" value={draft.hours} />
            </Field>
          </div>
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div>
              {mode === "edit" ? (
                <button
                  className="text-sm font-semibold text-red-600 underline-offset-4 transition hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-red-300"
                  disabled={saving}
                  onClick={onDelete}
                  type="button"
                >
                  삭제
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
                취소
              </Button>
              {secondarySaveActions.map((action) => (
                <Button
                  className={cn(action.variant === "ghost" && "px-2")}
                  disabled={saving}
                  key={action.status}
                  onClick={() => onSave(action.status)}
                  type="button"
                  variant={action.variant}
                >
                  {action.label}
                </Button>
              ))}
              {primarySaveAction ? (
                <Button disabled={saving} onClick={() => onSave(primarySaveAction.status)} type="button" variant="primary">
                  {primarySaveAction.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
