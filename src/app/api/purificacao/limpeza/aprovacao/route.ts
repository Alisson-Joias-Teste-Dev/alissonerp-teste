import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { processarAprovacaoQuebraLimpeza } from "@/lib/limpeza-ouro-aprovacao";

/**
 * REGRA DE NEGÓCIO: aprovação/reprovação de limpeza de metal (sangria).
 *
 * O QUE: aprovador configurado em Configurações > Aprovadores aprova ou
 *   reprova a limpeza. Aprovado → concluido (entra no estoque).
 *   Reprovado → em_limpeza (volta para ajuste).
 * POR QUE: garante dupla verificação de qualidade antes do metal entrar
 *   no estoque do destino (Fábrica/Service).
 * IMPACTO SE REMOVIDO: limpeza sem aprovação significa metal sem
 *   conferência entrando no estoque.
 */


// POST /api/purificacao/limpeza/aprovacao
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { baixa_id, acao, motivo } = body as { baixa_id: number; acao: "aprovar" | "reprovar"; motivo?: string };

  if (!baixa_id || !["aprovar", "reprovar"].includes(acao)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  if (acao === "reprovar" && !motivo?.trim()) {
    return NextResponse.json({ error: "Motivo obrigatório ao reprovar" }, { status: 400 });
  }

  const resultado = await processarAprovacaoQuebraLimpeza({
    baixaId: Number(baixa_id),
    decisao: acao,
    userId: user.id,
    motivo,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error ?? "Erro ao processar aprovação" }, { status: resultado.status });
  }

  return NextResponse.json(resultado.baixa ?? { id: baixa_id, status: acao === "aprovar" ? "concluido" : "em_limpeza" });
}
