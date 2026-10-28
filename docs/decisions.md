# Decisions

## 2026-10-28 — refactor 브랜치 활용 검토와 통합

- 비교 기준은 로컬 `main` (`be48b6e`)과 `refactor` (`b90b54a`)이며 공통 조상은 `dccd873`이다. 로컬의 `origin/main`, `origin/refactor`도 각각 같은 커밋을 가리킨다. 이번 검토에서 원격 fetch는 하지 않았다.
- 공통 조상 이후 main 전용 커밋은 6개, refactor 전용 커밋은 16개다. main은 운영 로그, 로그 뷰어, 연말 정리, 연차 차감 제외 휴가와 표시 개선을 추가했다.
- refactor는 업무 기록 UI의 컴포넌트·유틸·상태 hook 추출에 집중한다. 변경 파일은 18개(신규 17개와 기존 workspace)이며 DB·의존성·문서·테스트 변경은 없다. `timesheet-workspace.tsx`는 공통 조상의 5,687줄에서 3,066줄로 줄지만, 추출 파일을 합친 전체 코드는 1,027줄 증가한다. 따라서 가치의 기준은 전체 코드 감소보다 책임 분리와 수정 범위 축소다.
- 양쪽에서 함께 변경한 경로는 `apps/web/src/components/timesheet/timesheet-workspace.tsx` 하나다. 해당 파일의 main 쪽 변경량은 106줄 추가·100줄 삭제다. `git merge-tree --write-tree --name-only main refactor` 가상 병합은 이 파일에만 충돌을 보고했고, 생성된 가상 결과에는 충돌 블록이 7개 있다. 실제 checkout·index·브랜치 병합은 수행하지 않았다.

### 권고

- 초기 검토에서는 기존 refactor를 보존하고 현재 main에서 별도 통합 브랜치를 만들어 refactor를 병합·보완한 뒤 main으로 반영하는 방식을 권고했다. 이후 사용자가 이 방향의 실행을 승인하고, 최종 목표를 깔끔한 코드의 main 반영과 refactor 브랜치 정리로 확정했다.
- 충돌은 최신 main의 기능과 수정 의도를 기준으로 해결하고, 해당 동작을 refactor의 새 컴포넌트·hook으로 옮긴다. 한쪽 버전을 통째로 선택하면 새 기능 또는 구조 분리를 잃을 수 있다.
- 특히 차감 제외 휴가의 생성·기간 저장·편집 체크박스·캘린더 채움/테두리/배지 표시를 분리된 draft 유틸, 일별 편집기, 캘린더와 UI primitive에 반영해야 한다.
- main의 `@/lib/timesheet-drafts`와 도메인 `createVacationDay`를 재사용한다. refactor의 `timesheet-draft-utils.ts`에는 이전 버전의 같은 helper가 있어 두 구현을 병존시키지 않는다.
- 프로젝트 추천은 main의 effect 실행·요청 중복 방지와 state updater 내부의 서버 호출 제거를 유지한다. refactor의 추천 hook과 `createDraftForSelectedDate`에는 이 수정이 반영되어 있지 않다.
- 모든 추출을 무조건 유지할 필요는 없다. 통합 검토에서 전달용 props·타입만 늘리는 분리는 단순화하되, UI 분리와 기존의 유용한 helper는 재사용한다. 필요한 경우에만 일부 커밋/변경을 선택적으로 이식한다.

### 통합 시 확인할 항목과 이번 검토 범위

- 통합 후에는 build 없이 관련 lint·typecheck, 기존 domain/DB 및 draft 회귀 테스트를 실행하고, 차감 제외 휴가와 프로젝트 추천의 변경 경로를 검증해야 한다. 월 전환·저장·설정·Notion 추천·연말 정리 날짜 편집도 기존 동작이 유지되는지 확인 대상이다.
- 초기 검토에서는 Git 이력·diff·관련 코드·문서와 가상 병합만 확인했고 코드 변경·실제 병합·브랜치 삭제·테스트·제품 build는 수행하지 않았다. 후속 구현 결과는 아래에 기록한다. 충돌 개수는 통합 후 동작 보존을 보장하지 않는다.

### 후속 통합 결과

- `codex/refactor-timesheet-integration`에서 refactor를 실제 병합하고 최신 main의 휴가 차감 제외·공가 표시·프로젝트 추천 수정을 새 컴포넌트와 hook으로 옮겼다. main의 다른 기능 파일과 DB·의존성·저장 action은 변경하지 않았다.
- workspace는 5,693줄에서 3,062줄로 줄었다. 캘린더·리스트·일별 편집·기능별 팝업과 설정/로딩/추천 hook을 분리하고, refactor의 중복 draft helper는 제거해 기존 공통 helper를 사용한다. 추가 추상화나 임의의 파일 길이 목표는 두지 않았다.
- Codex 하위 에이전트 `gpt-6.1-terra`가 제품 통합을 수행하고 별도 `gpt-6.1-sol`이 전체 변경을 독립 검토했다. 기존 이름 있는 함수 187개와 상태 초기값 95개, view/modal의 props·callback·effect 연결을 비교해 병합을 막는 결함이 없음을 확인했다. Astra와 my-orch는 사용하지 않았다.
- 도메인 102개, DB 46개, 기존 웹 helper 21개, 신규 캘린더 렌더 회귀 2개가 통과했다. 신규 2개는 이전 refactor 캘린더에서 실패한 뒤 main 동작 이식 후 통과했다. web/domain/DB 타입 검사와 변경 파일 ESLint, diff 공백 검사도 통과했다.
- 신규 렌더 테스트는 기존 workspace의 tsx와 `apps/web/tsconfig.test.json`을 사용한다. 테스트에서 React 전역 객체를 수정하거나 새 dependency를 추가하지 않는다. 실제 실행 명령과 UI 소유자 지도는 `docs/timesheet-workflow.md`와 `docs/architecture.md`에 기록했다.
- 제품 build·브라우저 자동화는 실행하지 않았다. 실제 화면과 비동기 추천·편집 상호작용의 최종 확인은 사용자 담당이며, 이번에는 코드 검토와 정적 검사 및 자동 회귀 테스트로 검증했다.
- 원격 브랜치는 `git ls-remote`로 조회해 최초 비교와 같은 커밋임을 확인했다. 원격 push·브랜치 삭제는 수행하지 않으며 로컬 main 통합 및 로컬 refactor 정리만 수행한다. 기존 refactor 작업 폴더의 파일은 삭제하지 않는다.
- 독립 검토는 spec compliance pass, code quality approve, severity finding 0건으로 완료했다. 검증한 트리와 동일한 병합 커밋 `5af1216`을 로컬 main에 fast-forward 반영했고 로컬 `refactor`와 임시 통합 브랜치를 삭제했다. 기존 `C:/Users/RyooJungsub/orca/workspaces/ajam/refactor` 폴더는 원래 커밋 `b90b54a`의 detached HEAD로 남겨 파일과 로컬 환경을 보존했다. 원격 main/refactor는 그대로다.

## 2026-08-07

- web 배포의 `publish-image`와 `request-dca-deploy`는 같은 `web-deploy-main` concurrency group을 사용한다. 새 web 배포가 준비되면 진행 중인 이전 web 배포를 취소한다.
- n8n package publish는 별도 `n8n-publish-main` concurrency group에서 직렬 실행한다. 실행 중인 npm publish는 취소하지 않고 완료한 뒤 다음 publish를 실행한다.
- 배포 concurrency는 배포 job에만 적용하며 PR의 web/n8n 검증 job은 기존처럼 끝까지 실행한다.
- CI의 `push` trigger는 `main`으로 제한하고 PR은 기본 `opened`, `synchronize`, `reopened` 이벤트를 사용한다. PR 브랜치 push에서 같은 검증이 `push`와 `pull_request`로 중복 실행되지 않게 한다.

## 2026-05-07

- Monorepo는 pnpm workspace를 사용한다.
- 웹 앱은 Next.js App Router와 Tailwind CSS를 사용한다.
- Tailwind 소스 탐색은 `globals.css`의 `source(none)`과 명시적인 `apps/web/src`, `packages/ui/src` 경로만 사용한다. `.git/orca/workspaces` 아래에서 자동 탐색이 비소스 파일의 깨진 문자열을 임의 유틸리티로 오인하는 것을 방지한다.
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

## 2026-08-05

- 휴가 유형 이름 변경은 별도 유형 엔터티를 만들지 않고 선택한 연도의 같은 정규화 이름을 가진 현재/레거시 휴가 저장 행을 한 트랜잭션으로 갱신한다.
- 유형 이름이 합쳐져도 휴가 시간, 상태, 날짜는 유지하며 기존 이름의 색상 설정은 새 이름으로 이전하지 않는다. 새 이름에 저장된 설정이 없으면 자동 색상을 사용한다.

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
