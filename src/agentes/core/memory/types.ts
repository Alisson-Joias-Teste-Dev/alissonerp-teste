export interface Conversa {
  id: number;
  usuario_skill_id: number;
  role: string;
  conteudo: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: unknown;
}
