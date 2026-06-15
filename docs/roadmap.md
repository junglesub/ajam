# Roadmap

## Phase 1 - Login And App Shell

- Monorepo 구성
- DB seed 기반 로그인
- 보호된 aJam 업무 기록 화면
- 캘린더/리스트/편집 패널 UI
- 기본 문서화

Status: Done.

## Phase 2 - Persistent Work Records

- `TimesheetEntry` 저장 모델 추가
- 프로젝트 직접 등록과 선택
- 날짜별 저장/수정 서버 액션
- 월별 완료율과 누락 날짜 계산
- 저장하지 않은 이동 경고 모달

Status: Done.

## Phase 3 - Holidays, Vacation, And Admin Settings

- 한국 공휴일 `getRestDeInfo` 연동
- 월별 공휴일 fetch 캐시
- 관리자 API 키 저장/테스트/리셋
- 휴가 유형 저장
- 휴가/공휴일과 업무 기록의 우선순위 정책 확정
- 관리자 사용자 추가와 사용자 계정 설정

Status: Done.

## Phase 4 - AI Translation And Summary

- 한국어 업무 내용의 영어 번역 생성
- 짧은 버전 자동 요약
- 월말 AI 정리 탭 추가
- 월별 업무 기록 JSON 내보내기
- LLM 복붙용 엄격한 JSON 변환 프롬프트 제공
- LLM 결과 JSON 붙여넣기와 미리보기
- 업무 entry별 `aiTranslation` 및 날짜별 `shortVersion` 일괄 적용
- 추가 수정 요청 프롬프트로 결과 재생성 지원
- 사용자 수정본 보존
- 사용자별 Gemini API key와 모델 설정
- 저장 후 백그라운드처럼 실행되는 AI 번역/요약 자동 정리
- 저장된 업무 기록만 AI 대상으로 삼고 `작성 예정`, `미기입`, draft, 휴가, 공휴일은 제외
- 이전 저장 WORK 날짜를 문체/맥락 샘플로 사용하고, 빈 AI 필드가 있는 과거 저장 WORK 날짜를 제한적으로 보정

## Phase 5 - Jamis Extension

- Chrome extension monorepo app 추가
- 웹 앱에서 월별 내보내기 API 제공
- Jamis 입력 화면 자동 매핑
- 사용자가 제출 전 검수하는 단계 추가

## Phase 6 - Notion Card Sync And Analysis

- 사용자별 Notion internal integration token 연결
- 사용자별 Notion database와 필드 매핑 설정
- Notion 카드 스냅샷 캐시 저장
- 업무 entry별 Notion 카드 다중 연결
- 이전 업무일 카드 기본 선택
- 완료 카드의 기간 기반 추정 시간과 업무기록 연결 시간 분석
- 카테고리별 필터와 요약
- 이후 OAuth와 webhook 동기화로 확장 가능한 연결 모델 유지

Status: Planned. See `docs/superpowers/specs/2026-06-15-notion-card-sync-design.md`.
