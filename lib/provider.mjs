import { setTimeout as sleep } from 'node:timers/promises';
import { readSSE } from '../public/protocol.js';

export function configuration(env = process.env) {
  const base = new URL(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid provider URL.');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('Provider URL requires HTTPS except on loopback.');
  return {
    key: env.DEEPSEEK_API_KEY || '', base: base.href.replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || 'deepseek-flash',
    reasoningModel: env.DEEPSEEK_REASONING_MODEL || env.DEEPSEEK_MODEL || 'deepseek-flash',
  };
}

export async function* completion({ messages, deep = false, language = 'en', signal, config = configuration(), fetcher = fetch }) {
  if (!config.key) {
    const korean = language === 'ko';
    const answer = deep
      ? (korean ? '데모 분석 결과입니다. 대화 경로와 심층 추론 경로를 분리하면, 오래 걸리는 작업 중에도 새 질문을 받을 수 있습니다. 각 요청에 독립적인 취소 신호를 두고 오래된 응답이 재생되지 않도록 관리합니다. 실제 질문 분석에는 DeepSeek API 키가 필요합니다.' : 'This is a scripted demo analysis. Keep conversation and deeper reasoning on independent paths. Give each request its own cancellation signal, and discard stale speech after an interruption. Add a DeepSeek API key to analyze your actual question.')
      : (korean ? '안녕하세요. 지금은 API 키 없이 실행되는 데모입니다. 심층 분석을 시작하고, 결과를 기다리는 동안 다른 질문을 입력해 보세요. 실제 대화를 하려면 서버에 DeepSeek API 키를 설정하세요.' : 'Hello, you are in the no-key demo. Start a deep analysis, then ask another question while it runs. The two streams work independently. Add your DeepSeek API key on the server for real conversations.');
    await sleep(deep ? 1800 : 250, undefined, { signal });
    for (const token of answer.match(/\S+\s*/g) || []) {
      await sleep(deep ? 70 : 35, undefined, { signal });
      yield { type: 'token', text: token };
    }
    return;
  }
  const instructions = deep
    ? 'Analyze the user request carefully. Give a useful, structured answer. Be explicit about uncertainty. You have no web search or external tools; do not claim to have searched or taken actions.'
    : 'You are DeepSeek Live, a concise voice assistant. Reply naturally in 1–3 short sentences unless asked for detail. Avoid markdown and long lists in spoken answers. You have no web search or external tools. Do not claim to hear emotion or sounds: you receive transcripts only.';
  const response = await fetcher(`${config.base}/chat/completions`, {
    method: 'POST', signal, headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: deep ? config.reasoningModel : config.model, stream: true,
      thinking: { type: deep ? 'enabled' : 'disabled' }, max_tokens: deep ? 8192 : 1024,
      messages: [{ role: 'system', content: `${instructions} Respond in ${language === 'ko' ? 'Korean' : 'English'} unless the user requests another language.` }, ...messages] }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(response.status === 401 ? 'DeepSeek rejected the API key. Check the server configuration.' : response.status === 402 ? 'DeepSeek balance is insufficient.' : response.status === 429 ? 'DeepSeek rate limit reached. Please try again later.' : `DeepSeek request failed (HTTP ${response.status}).`);
    throw error;
  }
  if (!response.body) throw new Error('The provider returned an empty stream.');
  let completed = false;
  for await (const frame of readSSE(response.body)) {
    if (frame.data === '[DONE]') { completed = true; break; }
    const data = JSON.parse(frame.data);
    if (data.error) throw new Error('Provider stream failed.');
    const delta = data.choices?.[0]?.delta;
    if (delta?.reasoning_content) yield { type: 'thinking' }; // Never expose hidden reasoning.
    if (delta?.content) yield { type: 'token', text: delta.content };
  }
  if (!completed) throw new Error('Provider disconnected before completing the response.');
}
