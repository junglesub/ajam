import { CalendarDays, CheckCircle2, Languages, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getBuildInfo } from "@/lib/build-info";
import { getSession } from "@/server/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: {
    absolute: "aJam"
  }
};

const highlights = [
  {
    icon: CalendarDays,
    label: "매일 8시간 기록",
    text: "하루가 끝나기 전에 프로젝트와 내용을 정리합니다."
  },
  {
    icon: CheckCircle2,
    label: "월말 입력 대비",
    text: "누락된 날짜를 빠르게 찾고 월말 입력에 바로 옮길 수 있습니다."
  },
  {
    icon: Languages,
    label: "AI 번역 준비",
    text: "한국어 기록을 영문 보고용 문장으로 확장할 구조를 갖췄습니다."
  }
];

export default async function LoginPage() {
  const session = await getSession();
  const buildInfo = getBuildInfo();

  if (session) {
    redirect("/timesheet");
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-slate-950 text-white lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]" data-footer-scope="auth">
      <section className="relative flex min-h-[42rem] flex-col justify-between overflow-hidden px-6 py-8 sm:px-10 lg:px-14">
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-200">aJam</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">월말에 급하게 떠올리지 않는 업무 기록</h1>
          </div>
        </div>

        <div className="relative max-w-3xl">
          <div className="grid gap-3 sm:grid-cols-3">
            {highlights.map((item) => {
              const Icon = item.icon;

              return (
                <div className="rounded-md border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/10 backdrop-blur" key={item.label}>
                  <Icon aria-hidden="true" className="size-5 text-teal-200" />
                  <p className="mt-4 text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="relative flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">&copy; {buildInfo.copyrightYear} aJam. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a className="font-semibold text-slate-300 transition hover:text-white" href={buildInfo.repositoryUrl} rel="noreferrer" target="_blank">
              {buildInfo.repositoryLabel}
            </a>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-xs font-bold text-emerald-200 shadow-sm shadow-emerald-950/20">
              {buildInfo.version}
            </span>
          </div>
        </footer>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-6 py-10 text-slate-950 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-md bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">로그인</p>
              <h2 className="text-2xl font-bold text-slate-950">업무 기록 시작</h2>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
            <LoginForm />
          </div>

        </div>
      </section>
    </main>
  );
}
