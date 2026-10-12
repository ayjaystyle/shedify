# Nursing policy upgrade — 12 October 2026

Live application: https://shedify.vercel.app. This extends the existing implementation. Public signup remains disabled, email verification and RLS remain intact, and no domain or paid service was purchased.

## Completed controls

Assigned Ward Administrators can edit templates and dated shifts, configure weekday/weekend/special-day staffing with effective dates, manage nurse Morning/Afternoon/Night permissions, record absences/preferences, select fixed Night teams, create rosters, generate/edit candidates, validate and record reviews. Hospital Administrators retain institutional authorization and final publication. Nurses retain their own published roster and duty-request access.

Templates have time pickers, explicit 24-hour previews, same/following-day labels, calculated duration, long-shift warnings and explicit confirmation. Changing hours clears confirmation. Template edits affect new dated shifts; existing dated shifts require explicit editing. Published periods are immutable. Unconfirmed dated hours block publication.

Existing nurses' three shift permissions default to enabled. Hospital Administrators can lock permissions against ward changes. Ranks have editable names, abbreviations, numeric seniority and active/archive status; higher seniority appears first. Referenced ranks cannot be deleted. No hierarchy, senior qualification or ACNO restriction is inferred from a name. Qualification/rank selectors replace technical IDs in shift requirements.

Policy configuration explicitly selects senior ranks, weekday Morning-only ranks and the head-in-charge. It records Night duration, minimum rest, maximum consecutive days and institutional approval reference. Stricter hospital-wide and hospital-controlled ward limits prevail. Configuration changes revoke institutional approval; enabled policy dates cannot be moved to bypass obligations. A Ward Administrator cannot grant institutional authorization.

Fixed Night teams require 2–4 eligible nurses including a configured senior, unchanged for Monday–Sunday. Night duty creates an Off week, 168 full hours of rest after the final Night ends, then a four-day Afternoon week. Publication persists these obligations across rosters. Another Night block inside 28 days is prohibited.

Enabled policy requires 28-day Monday–Sunday periods, no overlap and direct continuity from the preceding published period. Ordinary applicable weeks require four work days; approved whole-day absence reduces available days and is never counted as work. One shift per start day, Afternoon→next-day Morning, senior coverage, designated weekday restrictions, head Monday/Friday Morning duty and annual-leave Morning return are independently validated, including published history.

Calendar forms support annual/sick/other absence, shift-specific preferences, notes, editing and removal. Annual leave entitlement is enforced per calendar year: 42 days for nurses, 28 for attendants. Calendar end dates are inclusive and converted in the hospital timezone. Sick leave is recorded when known. Attendants are excluded from nursing seats and senior coverage.

Public holidays are flagged for review. A rank-ordered grid displays M/A/N/O/L, holiday flags, CSV export and browser printing. O means no shift starts; an overnight duty can still finish on that day. Invalid candidates cannot be reviewed or published, and publication validates again under a tenant revision lock. Reviews persist the validation revision.

## Database migrations and preservation

The four original migrations are unchanged. Three additive migrations were applied through authenticated Supabase management tools and saved using the actual database-generated versions:

1. `20261011144124_nursing_policy_upgrade.sql`: staffing fields, nurse permissions/category, ranks, policy/team/obligation/holiday/review tables, RLS and lifecycle guards.
2. `20261011154914_ward_rest_limits.sql`: ward-managed rest and consecutive-day limits.
3. `20261012181518_night_hours_authorization_guard.sql`: changes to Night template/dated hours revoke institutional authorization.

Supabase: **shedify**, project `nhfgpufvehavkvaklgbr`, https://nhfgpufvehavkvaklgbr.supabase.co. All five new tables have RLS; privileged lifecycle functions are inaccessible to anonymous and ordinary authenticated callers.

National Orthopaedic Hospital Dala Kano retains one ward and 20 staff, with all original shift permissions enabled. No nursing policy was enabled for it and no times were guessed or replaced. Saved M 07:30→03:00, A 02:30→08:00 and N 08:00→08:00 remain unconfirmed.

## Solver support and independent validation

Requests match a refreshed official OpenAPI contract. Required staffing seats, optional lower-priority Morning seats, skills, employee prohibitions, pinned Night teams, unavailability, required rest/consecutive-day limits, required weekly maximum, shift-specific preferences and a PROHIBITED Afternoon→Morning pattern are mapped directly. Head Monday/Friday Morning pinning applies where available.

Timefold does not support a REQUIRED weekly `daysWorkedMin`; a preferred minimum of four is used, and independent validation rejects short ordinary weeks. This is not described as a hard solver minimum. See [days worked](https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/work-limits/days-worked-per-period), [optional staffing](https://docs.timefold.ai/employee-shift-scheduling/latest/shift-service-constraints/priority-and-optional-shifts), and [multi-day patterns](https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/shift-rotations-and-patterns/multi-day-shift-sequence-patterns).

Database guards and independent validation enforce period continuity, institutional approval, exact team equality, persisted rotations, four-day weeks, first actual duty week after annual leave, head duties and every mandatory assignment restriction. Solver annual-return prohibitions cover the calendar return week; independent validation also covers delayed returns.

## Live verification

- Real Supabase password login/getUser, hospital onboarding, persistence, tenant isolation, denied nurse writes and role escalation passed.
- Administrator/ward/nurse workflows, qualifications, template idempotency, absence/preferences and duty-request approval/rejection passed. Published assignments remained unchanged.
- Real four-week Timefold job `a4e9cbb0-c3c9-41be-a4db-b76a49784488`: **320 persisted assignments**, independently valid with zero violations/warnings, reviewed by the assigned Ward Administrator and published by the QA Hospital Administrator. Eight Night-member obligations persisted. Ward publication and nurse team access were denied.
- Real infeasible job `3fcd74b7-065c-40c9-99de-6087b25eb057`: four eligible nurses against a five-nurse requirement; approval and publication both returned 409. No mock result was substituted.
- All new live tests use a separate fictional QA ward in the authorized verification hospital. Its approval reference explicitly says fictional QA only; it is not occupational authorization for the user's hospital.
- Browser inspection confirmed the correct live Hospital Administrator dashboard and preserved 20 staff. The saved 24-hour Night template displayed a following-day duration warning and unchecked confirmation.
- `tests/live-nursing.test.ts` is opt-in: `RUN_LIVE_NURSING=1` or `RUN_LIVE_INFEASIBLE=1`, with authorized QA environment configured securely. Normal tests skip network runs. Credentials/state remain ignored and are never committed.

## Operational safety conflict

Spine Ward's existing maximum of **four consecutive days** conflicts with seven consecutive Nights. Generation now reports this before submission. It never disables or relaxes the rule automatically. Hospital oversight and formal institutional policy must resolve this; ward configuration alone does not prove authorization.

Proposed hours remain awaiting Ward Administrator confirmation: Morning 07:30–15:00, Afternoon 14:30–20:00, Night 20:00–08:00 next day. These proposals have not been saved or approved.

A Sunday Night ending Monday morning occupies part of the nominal Monday Off day. Safeguards require no new duty in the Off week **and 168 hours after the last Night ends**. Institutional policy must acknowledge this boundary; O is not a claim of a completely work-free calendar day.

## First Spine Ward roster

1. In **Shifts**, edit the existing templates, select duty types, enter Ward-confirmed hours, inspect duration and confirm the actual times. Do not confirm the erroneous saved hours.
2. Configure staffing below. Set override minima to activate associated maxima; blank Morning maxima mean unlimited. Save, then materialize dated shifts for the intended four-week period and inspect them. Template changes do not rewrite previously dated shifts.

| Shift | Weekday minimum | Weekday maximum | Weekend minimum | Weekend maximum |
|---|---:|---:|---:|---:|
| Morning | 3 | Unlimited | 2 | Unlimited |
| Afternoon | 2 | **4** | 2 | 3 |
| Night | 2 | 4 | 2 | 4 |

3. In **Nurses**, confirm ranks, category and permitted shifts. Configure rank ordering explicitly. Select ACNO/PNO/SNO for senior coverage and ACNO for weekday Morning-only duty where this matches institutional policy; select the head-in-charge explicitly.
4. In **Rules**, record policy, actual approved rest/duration limits and approval reference. Hospital oversight must verify institutional authorization and resolve the four-day/seven-night conflict before operational generation. Do not weaken safety merely to obtain a roster.
5. Create a Monday-starting 28-day roster contiguous with the preceding published period. Add every selected Night member once per Monday week. Check Afternoon permission and absence conflicts first; repeated Night blocks inside 28 days are prohibited.
6. Generate with Timefold, inspect violations/warnings and the grid, correct candidates where authorized and validate again. Ward Administrator reviews; Hospital Administrator publishes a valid candidate. Test linked nurses' personal published rosters and duty requests.

## Functional limitations separate from SMTP

- Night teams are administrator-selected; automatic optimal team selection is not implemented.
- Hard solver weekly minimum is unavailable; independent validation remains compulsory.
- Attendant records/entitlement are supported, but a dedicated attendant rota is not implemented. Future design should use separate staffing demands, employee categories and validation; never count attendants as nurses.
- Export is CSV/browser printing, not a separately designed paginated PDF. Remarks are limited; holiday handling requires review rather than inventing replacement assignments.
- Published replacement/archive workflows and per-roster permission overrides are not introduced. Published periods remain immutable and rotation obligations retained; replacement requires a separately audited lifecycle.
- Calendar forms represent whole-day absence; the timestamp API retains partial-day support.
- Operational Night publication still requires confirmed hours, institutional authorization and resolution of the existing safety conflict.

Custom SMTP remains a future requirement for reliable unrestricted invitations/registration. Development uses Supabase's permitted built-in email limits and authorized accounts, with public signup disabled. SMTP is not a blocker for the development demonstration stage.

Automated release checks: TypeScript and ESLint passed. An earlier production build passed; the final local build rerun was blocked by Windows sandbox access during SWC path canonicalization. The release build is verified on Vercel. The full suite contains 84 automated cases and two explicitly opt-in live cases; live feasible/infeasible runs passed separately. Local Windows validation uses `npm test -- --maxWorkers=1 --no-isolate` with a workspace temporary directory to avoid sandbox temporary-cache loss.
