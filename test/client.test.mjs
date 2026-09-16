import test from 'node:test';
import assert from 'node:assert/strict';
import { client } from './helpers/client-harness.mjs';

async function setup(t, options) { const app = await client(options); t.after(() => app.dispose()); return app; }

test('late recognition callbacks cannot affect a newly started microphone session', async t => {
  const app = await setup(t);
  app.get('mic').onclick(); const old = app.recognizers[0];
  app.get('mic').onclick(); app.get('mic').onclick(); const current = app.recognizers[1];
  old.onend(); old.onerror({ error: 'network' }); old.result('stale words');
  app.runTimers(250); app.runTimers(650); await app.flush();
  assert.equal(current.starts, 1); assert.equal(current.aborts, 0);
  assert.equal(app.get('mic-state').textContent, 'MIC ON'); assert.equal(app.requests.length, 0);
  current.result('new question'); app.runTimers(650); await app.flush();
  assert.equal(app.requests[0].payload.messages.at(-1).content, 'new question');
});

test('stopping microphone cancels pending final transcript submission and restart', async t => {
  const app = await setup(t); app.get('mic').onclick();
  const mic = app.recognizers[0]; mic.result('do not send'); mic.onend(); app.get('mic').onclick();
  app.runTimers(650); app.runTimers(250); await app.flush();
  assert.equal(app.requests.length, 0); assert.equal(mic.starts, 1); assert.equal(app.get('interim').textContent, '');
});

test('rapid replacement rejects old response tokens and preserves only the completed turn in context', async t => {
  const app = await setup(t); await app.send('first'); const first = app.requests[0];
  await app.send('second'); const second = app.requests[1];
  assert.equal(first.signal.aborted, true);
  first.emit('token', { text: 'stale answer.' }); first.done();
  second.emit('token', { text: 'current answer.' }); second.done(); await app.flush();
  assert.equal(app.messages()[1].children[1].textContent, '');
  assert.equal(app.messages()[1].children[2].textContent, 'Interrupted');
  assert.equal(app.messages()[3].children[1].textContent, 'current answer.');
  assert.deepEqual(app.utterances.map(u => u.text), ['current answer.']);
  await app.send('third');
  assert.deepEqual(app.requests[2].payload.messages.map(m => m.content), ['second', 'current answer.', 'third']);
});

test('foreground interruption leaves analysis live; cancelled analysis cannot complete', async t => {
  const app = await setup(t); await app.send('analyze', true); const deep = app.requests[0];
  await app.send('chat'); app.get('interrupt').onclick();
  assert.equal(deep.signal.aborted, false); assert.equal(app.requests[1].signal.aborted, true);
  const card = app.jobs()[0]; card.children[3].onclick();
  deep.emit('token', { text: 'too late' }); deep.done(); await app.flush();
  assert.equal(card.children[0].textContent, 'Cancelled'); assert.equal(card.children[2].textContent, '');
  assert.equal(card.children[4].hidden, true); assert.equal(app.get('job-metric').textContent, 'Ready');
});

test('new session clears streams and ignores their late results', async t => {
  const app = await setup(t); await app.send('analyze', true); await app.send('chat');
  app.get('reset').onclick();
  for (const request of app.requests) { assert.equal(request.signal.aborted, true); request.emit('token', { text: 'late' }); request.done(); }
  await app.flush();
  assert.equal(app.messages().length, 0); assert.equal(app.jobs().length, 0);
  assert.equal(app.get('task-count').textContent, '0'); assert.equal(app.get('turn-count').textContent, '00');
  assert.equal(app.get('notice').textContent, 'New session. Previous conversation and analyses cleared.');
});

test('speech cancellation discards the queue and suppresses stale completion/error callbacks', async t => {
  const app = await setup(t); await app.send('speak');
  const request = app.requests[0]; request.emit('token', { text: 'First. Queued.' }); await app.flush();
  const old = app.utterances[0]; assert.equal(app.utterances.length, 1);
  app.get('interrupt').onclick(); const notice = app.get('notice').textContent;
  old.onend(); old.onerror({ error: 'network' });
  assert.equal(app.utterances.length, 1); assert.equal(app.get('notice').textContent, notice);
});

test('muted chunks are never queued for later speech', async t => {
  const app = await setup(t); await app.send('speak'); const request = app.requests[0];
  request.emit('token', { text: 'Before.' }); await app.flush();
  app.get('speak').checked = false; app.get('speak').onchange();
  request.emit('token', { text: 'Muted. Also muted.' }); await app.flush();
  app.get('speak').checked = true; app.get('speak').onchange();
  request.emit('token', { text: 'After.' }); request.done(); await app.flush();
  assert.deepEqual(app.utterances.map(u => u.text), ['Before.', 'After.']);
});

test('truncated response fails visibly and is excluded from future context', async t => {
  const app = await setup(t); await app.send('first'); app.requests[0].emit('token', { text: 'unfinished' }); app.requests[0].close(); await app.flush();
  assert.match(app.messages()[1].children[2].textContent, /Connection ended early/);
  await app.send('retry'); assert.deepEqual(app.requests[1].payload.messages.map(m => m.content), ['retry']);
});

test('analysis concurrency is bounded and a freed slot can be reused', async t => {
  const app = await setup(t); await app.send('one', true); await app.send('two', true); await app.send('three', true);
  assert.equal(app.requests.length, 2); assert.equal(app.jobs().length, 2);
  app.jobs()[0].children[3].onclick(); await app.send('replacement', true);
  assert.equal(app.requests.length, 3);
});
