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

FROM builder AS runner
ENV NODE_ENV=production
ENV CI=true
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
