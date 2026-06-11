import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { hasRole, ROLES_FULL_ACCESS } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";

const EntregaPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
}).passthrough();

// REGRA DE NEGÓCIO (Blindagem 2026-06): concluir preparação de entrega fecha a
// ORDEM associada — é operação de fábrica/loja, não de qualquer usuário.
// Roles permitidas: full access + gerentes + pcp.
// POR QUE: antes qualquer autenticado (motoboy, ourives, consultora) concluía
// preparações e ordens alheias (falha C1 da análise).
// IMPACTO SE REMOVIDO: ordens podem ser fechadas indevidamente, sem rastro.
const ROLES_PREPARACAO_ENTREGA = [
  ...ROLES_FULL_ACCESS,
  "gerente_fabrica",
  "gerente_loja",
  "pcp",
] as const;

// PATCH /api/entrega/[entregaId] — concluir entrega
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entregaId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!hasRole(user.role, ROLES_PREPARACAO_ENTREGA)) {
    return NextResponse.json({ error: "Sem permissão para alterar preparações de entrega" }, { status: 403 });
  }

  const { entregaId } = await params;
  const id = parseInt(entregaId);
  const raw = await req.json().catch(() => ({}));
  const parsed = EntregaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { etapas } = parsed.data;

  // Captura o estado anterior para a trilha de auditoria (quem/o quê/quando)
  const [antes] = await sql`
    SELECT id, etapas, ordem_id FROM alissonerp.preparacoes_entrega WHERE id = ${id}
  `;
  if (!antes) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  const rows = await sql`
    UPDATE alissonerp.preparacoes_entrega
    SET etapas = ${etapas}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, etapas, ordem_id
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  // Ao concluir a entrega, a ordem chega ao fim do fluxo → status=concluido
  if (etapas === "concluido" && rows[0].ordem_id) {
    await sql`
      UPDATE alissonerp.ordens SET
        status         = 'concluido',
        data_conclusao = now(),
        updated_at     = now()
      WHERE id = ${rows[0].ordem_id}
    `;
  }

  // Rastreabilidade §0.1: registra quem mudou a etapa da preparação e o estado
  // anterior/novo. Nunca derruba a operação principal (ver src/lib/audit.ts).
  await logAudit(sql, {
    tabela: "preparacoes_entrega",
    operacao: "UPDATE",
    registro_id: id,
    usuario_id: user.id,
    dados_antes: { etapas: antes.etapas, ordem_id: antes.ordem_id },
    dados_depois: { etapas, ordem_concluida: etapas === "concluido" && !!rows[0].ordem_id },
  });

  return NextResponse.json(rows[0]);
}
