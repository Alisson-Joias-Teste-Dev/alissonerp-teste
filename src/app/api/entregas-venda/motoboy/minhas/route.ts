/**
 * GET /api/entregas-venda/motoboy/minhas
 *
 * REGRA DE NEGÓCIO: o motoboy logado vê as entregas atribuídas a ele MAIS as
 * avulsas do POOL ainda sem dono (patch A2 — liberadas pelo responsável,
 * situacao='pendente', motoboy_id NULL: qualquer entregador pode ver e
 * aceitar a primeira disponível). A role no sistema é "motoboy" (mesma dos
 * protocolistas). O que diferencia é a existência do registro em
 * alissonerp.motoboys vinculado ao user_id.
 *
 * O QUE: busca o user_id do motoboy logado na tabela motoboys e retorna
 * as entregas onde ev.motoboy_id = user_id OU (pool: avulsa pendente sem
 * dono), com filtros e cards. Os CARDS (contadores/acerto) continuam só com
 * o que já é do motoboy — ver comentário na query de cards mais abaixo.
 *
 * IMPACTO SE ALTERADO: se o filtro de motoboy_id for removido, o entregador
 * vê entregas de outros motoboys. Se a validação da tabela motoboys sumir,
 * protocolistas acessam essa rota indevidamente. Se o OR do pool for
 * removido, corrida liberada nunca aparece pra ninguém aceitar.
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // REGRA DE NEGÓCIO: verifica se o usuário é um motoboy cadastrado e ativo.
  // Protocolistas (mesma role) não têm registro em motoboys e são barrados.
  // Admin/gerente/dev podem passar ?motoboy_id= para ver entregas de outro motoboy.
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(req.url);
  const adminMotoboyId = url.searchParams.get("motoboy_id");
  const rolesAdmin = ["desenvolvedor", "admin", "gerente_loja"];

  let motoboyUserId: string;
  let motoboyNome: string | null = null;

  // REGRA DE NEGÓCIO: role 'entregador' é a role específica para entregadores
  // de app. Protocolistas usam role 'motoboy' e não acessam esta rota.
  const ehEntregador = usuario.role === "entregador";

  if (adminMotoboyId && rolesAdmin.includes(usuario.role as string)) {
    motoboyUserId = adminMotoboyId;
    const [mbAdmin] = await sql`
      SELECT nome FROM alissonerp.motoboys
      WHERE user_id = ${adminMotoboyId}::uuid LIMIT 1
    `;
    motoboyNome = mbAdmin?.nome ?? null;
  } else if (ehEntregador) {
    motoboyUserId = user.id;
    const [motoboy] = await sql`
      SELECT nome FROM alissonerp.motoboys
      WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    motoboyNome = motoboy?.nome ?? null;
  } else {
    const [motoboy] = await sql`
      SELECT id, user_id, nome
      FROM alissonerp.motoboys
      WHERE user_id = ${user.id}::uuid AND ativo = true
      LIMIT 1
    `;
    if (!motoboy) {
      return NextResponse.json({ error: "Acesso restrito a entregadores cadastrados" }, { status: 403 });
    }
    motoboyUserId = motoboy.user_id;
    motoboyNome = motoboy.nome;
  }

  const situacao = url.searchParams.get("situacao") ?? "";
  const dataInicio = url.searchParams.get("data_inicio") ?? "";
  const dataFim = url.searchParams.get("data_fim") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  // Filtro por situacao
  const whereSituacao = situacao
    ? sql`AND ev.situacao = ${situacao}`
    : sql``;

  // Filtro por período
  const whereDataInicio = dataInicio
    ? sql`AND ev.created_at >= ${dataInicio}::date`
    : sql``;

  const whereDataFim = dataFim
    ? sql`AND ev.created_at < (${dataFim}::date + interval '1 day')`
    : sql``;

  // REGRA DE NEGÓCIO: retorna apenas entregas do motoboy logado
  const [items, countResult, cards] = await Promise.all([
    sql`
      SELECT
        ev.id, ev.venda_id, ev.codigo_entrega, ev.tipo, ev.situacao,
        ev.forma_entrega, ev.regiao, ev.frete_motoboy, ev.data_saida,
        ev.data_entrega_realizada, ev.created_at,
        ev.is_avulso, ev.descricao_avulso,
        -- REGRA DE NEGÓCIO (migration 353): corrida avulsa liberada de uma
        -- solicitação da consultora carrega endereço de entrega (a solicitação
        -- parte de uma venda) e observações — o motoboy precisa ver pra onde ir.
        ev.endereco_entrega, ev.observacoes,
        ev.motoboy_id,
        (ev.created_by = ev.motoboy_id) AS auto_criado,
        ve.numero_venda, ve.total_venda,
        COALESCE(c.nome, ca.nome) AS cliente_nome,
        EXISTS (
          SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi
          WHERE pmi.entrega_id = ev.id
        ) AS foi_pago
      FROM alissonerp.entregas_venda ev
      LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      LEFT JOIN public.contatos ca ON ca.id_contato = ev.contato_id
      -- REGRA DE NEGÓCIO (pool de motoboy — patch A2): além das corridas já
      -- atribuídas a este motoboy, mostra também as avulsas de POOL
      -- disponíveis (liberadas pelo responsável, ainda sem dono) — qualquer
      -- entregador pode ver e aceitar a primeira. Uma vez aceita, motoboy_id
      -- passa a ser deste motoboy e ela já cai no primeiro braço do OR.
      WHERE (ev.motoboy_id = ${motoboyUserId}::uuid
              OR (ev.is_avulso = true AND ev.situacao = 'pendente' AND ev.motoboy_id IS NULL))
        -- REGRA DE NEGÓCIO (migration 353): 'solicitada' ainda não foi liberada
        -- pelo responsável — o motoboy não deve ver/contar corrida que nem
        -- entrou no fluxo de aceite ainda (some da lista dele até liberar).
        AND ev.situacao NOT IN ('cancelada', 'solicitada')
        ${whereSituacao}
        ${whereDataInicio}
        ${whereDataFim}
      ORDER BY ev.created_at DESC, ev.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::integer AS total
      FROM alissonerp.entregas_venda ev
      -- REGRA DE NEGÓCIO (pool de motoboy — patch A2): mesmo critério da query
      -- de itens acima — conta também as avulsas de pool disponíveis, senão a
      -- paginação (totalPages) fica errada em relação à lista mostrada.
      WHERE (ev.motoboy_id = ${motoboyUserId}::uuid
              OR (ev.is_avulso = true AND ev.situacao = 'pendente' AND ev.motoboy_id IS NULL))
        -- REGRA DE NEGÓCIO (migration 353): 'solicitada' ainda não foi liberada
        -- pelo responsável — o motoboy não deve ver/contar corrida que nem
        -- entrou no fluxo de aceite ainda (some da lista dele até liberar).
        AND ev.situacao NOT IN ('cancelada', 'solicitada')
        ${whereSituacao}
        ${whereDataInicio}
        ${whereDataFim}
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE ev.situacao = 'pendente')::integer AS pendentes,
        COUNT(*) FILTER (WHERE ev.situacao = 'em_rota')::integer AS em_rota,
        COUNT(*) FILTER (WHERE ev.situacao = 'confirmada')::integer AS entregues,
        COALESCE(SUM(ev.frete_motoboy) FILTER (WHERE ev.situacao = 'confirmada'), 0)::numeric AS total_mes,
        COALESCE(SUM(ev.frete_motoboy) FILTER (
          WHERE ev.situacao = 'confirmada'
            AND NOT EXISTS (SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi WHERE pmi.entrega_id = ev.id)
        ), 0)::numeric AS a_receber,
        COALESCE(SUM(ev.frete_motoboy) FILTER (
          WHERE ev.situacao = 'confirmada'
            AND EXISTS (SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi WHERE pmi.entrega_id = ev.id)
        ), 0)::numeric AS ja_recebido
      FROM alissonerp.entregas_venda ev
      -- REGRA DE NEGÓCIO (pool de motoboy — patch A2): os CARDS (contadores)
      -- de propósito NÃO entram no OR de pool acima — continuam contando só o
      -- que já é deste motoboy (ev.motoboy_id = motoboyUserId). Corrida de
      -- pool ainda sem dono não pertence a ninguém e não tem acerto financeiro
      -- vinculado a este motoboy; se contasse aqui, TODO entregador veria os
      -- mesmos números inflados com corridas que talvez nunca peguem.
      WHERE ev.motoboy_id = ${motoboyUserId}::uuid
        -- REGRA DE NEGÓCIO (migration 353): 'solicitada' ainda não foi liberada
        -- pelo responsável — o motoboy não deve ver/contar corrida que nem
        -- entrou no fluxo de aceite ainda (some da lista dele até liberar).
        AND ev.situacao NOT IN ('cancelada', 'solicitada')
        ${dataInicio
          ? sql`AND ev.created_at >= ${dataInicio}::date`
          : sql`AND ev.created_at >= date_trunc('month', now())`}
        ${whereDataFim}
    `,
  ]);

  const total: number = countResult[0].total;
  const c = cards[0];

  return NextResponse.json({
    items: items.map((r) => ({
      id: Number(r.id),
      venda_id: Number(r.venda_id),
      codigo_entrega: r.codigo_entrega,
      tipo: r.tipo,
      situacao: r.situacao,
      forma_entrega: r.forma_entrega,
      regiao: r.regiao,
      frete_motoboy: Number(r.frete_motoboy ?? 0),
      data_saida: r.data_saida,
      data_entrega_realizada: r.data_entrega_realizada,
      created_at: r.created_at,
      numero_venda: r.numero_venda,
      total_venda: r.total_venda ? Number(r.total_venda) : null,
      cliente_nome: r.cliente_nome,
      is_avulso: Boolean(r.is_avulso),
      descricao_avulso: r.descricao_avulso ? String(r.descricao_avulso) : null,
      endereco_entrega: r.endereco_entrega ? String(r.endereco_entrega) : null,
      observacoes: r.observacoes ? String(r.observacoes) : null,
      // REGRA DE NEGÓCIO (pool — patch A2): motoboy_id null = corrida de pool
      // ainda sem dono (o frontend usa isso pro selo "disponível").
      motoboy_id: r.motoboy_id ? String(r.motoboy_id) : null,
      auto_criado: Boolean(r.auto_criado),
      foi_pago: Boolean(r.foi_pago),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    cards: {
      pendentes: Number(c.pendentes),
      em_rota: Number(c.em_rota),
      entregues: Number(c.entregues),
      total_mes: Number(c.total_mes),
      a_receber: Number(c.a_receber),
      ja_recebido: Number(c.ja_recebido),
    },
    motoboy_nome: motoboyNome,
  });
}
