import { Button } from "@timesheet/ui";
import { redirect } from "next/navigation";

import { getSession } from "@/server/session";

import { approveExtensionConnectionAction } from "./actions";

const extensionConnectLoginPath = "/login?next=/extension/connect";

export default async function ExtensionConnectPage() {
  const session = await getSession();

  if (!session) {
    redirect(extensionConnectLoginPath);
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-teal-700">aJam 연결</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Chrome extension을 연결합니다</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          연결하면 Chrome extension이 월간 업무, 휴가, 공휴일 시간 입력 데이터를 읽을 수 있습니다. 비밀번호는 공유하지 않습니다.
        </p>
        <form action={approveExtensionConnectionAction} className="mt-6">
          <Button type="submit">aJam 연결 승인</Button>
        </form>
      </section>
    </main>
  );
}
