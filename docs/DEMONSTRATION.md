# Shedify development demonstration

Website: https://shedify.vercel.app. Repository root deployment from develop/shedify-greenfield.

## Access and free email policy

Public self-registration is closed in Supabase and the application. Existing authorized development accounts can sign in. Email confirmation stays enabled; anonymous sign-in is disabled. No paid domain, email service or subscription is required for the current demonstration.

Use only fictional data and explicitly authorized development accounts. Existing QA accounts were provisioned as confirmed fictional fixtures through the administrative API for integration testing; they are not evidence of delivered confirmation emails. Credentials are held only in the ignored private verification manifest, never in this document or GitHub. Do not automatically confirm real users to bypass verification. For real development users, an account administrator must authorize access and use Supabase's permitted invitation/confirmation flow; built-in mail recipients are restricted to organization member addresses and subject to the default rate limits. Do not broaden organization access simply to circumvent these restrictions.

Built-in mail is retained for permitted development uses. Password recovery can fail for an address outside its permitted recipients; the login screen explains this restriction. No automated email is sent by the QA workflow. Reliable custom SMTP is postponed until unrestricted registration is needed. Keep both signup gates closed until SMTP and delivered confirmation/callback tests pass. The application API explicitly rejects register requests and its UI provides sign-in/recovery only; future registration requires an intentional code change and corresponding Supabase setting change.

Provider guidance: https://supabase.com/docs/guides/auth/auth-smtp and https://supabase.com/docs/guides/auth/general-configuration

## Hands-on walkthrough

1. Sign in as an authorized hospital administrator. Select the fictional QA hospital. Inspect wards, nurses, ranks, qualifications, templates, shifts, rules, unavailability and preferences.
2. Create/edit a fictional nurse in an unpublished demonstration ward. Materialize the demo day template for 2–3 November 2026; repeated materialization must not duplicate shifts.
3. Inspect the real published 12–13 October Timefold candidate: four nurses cover four day/night shifts. Inspect the 19 October infeasible candidate: four available nurses cannot fill a five-person shift, and publication stays blocked.
4. Sign out and sign in as the authorized ward administrator. Only assigned wards and their staff should be visible. Edit a nurse in the managed demonstration ward. Moving staff to the restricted ward, changing memberships, creating wards and publishing rosters must be denied.
5. Sign out and sign in as the linked nurse. Inspect personal published assignments and next shift. Submit a fictional duty-change request. The nurse cannot review its own request or alter scheduling records.
6. Sign in as ward administrator to approve the request, or hospital administrator to reject it. Reviewed status persists and repeat review is rejected. Approval records a decision; it does not change the published assignment. A new valid roster is required for an assignment change.
7. Sign out. Protected application APIs must return 401. Cross-hospital access must return 403 or hide the inaccessible record.

## Reproducible verification

With private ignored .env.local configured for the actual QA project:

```text
node --env-file=.env.local scripts/verify-live-services.mjs --application
node --env-file=.env.local scripts/verify-live-workflows.mjs --restricted-signup
npm test
npm run lint
npm run typecheck
npm run build
```

The workflow script uses the established fictional QA hospitals, creates one authorized ward-admin fixture when needed, and tests real deployed APIs. It does not send email, expose credentials or contact mocked providers. It leaves labeled fictional demonstration records and reviewed requests for hands-on inspection. The real Timefold feasible/infeasible script is separate because it may submit actual optimization jobs.

## Functional boundaries, separate from SMTP

- Ward administrators manage staff in assigned wards and review their duty requests; hospital administrators control scheduling configuration and roster publication.
- Nurses view published personal assignments and submit requests. They cannot independently edit availability/preferences; administrators manage those records.
- Duty-change approval records an authorized decision without changing a published schedule.
- Workspace lists are limited to 500 records per entity; pagination is not implemented.
- The free background worker claims one due job each minute. This is suitable for a small demonstration, not a verified hospital-scale throughput target.
- CLI migration-history reconciliation remains administrative bookkeeping before future CLI migration pushes; the existing live schema is already applied and verified.

Custom SMTP is a postponed release requirement, not a blocker for these authorized demonstration workflows.
