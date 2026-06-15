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
- n8n custom node package는 GitHub Packages에 `@junglesub/n8n-nodes-ajam`으로 publish한다.
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
- 수동 카드 시간 배분 합계는 해당 `WORK` entry의 시간과 일치해야 저장할 수 있다.
- Notion API는 `2026-03-11` data source API를 기준으로 하고, UI 입력값은 database/data source URL 또는 ID를 허용하되 내부 query 대상은 `dataSourceId`로 저장한다.
- Notion 필드 매핑은 property name만 저장하지 않고 property `id`, `name`, `type`을 함께 저장한다.
- 날짜 매핑은 별도 시작/완료 date property와 단일 date range property를 모두 지원한다.
- scope별 동기화 상태와 오류를 위해 `NotionSyncRun` 모델을 1차 MVP에 포함한다.
- 완료 상태인데 완료일이 없는 카드는 다른 카드의 기간 기반 추정 분모에서 제외한다.
- 업무 entry 시간이 바뀌면 자동 배분은 재계산하고, 수동 배분은 합계 검증을 다시 통과해야 한다.
- database 입력값이 여러 data source를 가리키면 사용자가 data source를 선택해야 하며, 직접 data source ID를 입력하면 schema 조회로 검증한다.
- 카드 캐시의 raw Notion properties는 매핑된 속성과 진단용 metadata만 저장한다.
- done status 값 변경도 `analysisConfigVersion` 증가 조건에 포함한다.
- Notion query pagination이 중간에 멈추면 sync run을 partial로 기록하고 완전한 synced-month estimate로 표시하지 않는다.
- scoped query에서 보이지 않았다는 이유만으로 카드 캐시를 전역 stale 처리하지 않는다.
- CI 검증은 Docker image용 `verify-image`와 n8n package용 `verify-n8n-node`로 분리해, image/web 검증 실패가 n8n custom node publish를 막지 않게 한다.

## Pending

- AI 번역/요약을 OpenAI API로 처리할 때의 모델, 프롬프트, 비용 제어 정책
- Jamis Chrome extension의 자동 입력 방식과 사용자 확인 플로우
- 월별 마감/제출 상태 모델
