import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/conversao-reversa/detalhe-baixa?baixa_id=123
 *
 * REGRA DE NEGÓCIO: toda baixa do Caixa de Ouro com destino='estoque' é gerada
 * por uma conversão reversa (peça "virando joia" — ver aprovar/route.ts passo 2).
 * O QUE: dado o id de uma baixa (cofre_ouro_baixas.id), busca a conversão
 *   reversa vinculada (conversoes_reversas.baixa_id) com os dados legíveis pro
 *   Histórico de Baixas do Financeiro: produto que virou peça, quem solicitou,
 *   quem aprovou, ordem de origem e a foto do peso tirada na abertura.
 * POR QUE: o Histórico de Baixas só mostra dados genéricos da baixa (gramas,
 *   destino, quem baixou) — sem isso não dá pra auditar QUAL peça específica
 *   saiu do cofre nem ver a prova fotográfica do peso.
 * IMPACTO SE ALTERADO/REMOVIDO: Histórico de Baixas volta a não detalhar
 *   conversões reversas, dificultando auditoria (chefe pediu rastreabilidade
 *   completa da conversão reversa — 15/07).
 *
 * Retorna { conversao_reversa: null } quando a baixa não é de conversão
 * reversa (baixas normais de sangria pra alisson/fabrica/service).
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const baixaIdRaw = req.nextUrl.searchParams.get("baixa_id");
  const baixaId = baixaIdRaw ? Number(baixaIdRaw) : null;
  if (!baixaId || Number.isNaN(baixaId)) {
    return NextResponse.json({ error: "baixa_id inválido" }, { status: 400 });
  }

  const [row] = await sql`
    SELECT cr.id, cr.quantidade, cr.peso_saida, cr.foto_abertura, cr.aprovado_em, cr.created_at,
           o.numero_ordem, p.nome AS produto_nome, p.sku AS produto_sku,
           us.nome AS solicitante_nome, ua.nome AS aprovador_nome
    FROM alissonerp.conversoes_reversas cr
    JOIN alissonerp.ordens o ON o.id = cr.ordem_id
    LEFT JOIN public.produtos p ON p.id_produto = cr.produto_id
    LEFT JOIN alissonerp.usuarios us ON us.id = cr.created_by
    LEFT JOIN alissonerp.usuarios ua ON ua.id = cr.aprovado_por
    WHERE cr.baixa_id = ${baixaId}
    LIMIT 1
  `;

  return NextResponse.json({ conversao_reversa: row ?? null });
}
