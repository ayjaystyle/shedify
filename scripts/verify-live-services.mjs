import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const privateKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !privateKey) throw new Error('Configure the private local environment first.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, privateKey, options);
const ok = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code || result.error.status || 'failed'}`); return result.data; };
const manifestPath = 'work/live-verification.json';
await mkdir('work', { recursive: true });
let fixture;
try { fixture = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!fixture) {
  fixture = { projectUrl: url, accounts: [] };
  for (const role of ['admin', 'outsider', 'nurse']) {
    const email = `shedify-qa-${role}-${randomUUID()}@example.invalid`;
    const password = randomBytes(36).toString('base64url');
    const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'QA user creation').user;
    fixture.accounts.push({ role, email, password, id: user.id });
    await writeFile(manifestPath, JSON.stringify(fixture), { mode: 0o600 });
  }
}
assert.equal(fixture.projectUrl, url, 'Fixture belongs to a different Supabase project');
const clients = {};
for (const account of fixture.accounts) {
  const client = createClient(url, publicKey, options);
  ok(await client.auth.signInWithPassword({ email: account.email, password: account.password }), `${account.role} password login`);
  assert.equal(ok(await client.auth.getUser(), 'Verified Auth user').user.id, account.id);
  clients[account.role] = client;
}
if (!fixture.hospital) {
  fixture.hospital = ok(await clients.admin.rpc('onboard_hospital', { p_name: 'Shedify Live Verification A', p_timezone: 'Europe/London' }), 'Hospital onboarding');
  await writeFile(manifestPath, JSON.stringify(fixture), { mode: 0o600 });
}
if (!fixture.otherHospital) {
  fixture.otherHospital = ok(await clients.outsider.rpc('onboard_hospital', { p_name: 'Shedify Live Verification B', p_timezone: 'Europe/London' }), 'Other hospital onboarding');
  await writeFile(manifestPath, JSON.stringify(fixture), { mode: 0o600 });
}
if (!fixture.ward) {
  fixture.ward = ok(await clients.admin.from('wards').insert({ hospital_id: fixture.hospital, name: 'Live Verification Ward' }).select('id').single(), 'Ward persistence').id;
  await writeFile(manifestPath, JSON.stringify(fixture), { mode: 0o600 });
}
const nurse = fixture.accounts.find(a => a.role === 'nurse');
ok(await service.from('memberships').upsert({ hospital_id: fixture.hospital, user_id: nurse.id, role: 'nurse' }), 'Nurse membership');
assert.deepEqual(ok(await clients.admin.from('hospitals').select('id'), 'Admin hospital read').map(x => x.id), [fixture.hospital]);
assert.deepEqual(ok(await clients.outsider.from('hospitals').select('id'), 'Outsider hospital read').map(x => x.id), [fixture.otherHospital]);
assert.equal(ok(await clients.outsider.from('wards').select('id'), 'Cross-hospital isolation').length, 0);
assert.equal(ok(await service.from('wards').select('id').eq('id', fixture.ward), 'Persisted ward reread').length, 1);
assert.ok((await clients.nurse.from('wards').insert({ hospital_id: fixture.hospital, name: 'Unauthorized' })).error, 'Nurse must not create wards');
assert.ok((await clients.nurse.rpc('set_membership_role', { p_hospital: fixture.hospital, p_user: nurse.id, p_role: 'hospital_admin' })).error, 'Nurse must not escalate role');
console.log('PASS: real Supabase password login/getUser for three QA users, hospital onboarding, persisted ward, JWT tenant isolation, denied nurse write and role escalation.');

if (process.argv.includes('--application')) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const account = fixture.accounts.find(a => a.role === 'admin');
  const login = await fetch(`${appUrl}/api/auth`, { method: 'POST', headers: { origin: appUrl, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'login', email: account.email, password: account.password }) });
  assert.equal(login.status, 200, 'Application login must succeed');
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'Application must establish session cookies');
  const workspace = await fetch(`${appUrl}/api/workspace?hospital=${fixture.hospital}`, { headers: { cookie } });
  assert.equal(workspace.status, 200, 'Authenticated workspace must load');
  assert.equal((await fetch(`${appUrl}/api/workspace`)).status, 401, 'Anonymous workspace must be denied');
  assert.equal((await fetch(`${appUrl}/api/cron`)).status, 401, 'Anonymous worker must be denied');
  console.log('PASS: deployed application login/session, authenticated workspace, anonymous workspace and worker rejection.');
}
// Keep fictional fixtures for real Timefold verification. The ignored manifest
// contains credentials; never print it or commit it. No emails are sent.
