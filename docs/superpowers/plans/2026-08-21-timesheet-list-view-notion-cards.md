# Timesheet List View Notion Card Integration Implementation Plan

**Goal:** aJam 업무기록 리스트 뷰(List View)에서 캘린더 뷰(Calendar View)처럼 Notion 카드 정보를 상시 확인하고 편집할 수 있도록 개선합니다.

**Architecture:**
1. **리스트 테이블 인라인 표시:** `ListView`의 각 `WORK` 엔트리 행에 연결된 Notion 카드 목록(`entry.notionCards`)을 카드 칩(제목, 배분 시간, 상태 등) 형태로 인라인 렌더링.
2. **우측 편집 패널 상시 노출:** 데스크톱(`lg:`) 환경에서 `viewMode === "list"`일 때도 우측 `Daily Editor` 패널(`NotionCardLinkSection` 포함)을 상시 유지하는 2단 반응형 그리드 적용.
3. **선택 및 실시간 동기화:** 리스트 행 클릭 시 우측 편집기에서 해당 엔트리의 Notion 카드 배분/연결 상태를 즉시 수정하고 리스트 뷰에 동기화.

---

## 1. 개요 및 요구사항

### 1.1 현황 및 문제점
- **캘린더 뷰:** 데스크톱에서 우측 패널이 상시 노출되어 선택된 날짜의 Notion 카드 연결 상태를 항상 확인하고 편집할 수 있음.
- **리스트 뷰:**
  - 테이블 행 내에 상태, 시간, 프로젝트, 내용, AI 번역본만 표시되며 Notion 카드 정보가 누락되어 있음.
  - 우측 패널이 기본적으로 숨겨져 있어(`isDailyEditorRequested`가 false) 리스트 뷰 진입 시 Notion 카드 정보를 바로 볼 수 없음.

### 1.2 목표 UX/UI
- 리스트 뷰에서도 데스크톱 화면에서 우측 패널(NotionCardLinkSection 포함)을 상시 표시.
- 리스트 테이블 각 행에 연결된 Notion 카드 칩(이름, 배분 시간 `Xh`)을 직접 노출하여 스크롤하면서 전체 일정의 Notion 카드 연결 현황을 한눈에 파악 가능.
- 미연결 또는 시간 불일치 시 경고 아이콘 노출.

---

## 2. 세부 설계

```mermaid
flowchart LR
    subgraph ListViewLayout [리스트 뷰 레이아웃 (2단 그리드)]
        direction TB
        subgraph Table [좌측 리스트 테이블]
            Header[헤더: 상태 | 시간 | 프로젝트 | Notion 카드 | 내용 | AI 번역본]
            Row[날짜 / 엔트리 행]
            Chips[Notion 카드 칩 / 경고 아이콘]
            Row --> Chips
        end
        subgraph SidePanel [우측 상세 패널 (상시 노출)]
            Editor[Daily Record Editor]
            NotionSection[NotionCardLinkSection]
            Editor --> NotionSection
        end
    end
    Table <-->|선택 및 실시간 동기화| SidePanel
```

### 2.1 리스트 뷰 테이블 구조 확장
- **컬럼 그리드 확장 또는 인라인 칩 통합:**
  - 옵션 A: 독립 컬럼 `[상태] [시간] [프로젝트] [Notion 카드] [내용] [AI 번역본]`
  - 옵션 B: 프로젝트 열 또는 내용 열 상단에 Notion 카드 뱃지/칩 컴팩트 렌더링
- **카드 칩 내용:**
  - 카드 제목 (`card.title` or `link.title`)
  - 배분 시간 (`link.allocatedHours + "h"`)
  - 자동/수동 배분 여부 및 경고 상태

### 2.2 레이아웃 및 패널 제어
- `TimesheetWorkspace`의 데스크톱 그리드 레이아웃 조건에서 리스트 뷰도 우측 패널을 기본 표시하도록 변경:
  - 데스크톱(`lg:`): 2단 그리드(`lg:grid-cols-[minmax(680px,1fr)_420px]`) 상시 유지
  - 모바일/태블릿: 기존 반응형 모달/드로어 방식 유지

---

## 3. 영향 파일 및 컴포넌트

1. `apps/web/src/components/timesheet/timesheet-workspace.tsx`
   - `ListView` 컴포넌트: Notion 카드 칩 및 컬럼 렌더링 추가
   - `TimesheetWorkspace` 메인 뷰: 리스트 뷰 데스크톱 패널 상시 노출 처리
2. `apps/web/src/components/timesheet/notion-card-link-section.tsx`
   - 카드 포맷터 및 배분 시간 유틸리티 공유
3. `packages/domain/src/timesheet.ts` / `packages/domain/src/notion-cards.ts`
   - `TimesheetEntryNotionCardDraft` 도메인 타입 참조
4. `docs/timesheet-workflow.md`
   - 리스트 뷰 Notion 카드 표시 및 레이아웃 정책 업데이트

---

## 4. 단계별 실행 계획 (Task Checklist)

### Task 1: ListView 컴포넌트에 Notion 카드 인라인 렌더링 추가
- [ ] `ListView` 컴포넌트에 `entry.notionCards` 렌더링 로직 추가
- [ ] 연결된 카드가 있는 경우 Notion 카드 칩(제목, 배분 시간 `Xh`) 표시
- [ ] 카드가 없거나 시간 불일치 시 `NotionCardWarningIcon` 표시
- [ ] 말줄임(`truncate`) 및 긴 제목 툴팁 처리

### Task 2: 리스트 뷰에서 우측 패널(Daily Editor) 상시 노출 적용
- [ ] 데스크톱(`lg:`) 환경에서 `viewMode === "list"`일 때도 우측 `aside`가 기본 렌더링되도록 레이아웃 조건 수정
- [ ] 리스트 뷰 내 패널 닫기 버튼 동작 정책 정리 (상시 노출 유지 or 토글 지원)
- [ ] 모바일 환경에서 모달/드로어 동작 검증

### Task 3: 리스트 행 선택 및 우측 Notion 편집기 실시간 동기화
- [ ] 리스트에서 행 선택 시 우측 `NotionCardLinkSection`에 해당 엔트리의 카드 및 배분 상태가 즉시 포커스/연동되는지 확인
- [ ] 우측 패널에서 카드 추가/삭제/시간 변경 시 좌측 리스트 뷰 칩에 즉시 반영

### Task 4: 문서화 및 검증
- [ ] `docs/timesheet-workflow.md`에 리스트 뷰 Notion 카드 표시 관련 정책 기록
- [ ] TypeScript 타입 검사 (`pnpm --filter @timesheet/web typecheck`)
- [ ] 데스크톱 및 모바일 UI 인터랙션 수동 테스트

---

## 5. 검증 시나리오

1. **리스트 뷰 진입 시 상시 노출 확인**: 리스트 뷰 탭으로 전환했을 때 우측에 Notion 카드가 포함된 Daily Editor 패널이 닫히지 않고 바로 표시되는지 확인.
2. **리스트 행 카드 칩 확인**: 여러 개의 카드가 연결된 엔트리, 1개 연결된 엔트리, 미연결 엔트리가 리스트 테이블에서 각각 올바른 칩/경고 아이콘으로 표시되는지 확인.
3. **수정 및 실시간 연동**: 우측 패널에서 Notion 카드를 연결하거나 배분 시간을 수정했을 때 리스트 테이블에 즉시 반영되는지 확인.
4. **반응형 테스트**: 브라우저 창 크기를 조절하여 모바일, 태블릿, 데스크톱 각각의 레이아웃이 정상 동작하는지 확인.
