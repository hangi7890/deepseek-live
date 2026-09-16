// Execute the actual app module against deterministic platform doubles.
// These are lifecycle/DOM contract tests, not microphone or visual browser tests.
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readSSE, takeSentences } from '../../public/protocol.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {};
    this.textContent = ''; this.value = ''; this.hidden = false; this.checked = false;
    this.options = []; this.classList = { toggle() {} };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); this.options = [...nodes]; }
  add(option) { this.options.push(option); }
  focus() {}
  showModal() { this.open = true; }
  querySelectorAll(selector) { return this.children.filter(n => selector === '.message' && n.className === 'message'); }
  requestSubmit() { this.onsubmit?.({ preventDefault() {} }); }
}

export async function client({ speechSupported = true, authRequired = false, configAvailable = true } = {}) {
  const elements = new Map(), requests = [], recognizers = [], utterances = [], timers = new Map(), events = {}, failures = [];
  let timerId = 0;
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('speak').checked = true; get('language').value = 'en';
  get('deep-toggle').setAttribute('aria-pressed', 'false');
  class Recognition {
    constructor() { this.starts = 0; this.aborts = 0; recognizers.push(this); }
    start() { this.starts++; }
    abort() { this.aborts++; }
    result(text, final = true) { const result = [{ transcript: text }]; result.isFinal = final; this.onresult({ resultIndex: 0, results: [result] }); }
  }
  const synth = { getVoices: () => [], addEventListener() {}, cancel() {}, speak(utterance) { utterances.push(utterance); } };
  const context = vm.createContext({
    document: { querySelector: selector => get(selector.slice(1)), createElement: tag => new Element(tag), querySelectorAll: () => [], addEventListener: (event, callback) => { events[event] = callback; } },
    window: { speechSynthesis: synth, ...(speechSupported ? { SpeechRecognition: Recognition } : {}), isSecureContext: true, addEventListener: (event, callback) => { events[event] = callback; } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    AbortController, crypto: { randomUUID }, readSSE, takeSentences,
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      if (url === '/api/config') return configAvailable ? Response.json({ demo: false, model: 'test', authRequired }) : new Response('', { status: 503 });
      let streamController, closed = false;
      const body = new ReadableStream({ start(controller) { streamController = controller; }, cancel() { closed = true; } });
      const request = {
        ...options, payload: JSON.parse(options.body),
        emit(event, data) { if (!closed) streamController.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); },
        close() { if (!closed) { streamController.close(); closed = true; } },
        done() { this.emit('done', { totalMs: 100, firstTokenMs: 20 }); this.close(); },
      };
      requests.push(request);
      if (failures.length) { const failure = failures.shift(); request.close(); return new Response(failure.body, { status: failure.status }); }
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  const source = await readFile(new URL('../../public/app.js', import.meta.url), 'utf8');
  await new vm.Script(`(async () => {${source.replace(/^import .*\n/, '')}\n})()`, { filename: 'public/app.js' }).runInContext(context);
  return {
    get, requests, recognizers, utterances, events,
    failNext(status, body) { failures.push({ status, body }); },
    async flush() { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); },
    async send(text, deep = false) { get('deep-toggle').attributes['aria-pressed'] === String(deep) || get('deep-toggle').onclick(); get('prompt').value = text; get('composer').requestSubmit(); await this.flush(); },
    runTimers(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); } },
    messages() { return get('transcript').children.filter(n => n.className === 'message'); },
    jobs() { return get('jobs').children.filter(n => n.className === 'job'); },
    async dispose() { events.pagehide(); for (const request of requests) request.close(); await this.flush(); timers.clear(); },
  };
}
