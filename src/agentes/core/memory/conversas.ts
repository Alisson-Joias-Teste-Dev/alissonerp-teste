import sql from '../../../lib/db';
import type { ConversationMessage } from '../../shared/tipos';

export async function insertConversa(params: {
  usuarioSkillId: number;
  role: string;
  conteudo: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  tokensIn?: number;
  tokensOut?: number;
  promptVersao?: string;
  modelo?: string;
}): Promise<bigint> {
  const rows = await sql`
    INSERT INTO agentes.conversas
      (usuario_skill_id, role, conteudo, tool_name, tool_args, tool_result,
       tokens_in, tokens_out, prompt_versao, modelo)
    VALUES
      (${params.usuarioSkillId}, ${params.role}, ${params.conteudo},
       ${params.toolName ?? null}, ${params.toolArgs ? JSON.stringify(params.toolArgs) : null},
       ${params.toolResult ? JSON.stringify(params.toolResult) : null},
       ${params.tokensIn ?? null}, ${params.tokensOut ?? null},
       ${params.promptVersao ?? null}, ${params.modelo ?? null})
    RETURNING id
  `;
  return rows[0].id as bigint;
}

export async function getJanela(
  usuarioSkillId: number,
  maxMsgs: number,
): Promise<ConversationMessage[]> {
  const rows = await sql`
    SELECT role, conteudo, tool_name, tool_args, tool_result
    FROM agentes.conversas
    WHERE usuario_skill_id = ${usuarioSkillId} AND anonimizada_em IS NULL
    ORDER BY criada_em DESC
    LIMIT ${maxMsgs}
  `;

  return rows.reverse().map((r) => ({
    role: r.role as ConversationMessage['role'],
    content: r.conteudo as string,
    toolName: r.tool_name as string | undefined,
    toolArgs: r.tool_args as Record<string, unknown> | undefined,
    toolResult: r.tool_result as unknown | undefined,
  }));
}
