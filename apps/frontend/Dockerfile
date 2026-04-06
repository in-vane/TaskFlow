FROM node:22-alpine AS dev
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack pnpm install --frozen-lockfile=false
COPY . .
CMD ["corepack", "pnpm", "--filter", "@taskflow/frontend", "dev", "--host", "0.0.0.0", "--port", "5173"]

FROM node:22-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN corepack pnpm install --frozen-lockfile=false
COPY . .
RUN corepack pnpm --filter @taskflow/shared-types build && corepack pnpm --filter @taskflow/frontend build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /workspace/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
