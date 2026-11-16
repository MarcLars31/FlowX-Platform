import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverWorkEmail, workEmailPayload, type WorkEmail } from './project-work-email';
const config = { apiKey: 'test-only', from: 'Scipx <test@example.test>', appUrl: 'https://scipx.example.test' };
const job: WorkEmail = { id: 'email-job', lease: 'lease', project_id: 'project', email: 'recipient@example.test', kind: 'assignment', item_count: 8 };
test('batch email is one message with an authenticated project link and stable retry key', async () => {
  const requests: RequestInit[] = [];
  const send: typeof fetch = async (_url, init) => { requests.push(init!); return Response.json({ id: 'provider-id' }); };
  assert.equal((await deliverWorkEmail(job, config, send)).sent, true);
  await deliverWorkEmail(job, config, send);
  assert.equal(new Headers(requests[0].headers).get('Idempotency-Key'), new Headers(requests[1].headers).get('Idempotency-Key'));
  assert.deepEqual(JSON.parse(String(requests[0].body)).to, ['recipient@example.test']);
  assert.match(workEmailPayload(job, config).text, /8 tildelinger/);
  assert.match(workEmailPayload(job, config).text, /https:\/\/scipx.example.test\/projects\/project\/management/);
});
test('provider failure, timeout and malformed success remain retryable without logging private responses', async () => {
  assert.deepEqual(await deliverWorkEmail(job, config, async () => new Response('private response', { status: 429 })), { sent: false, error: 'provider_http_429' });
  assert.equal((await deliverWorkEmail(job, config, async () => { throw new Error('private token'); })).error, 'provider_unavailable');
  assert.equal((await deliverWorkEmail(job, config, async () => Response.json({}))).sent, false);
  await deliverWorkEmail({ ...job, email: null }, config, async () => { assert.fail('Must not send without recipient'); });
});
