import sql from '../../../lib/db';
import type { Conversa } from './types';

export async function getConversa(conversaId: number): Promise<Conversa | null> {
  const rows = await sql`
    SELECT id, usuario_skill_id, role, conteudo, tool_name, tool_args, tool_result
    FROM agentes.conversas
    WHERE id = ${conversaId} AND anonimizada_em IS NULL
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as Conversa) : null;
}
