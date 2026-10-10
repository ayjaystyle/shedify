// Regression check using only the existing authorized fictional QA identity.
// Credentials/tokens stay in memory and are never printed or committed.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = JSON.parse(await readFile('work/live-verification.json', 'utf8'));
const account = fixture.accounts.find(a => a.role === 'admin');
assert.ok(account && account.email.endsWith('@example.invalid'));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.auth.signInWithPassword({ email: account.email, password: account.password });
assert.equal(error, null, 'QA authentication');
const app = process.env.NEXT_PUBLIC_APP_URL;
const fragment = '#' + new URLSearchParams({ type: 'invite', access_token: data.session.access_token, refresh_token: data.session.refresh_token });
const accepted = await fetch(`${app}/api/auth`, { method: 'POST', headers: { origin: app, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'invite', fragment }) });
assert.equal(accepted.status, 200, 'Server session acceptance');
const cookies = accepted.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookies.includes('auth-token'), 'Session cookies are returned to the browser');
const workspace = await fetch(`${app}/api/workspace?hospital=${fixture.hospital}`, { headers: { cookie: cookies } });
assert.equal(workspace.status, 200, 'Session survives the next server request');
assert.equal((await workspace.json()).role, 'hospital_admin');
const updated = await fetch(`${app}/api/auth`, { method: 'POST', headers: { origin: app, cookie: cookies, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'password', password: account.password }) });
assert.equal(updated.status, 200, 'Password submission authenticates from the returned cookies');
console.log('PASS: real Supabase session acceptance returns cookies, survives a server request, and permits password submission for the authorized QA identity.');
console.log('The personal recipient must still complete their own private password submission.');
