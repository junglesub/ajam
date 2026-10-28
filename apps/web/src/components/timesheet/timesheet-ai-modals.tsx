"use client";

import { formatKoreanDate } from "@timesheet/domain";
import { Badge, Button } from "@timesheet/ui";
import { truncateContent } from "./timesheet-row-display";
import { ModalShell, ShortcutHint } from "./timesheet-ui-primitives";

type AiRewriteRequestItem = {
  cleanupType: "fill_missing" | "rewrite";
  dateKey: string;
  entryCount: number;
  previewContent: string;
  shortVersion: string;
};

export function AiRewriteQueueModal({
  cleanupMode,
  onClose,
  requests
}: {
  cleanupMode: "immediate" | "manual" | "scheduled";
  onClose: () => void;
  requests: AiRewriteRequestItem[];
}) {
  return (
    <ModalShell onClose={onClose} onConfirm={onClose} title="AI 예약 정리 대기 목록">
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium leading-6 text-slate-600">
          {cleanupMode === "scheduled"
            ? "아래 날짜는 n8n 예약 정리 때 빈 AI 필드를 채우거나, 덮어쓰기 예약이 있으면 기존 값을 다시 작성합니다."
            : "대기 목록은 보존되어 있지만, AI 정리 방식이 예약이 아니면 n8n 예약 정리에서 처리되지 않습니다."}
        </div>
        {requests.length > 0 ? (
          <div className="max-h-[420px] overflow-y-auto rounded-md border border-slate-200">
            {requests.map((request) => (
              <div className="border-b border-slate-100 px-3 py-3 last:border-b-0" key={request.dateKey}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{formatKoreanDate(request.dateKey)}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      WORK {request.entryCount}개 · {request.cleanupType === "rewrite" ? "기존 AI 필드 덮어쓰기 예약" : "빈 AI 필드 채우기 대기"}
                    </p>
                  </div>
                  <Badge tone={cleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "orange" : "blue" : "gray"}>
                    {cleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "덮어쓰기" : "채우기" : "보류"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {request.shortVersion.trim() || truncateContent(request.previewContent) || "(내용 없음)"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm font-semibold text-slate-500">
            대기중인 AI 예약 정리가 없습니다.
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button">
            확인
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export function AiRewritePromptModal({
  dateKey,
  onCancel,
  onSaveOnly,
  onSaveWithAi,
  scheduled
}: {
  dateKey: string;
  onCancel: () => void;
  onSaveOnly: () => void;
  onSaveWithAi: () => void;
  scheduled: boolean;
}) {
  return (
    <ModalShell onClose={onCancel} onConfirm={onSaveWithAi} title="AI 번역/요약 업데이트">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          {formatKoreanDate(dateKey)}의 내용이 변경되었고 기존 영문 번역본 또는 짧은 버전이 있습니다. {scheduled ? "저장 후 이 날짜를 n8n 예약 정리의 덮어쓰기 대상으로 표시할까요?" : "저장 후 AI가 현재 날짜의 번역본과 요약을 새 내용 기준으로 다시 작성할까요?"}
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          {scheduled
            ? "예약 정리는 기본적으로 빈 AI 필드만 채우고, 덮어쓰기는 이 날짜에만 한 번 예약됩니다."
            : "이전 날짜 보정은 기존처럼 비어 있는 AI 필드만 채우고, 덮어쓰기는 현재 날짜에만 적용됩니다."}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onCancel} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button onClick={onSaveOnly} type="button" variant="secondary">
            저장만
          </Button>
          <Button onClick={onSaveWithAi} type="button">
            AI도 업데이트
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export function AiOverwritePromptModal({
  isSummary,
  onDisable,
  onKeep,
  onRevert
}: {
  isSummary: boolean;
  onDisable: () => void;
  onKeep: () => void;
  onRevert: () => void;
}) {
  return (
    <ModalShell onClose={onRevert} onConfirm={onDisable} title="예약 AI 덮어쓰기 경고">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          이 날짜는 예약 AI 정리에서 기존 {isSummary ? "짧은 버전" : "영문 번역본"}을 덮어쓰도록 대기 중입니다. 지금 수동으로 수정한 값을 보호하려면 이 날짜의 예약 덮어쓰기를 꺼주세요.
        </p>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-900">
          덮어쓰기를 유지하면 다음 n8n 예약 실행 때 이 값이 다시 작성될 수 있습니다.
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onRevert} type="button" variant="secondary">
            수정 취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button onClick={onKeep} type="button" variant="secondary">
            덮어쓰기 유지
          </Button>
          <Button onClick={onDisable} type="button">
            이 날짜만 끄기
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
