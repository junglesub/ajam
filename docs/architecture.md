# Architecture

## Workspace

이 저장소는 pnpm monorepo로 구성한다.

- `apps/web`: Next.js App Router 기반 웹 앱
- `packages/db`: Prisma, SQLite, schema bootstrap, seed, 서버 전용 DB 유틸
- `packages/domain`: 날짜, 상태, 업무 기록 도메인 타입과 순수 함수
- `packages/ui`: Tailwind 기반 공통 UI 컴포넌트
- `docs`: 제품/구현 결정과 후속 작업 기록

## Authentication And Users

- `User`는 SQLite에 저장한다.
- `User.role`은 `ADMIN` 또는 `USER` 문자열로 관리한다.
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

## Holiday Sync

- 관리자가 설정에서 공공데이터포털 서비스 키를 저장한다.
- 앱은 월 데이터가 필요할 때 해당 월의 `HolidayFetchLog`가 없고 서비스 키가 있을 경우에만 `getRestDeInfo`를 호출한다.
- 조회된 공휴일은 `Holiday`에 저장하고, fetch 완료 월은 `HolidayFetchLog`에 기록한다.
- 관리자는 설정에서 현재 표시 중인 월의 공휴일 캐시를 리셋할 수 있다.

## Data Flow

- `/timesheet` 서버 컴포넌트가 현재 월의 기록, 공휴일, 프로젝트, 휴가, 사용자/설정 데이터를 조회해 클라이언트 작업 공간에 전달한다.
- 월 이동 시 클라이언트가 server action으로 해당 월 데이터를 추가 조회한다.
- 오른쪽 패널에서 저장을 누르면 `saveTimesheetEntryAction`이 `TimesheetEntry`를 upsert한다.
- 휴가 기록은 저장 시 `Vacation`에도 upsert하고, 업무/공휴일로 바꾸면 해당 날짜의 휴가 레코드는 삭제한다.
- 새 업무 기록을 작성할 때 이전 업무일의 프로젝트가 자동으로 기입된다.
- 저장하지 않은 상태에서 날짜/월을 이동하려 하면 앱 모달로 확인한다.
- 앱은 런타임에서 필요한 테이블과 컬럼을 `CREATE TABLE IF NOT EXISTS` 및 보정 쿼리로 보장한다. 아직 배포 전이므로 Prisma migration 파일은 두지 않는다.

## Deployment

- `Dockerfile`은 Next.js 앱을 빌드하고 production 서버를 실행한다.
- `docker-compose.example.yml`은 GHCR `ghcr.io/junglesub/ajam:latest` 이미지를 사용하고 SQLite 파일을 서버의 `./ajam-data`에 둔다.
- 컨테이너 시작 시 `pnpm db:seed`로 스키마와 초기 관리자 계정을 보장한다.
- `SESSION_SECRET`은 선택값이다. 지정하면 세션 서명에 사용하고, 지정하지 않으면 앱이 랜덤 값을 생성해 DB `AppSetting`에 저장한 뒤 재사용한다.

## CI

검증 기준은 install, lint, typecheck, build이다. Docker image push 자동화는 아직 연결하지 않았다.
