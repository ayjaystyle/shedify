# Connect Shedify to Supabase and Vercel

## Live installation — 2026-10-09

The existing installation is connected to real Supabase, Vercel and Timefold. Production is https://shedify.vercel.app. See [current verification results](LIVE_INFRASTRUCTURE_STATUS.md) before creating any new project. The instructions below also support a fresh installation. Current development access is restricted to authorized accounts, with public signup disabled and email verification enabled. Custom SMTP is a future unrestricted-registration requirement, not a development blocker. See [demonstration guide](DEMONSTRATION.md).

## 1. Supabase project

1. Open https://supabase.com/dashboard and sign in yourself. Check for an existing `shedify` project. If none exists, create a project named `shedify` in your chosen organization and region. Enter its database password privately in Supabase; do not send it in chat.
2. Copy the actual project URL and publishable key from the project's Connect dialog. Store them in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Store the server-only service-role key as `SUPABASE_SERVICE_ROLE_KEY`. Do not use a service key in a `NEXT_PUBLIC_*` variable.
4. Apply the four numbered files in `supabase/migrations/` in order, then `supabase/live-privileges.sql`, using the SQL editor or the Supabase CLI against this project. Back up any existing database first. These migrations assume a fresh database. SQL Editor execution does not populate CLI migration history automatically; reconcile history before subsequent CLI migration pushes.
5. Under Authentication URL settings, set the Site URL to the actual application origin and allow `/auth/callback` for local and deployed origins. Enable email confirmation. Configure password policy, email rate limits and your SMTP provider before production use.
6. Use an authorized account provisioned through the permitted Supabase invitation/confirmation workflow, then create your hospital. Public signup is closed during development. Hospital onboarding makes you administrator only of the new hospital; existing hospital roles are granted by a hospital administrator.

Official SSR setup: https://supabase.com/docs/guides/auth/server-side/creating-a-client

## 2. Local environment

Copy `.env.example` to `.env.local` and replace placeholders locally. Also configure:

- `TIMEFOLD_API_KEY`: your existing Timefold key, server-only.
- `CRON_SECRET`: at least 32 random characters, server-only.
- `NEXT_PUBLIC_APP_URL`: the real origin, `http://localhost:3000` for local development.

Use Node 24, then `npm ci`, `npm run dev`. In a separate terminal, run `node --env-file=.env.local scripts/run-worker.mjs` to process persisted jobs without depending on a browser session. Worker logs contain HTTP status only.

Do not paste secrets in chat. `.env.local` is ignored by Git.

## 3. Vercel deployment

1. Open https://vercel.com/dashboard and sign in yourself. Check for an existing `shedify` project and its Git connection before creating another.
2. Import `ayjaystyle/shedify`, name the project `shedify`, select Next.js, and use the repository root directory.
3. In Git settings, use `develop/shedify-greenfield` for the deployment being verified. Do not merge to `main` merely to trigger a deployment.
4. Add environment variables from `.env.example` through Vercel's secure environment settings. Add keys separately for the intended Preview/Production environment. Never enter secrets in source files.
5. Obtain the actual deployment origin. Set `NEXT_PUBLIC_APP_URL` to that origin and update Supabase's Site URL and callback allowlist. Redeploy after environment changes.
6. Verify sign-in, hospital/ward isolation, database migrations, and real scheduling before allowing operational hospital use.

No deployed URL is assumed or invented in this document.

## 4. Persistent background scheduling

Vercel Hobby cron allows only daily jobs, which is too infrequent for asynchronous roster solving. Use Supabase Cron plus `pg_net` and Vault rather than adding a paid dependency. In Supabase Integrations, enable Cron and pg_net. In Vault, privately add `shedify_app_url` (actual deployed HTTPS origin) and `shedify_cron_secret` (same value as Vercel's `CRON_SECRET`). Run `supabase/worker-schedule.sql`, then inspect Cron history and HTTP responses. The secure `/api/cron` endpoint claims one due job per invocation. Increase capacity with an operationally reviewed scheduler if needed.

Official guidance: https://supabase.com/docs/guides/functions/schedule-functions and https://vercel.com/docs/cron-jobs/usage-and-pricing

## 5. Optional fictional data

After creating a development hospital through Shedify, optionally run `supabase/demo.sql` with its actual hospital UUID substituted for the named placeholder. It creates two fictional wards, eight nurses, ranks, qualifications, day/night templates, configurable rules, and separate deliberately infeasible templates. It creates no schedules or fake solver results. Materialize day/night templates for a chosen period and use the infeasible template in a separate period.

## 6. Real verification checklist

Create a fictional hospital and two wards, ranks and qualifications, nurses, shifts and active rules. Generate a candidate with Timefold, wait for the worker to receive its actual result, review validation, and publish only a valid candidate. Link a confirmed nurse account and verify that it sees only its own published assignments. Test a shortage and confirm publication remains blocked. Test a second hospital and a ward administrator for denied access. Submit and approve a duty-change request and verify the published assignment is unchanged.

The real feasible/infeasible generation, validation, persistence, publication, nurse visibility, authentication and isolation checks passed on this installation. Reproduce backend checks with `node --env-file=.env.local scripts/verify-live-services.mjs --application` and then `node --env-file=.env.local scripts/verify-live-timefold.mjs`. These create persistent fictional fixtures and an ignored private credential manifest; run only against an explicitly selected test workflow. Registration email delivery remains pending SMTP configuration. Mocked HTTP and local PostgreSQL tests do not substitute for live verification.
