# Architecture

## Workspace

이 저장소는 pnpm monorepo로 구성한다.

- `apps/web`: Next.js App Router 기반 웹 앱
- `packages/db`: Prisma, SQLite, schema bootstrap, seed, 서버 전용 DB 유틸
- `packages/domain`: 날짜, 상태, 업무 기록 도메인 타입과 순수 함수
- `packages/n8n-nodes-ajam`: aJam 내부 자동화 API를 n8n action으로 노출하는 custom node package
- `packages/ui`: Tailwind 기반 공통 UI 컴포넌트
- `docs`: 제품/구현 결정과 후속 작업 기록

## Authentication And Users

- `User`는 SQLite에 저장한다.
- `User.role`은 `ADMIN` 또는 `USER` 문자열로 관리한다.
- `User.email`은 업무 기록 리마인더 수신 주소로 사용하며 비어 있으면 리마인더 대상에서 제외한다.
- seed는 ADMIN 권한 사용자가 없을 때만 최초 `admin` 관리자를 생성한다. 관리자가 username을 바꾼 뒤에도 ADMIN 사용자가 존재하면 새 `admin` 계정을 다시 만들지 않는다.
- 비밀번호는 scrypt 해시로 저장한다.
- 로그인 성공 시 httpOnly signed cookie를 발급한다.
- `/timesheet`는 서버 컴포넌트에서 세션과 실제 DB 사용자를 확인하고, 세션이 없으면 `/login`으로 이동한다.
- 모든 사용자는 설정에서 자기 아이디/비밀번호를 변경할 수 있다.
- 관리자는 설정에서 사용자를 추가할 수 있다.

## Date Handling

- 화면에서 오늘 날짜와 선택 날짜는 브라우저 timezone을 기준으로 계산한다.
- 날짜 키는 `YYYY-MM-DD` 문자열로 다룬다.
- 캘린더와 리스트는 토요일/일요일을 제외한다.
- 휴가와 공휴일은 미래 날짜여도 `FUTURE`보다 `VACATION`/`HOLIDAY` 상태가 우선한다.

## Data Model

- `TimesheetEntry`: 사용자별 날짜 기록을 저장한다. `userId + dateKey`가 유일하다.
- `Project`: 사용자별 프로젝트 목록을 저장한다. 새 프로젝트는 사용자가 직접 등록한다.
- `Holiday`: 공휴일 날짜와 이름을 저장한다.
- `HolidayFetchLog`: `getRestDeInfo` 월별 조회 여부를 저장해 같은 월을 반복 fetch하지 않게 한다.
- `Vacation`: 사용자별 휴가 날짜, 이름, 시간을 저장한다. 업무 기록을 휴가로 저장하면 같은 날짜의 휴가 레코드가 동기화된다.
- `AppSetting`: 공공데이터포털 서비스 키 같은 앱 설정값을 저장한다.
- `UserAiSetting`: 사용자별 Gemini API key, 모델, 자동 정리 여부, 참고할 이전 저장 WORK 날짜 수, 과거 미작성 AI 필드 보정 설정을 저장한다. API key는 앱 secret으로 암호화해 저장한다.
- `UserNotionConnection`: 사용자별 Notion token, data source, 읽기/쓰기 필드 매핑, 완료 상태 값, 분석 설정 버전을 저장한다. 쓰기 필드에는 업무 기간 시간, 작업일수, 가용 시간, 마지막 작업일, aJam 업데이트 시간이 포함될 수 있다. token은 앱 secret으로 암호화한다.
- `NotionCardCache`: Notion 카드 snapshot을 저장한다. 전체 복제본이 아니라 후보 표시와 월별 분석에 필요한 cache이다.
- `WorkEntryNotionCard`: 저장된 `WORK` entry와 Notion 카드의 매핑 및 배분 시간을 저장한다.
- `NotionSyncRun`: 날짜/월/schema 같은 scope별 동기화 결과, 실패 메시지, partial 여부를 저장한다.
- `ReminderLog`: 사용자별 날짜와 리마인더 유형의 발송 기록을 저장해 n8n 재시도나 중복 실행 시 같은 리마인더가 반복 발송되지 않게 한다.

## Holiday Sync

- 관리자가 설정에서 공공데이터포털 서비스 키를 저장한다.
- 앱은 월 데이터가 필요할 때 해당 월의 `HolidayFetchLog`가 없고 서비스 키가 있을 경우에만 `getRestDeInfo`를 호출한다.
- 조회된 공휴일은 `Holiday`에 저장하고, fetch 완료 월은 `HolidayFetchLog`에 기록한다.
- 관리자는 설정에서 현재 표시 중인 월의 공휴일 캐시를 리셋할 수 있다.

## Reminders And n8n

- aJam은 내부 API `POST /api/internal/reminders/daily-timesheet`로 당일 업무 기록 미작성 사용자를 계산한다.
- 내부 API는 `AJAM_INTERNAL_API_TOKEN` bearer token으로 보호한다.
- 날짜가 전달되지 않으면 `Asia/Seoul` 기준 오늘을 사용한다.
- 주말, 공휴일, 휴가-only, 수동 공휴일 entry는 리마인더 대상에서 제외한다.
- 업무 entry가 있어도 내용이 비어 있으면 미작성으로 본다.
- aJam은 내부 API `POST /api/internal/notion/daily-maintenance`로 사용자별 Notion 연결을 점검하고, 선택 날짜 기준 열린 카드 캐시와 진행중 카드의 mapped number/date fields를 갱신한다.
- n8n은 `packages/n8n-nodes-ajam` custom node package의 `aJam` node를 통해 리마인더 API와 Notion daily maintenance API를 호출한다.
- `aJam` n8n node의 두 번째 output은 Notion daily maintenance 실패가 있을 때만 alert item을 내보내므로, Email/Slack node를 IF 없이 직접 연결할 수 있다.
- 퇴근시간 스케줄과 실제 이메일 발송은 n8n workflow가 담당한다.

## Data Flow

- `/timesheet` 서버 컴포넌트가 서버 기준 현재 월의 기록, 공휴일, 프로젝트, 휴가, 사용자/설정 데이터를 조회해 클라이언트 작업 공간에 전달하고, 클라이언트는 브라우저 기준 현재 월과 다르면 해당 월을 추가 조회한다.
- 월 이동 시 클라이언트가 server action으로 해당 월 데이터를 추가 조회한다.
- 오른쪽 패널에서 저장을 누르면 `saveTimesheetEntryAction`이 `TimesheetEntry`를 upsert한다.
- save-time AI cleanup은 저장 성공 후 별도 server action으로 실행한다. 일반 저장 결과와 AI 결과는 분리하며, AI 실패는 저장 성공을 되돌리지 않는다.
- 휴가 기록은 저장 시 `Vacation`에도 upsert하고, 업무/공휴일로 바꾸면 해당 날짜의 휴가 레코드는 삭제한다.
- 새 업무 기록을 작성할 때 이전 업무일의 프로젝트가 자동으로 기입된다.
- Notion 카드 후보는 업무 entry에 명시적으로 매핑될 때만 분석에 포함된다.
- Notion API 장애가 발생해도 업무 기록 저장은 계속 가능하며, 후보 조회는 캐시 fallback을 사용한다.
- 저장하지 않은 상태에서 날짜/월을 이동하려 하면 앱 모달로 확인한다.
- 앱은 런타임에서 필요한 테이블과 컬럼을 `CREATE TABLE IF NOT EXISTS` 및 보정 쿼리로 보장한다. Notion 카드 동기화 스키마의 SQL reference는 `docs/db-migrations/2026-06-15-notion-card-sync.sql`에 둔다.

## Deployment

- `Dockerfile`은 Next.js 앱을 빌드하고 production 서버를 실행한다.
- `docker-compose.example.yml`은 GHCR `ghcr.io/junglesub/ajam:latest` 이미지를 사용하고 SQLite 파일을 서버의 `./ajam-data`에 둔다.
- GitHub Actions는 image 검증 성공 후 GHCR에 `latest`, commit SHA, `v<run-number>-<yymmdd>` 태그를 push한다.
- GitHub Actions는 n8n node 검증 성공 후 `packages/n8n-nodes-ajam`을 GitHub Packages npm registry에 `@junglesub/n8n-nodes-ajam`으로 publish한다.
- GHCR image publish는 웹 앱, DB/domain/ui 패키지, Docker, workspace 설정이 변경된 경우에만 실행한다.
- n8n package publish는 `packages/n8n-nodes-ajam` 또는 workspace/package 설정이 변경된 경우에만 실행한다.
- 컨테이너 시작 시 `pnpm db:seed`로 스키마와 초기 관리자 계정을 보장한다.
- `SESSION_SECRET`은 선택값이다. 지정하면 세션 서명에 사용하고, 지정하지 않으면 앱이 랜덤 값을 생성해 DB `AppSetting`에 저장한 뒤 재사용한다.

## CI

image 검증 기준은 install, lint, typecheck, web build이다. n8n node 검증 기준은 install, n8n node typecheck, n8n node build이다. `main` 브랜치 push에서는 관련 파일 변경이 있는 publish 대상만 해당 검증 성공 후 배포한다.
