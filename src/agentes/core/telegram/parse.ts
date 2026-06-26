import type { TelegramUpdate, ParsedUpdate } from '../../shared/tipos';

export function parseUpdate(body: TelegramUpdate): ParsedUpdate {
  if (body.callback_query) {
    return {
      kind: 'callback_query',
      chatId: body.callback_query.from.id,
      data: body.callback_query.data,
      messageId: body.callback_query.message?.message_id ?? 0,
      from: body.callback_query.from.first_name,
    };
  }

  if (body.message) {
    const { message } = body;
    const base = {
      chatId: message.chat.id,
      messageId: message.message_id,
      from: message.from.first_name,
    };

    if (message.text) {
      return { kind: 'text', ...base, text: message.text };
    }

    if (message.photo) return { kind: 'media', ...base, mediaType: 'photo' };
    if (message.voice) return { kind: 'media', ...base, mediaType: 'voice' };
    if (message.video) return { kind: 'media', ...base, mediaType: 'video' };
    if (message.sticker) return { kind: 'media', ...base, mediaType: 'sticker' };
    if (message.contact) return { kind: 'media', ...base, mediaType: 'contact' };
    if (message.location) return { kind: 'media', ...base, mediaType: 'location' };

    return { kind: 'unknown', chatId: message.chat.id, raw: message };
  }

  return { kind: 'unknown', chatId: 0, raw: body };
}
