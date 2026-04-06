# TaskFlow

TaskFlow is a learning-oriented full-stack project for practicing Docker Compose based CI/CD with a realistic frontend, API, worker, PostgreSQL, Redis, and staged deployments.

## Stack

- React + Vite + TypeScript frontend
- NestJS + Prisma API
- BullMQ worker
- PostgreSQL and Redis
- Docker Compose for dev, CI, and production layering
- GitHub Actions for validation, image publishing, and deployment

## Repository Layout

```text
.
├─ apps/
│  ├─ api/
│  ├─ frontend/
│  └─ worker/
├─ packages/
│  └─ shared-types/
├─ prisma/
├─ infra/
│  ├─ env/
│  ├─ nginx/
│  └─ scripts/
├─ .github/workflows/
├─ compose.yaml
├─ compose.dev.yaml
├─ compose.ci.yaml
└─ compose.prod.yaml
```

## Local Setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Enable pnpm through Corepack: `corepack enable`.
3. Install dependencies: `corepack pnpm install`.
4. Generate the Prisma client: `corepack pnpm prisma:generate`.
5. Start the stack with Compose:

```bash
docker compose -f compose.yaml -f compose.dev.yaml --profile tools up --build
```

The development Compose file keeps container-side `node_modules` in named volumes so the Linux containers do not fight with macOS host dependencies. If you change dependencies, rebuild the stack with `--build`.

6. Seed demo data into PostgreSQL after the API is up:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec api corepack pnpm prisma:seed
```

Demo login after seeding:

```text
email: demo@taskflow.local
password: taskflow123
```

The browser app now includes a minimal sign-in flow. Business endpoints such as
`/api/projects` and `/api/tasks/:id` require a Bearer access token.

If your machine does not support `docker compose`, the scripts in [infra/scripts/common.sh](/Users/invane/code/test/infra/scripts/common.sh) also support `docker-compose`.

## Key Commands

```bash
corepack pnpm build
corepack pnpm typecheck
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
./infra/scripts/deploy.sh
```

## Compose Layers

- `compose.yaml`: shared service definitions and health checks
- `compose.dev.yaml`: hot reload, host ports, and optional tooling profiles
- `compose.ci.yaml`: CI smoke stack with fixed host ports
- `compose.prod.yaml`: image-based deployment plus Nginx gateway

## Production Notes

- `deploy-prod.yml` is a manual GitHub Actions workflow protected by the `production` Environment.
- `rollback-prod.yml` is a manual GitHub Actions workflow that reuses the same production approval gate.
- `compose.prod.yaml` exposes Nginx on `HTTP_PORT`, which defaults to `80`.
- If you deploy staging and production on the same VPS, use different deploy paths and different host ports.
- Example:
  - staging path: `/opt/taskflow`
  - production path: `/opt/taskflow-prod`
  - staging `HTTP_PORT=80`
  - production `HTTP_PORT=8080`
- If you later buy a second VPS for production, keep `HTTP_PORT=80` there and the rest of the deployment flow can stay the same.

## Release And Rollback

- Production release:
  - Run `Build and Publish Images` on `main`
  - Copy the full commit SHA
  - Run `Deploy Production` with `image_tag=sha-<full-commit-sha>`
- Production rollback:
  - Pick a previously published image tag in the same `sha-<full-commit-sha>` format
  - Run `Rollback Production` with `previous_image_tag=sha-<full-commit-sha>`
- Helpful command:
  - `git log --format='%H %s' -n 10`
  - Use this to map a full commit SHA to the release you want to restore

## Next Learning Steps

1. Replace scaffolded API responses with Prisma-powered persistence.
2. Add authentication guards and refresh token rotation.
3. Add unit, integration, and Playwright tests.
4. Provision a staging server and wire the deploy workflows.
5. Add rollback tracking and migration safety checks.
