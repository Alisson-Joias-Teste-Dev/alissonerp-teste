import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { importarLocalizacaoDeUmaPeca } from "@/lib/importar-localizacao";

// ─── POST /api/estoque-comercial/importar-localizacao/testar ──────────────────
// TESTE com 1 peca antes da migracao completa. Body: { sku }.
// Busca a peca pelo SKU, pega a localizacao na fonte (endpoint de estoque) e grava
// SO essa peca — para o admin conferir o resultado no detalhe antes de rodar tudo.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin/dev" }, { status: 403 });
  }

  let body: { sku?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const sku = (body.sku ?? "").trim();
  if (!sku) return NextResponse.json({ error: "Informe o SKU da peça" }, { status: 400 });

  // Resolve a peca pelo SKU (fonte de verdade do vinculo externo = id_api_produto).
  const [prod] = await sql`
    SELECT p.id_produto, p.sku, p.nome, p.id_api_produto
    FROM public.produtos p
    WHERE upper(p.sku) = upper(${sku})
    LIMIT 1
  `;
  if (!prod) return NextResponse.json({ error: `SKU "${sku}" não encontrado` }, { status: 404 });
  if (!prod.id_api_produto) {
    return NextResponse.json({ error: `A peça ${sku} não tem vínculo com a fonte externa (sem id externo)` }, { status: 400 });
  }

  const resultado = await importarLocalizacaoDeUmaPeca(Number(prod.id_api_produto));
  if (resultado.erro) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  // Le o valor que ficou gravado, para o front mostrar "antes/depois" com confianca.
  const [atual] = await sql`
    SELECT localizacao FROM alissonerp.erp_produtos WHERE id_api_produto = ${prod.id_api_produto}::bigint
  `;

  return NextResponse.json({
    produto_id: Number(prod.id_produto),
    sku: prod.sku,
    nome: prod.nome,
    localizacaoFonte: resultado.localizacaoFonte,
    localizacaoGravada: atual?.localizacao ?? null,
    gravou: resultado.gravou,
  });
}
