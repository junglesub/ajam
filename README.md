# aJam

매일 업무 내용을 기록하고 월말 업무 기록 입력을 빠르게 준비하는 사내 업무 기록 서비스입니다.

## 주요 기능

- 로그인 보호가 적용된 업무 기록 화면
- 월간 캘린더/리스트와 날짜별 상세 편집 패널
- 프로젝트 직접 등록, 저장된 프로젝트 선택, 전일 프로젝트 자동 기입
- 날짜별 업무/휴가/공휴일 기록 저장
- 한국 공휴일 `getRestDeInfo` 조회, 월별 캐시, 관리자 리셋
- 사용자 계정 설정과 관리자 사용자 추가
- 사용자 이메일 저장과 n8n 업무 기록 리마인더 연동
- 공공데이터포털 서비스 키를 관리자 설정에서 저장/테스트
- 사용자별 Notion 카드 후보 동기화, 업무 entry별 카드 연결, 완료 카드 투입시간 분석

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

GitHub Actions가 `main` 브랜치 push 시 검증 후 GHCR에 Docker 이미지를 publish합니다.

Published tags:

- `ghcr.io/junglesub/ajam:latest`
- `ghcr.io/junglesub/ajam:<commit-sha>`
- `ghcr.io/junglesub/ajam:v<github-run-number>-<yymmdd>`

서버에서는 `docker-compose.example.yml`을 복사하고 `ghcr.io/junglesub/ajam:latest` 이미지를 사용해 실행합니다.

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose pull
docker compose up -d
```

컨테이너 시작 시 `pnpm db:seed`로 스키마와 초기 관리자 계정을 보장한 뒤 Next.js 서버를 시작합니다. SQLite DB는 서버의 `./ajam-data` 디렉터리에 저장됩니다.
Docker healthcheck는 Node.js 내장 `fetch`로 `GET /api/health`를 호출해 Next.js 서버가 HTTP 요청을 받을 수 있는지 확인합니다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 선택 | 로컬: `file:./packages/db/prisma/dev.db`, Docker: `file:/data/timesheet.db` | SQLite DB 파일 경로입니다. |
| `SESSION_SECRET` | 선택 | 없음 | 지정하면 세션 서명에 사용합니다. 지정하지 않으면 앱 시작 시 랜덤 값을 생성해 DB의 `AppSetting`에 저장하고 재사용합니다. |
| `NODE_ENV` | 선택 | 실행 환경 기준 | `production`이면 세션 쿠키에 secure 옵션을 적용합니다. |
| `PORT` | 선택 | `3000` | Next.js 서버 포트입니다. |
| `HOSTNAME` | 선택 | `0.0.0.0` in Docker | 서버 bind 주소입니다. |
| `AJAM_INTERNAL_API_TOKEN` | n8n 자동화 사용 시 필수 | 없음 | n8n custom node가 내부 리마인더/Notion maintenance API를 호출할 때 사용하는 bearer token입니다. |
| `AJAM_SECRET` | 선택 | DB 저장값 자동 생성 | 사용자별 Gemini API key와 Notion token 암호화에 사용하는 앱 secret입니다. |

공공데이터포털 서비스 키는 환경변수가 아니라 관리자 설정 화면에서 저장합니다.

## 운영 확인

- `GET /api/health`: Docker healthcheck용 liveness endpoint입니다. DB나 외부 API를 조회하지 않고 웹 서버 응답 가능 여부만 확인합니다.

## n8n custom node 설치

aJam 자동화를 위한 n8n custom node package는 `packages/n8n-nodes-ajam`에 있으며 GitHub Packages에 `@junglesub/n8n-nodes-ajam`으로 publish됩니다. 현재 제공 액션은 업무 기록 미작성 대상 조회, 리마인더 발송 기록, Notion daily maintenance입니다.

```bash
pnpm --filter @junglesub/n8n-nodes-ajam build
pnpm --filter @junglesub/n8n-nodes-ajam pack --pack-destination ../../dist
```

n8n 서버의 custom extensions 디렉터리에 package를 설치합니다. 전역 설치가 아니라 n8n custom 디렉터리 안에 설치합니다.

```bash
mkdir -p ~/.n8n/custom
cd ~/.n8n/custom
pnpm add /path/to/ajam/dist/junglesub-n8n-nodes-ajam-0.3.0.tgz
```

GitHub Packages에서 설치하려면 n8n custom 디렉터리의 `.npmrc`에 GitHub Packages registry와 token을 설정한 뒤 설치합니다.

```bash
cd ~/.n8n/custom
pnpm add @junglesub/n8n-nodes-ajam
```

또는 npm을 사용합니다.

```bash
cd ~/.n8n/custom
npm install @junglesub/n8n-nodes-ajam
```

GitHub Packages npm registry는 public package 설치에도 token이 필요합니다. `.npmrc` 파일을 만들지 않고 설치하려면 일회성 CLI 옵션으로 registry와 token을 전달할 수 있습니다.

```bash
pnpm add @junglesub/n8n-nodes-ajam \
  --registry=https://npm.pkg.github.com \
  --//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PACKAGES_TOKEN
```

```bash
npm install @junglesub/n8n-nodes-ajam \
  --registry=https://npm.pkg.github.com \
  --//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PACKAGES_TOKEN
```

Shell마다 특수문자 옵션 처리가 다를 수 있어 운영 서버에서는 `.npmrc` 방식이 가장 안정적입니다.

n8n을 재시작한 뒤 `aJam API` credential을 만들고 `aJam` node를 workflow에 추가합니다. 자세한 내용은 `docs/n8n-custom-node.md`와 `docs/reminders-n8n.md`를 확인하세요.

## 구조

- `apps/web`: Next.js 웹 앱
- `packages/db`: Prisma + SQLite, schema bootstrap, seed, 서버 전용 DB 유틸
- `packages/domain`: 날짜/상태/업무 기록 도메인 규칙
- `packages/n8n-nodes-ajam`: n8n custom node package
- `packages/ui`: 공통 UI 컴포넌트
- `docs`: 제품과 구현 결정 문서

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm build
```
