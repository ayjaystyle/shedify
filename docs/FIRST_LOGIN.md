# First login and role setup

Shedify: https://shedify.vercel.app. Supabase project: shedify / nhfgpufvehavkvaklgbr.

The Supabase dashboard account and a Shedify application account are separate. Seeing the unsigned-in dashboard does not grant hospital access. At the 10 October 2026 inspection, only four fictional QA application accounts existed; no personal administrator account had been created. There are no default passwords.

## 1. Create your first personal account securely

1. The Supabase project owner opens Authentication → Users → Add user → Send invitation. Use the intended person's email, not a shared password. The administrative API can also use inviteUserByEmail with redirectTo set to the application origin. Public signup remains disabled.
2. Supabase's built-in email only delivers to existing organization-member addresses and is rate limited. It is not an invitation service for arbitrary nurses' addresses. An eligible organization-member address can be used for the owner's development account. Do not grant cloud organization access to nursing users merely to bypass recipient restrictions. Use a supported SMTP provider before inviting other real recipients; it need not be a paid service, but it must be configured and reliable. Invitation generation or automatic confirmation is not a substitute for delivered verification.
3. The recipient opens the delivered invitation privately. Shedify accepts the invite session, checks the user with Supabase, removes link credentials from the address bar and opens Set a new password. Enter a unique password of at least 12 characters privately and click Update password. Never send the password or invitation link in chat.
4. Open /auth and sign in with that email and password when needed. Supabase email verification stays enabled. Authentication creates identity; hospital onboarding and memberships determine authority.

## 2. Become Hospital Administrator through onboarding

1. Sign in as your own verified account. The account initially has no hospital membership.
2. Click Create hospital (or New hospital), enter the hospital name and correct IANA timezone, such as Europe/London, and save.
3. The supported onboard_hospital transaction creates the hospital, a hospital_admin membership for the signed-in user, and an audit entry. It does not grant access to the QA hospitals or any other hospital. Do not assign a global role in Supabase user metadata.
4. Select the new hospital. Open Wards → Ward to create a ward. Open Nurses → Nurse to create staff records and add ranks/qualifications as needed. Staff records are scheduling identities, not login accounts.
5. Configure shift templates/dated shifts and rules. Create a roster period, generate with real Timefold, inspect independent validation, and publish only a valid candidate.

## 3. Create a Ward Administrator / Chief Nurse

1. The Supabase project owner sends an invitation to the Chief Nurse's permitted email address. The recipient verifies it and privately chooses their own password. Sending invitations is not currently a button in Shedify; Supabase account management is handled by the project owner.
2. Copy that account's UUID from Supabase Authentication → Users, or have the signed-in recipient use Copy account ID in Shedify. An account UUID is an identifier, not a password or API key.
3. As Hospital Administrator in the intended hospital, open Settings → Hospital membership. Enter the account UUID and select Ward administrator, then save.
4. Open Wards → Ward administrator assignment. Select an assigned ward, enter the same account UUID, and save. Repeat only for wards the Chief Nurse should manage. Membership alone does not assign a ward.
5. Sign in separately as that user. The dashboard must identify ward admin and show only assigned wards/staff. Staff creation/editing and duty-request review are permitted in those wards. Creating wards, changing memberships, moving staff outside scope, generating/publishing rosters and changing scheduling rules are denied.

## 4. Create a Regular Nurse and link their staff record

1. The project owner invites the nurse through the same permitted, verified flow. The nurse privately sets a password.
2. As Hospital Administrator, ensure the corresponding staff record exists in Nurses and belongs to the correct ward.
3. In Settings → Hospital membership, enter the nurse's login account UUID and select Nurse.
4. In Settings → Staff account link, select the existing nurse staff record and enter the same login account UUID. The database enforces hospital-scoped links and prevents multiple accounts linking ambiguously. Names/emails alone do not create a link.
5. Publish a valid roster containing that staff member. Sign in as the nurse. The dashboard must identify nurse and show only personal published assignments and the next shift. Without a staff link or a published assignment, the personal schedule will be empty.
6. Open Requests → Duty-change request, choose the published roster/assigned shift and own staff record, enter the requested change and reason, and save. Nurses cannot approve their own request or edit schedules. Approval records a decision without changing the published roster.

## 5. Test all three roles

Use separate browser profiles or test each account sequentially, signing out before switching. Supabase sign-out revokes sessions, so do not sign out while an API test uses the same account.

| Check | Hospital Administrator | Ward Administrator | Nurse |
| --- | --- | --- | --- |
| Hospital-wide authorized records | Yes | Assigned wards | Own published assignments |
| Create wards, set roles and link accounts | Yes | No | No |
| Manage staff | Hospital-wide | Assigned wards | No |
| Rules, shifts, real roster generation, validation and publication | Yes | View scoped roster; no mutation | No mutation |
| Review duty-change requests | Hospital-wide | Assigned wards | No |
| Submit own duty-change request | Via a linked nurse account | Via a linked nurse account | Yes |

Verify denied cross-hospital access and denied role escalation, not just hidden buttons. Existing real QA tests cover administrator management, ward scope, nurse personal assignments, duty requests and access denials. Confirm the same behavior with the newly invited accounts after their verification and role assignment. Never share a demonstration password, disable confirmation or weaken RLS to make login work.

## Invitation handling and verification

The app previously handled authorization-code callbacks but had no client handler for the implicit invitation fragment returned by default Supabase invitation links. The new /auth/accept page handles only invite/recovery fragments, calls setSession and server-backed getUser, requires email confirmation, clears credentials from browser history and routes to private password setup. The Site URL landing page and /auth redirect valid invitation fragments to that handler. Unsupported, missing or expired links show a safe error.

Tests include verified invite acceptance, missing/wrong-type fragments, required email confirmation and safe provider errors. Delivered email and the real recipient's password setup remain separate manual verification steps; unit tests do not prove email delivery. No public signup or authorization policy changed.

Official references: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail and https://supabase.com/docs/guides/auth/auth-smtp
