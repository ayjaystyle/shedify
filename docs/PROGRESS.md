# Verified development progress

Branch: `develop/shedify-greenfield`. Repository: https://github.com/ayjaystyle/shedify

Development demonstration stabilization: public signup disabled in Supabase and rejected by the deployed application, confirmation enabled, anonymous auth disabled. No paid email/domain dependency. Missing-password update validation fixed. Real administrator/ward-admin/nurse management and duty-request workflows passed, including access denials and unchanged published assignments. 57 automated tests, lint, TypeScript and production build passed. See DEMONSTRATION.md for hands-on steps and separate functional limits; SMTP is postponed until public registration is needed.

Latest live checkpoint: Supabase project nhfgpufvehavkvaklgbr has all four original migrations plus function privilege hardening applied. Vercel production https://shedify.vercel.app is connected to this development branch. Real password sessions, database persistence, RLS and tenant permissions passed. Real feasible Timefold output was saved, independently validated and published; real infeasible output failed staffing validation and publication was blocked. Supabase Cron/Vault/pg_net authenticated polling returned HTTP 200. Automated suite expanded to 54 passing tests. Public signup email confirmation awaits custom SMTP. Full evidence and real job IDs are in LIVE_INFRASTRUCTURE_STATUS.md.

## 2026-10-09

- GitHub metadata confirmed admin/push permissions. Repository was empty; no existing refs or history existed to back up. No history deleted or force push performed.
- Baseline `76f8d0ca181c1a930870aaf2922615e5882aa39d` saved remotely and verified with `git ls-remote`.
- WIP checkpoint `7e71bee86e7b6fda0c9469bf85eed67bef6bc911` saved through the GitHub app and verified with `git ls-remote`. Command-line Git authentication was unavailable; connector commit/tree/ref operations preserve progress remotely without exposing credentials.
- Core checkpoint `3ef0972a51c0bd1dd8dbd2567b4b0c552e198106` saved and independently verified; all 49 intended files matched the remote tree. GitHub Actions also passed: https://github.com/ayjaystyle/shedify/actions/runs/37977006012
- Implemented Supabase auth routes, hospital onboarding, tenant/ward RLS, composite foreign keys and account linking; hospital, ward, staff, rank, qualification, template, shift, rule, availability and preference management.
- Implemented real Timefold v1 request adapter against retrieved official OpenAPI definitions, durable jobs, leases, bounded polling, uncertain-submission handling, cancellation, candidate persistence, independent validation and transactional publication.
- Implemented responsive management interface, candidate review and editing, published nurse assignment visibility, duty-change submission/review and audit records.
- Added versioned SQL migrations, setup/deployment documentation, Vercel configuration and GitHub Actions verification workflow.
- Executed lint and strict TypeScript checks successfully. Executed the optimized Next.js production build successfully (Next.js 16.4.0). Subsequent expanded tests cover worker transitions, membership role changes, last-administrator protection, published-period mutation restrictions and fictional demo data; see the implementation report for final counts.
- Executed npm audit after dependency remediation: zero vulnerabilities reported.
- Final expanded local verification: 53 tests across five files passed; lint, TypeScript and production build passed again after the safety/UI changes. Tracked-file checks found no private environment files or known secret patterns.

## Required external configuration

No actual Supabase URL, Supabase service credentials, Timefold key, Vercel connection, or cron secret is configured in this environment. See SETUP.md. No live API run or deployment has been claimed.

## Remaining work

- Apply migrations and verify against an actual Supabase project and Auth service.
- Execute the complete real Timefold feasible and infeasible workflows, including publishing and nurse access.
- Deploy to the actual Vercel `shedify` project, configure secure background polling, and verify the deployed application.
- Finish authenticated browser QA, accessibility/modal focus QA, operational monitoring and load tests. Local setup page and sign-in navigation were browser-checked; the preview returned HTTP 200. Requested viewport overrides did not change the exposed browser width, so mobile visual verification remains pending.
- Add safe validated replacement versions for already published rosters; currently publication is immutable and duty request approval does not apply changes.
- Add richer calendar/personal schedule views, pagination, night-specific fairness and shift-type preferences as appropriate.
- Validate scale and audit retention before operational hospital use.

This checkpoint is work in progress, not a declaration of full completion.
