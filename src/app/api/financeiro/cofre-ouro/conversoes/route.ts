import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/financeiro/cofre-ouro/conversoes
// Lista conversões de estoque que entraram no Caixa de Ouro (cofre_registrado=true, status=concluido)
// Usado pela aba Ouro do Financeiro para exibir conversões como pendentes de baixa
export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  // REGRA DE NEGÓCIO: conversões com cofre_registrado=true já entraram no Caixa de Ouro
  // e devem aparecer como disponíveis para baixa na tela de Financeiro > Ouro
  const rows = await sql`
    SELECT
      ce.id,
      ce.ordem_id,
      o.numero_ordem,
      ce.peso_total,
      ce.created_at,
      ce.aprovado_em,
      u_criador.nome AS criado_por_nome,
      u_aprov.nome AS aprovado_por_nome
    FROM alissonerp.conversoes_estoque ce
    JOIN alissonerp.ordens o ON o.id = ce.ordem_id
    LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = ce.created_by
    LEFT JOIN alissonerp.usuarios u_aprov ON u_aprov.id = ce.aprovado_por
    WHERE ce.status_conversao = 'concluido'
      AND ce.cofre_registrado = true
    ORDER BY ce.aprovado_em DESC NULLS LAST, ce.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
