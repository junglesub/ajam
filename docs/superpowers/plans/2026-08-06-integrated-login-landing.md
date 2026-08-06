# Integrated Login Landing A & Responsive Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/login`을 좌측 기능 스토리와 우측 로그인 폼이 결합된 A안 랜딩으로 개편한다. `lg` 이상(1024px+)에서는 2열 사이드 패널을 항상 노출하며, `lg` 미만(<1024px)에서는 하단 인라인 스택 로그인을 제거하고 헤더의 로그인 CTA 버튼을 눌렀을 때 접근성이 보장된 `role="dialog"` 모달 팝업으로 로그인을 제공한다.

**Architecture:** 단 하나의 `LoginContainer` 래퍼 컴포넌트가 단 1개의 `LoginForm` 인스턴스만을 소유하며 단일 DOM 위치에 렌더링된다. 뷰포트 상태 분기(`isMobile`), 폼 중복 생성, React Portal 없이 Tailwind CSS 클래스(`lg:static lg:block ...`)를 통해 `lg` 미만에서는 모달, `lg` 이상에서는 우측 정적 패널로 반응형 오버라이드된다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, 기존 `lucide-react`, 기존 `@timesheet/ui`.

## Global Constraints

- 상세 A안: `lg` 이상 좌측 기능 스토리 + 우측 로그인 사이드 패널.
- `lg` 미만: 인라인 스택 로그인 제거 + 메인 전면 기능 스토리 + 상단 헤더 로그인 CTA 버튼 + `role="dialog"` 접근성 로그인 모달.
- **단일 `LoginForm` 구조**: `LoginContainer` 래퍼 내부에 단 1개의 `LoginForm`만 DOM 상에 렌더링되며, CSS 오버라이드로 모달과 사이드 패널 역할을 겸한다.
- **모달 키보드/접근성 인터랙션**: `Escape` 키 닫기, 닫기(`X`) 버튼, Backdrop 클릭 닫기, Focus Enter (모달 내 첫 포커스), **Concrete Focus Trap** (Tab/Shift+Tab 모달 내부 포커스 순환), Focus Return (닫힐 때 헤더 CTA 버튼으로 초점 복원), Body Scroll Lock (모바일 모달 오픈 시에만 스크롤 잠금).
- 화면 문구는 한국어로 작성한다.
- 기존 `next` 정규화, 세션 redirect, 로그인 action, 오류 표시 및 `role="alert"` 접근성을 유지한다.
- 새 패키지, 외부 이미지 asset, 새 공용 UI 추상화를 추가하지 않는다.
- 빌드는 실행하지 않는다 (`npm run build` / `pnpm build` 절대 실행 금지). 정적 검증은 `pnpm lint`와 `pnpm typecheck`만 사용한다.

---

### Task 1: 클라이언트 반응형 컨테이너 및 로그인 모달/Focus Trap 구현

**Files:**
- Create/Modify: `apps/web/src/app/(auth)/login/login-container.tsx`
- Modify only if needed: `apps/web/src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `<LoginForm next={next} />`, `next: string`.
- Produces: `LoginContainer` 단일 래퍼 컴포넌트 (모달 상태 `isOpen`, Focus Trap, Escape 감지, Backdrop 클릭 감지, Focus Enter / Focus Return, Scroll Lock).

- [ ] **Step 1: 반응형 로그인 래퍼, Concrete Focus Trap, Keyboard & Scroll Lock 구현**

`login-container.tsx` 컴포넌트를 작성한다.
- 하나의 단일 DOM 위치에 `LoginContainer` 래퍼와 그 내부의 단 1개 `LoginForm`을 작성한다.
- `isOpen` 상태 및 `triggerRef`, `dialogRef` 지정.
- 모달 열릴 때: `document.body.style.overflow = "hidden"`, initial Focus Enter (모달 내 첫 포커스 가능 요소 이동).
- 모달 닫힐 때: `document.body.style.overflow = ""`, Focus Return (`triggerRef.current?.focus()`).
- Concrete Focus Trap (`handleKeyDown`):
  - `Escape` 입력 시 `closeModal()`.
  - `Tab` / `Shift+Tab` 입력 시 모달 내 포커스 가능 요소(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`)를 조회하여 포커스가 모달 내부에서만 순환하도록 차단.

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { X, LogIn } from "lucide-react";
import { LoginForm } from "./login-form";

export function LoginContainer({ next }: { next: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const openModal = () => setIsOpen(true);
  const closeModal = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    // Body Scroll Lock (모바일 모달 오픈 시)
    document.body.style.overflow = "hidden";

    // Initial Focus Enter
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Keyboard Handler (Escape & Concrete Focus Trap)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      {/* 헤더에 노출되는 로그인 CTA 버튼 (lg 미만 전용) */}
      <button
        ref={triggerRef}
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 lg:hidden"
        aria-label="로그인 모달 열기"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        로그인
      </button>

      {/*
        단일 LoginForm을 감싸는 래퍼:
        lg 미만: isOpen이 false면 hidden, true면 fixed overlay 모달.
        lg 이상: lg:static lg:flex ... 로 모달 스타일을 완전히 오버라이드하여 우측 패널로 정적 노출.
      */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
        className={`
          ${isOpen ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" : "hidden"}
          lg:static lg:z-auto lg:flex lg:w-full lg:h-full lg:bg-transparent lg:p-0 lg:backdrop-blur-none
        `}
      >
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl lg:max-w-none lg:rounded-none lg:bg-transparent lg:p-8 lg:shadow-none">
          {/* 모달 닫기 버튼 (lg 미만 전용) */}
          <button
            onClick={closeModal}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            aria-label="모달 닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* 단 1개만 존재하는 LoginForm */}
          <LoginForm next={next} />
        </div>
      </div>
    </>
  );
}
```

---

### Task 2: 로그인 페이지(`page.tsx`) 통합 랜딩 A안 및 헤더 CTA 배치

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify only if needed: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `getSession()`, `normalizeLoginNext()`, `getBuildInfo()`, `LoginContainer`.
- Produces: 비로그인 사용자용 반응형 통합 랜딩 A안 UI 및 헤더 CTA.

- [ ] **Step 1: 서버 인증 및 정규화 경계를 보존한다**

`page.tsx` 기존 세션 검증과 redirect 로직을 그대로 유지한다.

```tsx
const session = await getSession();
const buildInfo = getBuildInfo();
const params = await searchParams;
const next = normalizeLoginNext(params.next);

if (session) {
  redirect(next);
}
```

- [ ] **Step 2: 상단 헤더 및 5개 실제 기능 스토리 배치**

상단 헤더에 로고와 `LoginContainer`를 배치하고, 본문에 5개 기능 카드를 조밀하게 배치한다:
1. 일일 업무 기록 (`CalendarDays`)
2. AI 번역·요약 (`Languages`)
3. 휴가 관리 (`Umbrella`)
4. Notion 연동 (`PanelsTopLeft`)
5. Chrome 월말 자동 입력 (`MousePointerClick`)

```tsx
const features = [
  { icon: CalendarDays, label: "일일 업무 기록", text: "캘린더와 리스트에서 프로젝트, 시간, 업무 내용을 빠짐없이 기록합니다." },
  { icon: Languages, label: "AI 번역·요약", text: "한국어 기록을 영문 보고 문장과 짧은 버전으로 정리합니다." },
  { icon: Umbrella, label: "휴가 관리", text: "연차 총량과 소진률, 유형별 휴가 일정을 한눈에 확인합니다." },
  { icon: PanelsTopLeft, label: "Notion 연동", text: "진행 중인 Notion 카드를 업무 기록에 연결하고 투입 시간을 모읍니다." },
  { icon: MousePointerClick, label: "월말 자동 입력", text: "Chrome 확장으로 정리된 시간과 내용을 월말 입력 화면에 옮깁니다." }
] as const;
```

---

### Task 3: 정적 검증 및 4개 해상도 브라우저 검증

**Files:**
- Verification & Implementation Code Review

- [ ] **Step 1: 정적 분석 검증을 실행한다**

Run:
```bash
pnpm lint
pnpm typecheck
```

Expected: `pnpm lint` exit 0, `pnpm typecheck` exit 0. `pnpm build`는 절대 실행하지 않는다.

- [ ] **Step 2: 4개 지정 해상도 브라우저 UI 및 모달 동작 검증**

다음 뷰포트 환경에서 정확한 동작을 검증한다:

1. **1440x900 (데스크톱)**:
   - 좌우 2열 항상 노출 확인.
   - `overflow-hidden`으로 브라우저 세로 스크롤 없음 확인.
   - 헤더 로그인 CTA 및 모달 팝업 미노출 확인.

2. **1280x720 (소형 노트북)**:
   - 좌우 2열 항상 노출 확인.
   - 필요 시 최소 수준의 세로 스크롤 허용 확인.
   - 헤더 로그인 CTA 및 모달 팝업 미노출 확인.

3. **1023x768 (태블릿 - lg 미만)**:
   - 메인 하단 인라인 스택 로그인 제거 및 기능 스토리 전면 노출 확인.
   - 상단 헤더에 visible "로그인" CTA 버튼 노출 확인.
   - CTA 버튼 클릭 시 `role="dialog"` 모달 정상 오픈 및 단일 `LoginForm` 렌더링 확인.
   - Focus Enter (모달 내 첫 포커스 이동) 및 Concrete Focus Trap (Tab/Shift+Tab 순환) 검증.
   - Escape 키 누름, 우상단 닫기(`X`) 버튼 클릭, Backdrop 클릭 시 모달 정상 닫힘 및 Focus Return (헤더 CTA로 초점 복원) 확인.

4. **390x844 (모바일 - lg 미만)**:
   - 모바일 단일 컬럼 기능 스토리 노출 확인.
   - 상단 헤더에 visible "로그인" CTA 버튼 노출 확인.
   - CTA 버튼 클릭 시 모달 오픈, Body Scroll Lock 적용 확인.
   - Focus Trap 및 모달 내 입력/버튼 터치 및 키보드 접근성 동작 확인.
   - Escape, 닫기 버튼, Backdrop 클릭 닫기 및 Focus return 동작 확인.

- [ ] **Step 3: 구현 코드 리뷰, 스테이징 및 커밋**

실제 코드 구현 후 변경 사항을 확인하고 실제 구현 코드 파일들을 git 스테이징하여 커밋한다.

Run:
```bash
git diff --check
git diff -- apps/web/src/app/\(auth\)/login/page.tsx apps/web/src/app/\(auth\)/login/login-container.tsx apps/web/src/app/\(auth\)/login/login-form.tsx apps/web/src/app/globals.css
git add apps/web/src/app/\(auth\)/login/page.tsx apps/web/src/app/\(auth\)/login/login-container.tsx apps/web/src/app/\(auth\)/login/login-form.tsx apps/web/src/app/globals.css
git commit -m "feat(auth): remake integrated login landing with responsive modal"
```
수정되지 않은 파일은 git add에서 제외하고 실제 구현 코드 파일만을 스테이징하여 커밋을 완료한다.

---

### Task 4: 남는 높이에서 기능 스토리 푸터 하단 정렬

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx:105-127`

**Interfaces:**
- Consumes: `LoginContainer`의 `children`으로 전달되는 기존 flex-column 기능 스토리 `<section>`.
- Produces: 짧은 콘텐츠에서는 화면 하단에 정렬되고, 긴 콘텐츠에서는 카드 다음에 흐르는 `<footer>`.

- [ ] **Step 1: 현재 증상을 브라우저에서 확인한다**

`http://localhost:3000/login`을 콘텐츠보다 높은 뷰포트로 열고, 기능 스토리 열의 하단과 푸터 하단 사이에 남는 공간이 있는지 확인한다.

- [ ] **Step 2: 기존 카드 간격을 유지하며 자동 여백을 적용한다**

기능 카드 grid에 기존 footer 상단 간격과 같은 하단 여백을 옮기고, footer의 고정 상단 margin을 자동 margin으로 교체한다.

```tsx
<div className="mt-6 mb-6 grid gap-3 sm:mt-8 sm:mb-8 sm:grid-cols-2 lg:mt-6 lg:mb-6 lg:flex-1 lg:content-start">
  {/* existing feature cards */}
</div>

<footer className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-5 ...">
  {/* existing footer content */}
</footer>
```

- [ ] **Step 3: 정적 및 브라우저 검증을 실행한다**

Run:
```bash
pnpm lint
pnpm --filter @timesheet/web typecheck
git diff --check
```

Expected: lint와 diff check는 exit 0. 타입 검사는 변경 파일 진단이 없어야 하며, 기존 범위 밖 TS2742 기준선은 별도로 기록한다. `pnpm build`는 실행하지 않는다.

브라우저에서 1440x900, 1023x768 및 콘텐츠가 넘치는 390x844를 확인한다. 짧은 콘텐츠에서는 푸터가 기능 스토리 영역 하단에 위치하고, 긴 콘텐츠에서는 카드와 겹치지 않고 정상 스크롤되어야 한다.

- [ ] **Step 4: 변경 파일만 커밋한다**

```bash
git add "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "fix(auth): align landing footer to viewport bottom"
```
