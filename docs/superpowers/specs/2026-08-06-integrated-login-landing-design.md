# aJam 통합 로그인 랜딩 A안 및 반응형 로그인 모달 설계

## 목표와 범위

비로그인 사용자가 처음 보는 랜딩과 로그인 입력을 `/login` 한 화면으로 통합한다.
- **데스크톱 (`lg` 이상, >=1024px)**: 좌측 기능 스토리(가치 제안), 우측 항상 노출되는 로그인 폼 패널의 2열 레이아웃을 유지한다.
- **태블릿/모바일 (`lg` 미만, <1024px)**: 하단 스택 방식의 인라인 로그인 폼을 제거하고, 메인 영역에는 기능 스토리를 전면 노출한다. 상단 헤더에 로그인 CTA 버튼을 배치하고, 버튼 클릭 시 접근성이 보장된 `role="dialog"` 모달 팝업으로 로그인 폼을 제공한다.

기존 인증 보안 규칙(`next` 정규화, 세션 존재 시 redirect, 로그인 action 처리)은 그대로 보존하며, **단일 `LoginForm` 구조**를 유지한다. 단 하나의 `LoginContainer` 래퍼 컴포넌트 내에 딱 1개의 `LoginForm`만 DOM 상에 렌더링하고, 뷰포트 상태 분기, 폼 중복 생성, React Portal 없이 순수 CSS 클래스를 통해 `lg` 미만에서는 모달, `lg` 이상에서는 우측 정적 패널로 반응형 전환한다. 새 패키지/외부 이미지/새 공용 추상화 없이 현재 `lucide-react`와 Tailwind 유틸만 재사용한다.

## 현재 구조 기준

- `apps/web/src/app/page.tsx`: 루트 진입점, 세션 유무에 따라 `/timesheet` 또는 `/login`으로 이동.
- `apps/web/src/app/(auth)/login/page.tsx`: 로그인 화면 서버 컴포넌트, `getSession`, `normalizeLoginNext`, `redirect` 처리.
- `apps/web/src/app/(auth)/login/login-form.tsx`: 로그인 폼 클라이언트 컴포넌트, `loginAction` 호출과 오류 표시 담당.
- `apps/web/src/app/(auth)/login/login-container.tsx`: `lg` 미만 모달 제어(Focus Trap, Escape, Backdrop, Focus Return, Scroll Lock) 및 `lg` 이상 정적 사이드 패널 조작을 단일 DOM 위치에서 담당하는 클라이언트 래퍼 컴포넌트.
- `apps/web/src/app/globals.css`: auth 화면 전역 스타일 및 전역 footer 숨김 규칙.

통합 랜딩 및 반응형 모달은 기존 로그인 페이지 영역 안에서만 구현하며, 라우팅/세션 로직은 변경하지 않는다.

## 정보 구조와 컴포넌트 설계

### 1) 상단 헤더 및 기능 스토리 영역 (`login/page.tsx`)

- **상단 헤더**: 브랜드 로고(aJam)와 `lg` 미만 브라우저에서 항상 보이는 로그인 CTA 버튼("로그인")을 포함한다. (`lg` 이상에서는 CSS `lg:hidden`으로 로그인 CTA 버튼 숨김).
- **핵심 헤드라인**: "월말 급한 회상 없이 매일 기록하는 습관" 메시지 유지.
- **5개 주요 기능 카드** (외부 이미지 없이 `lucide-react` 아이콘 + 텍스트 카드로 구성):
  - 일일 업무 기록 (캘린더/리스트 기반 기록 습관)
  - AI 번역·요약 (한국어 기록을 영문/짧은 보고로 정리)
  - 휴가 관리 (연차 총량/소진률/유형별 시각화)
  - Notion 연동 (카드 후보 동기화/업무 연결)
  - Chrome 월말 자동 입력 (확장 기반 월말 입력 보조)
- **푸터 배치**: 기능 카드와의 기존 세로 간격은 유지하되, 기능 스토리 열의 높이가 뷰포트보다 짧으면 남는 공간을 자동 여백으로 소비해 푸터를 화면 하단에 배치한다. 콘텐츠가 뷰포트보다 길면 푸터는 콘텐츠 다음에 이어지고 정상적으로 세로 스크롤된다.

### 2) 단일 LoginForm 메커니즘 및 반응형 CSS 오버라이드 설계

하나의 `LoginContainer` 래퍼 컴포넌트는 단 1개의 `LoginForm`만을 내부에 소유하고 특정 단일 DOM 위치에 위치한다.

#### CSS 및 반응형 레이아웃 규칙:
- **`lg` 미만 (<1024px)**:
  - `isOpen`이 `false`일 때는 CSS `hidden` 처리되어 화면에 노출되지 않음.
  - `isOpen`이 `true`일 때는 `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm` 클래스가 적용되어 스크린 전체를 덮는 접근성 모달(`role="dialog"`)로 작동함.
- **`lg` 이상 (>=1024px)**:
  - Tailwind responsive utility class (`lg:static lg:z-auto lg:flex lg:w-full lg:h-full lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:shadow-none lg:border-none`)가 모달용 스타일(fixed positioning, opacity background, backdrop filter 등)을 오버라이드함.
  - 따라서 `lg` 이상에서는 `isOpen` 상태와 무관하게 우측 패널 레이아웃의 일부로서 **항상 정적 노출(always-visible static right panel)**됨.
- 이 구조를 통해 뷰포트 상태 분기 코드(`if (isMobile)`), 중복 폼 인스턴스, Portal 사용이 전혀 발생하지 않는다.

### 3) 로그인 모달 접근성 및 키보드 인터랙션 상세 (`lg` 미만)

- **접근성 속성**:
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="login-modal-title"`.
- **모달 닫기 및 스크롤 관리**:
  - 우상단 닫기(`X`) 버튼 클릭 및 Backdrop 딤 영역 클릭 시 모달 닫힘.
  - 키보드 `Escape` 키 입력 시 모달 닫힘.
  - 모달이 열려 있는 동안만 `document.body.style.overflow = "hidden"`으로 모바일 스크롤을 잠금(body scroll lock). 모달 닫힘 및 `lg` 이상 확장 시 스크롤 잠금 해제.
- **포커스 관리 및 Concrete Focus Trap**:
  - **Focus Enter (Initial Focus)**: 모달 오픈 시 모달 내부의 첫 번째 포커스 가능 요소(예: 닫기 버튼 또는 이메일 input)로 포커스 자동 이동.
  - **Focus Trap (Tab / Shift+Tab)**: 모달 내부에서 `Tab` 키로 포커스가 순환할 때, 마지막 포커스 가능 요소에서 `Tab` 입력 시 첫 번째 요소로 순환시키고, 첫 번째 요소에서 `Shift+Tab` 입력 시 마지막 요소로 순환시켜 초점이 모달 외부로 이탈하지 않도록 차단.
  - **Focus Return**: 모달 닫힘 시 모달을 열었던 주체인 상단 헤더 로그인 CTA 버튼으로 포커스를 자동 복원 (`triggerRef.current?.focus()`).

## 데이터 흐름

1. 사용자가 `/login?next=...` 진입.
2. 서버 컴포넌트가 `getSession()`과 `searchParams`를 읽고 `normalizeLoginNext()`로 이동 경로 정규화.
3. 세션이 있으면 즉시 `redirect(next)` 실행 (기존 동작 유지).
4. 세션이 없으면 반응형 통합 랜딩 레이아웃 렌더링.
5. `lg` 미만에서는 헤더 CTA 클릭 후 모달 내부에서 `LoginForm` 입력. `lg` 이상에서는 우측 정적 패널에서 입력.
6. 로그인 제출 시 `loginAction`이 인증 처리 후 정상 세션으로 전환, `next` 경로로 이동.
7. 실패 시 `login-form.tsx`가 기존대로 `role="alert"`와 오류 상태를 갱신.

보안 관점에서 신규 클라이언트 라우팅/쿼리 파싱/외부 링크 확장은 추가하지 않는다.

## 반응형 레이아웃 및 뷰포트 스펙

- **1440x900 (데스크톱)**: 좌우 2열 패널 항상 노출, 세로 스크롤 없음 (`overflow-hidden`), 헤더 CTA 및 모달 미노출.
- **1280x720 (소형 노트북)**: 좌우 2열 패널 항상 노출, 최소 세로 스크롤 허용, 헤더 CTA 및 모달 미노출.
- **1023x768 (태블릿 - `lg` 미만)**: 스택 인라인 로그인 제거, 전면 기능 스토리 노출, 헤더 로그인 CTA 버튼 항상 노출. 버튼 클릭 시 `role="dialog"` 모달 팝업 노출.
- **390x844 (모바일 - `lg` 미만)**: 단일 컬럼 기능 스토리 노출, 헤더 로그인 CTA 버튼 항상 노출. 버튼 클릭 시 모달 팝업 노출, 모달 내 폼 터치/키보드 접근성 제공.
- **공통 푸터 규칙**: 콘텐츠 높이가 뷰포트보다 짧은 모든 폭에서 푸터 하단이 기능 스토리 영역의 하단에 맞닿는다. 콘텐츠가 넘치는 폭에서는 푸터가 카드를 가리거나 고정되지 않는다.

## 접근성 및 오류 처리

- 모달은 `role="dialog"`, `aria-modal="true"`를 가지며, Focus Trap, Escape/Backdrop 닫기 및 Focus Enter/Return을 완벽 지원한다.
- 인증 실패, 빈 입력, 서버 오류 등 로그인 오류 처리는 `loginAction` + `LoginForm` 기존 `role="alert"` 흐름을 그대로 사용한다.
- `next` 파라미터가 비정상 인코딩/외부 경로인 경우 `/timesheet`로 회귀하는 기존 보호 로직을 유지한다.

## 변경 파일 최소화 전략

- `apps/web/src/app/(auth)/login/page.tsx`: 서버 세션/정규화 로직 유지, 헤더/스토리/반응형 로그인 래퍼 조립.
- `apps/web/src/app/(auth)/login/login-container.tsx`: `lg` 미만 모달 상태, Focus Trap, Escape/Backdrop 이벤트, Focus enter/return, 단일 `LoginForm` CSS 렌더링 제어.
- `apps/web/src/app/(auth)/login/login-form.tsx` (필요 시에만): 미세 스타일 및 aria 속성 조정.
- `apps/web/src/app/globals.css` (필요 시에만): 모달 backdrop 및 z-index 보조 유틸리티.

새로운 패키지, 외부 이미지, 새 공용 추상화를 추가하지 않는다.

## 검증 계획

- `pnpm lint`
- `pnpm typecheck`

빌드는 실행하지 않는다 (`npm run build` / `pnpm build` 수행 금지). 정적 검증(`pnpm lint`, `pnpm typecheck`) 및 지정된 4가지 뷰포트(1440x900, 1280x720, 1023x768, 390x844)에서의 브라우저 UI/모달 동작 검증을 시행한다.
