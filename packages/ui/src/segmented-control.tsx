import type { ReactNode } from "react";

import { cn } from "./cn";

type SegmentedControlProps<TValue extends string> = {
  items: Array<{
    icon?: ReactNode;
    label: string;
    value: TValue;
  }>;
  onChange: (value: TValue) => void;
  value: TValue;
};

export function SegmentedControl<TValue extends string>({ items, onChange, value }: SegmentedControlProps<TValue>) {
  return (
    <div className="inline-grid rounded-md border border-slate-200 bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <button
          className={cn(
            "inline-flex h-8 items-center justify-center gap-2 rounded px-3 text-xs font-semibold text-slate-500 transition",
            item.value === value && "bg-white text-slate-950 shadow-sm"
          )}
          key={item.value}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
