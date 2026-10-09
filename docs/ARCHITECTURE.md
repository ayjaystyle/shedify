# Architecture and limits

Shedify is a modular Next.js monolith. Route handlers authenticate with Supabase `getUser`, enforce role checks and validate inputs with Zod. Authenticated management queries use the user's database session and RLS. The server-only service role performs durable job operations and transactional publication RPCs.

The domain validator is independent of Timefold. It checks required/maximum staffing, qualifications and ranks, ward membership, eligibility, overlap, local-day limits, consecutive days, rest, and unavailable spans. Published assignments before and after the candidate period are included. Scheduling days are defined by shift start in the hospital IANA time zone. Hospital wall-clock offsets are preserved in Timefold requests.

The database enforces tenant relationships with composite foreign keys. Hospital memberships, ward administrator assignments and one-to-one staff-account links govern access. RLS prevents nurses from reading candidates or another nurse's assignments. Public registration does not grant hospital roles. Onboarding grants administrator status only to the new hospital's creator.

Publication loads a single consistent database snapshot, validates it on the server, and calls a service-role-only transaction. Scheduling mutations increment and lock the hospital revision. Publication rejects stale revisions and conflicting published periods, then records validation, publication and audit entries atomically. Browser clients cannot call publication RPCs or write roster lifecycle tables. Already published dated shifts are immutable. Staff deactivation retains history.

Jobs are persisted before external requests. Workers use `SKIP LOCKED` and expiring leases. POST acknowledgement failures become `submission_unknown`; they are not automatically retried because an idempotency mechanism has not been verified in Timefold's contract. Operators must reconcile the external run before retrying. Rate-limit GETs use bounded retries. Runs time out after one hour. Browser polling is for display; the independent scheduler continues solving retrieval.

## Timefold contract

Source: https://app.timefold.ai/openapis/employee-scheduling/v1, retrieved 2026-10-09. API version: `v1`. `docs/timefold-contract.json` records a SHA-256 of the full specification and a reduced official schema snapshot for the fields mapped by this adapter. Authentication is `X-API-KEY`. Submission is POST `/api/models/employee-scheduling/v1/schedules`; progress is GET `/{id}/metadata`; result is GET `/{id}`; termination is DELETE `/{id}`. The actual model version used by an account/run has not been live-verified.

Each dated shift expands to its minimum staffing count in required Timefold seats. Maximum staffing is independently validated. Optional staffing between minimum and maximum is not optimized. Rank requirements use `rank:<rank UUID>` skills; qualification requirements use qualification UUIDs. Rest, consecutive days and one shift per day map to contract rules. Unavailability and time preferences map to documented employee spans. Fair shift count and workload map to global balancing rules.

Unsupported requirements are not accepted as configurable mandatory rules. Custom hospital-specific rule code, cross-ward scheduling, night-specific fairness, shift-type preferences, optional staffing optimization, replacement of published roster versions, and validated changes to published assignments are not implemented. Duty request approval records a decision only. A replacement publication workflow is required before published assignments can be revised.

Current management lists show at most 500 permitted rows; the scheduling snapshot itself is not paginated. A production pagination UI and richer calendar views remain pending. Current modal focus trapping and keyboard QA remain pending. Observability and operational load testing remain pending.

PGlite tests exercise PostgreSQL SQL and RLS with emulated Supabase auth roles; they are not tests of the live Supabase Auth/email service. Timefold HTTP tests are explicitly mocked. Actual Timefold feasible/infeasible flows and deployment verification require configured services.
