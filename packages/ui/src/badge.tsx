import type { ReactNode } from "react";

import { cn } from "./cn";

type BadgeTone = "blue" | "gray" | "green" | "orange" | "white";

const tones: Record<BadgeTone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  gray: "border-slate-200 bg-slate-100 text-slate-500",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  white: "border-slate-200 bg-white text-slate-500"
};

type BadgeProps = {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
};

export function Badge({ children, className, tone = "white" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
