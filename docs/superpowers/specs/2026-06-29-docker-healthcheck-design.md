# Docker Healthcheck Design

## Context

aJam runs as a Next.js standalone server in Docker. The runner image starts by executing `pnpm db:seed`, then launches `node apps/web/server.js` on `PORT`, defaulting to `3000`. The existing deployment example uses `ghcr.io/junglesub/ajam:latest` with a persistent SQLite volume at `/data`.

## Design

Add a lightweight unauthenticated `GET /api/health` route that returns `200` JSON when the Next.js server can accept requests. The route should not query SQLite or external services; Docker healthchecks are intended to verify the app process and HTTP listener, not all downstream readiness.

Add a Docker image `HEALTHCHECK` that uses the already-present Node runtime and built-in `fetch` with top-level `await` to request `http://127.0.0.1:${PORT}/api/health`. This avoids installing curl or wget in the production image and ensures connection failures make the command exit non-zero.

Mirror the same healthcheck in `docker-compose.example.yml` so operators can see the timing values and override them if needed.

## Verification

Run a focused TypeScript check for the web package after implementation. Do not run `pnpm build` unless the user explicitly asks for a build.
