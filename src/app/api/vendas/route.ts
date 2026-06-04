import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarDescontos } from "@/lib/validar-desconto";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";
import {
  LIMITS,
  checkArrayLength,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { getUserVendedorId } from "@/lib/auth-vendas";
import { AuthError } from "@/lib/auth-server";

// Schemas para POST /api/vendas — itens e pagamentos sao validados em loop
// dentro da transacao (regras de negocio: produto_id > 0, preco_lista >= 0,
// nome_produto trim != "", etc). Aqui validamos so a forma geral do body.
// Preprocess: converte strings para numeros sem alterar null/undefined
const toNum = (v: unknown) => (v === null || v === undefined ? v : Number(v));

const VendaItemSchema = z.object({
  produto_id: z.preprocess(toNum, z.number().int().nullable().optional()),
  nome_produto: z.string().min(1).max(LIMITS.NOME_MAX),
  sku: z.string().max(100).nullable().optional(),
  quantidade: z.preprocess(toNum, z.number().int().min(1)),
  preco_lista: z.preprocess(toNum, z.number().nonnegative()),
  pct_desconto: z.preprocess(toNum, z.number().min(0).max(100)),
  preco_unitario: z.preprocess(toNum, z.number().nonnegative()),
  total_item: z.preprocess(toNum, z.number().nonnegative()),
  pct_comissao: z.preprocess(toNum, z.number().min(0).max(100)),
  valor_comissao: z.preprocess(toNum, z.number().nonnegative()),
  peso_estimado: z.preprocess(toNum, z.number().nullable().optional()),
  observacao: z.string().max(LIMITS.OBSERVACOES_MAX).nullable().optional(),
  personalizacao: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();

const VendaPagamentoSchema = z.object({
  forma: z.string().min(1).max(100),
  gateway: z.string().max(100).nullable().optional(),
  valor: z.preprocess(toNum, z.number().nonnegative()),
  parcelas: z.preprocess(toNum, z.number().int().min(1).max(99).optional()),
  status: z.string().max(50).optional(),
}).passthrough();

const VendaPostSchema = z.object({
  cliente_id: IdSchema.nullable().optional(),
  vendedor_id: IdSchema.nullable().optional(),
  data_entrega: z.string().max(50).nullable().optional(),
  total_frete: z.preprocess(toNum, z.number().nonnegative().optional()),
  forma_envio: z.string().max(100).nullable().optional(),
  forma_frete: z.string().max(100).nullable().optional(),
  observacoes: z.string().max(LIMITS.OBSERVACOES_MAX).nullable().optional(),
  observacoes_internas: z.string().max(LIMITS.OBSERVACOES_MAX).nullable().optional(),
  video_obs_interna: z.string().max(1000).nullable().optional(),
  endereco_entrega: z.string().max(500).nullable().optional(),
  endereco_entrega_numero: z.string().max(50).nullable().optional(),
  endereco_entrega_complemento: z.string().max(200).nullable().optional(),
  endereco_entrega_bairro: z.string().max(200).nullable().optional(),
  endereco_entrega_cidade: z.string().max(200).nullable().optional(),
  endereco_entrega_cep: z.string().max(20).nullable().optional(),
  endereco_entrega_uf: z.string().max(5).nullable().optional(),
  tipo_venda: z.string().max(50).nullable().optional(),
  numero_rastreio: z.string().max(100).nullable().optional(),
  venda_garantia_id: IdSchema.nullable().optional(),
  situacao: z.string().max(50).nullable().optional(),
  itens: z.array(VendaItemSchema).max(LIMITS.ITENS_VENDA_MAX).optional(),
  pagamentos: z.array(VendaPagamentoSchema).max(LIMITS.ITENS_VENDA_MAX).optional(),
}).passthrough();
import {
  validarPersonalizacao,
  normalizarPersonalizacao,
  normalizarPersonalizacaoMulti,
  appendPersonalizacaoObservacao,
  calcularPrecoPorLetra,
  calcularPesoPorLetra,
  isMultiCampo,
  type ConfigPersonalizacao,
  type CaracteresPermitidos,
  type PersonalizacaoAplicada,
  type PersonalizacaoAplicadaMulti,
  type PersonalizacaoQualquer,
  type CampoPersonalizacao,
} from "@/lib/personalizacao-validacao";

// REGRA DE NEGOCIO: helpers de rodio centralizados em src/lib/servico-rodio.ts
// Frente B do Plano de Acao (30/05/2026) — nao duplicar estas funcoes nos endpoints.
import { normalizarTextoBusca, isServicoRodio, round2, getPctRodio } from "@/lib/servico-rodio";

// ─── GET /api/vendas ───────────────────────────────────────────────────────────
// Query params: inicio, fim, situacao, vendedor_id, q (busca)
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Onda 1K: fecha IDOR no GET lista — consultora autenticada listava TODAS as
  // vendas (CPFs, valores, comissoes alheias). Filtramos por vendedor_id
  // mapeado em alissonerp.usuarios para roles nao-full.
  const [usuarioRow] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuarioRow) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  const userCtx = { id: user.id, role: usuarioRow.role, email: user.email ?? "" };

  // Onda 1K: calcula vendedor_id do user pra filtrar a query (so se nao-full).
  // Inline (em vez do helper ownershipWhereVendas) porque postgres@3 perde a
  // inferencia de fragmento quando o `sql` vem de outro modulo async — o
  // padrao `${cond ? sql`AND ...` : sql``}` so funciona com fragmentos definidos
  // no mesmo escopo do sql tag.
  const isFullAccess = ["admin","desenvolvedor","diretor","gerente_loja","gerente_fabrica"].includes(userCtx.role);
  let meuVendedorId: number | null = null;
  if (!isFullAccess) {
    try {
      meuVendedorId = await getUserVendedorId(user.id);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: 401 });
      }
      throw e;
    }
  }

  const { searchParams } = new URL(req.url);
  const inicio     = searchParams.get("inicio");
  const fim        = searchParams.get("fim");
  const situacao   = searchParams.get("situacao");   // rascunho|aprovado|enviado|cancelado|concluido
  const vendedorId = searchParams.get("vendedor_id");
  const q          = searchParams.get("q")?.trim();
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("page_size") ?? "15");

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSizeLimit = 100;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), pageSizeLimit)
    : 15;
  const offset = (page - 1) * pageSize;

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

  /**
   * REGRA DE NEGOCIO (listagem histórica de vendas):
   * O que faz: pagina no banco com LIMIT/OFFSET e remove o teto fixo de 500.
   * Por que: o filtro "Sem filtro" precisa permitir busca em qualquer data sem
   * truncar o histórico; a UI renderiza 15 por vez.
   * Impacto: se voltar o LIMIT fixo ou remover o COUNT com mesmos filtros,
   * paginação e busca podem omitir vendas antigas e quebrar a confiança no resultado.
   */
  const [totalRow] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total
    FROM alissonerp.vw_vendas_erp_completa v
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <  (${fim}::date + INTERVAL '1 day')
      ${isFullAccess ? sql`` : sql`AND v.vendedor_id = ${meuVendedorId!}`}
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
  `;
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
      EXISTS(
        SELECT 1
        FROM alissonerp.vendas_entrega_excecoes_pagamento ex
        WHERE ex.venda_id = v.id AND ex.status = 'aprovado'
      ) AS entrega_sem_pagamento_aprovada,
      GREATEST(
        v.total_venda - COALESCE((
          SELECT SUM(p.valor)
          FROM alissonerp.pagamentos_venda p
          WHERE p.venda_id = v.id
            AND p.status = 'confirmado'
            AND p.data_confirmacao IS NOT NULL
        ), 0),
        0
      )::numeric AS saldo_financeiro_aberto,
      ve.empresa_emitente_id,
      ve.nota_fiscal_id
    FROM alissonerp.vw_vendas_erp_completa v
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = v.id
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <  (${fim}::date + INTERVAL '1 day')
      ${isFullAccess ? sql`` : sql`AND v.vendedor_id = ${meuVendedorId!}`}
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
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return NextResponse.json({
    items: vendas.map((v) => ({
      ...v,
      total_produtos: Number(v.total_produtos),
      total_desconto: Number(v.total_desconto),
      total_frete:    Number(v.total_frete),
      total_venda:    Number(v.total_venda),
      total_comissao: Number(v.total_comissao),
      total_pago:     Number(v.total_pago),
      qtd_itens:      Number(v.qtd_itens),
      // REGRA DE NEGOCIO: selo da Automacao de Estoque 2.0 e derivado do
      // pagamento atual + excecao aprovada. Quando o A Receber e quitado, a
      // listagem volta automaticamente a mostrar apenas "Entregue".
      // IMPACTO SE REMOVIDO: equipe perde visibilidade de vendas entregues com
      // saldo financeiro aberto.
      entrega_sem_pagamento_aprovada: Boolean(v.entrega_sem_pagamento_aprovada),
      saldo_financeiro_aberto: Number(v.saldo_financeiro_aberto ?? 0),
      entregue_com_pendencia_financeira: v.situacao === "entregue" && Boolean(v.entrega_sem_pagamento_aprovada) && Number(v.saldo_financeiro_aberto ?? 0) > 0.01,
    })),
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
  });
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

  const raw = await req.json().catch(() => ({}));
  const parsedBody = VendaPostSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  // Cast para o tipo legado com itens/pagamentos tipados — schema valida com
  // passthrough(), entao mantemos os tipos existentes para nao mexer no resto.
  const body = parsedBody.data as unknown as {
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

  // ── Guards de tamanho de payload (onda 1I) ────────────────────────────────
  try {
    checkStringLength("observacoes", body.observacoes, LIMITS.OBSERVACOES_MAX);
    checkStringLength("observacoes_internas", body.observacoes_internas, LIMITS.OBSERVACOES_MAX);
    checkArrayLength("itens", body.itens, LIMITS.ITENS_VENDA_MAX);
    checkArrayLength("pagamentos", body.pagamentos, LIMITS.ITENS_VENDA_MAX);
    if (Array.isArray(body.itens)) {
      for (const item of body.itens) {
        checkStringLength("itens[].nome_produto", item.nome_produto, LIMITS.NOME_MAX);
        checkStringLength("itens[].observacao", item.observacao, LIMITS.OBSERVACOES_MAX);
      }
    }
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

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
    // 1. Inserir já com numero_venda via sequence (migration 259) — evita
    // race condition do antigo MAX+1 quando dois INSERTs corriam em paralelo.
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
        nextval('alissonerp.venda_numero_seq')::text,
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


    // 3a. Verificar saldo disponível ANTES do INSERT (trigger ainda não criou reservas)
    //     Usa 'disponivel' (saldo - reservas existentes) para alinhar com o que o frontend exibe.
    //     Produtos com disponivel < quantidade entram na lista de reposição.
    const produtosParaReposicao = new Set<number>();
    if (body.tipo_venda === "produto" && Array.isArray(body.itens) && body.itens.length > 0) {
      const pids = (body.itens as ItemInput[]).map(i => i.produto_id).filter(Boolean);
      if (pids.length > 0) {
        const saldosPre = await tx`
          SELECT produto_id, SUM(disponivel)::float8 AS disponivel
          FROM alissonerp.vw_saldo_estoque_comercial
          WHERE produto_id = ANY(${pids}::bigint[])
          GROUP BY produto_id
        `;
        const dispMap = new Map<number, number>(
          saldosPre.map((s: Record<string, unknown>) => [Number(s.produto_id), Number(s.disponivel)])
        );
        /**
         * REGRA DE NEGOCIO (Produto Upgrade): produto com config de upgrade
         * pode estar marcado como sob encomenda para aparecer/vender, mas NAO
         * deve abrir ordem de reposicao/fabricacao automatica.
         * O QUE: remove SKUs upgrade da lista de produtos que viram reposicao.
         * POR QUE: o upgrade e mao de obra com ouro do cliente, nao reposicao
         * de estoque comercial da loja.
         * IMPACTO SE REMOVIDO: vender PZ0003/Upgrade abre ordem indevida no PCP.
         */
        const upgradesRows = await tx`
          SELECT produto_id
          FROM alissonerp.produto_upgrade_config
          WHERE produto_id = ANY(${pids}::bigint[])
            AND ativo = true
        `;
        const produtosUpgrade = new Set<number>(
          upgradesRows.map((r: Record<string, unknown>) => Number(r.produto_id))
        );
        for (const item of body.itens as ItemInput[]) {
          if (!item.produto_id) continue;
          if (produtosUpgrade.has(Number(item.produto_id))) continue;
          const disp = dispMap.get(Number(item.produto_id)) ?? 0;
          if (disp < item.quantidade) produtosParaReposicao.add(Number(item.produto_id));
        }
      }
    }

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

        // ── Personalizacao: suporta formato LEGADO (1 campo) e MULTI-CAMPOS ──
        // Legado: item.personalizagem = { valor: "JOAO" }
        // Multi:  item.personalizagem = { campos: [{ label: "Nome 1", valor: "Maria" }, ...] }
        // Se config tem preco_por_letra/ peso_por_letra, recalcula server-side.
        let personalizacaoJson: PersonalizacaoQualquer | { valor: string } | null = null;
        let observacaoItem = item.observacao ?? null;
        let precoListaFinal    = item.preco_lista;
        let precoUnitarioFinal = item.preco_unitario;
        let totalItemFinal     = item.total_item;
        let valorComissaoFinal = item.valor_comissao ?? 0;
        let pesoEstimadoFinal: number | null = item.peso_estimado ?? null;
        // Dados de upgrade (populados dentro de if (item.produto_id), usados
        // fora para INSERT em itens_venda_upgrade)
        let upgradeData: {
          peso_gramas: number;
          peso_liquido: number;
          quebra_percentual: number;
          valor_por_grama: number;
          foto_balanca_path: string;
        } | null = null;

        if (item.produto_id) {
          // REGRA DE NEGOCIO (Ródio automático):
          // O que: quando o item é serviço de ródio, o preço NÃO vem digitado; ele é recalculado no backend
          // com base no SKU da joia informada em personalizacao.valor.
          // Por que: evita erro operacional e impede manipulação manual do valor do serviço.
          // Impacto: remover este bloco volta a depender de cálculo manual da consultora e reabre risco financeiro.
          const [metaProduto] = await tx`
            SELECT p.sku, p.nome, ti.tipo_item, psc.pct_calculo_servico
            FROM public.produtos p
            LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
            LEFT JOIN public.produtos_servico_config psc ON psc.id_produto = p.id_produto
            WHERE p.id_produto = ${item.produto_id}
            LIMIT 1
          `;
          const ehServicoRodio =
            (metaProduto?.tipo_item === "servico" || normalizarTextoBusca(typeof metaProduto?.sku === "string" ? metaProduto.sku : null) === "srv-rodio") &&
            isServicoRodio(
              typeof metaProduto?.sku === "string" ? metaProduto.sku : null,
              typeof metaProduto?.nome === "string" ? metaProduto.nome : null,
            );
          if (ehServicoRodio) {
            const skuBase = item.personalizacao?.valor?.trim();
            if (!skuBase) {
              throw new Error(`Servico de rodio exige SKU base da joia no item "${item.sku ?? item.nome_produto}"`);
            }

            const [baseRow] = await tx`
              SELECT p.id_produto, p.sku, p.nome, v.preco_venda
              FROM public.produtos p
              LEFT JOIN alissonerp.vw_produtos_geral_preco v ON v.id_produto = p.id_produto
              WHERE LOWER(p.sku) = LOWER(${skuBase})
                AND p.situacao = 'A'
              LIMIT 1
            `;
            const precoBase = baseRow?.preco_venda != null ? Number(baseRow.preco_venda) : null;
            if (!baseRow || precoBase == null || !Number.isFinite(precoBase) || precoBase <= 0) {
              throw new Error(`SKU base "${skuBase}" inválido para serviço de ródio (sem preço vigente)`);
            }

            const pctRodio = getPctRodio({ pct_calculo_servico: metaProduto?.pct_calculo_servico });
            const precoRodio = round2(precoBase * pctRodio);
            const qtdRodio = Math.max(1, Number(item.quantidade) || 1);
            const totalRodio = round2(precoRodio * qtdRodio);
            const pctComissaoRodio = Number(item.pct_comissao ?? 0);
            const valorComissaoRodio = round2(totalRodio * (pctComissaoRodio / 100));

            precoListaFinal = precoRodio;
            precoUnitarioFinal = precoRodio;
            totalItemFinal = totalRodio;
            valorComissaoFinal = valorComissaoRodio;
            const pctExibicao = Math.round(pctRodio * 100);
            const linhaRodio = `Ródio ${pctExibicao}% - Base: ${String(baseRow.sku).toUpperCase()} - Preço base: R$ ${precoBase.toFixed(2)}`;
            observacaoItem = [
              observacaoItem?.trim() || "",
              observacaoItem?.includes(linhaRodio) ? "" : linhaRodio,
            ].filter(Boolean).join("\n");
            personalizacaoJson = { valor: String(baseRow.sku) };
          }

          // ── Produto Upgrade: deteccao e recalculo server-side ────────────
          // REGRA DE NEGOCIO: Produto Upgrade — cliente entrega metal (ouro),
          // paga mao de obra por grama. O valor do item e calculado como
          // peso_gramas × valor_por_grama. A quebra e informativa (nao afeta
          // o cofre). Foto da balanca e obrigatoria.
          // IMPACTO SE REMOVIDO: itens upgrade viram itens normais sem
          // validacao de peso/foto e sem recalculo de valor.
          upgradeData = null; // reset para este item (declarado no escopo externo)

          const [upgradeCfg] = await tx`
              SELECT valor_por_grama, quebra_percentual
              FROM alissonerp.produto_upgrade_config
              WHERE produto_id = ${item.produto_id} AND ativo = true
            `;

            if (upgradeCfg) {
              const upgRaw = (item as unknown as Record<string, unknown>).upgrade;

              if (!upgRaw || typeof upgRaw !== "object") {
                throw new Error(
                  `Item upgrade "${item.sku ?? item.nome_produto}" exige dados de upgrade (peso, foto)`
                );
              }

              const upg = upgRaw as Record<string, unknown>;
              const pesoGramas = Number(upg.peso_gramas ?? 0);
              const fotoBalanca = typeof upg.foto_balanca_path === "string"
                ? upg.foto_balanca_path.trim()
                : null;

              if (!pesoGramas || pesoGramas <= 0) {
                throw new Error(
                  `Peso do metal e obrigatorio para upgrade "${item.sku ?? item.nome_produto}"`
                );
              }

              if (!fotoBalanca || fotoBalanca.length === 0) {
                throw new Error(
                  `Foto da balanca e obrigatoria para upgrade "${item.sku ?? item.nome_produto}"`
                );
              }

              const valorPorGrama = Number(upgradeCfg.valor_por_grama);
              const quebraPct = Number(upgradeCfg.quebra_percentual);
              const pesoLiquido = Math.round(pesoGramas * (1 - quebraPct / 100) * 10000) / 10000;
              const valorCalculado = Math.round(pesoGramas * valorPorGrama * 100) / 100;
              const totalUpgrade = Math.round(valorCalculado * (Number(item.quantidade) || 1) * 100) / 100;
              const pctComUpgrade = Number(item.pct_comissao ?? 0);
              const comissaoUpgrade = Math.round(totalUpgrade * (pctComUpgrade / 100) * 100) / 100;

              // Sobrescreve valores do item com o calculo do upgrade
              precoListaFinal    = valorCalculado;
              precoUnitarioFinal = valorCalculado;
              totalItemFinal     = totalUpgrade;
              valorComissaoFinal = comissaoUpgrade;
              pesoEstimadoFinal  = pesoGramas;

              upgradeData = {
                peso_gramas: pesoGramas,
                peso_liquido: pesoLiquido,
                quebra_percentual: quebraPct,
                valor_por_grama: valorPorGrama,
                foto_balanca_path: fotoBalanca,
              };
            }

          const [cfg] = await tx`
            SELECT
              pp.id,
              pp.tipo, pp.obrigatorio,
              pp.min_caracteres, pp.max_caracteres, pp.caracteres_permitidos,
              pp.label, pp.preco_por_letra, pp.peso_por_letra,
              (SELECT COUNT(*) FROM alissonerp.produto_personalizacao_campos pc
               WHERE pc.config_id = pp.id) AS qtd_campos
            FROM alissonerp.produto_personalizacao pp
            WHERE pp.produto_id = ${item.produto_id}
              AND pp.ativo = true
          `;
          if (cfg) {
            const qtdCampos = Number(cfg.qtd_campos);

            if (qtdCampos > 0) {
              // ── MODO MULTI-CAMPOS ──────────────────────────────────────
              // Busca config dos campos no banco
              const camposConfig = await tx`
                SELECT label, tipo, obrigatorio, min_caracteres, max_caracteres, caracteres_permitidos, posicao
                FROM alissonerp.produto_personalizacao_campos
                WHERE config_id = ${Number(cfg.id)}
                ORDER BY posicao ASC
              `;

              const persRaw = item.personalizacao as Record<string, unknown> | null;
              let camposRecebidos: Array<Record<string, unknown>> = [];
              if (persRaw) {
                if ("campos" in persRaw && Array.isArray(persRaw.campos)) {
                  camposRecebidos = persRaw.campos as Array<Record<string, unknown>>;
                } else if ("valor" in persRaw && typeof persRaw.valor === "string" && persRaw.valor) {
                  // Fallback: formato legado { valor: "..." } enviado para produto multi-campo
                  // trata o valor como preenchimento do primeiro campo
                  camposRecebidos = camposConfig.map((_cc: Record<string, unknown>, idx: number) => ({
                    valor: idx === 0 ? persRaw.valor : null,
                  }));
                }
              }

              // Validar cada campo recebido contra sua config
              for (let i = 0; i < camposConfig.length; i++) {
                const cc = camposConfig[i] as Record<string, unknown>;
                const recebido = camposRecebidos[i] as Record<string, unknown> | undefined;

                const configCampo: ConfigPersonalizacao = {
                  tipo: String(cc.tipo),
                  obrigatorio: Boolean(cc.obrigatorio),
                  min_caracteres: Number(cc.min_caracteres),
                  max_caracteres: Number(cc.max_caracteres),
                  caracteres_permitidos: String(cc.caracteres_permitidos) as CaracteresPermitidos,
                  label: String(cc.label),
                };

                const valor = typeof recebido?.valor === "string" ? recebido.valor : null;
                const val = validarPersonalizacao(valor, configCampo);
                if (!val.ok) {
                  throw new Error(
                    `Personalizacao invalida no item "${item.sku ?? item.nome_produto}" - ${configCampo.label}: ${val.erro}`,
                  );
                }
              }

              // Montar array de campos validados
              const camposParaSalvar: CampoPersonalizacao[] = camposConfig.map((cc: Record<string, unknown>, idx: number) => {
                const recebido = camposRecebidos[idx] as Record<string, unknown> | undefined;
                return {
                  label: String(cc.label),
                  valor: typeof recebido?.valor === "string" && recebido.valor.trim() ? recebido.valor.trim() : null,
                  max_caracteres: Number(cc.max_caracteres),
                  obrigatorio: Boolean(cc.obrigatorio),
                };
              });

              personalizacaoJson = normalizarPersonalizacaoMulti(camposParaSalvar);
              observacaoItem = appendPersonalizacaoObservacao(observacaoItem, personalizacaoJson);

            } else {
              // ── MODO LEGADO (1 campo, sem campos configurados) ──────────
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
                const personalizacaoLegado = normalizarPersonalizacao(valor, config);
                personalizacaoJson = personalizacaoLegado;
                observacaoItem = appendPersonalizacaoObservacao(observacaoItem, personalizacaoLegado);

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
        }

        const [itemRow] = await tx`
          INSERT INTO alissonerp.itens_venda_erp (
            venda_id, produto_id, nome_produto, sku,
            quantidade, preco_lista,
            pct_desconto, preco_unitario, total_item,
            pct_comissao, valor_comissao,
            peso_estimado, observacao, personalizacao
          ) VALUES (
            ${venda.id},
            ${item.produto_id ?? null},
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
          RETURNING id
        `;

        // ── Item upgrade: grava snapshot dos dados do metal ────────────────
        // REGRA DE NEGOCIO: Os dados do upgrade (peso, quebra, foto) sao
        // congelados no momento da venda. Se a config mudar depois, vendas
        // antigas mantem os valores originais. cofre_registrado = false
        // ate a venda ser aprovada.
        if (upgradeData) {
          await tx`
            INSERT INTO alissonerp.itens_venda_upgrade (
              item_venda_id, peso_gramas, peso_liquido,
              quebra_percentual, valor_por_grama, foto_balanca_path
            ) VALUES (
              ${itemRow.id},
              ${upgradeData.peso_gramas},
              ${upgradeData.peso_liquido},
              ${upgradeData.quebra_percentual},
              ${upgradeData.valor_por_grama},
              ${upgradeData.foto_balanca_path}
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

    await logAudit(tx, {
      tabela: "vendas_erp",
      operacao: "INSERT",
      registro_id: venda.id,
      usuario_id: user.id,
      dados_depois: { numero_venda: completa.numero_venda, total_venda: Number(completa.total_venda), situacao: completa.situacao },
    });

    // ─── Ordens de reposição (dentro da tx — falha reverte a venda inteira) ───
    const ordensReposicao: Array<{ numero_ordem: string; produto: string }> = [];
    if (produtosParaReposicao.size > 0) {
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
          if (!produtosParaReposicao.has(Number(item.produto_id))) continue;

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
              ${numeroOrdem}, ${completa.numero_venda}, 'reposicao_venda', 'pcp', 'criado', 'aguardando',
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

    return { ...completa, ordensReposicao };
  });
  } catch (err: unknown) {
    return internalError("[POST /api/vendas]", err, "Erro ao criar venda", 400);
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
