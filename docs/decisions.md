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

## Pending

- AI 번역/요약을 OpenAI API로 처리할 때의 모델, 프롬프트, 비용 제어 정책
- Jamis Chrome extension의 자동 입력 방식과 사용자 확인 플로우
- 월별 마감/제출 상태 모델
