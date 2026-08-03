# Decisions

## 2026-05-07

- Monorepo는 pnpm workspace를 사용한다.
- 웹 앱은 Next.js App Router와 Tailwind CSS를 사용한다.
- DB는 SQLite와 Prisma를 사용한다.
- Prisma 7 SQLite 연결은 `@prisma/adapter-better-sqlite3` adapter를 사용한다.
- 세션은 httpOnly signed cookie로 시작하고, 세션 시크릿은 env 우선/DB 자동 생성 fallback을 사용한다.
- 브라우저 timezone을 화면 날짜의 기준으로 둔다.
- 주말은 캘린더와 리스트에서 제외한다.
- 사용자는 프로젝트를 직접 등록하고, 기록 작성 시 이전 업무일 프로젝트를 자동 기입한다.
- 한국 공휴일은 공공데이터포털 `getRestDeInfo`로 조회하고 월별로 캐시한다.
- API 키와 사용자 관리는 관리자 설정에서 처리한다.
- 배포 전이므로 Prisma migration 파일은 제거하고 앱 bootstrap/seed로 schema를 보장한다.
- Docker Compose 예시는 제공하고 GHCR 이미지는 GitHub Actions에서 자동 publish한다.
- GitHub Actions는 install, lint, typecheck, build 검증 후 `main` push에서 GHCR publish를 수행한다.

## 2026-05-29

- 업무 기록 미작성 리마인더는 aJam 백엔드가 대상 계산 API를 제공하고 n8n custom node가 해당 API를 action으로 노출한다.
- 개인 AI 정리는 사용자별 실행 방식으로 관리하고, 예약 모드에서는 n8n custom node가 내부 scheduled cleanup API를 호출해 일괄 처리한다.
- n8n custom node package는 public npm registry에 `@junglesub/n8n-nodes-ajam`으로 publish한다.
- GHCR image와 n8n package publish는 관련 파일 변경이 있을 때만 실행한다.
- 내부 리마인더 API는 `AJAM_INTERNAL_API_TOKEN` bearer token으로 보호한다.
- 사용자 이메일은 `User.email`에 저장하고, 이메일이 없는 사용자는 리마인더 대상에서 제외한다.
- 발송 중복 방지는 `ReminderLog`에 사용자/날짜/유형별 발송 기록을 남기는 방식으로 처리한다.

## 2026-06-15

- Notion 카드 연동은 사용자별 internal integration token 직접 입력으로 시작하고, 나중에 OAuth를 추가할 수 있게 `authType` 기반 연결 모델을 둔다.
- Notion 데이터는 전체 복제하지 않고 화면에 필요한 날짜/월 범위의 카드 스냅샷만 aJam DB에 캐시한다.
- Notion 연동은 1차에서 읽기 전용으로 유지하며, Notion API 실패가 업무 기록 저장을 막지 않게 한다.
- Notion 카드는 하루 전체가 아니라 `WORK` entry별로 여러 개 연결할 수 있게 한다.
- 동기화된 Notion 카드는 후보일 뿐이며, 업무 기록에 매핑된 카드만 시간/기간 분석에 참여한다.
- 카드별 업무기록 시간은 기본 균등 배분하고 사용자가 필요하면 수동 배분할 수 있게 한다.
- 완료 카드 분석은 기간 기반 추정과 업무기록 연결 시간을 함께 보여주며, 일수 표시는 `8h = 1일` 환산값으로만 사용한다.
- Notion 시작일이 없는 카드는 후보와 기간 기반 추정에서 제외하고, 완료 상태지만 완료일이 없는 카드는 추정 불가로 표시한다.
- 월 분석 동기화가 실패하면 마지막 캐시 기준 추정임을 표시해 캐시 불완전성을 드러낸다.
- 수동 카드 시간 배분 합계가 해당 `WORK` entry의 시간과 달라도 저장은 허용하고, UI 경고로 드러낸다.
- Notion API는 `2026-03-11` data source API를 기준으로 하고, UI 입력값은 database/data source URL 또는 ID를 허용하되 내부 query 대상은 `dataSourceId`로 저장한다.
- Notion 필드 매핑은 property name만 저장하지 않고 property `id`, `name`, `type`을 함께 저장한다.
- 날짜 매핑은 별도 시작/완료 date property와 단일 date range property를 모두 지원한다.
- scope별 동기화 상태와 오류를 위해 `NotionSyncRun` 모델을 1차 MVP에 포함한다.
- 완료 상태인데 완료일이 없는 카드는 다른 카드의 기간 기반 추정 분모에서 제외한다.
- 업무 entry 시간이 바뀌거나 카드 연결이 바뀌면 수동 카드 배분은 보존하고, 자동 카드 배분은 남은 시간을 균등 재계산한다. 카드 배분 합계가 업무 시간과 달라도 저장은 허용하되, 캘린더와 업무 리스트에서 경고로 드러낸다.
- database 입력값이 여러 data source를 가리키면 사용자가 data source를 선택해야 하며, 직접 data source ID를 입력하면 schema 조회로 검증한다.
- 카드 캐시의 raw Notion properties는 매핑된 속성과 진단용 metadata만 저장한다.
- done status 값 변경도 `analysisConfigVersion` 증가 조건에 포함한다.
- Notion query pagination이 중간에 멈추면 sync run을 partial로 기록하고 완전한 synced-month estimate로 표시하지 않는다.
- scoped query에서 보이지 않았다는 이유만으로 카드 캐시를 전역 stale 처리하지 않는다.
- CI 검증은 Docker image용 `verify-image`와 n8n package용 `verify-n8n-node`로 분리해, image/web 검증 실패가 n8n custom node publish를 막지 않게 한다.
- n8n package publish trigger에서는 `pnpm-lock.yaml`을 제외한다. lockfile은 앱 의존성 변경에도 함께 바뀔 수 있고, paths-filter는 lockfile 내부의 패키지별 영향 범위를 판별하지 못하기 때문이다.
- n8n package publish는 `packages/n8n-nodes-ajam/package.json`의 `version` 값이 이전 main 상태와 달라진 경우에만 실행한다. npm registry는 같은 version 덮어쓰기를 허용하지 않으므로, version bump 없는 n8n 변경은 검증만 하고 publish하지 않는다.

## Pending

- AI 번역/요약을 OpenAI API로 처리할 때의 모델, 프롬프트, 비용 제어 정책
- 월별 마감/제출 상태 모델

## 2026-08-03

- 휴가 유형 색상은 별도 휴가 유형 엔터티나 JSON 설정 대신 사용자와 정규화된 유형 이름을 유일 키로 하는 `VacationTypeColorPreference`에 저장한다.
- 색상 설정은 특정 연도가 아니라 같은 사용자의 모든 연도에 적용한다. 유형명 변경 시 기존 색상 설정을 자동 이전하지 않는다.
- 프리셋은 기존 여섯 색상을 재사용하고, 사용자 지정 값은 6자리 hex 하나만 저장한다. 테마별 파생 색상은 저장하지 않는다.
- 사용자 지정 색상은 브라우저 기본 `<input type="color">`로 선택하고 CSS `color-mix(in oklab, ...)`로 라이트/다크 배경 tint를 자동 계산한다.
- 색상 설정을 삭제하면 기존 사용량 순위 기반 자동 색상 배정으로 돌아간다.

## 2026-07-09

- 웹 앱 다크모드는 설정 모달의 내 설정 영역에서 시스템, 라이트, 다크 중 선택한다.
- 앱 헤더는 새로고침과 설정 아이콘 액션만 두고, 로그아웃은 설정 모달의 내 설정 영역에서 텍스트 액션으로 제공한다.
- 공통 헤더 설정 버튼은 모든 앱 페이지에서 전체 설정 모달을 연다.
- 테마 선택은 cookie `ajam-theme`에 저장하고, 서버 렌더링은 cookie `ajam-theme-resolved`를 읽어 `html[data-theme]`를 직접 렌더한다.
- 테마 초기 적용은 루트 inline script 없이 처리하며, `system` 선택 시 클라이언트 설정 컴포넌트가 현재 시스템 테마를 resolved cookie에 동기화한다.
- 기존 화면 전반에 Tailwind 색상 유틸이 직접 쓰이고 있어, 1차 구현은 `globals.css`에서 공통 slate/white 계열 유틸을 VS Code Dark Modern에 가까운 중성 다크 팔레트로 오버라이드한다.
- 캘린더 큰 배경은 다크모드에서 투명하게 두고, 빈칸과 휴가 칸은 본문 카드보다 낮은 대비로 표시한다.
- 상태 색상은 다크모드에서 원색 대신 VS Code 계열의 muted green, red, amber, blue로 낮춘다.
- 선택/포커스 ring은 다크모드에서 흰색 대신 light gray-blue 계열과 어두운 ring offset을 사용한다.
- primary 버튼 배경은 VS Code Dark Modern의 기본 버튼에 가까운 `#0e639c` 계열을 사용한다.
- 임시 저장 휴가의 사선 패턴은 CSS 변수로 관리해 다크모드에서 낮은 대비 패턴을 쓴다.
- 휴가 연간 캘린더의 선택 날짜 outline과 기록 있는 날짜 marker는 다크모드에서 별도 고대비 색을 사용한다.
- 업무 캘린더의 부분 휴가 overlay는 CSS 변수로 관리해 라이트/다크 테마별 대비를 따로 둔다.
- 휴가 유형 색상은 라이트 테마의 기존 Tailwind 색을 유지하고, 다크 테마에서는 `data-vacation-tone` 기반 muted VS Code 토큰 색 후보군으로 오버라이드한다.
- 공통 설정 모달은 기존 업무 기록 설정에서 제공하던 AI 예약 정리 대기 목록과 공휴일 캐시 리셋 후 화면 갱신을 유지한다.

## 2026-07-13

- Notion 자동 동기화는 유료 Webhook action과 카드 버튼 대신 무료 Connection Webhook의 페이지 이벤트를 사용한다.
- Webhook verification token은 암호화 저장하고 `X-Notion-Signature` HMAC-SHA256을 검증한다. 공개 connection ID가 포함된 URL은 인증 수단으로 취급하지 않는다.
- 입력 필드 변경은 기존 단일 카드 캐시 및 집계 필드 업데이트 경로를 실행하고, aJam 출력 필드만 변경된 이벤트는 무한 반복 방지를 위해 무시한다.
- 기존 Notion 연결 modal은 `기본 연결`과 `자동 동기화` 탭으로 나누며 별도 설정 페이지는 만들지 않는다.
- 하나의 Notion subscription을 n8n에서 production/development로 분기할 수 있도록 verification token 수동 입력을 허용한다. 각 환경은 같은 Notion token으로 서명을 독립 검증하며 n8n은 raw body와 서명 header를 그대로 전달해야 한다.
- 저장된 verification token은 기본적으로 숨기고 사용자가 명시적으로 `보기`를 선택한 경우에만 인증된 server action으로 반환한다.
- Webhook event ID는 처리 전 `processing` 상태로 원자적 claim한다. 완료 이벤트는 중복 응답하고, 처리 중 이벤트는 재시도를 유도하며, 실패 claim은 제거한다.

## 2026-06-29

- Chrome extension 시간 입력 MVP는 외부 업무 기록 화면의 DOM selector에 의존하지 않고, 사용자가 둔 현재 커서 위치에서 시작하는 매크로 방식으로 구현한다.
- extension은 aJam 세션 쿠키를 재사용하지 않고, `aJam 연결` 승인 페이지와 일회성 연결 코드로 확장 전용 access token과 refresh token을 발급받는다.
- extension access token은 월간 매크로 export 읽기 전용 scope로 제한하고 짧게 만료시킨다.
- refresh token은 aJam DB에 해시로 저장하고, 사용자가 확장 연결을 끊으면 폐기할 수 있게 한다.
- 시간 입력 모드는 업무 프로젝트, 휴가, 공휴일을 카테고리로 보고 사용자가 카테고리 활성 여부와 순서를 조정할 수 있게 한다.
- 매크로 실행은 각 카테고리에서 1일부터 말일까지 모든 날짜 칸을 순회하며 값이 있는 날짜는 입력 후 Tab, 값이 없는 날짜와 주말은 Tab만 수행한다.
- 마지막이 아닌 카테고리의 말일 이후에는 다음 카테고리 1일 위치로 이동하기 위해 추가 Tab 4회를 수행하고, 마지막 카테고리의 말일에는 기본 Tab과 추가 Tab을 모두 수행하지 않는다.
