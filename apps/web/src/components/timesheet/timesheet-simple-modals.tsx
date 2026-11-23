"use client";

import { formatKoreanDate } from "@timesheet/domain";
import { Button } from "@timesheet/ui";
import { ModalShell, ShortcutHint } from "./timesheet-ui-primitives";

export function DeleteConfirmModal({
  dateKey,
  entryLabel,
  isDeleting = false,
  onCancel,
  onConfirm
}: {
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
} & ({ dateKey: string; entryLabel?: never } | { dateKey?: never; entryLabel: string })) {
  return (
    <ModalShell onClose={onCancel} onConfirm={onConfirm} title={entryLabel === undefined ? "기록 삭제" : "업무 항목 삭제"}>
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          {dateKey === undefined
            ? `‘${entryLabel}’ 항목을 삭제할까요?`
            : `${formatKoreanDate(dateKey)}의 저장된 업무 기록을 삭제할까요? 이 날짜의 업무, 휴가, 공휴일 entry가 함께 삭제됩니다.`}
        </p>
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
          {dateKey === undefined
            ? "삭제는 오늘 전체 요약과 임시 저장에 반영됩니다."
            : "삭제 후에는 해당 날짜가 다시 미기입 상태로 돌아갑니다."}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onCancel} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button disabled={isDeleting} onClick={onConfirm} type="button" variant="danger">
            {isDeleting ? "삭제 중" : "삭제"}
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export function NotionSyncErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} onConfirm={onClose} title="Notion 필드 업데이트 실패">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          업무 기록은 저장/삭제됐지만 연결된 Notion 카드의 숫자/날짜 필드 업데이트에 실패했습니다.
        </p>
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
          Notion 연결 설정에서 업무 기간 시간, 작업일수, 가용 시간, 마지막 작업일, aJam 업데이트 시간 필드 매핑과 integration 권한을 확인해 주세요.
        </div>
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

export function PendingNavigationConfirmModal({
  draftSaveFailed = false,
  kind,
  onCancel,
  onConfirm
}: {
  draftSaveFailed?: boolean;
  kind: "closeEditor" | "comment" | "navigate";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const action = kind === "closeEditor" ? "닫으면" : "이동하면";
  const confirmLabel = kind === "closeEditor" ? "닫기" : "이동";
  const message = kind === "comment"
    ? "작성 중인 댓글이 있습니다. 저장하지 않고 이동하면 댓글 입력이 사라집니다."
    : draftSaveFailed
      ? `임시 저장에 실패했습니다. 저장하지 않고 ${action} 이번 수정은 버려지고, 마지막 확정 기록으로 되돌아갑니다.`
      : `현재 날짜의 변경사항이 아직 저장되지 않았습니다. 저장하지 않고 ${action} 마지막 확정 기록으로 되돌아갑니다.`;

  return (
    <ModalShell onClose={onCancel} onConfirm={onConfirm} title="저장되지 않은 변경">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          {message}
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onCancel} variant="secondary">
            계속 작성
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button onClick={onConfirm} variant="danger">
            저장하지 않고 {confirmLabel}
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
