import { readSSE, takeSentences } from './protocol.js';

const $ = selector => document.querySelector(selector);
const ui = Object.fromEntries(['mic', 'interrupt', 'orb', 'voice-status', 'voice-detail', 'mic-state', 'transcript', 'empty-state', 'prompt', 'interim', 'latency', 'turn-count', 'deep-toggle', 'language', 'voice-select', 'speak', 'settings', 'access-token', 'notice'].map(id => [id, $(`#${id}`)]));
let history = [], conversation = null, turn = 0, epoch = 0, deepMode = false, listening = false, recognition = null, restartTimer = null;
let language = 'en', selectedVoice = '', spokenQueue = [], speaking = false, speechEpoch = 0, speechBuffer = '', utterance = null;
let config = null, noticeTimer, partial = '', pendingFinal = '', finalTimer;
let recognitionEpoch = 0;
const jobs = new Map();
const synth = window.speechSynthesis;

function notice(message) { ui.notice.textContent = message; ui.notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { ui.notice.hidden = true; }, 7000); }
function state(title, detail) { ui['voice-status'].textContent = title; ui['voice-detail'].textContent = detail; ui.orb.classList.toggle('active', listening || speaking || Boolean(conversation)); }
function idle() { state(listening ? 'I’m listening.' : 'Make yourself heard.', listening ? 'Take your time. You can interrupt a reply.' : 'Start with your voice, or type a thought below.'); }
function scrollTranscript() { ui.transcript.scrollTop = ui.transcript.scrollHeight; }
function message(role, text = '') {
  ui['empty-state'].hidden = true;
  const article = document.createElement('article'); article.className = 'message'; article.dataset.role = role;
  const label = document.createElement('span'); label.className = 'message-label'; label.textContent = role === 'user' ? 'You' : 'DeepSeek Live';
  const content = document.createElement('p'); content.textContent = text;
  const status = document.createElement('span'); status.className = 'message-status';
  article.append(label, content, status); ui.transcript.append(article); scrollTranscript();
  return { article, content, status };
}
function stopSpeech() { speechEpoch++; spokenQueue = []; speechBuffer = ''; speaking = false; utterance = null; synth?.cancel(); }
function pumpSpeech() {
  if (speaking || !spokenQueue.length || !ui.speak.checked || !synth) return;
  const text = spokenQueue.shift(), generation = speechEpoch;
  utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ''));
  utterance.lang = language === 'ko' ? 'ko-KR' : 'en-US';
  utterance.voice = synth.getVoices().find(v => v.voiceURI === selectedVoice) || synth.getVoices().find(v => v.lang.startsWith(language)) || null;
  utterance.rate = 1;
  speaking = true; state('A thought, out loud.', 'Jump in whenever you want.');
  const ended = () => { if (generation !== speechEpoch) return; speaking = false; utterance = null; if (spokenQueue.length) pumpSpeech(); else if (!conversation) idle(); };
  utterance.onend = ended; utterance.onerror = event => { if (generation !== speechEpoch) return; ended(); if (!['canceled', 'interrupted'].includes(event.error)) notice('Speech playback unavailable. Your text reply is still here.'); };
  synth.speak(utterance);
}
function enqueue(text, flush = false) {
  if (!ui.speak.checked || !synth) { speechBuffer = ''; return; }
  speechBuffer += text;
  const { sentences, rest } = takeSentences(speechBuffer, flush); speechBuffer = rest;
  spokenQueue.push(...sentences); pumpSpeech();
}
function interrupt(show = true) {
  epoch++;
  if (conversation) { conversation.controller.abort(); conversation.view.status.textContent = 'Interrupted'; conversation = null; }
  stopSpeech(); idle();
  if (show) notice('Reply stopped. Background work continues.');
}
function historyFor(text) {
  // Retain bounded whole turns; account for the server’s total character budget.
  const kept = history.slice(-12);
  while (kept.length && kept.reduce((n, m) => n + m.content.length, 0) + text.length > 40000) kept.splice(0, 2);
  return [...kept, { role: 'user', content: text }];
}
async function stream(messages, deep, controller, onEvent) {
  const token = ui['access-token'].value.trim();
  const res = await fetch('/api/respond', { method: 'POST', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages, deep, language }) });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error || `Request failed (${res.status}).`); }
  let done = false;
  for await (const frame of readSSE(res.body)) {
    if (controller.signal.aborted) return;
    const data = JSON.parse(frame.data);
    if (frame.event === 'error') throw new Error(data.message);
    if (frame.event === 'done') done = true;
    onEvent(frame.event, data);
  }
  if (!done && !controller.signal.aborted) throw new Error('Connection ended early. Please try again.');
}
async function send(text, deep = deepMode) {
  text = text.trim(); if (!text) return;
  if (!config) { notice('Waiting for the server. Refresh if the connection does not recover.'); return; }
  if (config.authRequired && !ui['access-token'].value.trim()) { ui.settings.showModal(); notice('Enter your workspace access token to continue.'); return; }
  if (text.length > 8000) { notice('Keep each message under 8,000 characters.'); return; }
  if (deep) { startJob(text); return; }
  interrupt(false); const generation = epoch;
  const messages = historyFor(text);
  message('user', text); turn++; ui['turn-count'].textContent = String(turn).padStart(2, '0');
  const view = message('assistant'), controller = new AbortController();
  conversation = { controller, view }; let answer = '';
  view.status.textContent = 'Connecting…'; state('Following your thought.', 'Preparing a response.');
  try {
    await stream(messages, false, controller, (event, data) => {
      if (generation !== epoch) return;
      if (event === 'token') { answer += data.text; view.content.textContent = answer; view.status.textContent = ''; enqueue(data.text); scrollTranscript(); }
      if (event === 'timing') ui.latency.textContent = `${data.firstTokenMs} ms`;
      if (event === 'meta' && data.demo) view.status.textContent = 'Scripted demo — not an AI answer';
      if (event === 'done') { view.status.textContent = `${config.demo ? 'Scripted demo · ' : ''}${(data.totalMs / 1000).toFixed(1)}s total`; enqueue('', true); }
    });
    if (generation === epoch && answer) history = [...messages, { role: 'assistant', content: answer.slice(0, 8000) }].slice(-14);
  } catch (error) {
    if (generation === epoch && !controller.signal.aborted) { view.status.textContent = error.message; stopSpeech(); notice(error.message); }
  } finally { if (generation === epoch) { conversation = null; if (!speaking) idle(); } }
}
function updateJobs() {
  const active = [...jobs.values()].filter(j => j.running).length;
  $('#task-count').textContent = String(jobs.size); $('#job-metric').textContent = active ? `${active} working` : 'Ready';
  $('#no-jobs').hidden = jobs.size > 0;
}
async function startJob(text) {
  if ([...jobs.values()].filter(j => j.running).length >= 2) { notice('Two analyses are already running. Cancel one or wait for a result.'); return; }
  // Bound retained DOM and job state in long sessions.
  if (jobs.size >= 8) { const oldest = [...jobs.values()].find(j => !j.running); if (oldest) { oldest.element.remove(); jobs.delete(oldest.id); } }
  const id = crypto.randomUUID(), controller = new AbortController();
  const element = document.createElement('article'); element.className = 'job';
  const status = document.createElement('span'); status.className = 'job-state'; status.textContent = 'Thinking independently';
  const title = document.createElement('h3'); title.textContent = text;
  const result = document.createElement('p');
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel analysis';
  const bring = document.createElement('button'); bring.textContent = 'Discuss result'; bring.hidden = true;
  element.append(status, title, result, cancel, bring); $('#jobs').prepend(element);
  const job = { id, controller, running: true, element, answer: '', cancelled: false }; jobs.set(id, job); updateJobs();
  cancel.onclick = () => { job.cancelled = true; controller.abort(); job.running = false; status.textContent = 'Cancelled'; cancel.hidden = true; updateJobs(); };
  bring.onclick = () => { ui.prompt.value = `${language === 'ko' ? '다음 분석을 간단히 설명해줘:' : 'Explain this analysis briefly:'}\n${job.answer.slice(0, 7400)}`; setDeep(false); ui.prompt.focus(); };
  notice('Analysis started. You can keep the conversation going.');
  try {
    await stream(historyFor(text), true, controller, (event, data) => {
      if (job.cancelled || !jobs.has(id)) return;
      if (event === 'token') { job.answer += data.text; result.textContent = job.answer; status.textContent = 'Writing the answer'; }
      if (event === 'done') { status.textContent = `${config.demo ? 'Demo · ' : ''}Complete · ${(data.totalMs / 1000).toFixed(1)}s`; bring.hidden = !job.answer; notice('Your background analysis is ready.'); }
    });
  } catch (error) { if (!job.cancelled) { status.textContent = 'Analysis failed'; result.textContent = error.message; } }
  finally { job.running = false; cancel.hidden = true; updateJobs(); }
}
function setDeep(value) { deepMode = value; ui['deep-toggle'].setAttribute('aria-pressed', String(value)); }
function stopListening() {
  listening = false; recognitionEpoch++; clearTimeout(restartTimer); clearTimeout(finalTimer); pendingFinal = ''; partial = '';
  const previous = recognition; recognition = null; previous?.abort();
  ui.mic.textContent = '◉ Start listening'; ui.mic.setAttribute('aria-pressed', 'false'); ui['mic-state'].textContent = 'MIC OFF'; ui.interim.textContent = ''; idle();
}
function startListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { notice('Speech recognition is unavailable here. Try Chrome, or use text chat.'); return; }
  if (!window.isSecureContext) { notice('Microphone access needs HTTPS or localhost.'); return; }
  if (listening) { stopListening(); return; }
  const current = new Recognition(), generation = ++recognitionEpoch;
  recognition = current; current.lang = language === 'ko' ? 'ko-KR' : 'en-US'; current.continuous = true; current.interimResults = true;
  const isCurrent = () => listening && recognition === current && generation === recognitionEpoch;
  listening = true; ui.mic.textContent = '■ Stop listening'; ui.mic.setAttribute('aria-pressed', 'true'); ui['mic-state'].textContent = 'MIC ON'; idle();
  current.onresult = event => {
    if (!isCurrent()) return;
    partial = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) pendingFinal += `${event.results[i][0].transcript} `;
      else partial += event.results[i][0].transcript;
    }
    ui.interim.textContent = `${pendingFinal}${partial}`;
    // Recognition, not raw noise, triggers interruption. Headphones reduce self-echo.
    if ((pendingFinal + partial).trim() && (conversation || speaking)) interrupt(false);
    clearTimeout(finalTimer);
    if (pendingFinal.trim() && !partial.trim()) finalTimer = setTimeout(() => {
      if (!isCurrent()) return; const text = pendingFinal.trim(); pendingFinal = ''; ui.interim.textContent = ''; void send(text);
    }, 650);
  };
  current.onerror = event => {
    if (!isCurrent()) return;
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    stopListening(); notice(event.error === 'not-allowed' ? 'Microphone permission denied. Allow it in your browser or use text.' : `Speech recognition stopped: ${event.error}. Text chat is available.`);
  };
  current.onend = () => { if (isCurrent()) restartTimer = setTimeout(() => { if (!isCurrent()) return; try { current.start(); } catch { stopListening(); notice('Restart listening to reconnect the microphone.'); } }, 250); };
  try { current.start(); } catch { stopListening(); notice('Could not start microphone recognition. Use text or try Chrome.'); }
}
function loadVoices() {
  ui['voice-select'].replaceChildren(new Option('Automatic', ''));
  for (const voice of synth?.getVoices() || []) if (voice.lang.startsWith(language)) ui['voice-select'].add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
  if ([...ui['voice-select'].options].some(o => o.value === selectedVoice)) ui['voice-select'].value = selectedVoice;
  else selectedVoice = '';
}
$('#composer').onsubmit = event => { event.preventDefault(); const text = ui.prompt.value; if (text.trim()) { ui.prompt.value = ''; void send(text); } };
ui.prompt.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#composer').requestSubmit(); } };
ui.mic.onclick = startListening; ui.interrupt.onclick = () => interrupt();
ui['deep-toggle'].onclick = () => setDeep(!deepMode);
$('#settings-open').onclick = () => ui.settings.showModal();
ui.language.onchange = () => { stopListening(); interrupt(false); language = ui.language.value; $('#language-label').textContent = language === 'ko' ? '한국어' : 'ENGLISH'; ui.prompt.placeholder = language === 'ko' ? '어떤 생각을 하고 있나요?' : "What's on your mind?"; loadVoices(); };
ui['voice-select'].onchange = () => { selectedVoice = ui['voice-select'].value; };
ui.speak.onchange = () => { if (!ui.speak.checked) { stopSpeech(); if (!conversation) idle(); } };
$('#reset').onclick = () => { stopListening(); interrupt(false); for (const job of jobs.values()) { job.cancelled = true; job.controller.abort(); job.element.remove(); } jobs.clear(); updateJobs(); history = []; turn = 0; ui['turn-count'].textContent = '00'; ui.latency.textContent = '— ms'; ui.transcript.querySelectorAll('.message').forEach(el => el.remove()); ui['empty-state'].hidden = false; ui.prompt.value = ''; setDeep(false); notice('New session. Previous conversation and analyses cleared.'); };
document.querySelectorAll('[data-prompt]').forEach(button => { button.onclick = () => { void send(button.dataset.prompt, button.dataset.deep === 'true'); }; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !ui.settings.open) interrupt(false); });
window.addEventListener('pagehide', () => { stopListening(); interrupt(false); for (const job of jobs.values()) job.controller.abort(); });
if (synth) { synth.addEventListener('voiceschanged', loadVoices); loadVoices(); } else { ui.speak.checked = false; ui.speak.disabled = true; }
if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { ui.mic.disabled = true; $('#voice-engine').textContent = 'TEXT MODE'; ui['voice-detail'].textContent = 'Voice recognition is unavailable here. Text chat is ready.'; }
try {
  const response = await fetch('/api/config'); if (!response.ok) throw new Error(); config = await response.json();
  $('#mode-badge').textContent = config.demo ? 'SCRIPTED DEMO' : 'API CONFIGURED';
  $('#provider-label').textContent = config.demo ? 'Demo mode · no API key configured' : `Configured provider · ${config.model}`;
} catch { $('#mode-badge').textContent = 'OFFLINE'; notice('Cannot reach the server. Start it with npm start and refresh.'); }
