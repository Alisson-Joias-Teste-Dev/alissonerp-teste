import type postgres from "postgres";
import sql from "@/lib/db";

interface AuditParams {
  tabela: string;
  operacao: "INSERT" | "UPDATE" | "DELETE";
  registro_id: string | number;
  usuario_id: string | null;
  dados_antes?: Record<string, unknown> | null;
  dados_depois?: Record<string, unknown> | null;
}

/**
 * Registra entrada em alissonerp.audit_log.
 * Usar dentro de sql.begin() para atomicidade — se a transação fizer rollback, o log também reverte.
 * Para uso fora de transação, não passar `tx`.
 */
export async function logAudit(
  txOrSql: typeof sql | postgres.Sql,
  params: AuditParams,
): Promise<void> {
  try {
    await (txOrSql as typeof sql)`
      INSERT INTO alissonerp.audit_log
        (tabela, operacao, registro_id, usuario_id, dados_antes, dados_depois)
      VALUES (
        ${params.tabela},
        ${params.operacao},
        ${String(params.registro_id)},
        ${params.usuario_id ?? null}::uuid,
        ${params.dados_antes ? JSON.stringify(params.dados_antes) : null}::jsonb,
        ${params.dados_depois ? JSON.stringify(params.dados_depois) : null}::jsonb
      )
    `;
  } catch (err) {
    // Audit log nunca deve derrubar a operação principal
    console.error("[audit] Falha ao registrar audit_log:", err);
  }
}
