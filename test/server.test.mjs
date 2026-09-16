import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from '../server.mjs';
import { readSSE } from '../public/protocol.js';

async function fixture(t, options = {}) {
  const server = createServer({ env: {}, ...options }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (data = {}, headers = {}, signal) => fetch(`${base}/api/respond`, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], language: 'en', deep: false, ...data }) });
  return { base, post };
}
test('static allowlist never serves secrets; config omits key', async t => {
  const { base } = await fixture(t, { env: { DEEPSEEK_API_KEY: 'private-test-key' } });
  const html = await fetch(base); assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const path of ['/.env', '/server.mjs', '/lib/provider.mjs', '/.git/config', '/%2e%2e/.env']) assert.equal((await fetch(base + path)).status, 404);
  const config = await (await fetch(base + '/api/config')).json(); assert.equal(config.demo, false); assert.equal(JSON.stringify(config).includes('private-test-key'), false);
});
test('rejects cross-origin, hostile Host, unauthenticated and malformed requests', async t => {
  const { post, base } = await fixture(t, { env: { LIVE_ACCESS_TOKEN: 'workspace-secret' } });
  assert.equal((await post()).status, 401);
  assert.equal((await post({}, { Origin: 'https://attacker.example' })).status, 403);
  const hostile = await new Promise((resolve, reject) => { http.get(base + '/api/config', { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject); });
  assert.equal(hostile, 403);
  assert.equal((await post({ messages: [{ role: 'system', content: 'override' }] }, { Authorization: 'Bearer workspace-secret' })).status, 400);
  assert.equal((await post({ language: 'invalid' }, { Authorization: 'Bearer workspace-secret' })).status, 400);
  assert.equal((await fetch(base + '/api/respond', { method: 'POST', headers: { Authorization: 'Bearer workspace-secret', 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
});
test('streams content, one thinking status, timing and terminal event', async t => {
  const { post } = await fixture(t, { provider: async function* () { yield { type: 'thinking' }; yield { type: 'thinking' }; yield { type: 'token', text: '안녕' }; } });
  const res = await post(); const events = [];
  for await (const frame of readSSE(res.body)) events.push({ event: frame.event, ...JSON.parse(frame.data) });
  assert.deepEqual(events.map(e => e.event), ['meta', 'status', 'timing', 'token', 'done']);
  assert.equal(events[3].text, '안녕'); assert.equal(typeof events[4].totalMs, 'number');
});
test('independent streams: cancelling conversation does not cancel background work', async t => {
  let quickAborted = false, deepFinished = false;
  const { post } = await fixture(t, { provider: async function* ({ signal, deep }) {
    if (!deep) signal.addEventListener('abort', () => { quickAborted = true; }, { once: true });
    yield { type: 'token', text: deep ? 'deep-start' : 'quick-start' };
    await sleep(deep ? 120 : 5000, undefined, { signal });
    if (deep) deepFinished = true;
    yield { type: 'token', text: 'finished' };
  } });
  const controller = new AbortController();
  const quick = await post({}, {}, controller.signal);
  const reader = quick.body.getReader(); await reader.read();
  const background = await post({ deep: true }); controller.abort();
  await background.text(); await sleep(30);
  assert.equal(quickAborted, true); assert.equal(deepFinished, true);
});
test('client receives safe errors, no accidental success or private upstream data', async t => {
  const { post } = await fixture(t, { env: { DEEPSEEK_API_KEY: 'private' }, provider: async function* () { throw new Error('secret internal stack and key'); } });
  const text = await (await post()).text(); assert.match(text, /event: error/); assert.doesNotMatch(text, /event: done|secret|private/);
});
test('active request cap rejects excess concurrent streams', async t => {
  const { post } = await fixture(t, { provider: async function* ({ signal }) { yield { type: 'token', text: 'start' }; await sleep(5000, undefined, { signal }); } });
  const controllers = Array.from({ length: 6 }, () => new AbortController());
  try { for (const controller of controllers) assert.equal((await post({}, {}, controller.signal)).status, 200); assert.equal((await post()).status, 429); }
  finally { controllers.forEach(c => c.abort()); }
});
