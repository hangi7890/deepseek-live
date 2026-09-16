export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function validateMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 40) throw new HttpError(400, 'Provide 1–40 messages.');
  let length = 0;
  const messages = value.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 8000) {
      throw new HttpError(400, 'Invalid message role or content (maximum 8,000 characters).');
    }
    length += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (length > 48000) throw new HttpError(400, 'Conversation too large. Start a new session.');
  if (messages.at(-1).role !== 'user') throw new HttpError(400, 'The last message must be from the user.');
  return messages;
}
