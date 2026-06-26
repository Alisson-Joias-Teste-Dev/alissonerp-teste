import type { LLMResult } from '../../shared/tipos';
import type { ToolDefinition } from '../../shared/tipos';

export interface LLMProvider {
  chat(params: {
    messages: Array<{ role: string; content: string }>;
    tools?: ToolDefinition[];
    maxTokens?: number;
    usuarioSkillId?: number;
  }): Promise<LLMResult>;
}

export interface LLMOptions {
  provider: LLMProvider;
  model: string;
  maxTokens: number;
  maxToolLoops: number;
}
