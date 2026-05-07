import type { Metadata } from "next";
import type { ReactNode } from "react";

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
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
