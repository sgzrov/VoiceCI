FROM node:20-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/scenarios/package.json packages/scenarios/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/metrics/package.json packages/metrics/package.json
COPY apps/runner/package.json apps/runner/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/runner apps/runner
COPY demo demo
COPY tsconfig.json tsconfig.json
RUN pnpm --filter @voiceci/shared build
RUN pnpm --filter @voiceci/config build
RUN pnpm --filter @voiceci/scenarios build
RUN pnpm --filter @voiceci/adapters build
RUN pnpm --filter @voiceci/metrics build
RUN pnpm --filter @voiceci/runner build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app .
CMD ["node", "apps/runner/dist/index.js"]
