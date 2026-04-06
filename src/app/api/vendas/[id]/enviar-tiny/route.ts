import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// Mapa situacao ERP → situacao Tiny v3
// 0=Aberto, 3=Aprovado, 4=Preparando Envio, 1=Faturado, 5=Enviado, 6=Entregue, 2=Cancelado
const SITUACAO_TINY: Record<string, number> = {
  rascunho:   0,  // Aberto
  aprovado:   3,  // Aprovado
  confirmado: 3,  // Aprovado
  concluido:  6,  // Entregue
  cancelado:  2,  // Cancelado
};

// ─── POST /api/vendas/[id]/enviar-tiny ────────────────────────────────────────
// Envia venda como pedido para o Tiny ERP via API v3
// Docs: https://api-docs.erp.olist.com/api-reference/pedidos/criar-pedido
// Endpoint: POST https://api.tiny.com.br/public-api/v3/pedidos
// Auth: Bearer token (OAuth2)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Buscar venda + cliente
  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda, v.cliente_id, v.vendedor_id,
      v.data_venda, v.data_entrega, v.total_produtos, v.total_desconto,
      v.total_frete, v.total_venda, v.situacao, v.tiny_sync_status,
      v.tiny_pedido_id, v.forma_envio, v.observacoes, v.observacoes_internas,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Não é possível enviar venda cancelada" }, { status: 400 });
  }

  // Guard idempotência
  if (venda.tiny_sync_status === "sincronizado" && venda.tiny_pedido_id) {
    return NextResponse.json(
      { error: "Venda já enviada ao Tiny (pedido #" + venda.tiny_pedido_id + "). Use 'force=true' para reenviar." },
      { status: 409 }
    );
  }

  // Buscar Bearer token OAuth2 do Tiny
  const [tokenRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  // Fallback: chave antiga
  const [tokenRowLegacy] = !tokenRow ? await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_api_token'
  ` : [tokenRow];

  const rawToken = tokenRowLegacy?.valor_encrypted ?? tokenRow?.valor_encrypted;
  if (!rawToken) {
    return NextResponse.json({ error: "Token do Tiny não configurado. Vá em Configurações > Integrações." }, { status: 400 });
  }
  let tinyToken: string;
  try { tinyToken = JSON.parse(rawToken); } catch { tinyToken = String(rawToken); }
  tinyToken = tinyToken.replace(/"/g, "").trim();
  if (!tinyToken) return NextResponse.json({ error: "Token do Tiny inválido" }, { status: 400 });

  // Buscar itens
  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  // Buscar IDs dos produtos no Tiny (public.produtos tem o id original do Tiny)
  const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
  const produtosTiny = produtoIds.length > 0 ? await sql`
    SELECT id_produto, id_api_tiny FROM public.produtos WHERE id_produto = ANY(${produtoIds})
  ` : [];
  const tinyIdMap = new Map(produtosTiny.map(p => [Number(p.id_produto), Number(p.id_api_tiny)]));

  // Montar payload API v3
  const dataVenda = venda.data_venda
    ? new Date(venda.data_venda).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const pedidoV3: Record<string, unknown> = {
    // Contato (obrigatório)
    idContato: Number(venda.cliente_id) || undefined,

    // Situacao
    situacao: SITUACAO_TINY[venda.situacao] ?? 0,

    // Datas
    data: dataVenda,
    ...(venda.data_entrega ? { dataEntrega: new Date(venda.data_entrega).toISOString().slice(0, 10) } : {}),

    // Valores
    ...(Number(venda.total_desconto) > 0 ? { valorDesconto: Number(venda.total_desconto) } : {}),
    ...(Number(venda.total_frete) > 0 ? { valorFrete: Number(venda.total_frete) } : {}),

    // Observações
    ...(venda.observacoes ? { observacoes: venda.observacoes } : {}),
    ...(venda.observacoes_internas ? { observacoesInternas: venda.observacoes_internas } : {}),

    // Vendedor
    ...(venda.vendedor_id ? { vendedor: { id: Number(venda.vendedor_id) } } : {}),

    // Itens
    itens: itens.map((item) => {
      const tinyProdId = tinyIdMap.get(Number(item.produto_id));
      return {
        produto: {
          ...(tinyProdId ? { id: tinyProdId } : {}),
          tipo: "P", // Produto
        },
        quantidade: Number(item.quantidade),
        valorUnitario: Number(item.preco_unitario),
        ...(item.observacao ? { infoAdicional: item.observacao } : {}),
      };
    }),
  };

  try {
    const res = await fetch("https://api.tiny.com.br/public-api/v3/pedidos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tinyToken}`,
      },
      body: JSON.stringify(pedidoV3),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let erroMsg = `Tiny API ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        erroMsg = errJson.message || errJson.error || erroMsg;
      } catch { erroMsg += `: ${errBody.slice(0, 200)}`; }

      await sql`
        UPDATE alissonerp.vendas_erp SET
          tiny_sync_status = 'erro',
          tiny_sync_at     = NOW(),
          tiny_sync_erro   = ${erroMsg}
        WHERE id = ${vendaId}
      `;
      return NextResponse.json({ error: erroMsg }, { status: 502 });
    }

    const data = await res.json() as { id?: number; numeroPedido?: string };

    await sql`
      UPDATE alissonerp.vendas_erp SET
        tiny_pedido_id    = ${String(data.id ?? "")},
        tiny_sync_status  = 'sincronizado',
        tiny_sync_at      = NOW(),
        tiny_sync_erro    = NULL
      WHERE id = ${vendaId}
    `;

    return NextResponse.json({
      ok: true,
      tiny_pedido_id: data.id,
      tiny_numero_pedido: data.numeroPedido,
      message: "Pedido enviado ao Tiny com sucesso (API v3)",
    });

  } catch (e) {
    const erroMsg = e instanceof Error ? e.message : "Falha na comunicação com o Tiny";
    await sql`
      UPDATE alissonerp.vendas_erp SET
        tiny_sync_status = 'erro',
        tiny_sync_at     = NOW(),
        tiny_sync_erro   = ${erroMsg}
      WHERE id = ${vendaId}
    `;
    return NextResponse.json({ error: erroMsg }, { status: 500 });
  }
}
