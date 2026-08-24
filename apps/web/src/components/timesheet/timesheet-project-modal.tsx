"use client";

import { Plus } from "lucide-react";
import { Button, Input } from "@timesheet/ui";
import { Field, ModalShell, ShortcutHint } from "./timesheet-ui-primitives";

export function ProjectCreateModal({
  error,
  name,
  onClose,
  onNameChange,
  onSubmit,
  saving
}: {
  error: string;
  name: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  return (
    <ModalShell onClose={onClose} title="새 프로젝트 등록">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSubmit(); }}>
        <Field label="프로젝트명">
          <Input autoFocus onChange={(event) => onNameChange(event.target.value)} placeholder="예: 고객 포털 개선" value={name} />
        </Field>
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="secondary">
            취소
            <ShortcutHint keys={["Esc"]} />
          </Button>
          <Button disabled={saving} type="submit">
            <Plus aria-hidden="true" className="size-4" />
            {saving ? "등록 중" : "등록"}
            <ShortcutHint keys={["↵"]} />
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
