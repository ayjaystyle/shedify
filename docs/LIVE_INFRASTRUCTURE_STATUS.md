# Live infrastructure verification — 2026-10-09

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
