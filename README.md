# aJam

매일 업무 내용을 기록하고 월말 업무 기록 입력을 빠르게 준비하는 사내 업무 기록 서비스입니다.

## 주요 기능

- 로그인 보호가 적용된 업무 기록 화면
- 월간 캘린더/리스트와 날짜별 상세 편집 패널
- 프로젝트 직접 등록, 저장된 프로젝트 선택, 전일 프로젝트 자동 기입
- 날짜별 업무/휴가/공휴일 기록 저장
- 한국 공휴일 `getRestDeInfo` 조회, 월별 캐시, 관리자 리셋
- 사용자 계정 설정과 관리자 사용자 추가
- 공공데이터포털 서비스 키를 관리자 설정에서 저장/테스트

## 로컬 시작

```bash
corepack enable
pnpm install
pnpm db:generate
pnpm db:seed
pnpm dev
```

초기 seed는 ADMIN 권한 사용자가 없을 때만 `admin` 관리자를 생성합니다. 최초 비밀번호는 `1234`이며, 배포 후 설정 화면에서 변경하세요. 이후 관리자 username을 바꿔도 ADMIN 사용자가 남아 있으면 새 `admin` 계정은 다시 생성하지 않습니다.

## 배포 예시

GitHub Actions가 `main` 브랜치 push 시 GHCR에 이미지를 publish합니다. 서버에서는 `docker-compose.example.yml`을 복사하고 `ghcr.io/junglesub/ajam:latest` 이미지를 사용해 실행합니다.

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose pull
docker compose up -d
```

컨테이너 시작 시 `pnpm db:seed`로 스키마와 초기 관리자 계정을 보장한 뒤 Next.js 서버를 시작합니다. SQLite DB는 서버의 `./ajam-data` 디렉터리에 저장됩니다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 선택 | 로컬: `file:./packages/db/prisma/dev.db`, Docker: `file:/data/timesheet.db` | SQLite DB 파일 경로입니다. |
| `SESSION_SECRET` | 선택 | 없음 | 지정하면 세션 서명에 사용합니다. 지정하지 않으면 앱 시작 시 랜덤 값을 생성해 DB의 `AppSetting`에 저장하고 재사용합니다. |
| `NODE_ENV` | 선택 | 실행 환경 기준 | `production`이면 세션 쿠키에 secure 옵션을 적용합니다. |
| `PORT` | 선택 | `3000` | Next.js 서버 포트입니다. |
| `HOSTNAME` | 선택 | `0.0.0.0` in Docker | 서버 bind 주소입니다. |

공공데이터포털 서비스 키는 환경변수가 아니라 관리자 설정 화면에서 저장합니다.

## 구조

- `apps/web`: Next.js 웹 앱
- `packages/db`: Prisma + SQLite, schema bootstrap, seed, 서버 전용 DB 유틸
- `packages/domain`: 날짜/상태/업무 기록 도메인 규칙
- `packages/ui`: 공통 UI 컴포넌트
- `docs`: 제품과 구현 결정 문서

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm build
```
