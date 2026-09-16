import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { completion, configuration } from './lib/provider.mjs';
import { HttpError, validateMessages } from './lib/validation.mjs';

const root = new URL('./public/', import.meta.url);
const files = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/protocol.js', ['protocol.js', 'text/javascript']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
function equal(a, b) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 200000) throw new HttpError(413, 'Request too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export function createServer({ env = process.env, provider = completion } = {}) {
  const config = configuration(env);
  const accessToken = env.LIVE_ACCESS_TOKEN || '';
  const active = new Set();
  let starts = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      // Protect against hostile sites and DNS rebinding, including on loopback.
      const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
      const publicHost = env.PUBLIC_ORIGIN && new URL(env.PUBLIC_ORIGIN).host === req.headers.host;
      if (!localHost && !publicHost) throw new HttpError(403, 'Host not allowed. Configure PUBLIC_ORIGIN.');
      if (req.method === 'GET' && files.has(path)) {
        const [file, type] = files.get(path);
        res.setHeader('Content-Type', `${type}; charset=utf-8`); res.end(await readFile(new URL(file, root))); return;
      }
      if (req.method === 'GET' && path === '/api/config') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ demo: !config.key, model: config.model, reasoningModel: config.reasoningModel, authRequired: Boolean(accessToken) })); return;
      }
      if (req.method !== 'POST' || path !== '/api/respond') throw new HttpError(404, 'Not found.');
      const origin = req.headers.origin;
      const expected = env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if (origin && origin !== expected) throw new HttpError(403, 'Cross-origin request rejected.');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site request rejected.');
      if (accessToken && !equal(req.headers.authorization || '', `Bearer ${accessToken}`)) throw new HttpError(401, 'Enter the workspace access token in Settings.');
      const body = await jsonBody(req);
      const messages = validateMessages(body.messages);
      if (!['en', 'ko'].includes(body.language) || typeof body.deep !== 'boolean') throw new HttpError(400, 'Invalid language or mode.');
      starts = starts.filter(t => Date.now() - t < 60000);
      if (active.size >= 6 || starts.length >= 30) throw new HttpError(429, 'Workspace limit reached. Wait before trying again.');
      starts.push(Date.now());
      const controller = new AbortController(); active.add(controller);
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), body.deep ? 180000 : 60000);
      const cancel = () => controller.abort(); res.on('close', cancel);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
      const send = async (event, data) => {
        if (res.destroyed) return;
        if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) await once(res, 'drain', { signal: controller.signal });
      };
      const heartbeat = setInterval(() => { if (!res.destroyed && res.writableLength < 65536) res.write(': heartbeat\n\n'); }, 10000);
      const start = performance.now(); let first = null; let thinkingSent = false;
      try {
        await send('meta', { demo: !config.key, model: body.deep ? config.reasoningModel : config.model });
        for await (const item of provider({ messages, deep: body.deep, language: body.language, signal: controller.signal, config })) {
          if (controller.signal.aborted) break;
          if (item.type === 'thinking') { if (!thinkingSent) { await send('status', { status: 'thinking' }); thinkingSent = true; } continue; }
          if (first === null) { first = Math.round(performance.now() - start); await send('timing', { firstTokenMs: first }); }
          await send('token', { text: item.text });
        }
        if (!controller.signal.aborted) await send('done', { totalMs: Math.round(performance.now() - start), firstTokenMs: first });
      } catch (error) {
        if (!res.destroyed) await send('error', { message: controller.signal.aborted ? 'Request timed out or was cancelled.' : config.key ? safeError(error) : 'Demo interrupted.' }).catch(() => {});
      } finally { clearTimeout(timeout); clearInterval(heartbeat); active.delete(controller); res.off('close', cancel); res.end(); }
    } catch (error) {
      if (!res.headersSent) { res.writeHead(error.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.status ? error.message : 'Internal server error.' })); }
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => { for (const controller of active) controller.abort(); });
  return server;
}
function safeError(error) {
  return /^(DeepSeek |Provider disconnected|Provider stream failed)/.test(error.message) ? error.message : 'Provider connection failed. Check your network and configuration.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && (!process.env.LIVE_ACCESS_TOKEN || process.env.LIVE_ACCESS_TOKEN.length < 24)) throw new Error('Non-loopback hosting requires LIVE_ACCESS_TOKEN with at least 24 characters.');
  const server = createServer();
  server.listen(Number(process.env.PORT || 3000), host, () => console.log(`DeepSeek Live → http://${host.includes(':') ? `[${host}]` : host}:${server.address().port} (${process.env.DEEPSEEK_API_KEY ? 'live provider' : 'scripted demo'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
