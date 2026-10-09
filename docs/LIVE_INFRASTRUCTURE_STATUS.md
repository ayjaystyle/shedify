# Live infrastructure verification — 2026-10-09

## Current integration status

Supabase organization `ayjay` (`sphghnylvcelggmarpzs`), project `shedify`, ID `nhfgpufvehavkvaklgbr`, URL https://nhfgpufvehavkvaklgbr.supabase.co, region eu-west-1. Dashboard status Healthy.

All four existing migrations applied in order through the live SQL editor, each in a transaction, after verifying the public schema was empty. Each returned success. SQL-editor application does not automatically populate CLI migration history. Verified 22 public tables, all with RLS enabled.

`scripts/verify-live-rls.sql` passed on live PostgreSQL: two-hospital isolation, ward administrator scope, nurse reads, denied writes and denied role escalation. Fixtures were rolled back. `scripts/verify-live-services.mjs` passed against real Supabase Auth/Data APIs: three confirmed fictional users signed in, getUser verified their identity, hospital onboarding and persisted ward reread succeeded, JWT tenant isolation and denied nurse writes/role escalation passed. Confirmed API-created users do not test registration emails. Fictional fixtures remain isolated for real solver testing; their credentials are in an ignored private manifest.

Vercel account `ayjay2`, project `shedify`, ID `prj_YPi5e4h503h6CAwzO4XGSF2bwYjJ`. GitHub repository connected, root directory `./`, Next.js preset. Production branch tracking saved as `develop/shedify-greenfield`. Assigned domain https://shedify.vercel.app; application deployment verification pending. Initial default-main import used the empty baseline and failed to find Next.js; branch tracking was corrected before the application deployment.

Configured Production Config variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_APP_URL. Configured Production Secrets: SUPABASE_SERVICE_ROLE_KEY and TIMEFOLD_API_KEY. The existing Supabase server secret key authorizes the service role. No secret values printed or committed. CRON_SECRET private entry and Vault/Cron setup are in progress.

Supabase Site URL saved as https://shedify.vercel.app. Redirect allowlist includes its `/auth/callback` and `http://localhost:3000/auth/callback`.

Remaining: deployed build and application-session tests, registration/email confirmation, advisors, durable worker provisioning, real feasible/infeasible Timefold results, validation, candidate persistence and publication. No mocked results substituted for live solver results.

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
