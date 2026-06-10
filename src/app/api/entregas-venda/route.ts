/**
 * GET /api/entregas-venda
 * POST /api/entregas-venda
 *
 * Lista e cria entregas vinculadas a vendas.
 *
 * GET — Lista paginada de entregas com filtros por venda, situação e motoboy.
 *   Regra de visibilidade: consultora vê apenas entregas de vendas próprias
 *   (filtro por vendedor_id em vendas_erp). Gerente/admin/dev veem tudo.
 *
 * POST — Cria uma nova entrega (parcial ou total) com geração de códigos
 *   de verificação. Valida saldo pendente, tipo de entrega, motoboy obrigatório
 *   e cálculos de frete via criarEntrega() da lib.
 *
 * Tabelas envolvidas:
 *   - alissonerp.entregas_venda (cabeçalho)
 *   - alissonerp.vendas_erp (dados da venda)
 *   - alissonerp.motoboys (entregador)
 *
 * IMPACTO SE ALTERADO: as queries de listagem alimentam a tela de entregas
 * do ERP; mudar JOINs ou colunas quebra a UI. A criação de entrega chama
 * criarEntrega() que gerencia atomicidade, códigos e validações — não
 * contorne a lib com INSERT direto.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { criarEntrega } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// REGRA DE NEGÓCIO: papéis que podem visualizar a lista de entregas.
// "consultora" tem visibilidade restrita (apenas entregas de suas vendas).
const ROLES_ENTREGAS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// ─── Zod Schema para criação de entrega ─────────────────────────────────────
// REGRA DE NEGÓCIO: valida os campos obrigatórios antes de delegar para a lib.
// A lib faz validações adicionais (saldo pendente, tipo total cobre todos os
// itens, motoboy obrigatório para motoboy, etc).
// IMPACTO SE ALTERADO: remover campos obrigatórios permite criação de entregas
// inválidas; adicionar restrições pode quebrar chamadas legítimas do frontend.
const CriarEntregaSchema = z.object({
  vendaId: z.number().int().positive("vendaId deve ser um número positivo"),
  tipo: z.enum(["parcial", "total"]),
  formaEntrega: z.enum(["retirada", "motoboy"]),
  itens: z
    .array(
      z.object({
        itemVendaId: z.number().int().positive("itemVendaId deve ser um número positivo"),
        quantidade: z.number().int().positive("quantidade deve ser maior que zero"),
      }),
    )
    .min(1, "É necessário informar pelo menos um item"),
  regiao: z
    .enum(["fortaleza", "fora_fortaleza", "longe", "correios"])
    .optional(),
  motoboyId: z.string().optional(),
  freteCobrado: z.number().nonnegative("freteCobrado não pode ser negativo").optional(),
  observacoes: z.string().max(2000, "observacoes muito longa").optional(),
});

// ─── GET /api/entregas-venda ──────────────────────────────────────────────────
// REGRA DE NEGÓCIO: lista entregas com filtros opcionais. Para consultora,
// filtra automaticamente por vendedor_id (só vê entregas de suas vendas).
// Ordenação: entregas mais recentes primeiro (created_at DESC).
// IMPACTO SE ALTERADO: a ordenação afeta a UX da tela de entregas;
// a paginação usa LIMIT/OFFSET padrão.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Busca role e vendedor_id em uma única query (padrão de 100+ rotas do ERP)
  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_ENTREGAS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const vendaId = url.searchParams.get("venda_id");
  const situacao = url.searchParams.get("situacao") ?? "";
  const motoboyId = url.searchParams.get("motoboy_id");
  const dataInicio = url.searchParams.get("data_inicio") ?? "";
  const dataFim = url.searchParams.get("data_fim") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;

  // Filtro de vendedor: consultora vê só suas vendas
  // REGRA DE NEGÓCIO: consultoras não podem ver entregas de outras vendedoras.
  // IMPACTO SE REMOVIDO: vazamento de dados entre consultoras.
  const isConsultora = usuario.role === "consultora";
  const vendedorId = isConsultora ? (usuario.vendedor_id as number | null) : null;

  // Consultora sem vendedor_id configurado não vê nada
  if (isConsultora && !vendedorId) {
    return NextResponse.json({ items: [], total: 0, page, limit, totalPages: 0 });
  }

  // Construção dinâmica de WHEREs usando tagged templates do postgres
  const whereVendedor = vendedorId !== null
    ? sql`AND ve.vendedor_id = ${vendedorId}`
    : sql``;

  const whereVenda = vendaId
    ? sql`AND ev.venda_id = ${Number(vendaId)}`
    : sql``;

  // REGRA DE NEGÓCIO: canceladas não aparecem por padrão (auto-cancel do modal
  // sem código). Só reaparecem se o filtro pedir explicitamente situacao=cancelada.
  // IMPACTO SE REMOVIDO: lixo operacional polui a lista de entregas ativas.
  const whereSituacao = situacao
    ? sql`AND ev.situacao = ${situacao}`
    : sql`AND ev.situacao <> 'cancelada'`;

  const whereMotoboy = motoboyId
    ? sql`AND ev.motoboy_id = ${Number(motoboyId)}`
    : sql``;

  const whereDataInicio = dataInicio
    ? sql`AND ev.created_at >= ${dataInicio}::date`
    : sql``;

  const whereDataFim = dataFim
    ? sql`AND ev.created_at < (${dataFim}::date + interval '1 day')`
    : sql``;

  // Duas queries em paralelo: dados + contagem total
  const [items, countResult] = await Promise.all([
    sql`
      SELECT
        ev.id,
        ev.venda_id,
        ev.codigo_entrega,
        ev.codigo_cliente,
        ev.codigo_motoboy,
        ev.tipo,
        ev.forma_entrega,
        ev.situacao,
        ev.regiao,
        ev.motoboy_id,
        ev.frete_cobrado,
        ev.frete_motoboy,
        ev.aprovacao_frete_necessaria,
        ev.data_saida,
        ev.data_retirada,
        ev.data_entrega_realizada,
        ev.data_entrega_prevista,
        ev.correios_rastreio,
        ev.correios_data_postagem,
        ev.observacoes,
        ev.created_at,
        ve.numero_venda,
        ve.total_venda,
        ve.situacao AS venda_situacao,
        COALESCE(c.nome, ca.nome) AS cliente_nome,
        mb.nome AS motoboy_nome,
        ev.is_avulso,
        ev.descricao_avulso
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      LEFT JOIN public.contatos ca ON ca.id_contato = ev.contato_id
      LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
      WHERE 1=1
        ${whereVendedor}
        ${whereVenda}
        ${whereSituacao}
        ${whereMotoboy}
        ${whereDataInicio}
        ${whereDataFim}
      ORDER BY ev.created_at DESC, ev.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::integer AS total
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      WHERE 1=1
        ${whereVendedor}
        ${whereVenda}
        ${whereSituacao}
        ${whereMotoboy}
        ${whereDataInicio}
        ${whereDataFim}
    `,
  ]);

  const total: number = countResult[0].total;

  // REGRA DE NEGÓCIO: campos NUMERIC do PostgreSQL vêm como string.
  // Converter com Number() para o frontend receber números nativos.
  // IMPACTO SE REMOVIDO: o frontend recebe strings e cálculos quebram.
  return NextResponse.json({
    items: items.map((r) => ({
      ...r,
      venda_id: r.venda_id != null ? Number(r.venda_id) : null,
      motoboy_id: r.motoboy_id ? String(r.motoboy_id) : null,
      frete_cobrado: Number(r.frete_cobrado ?? 0),
      frete_motoboy: Number(r.frete_motoboy ?? 0),
      total_venda: r.total_venda ? Number(r.total_venda) : null,
      aprovacao_frete_necessaria: Boolean(r.aprovacao_frete_necessaria),
      is_avulso: Boolean(r.is_avulso),
      descricao_avulso: r.descricao_avulso ? String(r.descricao_avulso) : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// ─── POST /api/entregas-venda ─────────────────────────────────────────────────
// REGRA DE NEGÓCIO: cria uma nova entrega para uma venda existente.
// A lib criarEntrega() gerencia: geração de códigos únicos, validação
// de saldo pendente, cálculo de frete, transação atômica e auditoria.
// IMPACTO SE ALTERADO: não contorne a lib com INSERT direto — a lib
// garante atomicidade e unicidade de códigos de verificação.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verifica se usuário existe no ERP (qualquer role pode criar entrega)
  const [usuario] = await sql`
    SELECT id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Validação do body com Zod
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = CriarEntregaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  // Delega a criação para a lib, que faz todas as validações de negócio
  // e executa em transação atômica com geração de códigos e auditoria.
  try {
    const entrega = await criarEntrega(
      {
        vendaId: body.vendaId,
        tipo: body.tipo,
        formaEntrega: body.formaEntrega,
        itens: body.itens,
        regiao: body.regiao,
        motoboyId: body.motoboyId,
        freteCobrado: body.freteCobrado,
        observacoes: body.observacoes,
      },
      user.id,
    );

    // Retorna a entrega criada + códigos de verificação para exibição
    // REGRA DE NEGÓCIO: os códigos são sensíveis — o frontend exibe em
    // um modal de confirmação e o usuário os anota antes de fechar.
    return NextResponse.json({
      entrega,
      codigos: {
        cliente: entrega.codigoCliente,
        motoboy: entrega.codigoMotoboy,
      },
    });
  } catch (err) {
    // Erros de negócio da lib (venda não encontrada, saldo insuficiente, etc)
    const message = err instanceof Error ? err.message : "Erro ao criar entrega";
    console.error("[entregas-venda] Erro ao criar entrega:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
