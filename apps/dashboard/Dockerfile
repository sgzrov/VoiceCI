FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

# ---- deps ----
FROM base AS deps
COPY apps/dashboard/package.json ./
RUN npm install

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
# Copy source files explicitly to avoid node_modules collision
COPY apps/dashboard/package.json ./
COPY apps/dashboard/tsconfig.json ./
COPY apps/dashboard/next.config.js ./
COPY apps/dashboard/tailwind.config.ts ./
COPY apps/dashboard/postcss.config.js ./
COPY apps/dashboard/components.json ./
COPY apps/dashboard/src ./src
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
