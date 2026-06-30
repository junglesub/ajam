# syntax=docker/dockerfile:1.7

FROM node:24.15.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.20.0 --activate

FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

RUN pnpm --filter @timesheet/db rebuild better-sqlite3

FROM deps AS build

COPY . .

ARG BUILD_VERSION
ENV BUILD_VERSION=${BUILD_VERSION}

RUN pnpm build

FROM base AS runner

ARG BUILD_VERSION

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/data/timesheet.db \
    BUILD_VERSION=${BUILD_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data \
  && chown -R node:node /data

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/packages/db ./packages/db
COPY --from=build --chown=node:node /app/packages/domain ./packages/domain

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node --input-type=module -e "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health'); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"

CMD ["sh", "-c", "pnpm db:seed && node apps/web/server.js"]
