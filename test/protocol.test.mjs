import test from 'node:test';
import assert from 'node:assert/strict';
import { readSSE, takeSentences } from '../public/protocol.js';
import { validateMessages } from '../lib/validation.mjs';
import { completion, configuration } from '../lib/provider.mjs';

function byteStream(text, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close(); } });
}
test('SSE survives split CRLF, UTF-8 Korean, comments, and multiline data', async () => {
  const frames = [];
  for await (const frame of readSSE(byteStream(': heartbeat\r\n\r\nevent: token\r\ndata: 안녕\r\ndata: 세계\r\n\r\ndata: [DONE]\n\n'))) frames.push(frame);
  assert.deepEqual(frames, [{ event: 'token', data: '안녕\n세계' }, { event: 'message', data: '[DONE]' }]);
});
test('SSE rejects truncated frames instead of silently claiming success', async () => {
  await assert.rejects(async () => { for await (const _ of readSSE(byteStream('data: unfinished'))) {} }, /Incomplete/);
});
test('SSE rejects unbounded frames', async () => {
  await assert.rejects(async () => { for await (const _ of readSSE(byteStream('x'.repeat(1048577), 1048577))) {} }, /too large/);
});
test('speech chunks preserve partial sentences and Korean punctuation', () => {
  assert.deepEqual(takeSentences('Hello. 다음 문장입니다! incomplete'), { sentences: ['Hello.', '다음 문장입니다!'], rest: 'incomplete' });
  assert.deepEqual(takeSentences('마지막 문장', true), { sentences: ['마지막 문장'], rest: '' });
});
test('message validation rejects system override, excessive history and empty input', () => {
  for (const input of [[], [{ role: 'system', content: 'override' }], [{ role: 'user', content: ' ' }], [{ role: 'assistant', content: 'hello' }], Array(41).fill({ role: 'user', content: 'x' }), [{ role: 'user', content: 'x'.repeat(8001) }], Array(7).fill({ role: 'user', content: 'x'.repeat(8000) })]) assert.throws(() => validateMessages(input));
  assert.deepEqual(validateMessages([{ role: 'user', content: '안녕', extra: 'drop' }]), [{ role: 'user', content: '안녕' }]);
});
test('provider configuration rejects credential-bearing and insecure remote URLs', () => {
  for (const base of ['http://remote.example', 'https://user:pass@example.com', 'https://example.com?secret=x', 'ftp://localhost']) assert.throws(() => configuration({ DEEPSEEK_BASE_URL: base }));
  assert.equal(configuration({ DEEPSEEK_BASE_URL: 'http://localhost:8000/v1' }).base, 'http://localhost:8000/v1');
});
test('provider sends correct modes, handles split streaming, and does not expose reasoning text', async () => {
  for (const deep of [false, true]) {
    let request;
    const events = [];
    for await (const event of completion({ messages: [{ role: 'user', content: 'hi' }], deep, language: 'ko', signal: new AbortController().signal,
      config: { key: 'test-key', base: 'https://example.com', model: 'quick', reasoningModel: 'deep' },
      fetcher: async (url, options) => { request = { url, ...options }; return new Response(byteStream('data: {"choices":[{"delta":{"reasoning_content":"secret reasoning"}}]}\n\ndata: {"choices":[{"delta":{"content":"안녕하세요"}}]}\n\ndata: [DONE]\n\n')); },
    })) events.push(event);
    const body = JSON.parse(request.body);
    assert.equal(body.model, deep ? 'deep' : 'quick'); assert.equal(body.thinking.type, deep ? 'enabled' : 'disabled');
    assert.equal(body.messages[0].role, 'system'); assert.match(body.messages[0].content, /Korean/);
    assert.deepEqual(events, [{ type: 'thinking' }, { type: 'token', text: '안녕하세요' }]);
    assert.equal(request.headers.Authorization, 'Bearer test-key');
  }
});
test('provider reports upstream authentication error without leaking its body', async () => {
  await assert.rejects(async () => {
    for await (const _ of completion({ messages: [], config: { key: 'secret', base: 'https://example.com' }, fetcher: async () => new Response('private secret', { status: 401 }) })) {}
  }, /DeepSeek rejected the API key/);
});
test('provider rejects a stream without the terminal marker', async () => {
  await assert.rejects(async () => { for await (const _ of completion({ messages: [], config: { key: 'x', base: 'https://example.com' }, fetcher: async () => new Response(byteStream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')) })) {} }, /disconnected/);
});
test('demo can be cancelled before it emits a response', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(async () => { for await (const _ of completion({ messages: [], signal: controller.signal, config: { key: '' } })) {} }, { name: 'AbortError' });
});
