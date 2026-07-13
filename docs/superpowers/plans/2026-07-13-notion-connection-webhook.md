# Notion Connection Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion Connection Webhook으로 카드 변경을 aJam과 Notion 집계 필드에 자동 동기화한다.

**Architecture:** 사용자별 webhook 공개 ID와 verification token을 기존 Notion connection에 저장한다. Route는 서명과 이벤트를 검증하고 기존 Notion 조회·캐시·필드 업데이트 함수를 재사용하는 단일 카드 동기화 함수를 호출한다.

**Tech Stack:** Next.js App Router, TypeScript, SQLite/Prisma raw SQL, Node crypto, React

## Global Constraints

- 새 dependency를 추가하지 않는다.
- 기존 runtime schema 보정 방식을 유지한다.
- token은 암호화 저장하고 로그에 출력하지 않는다.
- 사용자가 요청하지 않았으므로 build는 실행하지 않는다.

---

### Task 1: Webhook persistence and verification

**Files:**
- Modify: `packages/db/src/notion-store.ts`
- Create: `packages/db/src/notion-webhook.ts`
- Create: `packages/db/src/notion-webhook.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `getNotionWebhookSettings(userId)`, `handleNotionWebhook(connectionId, rawBody, signature)`

- [x] Add runtime columns/table for public ID, encrypted verification token, status, event deduplication.
- [x] Add Node `crypto` HMAC verification and event filtering tests.
- [x] Implement verification token capture, signature validation, and duplicate event recording.
- [x] Run the focused test with the package's existing test command.

### Task 2: Single-card sync and route

**Files:**
- Modify: `packages/db/src/notion-sync.ts`
- Modify: `packages/db/src/notion-store.ts`
- Create: `apps/web/src/app/api/notion/webhook/[connectionId]/route.ts`

**Interfaces:**
- Consumes: `handleNotionWebhook(connectionId, rawBody, signature)`
- Produces: `syncSingleNotionCard({ userId, pageId })`

- [x] Expose the existing page normalizer through a single-page Notion GET path.
- [x] Validate the page's data source, upsert its cache row, and call existing work-hours field sync.
- [x] Mark deleted cards stale and process created/updated/undeleted events.
- [x] Return 200/400/401/404 without exposing secrets.
- [x] Run focused tests and TypeScript checks without build.

### Task 3: Connection modal tabs and documentation

**Files:**
- Modify: `apps/web/src/components/notion-cards/notion-connection-modal.tsx`
- Create: `apps/web/src/components/notion-cards/notion-webhook-panel.tsx`
- Modify: `apps/web/src/components/notion-cards/types.ts`
- Modify: `apps/web/src/components/notion-cards/notion-card-workspace.tsx`
- Modify: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Modify: `apps/web/src/app/(app)/notion-cards/page.tsx`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`
- Modify: `docs/db-migrations/2026-06-15-notion-card-sync.sql`

**Interfaces:**
- Consumes: `getNotionWebhookSettings(userId)`
- Produces: accessible `기본 연결`/`자동 동기화` tabs and setup guide.

- [x] Add an authenticated server action that returns the user's webhook URL, status, and verification token needed for Notion verification.
- [x] Add accessible tabs to the existing modal and render setup instructions/status.
- [x] Update architecture, decision, and schema reference documents.
- [x] Run lint/typecheck/tests without build.
