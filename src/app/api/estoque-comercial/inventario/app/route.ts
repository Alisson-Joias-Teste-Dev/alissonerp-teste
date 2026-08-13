import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import sql from "@/lib/db";
import { condPecaPronta } from "@/lib/inventario-peca-pronta";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { ROLES_INVENTARIO_CONTAR, hasRole } from "@/lib/roles";

export async function GET(_req: NextRequest) {
  try {
  const supabase = await createServerSupabase();

  const authHeader = (await headers()).get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // BLINDAGEM: app RFID usa Bearer token — valida role e usuário ativo
  // (antes qualquer usuário logado listava o estoque inteiro em contagem)
  const [usuario] = await sql`
    SELECT role, ativo FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !hasRole(usuario.role, ROLES_INVENTARIO_CONTAR)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (usuario.ativo === false) {
    return NextResponse.json({ error: "Usuário desativado" }, { status: 401 });
  }

  const inventarios = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.categoria, i.data_abertura, i.obs, i.created_at,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial ii WHERE ii.inventario_id = i.id AND ${condPecaPronta(sql)}) AS total_itens,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial ii WHERE ii.inventario_id = i.id AND ii.quantidade_contada IS NOT NULL AND ${condPecaPronta(sql)}) AS itens_contados
    FROM alissonerp.inventarios_comercial i
    JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    WHERE i.status IN ('aberto', 'em_contagem')
    ORDER BY
      CASE i.status WHEN 'em_contagem' THEN 0 ELSE 1 END,
      i.created_at DESC
  `;

  if (inventarios.length === 0) {
    return NextResponse.json({ inventarios: [] });
  }

  const ids = inventarios.map((inv: any) => inv.id);
  // REGRA DE NEGÓCIO (11/07 — Jonathan): o id_api_produto que o app usa pra CASAR
  // a etiqueta lida com o item vem daqui. Ele é gravado na alissonerp.erp_produtos
  // (tabela-mestre, exposta pela view produtos_compat), mas o espelho pro
  // public.produtos só propaga no INSERT — quando o id chega depois por UPDATE
  // (sync Tiny pós-cadastro) ele nunca alcança o public. Lendo só do public, o
  // item vinha com id_api_produto = NULL e o app NÃO conseguia casar a leitura →
  // a peça nunca contava no inventário (ex.: SKU 1840-18).
  // Base no public (que tem TODOS os produtos, inclusive legados só-do-public);
  // id_api preferindo a erp e caindo no public. Onde as duas têm, o número é
  // idêntico (conferido: 15.546 casos, 0 divergência).
  // IMPACTO SE REVERTIDO: peças com id só na erp voltam a não contar no app.
  const itens = await sql`
    SELECT
      ii.id, ii.inventario_id, ii.produto_id,
      COALESCE(pc.id_api_produto, p.id_api_produto) AS id_api_produto,
      p.sku, p.nome, ii.quantidade_sistema,
      ii.quantidade_contada, ii.conferido
    FROM alissonerp.itens_inventario_comercial ii
    JOIN public.produtos p ON p.id_produto = ii.produto_id
    LEFT JOIN alissonerp.produtos_compat pc ON pc.id_produto = ii.produto_id
    WHERE ii.inventario_id = ANY(${ids}::int[])
      -- PEÇA PRONTA: app RFID também não vê pedra/personalizada
      AND ${condPecaPronta(sql)}
    ORDER BY ii.id
  `;

  const itensPorInventario = new Map<number, any[]>();
  for (const item of itens) {
    const list = itensPorInventario.get(item.inventario_id) ?? [];
    list.push({
      id: item.id,
      produto_id: Number(item.produto_id),
      id_api_produto: item.id_api_produto != null ? Number(item.id_api_produto) : null,
      sku: item.sku ?? "",
      nome: item.nome ?? "",
      quantidade_sistema: Number(item.quantidade_sistema),
      quantidade_contada: item.quantidade_contada != null ? Number(item.quantidade_contada) : null,
      conferido: item.conferido ?? false,
    });
    itensPorInventario.set(item.inventario_id, list);
  }

  const resultado = inventarios.map((inv: any) => ({
    id: inv.id,
    local_estoque_id: inv.local_estoque_id,
    local_nome: inv.local_nome,
    categoria: inv.categoria,
    status: inv.status,
    obs: inv.obs,
    data_abertura: inv.data_abertura,
    total_itens: Number(inv.total_itens),
    itens_contados: Number(inv.itens_contados),
    itens: itensPorInventario.get(inv.id) ?? [],
  }));

  return NextResponse.json({ inventarios: resultado });
  } catch (err) {
    return internalError("[GET /api/estoque-comercial/inventario/app]", err);
  }
}
