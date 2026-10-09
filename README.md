# Shedify

Greenfield hospital nursing roster platform. Implementation in progress; not deployed or production verified.

On 2026-10-09, repository metadata reported size 0 and git ls-remote returned no refs. There was no existing application history to back up. No history was deleted.

Development uses `develop/shedify-greenfield`. Stack: Next.js App Router, TypeScript, Tailwind, Supabase Auth/PostgreSQL with RLS, hosted Timefold Employee Shift Scheduling.

## Run and connect

See [service setup](docs/SETUP.md), [architecture and limitations](docs/ARCHITECTURE.md), and [verified progress](docs/PROGRESS.md).

Use Node 24. Run `npm ci`, configure `.env.local` from `.env.example`, apply the SQL migrations to your Supabase project, then run `npm run dev`. Run `node --env-file=.env.local scripts/run-worker.mjs` separately for background job processing. Production uses the secure worker endpoint scheduled through Supabase Cron.

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Tests distinguish independent validator tests, official OpenAPI contract tests, mocked Timefold HTTP tests, and PGlite PostgreSQL/RLS tests with emulated Supabase Auth. None of these establishes live Timefold or deployment success.

## Status

The core application is implemented locally. Supabase provisioning, live authentication/email, genuine feasible/infeasible Timefold runs, and Vercel deployment remain unverified. The application must not be treated as production-ready until those checks and the documented remaining work are completed.
