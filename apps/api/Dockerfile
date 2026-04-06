FROM node:22-alpine AS dev
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY prisma prisma
RUN corepack pnpm install --frozen-lockfile=false && corepack pnpm prisma generate --schema prisma/schema.prisma
COPY . .
CMD ["corepack", "pnpm", "--filter", "@taskflow/api", "dev"]

FROM node:22-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY prisma prisma
RUN corepack pnpm install --frozen-lockfile=false && corepack pnpm prisma generate --schema prisma/schema.prisma
COPY . .
RUN corepack pnpm --filter @taskflow/shared-types build && corepack pnpm --filter @taskflow/api build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY prisma prisma
RUN corepack pnpm install --prod --frozen-lockfile=false && corepack pnpm prisma generate --schema prisma/schema.prisma
COPY --from=builder /workspace/apps/api/dist apps/api/dist
COPY --from=builder /workspace/packages/shared-types/dist packages/shared-types/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
