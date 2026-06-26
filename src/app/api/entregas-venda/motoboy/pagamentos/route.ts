/**
 * GET /api/entregas-venda/motoboy/pagamentos
 *
 * REGRA DE NEGÓCIO: histórico de pagamentos feitos a motoboys.
 * Admin/gerente/dev veem todos. O motoboy logado vê apenas os dele.
 *
 * O QUE: retorna pagamentos com total, data, quem pagou e itens.
 * Aceita ?motoboy_id= para filtrar por entregador específico.
 *
 * IMPACTO SE ALTERADO: sem histórico, perde-se rastreabilidade financeira.
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_ADMIN = ["desenvolvedor", "admin", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(req.url);
  const motoboyIdParam = url.searchParams.get("motoboy_id");

  // Se é motoboy logado, só vê os próprios pagamentos
  let motoboyUserId: string | null = null;
  if (ROLES_ADMIN.includes(usuario.role as string)) {
    motoboyUserId = motoboyIdParam ?? null;
  } else {
    const [mb] = await sql`
      SELECT user_id FROM alissonerp.motoboys
      WHERE user_id = ${user.id}::uuid AND ativo = true LIMIT 1
    `;
    if (!mb) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
    motoboyUserId = mb.user_id;
  }

  const whereMotoboy = motoboyUserId
    ? sql`WHERE pm.motoboy_id = ${motoboyUserId}::uuid`
    : sql``;

  const pagamentos = await sql`
    SELECT
      pm.id, pm.motoboy_id, pm.valor_total, pm.observacoes, pm.created_at,
      mb.nome AS motoboy_nome,
      uc.nome AS criado_por_nome,
      COALESCE(json_agg(
        json_build_object(
          'entrega_id', pmi.entrega_id,
          'frete_motoboy', pmi.frete_motoboy,
          'codigo_entrega', ev.codigo_entrega,
          'numero_venda', ve.numero_venda,
          'cliente_nome', c.nome
        ) ORDER BY pmi.id
      ) FILTER (WHERE pmi.id IS NOT NULL), '[]'::json) AS itens
    FROM alissonerp.pagamentos_motoboy pm
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = pm.motoboy_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = pm.created_by
    LEFT JOIN alissonerp.pagamentos_motoboy_itens pmi ON pmi.pagamento_id = pm.id
    LEFT JOIN alissonerp.entregas_venda ev ON ev.id = pmi.entrega_id
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    ${whereMotoboy}
    GROUP BY pm.id, mb.nome, uc.nome
    ORDER BY pm.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json(
    pagamentos.map((p) => ({
      id: Number(p.id),
      motoboy_id: p.motoboy_id,
      motoboy_nome: p.motoboy_nome,
      valor_total: Number(p.valor_total),
      observacoes: p.observacoes,
      criado_por_nome: p.criado_por_nome,
      created_at: p.created_at,
      itens: Array.isArray(p.itens) ? p.itens : [],
    })),
  );
}
