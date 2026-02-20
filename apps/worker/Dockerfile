FROM node:20-slim AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/artifacts/package.json packages/artifacts/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/artifacts packages/artifacts
COPY apps/worker apps/worker
COPY tsconfig.json tsconfig.json
RUN pnpm --filter @voiceci/shared build
RUN pnpm --filter @voiceci/db build
RUN pnpm --filter @voiceci/artifacts build
RUN pnpm --filter @voiceci/worker build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app .
CMD ["node", "apps/worker/dist/index.js"]
