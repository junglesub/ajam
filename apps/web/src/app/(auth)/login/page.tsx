import { CalendarDays, Languages, MousePointerClick, PanelsTopLeft, Umbrella } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getBuildInfo } from "@/lib/build-info";
import { getSession } from "@/server/session";

import { LoginContainer } from "./login-container";

export const metadata: Metadata = {
  title: {
    absolute: "aJam"
  }
};

const features = [
  {
    icon: CalendarDays,
    label: "일일 업무 기록",
    text: "캘린더와 리스트에서 프로젝트, 시간, 업무 내용을 빠짐없이 기록합니다."
  },
  {
    icon: Languages,
    label: "AI 번역·요약",
    text: "한국어 기록을 영문 보고 문장과 짧은 버전으로 정리합니다."
  },
  {
    icon: Umbrella,
    label: "휴가 관리",
    text: "연차 총량과 소진률, 유형별 휴가 일정을 한눈에 확인합니다."
  },
  {
    icon: PanelsTopLeft,
    label: "Notion 연동",
    text: "진행 중인 Notion 카드를 업무 기록에 연결하고 투입 시간을 모읍니다."
  },
  {
    icon: MousePointerClick,
    label: "월말 자동 입력",
    text: "Chrome 확장으로 정리된 시간과 내용을 월말 입력 화면에 옮깁니다."
  }
] as const;

function normalizeLoginNext(next: string | undefined): string {
  const trimmed = next?.trim() ?? "";
  let decoded = trimmed;

  for (let index = 0; index < 3; index += 1) {
    try {
      const nextDecoded = decodeURIComponent(decoded);

      if (nextDecoded === decoded) {
        break;
      }

      decoded = nextDecoded;
    } catch {
      return "/timesheet";
    }
  }

  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !decoded.includes("\\")
  ) {
    return trimmed;
  }

  return "/timesheet";
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<React.JSX.Element> {
  const session = await getSession();
  const buildInfo = getBuildInfo();
  const params = await searchParams;
  const next = normalizeLoginNext(params.next);

  if (session) {
    redirect(next);
  }

  return (
    <main
      className="relative grid min-h-screen grid-cols-1 bg-slate-950 text-white lg:h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] min-[1281px]:overflow-hidden"
      data-footer-scope="auth"
    >
      <LoginContainer next={next}>
        <section className="flex min-h-0 flex-col px-6 py-7 sm:px-10 lg:px-12 lg:py-8 lg:col-start-1 lg:row-start-1">
          <div>
            <div className="pr-24 sm:pr-28 lg:pr-0">
              <p className="text-sm font-semibold text-teal-200">aJam</p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">월말에 급하게 떠올리지 않는 업무 기록</h1>
            </div>
          </div>

          <div className="mt-6 mb-6 grid gap-3 sm:mt-8 sm:mb-8 sm:grid-cols-2 lg:mt-6 lg:mb-6 lg:flex-1 lg:content-start">
            {features.map((item) => {
                const Icon = item.icon;

                return (
                  <article className="rounded-md border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/10 backdrop-blur lg:p-3.5" key={item.label}>
                    <Icon aria-hidden="true" className="size-5 text-teal-200" />
                    <h2 className="mt-3 text-sm font-semibold text-white">{item.label}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                  </article>
                );
              })}
          </div>

          <footer className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
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
      </LoginContainer>
    </main>
  );
}
