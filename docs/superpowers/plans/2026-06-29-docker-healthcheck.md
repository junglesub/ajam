# Docker Healthcheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an appropriate Docker healthcheck for the aJam web container.

**Architecture:** Expose a tiny Next.js `GET /api/health` route that only proves the web server is responding. Use Node's built-in `fetch` with top-level `await` in Docker healthchecks so the production image does not need extra packages.

**Tech Stack:** Next.js App Router, Dockerfile healthcheck, Docker Compose, pnpm workspace.

---

### Task 1: Health Endpoint

**Files:**
- Create: `apps/web/src/app/api/health/route.ts`

- [ ] **Step 1: Add the health route**

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Run focused typecheck**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: exit code 0.

### Task 2: Docker Healthcheck

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.example.yml`

- [ ] **Step 1: Add image healthcheck**

Add this before `CMD` in `Dockerfile`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node --input-type=module -e "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health'); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"
```

- [ ] **Step 2: Add compose healthcheck example**

Add this under the `ajam` service:

```yaml
    healthcheck:
      test:
        - CMD
        - node
        - --input-type=module
        - -e
        - "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health'); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
```

- [ ] **Step 3: Inspect the resulting diff**

Run: `git diff -- Dockerfile docker-compose.example.yml apps/web/src/app/api/health/route.ts`

Expected: only the health route and healthcheck configuration changed.

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Document the health endpoint and Docker behavior**

Update deployment documentation to say the container checks `GET /api/health` with Node's built-in `fetch`.

- [ ] **Step 2: Verify docs and TypeScript**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: exit code 0.

## Self-Review

- Spec coverage: the plan adds the endpoint, Docker image healthcheck, compose example, and documentation.
- Placeholder scan: no placeholders remain.
- Type consistency: the route uses App Router `GET` and `NextResponse`, matching existing API route patterns.
