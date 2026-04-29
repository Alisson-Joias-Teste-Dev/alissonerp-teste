import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarDescontos } from "@/lib/validar-desconto";
import {
  validarPersonalizacao,
  normalizarPersonalizacao,
  appendPersonalizacaoObservacao,
  calcularPrecoPorLetra,
  calcularPesoPorLetra,
  type ConfigPersonalizacao,
  type CaracteresPermitidos,
  type PersonalizacaoAplicada,
} from "@/lib/personalizacao-validacao";

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

  // Se o termo de busca parece um documento (dígitos/pontos/traços/barras/espaços,
  // ≥3 dígitos), comparamos contra o cpf_cnpj normalizado (sem máscara) no SQL —
  // o banco guarda sem máscara e a UI permite digitar com pontuação.
  const qDigits = q ? q.replace(/\D+/g, "") : "";
  // Mínimo 8 dígitos para busca por documento (CPF tem 11, CNPJ tem 14)
  // Evita confundir número de pedido (5 dígitos) com CPF/CNPJ
  const isDocSearch = !!q && qDigits.length >= 8 && /^[\d.\-\/\s]+$/.test(q);

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
      v.total_pago,
      ve.empresa_emitente_id,
      ve.nota_fiscal_id
    FROM alissonerp.vw_vendas_erp_completa v
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = v.id
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <  (${fim}::date + INTERVAL '1 day')
      ${situacao   ? sql`AND v.situacao    = ${situacao}`              : sql``}
      ${vendedorId ? sql`AND v.vendedor_id = ${Number(vendedorId)}`    : sql``}
      ${isDocSearch
          ? sql`AND regexp_replace(COALESCE(v.cliente_cpf_cnpj, ''), '\D', '', 'g') ILIKE ${'%' + qDigits + '%'}`
          : q
            ? sql`AND (
                v.numero_venda     ILIKE ${'%' + q + '%'} OR
                v.cliente_nome     ILIKE ${'%' + q + '%'} OR
                v.vendedor_nome    ILIKE ${'%' + q + '%'}
              )`
            : sql``}
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
    endereco_entrega?:             string | null;
    endereco_entrega_numero?:      string | null;
    endereco_entrega_complemento?: string | null;
    endereco_entrega_bairro?:      string | null;
    endereco_entrega_cidade?:      string | null;
    endereco_entrega_cep?:         string | null;
    endereco_entrega_uf?:          string | null;
    tipo_venda?:          string | null;
    numero_rastreio?:     string | null;
    venda_garantia_id?:   number | null;
    situacao?:            string | null;
    itens?:               ItemInput[];
    pagamentos?:          PagamentoInput[];
  };

  // ── Validação de desconto por produto (bloqueia vendedor comum) ───────────
  // Rascunhos com desconto alto vão pelo fluxo de aprovação — skip validação
  if (body.situacao !== "rascunho" && Array.isArray(body.itens) && body.itens.length > 0) {
    const itensValidacao = body.itens
      .filter((it) => it.produto_id && (it.pct_desconto ?? 0) > 0)
      .map((it) => ({
        produto_id: Number(it.produto_id),
        pct_desconto: Number(it.pct_desconto ?? 0),
        sku: it.sku ?? undefined,
        nome: it.nome_produto,
      }));
    const val = await validarDescontos(itensValidacao, usuario.role);
    if (!val.ok) {
      return NextResponse.json(
        { error: "Desconto acima do permitido", detalhes: val.erros, violacoes: val.violacoes },
        { status: 403 },
      );
    }
  }

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
        endereco_entrega, endereco_entrega_numero, endereco_entrega_complemento,
        endereco_entrega_bairro, endereco_entrega_cidade, endereco_entrega_cep, endereco_entrega_uf,
        tipo_venda, numero_rastreio, venda_garantia_id,
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
        ${body.endereco_entrega ?? null},
        ${body.endereco_entrega_numero ?? null},
        ${body.endereco_entrega_complemento ?? null},
        ${body.endereco_entrega_bairro ?? null},
        ${body.endereco_entrega_cidade ?? null},
        ${body.endereco_entrega_cep ?? null},
        ${body.endereco_entrega_uf ?? null},
        ${body.tipo_venda ?? null},
        ${body.numero_rastreio ?? null},
        ${body.venda_garantia_id ?? null},
        'rascunho',
        ${user.id}::uuid
      )
      RETURNING id
    `;

    // 2. Gerar numero_venda seguindo a sequência do public.vendas (ex: 14791)
    const [{ proximo }] = await tx`
      SELECT COALESCE(
        GREATEST(
          (SELECT MAX(numero_pedido) + 1 FROM public.vendas),
          (SELECT MAX(numero_venda::bigint) + 1 FROM alissonerp.vendas_erp WHERE numero_venda ~ '^[0-9]+$')
        ),
        1
      ) AS proximo
    `;
    await tx`
      UPDATE alissonerp.vendas_erp
      SET numero_venda = ${String(proximo)}
      WHERE id = ${venda.id}
    `;

    // 3. Inserir itens (trigger recalcula totais automaticamente)
    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      throw new Error("Venda deve ter pelo menos um item");
    }
    for (const item of body.itens) {
        if (item.produto_id !== null && item.produto_id !== undefined && Number(item.produto_id) <= 0) {
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

        // ── Personalizacao: valida contra config do produto (se existir) ──
        // Alem disso, se config tem preco_por_letra > 0, RECALCULA preco_unitario
        // e total_item server-side (seguranca — body pode vir adulterado).
        let personalizacaoJson: PersonalizacaoAplicada | null = null;
        let observacaoItem = item.observacao ?? null;
        let precoListaFinal    = item.preco_lista;
        let precoUnitarioFinal = item.preco_unitario;
        let totalItemFinal     = item.total_item;
        let valorComissaoFinal = item.valor_comissao ?? 0;
        let pesoEstimadoFinal: number | null = item.peso_estimado ?? null;

        if (item.produto_id) {
          const [cfg] = await tx`
            SELECT
              tipo, obrigatorio,
              min_caracteres, max_caracteres, caracteres_permitidos,
              label, preco_por_letra, peso_por_letra
            FROM alissonerp.produto_personalizacao
            WHERE produto_id = ${item.produto_id}
              AND ativo = true
          `;
          if (cfg) {
            const config: ConfigPersonalizacao = {
              tipo: cfg.tipo as string,
              obrigatorio: Boolean(cfg.obrigatorio),
              min_caracteres: Number(cfg.min_caracteres),
              max_caracteres: Number(cfg.max_caracteres),
              caracteres_permitidos: cfg.caracteres_permitidos as CaracteresPermitidos,
              label: cfg.label as string,
            };
            const valor = item.personalizacao?.valor;
            const val = validarPersonalizacao(valor, config);
            if (!val.ok) {
              throw new Error(
                `Personalizacao invalida no item "${item.sku ?? item.nome_produto}": ${val.erro}`,
              );
            }
            if (valor?.trim()) {
              personalizacaoJson = normalizarPersonalizacao(valor, config);
              observacaoItem = appendPersonalizacaoObservacao(observacaoItem, personalizacaoJson);

              // Recalculo server-side se preco_por_letra esta configurado
              const precoPorLetra = cfg.preco_por_letra != null ? Number(cfg.preco_por_letra) : null;
              if (precoPorLetra != null && precoPorLetra > 0) {
                const calc = calcularPrecoPorLetra(
                  { ...config, preco_por_letra: precoPorLetra },
                  valor,
                  item.pct_desconto ?? 0,
                  item.quantidade ?? 1,
                  item.pct_comissao ?? 0,
                );
                if (calc) {
                  precoListaFinal    = calc.preco_lista;
                  precoUnitarioFinal = calc.preco_unitario;
                  totalItemFinal     = calc.total_item;
                  valorComissaoFinal = calc.valor_comissao;
                }
              }

              // Recalculo server-side de peso_estimado se peso_por_letra esta configurado
              const pesoPorLetra = cfg.peso_por_letra != null ? Number(cfg.peso_por_letra) : null;
              if (pesoPorLetra != null && pesoPorLetra > 0) {
                const pesoCalc = calcularPesoPorLetra(
                  { ...config, peso_por_letra: pesoPorLetra },
                  valor,
                );
                if (pesoCalc != null) {
                  pesoEstimadoFinal = pesoCalc;
                }
              }
            }
          }
        }

        await tx`
          INSERT INTO alissonerp.itens_venda_erp (
            venda_id, produto_id, nome_produto, sku,
            quantidade, preco_lista,
            pct_desconto, preco_unitario, total_item,
            pct_comissao, valor_comissao,
            peso_estimado, observacao, personalizacao
          ) VALUES (
            ${venda.id},
            ${item.produto_id},
            ${item.nome_produto},
            ${item.sku ?? null},
            ${item.quantidade},
            ${precoListaFinal},
            ${item.pct_desconto ?? 0},
            ${precoUnitarioFinal},
            ${totalItemFinal},
            ${item.pct_comissao ?? 0},
            ${valorComissaoFinal},
            ${pesoEstimadoFinal},
            ${observacaoItem},
            ${personalizacaoJson ? sql.json(personalizacaoJson as never) : null}
          )
        `;
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
        const isDinheiro = pag.forma === 'Dinheiro';
        await tx`
          INSERT INTO alissonerp.pagamentos_venda (
            venda_id, forma, gateway, valor, parcelas, status, data_confirmacao
          ) VALUES (
            ${venda.id},
            ${pag.forma},
            ${pag.gateway ?? null},
            ${pag.valor},
            ${pag.parcelas ?? 1},
            ${isDinheiro ? 'confirmado' : (pag.status ?? 'pendente')},
            ${isDinheiro ? sql`now()` : null}
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

    // M1: Bloqueia venda com total zero (desconto 100% em todos os itens)
    if (Number(completa.total_venda) <= 0 && body.tipo_venda !== "servico") {
      throw new Error("Total da venda não pode ser zero. Verifique os preços e descontos dos itens.");
    }

    // ─── Ordens de reposição (dentro da tx — falha reverte a venda inteira) ───
    const ordensReposicao: Array<{ numero_ordem: string; produto: string }> = [];
    if (body.tipo_venda === "produto" && Array.isArray(body.itens) && body.itens.length > 0) {
      const produtoIds = body.itens.map((i: ItemInput) => i.produto_id).filter(Boolean);
      if (produtoIds.length > 0) {
        const saldos = await tx`
          SELECT produto_id, SUM(saldo) AS saldo
          FROM alissonerp.vw_saldo_estoque_comercial
          WHERE produto_id = ANY(${produtoIds}::bigint[])
          GROUP BY produto_id
        `;
        const saldoMap = new Map<number, number>(saldos.map((s: Record<string, unknown>) => [Number(s.produto_id), Number(s.saldo)]));

        const [{ data_entrega_rep }] = await tx`
          SELECT alissonerp.fn_adicionar_dias_uteis(CURRENT_DATE, 10) AS data_entrega_rep
        `;

        const [{ proximo_ordem }] = await tx`
          SELECT COALESCE(
            MAX(CAST(SUBSTRING(numero_ordem FROM 3) AS INTEGER)) + 1, 1
          ) AS proximo_ordem
          FROM alissonerp.ordens
          WHERE numero_ordem ~ '^C-[0-9]+$'
        `;
        let ordemSeq = Number(proximo_ordem);

        for (const item of body.itens as ItemInput[]) {
          if (!item.produto_id) continue;
          const saldo = saldoMap.get(Number(item.produto_id)) ?? 0;
          if (saldo >= item.quantidade) continue;

          const [ficha] = await tx`
            SELECT id, peso_estimado_metal, modelo, modelo_interno, arquivo_3dm, arquivo_glb
            FROM alissonerp.fichas_tecnicas_produto
            WHERE produto_id = ${item.produto_id}
            LIMIT 1
          `;

          const numeroOrdem = `C-${String(ordemSeq).padStart(4, "0")}`;
          const [ordem] = await tx`
            INSERT INTO alissonerp.ordens (
              numero_ordem, numero_pedido, tipo_ordem, rota, situacao, status,
              cliente_id, vendedor_id, data_entrega,
              venda_id, origem, created_by
            ) VALUES (
              ${numeroOrdem}, ${venda.numero_venda}, 'reposicao_venda', 'pcp', 'criado', 'aguardando',
              ${body.cliente_id ?? null}, ${body.vendedor_id ?? null}, ${data_entrega_rep},
              ${venda.id}, 'erp', ${user.id}::uuid
            ) RETURNING id, numero_ordem
          `;

          await tx`
            INSERT INTO alissonerp.itens_ordem (ordem_id, produto_id, nome_produto, sku, quantidade, peso_estimado)
            VALUES (${ordem.id}, ${item.produto_id}, ${item.nome_produto}, ${item.sku ?? null}, ${item.quantidade}, ${item.peso_estimado ?? null})
          `;

          if (ficha) {
            await tx`
              INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
              VALUES (
                ${ordem.id},
                'reposicao_venda',
                ${JSON.stringify({ ficha_produto_id: ficha.id, peso_estimado_metal: ficha.peso_estimado_metal, modelo: ficha.modelo, modelo_interno: ficha.modelo_interno, arquivo_3dm: ficha.arquivo_3dm, arquivo_glb: ficha.arquivo_glb })}::jsonb,
                ${user.id}::uuid
              )
            `;
          }

          ordensReposicao.push({ numero_ordem: ordem.numero_ordem, produto: item.nome_produto });
          ordemSeq++;
        }
      }
    }

    return { ...completa, ordensReposicao };
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar venda";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ordensReposicao = novaVenda.ordensReposicao ?? [];

  return NextResponse.json(
    {
      id:               novaVenda.id,
      numero_venda:     novaVenda.numero_venda,
      situacao:         novaVenda.situacao,
      total_produtos:   Number(novaVenda.total_produtos),
      total_desconto:   Number(novaVenda.total_desconto),
      total_frete:      Number(novaVenda.total_frete),
      total_venda:      Number(novaVenda.total_venda),
      total_comissao:   Number(novaVenda.total_comissao),
      ordens_reposicao: ordensReposicao,
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
  /** Opcional — aplicado apenas se o produto tiver config em alissonerp.produto_personalizacao */
  personalizacao?: { valor?: string } | null;
}

interface PagamentoInput {
  forma:     string;
  gateway?:  string | null;
  valor:     number;
  parcelas?: number;
  status?:   string;
}
