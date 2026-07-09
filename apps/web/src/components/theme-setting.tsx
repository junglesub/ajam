"use client";

import { useEffect, useState } from "react";

import { cn } from "@timesheet/ui";

type ThemeChoice = "system" | "light" | "dark";

const choiceCookie = "ajam-theme";
const resolvedCookie = "ajam-theme-resolved";
const cookieMaxAge = 60 * 60 * 24 * 365;
const choices: Array<{ description: string; label: string; value: ThemeChoice }> = [
  { description: "기기 설정을 따릅니다.", label: "시스템", value: "system" },
  { description: "밝은 화면을 사용합니다.", label: "라이트", value: "light" },
  { description: "어두운 화면을 사용합니다.", label: "다크", value: "dark" }
];

function resolveTheme(choice: ThemeChoice) {
  return choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`))
    ?.split("=")[1];
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax`;
}

function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);

  document.documentElement.dataset.theme = resolved;
  writeCookie(choiceCookie, choice);
  writeCookie(resolvedCookie, resolved);
}

export function ThemeSetting() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const saved = readCookie(choiceCookie);
    const initial = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    setChoice(initial);
    applyTheme(initial);

    function syncSystemTheme() {
      if ((readCookie(choiceCookie) ?? "system") === "system") {
        applyTheme("system");
      }
    }

    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  function chooseTheme(nextChoice: ThemeChoice) {
    setChoice(nextChoice);
    applyTheme(nextChoice);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-bold text-slate-950">화면 테마</h4>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {choices.map((item) => {
          const selected = item.value === choice;

          return (
            <label
              className={cn(
                "cursor-pointer rounded-md border bg-white px-3 py-2 transition",
                selected ? "border-slate-950 ring-2 ring-slate-100" : "border-slate-200 hover:border-slate-300"
              )}
              key={item.value}
            >
              <input checked={selected} className="sr-only" onChange={() => chooseTheme(item.value)} type="radio" />
              <span className="block text-sm font-bold text-slate-950">{item.label}</span>
              <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{item.description}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
