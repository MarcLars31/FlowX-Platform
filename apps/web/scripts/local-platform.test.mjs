import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertLocalPlatformEnvironment } from './local-platform/environment.mjs';
import { localPlatformEnabled } from '../src/lib/local-platform.ts';
import { credentialsAt, startBackend } from './local-platform/server.mjs';
import { CUSTOMER_EMAIL } from './local-platform/database.mjs';

test('local startup rejects production, another branch and inherited service credentials', () => {
  assert.doesNotThrow(() => assertLocalPlatformEnvironment({}, 'codex/scipx-upgrades'));
  for (const environment of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }, { SUPABASE_URL: 'https://live.supabase.co' }, { SUPABASE_SECRET_KEY: 'secret' }, { RESEND_API_KEY: 'secret' }]) {
    assert.throws(() => assertLocalPlatformEnvironment(environment, 'codex/scipx-upgrades'));
  }
  assert.throws(() => assertLocalPlatformEnvironment({}, 'Frontend-'));
  const env = { NODE_ENV: 'development', SCIPX_LOCAL_PLATFORM: '1', SUPABASE_URL: 'http://127.0.0.1:54329', SCIPX_LOCAL_PASSWORD: 'test' };
  assert.equal(localPlatformEnabled(env, '127.0.0.1:3100'), true);
  for (const host of ['www.scipx.ai', '127.0.0.1.attacker.test:3100', '127.0.0.1:80', null]) assert.equal(localPlatformEnabled(env, host), false);
  assert.equal(localPlatformEnabled({ ...env, NODE_ENV: 'production' }, '127.0.0.1:3100'), false);
  assert.equal(localPlatformEnabled({ ...env, SUPABASE_URL: 'https://live.supabase.co' }, '127.0.0.1:3100'), false);
});

test('network guard blocks remote writes and cloud database reads before fetch', () => {
  const script = `globalThis.fetch=async()=>new Response('ok'); await import('./scripts/local-platform/network-guard.mjs');
    for(const [url,method] of [['https://example.test/send','POST'],['https://live.supabase.co/rest/v1/projects','GET']]) {
      let rejected=false; try { await fetch(url,{method}); } catch { rejected=true; } if(!rejected) throw Error('Remote request escaped');
    }
    if((await fetch('http://127.0.0.1:54329',{method:'POST'})).status!==200) throw Error('Local request rejected');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, SCIPX_LOCAL_PLATFORM: '1', SUPABASE_URL: 'http://127.0.0.1:54329' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('real schema, authentication, RLS, project writes, files and sessions survive restart', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'scipx-local-platform-test-'));
  const credentials = await credentialsAt(directory);
  const repository = resolve('../..');
  let backend;
  try {
    backend = await startBackend({ directory, repository, credentials, port: 0 });
    let base = `http://127.0.0.1:${backend.server.address().port}`;
    let token;
    const request = (path, method = 'GET', payload, admin = false, extra = {}) => fetch(`${base}${path}`, { method, headers: { apikey: admin ? credentials.serviceKey : credentials.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...extra }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const login = await request('/auth/v1/token?grant_type=password', 'POST', { email: CUSTOMER_EMAIL, password: credentials.password });
    assert.equal(login.status, 200);
    const session = await login.json(); token = session.access_token;
    assert.equal((await request('/auth/v1/user')).status, 200);
    assert.equal((await request('/auth/v1/user', 'GET', undefined, false, { Authorization: 'Bearer forged' })).status, 401);
    assert.equal((await request('/rest/v1/projects', 'GET', undefined, false, { Origin: 'https://attacker.test' })).status, 403);
    const preflight = await fetch(`${base}/storage/v1/object/upload/sign/project-files/test.pdf`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:3100', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'cache-control,content-type' } });
    assert.equal(preflight.status, 204);
    assert.ok(preflight.headers.get('access-control-allow-headers').includes('cache-control'));
    const invalidRefresh = await request('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: 'missing' });
    assert.equal((await invalidRefresh.json()).code, 'refresh_token_not_found');
    const contextResponse = await request('/rest/v1/rpc/current_organization_context', 'POST', { requested_organization_id: null });
    assert.equal(contextResponse.status, 200, await contextResponse.clone().text());
    const context = await contextResponse.json();
    assert.ok(context.permissions.includes('project.create'));
    const projects = await (await request('/rest/v1/projects?select=id,name&deleted_at=is.null&order=name.asc')).json();
    assert.ok(projects.some(project => project.name === 'Lokalt testprojekt'));
    const project = projects.find(project => project.name === 'Lokalt testprojekt');
    await backend.db.exec('create function public.local_test_project(requested_id uuid) returns public.projects language sql as $$ select p from public.projects p where p.id=requested_id $$; grant execute on function public.local_test_project(uuid) to authenticated;');
    const composite = await request('/rest/v1/rpc/local_test_project', 'POST', { requested_id: project.id });
    assert.equal(composite.status, 200);
    assert.equal((await composite.json()).id, project.id);
    const renamed = await request(`/rest/v1/projects?id=eq.${project.id}`, 'PATCH', { name: "Local test ' survives restart" });
    assert.equal(renamed.status, 200, await renamed.clone().text());
    assert.equal((await renamed.json())[0].name, "Local test ' survives restart");
    const otherOrg = randomUUID();
    const inserted = await request('/rest/v1/organizations', 'POST', { id: otherOrg, name: 'Other local organization' }, true);
    assert.equal(inserted.status, 200, await inserted.clone().text());
    const counted = await request('/rest/v1/organizations?select=id&limit=1', 'GET', undefined, true, { Prefer: 'count=exact' });
    assert.equal(counted.status, 200);
    assert.ok(Number(counted.headers.get('content-range').split('/')[1]) >= 2);
    assert.equal((await counted.json()).length, 1);
    assert.deepEqual(await (await request(`/rest/v1/organizations?id=eq.${otherOrg}`)).json(), []);
    const relations = await request('/rest/v1/project_work_notifications?select=id,projects!inner(organization_id)&projects.organization_id=eq.' + context.organization.id);
    assert.equal(relations.status, 200, await relations.clone().text());
    const illegal = await request('/rest/v1/projects?name=eq.%27%3Bdrop%20table%20projects%3B--');
    assert.equal(illegal.status, 200); assert.deepEqual(await illegal.json(), []);
    const storagePath = `/storage/v1/object/project-files/${context.organization.id}/${project.id}/local-test.pdf`;
    const upload = await fetch(`${base}${storagePath}`, { method: 'POST', headers: { apikey: credentials.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 local storage test' });
    assert.equal(upload.status, 200, await upload.clone().text());
    assert.equal(await (await request(storagePath)).text(), '%PDF-1.4 local storage test');
    const roles = await request('/rest/v1/roles?select=slug&or=(organization_id.is.null,organization_id.eq.' + context.organization.id + ')');
    assert.equal(roles.status, 200, await roles.clone().text());
    assert.ok((await roles.json()).length > 0);
    await backend.close(); backend = null;
    backend = await startBackend({ directory, repository, credentials, port: 0 });
    base = `http://127.0.0.1:${backend.server.address().port}`;
    const persisted = await (await request(`/rest/v1/projects?id=eq.${project.id}&select=name`)).json();
    assert.equal(persisted[0].name, "Local test ' survives restart");
    assert.equal(await (await request(storagePath)).text(), '%PDF-1.4 local storage test');
    const refresh = await request('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token });
    assert.equal(refresh.status, 200);
  } finally {
    await backend?.close();
    const absolute = resolve(directory);
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && basename(absolute).startsWith('scipx-local-platform-test-'));
    await rm(absolute, { recursive: true, force: true });
  }
});
