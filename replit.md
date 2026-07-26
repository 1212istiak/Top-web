# TVR Dubbers

Bangla-dubbed donghua streaming website. "We Believe in Quality" — a premium, cinematic fan-made streaming hub for Bangla-dubbed Chinese animation.

## Run & Operate

- `pnpm --filter @workspace/tvr-dubbers run dev` — run the frontend (port auto-assigned by workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind v4, Wouter routing, React Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (jsonwebtoken) + bcrypt (admin auth)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/tvr-dubbers/` — React frontend (full streaming UI)
- `artifacts/api-server/` — Express REST API
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — Drizzle schema (episodes, comments, reactions, settings, trailer, voiceArtists, admin)

## Admin Panel

- Navigate to `/admin` or click the site title **5 times** to reveal the password modal
- Default password: `rocky@17`
- JWT stored in localStorage as `tvr_admin_token`

## Architecture decisions

- Single-page home with scroll sections; admin at `/admin`
- Glassmorphism dark-first UI; #020408 base
- Color-cycling gradient keyframe animation on headings/tile borders
- GPU-accelerated cursor orbit + sparkle canvas (pauses on hidden tab, reduces on low-end devices)
- Rate limiting: 3 comments/min per IP, 5 login attempts/15min per IP
- Reactions: one per visitor per episode (localStorage visitorId)
- All DB seeding happens at server startup (idempotent check)

## Deployment (planned)

- Frontend → Vercel (static build output)
- Backend → Render.com (Node.js web service)
- Database → Turso (SQLite-compatible cloud DB)
- Required env vars on Render: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `FRONTEND_URL`, `JWT_SECRET`

## User preferences

- Base theme color: #020408
- Title: TVR Dubbers (admin-editable)
- Default admin password: rocky@17
