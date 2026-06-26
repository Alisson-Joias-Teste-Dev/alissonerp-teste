/**
 * POST /api/entregas-venda/[id]/desbloquear-codigo
 *
 * REGRA DE NEGÓCIO (Blindagem 2026-06 — migration 295):
 * O QUE: desbloqueia uma entrega que foi travada após 5 tentativas erradas
 *   de código de confirmação (zera tentativas_codigo e codigo_bloqueado_em).
 * POR QUE: o bloqueio protege contra adivinhação do código; o desbloqueio é
 *   uma decisão de GERÊNCIA (confere com o cliente o que houve) — por isso
 *   só roles de vendas full (admin/dev/diretor/gerentes) podem usar.
 * IMPACTO SE ALTERADO: liberar o desbloqueio para qualquer um anula o limite
 *   de tentativas (o operador erra 5x, desbloqueia ele mesmo e segue tentando).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isVendasFullAccess } from "@/lib/auth-vendas";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!isVendasFullAccess(user.role)) {
    return NextResponse.json({ error: "Apenas gerentes/admin podem desbloquear códigos" }, { status: 403 });
  }

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [antes] = await sql`
    SELECT id, codigo_entrega, tentativas_codigo, codigo_bloqueado_em
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId}
  `;
  if (!antes) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  await sql`
    UPDATE alissonerp.entregas_venda
    SET tentativas_codigo = 0, codigo_bloqueado_em = NULL, updated_at = now()
    WHERE id = ${entregaId}
  `;

  // Rastreabilidade §0.1: o desbloqueio é sensível — registra quem liberou.
  await logAudit(sql, {
    tabela: "entregas_venda",
    operacao: "UPDATE",
    registro_id: entregaId,
    usuario_id: user.id,
    dados_antes: {
      tentativas_codigo: Number(antes.tentativas_codigo ?? 0),
      codigo_bloqueado_em: antes.codigo_bloqueado_em,
    },
    dados_depois: { evento: "desbloqueio_codigo", tentativas_codigo: 0, codigo_bloqueado_em: null },
  });

  return NextResponse.json({ ok: true, mensagem: `Entrega ${antes.codigo_entrega} desbloqueada para confirmação.` });
}
