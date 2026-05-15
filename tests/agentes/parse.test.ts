import { describe, it, expect } from 'vitest';
import { parseUpdate } from '../../src/agentes/core/telegram/parse';
import type { ParsedUpdate } from '../../src/agentes/shared/tipos';

function asText(r: ParsedUpdate) { return r as Exclude<ParsedUpdate, { kind: 'unknown' | 'media' | 'callback_query' }>; }
function asMedia(r: ParsedUpdate) { return r as Extract<ParsedUpdate, { kind: 'media' }>; }
function asCallback(r: ParsedUpdate) { return r as Extract<ParsedUpdate, { kind: 'callback_query' }>; }

describe('parseUpdate', () => {
  it('deve parse mensagem de texto corretamente', () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 100,
        from: { id: 123, first_name: 'Joao' },
        chat: { id: 123, type: 'private' },
        text: 'ola bot',
      },
    };

    const result = parseUpdate(update);
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toBe('ola bot');
      expect(result.messageId).toBe(100);
      expect(result.from).toBe('Joao');
    }
  });

  it('deve detectar foto como media', () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 101,
        from: { id: 123, first_name: 'Joao' },
        chat: { id: 123, type: 'private' },
        photo: [{}],
      },
    };

    const result = parseUpdate(update);
    expect(result.kind).toBe('media');
    if (result.kind === 'media') expect(result.mediaType).toBe('photo');
  });

  it('deve detectar voice como media', () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 102,
        from: { id: 123, first_name: 'Joao' },
        chat: { id: 123, type: 'private' },
        voice: {},
      },
    };

    const result = parseUpdate(update);
    expect(result.kind).toBe('media');
    if (result.kind === 'media') expect(result.mediaType).toBe('voice');
  });

  it('deve detectar sticker como media', () => {
    const update = {
      update_id: 4,
      message: {
        message_id: 103,
        from: { id: 123, first_name: 'Joao' },
        chat: { id: 123, type: 'private' },
        sticker: {},
      },
    };

    const result = parseUpdate(update);
    expect(result.kind).toBe('media');
    if (result.kind === 'media') expect(result.mediaType).toBe('sticker');
  });

  it('deve parse callback_query corretamente', () => {
    const update = {
      update_id: 5,
      callback_query: {
        id: 'cb1',
        from: { id: 123, first_name: 'Joao' },
        message: { message_id: 200, chat: { id: 123 } },
        data: 'confirmar_1',
      },
    };

    const result = parseUpdate(update);
    expect(result.kind).toBe('callback_query');
    if (result.kind === 'callback_query') {
      expect(result.data).toBe('confirmar_1');
      expect(result.chatId).toBe(123);
    }
  });

  it('deve marcar update vazio como unknown', () => {
    const update = { update_id: 6 };

    const result = parseUpdate(update);
    expect(result.kind).toBe('unknown');
  });
});
