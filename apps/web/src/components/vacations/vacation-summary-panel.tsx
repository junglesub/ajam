"use client";

import { VACATION_COLOR_PRESETS, type VacationColor, type VacationColorPreset, type VacationYearGroup, type VacationYearMetricSummary } from "@timesheet/domain";
import { Button, Input, Label, cn } from "@timesheet/ui";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

type VacationSummaryPanelProps = {
  allowanceDraft: string;
  allowanceError: string;
  colorPreferences: Record<string, VacationColor>;
  groups: VacationYearGroup[];
  metricSummary: VacationYearMetricSummary;
  nameSaveDisabled: boolean;
  onAllowanceChange: (value: string) => void;
  onAllowanceSave: () => void;
  onColorSave: (name: string, color: string | null) => Promise<void>;
  onNameSave: (oldName: string, newName: string) => Promise<void>;
  saveState: "error" | "idle" | "saved" | "saving";
};

const swatchClassByTone: Record<VacationColorPreset, string> = {
  amber: "bg-amber-300",
  blue: "bg-blue-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400"
};

const presetLabelByTone: Record<VacationColorPreset, string> = {
  amber: "노랑",
  blue: "파랑",
  cyan: "하늘",
  emerald: "초록",
  rose: "빨강",
  violet: "보라"
};

function formatDays(days: number): string {
  return `${Number(days.toFixed(2))}일`;
}

function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function MetricCard({
  inclusiveValue,
  label,
  value
}: {
  inclusiveValue: string;
  label: string;
  value: string;
}) {
  const isNegative = value.startsWith("-");
  const isInclusiveNegative = inclusiveValue.startsWith("-");

  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={cn("text-lg font-black", isNegative ? "text-red-600" : "text-slate-950")}>{value}</p>
      {value !== inclusiveValue ? (
        <p className={cn("mt-1 text-[10px] font-bold leading-tight", isInclusiveNegative ? "text-red-700" : "text-slate-500")}>
          임시 포함 {inclusiveValue}
        </p>
      ) : null}
    </div>
  );
}

export function VacationSummaryPanel({
  allowanceDraft,
  allowanceError,
  colorPreferences,
  groups,
  metricSummary,
  nameSaveDisabled,
  onAllowanceChange,
  onAllowanceSave,
  onColorSave,
  onNameSave,
  saveState
}: VacationSummaryPanelProps) {
  const { confirmed, withTemporary } = metricSummary;
  const [openName, setOpenName] = useState("");
  const [customColor, setCustomColor] = useState("#3b82f6");
  const [savingName, setSavingName] = useState("");
  const [colorError, setColorError] = useState("");
  const [editingName, setEditingName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  const saveColor = useCallback(async (name: string, color: string | null) => {
    setSavingName(name);
    setColorError("");

    try {
      await onColorSave(name, color);
      setOpenName("");
    } catch {
      setColorError("색상을 저장하지 못했습니다.");
    } finally {
      setSavingName("");
    }
  }, [onColorSave]);

  useEffect(() => {
    const input = customColorInputRef.current;
    if (!input || !openName) {
      return;
    }

    const commitColor = () => void saveColor(openName, input.value);
    input.addEventListener("change", commitColor);
    return () => input.removeEventListener("change", commitColor);
  }, [openName, saveColor]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = nameDraft.trim();
    if (!name) {
      setRenameError("휴가 유형 이름을 입력해 주세요.");
      return;
    }

    if (name === editingName) {
      setEditingName("");
      return;
    }

    setSavingRename(true);
    setRenameError("");

    try {
      await onNameSave(editingName, name);
      setEditingName("");
    } catch {
      setRenameError("휴가 유형 이름을 변경하지 못했습니다.");
    } finally {
      setSavingRename(false);
    }
  }

  return (
    <aside className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <Label>연차 총량</Label>
          <div className="flex gap-2">
            <Input
              min={0}
              onBlur={onAllowanceSave}
              onChange={(event) => onAllowanceChange(event.target.value)}
              step={0.5}
              type="number"
              value={allowanceDraft}
            />
          </div>
          <p className={cn("text-xs font-semibold", saveState === "error" ? "text-red-600" : "text-slate-500")}>
            {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : allowanceError}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <MetricCard inclusiveValue={formatDays(withTemporary.usedDays)} label="사용" value={formatDays(confirmed.usedDays)} />
          <MetricCard inclusiveValue={formatDays(withTemporary.remainingDays)} label="잔여" value={formatDays(confirmed.remainingDays)} />
          <MetricCard inclusiveValue={formatHours(withTemporary.usedHours)} label="시간" value={formatHours(confirmed.usedHours)} />
          <MetricCard inclusiveValue={formatPercent(withTemporary.consumptionRatio)} label="소진률" value={formatPercent(confirmed.consumptionRatio)} />
        </div>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-950">휴가 유형</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {groups.length === 0 ? <p className="py-3 text-sm font-semibold text-slate-500">저장된 휴가가 없습니다.</p> : null}
          {groups.map((group, index) => {
            const isCustom = group.color.startsWith("#");
            const presetColor = isCustom ? null : group.color as VacationColorPreset;
            const preferredColor = colorPreferences[group.name];
            const automaticColor = VACATION_COLOR_PRESETS[index % VACATION_COLOR_PRESETS.length]!;

            return (
              <div className="py-3 text-sm" key={group.name}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <button
                      aria-expanded={openName === group.name}
                      aria-label={`${group.name} 색상 변경`}
                      className={cn(
                        "size-5 shrink-0 rounded-full border-2 border-white outline outline-1 outline-slate-300 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-slate-950",
                        isCustom ? "vacation-custom-color" : swatchClassByTone[presetColor!]
                      )}
                      data-vacation-tone={presetColor ?? undefined}
                      onClick={() => {
                        setOpenName(openName === group.name ? "" : group.name);
                        setColorError("");
                        if (isCustom) {
                          setCustomColor(group.color);
                        }
                      }}
                      style={{ "--vacation-custom-color": isCustom ? group.color : undefined } as CSSProperties}
                      type="button"
                    />
                    <button
                      aria-expanded={editingName === group.name}
                      aria-label={`${group.name} 이름 변경`}
                      className="truncate text-left font-bold text-slate-800 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-slate-950"
                      disabled={nameSaveDisabled}
                      onClick={() => {
                        const isOpen = editingName === group.name;
                        setEditingName(isOpen ? "" : group.name);
                        setNameDraft(group.name);
                        setRenameError("");
                      }}
                      type="button"
                    >
                      {group.name}
                    </button>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-black text-slate-950">{formatDays(group.confirmedDays)}</span>
                    {group.confirmedDays !== group.withTemporaryDays ? (
                      <span
                        className={cn(
                          "block text-[10px] font-bold leading-tight",
                          formatDays(group.withTemporaryDays).startsWith("-") ? "text-red-700" : "text-slate-500"
                        )}
                      >
                        임시 포함 {formatDays(group.withTemporaryDays)}
                      </span>
                    ) : null}
                  </span>
                </div>
                {editingName === group.name ? (
                  <form className="mt-3 rounded-md bg-slate-50 p-3" onSubmit={(event) => void saveName(event)}>
                    <Input
                      aria-label={`${group.name} 새 이름`}
                      autoFocus
                      disabled={savingRename || nameSaveDisabled}
                      onChange={(event) => setNameDraft(event.target.value)}
                      value={nameDraft}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        className="h-8 px-3 text-xs"
                        disabled={savingRename || nameSaveDisabled}
                        onClick={() => {
                          setEditingName("");
                          setRenameError("");
                        }}
                        variant="secondary"
                      >
                        취소
                      </Button>
                      <Button className="h-8 px-3 text-xs" disabled={savingRename || nameSaveDisabled} type="submit">
                        변경
                      </Button>
                    </div>
                    <p aria-live="polite" className={cn("mt-2 text-xs font-semibold", renameError ? "text-red-600" : "text-slate-500")}>
                      {savingRename ? "변경 중" : renameError}
                    </p>
                  </form>
                ) : null}
                {openName === group.name ? (
                  <div className="mt-3 rounded-md bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {VACATION_COLOR_PRESETS.map((preset) => (
                        <button
                          aria-label={`${presetLabelByTone[preset]} 색상 선택`}
                          aria-pressed={preferredColor === preset}
                          className={cn(
                            "size-7 rounded-full border-2 transition focus-visible:ring-2 focus-visible:ring-slate-950",
                            swatchClassByTone[preset],
                            preferredColor === preset ? "border-slate-950" : "border-white"
                          )}
                          data-vacation-tone={preset}
                          disabled={savingName === group.name}
                          key={preset}
                          onClick={() => void saveColor(group.name, preset)}
                          title={presetLabelByTone[preset]}
                          type="button"
                        />
                      ))}
                      <button
                        aria-label={`${group.name} 직접 색상 선택`}
                        aria-pressed={preferredColor?.startsWith("#") ?? false}
                        className={cn(
                          "grid size-7 place-items-center rounded-full border-2 text-white shadow-sm transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-50",
                          preferredColor?.startsWith("#") ? "border-slate-950" : "border-white"
                        )}
                        disabled={savingName === group.name}
                        onClick={() => customColorInputRef.current?.click()}
                        style={{ background: "conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)" }}
                        title="직접 색상 선택"
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="size-3.5 drop-shadow" />
                      </button>
                      <input
                        aria-label={`${group.name} 사용자 지정 색상`}
                        className="sr-only"
                        defaultValue={customColor}
                        disabled={savingName === group.name}
                        ref={customColorInputRef}
                        type="color"
                      />
                      <button
                        aria-label={`${group.name} 자동 배정 (${presetLabelByTone[automaticColor]})`}
                        aria-pressed={preferredColor === undefined}
                        className={cn(
                          "grid size-7 place-items-center rounded-full border-2 text-[11px] font-black transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-50",
                          swatchClassByTone[automaticColor]
                        )}
                        data-vacation-tone={automaticColor}
                        disabled={savingName === group.name}
                        onClick={() => void saveColor(group.name, null)}
                        style={{ borderColor: preferredColor === undefined ? "#111827" : "#ffffff", color: "#111827" }}
                        title={`자동 배정 (${presetLabelByTone[automaticColor]})`}
                        type="button"
                      >
                        A
                      </button>
                    </div>
                    <p aria-live="polite" className={cn("mt-2 text-xs font-semibold", colorError ? "text-red-600" : "text-slate-500")}>
                      {savingName === group.name ? "저장 중" : colorError}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
