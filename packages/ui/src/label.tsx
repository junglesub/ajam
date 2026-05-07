import type { LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <label className={cn("text-xs font-semibold text-slate-500", className)} {...props}>
      {children}
    </label>
  );
}
