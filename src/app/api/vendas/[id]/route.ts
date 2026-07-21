import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { internalError } from "@/lib/api-error";
import { traduzErroOperacional } from "@/lib/erros-operacionais";
import { getDescontoThreshold, buscarLimiteDescontoCartao } from "@/lib/aprovacao-regras";
import { approveVenda } from "@/lib/vendas-aprovar";
import { isMasterAdmin } from "@/lib/master-admin";
import { solicitarAprovacaoEntregaSemPagamento, vendaTemExcecaoEntregaAprovada } from "@/lib/entrega-sem-pagamento";
import { logAudit } from "@/lib/audit";

const toNum = (v: unknown) => (v === null || v === undefined ? v : Number(v));

const VendaPatchSchema = z.object({
  situacao: z.string().max(50).optional(),
  cliente_id: IdSchema.nullable().optional(),
  vendedor_id: IdSchema.nullable().optional(),
  data_venda: z.string().max(50).optional(),
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
  client_updated_at: z.string().max(50).optional(),
}).passthrough();

// ─── GET /api/vendas/[id] ──────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Onda 1D: bloqueia consultora de ler venda de outro vendedor
  const [usuarioAuth] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuarioAuth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    await requireVendaOwnership({ id: user.id, role: usuarioAuth.role, email: user.email ?? "" }, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda,
      v.cliente_id, v.cliente_nome, v.cliente_cpf_cnpj, v.cliente_email, v.cliente_telefone,
      v.vendedor_id, v.vendedor_nome,
      v.data_venda, v.data_entrega,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda, v.total_comissao,
      v.situacao, v.forma_envio, v.forma_frete,
      v.observacoes, v.observacoes_internas, v.video_obs_interna,
      v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_at, v.tiny_sync_erro,
      v.bloqueado, v.created_by, v.created_at, v.updated_at,
      v.qtd_itens, v.total_pago,
      ve.endereco_entrega, ve.endereco_entrega_numero, ve.endereco_entrega_complemento,
      ve.endereco_entrega_bairro, ve.endereco_entrega_cidade, ve.endereco_entrega_cep, ve.endereco_entrega_uf,
      ve.credito_gerente_usado, ve.aprovacao_credito_tipo, ve.aprovacao_credito_tarefa_id,
      (SELECT t.status FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_credito_status,
      (SELECT t.tags FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_tarefa_tags,
      -- REGRA DE NEGÓCIO #1: cada tipo de aprovação tem seu próprio campo
      -- Desconto, cartão e crédito usam campos separados para não se bloquear mutuamente
      ve.aprovacao_desconto_tarefa_id,
      (SELECT t.status FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_desconto_tarefa_id) AS aprovacao_desconto_status,
      ve.aprovacao_cartao_desconto_tarefa_id,
      (SELECT t.status FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_cartao_desconto_tarefa_id) AS aprovacao_cartao_desconto_status,
      (SELECT u.nome FROM alissonerp.tarefas t JOIN alissonerp.usuarios u ON u.id = t.responsavel_id WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_credito_responsavel_nome,
      (SELECT at.id FROM alissonerp.aprovacoes_tarefa at WHERE at.tarefa_id = ve.aprovacao_credito_tarefa_id AND at.status = 'pendente' LIMIT 1) AS aprovacao_desconto_aprov_id,
      ve.desconto_aprovado_por,
      ve.desconto_aprovado_em,
      (SELECT u.nome FROM alissonerp.usuarios u WHERE u.id = ve.desconto_aprovado_por) AS desconto_aprovado_por_nome,
      ve.desconto_cartao_aprovado_por,
      ve.desconto_cartao_aprovado_em,
      (SELECT u.nome FROM alissonerp.usuarios u WHERE u.id = ve.desconto_cartao_aprovado_por) AS desconto_cartao_aprovado_por_nome,
      -- Entrega "levou devendo" (crediário ②): há A Receber pendente? E status da exceção de aprovação.
      (EXISTS(SELECT 1 FROM alissonerp.pagamentos_venda p WHERE p.venda_id = ve.id AND p.forma = 'A Receber' AND p.status = 'pendente')
       OR EXISTS(SELECT 1 FROM alissonerp.contas_receber cr WHERE cr.venda_erp_id = ve.id AND cr.categoria = 'venda' AND cr.situacao = 'pendente')) AS entrega_devendo,
      (SELECT ex.status FROM alissonerp.vendas_entrega_excecoes_pagamento ex
        WHERE ex.venda_id = ve.id
        ORDER BY CASE ex.status WHEN 'aprovado' THEN 1 WHEN 'pendente' THEN 2 ELSE 3 END, ex.id DESC
        LIMIT 1) AS entrega_excecao_status,
      c.endereco AS cliente_endereco, c.numero AS cliente_numero, c.complemento AS cliente_complemento,
      c.bairro AS cliente_bairro, c.municipio AS cliente_municipio, c.cep AS cliente_cep, c.uf AS cliente_uf,
      c.celular AS cliente_celular,
      c.id_api_contato AS cliente_id_tiny
    FROM alissonerp.vw_vendas_erp_completa v
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = v.id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT
      ive.id, ive.produto_id, ive.nome_produto, ive.sku,
      ive.quantidade,
      ive.preco_lista, ive.pct_desconto, ive.preco_unitario, ive.total_item,
      ive.pct_comissao, ive.valor_comissao, ive.markup_aplicado,
      ive.desconto_autorizado_por, ive.observacao, ive.peso_estimado, ive.personalizacao, ive.created_at,
      -- Dados de upgrade (se existirem)
      iuv.peso_gramas      AS upgrade_peso_gramas,
      iuv.peso_liquido     AS upgrade_peso_liquido,
      iuv.quebra_percentual AS upgrade_quebra_percentual,
      iuv.valor_por_grama  AS upgrade_valor_por_grama,
      iuv.foto_balanca_path AS upgrade_foto_balanca_path,
      iuv.cofre_registrado AS upgrade_cofre_registrado
    FROM alissonerp.itens_venda_erp ive
    LEFT JOIN alissonerp.itens_venda_upgrade iuv ON iuv.item_venda_id = ive.id
    WHERE ive.venda_id = ${vendaId}
    ORDER BY ive.id
  `;

  const pagamentos = await sql`
    SELECT
      id, forma, gateway, valor, parcelas,
      status, gateway_id, data_confirmacao, created_at,
      valor_liquido, taxas_mp,
      ouro_peso, ouro_valor_grama, ouro_foto_path
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const ordens = await sql`
    SELECT id, numero_ordem, tipo_ordem, situacao, status, created_at
    FROM alissonerp.ordens
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  // ── Alianças: ficha de CADA anel (apenas exibição) ───────────────────────────
  // REGRA DE NEGOCIO: a venda guarda a aliança como UM item ("Alianças (... + ...)",
  // qtde 2). Para a tela mostrar cada anel SEPARADO (modelo, tamanho/aro e pedra),
  // buscamos as fichas do orçamento que gerou a venda — anel 1 = ficha_tecnica_id,
  // anel 2 = ficha_tecnica_2_id. NAO altera preço/quantidade/comissão (só display).
  // IMPACTO SE REMOVIDO: a aliança volta a aparecer "tudo junto" numa linha só.
  const orcsAlianca = await sql`
    SELECT id, quantidade, ficha_tecnica_id, ficha_tecnica_2_id
    FROM alissonerp.orcamentos
    WHERE venda_gerada_id = ${vendaId}
    ORDER BY id
  `;
  const fichaIds = orcsAlianca
    .flatMap((o) => [o.ficha_tecnica_id, o.ficha_tecnica_2_id])
    .filter((x): x is number => x != null);
  const aliancaRings: Array<{
    anel: number; modelo: string | null; perfil: string | null;
    tamanho: string | null; largura: number | null; espessura: number | null;
    pedra: { tipo: string | null; qtd: number | null; tamanho_mm: number | null; aplicacao: string | null } | null;
    valorPedra: number | null;
    pedras: Array<{ tipo: string | null; corte: string | null; tamanho_mm: number | null; qtd: number | null; ct_total: number | null; preco_total_rs: number | null }>;
  }> = [];
  if (fichaIds.length > 0) {
    const fichas = await sql`
      SELECT id, perfil, modelo, aro_numeracao, largura, espessura,
             qtd_pedras, tamanho_pedra, tipo_pedra, tipo_aplicacao_pedra, pedras_detalhadas
      FROM alissonerp.orcamento_fichas_tecnicas
      WHERE id = ANY(${fichaIds})
    `;
    const byId = new Map(fichas.map((f) => [Number(f.id), f]));
    let anel = 0;
    for (const o of orcsAlianca) {
      for (const fid of [o.ficha_tecnica_id, o.ficha_tecnica_2_id]) {
        if (fid == null) continue;
        const f = byId.get(Number(fid));
        if (!f) continue;
        anel += 1;
        const qtdPedras = f.qtd_pedras != null ? Number(f.qtd_pedras) : 0;
        // Valor da pedra do detalhamento do orçamento (deixa CLARO que é cobrada).
        // pedras_detalhadas pode vir como array (jsonb) ou string legada — trata ambos.
        const pedrasArr = (() => {
          let pd: unknown = f.pedras_detalhadas;
          if (typeof pd === "string") { try { pd = JSON.parse(pd); } catch { return [] as Array<Record<string, unknown>>; } }
          return Array.isArray(pd) ? (pd as Array<Record<string, unknown>>) : [];
        })();
        const somaPedra = pedrasArr.reduce((s, p) => s + (Number(p.preco_total_rs) || 0), 0);
        // Cada pedra separada (pra mostrar uma a uma no detalhe da aliança).
        const pedras = pedrasArr.map((p) => ({
          tipo: (p.tipo as string | null) ?? null,
          corte: (p.corte as string | null) ?? null,
          tamanho_mm: p.tamanho_mm != null ? Number(p.tamanho_mm) : null,
          qtd: p.qtd != null ? Number(p.qtd) : null,
          ct_total: p.ct_total != null ? Number(p.ct_total) : null,
          preco_total_rs: p.preco_total_rs != null ? Number(p.preco_total_rs) : null,
        }));
        aliancaRings.push({
          anel,
          modelo: f.modelo ?? null,
          perfil: f.perfil ?? null,
          tamanho: f.aro_numeracao ?? null,
          largura: f.largura != null ? Number(f.largura) : null,
          espessura: f.espessura != null ? Number(f.espessura) : null,
          pedra: qtdPedras > 0 ? {
            tipo: f.tipo_pedra ?? null,
            qtd: qtdPedras,
            tamanho_mm: f.tamanho_pedra != null ? Number(f.tamanho_pedra) : null,
            aplicacao: f.tipo_aplicacao_pedra ?? null,
          } : null,
          valorPedra: somaPedra > 0 ? somaPedra : null,
          pedras,
        });
      }
    }
  }

  const devolucoes = await sql`
    SELECT id, numero, tipo, status, tipo_compensacao,
           valor_total_devolvido, valor_compensacao, created_at
    FROM alissonerp.devolucoes_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id DESC
  `;

  // REGRA DE NEGÓCIO (V3 — solicitação de frete avulso pela consultora): expõe
  // a ÚLTIMA corrida avulsa vinculada a esta venda, para a tela mostrar o
  // status no lugar do botão "Solicitar frete avulso" (aguardando decisão /
  // liberada / recusada + motivo). Só entregas_venda com is_avulso=true E
  // venda_id preenchido chegam aqui (nasce assim só pelo fluxo de solicitação
  // da consultora — ver criarFreteAvulso em @/lib/entrega-venda).
  // IMPACTO SE REMOVIDO: a tela não tem como saber se já existe solicitação
  // sem abrir o módulo de Tarefas — o botão reapareceria sempre disponível.
  const [freteAvulso] = await sql`
    SELECT id, situacao, motivo_recusa, frete_cobrado, created_at
    FROM alissonerp.entregas_venda
    WHERE venda_id = ${vendaId} AND is_avulso = true
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [excecaoEntrega] = await sql`
    SELECT id
    FROM alissonerp.vendas_entrega_excecoes_pagamento
    WHERE venda_id = ${vendaId} AND status = 'aprovado'
    LIMIT 1
  `;
  // REGRA DE NEGOCIO: o selo de entrega pendente nao e gravado manualmente.
  // O QUE: deriva do snapshot de excecao aprovada + pagamento confirmado atual.
  // POR QUE: quando o A Receber for baixado, o selo muda sozinho para Entregue.
  // IMPACTO SE ALTERADO: status visual pode ficar congelado e esconder saldo aberto.
  const totalConfirmadoAtual = pagamentos.reduce((acc: number, p: Record<string, unknown>) => {
    return acc + (p.status === "confirmado" && p.data_confirmacao ? Number(p.valor ?? 0) : 0);
  }, 0);
  const saldoFinanceiroAberto = Math.max(0, Number(venda.total_venda ?? 0) - totalConfirmadoAtual);
  const entregueComPendenciaFinanceira =
    venda.situacao === "entregue" && !!excecaoEntrega && saldoFinanceiroAberto > 0.01;

  const descontoThreshold = await getDescontoThreshold(vendaId);
  // REGRA DE NEGÓCIO (Fase 5, fix 16/07): o limite do cartão vem da config
  // (limite_desconto_cartao_pct, editável em Configurações › Aprovadores) —
  // o front tinha `const LIMITE_DESCONTO_CARTAO = 20` cravado e ignorava a
  // config, mostrando "acima de 20%" mesmo com a chave em 30.
  // IMPACTO SE REMOVIDO: tela e servidor voltam a divergir (banner some/aparece
  // no % errado; o gate real do POST /pagamentos já lê a config).
  const limiteDescontoCartao = await buscarLimiteDescontoCartao();

  return NextResponse.json({
    ...venda,
    devolucoes: devolucoes.map((d) => ({
      ...d,
      valor_total_devolvido: Number(d.valor_total_devolvido),
      valor_compensacao: Number(d.valor_compensacao),
    })),
    frete_avulso: freteAvulso ? {
      id: Number(freteAvulso.id),
      situacao: String(freteAvulso.situacao),
      motivo_recusa: freteAvulso.motivo_recusa ?? null,
      frete_cobrado: Number(freteAvulso.frete_cobrado),
      created_at: freteAvulso.created_at,
    } : null,
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete:    Number(venda.total_frete),
    total_venda:    Number(venda.total_venda),
    total_comissao: Number(venda.total_comissao),
    total_pago:     Number(venda.total_pago),
    qtd_itens:      Number(venda.qtd_itens),
    credito_gerente_usado: Number(venda.credito_gerente_usado ?? 0),
    aprovacao_credito_tipo: venda.aprovacao_credito_tipo ?? null,
    aprovacao_credito_tarefa_id: venda.aprovacao_credito_tarefa_id ?? null,
    aprovacao_credito_status: venda.aprovacao_credito_status ?? null,
    aprovacao_tarefa_tags: venda.aprovacao_tarefa_tags ?? null,
    aprovacao_credito_responsavel_nome: venda.aprovacao_credito_responsavel_nome ?? null,
    // REGRA DE NEGÓCIO #1: campos separados para cada tipo de aprovação
    // O frontend usa estes campos para mostrar banners independentes
    aprovacao_desconto_tarefa_id: venda.aprovacao_desconto_tarefa_id ?? null,
    aprovacao_desconto_status: venda.aprovacao_desconto_status ?? null,
    aprovacao_cartao_desconto_tarefa_id: venda.aprovacao_cartao_desconto_tarefa_id ?? null,
    aprovacao_cartao_desconto_status: venda.aprovacao_cartao_desconto_status ?? null,
    aprovacao_desconto_aprov_id: venda.aprovacao_desconto_aprov_id ?? null,
    desconto_aprovado_por_nome: venda.desconto_aprovado_por_nome ?? null,
    desconto_aprovado_em: venda.desconto_aprovado_em ?? null,
    desconto_cartao_aprovado_por_nome: venda.desconto_cartao_aprovado_por_nome ?? null,
    desconto_cartao_aprovado_em: venda.desconto_cartao_aprovado_em ?? null,
    entrega_sem_pagamento_aprovada: !!excecaoEntrega,
    saldo_financeiro_aberto: Number(saldoFinanceiroAberto.toFixed(2)),
    entregue_com_pendencia_financeira: entregueComPendenciaFinanceira,
    descontoThreshold,
    limiteDescontoCartao,
    itens: itens.map((i) => ({
      ...i,
      quantidade:      Number(i.quantidade),
      preco_lista:     Number(i.preco_lista),
      pct_desconto:    Number(i.pct_desconto),
      preco_unitario:  Number(i.preco_unitario),
      total_item:      Number(i.total_item),
      pct_comissao:    Number(i.pct_comissao),
      valor_comissao:  Number(i.valor_comissao),
      markup_aplicado: i.markup_aplicado != null ? Number(i.markup_aplicado) : null,
      // Upgrade data (nulo se nao for item upgrade)
      upgrade: i.upgrade_peso_gramas != null ? {
        peso_gramas:       Number(i.upgrade_peso_gramas),
        peso_liquido:      Number(i.upgrade_peso_liquido),
        quebra_percentual: Number(i.upgrade_quebra_percentual),
        valor_por_grama:   Number(i.upgrade_valor_por_grama),
        foto_balanca_path: i.upgrade_foto_balanca_path as string,
        cofre_registrado:  Boolean(i.upgrade_cofre_registrado),
      } : null,
    })),
    pagamentos: pagamentos.map((p) => ({
      ...p,
      valor:         Number(p.valor),
      valor_liquido: p.valor_liquido != null ? Number(p.valor_liquido) : null,
      taxas_mp:      p.taxas_mp      != null ? Number(p.taxas_mp)      : null,
    })),
    ordens,
    aliancaRings,
  });
}

// ─── PATCH /api/vendas/[id] ────────────────────────────────────────────────────
// Campos editáveis em rascunho: situacao, data_entrega, total_frete,
//   forma_envio, forma_frete, observacoes, observacoes_internas, numero_rastreio
// Após rascunho (aprovado+): apenas situacao pode ser alterada.
// Pagamentos são gerenciados por endpoint próprio (/pagamentos/).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja", "consultora"];
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, situacao, bloqueado, aprovacao_credito_tarefa_id, vendedor_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  // Onda 1D: consultora so edita venda propria — Onda 1G: helper unificado
  try {
    await requireVendaOwnership(
      { id: user.id, role: usuario.role, email: user.email ?? "" },
      vendaId,
    );
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsedBody = VendaPatchSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);

  // Gate financeiro por campo — vendedora/gerente abre solicitação ao tentar
  // alterar campos protegidos. Frontend usa flag `solicitar` pra abrir modal.
  const CAMPOS_ADMIN_ONLY = ["cliente_id", "vendedor_id", "data_venda"];
  const ROLES_FINANCEIRO = ["admin", "desenvolvedor", "diretor"];
  if (!ROLES_FINANCEIRO.includes(usuario.role)) {
    for (const campo of CAMPOS_ADMIN_ONLY) {
      if ((rawBody as Record<string, unknown>)[campo] !== undefined) {
        return NextResponse.json(
          { error: `O campo "${campo}" só pode ser alterado pelo admin. Envie uma solicitação.`, solicitar: true },
          { status: 403 },
        );
      }
    }
  }
  // Cast pra preservar tipos legados (situacao mutavel etc).
  const body = parsedBody.data as {
    situacao?:             string;
    cliente_id?:           number | null;
    vendedor_id?:          number | null;
    data_venda?:           string;
    data_entrega?:         string | null;
    total_frete?:          number;
    forma_envio?:          string | null;
    forma_frete?:          string | null;
    observacoes?:          string | null;
    observacoes_internas?: string | null;
    video_obs_interna?:    string | null;
    endereco_entrega?:             string | null;
    endereco_entrega_numero?:      string | null;
    endereco_entrega_complemento?: string | null;
    endereco_entrega_bairro?:      string | null;
    endereco_entrega_cidade?:      string | null;
    endereco_entrega_cep?:         string | null;
    endereco_entrega_uf?:          string | null;
    tipo_venda?:           string | null;
    numero_rastreio?:      string | null;
    venda_garantia_id?:    number | null;
    /** Guard de versão — opcional, retrocompatível */
    client_updated_at?:    string;
  };

  try {
    checkStringLength("observacoes", body.observacoes, LIMITS.OBSERVACOES_MAX);
    checkStringLength("observacoes_internas", body.observacoes_internas, LIMITS.OBSERVACOES_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // Fluxo novo 06/2026: 'concluido' e 'enviado' foram APOSENTADOS — nenhuma
  // venda transiciona mais PARA eles (vendas antigas nesses status são só
  // histórico). 'em_rota' é setado pelo módulo de entregas (motoboy retirou),
  // nunca por este PATCH. 'entregue' aqui cobre o caminho Correios/manual.
  // IMPACTO SE REMOVIDO: vendas novas voltam a virar 'concluido' e quebram o
  // fluxo rascunho → aprovado → em_rota → entregue.
  const SITUACOES_VALIDAS = ["rascunho", "aprovado", "entregue", "cancelado"];
  if (body.situacao && !SITUACOES_VALIDAS.includes(body.situacao)) {
    return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
  }

  // ── Cancelar venda: precisa cancelar ordem(s) associada(s) em cascata ────────
  // Regra (migration 269): se ordem tem apontamento da fabrica (ourives mexeu,
  // ouro saiu), so master pode cancelar. Outros usuarios sao bloqueados com
  // mensagem clara. Sem cascade, venda canceladada deixava ordem ativa e a
  // fabrica continuava produzindo uma peca que nao seria entregue.
  if (body.situacao === "cancelado") {
    // Busca ordens associadas a venda (pode ter mais de uma, ex: par alianca + reposicao).
    // "ouro_movido" detecta apontamentos cujo insumo eh da categoria METAL
    // (parametros_sistema.METAL_CATEGORIA_ID = 1) com qtd > 0.
    const ordensAssoc = await sql<{ id: number; numero_ordem: string; situacao: string; tem_apontamento: boolean; ouro_movido: boolean }[]>`
      SELECT
        o.id, o.numero_ordem, o.situacao,
        EXISTS(
          SELECT 1 FROM alissonerp.apontamentos_pcp ap
          JOIN alissonerp.pcp p ON p.id = ap.pcp_id
          WHERE p.ordem_id = o.id
        ) AS tem_apontamento,
        EXISTS(
          SELECT 1 FROM alissonerp.apontamentos_pcp ap
          JOIN alissonerp.pcp p ON p.id = ap.pcp_id
          JOIN alissonerp.insumos i ON i.id = ap.insumo_id
          WHERE p.ordem_id = o.id AND i.categoria_id = 1 AND ap.qtd > 0
        ) AS ouro_movido
      FROM alissonerp.ordens o
      WHERE o.venda_id = ${vendaId} AND o.situacao != 'cancelado'
    `;

    const ehMaster = await isMasterAdmin(user.id);
    const ordensComApontamento = ordensAssoc.filter((o) => o.tem_apontamento);

    if (ordensComApontamento.length > 0 && !ehMaster) {
      return NextResponse.json(
        {
          error: "Esta venda tem ordem(s) na fábrica com apontamentos. Apenas o administrador master pode cancelar.",
          ordens_bloqueadas: ordensComApontamento.map((o) => ({
            numero_ordem: o.numero_ordem,
            ouro_movimentado: o.ouro_movido,
          })),
          requer_master: true,
        },
        { status: 409 },
      );
    }

    // Master pode cancelar com apontamento, mas precisa informar motivo.
    const motivo = (rawBody as { motivo?: string })?.motivo?.toString().trim() ?? "";
    if (ordensComApontamento.length > 0 && !motivo) {
      return NextResponse.json(
        { error: "Master deve informar motivo ao cancelar venda com ordem em produção." },
        { status: 400 },
      );
    }

    // Cancela ordens em cascata. Motivo (quando informado) concatena em
    // detalhes_ordem. Audit completo fica em alissonerp.audit_log via trigger
    // trg_audit_ordens.
    if (ordensAssoc.length > 0) {
      const sufixoCancel = `\n[CANCELADO em ${new Date().toISOString().slice(0, 10)} por venda_id=${vendaId}${motivo ? `: ${motivo}` : ""}]`;
      await sql`
        UPDATE alissonerp.ordens
        SET situacao = 'cancelado',
            status = 'concluido',
            cancelado_por = ${user.id}::uuid,
            cancelado_em = NOW(),
            detalhes_ordem = COALESCE(detalhes_ordem, '') || ${sufixoCancel},
            updated_at = NOW()
        WHERE venda_id = ${vendaId} AND situacao != 'cancelado'
      `;
    }
  }

  // ── Guard de versão (lost-update prevention) ────────────────────────────────
  // Deve rodar ANTES do bloco Tiny, pois o Tiny faz UPDATE em vendas_erp e
  // dispara o trigger de updated_at — causando falso positivo se checado depois.
  if (body.client_updated_at) {
    const [row] = await sql`SELECT updated_at FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
    if (row && new Date(row.updated_at as string).getTime() !== new Date(body.client_updated_at).getTime()) {
      return NextResponse.json(
        { error: "Conflito: registro foi modificado por outro usuário. Recarregue a página." },
        { status: 409 }
      );
    }
  }

  // Campos restritos a rascunho
  if (body.cliente_id !== undefined || body.vendedor_id !== undefined || body.data_venda !== undefined) {
    if (venda.situacao !== "rascunho") {
      return NextResponse.json({ error: "Estes campos só podem ser alterados em rascunho" }, { status: 409 });
    }
  }

  // ── Guard: após "rascunho", bloquear edição de dados da venda ────────────────
  if (venda.situacao !== "rascunho") {
    const CAMPOS_BLOQUEADOS_APOS_RASCUNHO = [
      "data_entrega", "total_frete", "forma_envio", "forma_frete",
      "observacoes", "observacoes_internas", "video_obs_interna", "numero_rastreio",
    ] as const;
    for (const campo of CAMPOS_BLOQUEADOS_APOS_RASCUNHO) {
      if ((rawBody as Record<string, unknown>)[campo] !== undefined) {
        return NextResponse.json(
          { error: `"${campo}" não pode ser alterado após a venda ser aprovada.` },
          { status: 409 },
        );
      }
    }
  }

  // ── data_entrega obrigatória para aprovar ────────────────────────────────
  if (body.situacao === "aprovado") {
    const [vendaEntrega] = await sql`
      SELECT data_entrega FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const dataEntregaFinal = body.data_entrega ?? vendaEntrega?.data_entrega;
    if (!dataEntregaFinal) {
      return NextResponse.json(
        { error: "Data de entrega é obrigatória para aprovar a venda." },
        { status: 400 }
      );
    }
  }

  // ── Bloquear aprovação se tem Manual (MP) pendente ───────────────────────
  if (body.situacao === "aprovado") {
    const [mpPendente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Manual (MP)' AND status = 'pendente'
      LIMIT 1
    `;
    if (mpPendente) {
      return NextResponse.json(
        { error: "Confirme o pagamento Manual (MP) antes de aprovar a venda." },
        { status: 409 }
      );
    }
  }

  // ── Bloquear aprovação se lock pendente ──────────────────────────────────
  if (body.situacao === "aprovado" && venda.aprovacao_credito_tarefa_id) {
    return NextResponse.json(
      { error: "Venda aguarda aprovação pendente. Aprove via aba Tarefas antes de prosseguir." },
      { status: 409 }
    );
  }
  // ── Bloquear aprovação se há pagamento A Receber sem aprovação de crédito ──
  if (body.situacao === "aprovado") {
    const [aReceberPend] = await sql`
      SELECT COALESCE(SUM(valor), 0)::numeric AS total
      FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    `;
    const [vendaCredTipo] = await sql`
      SELECT aprovacao_credito_tipo FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const totalAReceber = Number(aReceberPend?.total ?? 0);
    const aprovacaoTipo = vendaCredTipo?.aprovacao_credito_tipo;
    if (totalAReceber > 0 && (!aprovacaoTipo || aprovacaoTipo === "pendente")) {
      return NextResponse.json(
        { error: "Venda com crédito a receber precisa de aprovação antes de ser aprovada." },
        { status: 400 }
      );
    }
  }
  // ── Bloquear aprovação se desconto > threshold sem aprovação (não-admin/dev) ─
  if (body.situacao === "aprovado" && !isFullAccess(usuario.role)) {
    const threshold = await getDescontoThreshold(vendaId);
    const [dcCheck] = await sql`
      SELECT
        EXISTS(
          SELECT 1 FROM alissonerp.itens_venda_erp
          WHERE venda_id = ${vendaId} AND pct_desconto > ${threshold}
        ) AS tem_desconto_alto,
        desconto_aprovado_por IS NOT NULL AS desconto_ja_aprovado
      FROM alissonerp.vendas_erp
      WHERE id = ${vendaId}
    `;
    if (dcCheck?.tem_desconto_alto && !dcCheck?.desconto_ja_aprovado) {
      return NextResponse.json(
        { error: `Venda tem desconto acima de ${threshold}% aguardando aprovação. Solicite aprovação de desconto antes de prosseguir.` },
        { status: 409 }
      );
    }
  }

  // ── Guard: transições que avançam o status exigem pagamento completo ────────
  // REGRA DE NEGOCIO: Automacao de Estoque 2.0 mantém a regra padrao de
  // pagamento total antes da entrega. A unica excecao e `entregue` com
  // aprovacao formal de entrega sem pagamento total; nesse caso o helper de
  // aprovacao garante A Receber sem duplicar antes da baixa real de estoque.
  //
  // ETAPA 4 (Pagamento na Entrega — decisão Jonathan 11/06): a forma 'Na Entrega'
  // é um saldo que o cliente paga NA HORA da entrega. Regras:
  //   • APROVAR: a consultora aprova DIRETO (sem gerente) se confirmados +
  //     'Na Entrega' pendentes = total e não há OUTRO pendente. O 'Na Entrega'
  //     pendente NÃO bloqueia a aprovação (diferente de A Receber, que precisa
  //     de aprovação de crédito).
  //   • ENTREGAR: NÃO deixa entregar enquanto houver 'Na Entrega' pendente — o
  //     atendente/motoboy precisa registrar o pagamento real antes (rota
  //     /cobrar-entrega). Sem exceção de gerente para este caso.
  // IMPACTO SE REMOVIDO: pedido pode baixar estoque sem pagamento e sem trilha
  // de aprovacao/rastreio financeiro.
  if (body.situacao && ["aprovado", "entregue"].includes(body.situacao)) {
    const [pcCheck] = await sql`
      SELECT
        v.total_venda::numeric AS total_venda,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pendente'), 0)::numeric AS soma_pendentes,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pendente' AND p.forma = 'Na Entrega'), 0)::numeric AS soma_na_entrega,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pendente' AND p.forma != 'Na Entrega'), 0)::numeric AS soma_pendentes_outros,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS soma_confirmados
      FROM alissonerp.vendas_erp v
      LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
      WHERE v.id = ${vendaId}
      GROUP BY v.total_venda
    `;
    const somaPendentes = Number(pcCheck?.soma_pendentes ?? 0);
    const somaNaEntrega = Number(pcCheck?.soma_na_entrega ?? 0);
    const somaPendentesOutros = Number(pcCheck?.soma_pendentes_outros ?? 0);
    const somaPaga = Number(pcCheck?.soma_confirmados ?? 0);
    const totalDev = Number(pcCheck?.total_venda ?? 0);

    // ── APROVAR: 'Na Entrega' pendente é permitido ──────────────────────────
    if (body.situacao === "aprovado") {
      // Bloqueia se houver pendente que NÃO seja 'Na Entrega' (ex.: Pix não pago)
      if (somaPendentesOutros > 0) {
        return NextResponse.json(
          { error: "Venda possui pagamentos pendentes (fora 'Na Entrega'). Confirme-os antes de aprovar." },
          { status: 409 },
        );
      }
      // Exige que confirmados + 'Na Entrega' cubram o total
      if (somaPaga + somaNaEntrega < totalDev - 0.01) {
        return NextResponse.json(
          { error: `Pagamento insuficiente: R$${(somaPaga + somaNaEntrega).toFixed(2)} (pago + na entrega) de R$${totalDev.toFixed(2)} devidos.` },
          { status: 409 },
        );
      }
      // OK para aprovar — o 'Na Entrega' fica pendente até a cobrança na entrega.
    } else {
      // ── ENTREGAR ──────────────────────────────────────────────────────────
      // 'Na Entrega' pendente BLOQUEIA a entrega (decisão Jonathan: não entrega
      // sem pagar). O atendente cobra via /cobrar-entrega antes.
      if (somaNaEntrega > 0) {
        return NextResponse.json(
          { error: `Registre o pagamento na entrega (R$${somaNaEntrega.toFixed(2)}) antes de marcar como entregue.`, code: "NA_ENTREGA_PENDENTE" },
          { status: 409 },
        );
      }

      const pagamentoIncompleto = somaPendentes > 0 || somaPaga < totalDev - 0.01;
      let permitirEntregaSemPagamento = false;

      if (pagamentoIncompleto) {
        const temExcecaoAprovada = await vendaTemExcecaoEntregaAprovada(vendaId);
        if (!temExcecaoAprovada) {
          try {
            const result = await solicitarAprovacaoEntregaSemPagamento(vendaId, user.id);
            return NextResponse.json(
              {
                ok: true,
                precisa_aprovacao_entrega: true,
                tarefa_id: result.tarefaId,
                ja_existia: result.jaExistia,
                message: result.jaExistia
                  ? "Entrega sem pagamento total já aguarda aprovação."
                  : "Entrega sem pagamento total enviada para aprovação.",
              },
              { status: 202 },
            );
          } catch (err) {
            return internalError(`[PATCH /api/vendas/${vendaId}] entrega_sem_pagamento`, err, "Falha ao solicitar aprovação de entrega sem pagamento total", 409);
          }
        }
        permitirEntregaSemPagamento = temExcecaoAprovada;
      }

      if (!permitirEntregaSemPagamento && somaPendentes > 0) {
        return NextResponse.json(
          { error: "Venda possui pagamentos pendentes. Confirme todos antes de concluir." },
          { status: 409 },
        );
      }
      if (!permitirEntregaSemPagamento && somaPaga < totalDev - 0.01) {
        return NextResponse.json(
          { error: `Pagamento insuficiente: R$${somaPaga.toFixed(2)} confirmados de R$${totalDev.toFixed(2)} devidos.` },
          { status: 409 },
        );
      }
    }
  }

  // ── Aprovação delegada ao helper compartilhado ──────────────────────────────
  // Fluxo novo 06/2026: approveVenda (src/lib/vendas-aprovar.ts) faz TUDO da
  // aprovação — guard de desconto, envio ao Tiny (best-effort: erro vira
  // warning e a venda aprova mesmo assim, com tiny_sync_erro salvo p/ reenvio
  // manual), UPDATE situacao='aprovado', criação de ordem (orçamento/serviço),
  // verificação de reposição automática e metal de upgrade no cofre.
  // O antigo inline (~300 linhas de Tiny/ordem/cofre duplicadas da lib) foi
  // removido — fonte única de verdade é a lib.
  // IMPACTO SE ALTERADO: aprovar sem o helper deixa a venda sem ordem, sem
  // Tiny e sem entrada de cofre do upgrade.
  let tinyErroWarning: string | null = null;
  let ordemCriadaAprovacao: string | null = null;
  if (body.situacao === "aprovado") {
    try {
      const aprovResult = await approveVenda(vendaId, user.id, { tinyBestEffort: true });
      tinyErroWarning = aprovResult.tiny_erro ?? null;
      ordemCriadaAprovacao = aprovResult.ordem_criada ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao aprovar venda";
      return NextResponse.json({ error: traduzErroOperacional(msg) }, { status: 409 });
    }
  }

  /**
   * REGRA DE NEGOCIO (Sob encomenda / reposicao_venda): item vendido sem estoque
   * abre ordem de reposicao, mas a entrega so pode baixar estoque depois que a
   * peca pronta existir no livro rigido (SLE).
   * O QUE: antes de mudar para "entregue", detecta reservas de reposicao ja
   * concluida que ainda nao possuem saldo SLE suficiente no local da reserva.
   * POR QUE: evita tratar sob encomenda como peca de pronta-entrega e troca o
   * erro tecnico STOCK_NEGATIVE por orientacao operacional para registrar a entrada.
   * IMPACTO SE REMOVIDO: vendas sob encomenda sem entrada formal tentam baixar
   * estoque inexistente e voltam a falhar com STOCK_NEGATIVE.
   */
  if (body.situacao === "entregue" && venda.situacao !== "entregue") {
    const reposicoesSemEntrada = await sql`
      SELECT
        r.produto_id,
        COALESCE(p.sku, io.sku) AS sku,
        COALESCE(p.nome, io.nome_produto) AS nome_produto,
        r.quantidade,
        COALESCE(r.local_estoque_id, 2) AS local_estoque_id,
        o.numero_ordem,
        COALESCE(SUM(sle.actual_qty) FILTER (WHERE sle.is_cancelled = false), 0)::numeric AS saldo_sle
      FROM alissonerp.reservas_estoque_comercial r
      JOIN alissonerp.ordens o
        ON o.venda_id = r.venda_id
       AND o.tipo_ordem = 'reposicao_venda'
       AND o.status = 'concluido'
      JOIN alissonerp.itens_ordem io
        ON io.ordem_id = o.id
       AND io.produto_id = r.produto_id
      LEFT JOIN public.produtos p ON p.id_produto = r.produto_id
      LEFT JOIN alissonerp.stock_ledger_entry sle
        ON sle.item_id = r.produto_id
       AND sle.item_type = 'produto'
       AND sle.warehouse_id = COALESCE(r.local_estoque_id, 2)
      WHERE r.venda_id = ${vendaId}
        AND r.status = 'ativo'
      GROUP BY r.produto_id, p.sku, io.sku, p.nome, io.nome_produto,
               r.quantidade, r.local_estoque_id, o.numero_ordem
      HAVING COALESCE(SUM(sle.actual_qty) FILTER (WHERE sle.is_cancelled = false), 0) < r.quantidade
    `;

    if (reposicoesSemEntrada.length > 0) {
      const item = reposicoesSemEntrada[0];
      return NextResponse.json(
        {
          error: `Produto sob encomenda ainda não entrou no estoque. Registre a entrada da ordem ${item.numero_ordem} antes de entregar a venda.`,
          code: "REPOSICAO_SEM_ENTRADA_ESTOQUE",
          itens: reposicoesSemEntrada.map((row) => ({
            produto_id: Number(row.produto_id),
            sku: row.sku,
            nome_produto: row.nome_produto,
            quantidade: Number(row.quantidade),
            local_estoque_id: Number(row.local_estoque_id),
            numero_ordem: row.numero_ordem,
            saldo_sle: Number(row.saldo_sle),
          })),
        },
        { status: 409 },
      );
    }
  }

  // ── Persistir alterações com captura de erros do banco ──────────────────────
  // try/catch generalista para capturar exceções lançadas por triggers do banco
  // (STOCK_NEGATIVE, ENTREGA_BLOCKED, etc.) e devolver como JSON em vez de
  // deixar o Next.js retornar HTML 500 — o que quebra o frontend em res.json().
  try {
    // 'aprovado' já foi aplicado pelo approveVenda (com guards e skips próprios,
    // ex.: cartão liberado sem pagamento confirmado NÃO aprova). Não reaplicar
    // aqui para não atropelar a decisão do helper.
    const situacaoUpdate = body.situacao === "aprovado" ? null : body.situacao ?? null;
    await sql`
      UPDATE alissonerp.vendas_erp SET
        situacao             = COALESCE(${situacaoUpdate},                    situacao),
        cliente_id           = COALESCE(${body.cliente_id ?? null},           cliente_id),
        vendedor_id          = COALESCE(${body.vendedor_id ?? null},          vendedor_id),
        data_venda           = COALESCE(${body.data_venda ?? null},           data_venda),
        data_entrega         = COALESCE(${body.data_entrega ?? null},         data_entrega),
        total_frete          = COALESCE(${body.total_frete ?? null},          total_frete),
        forma_envio          = COALESCE(${body.forma_envio ?? null},          forma_envio),
        forma_frete          = COALESCE(${body.forma_frete ?? null},          forma_frete),
        observacoes          = COALESCE(${body.observacoes ?? null},          observacoes),
        observacoes_internas = COALESCE(${body.observacoes_internas ?? null}, observacoes_internas),
        video_obs_interna    = COALESCE(${body.video_obs_interna ?? null},    video_obs_interna),
        endereco_entrega             = COALESCE(${body.endereco_entrega ?? null},             endereco_entrega),
        endereco_entrega_numero      = COALESCE(${body.endereco_entrega_numero ?? null},      endereco_entrega_numero),
        endereco_entrega_complemento = COALESCE(${body.endereco_entrega_complemento ?? null}, endereco_entrega_complemento),
        endereco_entrega_bairro      = COALESCE(${body.endereco_entrega_bairro ?? null},      endereco_entrega_bairro),
        endereco_entrega_cidade      = COALESCE(${body.endereco_entrega_cidade ?? null},      endereco_entrega_cidade),
        endereco_entrega_cep         = COALESCE(${body.endereco_entrega_cep ?? null},         endereco_entrega_cep),
        endereco_entrega_uf          = COALESCE(${body.endereco_entrega_uf ?? null},          endereco_entrega_uf),
        tipo_venda           = COALESCE(${body.tipo_venda ?? null},           tipo_venda),
        numero_rastreio      = COALESCE(${body.numero_rastreio ?? null},      numero_rastreio),
        venda_garantia_id    = COALESCE(${body.venda_garantia_id ?? null},    venda_garantia_id)
      WHERE id = ${vendaId}
    `;

    // Recalcular total_venda se frete mudou
    if (body.total_frete !== undefined) {
      await sql`
        UPDATE alissonerp.vendas_erp
        SET total_venda = total_produtos + ${body.total_frete}
        WHERE id = ${vendaId}
      `;
    }

    // Rastreabilidade §0.1 (Blindagem 2026-06 — correção C4): registra QUEM
    // alterou a venda e QUAIS campos mudaram. Transições de situacao também
    // ficam em vendas_transicoes (trigger), mas alterações de campos só aqui.
    {
      const camposAlterados: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && k !== "client_updated_at") camposAlterados[k] = v;
      }
      if (Object.keys(camposAlterados).length > 0) {
        await logAudit(sql, {
          tabela: "vendas_erp",
          operacao: "UPDATE",
          registro_id: vendaId,
          usuario_id: user.id,
          dados_antes: { situacao: venda.situacao },
          dados_depois: camposAlterados,
        });
      }
    }

    // ── Sync alterações com Tiny se venda já aprovada e tem pedido Tiny ─────────
    if (!body.situacao && venda.situacao === "aprovado") {
      const [vendaSync] = await sql`
        SELECT v.tiny_pedido_id, v.numero_venda, v.total_desconto, v.total_frete,
          v.observacoes, v.observacoes_internas,
          c.id_api_contato AS cliente_id_tiny,
          vd.id_api_vendedor AS vendedor_id_tiny
        FROM alissonerp.vendas_erp v
        LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
        LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
        WHERE v.id = ${vendaId}
      `;
      if (vendaSync?.tiny_pedido_id) {
        try {
          const [tokenRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
          const rawToken = tokenRow?.valor_encrypted;
          if (rawToken) {
            let tinyToken: string;
            try { tinyToken = JSON.parse(rawToken); } catch { tinyToken = String(rawToken); }
            tinyToken = tinyToken.replace(/"/g, "").trim();
            const updatePayload: Record<string, unknown> = {};
            if (body.total_frete !== undefined) updatePayload.valorFrete = Number(body.total_frete);
            if (body.observacoes !== undefined) updatePayload.observacoes = body.observacoes ?? "";
            if (body.observacoes_internas !== undefined) updatePayload.observacoesInternas = body.observacoes_internas ?? "";
            if (Object.keys(updatePayload).length > 0) {
              await fetch(`https://api.tiny.com.br/public-api/v3/pedidos/${vendaSync.tiny_pedido_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tinyToken}` },
                body: JSON.stringify(updatePayload),
                signal: AbortSignal.timeout(15000),
              });
            }
          }
        } catch { /* sync Tiny não bloqueia edição local */ }
      }
    }

    // REGRA DE NEGOCIO: aprovação não baixa estoque comercial.
    // O trigger de item cria reserva; a baixa real ocorre no trigger de entrega
    // quando `situacao` muda para `entregue`.
    // IMPACTO SE ALTERADO: pode duplicar saída de estoque ou antecipar baixa antes da entrega.

    // (Produto Upgrade) Metal do cliente no cofre: registrado pelo approveVenda
    // na aprovação — inline removido (fluxo novo 06/2026).

    // Ordem de fabricação (orçamento/serviço): criada pelo approveVenda na
    // aprovação — inline removido (fluxo novo 06/2026; 'concluido' aposentado).

    return NextResponse.json({
      ok: true,
      ...(ordemCriadaAprovacao ? { ordem_criada: ordemCriadaAprovacao } : {}),
      ...(tinyErroWarning ? { tiny_warning: tinyErroWarning } : {}),
    });
  } catch (e) {
    // REGRA DE NEGÓCIO (Blindagem 2026-06 — correção M2): erros de REGRA vindos
    // de triggers do banco (STOCK_NEGATIVE, ENTREGA_BLOCKED, TRANSICAO_INVALIDA)
    // são conflito de negócio → 409 com a mensagem para o usuário.
    // Qualquer OUTRO erro é falha interna → 500 via internalError (loga o stack
    // e devolve mensagem genérica, sem vazar detalhes do banco).
    // IMPACTO SE ALTERADO: voltar ao catch-all 409 mascara erros reais como
    // "conflito" e expõe mensagens cruas do banco ao usuário.
    const msg = e instanceof Error ? e.message : "";
    const ERROS_DE_REGRA = ["STOCK_NEGATIVE", "ENTREGA_BLOCKED", "TRANSICAO", "reposição", "reposicao"];
    if (ERROS_DE_REGRA.some((m) => msg.includes(m))) {
      // Traduz o prefixo técnico p/ texto claro (a tela de detalhe usa fetch cru,
      // então a tradução precisa sair daqui, do servidor).
      return NextResponse.json({ error: traduzErroOperacional(msg) }, { status: 409 });
    }
    return internalError(`[PATCH /api/vendas/${vendaId}]`, e, "Erro interno ao salvar venda. Tente novamente.");
  }
}
