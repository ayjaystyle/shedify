# Live infrastructure verification — 2026-10-09

## Current integration status

Development policy updated: public self-registration is disabled in the live Supabase settings and rejected by the application API. Email confirmation remains enabled, anonymous sign-in remains disabled, and existing authorized accounts continue to sign in. Built-in email is used only within its permitted development recipient/rate limits. No paid service or domain was purchased. Custom SMTP is postponed until unrestricted public registration is needed, not a blocker for the current demonstration. See DEMONSTRATION.md for role walkthroughs and functional boundaries.

Supabase organization `ayjay` (`sphghnylvcelggmarpzs`), project `shedify`, ID `nhfgpufvehavkvaklgbr`, URL https://nhfgpufvehavkvaklgbr.supabase.co, region eu-west-1. Dashboard status Healthy.

All four existing migrations applied in order through the live SQL editor, each in a transaction, after verifying the public schema was empty. Each returned success. SQL-editor application does not automatically populate CLI migration history. Verified 22 public tables, all with RLS enabled.

`scripts/verify-live-rls.sql` passed on live PostgreSQL: two-hospital isolation, ward administrator scope, nurse reads, denied writes and denied role escalation. Fixtures were rolled back. `scripts/verify-live-services.mjs` passed against real Supabase Auth/Data APIs: three confirmed fictional users signed in, getUser verified their identity, hospital onboarding and persisted ward reread succeeded, JWT tenant isolation and denied nurse writes/role escalation passed. Confirmed API-created users do not test registration emails. Fictional fixtures remain isolated for real solver testing; their credentials are in an ignored private manifest.

Vercel account `ayjay2`, project `shedify`, ID `prj_YPi5e4h503h6CAwzO4XGSF2bwYjJ`. GitHub repository connected, root directory `./`, Next.js preset. Production branch tracking saved as `develop/shedify-greenfield`. Production https://shedify.vercel.app is accessible. Deployment `dpl_2sYPV9nuBM7UbWQtBmT1wFT8kS5N` built commit `718e66d9942efecfdb185a244a85dd5549da378e` successfully. Actual application login established the SSR session cookie and authenticated workspace access. Anonymous workspace and worker requests returned 401. Initial default-main import used the empty baseline and failed to find Next.js; branch tracking was corrected before the application deployment.

Configured Production Config variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_APP_URL. Configured Production Secrets: SUPABASE_SERVICE_ROLE_KEY, TIMEFOLD_API_KEY and CRON_SECRET. The existing Supabase server secret key authorizes the service role. No secret values printed or committed. User privately saved the same CRON_SECRET in Supabase Vault as `shedify_cron_secret`; `shedify_app_url` is the actual production origin. Installed pg_cron and pg_net and scheduled `shedify-worker` every minute using `supabase/worker-schedule.sql`. A real scheduled request returned HTTP 200, no timeout/error, and `processed:false` when no job was due.

Supabase Site URL saved as https://shedify.vercel.app. Redirect allowlist includes its `/auth/callback` and `http://localhost:3000/auth/callback`.

Real Timefold feasible job `090ef8b8-a970-4ed6-a913-9a4d31012e90` completed through deployed application endpoints. Four fictional nurses received four actual generated assignments for daytime/overnight shifts. Candidate `3d7813c0-a324-48c5-844a-a17c4affc7c1` persisted, passed independent validation with zero violations, was reviewed/validated and published by the administrator. The linked nurse account saw only its own published assignments.

Real infeasible job `2801e3fd-f7dc-4e32-970a-bd25689e84c2` completed with four assignments for a shift requiring five staff. Candidate `1fae06fa-5538-40a4-ba80-e3f75d44f6cf` failed independent minimum-staffing validation. Publication returned 409 and was blocked. `scripts/verify-live-timefold.mjs` reproduces both flows against real services. No mocked results substituted for live solver results.

Applied `supabase/live-privileges.sql` after the four migrations: no anonymous SECURITY DEFINER execution remains; authenticated RLS/onboarding/role helpers retain required execution. Moved btree_gist to extensions. Security Advisor: zero errors, ten warnings (nine intentional authenticated SECURITY DEFINER helpers with caller/role checks; leaked-password protection disabled). Automated suite: 54 tests across five files passed; lint passed.

Postponed release requirement: unrestricted public registration and reliable email-confirmation delivery. Custom SMTP remains disabled by choice; no domain or paid provider is required for development. Password logins with confirmed fictional accounts passed, but those do not prove registration emails. Built-in SMTP stays within organization-member recipient and rate limits: https://supabase.com/docs/guides/auth/auth-smtp. Enable public signup only after delivered confirmation/callback tests pass. CLI migration history reconciliation remains separate bookkeeping because the four files were applied through SQL Editor. Official CLI initialization was blocked by filesystem access to its home configuration directory; no migration timestamp was invented. Hardening is saved as a reproducible post-migration SQL operation.

Development stabilization: application registration requests explicitly return 403 before calling Supabase; the login and landing screens explain authorized access and built-in recovery-email limits. Fixed missing-password update requests so they return 400 without attempting an undefined password update. Automated suite: 57 tests across six files passed, including registration rejection, cross-origin rejection and missing-password handling. Lint, strict TypeScript and production build passed. Extended real role workflows are preserved in scripts/verify-live-workflows.mjs.

## Historical access audit — before account setup

The findings below describe the earlier blocked checkpoint and are superseded by the current status above.

Repository: https://github.com/ayjaystyle/shedify
Branch: `develop/shedify-greenfield`
Starting remote commit independently verified: `4edc41d10dcd13c22d831462a4bee961644f94b2`.

The existing application was preserved. The Next.js application, package.json and supabase directory are at the repository root. Vercel must use the repository root, not a `shedify-greenfield` subdirectory.

## Verified access findings

- Plugin management confirms Supabase and Vercel are installed and enabled. This session's available service tools contain no Supabase or Vercel account-management operations. Installed status alone does not establish usable account access.
- The in-app Supabase dashboard redirects to sign-in. Its Continue with ChatGPT option reaches an OpenAI login page; it does not establish an authenticated Supabase session.
- The in-app Vercel dashboard redirects to sign-in. Its Open Vercel Plugin browser tool opens https://vercel.com/plugin, but exposes no usable account-management interface in this session.
- Neither provider CLI is installed. No Supabase, Vercel, Timefold or cron credentials are present as process environment variables, and no private application env file or Vercel project link exists.
- No project absence has been established: project discovery is blocked by access. No project identifiers or deployment URLs have been assumed.
- `.vercel/` is now ignored before any future linking or environment pull. Existing private environment files remain ignored.

## Live verification status

| Item | Status |
| --- | --- |
| Supabase project name, ID and URL | Not discoverable with current access |
| Database migrations | Four existing versioned migrations; not applied to a live project in this session |
| Authentication, persistence, RLS and hospital isolation | Live verification pending account access |
| Vercel project and deployment URL | Not discoverable; no deployment performed |
| Timefold feasible and infeasible API jobs | Not executed; server-side key unavailable to this session |
| Generated roster, validation, save, review and publication | Live workflow pending infrastructure configuration |

The existing automated tests use local PostgreSQL emulation and controlled HTTP fixtures; passing those tests does not establish live provider functionality. No mocked result was used as a live Timefold result.

## Resume prerequisites

Expose the connected Supabase and Vercel account tools in the conversation, or sign into their dashboards in the Codex in-app browser. Do not send credentials in chat. Configure `TIMEFOLD_API_KEY` through the selected Vercel project's secure server-side environment settings. See SETUP.md for the remaining environment variable names.

Then inspect existing projects before creating anything, apply the existing migrations in order to the intended database, configure Auth redirect URLs from the actual deployment origin, configure durable worker polling, and execute both real scheduling scenarios through the application. Do not merge the development branch into main to deploy.
