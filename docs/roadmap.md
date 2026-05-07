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
- 날짜별 생성과 월 단위 일괄 생성
- 사용자 수정본 보존

## Phase 5 - Jamis Extension

- Chrome extension monorepo app 추가
- 웹 앱에서 월별 내보내기 API 제공
- Jamis 입력 화면 자동 매핑
- 사용자가 제출 전 검수하는 단계 추가
