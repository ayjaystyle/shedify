// Uses only the authorized fictional QA accounts and hospitals from live verification.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const file = 'work/live-verification.json';
const fixture = JSON.parse(await readFile(file, 'utf8'));
assert.equal(fixture.projectUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
const app = process.env.NEXT_PUBLIC_APP_URL;
const db = createClient(fixture.projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (r) => { if (r.error) throw Error(`Database operation failed: ${r.error.code}`); return r.data; };
const save = () => writeFile(file, JSON.stringify(fixture), { mode: 0o600 });
if (!fixture.accounts.some(a => a.role === 'ward_admin')) {
  const email = `shedify-qa-ward-${randomUUID()}@example.invalid`;
  const password = randomBytes(36).toString('base64url');
  const user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
  fixture.accounts.push({ role: 'ward_admin', email, password, id: user.id });
  await save();
}
const sessions = {};
for (const a of fixture.accounts) {
  const r = await fetch(`${app}/api/auth`, { method: 'POST', headers: { origin: app, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'login', email: a.email, password: a.password }) });
  assert.equal(r.status, 200, `${a.role} login`);
  sessions[a.role] = r.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
}
async function call(role, path, body, status = 200) {
  const r = await fetch(`${app}${path}`, { method: body ? 'POST' : 'GET', headers: { origin: app, cookie: sessions[role], 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json();
  assert.equal(r.status, status, `${role} ${path}: ${value.error || 'unexpected response'}`);
  return value;
}
const workspace = (role) => call(role, `/api/workspace?hospital=${fixture.hospital}`);
const change = (role, entity, data, action = 'create', id, status = 200) => call(role, '/api/workspace', { action, entity, hospital_id: fixture.hospital, data, ...(id ? { id } : {}) }, status);
const wardAccount = fixture.accounts.find(a => a.role === 'ward_admin');
await change('admin', 'memberships', { user_id: wardAccount.id, role: 'ward_admin' });
const findOrCreate = async (entity, name, data) => {
  let row = (await workspace('admin')).data[entity].find(x => x.name === name || x.full_name === name);
  if (!row) { await change('admin', entity, data); row = (await workspace('admin')).data[entity].find(x => x.name === name || x.full_name === name); }
  assert.ok(row, `${entity} persistence`); return row;
};
const managed = await findOrCreate('wards', 'Demonstration managed ward', { name: 'Demonstration managed ward' });
const restricted = await findOrCreate('wards', 'Demonstration restricted ward', { name: 'Demonstration restricted ward' });
for (const ward_id of [managed.id, fixture.ward]) {
  if (!(await workspace('admin')).data.ward_admins.some(x => x.ward_id === ward_id && x.user_id === wardAccount.id))
    await change('admin', 'ward_admins', { ward_id, user_id: wardAccount.id });
}
const rank = await findOrCreate('ranks', 'Demo nursing rank', { name: 'Demo nursing rank' });
const qualification = await findOrCreate('qualifications', 'Demo qualification', { name: 'Demo qualification' });
const nurse = await findOrCreate('staff', 'Fictional Demo Nurse', { full_name: 'Fictional Demo Nurse', ward_id: managed.id, rank_id: rank.id });
await change('ward_admin', 'staff', { full_name: 'Fictional Demo Nurse', ward_id: managed.id, rank_id: rank.id, eligible: true, active: true }, 'update', nurse.id);
await change('ward_admin', 'staff', { full_name: 'Fictional Demo Nurse', ward_id: restricted.id, rank_id: rank.id }, 'update', nurse.id, 409);
if (!(await workspace('admin')).data.staff_qualifications.some(x => x.staff_id === nurse.id && x.qualification_id === qualification.id))
  await change('admin', 'staff_qualifications', { staff_id: nurse.id, qualification_id: qualification.id });
const template = await findOrCreate('shift_templates', 'Demo day template', { name: 'Demo day template', ward_id: managed.id, start_time: '07:00', end_time: '19:00', min_staff: 1, max_staff: 1 });
await call('admin', '/api/workspace', { action: 'materialize', hospital_id: fixture.hospital, data: { template_id: template.id, start_date: '2026-11-02', end_date: '2026-11-03' } });
assert.equal((await workspace('admin')).data.shifts.filter(s => s.template_id === template.id).length, 2);
await call('admin', '/api/workspace', { action: 'materialize', hospital_id: fixture.hospital, data: { template_id: template.id, start_date: '2026-11-02', end_date: '2026-11-03' } });
assert.equal((await workspace('admin')).data.shifts.filter(s => s.template_id === template.id).length, 2, 'Materialization is idempotent');
console.log('PASS: administrator catalogs, ward-admin staff changes and idempotent template materialization.');
for (const [entity, data] of [
  ['availability', { staff_id: nurse.id, start_at: '2026-11-05T07:00:00Z', end_at: '2026-11-05T19:00:00Z' }],
  ['preferences', { staff_id: nurse.id, start_at: '2026-11-06T07:00:00Z', end_at: '2026-11-06T19:00:00Z', preferred: true }],
]) {
  if (!(await workspace('admin')).data[entity].some(x => x.staff_id === nurse.id)) await change('admin', entity, data);
}
const wardView = await workspace('ward_admin');
assert.equal(wardView.role, 'ward_admin');
assert.ok(!wardView.data.wards.some(w => w.id === restricted.id));
assert.ok(wardView.data.staff.some(s => s.id === nurse.id));
await change('ward_admin', 'wards', { name: 'Forbidden ward' }, 'create', undefined, 403);
await change('ward_admin', 'memberships', { user_id: wardAccount.id, role: 'hospital_admin' }, 'create', undefined, 403);
await call('outsider', `/api/workspace?hospital=${fixture.hospital}`, undefined, 403);
await change('nurse', 'wards', { name: 'Forbidden nurse ward' }, 'create', undefined, 403);
const published = (await workspace('admin')).data.rosters.find(r => r.status === 'published');
assert.ok(published);
await call('ward_admin', `/api/rosters/${published.id}`);
await call('ward_admin', `/api/rosters/${published.id}`, { action: 'publish' }, 403);
const nurseView = await workspace('nurse');
assert.equal(nurseView.role, 'nurse');
assert.equal(nurseView.data.staff.length, 1);
assert.ok(nurseView.data.assignments.length > 0);
assert.ok(nurseView.data.assignments.every(a => a.staff_id === nurseView.data.staff[0].id));
await call('nurse', `/api/rosters/${published.id}`, { action: 'generate' }, 403);
const assignment = nurseView.data.assignments.find(a => a.roster_id === published.id);
assert.ok(assignment);
const before = ok(await db.from('assignments').select('*').eq('roster_id', published.id));
for (const [reviewer, decision] of [['ward_admin', 'approved'], ['admin', 'rejected']]) {
  const reason = `Authorized demo workflow ${randomUUID()}`;
  await change('nurse', 'duty_requests', { roster_id: published.id, shift_id: assignment.shift_id, staff_id: assignment.staff_id, requested_change: 'Request discussion of a fictional shift change', reason });
  const request = (await workspace('nurse')).data.duty_requests.find(r => r.reason === reason);
  assert.ok(request);
  await call('nurse', '/api/workspace', { action: 'review', hospital_id: fixture.hospital, id: request.id, data: { status: decision } }, 403);
  await call(reviewer, '/api/workspace', { action: 'review', hospital_id: fixture.hospital, id: request.id, data: { status: decision } });
  assert.equal((await workspace('nurse')).data.duty_requests.find(r => r.id === request.id).status, decision);
  await call(reviewer, '/api/workspace', { action: 'review', hospital_id: fixture.hospital, id: request.id, data: { status: decision } }, 403);
}
const after = ok(await db.from('assignments').select('*').eq('roster_id', published.id));
const assignmentOrder = (a, b) => `${a.shift_id}:${a.staff_id}`.localeCompare(`${b.shift_id}:${b.staff_id}`);
assert.deepEqual(after.sort(assignmentOrder), before.sort(assignmentOrder), 'Request decisions preserve published assignments');
console.log('PASS: administrator management, template materialization/idempotency, ranks/qualifications, availability/preferences persistence, ward-admin scope and nurse personal assignments.');
console.log('PASS: nurse duty requests, ward-admin approval, administrator rejection, no self-review/re-review, unchanged published roster and cross-hospital denial.');
if (process.argv.includes('--restricted-signup')) {
  await call('admin', '/api/auth', { mode: 'register', email: 'unauthorized@example.com', password: randomBytes(24).toString('base64url') }, 403);
  const direct = await createClient(fixture.projectUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).auth.signUp({ email: `shedify-denied-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') });
  assert.equal(direct.error?.code, 'signup_disabled');
  console.log('PASS: application and direct Supabase public signup blocked.');
}
