// End-to-end packaging check. Starts the documented npm command, or checks an
// already-running loopback demo container. Never intentionally calls a paid API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { readSSE } from '../public/protocol.js';

const external = process.argv.indexOf('--url');
let child, lines;
try {
  let base;
  if (external !== -1) {
    const url = new URL(process.argv[external + 1]);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Smoke checks only support loopback hosts.');
    assert.equal(url.protocol, 'http:'); assert.equal(url.pathname, '/');
    assert.ok(!url.username && !url.password && !url.search && !url.hash);
    base = url.origin;
  } else {
    assert.ok(process.env.npm_execpath, 'Run this script with npm run smoke.');
    child = spawn(process.execPath, [process.env.npm_execpath, 'start'], {
      cwd: new URL('..', import.meta.url), detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DEEPSEEK_API_KEY: '', DEEPSEEK_BASE_URL: 'https://api.deepseek.com', DEEPSEEK_MODEL: 'deepseek-flash', DEEPSEEK_REASONING_MODEL: 'deepseek-flash', LIVE_ACCESS_TOKEN: '', PUBLIC_ORIGIN: '' },
    });
    // Consume stderr without printing potentially sensitive environment details.
    child.stderr.resume();
    lines = createInterface({ input: child.stdout });
    base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('npm start did not become ready within 15 seconds.')), 15000);
      const finish = fn => value => { clearTimeout(timeout); fn(value); };
      child.once('error', finish(reject));
      child.once('exit', finish(() => reject(new Error('npm start exited before the smoke check completed.'))));
      lines.on('line', line => { const match = line.match(/DeepSeek Live → (http:\/\/127\.0\.0\.1:\d+) \(scripted demo\)/); if (match) finish(resolve)(match[1]); });
    });
  }

  const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) });
  // Wait for Docker startup when --url targets a freshly launched container.
  let config;
  for (let i = 0; i < 30; i++) {
    try { const response = await request('/api/config'); assert.equal(response.status, 200); config = await response.json(); break; }
    catch (error) { if (i === 29) throw error; await delay(200); }
  }
  assert.equal(config.demo, true, 'Refusing to run demo checks against a paid/live provider.');
  const page = await request('/'); assert.equal(page.status, 200); assert.match(await page.text(), /DeepSeek Live/);
  assert.equal((await request('/.env')).status, 404);
  assert.equal((await request('/app.js')).status, 200);
  const token = external !== -1 ? process.env.SMOKE_ACCESS_TOKEN : '';
  const body = language => JSON.stringify({ messages: [{ role: 'user', content: 'Packaging smoke test' }], language, deep: false });
  if (config.authRequired) {
    assert.ok(token, 'SMOKE_ACCESS_TOKEN is required for this demo server.');
    assert.equal((await request('/api/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('en') })).status, 401);
  }
  for (const language of ['en', 'ko']) {
    const response = await request('/api/respond', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body(language) });
    assert.equal(response.status, 200);
    let answer = '', completed = false;
    for await (const frame of readSSE(response.body)) {
      assert.notEqual(frame.event, 'error');
      const data = JSON.parse(frame.data);
      if (frame.event === 'meta') assert.equal(data.demo, true);
      if (frame.event === 'token') answer += data.text;
      if (frame.event === 'done') completed = true;
    }
    assert.equal(completed, true); assert.match(answer, language === 'ko' ? /데모/ : /demo/);
    console.log(`PASS ${language}: complete scripted response`);
  }
  console.log(`PASS ${external === -1 ? 'npm start' : 'container HTTP'}: HTML, assets, secret exclusion${config.authRequired ? ', authentication' : ''}, and bilingual streaming`);
} finally {
  lines?.close();
  if (child?.pid && child.exitCode === null) {
    const closed = once(child, 'exit').catch(() => {});
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      await once(killer, 'exit');
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await closed;
  }
}
