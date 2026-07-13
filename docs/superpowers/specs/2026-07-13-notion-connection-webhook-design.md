# Notion Connection Webhook Design

## Goal

Notion 카드 속성이 변경되면 aJam 카드 캐시를 자동 갱신하고, 연결된 업무시간·작업일수·가용시간·마지막 작업일을 같은 Notion 카드에 다시 기록한다.

## Architecture

Notion의 무료 Connection Webhook을 사용한다. `page.created`, `page.properties_updated`, `page.deleted`, `page.undeleted` 이벤트를 사용자별 공개 식별자가 포함된 endpoint에서 받고, 최초 verification token을 암호화 저장한 뒤 `X-Notion-Signature` HMAC-SHA256을 검증한다.

실제 처리는 `syncSingleNotionCard(userId, pageId)` 한 경로로 모은다. 이 함수는 Notion 페이지를 조회하고 설정된 data source 소속인지 확인한 뒤 기존 카드 정규화·캐시 upsert·업무 집계·Notion 필드 업데이트 기능을 재사용한다.

## Event Rules

- `page.created`: 페이지가 설정된 data source 소속이면 단일 카드 동기화한다.
- `page.properties_updated`: 제목, 상태, 분류, 시작일, 완료일 중 하나가 바뀐 경우만 동기화한다.
- 업무시간, 작업일수, 가용시간, 마지막 작업일, aJam 업데이트 시간만 바뀐 이벤트는 aJam이 만든 변경으로 보고 무시한다.
- `page.deleted`: 해당 카드 캐시를 stale 처리한다.
- `page.undeleted`: 단일 카드 동기화로 복원한다.
- event ID는 저장해 Notion 재시도를 중복 처리하지 않는다.

## Connection Setup

기존 Notion 연결 modal을 `기본 연결`과 `자동 동기화` 탭으로 나눈다. 자동 동기화 탭에는 사용자별 webhook URL, 구독 이벤트, Notion integration/token 생성과 capability 설정, verification token, 연결 상태, 최근 처리 시각과 오류를 표시한다.

Webhook URL의 공개 연결 ID는 인증 수단이 아니다. 이벤트 실행은 저장한 verification token으로 계산한 HMAC 서명이 일치할 때만 허용한다. token과 서명 원문은 로그에 남기지 않는다.

## Error Handling

verification 요청은 token을 저장하고 200을 반환한다. 서명이 없거나 틀린 이벤트는 401, 알 수 없는 연결은 404, 잘못된 payload는 400을 반환한다. Notion API나 필드 업데이트 실패는 최근 오류에 기록하고 기존 캐시는 보존한다.

## Testing

가장 작은 runnable test에서 HMAC 검증, 입력/출력 속성 필터, verification 처리, 중복 event 무시를 확인한다. 앱 build는 사용자 요청이 없으므로 실행하지 않는다.
