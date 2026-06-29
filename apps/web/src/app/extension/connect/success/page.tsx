import { getExtensionConnectionCodeForDisplay } from "@timesheet/db";
import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

export default async function ExtensionConnectSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ nonce?: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/extension/connect");
  }

  const params = await searchParams;
  const nonce = params.nonce?.trim() ?? "";
  const code = nonce
    ? await getExtensionConnectionCodeForDisplay({
        nonce,
        userId: session.userId
      })
    : null;

  if (!code) {
    redirect("/extension/connect");
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">aJam 연결</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">연결 코드가 발급되었습니다</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">아래 코드를 Chrome extension 팝업에 붙여넣어 연결을 완료하세요.</p>
        <code className="mt-5 block break-all rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-950">{code}</code>
      </section>
    </main>
  );
}
