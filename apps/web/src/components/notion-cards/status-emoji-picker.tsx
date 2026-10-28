"use client";

import { useEffect, useState, type RefObject } from "react";

import { Button, Input } from "@timesheet/ui";
import { isValidEmoji } from "@timesheet/domain";

const STATUS_EMOJIS = [
  "✅",
  "✔️",
  "☑️",
  "🟢",
  "🟡",
  "🟠",
  "🔴",
  "🔵",
  "🟣",
  "⚪",
  "⚫",
  "⏳",
  "⌛",
  "🔄",
  "🚧",
  "🔧",
  "▶️",
  "⏸️",
  "👀",
  "🚀",
  "✨",
  "🎯",
  "📌",
  "🔥",
  "⭐",
  "💡",
  "❌",
  "⛔",
  "🚫",
  "⚠️",
  "🛑",
  "💤",
  "🎉",
  "🏁",
  "👍",
  "📝",
  "📋",
  "📦",
  "🐛",
  "🔒"
];

const OTHER_EMOJIS = [
  "😀",
  "😊",
  "🙂",
  "😉",
  "😎",
  "🤔",
  "😅",
  "😢",
  "😡",
  "😱",
  "🥳",
  "❤️",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "💯",
  "❓",
  "❗",
  "💬",
  "☀️",
  "🌙",
  "🌈",
  "❄️",
  "🌱",
  "🍀",
  "🌸",
  "🍎",
  "☕",
  "🎂",
  "🏠",
  "🚗",
  "✈️",
  "📁",
  "📎",
  "🗑️",
  "🔍",
  "🔔",
  "⏰",
  "📅",
  "📊",
  "📈",
  "📉",
  "🔑",
  "🎨",
  "🎵",
  "🎮",
  "⚽",
  "🐶",
  "🐱",
  "🐼",
  "⬆️",
  "⬇️",
  "⬅️",
  "➡️",
  "🆕",
  "🆗",
  "🔜",
  "💯",
  "🙋",
  "🙏",
  "💪",
  "🧠",
  "🗓️",
  "📥",
  "📤",
  "🧪",
  "💻",
  "🔓",
  "👎"
];

type StatusEmojiPickerProps = {
  current: string;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  optionName: string;
  scopeRef: RefObject<HTMLDivElement | null>;
};

export function StatusEmojiPicker({
  current,
  disabled = false,
  onClose,
  onSelect,
  optionName,
  scopeRef
}: StatusEmojiPickerProps) {
  const [draft, setDraft] = useState(current);
  const trimmedDraft = draft.trim();
  const draftIsValid = isValidEmoji(trimmedDraft);
  const showDraftError = trimmedDraft !== "" && !draftIsValid;

  useEffect(() => {
    scopeRef.current?.focus();
  }, [scopeRef]);

  function applyDraft() {
    if (!draftIsValid || disabled) {
      return;
    }
    onSelect(trimmedDraft);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex h-full w-full items-center justify-center self-stretch justify-self-stretch bg-slate-950/45 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby="status-emoji-picker-title"
        aria-modal="true"
        className="flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-2xl focus:outline-none"
        ref={scopeRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-950" id="status-emoji-picker-title">
            {optionName}
          </h3>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <EmojiSection current={current} disabled={disabled} emojis={STATUS_EMOJIS} label="상태" onSelect={onSelect} />
          <EmojiSection current={current} disabled={disabled} emojis={OTHER_EMOJIS} label="그 외" onSelect={onSelect} />
        </div>

        <div className="space-y-2 border-t border-slate-200 px-4 py-3">
          <label className="block text-xs font-bold text-slate-500" htmlFor="status-emoji-custom">
            직접 입력
          </label>
          <div className="flex gap-2">
            <Input
              className={`h-9 text-center text-lg ${showDraftError ? "border-red-500 focus:ring-red-100" : ""}`}
              disabled={disabled}
              id="status-emoji-custom"
              maxLength={16}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyDraft();
                }
              }}
              placeholder="이모지 하나"
              value={draft}
            />
            <Button className="shrink-0 whitespace-nowrap" disabled={disabled || !draftIsValid} onClick={applyDraft} type="button">
              적용
            </Button>
          </div>
          {showDraftError ? <p className="text-[11px] font-medium text-red-600">유효한 이모지만 가능</p> : null}
          <div className="flex justify-between gap-2">
            <button
              className="text-xs font-semibold text-slate-400 hover:text-red-600 disabled:opacity-50"
              disabled={disabled || current.trim() === ""}
              onClick={() => onSelect("")}
              type="button"
            >
              비우기
            </button>
            <Button onClick={onClose} type="button" variant="secondary">
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmojiSection({
  current,
  disabled,
  emojis,
  label,
  onSelect
}: {
  current: string;
  disabled: boolean;
  emojis: string[];
  label: string;
  onSelect: (emoji: string) => void;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-bold text-slate-500">{label}</h4>
      <div className="grid grid-cols-8 gap-1">
        {emojis.map((emoji) => {
          const selected = emoji === current;
          return (
            <button
              aria-label={emoji}
              aria-pressed={selected}
              className={`inline-flex h-9 items-center justify-center rounded-md text-lg transition hover:bg-slate-100 disabled:opacity-50 ${selected ? "bg-slate-100 ring-2 ring-slate-950" : ""}`}
              disabled={disabled}
              key={emoji}
              onClick={() => onSelect(emoji)}
              type="button"
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </section>
  );
}
