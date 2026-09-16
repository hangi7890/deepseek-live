// Shared by the browser, upstream provider, and contract tests.
export async function* readSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1048576) throw new Error('Stream frame too large.');
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = 'message';
        const data = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length) yield { event, data: data.join('\n') };
      }
      if (done) {
        if (buffer.trim()) throw new Error('Incomplete stream frame.');
        return;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function takeSentences(buffer, flush = false) {
  const sentences = [];
  let match;
  while ((match = /^([\s\S]*?[.!?。！？](?:\s+|$))/.exec(buffer))) {
    sentences.push(match[1].trim());
    buffer = buffer.slice(match[0].length);
  }
  if (flush && buffer.trim()) { sentences.push(buffer.trim()); buffer = ''; }
  return { sentences, rest: buffer };
}
