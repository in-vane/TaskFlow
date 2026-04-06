FROM node:22-alpine AS dev
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack pnpm install --frozen-lockfile=false
COPY . .
CMD ["corepack", "pnpm", "--filter", "@taskflow/worker", "dev"]

FROM node:22-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack pnpm install --frozen-lockfile=false
COPY . .
RUN corepack pnpm --filter @taskflow/shared-types build && corepack pnpm --filter @taskflow/worker build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack pnpm install --prod --frozen-lockfile=false
COPY --from=builder /workspace/apps/worker/dist apps/worker/dist
COPY --from=builder /workspace/packages/shared-types/dist packages/shared-types/dist
CMD ["node", "apps/worker/dist/main.js"]
