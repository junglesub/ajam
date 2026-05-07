"use client";

import { useActionState } from "react";

import { Button, Input, Label } from "@timesheet/ui";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="username">아이디</Label>
        <div className="relative">
          <UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input autoComplete="username" className="pl-10" id="username" name="username" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">비밀번호</Label>
        <div className="relative">
          <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input autoComplete="current-password" className="pl-10" id="password" name="password" type="password" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <input className="size-4 rounded border-slate-300 text-slate-950" name="remember" type="checkbox" />
        로그인 상태 유지
      </label>

      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
          {state.error}
        </div>
      ) : null}

      <Button className="h-11 w-full justify-between" disabled={isPending} type="submit">
        <span>{isPending ? "확인 중" : "업무 기록으로 이동"}</span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </form>
  );
}
