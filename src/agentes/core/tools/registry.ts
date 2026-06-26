import sql from '../../../lib/db';

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: ToolHandler;
  isEscrita: boolean;
  confirmLevel: 0 | 1 | 2;
}

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(tools.values());
}

export async function registerAllTools(): Promise<void> {
  const { listarOrdensPcp } = await import('./pg/listar-ordens-pcp');
  registerTool(listarOrdensPcp);

  const { detalharOrdem } = await import('./pg/detalhar-ordem');
  registerTool(detalharOrdem);

  const { consultarSaldoOuro } = await import('./pg/consultar-saldo-ouro');
  registerTool(consultarSaldoOuro);

  const { consultarSaldoInsumo } = await import('./pg/consultar-saldo-insumo');
  registerTool(consultarSaldoInsumo);

  const { buscarProduto } = await import('./pg/buscar-produto');
  registerTool(buscarProduto);

  const { buscarProcessoProduto } = await import('./pg/buscar-processo-produto');
  registerTool(buscarProcessoProduto);

  const { sugerirApontamento } = await import('./pg/sugerir-apontamento');
  registerTool(sugerirApontamento);
}

export async function logToolCall(params: {
  usuarioSkillId: number;
  conversaId?: bigint;
  toolName: string;
  args: Record<string, unknown>;
  isEscrita: boolean;
  resultado?: unknown;
  erro?: string;
  duracaoMs: number;
}): Promise<void> {
  await sql.unsafe(
    `INSERT INTO agentes.tool_calls_log
      (usuario_skill_id, conversa_id, tool_name, args, is_escrita, resultado, erro, duracao_ms)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.usuarioSkillId,
      params.conversaId ? Number(params.conversaId) : null,
      params.toolName,
      JSON.stringify(params.args),
      params.isEscrita,
      params.resultado ? JSON.stringify(params.resultado) : null,
      params.erro ?? null,
      params.duracaoMs,
    ],
  );
}
