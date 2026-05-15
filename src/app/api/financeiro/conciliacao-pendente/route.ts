import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── GET /api/financeiro/conciliacao-pendente ─────────────────────────────────
// Lista pagamentos manuais MP (source='manual_mp') confirmados que ainda não
// foram conciliados pelo financeiro no site do Mercado Pago.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const periodo = url.searchParams.get("periodo") ?? "30"; // dias

  const pendentes = await sql`
    SELECT
      pv.id,
      pv.venda_id,
      ve.numero_venda,
      COALESCE(pv.valor::numeric, 0) AS valor,
      pv.gateway_id,
      pv.gateway,
      pv.data_confirmacao,
      pv.created_at,
      c.nome AS cliente_nome
    FROM alissonerp.pagamentos_venda pv
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    WHERE pv.source = 'manual_mp'
      AND pv.status = 'confirmado'
      AND pv.created_at >= NOW() - (${periodo}::integer || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM alissonerp.fin_conciliacoes fc
        WHERE fc.pagamento_venda_id = pv.id
          AND fc.tipo = 'manual_mp_confirmado'
      )
    ORDER BY pv.data_confirmacao DESC NULLS LAST
    LIMIT 200
  `;

  return NextResponse.json(
    pendentes.map((p) => ({ ...p, valor: Number(p.valor) }))
  );
}

// ─── POST /api/financeiro/conciliacao-pendente ────────────────────────────────
// Marca um pagamento manual MP como conciliado (financeiro conferiu no site MP).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as { pagamento_id: number; obs?: string };
  if (!body.pagamento_id) {
    return NextResponse.json({ error: "pagamento_id obrigatório" }, { status: 400 });
  }

  // Valida que o pagamento existe e é manual_mp confirmado
  const [pag] = await sql`
    SELECT id, source, status FROM alissonerp.pagamentos_venda
    WHERE id = ${body.pagamento_id}
  `;
  if (!pag) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  }
  if (pag.source !== "manual_mp") {
    return NextResponse.json({ error: "Pagamento não é manual_mp" }, { status: 400 });
  }
  if (pag.status !== "confirmado") {
    return NextResponse.json({ error: "Pagamento não está confirmado" }, { status: 400 });
  }

  // Verifica se já foi conciliado
  const [jaExiste] = await sql`
    SELECT id FROM alissonerp.fin_conciliacoes
    WHERE pagamento_venda_id = ${body.pagamento_id}
      AND tipo = 'manual_mp_confirmado'
    LIMIT 1
  `;
  if (jaExiste) {
    return NextResponse.json({ error: "Pagamento já conciliado" }, { status: 409 });
  }

  const [conciliacao] = await sql`
    INSERT INTO alissonerp.fin_conciliacoes
      (pagamento_venda_id, tipo, status, obs, created_by)
    VALUES (
      ${body.pagamento_id},
      'manual_mp_confirmado',
      'conciliado',
      ${body.obs ?? null},
      ${user.id}::uuid
    )
    RETURNING id, created_at
  `;

  return NextResponse.json({ ok: true, conciliacao_id: conciliacao.id }, { status: 201 });
}
