import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas ───────────────────────────────────────────────────────────
// Query params: inicio, fim, situacao, vendedor_id, q (busca)
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inicio     = searchParams.get("inicio");
  const fim        = searchParams.get("fim");
  const situacao   = searchParams.get("situacao");   // rascunho|aprovado|enviado|cancelado|concluido
  const vendedorId = searchParams.get("vendedor_id");
  const q          = searchParams.get("q")?.trim();

  if (!inicio || !fim) {
    return NextResponse.json({ error: "inicio e fim obrigatórios" }, { status: 400 });
  }

  const vendas = await sql`
    SELECT
      v.id,
      v.numero_venda,
      v.cliente_id,
      v.cliente_nome,
      v.cliente_cpf_cnpj,
      v.vendedor_id,
      v.vendedor_nome,
      v.data_venda,
      v.data_entrega,
      v.total_produtos,
      v.total_desconto,
      v.total_frete,
      v.total_venda,
      v.total_comissao,
      v.situacao,
      v.bloqueado,
      v.tiny_sync_status,
      v.created_at,
      v.updated_at,
      v.qtd_itens,
      v.total_pago
    FROM alissonerp.vw_vendas_erp_completa v
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <  (${fim}::date + INTERVAL '1 day')
      ${situacao   ? sql`AND v.situacao    = ${situacao}`              : sql``}
      ${vendedorId ? sql`AND v.vendedor_id = ${Number(vendedorId)}`    : sql``}
      ${q          ? sql`AND (
          v.numero_venda     ILIKE ${'%' + q + '%'} OR
          v.cliente_nome     ILIKE ${'%' + q + '%'} OR
          v.cliente_cpf_cnpj ILIKE ${'%' + q + '%'} OR
          v.vendedor_nome    ILIKE ${'%' + q + '%'}
        )` : sql``}
    ORDER BY v.id DESC
    LIMIT 500
  `;

  return NextResponse.json(
    vendas.map((v) => ({
      ...v,
      total_produtos: Number(v.total_produtos),
      total_desconto: Number(v.total_desconto),
      total_frete:    Number(v.total_frete),
      total_venda:    Number(v.total_venda),
      total_comissao: Number(v.total_comissao),
      total_pago:     Number(v.total_pago),
      qtd_itens:      Number(v.qtd_itens),
    }))
  );
}

// ─── POST /api/vendas ──────────────────────────────────────────────────────────
// Cria nova venda ERP (transação atômica)
// Body: {
//   cliente_id?, vendedor_id?, data_entrega?, total_frete?,
//   forma_envio?, forma_frete?, observacoes?, observacoes_internas?,
//   itens?: [{ produto_id, nome_produto, sku?, quantidade, preco_lista,
//              pct_desconto, preco_unitario, total_item, pct_comissao,
//              valor_comissao, peso_estimado?, observacao? }],
//   pagamentos?: [{ forma, gateway?, valor, parcelas?, status? }]
// }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  if (!ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    cliente_id?:          number | null;
    vendedor_id?:         number | null;
    data_entrega?:        string | null;
    total_frete?:         number;
    forma_envio?:         string | null;
    forma_frete?:         string | null;
    observacoes?:         string | null;
    observacoes_internas?: string | null;
    video_obs_interna?:   string | null;
    itens?:               ItemInput[];
    pagamentos?:          PagamentoInput[];
  };

  let novaVenda;
  try {
  novaVenda = await sql.begin(async (tx: any) => {
    // 1. Inserir com numero temporário (usa id depois)
    const [venda] = await tx`
      INSERT INTO alissonerp.vendas_erp (
        numero_venda,
        cliente_id, vendedor_id,
        data_entrega,
        total_frete,
        forma_envio, forma_frete,
        observacoes, observacoes_internas,
        video_obs_interna,
        situacao,
        created_by
      ) VALUES (
        'V-TEMP',
        ${body.cliente_id ?? null},
        ${body.vendedor_id ?? null},
        ${body.data_entrega ?? null},
        ${body.total_frete ?? 0},
        ${body.forma_envio ?? null},
        ${body.forma_frete ?? null},
        ${body.observacoes ?? null},
        ${body.observacoes_internas ?? null},
        ${body.video_obs_interna ?? null},
        'rascunho',
        ${user.id}::uuid
      )
      RETURNING id
    `;

    // 2. Atualizar numero_venda com o id gerado: V-00001
    // NOTA: LPAD(5) suporta até 99999 vendas. Após isso, o formato V-XXXXX será V-XXXXXX (sem truncar).
    await tx`
      UPDATE alissonerp.vendas_erp
      SET numero_venda = 'V-' || LPAD(${venda.id}::text, 5, '0')
      WHERE id = ${venda.id}
    `;

    // 3. Inserir itens (trigger recalcula totais automaticamente)
    if (Array.isArray(body.itens) && body.itens.length > 0) {
      for (const item of body.itens) {
        if (!item.produto_id || item.produto_id <= 0) {
          throw new Error("produto_id inválido em item");
        }
        if (!item.nome_produto || typeof item.nome_produto !== "string" || item.nome_produto.trim() === "") {
          throw new Error("nome_produto obrigatório em item");
        }
        if (item.quantidade == null || item.quantidade < 1) {
          throw new Error("quantidade deve ser >= 1 em item");
        }
        if (typeof item.preco_lista !== "number" || item.preco_lista < 0) {
          throw new Error("preco_lista deve ser >= 0 em item");
        }
        if (typeof item.preco_unitario !== "number" || item.preco_unitario < 0) {
          throw new Error("preco_unitario deve ser >= 0 em item");
        }
        if (typeof item.total_item !== "number" || item.total_item < 0) {
          throw new Error("total_item deve ser >= 0 em item");
        }
        await tx`
          INSERT INTO alissonerp.itens_venda_erp (
            venda_id, produto_id, nome_produto, sku,
            quantidade, preco_lista,
            pct_desconto, preco_unitario, total_item,
            pct_comissao, valor_comissao,
            peso_estimado, observacao
          ) VALUES (
            ${venda.id},
            ${item.produto_id},
            ${item.nome_produto},
            ${item.sku ?? null},
            ${item.quantidade},
            ${item.preco_lista},
            ${item.pct_desconto ?? 0},
            ${item.preco_unitario},
            ${item.total_item},
            ${item.pct_comissao ?? 0},
            ${item.valor_comissao ?? 0},
            ${item.peso_estimado ?? null},
            ${item.observacao ?? null}
          )
        `;
      }
    }

    // 4. Inserir pagamentos
    if (Array.isArray(body.pagamentos) && body.pagamentos.length > 0) {
      for (const pag of body.pagamentos) {
        if (!pag.forma || typeof pag.forma !== "string" || pag.forma.trim() === "") {
          throw new Error("forma obrigatória em pagamento");
        }
        if (typeof pag.valor !== "number" || pag.valor <= 0) {
          throw new Error("valor deve ser > 0 em pagamento");
        }
        await tx`
          INSERT INTO alissonerp.pagamentos_venda (
            venda_id, forma, gateway, valor, parcelas, status
          ) VALUES (
            ${venda.id},
            ${pag.forma},
            ${pag.gateway ?? null},
            ${pag.valor},
            ${pag.parcelas ?? 1},
            ${pag.status ?? 'pendente'}
          )
        `;
      }
    }

    // 5. Buscar venda completa para retornar
    const [completa] = await tx`
      SELECT id, numero_venda, situacao,
             total_produtos, total_desconto, total_frete, total_venda, total_comissao
      FROM alissonerp.vendas_erp
      WHERE id = ${venda.id}
    `;

    return completa;
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar venda";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json(
    {
      id:             novaVenda.id,
      numero_venda:   novaVenda.numero_venda,
      situacao:       novaVenda.situacao,
      total_produtos: Number(novaVenda.total_produtos),
      total_desconto: Number(novaVenda.total_desconto),
      total_frete:    Number(novaVenda.total_frete),
      total_venda:    Number(novaVenda.total_venda),
      total_comissao: Number(novaVenda.total_comissao),
    },
    { status: 201 }
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ItemInput {
  produto_id:    number;
  nome_produto:  string;
  sku?:          string | null;
  quantidade:    number;
  preco_lista:   number;
  pct_desconto:  number;
  preco_unitario: number;
  total_item:    number;
  pct_comissao:  number;
  valor_comissao: number;
  peso_estimado?: number | null;
  observacao?:   string | null;
}

interface PagamentoInput {
  forma:     string;
  gateway?:  string | null;
  valor:     number;
  parcelas?: number;
  status?:   string;
}
