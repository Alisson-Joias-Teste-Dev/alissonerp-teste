import type { LLMResult } from '../../shared/tipos';

export interface LLMProvider {
  chat(params: {
    messages: Array<{ role: string; content: string }>;
    tools?: Array<{ name: string; description: string; parameters: unknown }>;
    maxTokens?: number;
  }): Promise<LLMResult>;
}

export interface LLMOptions {
  provider: LLMProvider;
  model: string;
  maxTokens: number;
  maxToolLoops: number;
}
