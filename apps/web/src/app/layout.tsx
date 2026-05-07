import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getBuildInfo } from "@/lib/build-info";

import "./globals.css";

export const metadata: Metadata = {
  description: "매일 작성하고 월말에 바로 옮기는 업무 기록 서비스",
  icons: {
    icon: "/icon.svg"
  },
  title: {
    default: "aJam",
    template: "%s | aJam"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const buildInfo = getBuildInfo();

  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen flex-col">
          <div>{children}</div>
          <footer className="site-footer my-1 px-5 py-0 text-xs leading-none text-slate-400">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">&copy; {buildInfo.copyrightYear} aJam. All rights reserved.</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <a className="font-medium text-slate-500 transition hover:text-slate-700" href={buildInfo.repositoryUrl} rel="noreferrer" target="_blank">
                  {buildInfo.repositoryLabel}
                </a>
                <span className="rounded-full border border-emerald-100/70 px-2 py-px font-mono text-[11px] font-semibold text-emerald-600/70">{buildInfo.version}</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
