import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "sm" | "xs";

const variants: Record<ButtonVariant, string> = {
  danger: "bg-red-600 text-white shadow-sm shadow-red-900/10 hover:bg-red-700",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  primary: "bg-slate-950 text-white shadow-sm shadow-slate-900/10 hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 gap-2 px-4 text-sm",
  sm: "h-8 gap-1.5 px-3 text-xs",
  xs: "h-7 gap-1.5 px-2.5 text-xs"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({ children, className, size = "default", type = "button", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        variants[variant],
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
