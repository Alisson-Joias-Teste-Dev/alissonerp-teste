export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: unknown[];
    voice?: unknown;
    video?: unknown;
    sticker?: unknown;
    contact?: unknown;
    location?: unknown;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { message_id: number; chat: { id: number } };
    data: string;
  };
}

export type ParsedUpdate =
  | { kind: 'text'; chatId: number; text: string; messageId: number; from: string }
  | { kind: 'callback_query'; chatId: number; data: string; messageId: number; from: string }
  | { kind: 'media'; chatId: number; messageId: number; from: string; mediaType: string }
  | { kind: 'unknown'; chatId: number; raw: unknown };

export interface LLMResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  isEscrita: boolean;
  confirmLevel: 0 | 1 | 2;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
}
