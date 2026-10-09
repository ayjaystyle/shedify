import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixturePath = 'work/live-verification.json';
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code || 'failed'}`); return r.data; };
const admin = fixture.accounts.find(a => a.role === 'admin');
const login = await fetch(`${appUrl}/api/auth`, { method: 'POST', headers: { origin: appUrl, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'login', email: admin.email, password: admin.password }) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function request(path, body, session = cookie) {
  const r = await fetch(`${appUrl}${path}`, { method: body ? 'POST' : 'GET', headers: { cookie: session, origin: appUrl, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json();
  if (!r.ok) throw new Error(`Application ${r.status}: ${data.error || 'request failed'}`);
  return data;
}
if (!fixture.solverSeeded) {
  const staff = ok(await db.from('staff').insert(Array.from({ length: 4 }, (_, i) => ({ hospital_id: fixture.hospital, ward_id: fixture.ward, full_name: `Fictional Live Nurse ${i + 1}` }))).select('id'), 'Seed nurses');
  fixture.staff = staff.map(s => s.id);
  ok(await db.from('rules').insert([
    { kind: 'one_shift_per_day', value: 1 }, { kind: 'max_consecutive_days', value: 5 }, { kind: 'min_rest_minutes', value: 660 }, { kind: 'fair_shifts', value: 1 }, { kind: 'fair_workload', value: 1 },
  ].map(rule => ({ ...rule, hospital_id: fixture.hospital, ward_id: fixture.ward }))), 'Seed rules');
  ok(await db.from('shifts').insert([
    ['Day 1','2026-10-12T07:00:00+01:00','2026-10-12T19:00:00+01:00',1],
    ['Night 1','2026-10-12T19:00:00+01:00','2026-10-13T07:00:00+01:00',1],
    ['Day 2','2026-10-13T07:00:00+01:00','2026-10-13T19:00:00+01:00',1],
    ['Night 2','2026-10-13T19:00:00+01:00','2026-10-14T07:00:00+01:00',1],
    ['Infeasible shortage','2026-10-19T07:00:00+01:00','2026-10-19T19:00:00+01:00',5],
  ].map(([name,start_at,end_at,min_staff]) => ({ hospital_id: fixture.hospital, ward_id: fixture.ward, name,start_at,end_at,min_staff,max_staff:min_staff }))), 'Seed dated shifts');
  fixture.solverSeeded = true;
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
}
const scenario = process.argv.includes('--infeasible') ? 'infeasible' : 'feasible';
if (!fixture[scenario]) {
  const date = scenario === 'feasible' ? '2026-10-12' : '2026-10-19';
  const end = scenario === 'feasible' ? '2026-10-13' : date;
  const { id } = await request('/api/workspace', { action: 'roster', hospital_id: fixture.hospital, data: { ward_id: fixture.ward, start_date: date, end_date: end } });
  fixture[scenario] = id;
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
}
const roster = fixture[scenario];
const existing = ok(await db.from('jobs').select('state').eq('roster_id', roster), 'Read jobs');
if (!existing.length) await request(`/api/rosters/${roster}`, { action: 'generate' });
const until = Date.now() + 12 * 60_000;
let lastState;
let job;
while (Date.now() < until) {
  await request(`/api/rosters/${roster}`, { action: 'process' });
  job = ok(await db.from('jobs').select('state,external_id,error').eq('roster_id', roster).single(), 'Read real job');
  if (lastState !== job.state) console.log(JSON.stringify({ scenario, roster, ...job }));
  lastState = job.state;
  if (['completed','failed','cancelled','submission_unknown'].includes(job.state)) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(job?.state, 'completed', `Real Timefold job did not complete: ${job?.error || job?.state}`);
assert.ok(job.external_id, 'Real Timefold identifier required');
const validation = await request(`/api/rosters/${roster}`, { action: 'validate' });
assert.equal(validation.valid, scenario === 'feasible');
if (scenario === 'feasible') {
  const assignments = ok(await db.from('assignments').select('shift_id,staff_id').eq('roster_id', roster), 'Persisted candidate');
  assert.equal(assignments.length, 4);
  const nurse = fixture.accounts.find(a => a.role === 'nurse');
  ok(await db.from('staff_accounts').upsert({ hospital_id: fixture.hospital, staff_id: assignments[0].staff_id, user_id: nurse.id }), 'Link fictional nurse');
  const current = ok(await db.from('rosters').select('status').eq('id', roster).single(), 'Review status');
  if (current.status !== 'published') await request(`/api/rosters/${roster}`, { action: 'publish' });
  assert.equal(ok(await db.from('rosters').select('status').eq('id', roster).single(), 'Published reread').status, 'published');
  const nurseLogin = await fetch(`${appUrl}/api/auth`, { method: 'POST', headers: { origin: appUrl, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'login', email: nurse.email, password: nurse.password }) });
  assert.equal(nurseLogin.status, 200);
  const nurseCookie = nurseLogin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const personal = await request(`/api/rosters/${roster}`, undefined, nurseCookie);
  assert.ok(personal.assignments.length);
  assert.ok(personal.assignments.every(a => a.staff_id === assignments[0].staff_id));
  console.log(JSON.stringify({ result: 'PASS', scenario, roster, timefoldJob: job.external_id, assignmentCount: assignments.length, validation, published: true, nurseIsolation: true }));
} else {
  const blocked = await fetch(`${appUrl}/api/rosters/${roster}`, { method: 'POST', headers: { cookie, origin: appUrl, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'publish' }) });
  assert.equal(blocked.status, 409);
  console.log(JSON.stringify({ result: 'PASS', scenario, roster, timefoldJob: job.external_id, validation, publicationBlocked: true }));
}
