"use client";

import { Button } from "@timesheet/ui";

import type { NotionFieldUpdatePrompt } from "./types";

type NotionFieldUpdateModalProps = {
  error: string;
  isUpdating: boolean;
  onClose: () => void;
  onConfirm: () => void;
  prompt: NotionFieldUpdatePrompt | null;
};

export function NotionFieldUpdateModal({
  error,
  isUpdating,
  onClose,
  onConfirm,
  prompt
}: NotionFieldUpdateModalProps) {
  if (!prompt) {
    return null;
  }

  function closeIfIdle() {
    if (!isUpdating) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeIfIdle();
        }
      }}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20"
        role="dialog"
      >
        <h2 className="text-lg font-bold text-slate-950">Notion 필드 업데이트</h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            동기화한 열린 카드 {prompt.affectedCardCount}개의 숫자 필드를 업데이트할까요?
          </p>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
            업데이트 필드: {prompt.fieldLabels.join(", ")}
          </div>
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button disabled={isUpdating} onClick={onClose} type="button" variant="secondary">
              건너뛰기
            </Button>
            <Button disabled={isUpdating} onClick={onConfirm} type="button">
              {isUpdating ? "업데이트 중" : "업데이트"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
