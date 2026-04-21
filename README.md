# Relayroom MVP (Multi-tenant SaaS foundation)

This repository contains a working MVP for Relayroom:

- Multi-tenant incident orchestration (`x-tenant-id` scoped APIs)
- ServiceNow webhook ingestion endpoint
- Slack event ingestion endpoint
- Incident room auto-orchestration for Sev-1 incidents
- Timeline, decision ledger, stakeholder updates, and post-incident artifact packaging
- Lightweight background job processing loop for nudges and artifact-ready events
- Minimal web UI at `/`
- End-to-end tests with Vitest + Supertest
- JWT-based auth for protected incident APIs
- Signed webhook verification for ServiceNow/Slack (`x-relayroom-signature`)
- BullMQ + Redis queue adapter (falls back to in-memory queue when `REDIS_URL` is not set)
- Prisma schema for production PostgreSQL multi-tenant storage

## Run locally

```bash
npm install
cp .env.example .env
npm run setup:local
npm run dev
```

Open `http://localhost:4000`.

## Test

```bash
npm test
```

## Environment

```bash
PORT=4000
JWT_SECRET=relayroom-dev-secret
SERVICENOW_WEBHOOK_SECRET=servicenow-dev-secret
SLACK_WEBHOOK_SECRET=slack-dev-secret
REDIS_URL=redis://localhost:6379   # optional
DATABASE_URL=postgresql://user:pass@localhost:5432/relayroom
```

Generate Prisma client after dependencies are installed:

```bash
npm run prisma:generate
```

Start/stop local infrastructure:

```bash
npm run db:up
npm run db:down
```

## Makefile shortcuts

```bash
make up       # start postgres + redis
make setup    # bootstrap DB schema + seed
make dev      # run API/web app
make test     # run tests
make build    # compile TypeScript
make health   # check API + Postgres + Redis
make down     # stop infrastructure
```

Apply schema and seed manually:

```bash
npm run prisma:migrate
npm run prisma:seed
```

## API quickstart

1. Create tenant: `POST /api/tenants`
2. Create auth token: `POST /api/auth/token`
3. Ingest ServiceNow incident: `POST /api/webhooks/servicenow/incidents` with `x-tenant-id` and `x-relayroom-signature`
4. List incidents: `GET /api/incidents` with `Authorization: Bearer <token>`
5. Incident details: `GET /api/incidents/:incidentId`
6. Slack event: `POST /api/integrations/slack/events` with signature
7. Add decision: `POST /api/incidents/:incidentId/decisions`
8. Generate update: `POST /api/incidents/:incidentId/updates`
9. Resolve incident: `POST /api/incidents/:incidentId/resolve`
