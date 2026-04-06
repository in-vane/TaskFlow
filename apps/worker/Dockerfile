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

FROM builder AS runner
ENV NODE_ENV=production
ENV CI=true
CMD ["node", "apps/worker/dist/main.js"]
