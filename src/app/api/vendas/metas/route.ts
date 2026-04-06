import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/metas?mes=&ano=&vendedor_id= ─────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mes        = searchParams.get("mes");
  const ano        = searchParams.get("ano");
  const vendedorId = searchParams.get("vendedor_id");

  const metas = await sql`
    SELECT
      m.id,
      m.vendedor_id,
      v.nome AS vendedor_nome,
      m.mes,
      m.ano,
      m.meta_valor,
      m.meta_quantidade,
      m.created_at
    FROM alissonerp.metas_vendedoras m
    LEFT JOIN public.vendedores v ON v.id_vendedor = m.vendedor_id
    WHERE 1=1
      ${mes        ? sql`AND m.mes         = ${Number(mes)}`        : sql``}
      ${ano        ? sql`AND m.ano         = ${Number(ano)}`        : sql``}
      ${vendedorId ? sql`AND m.vendedor_id = ${Number(vendedorId)}` : sql``}
    ORDER BY m.ano DESC, m.mes DESC, v.nome
  `;

  return NextResponse.json(
    metas.map((m) => ({
      ...m,
      meta_valor:      Number(m.meta_valor),
      meta_quantidade: m.meta_quantidade != null ? Number(m.meta_quantidade) : null,
    }))
  );
}

// ─── POST /api/vendas/metas ───────────────────────────────────────────────────
// Cria ou atualiza meta de um vendedor (upsert por vendedor_id + mes + ano)
// Body: { vendedor_id, mes, ano, meta_valor, meta_quantidade? }
// Apenas gerente+
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_GERENCIAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!PODE_GERENCIAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas gerentes podem definir metas" }, { status: 403 });
  }

  const body = await req.json() as {
    vendedor_id:    number;
    mes:            number;
    ano:            number;
    meta_valor:     number;
    meta_quantidade?: number | null;
  };

  if (!body.vendedor_id || !body.mes || !body.ano || !body.meta_valor) {
    return NextResponse.json({ error: "vendedor_id, mes, ano e meta_valor obrigatórios" }, { status: 400 });
  }
  if (body.mes < 1 || body.mes > 12) {
    return NextResponse.json({ error: "Mês inválido (1-12)" }, { status: 400 });
  }
  if (body.meta_valor <= 0) {
    return NextResponse.json({ error: "meta_valor deve ser positivo" }, { status: 400 });
  }

  const [meta] = await sql`
    INSERT INTO alissonerp.metas_vendedoras (
      vendedor_id, mes, ano, meta_valor, meta_quantidade, created_by
    ) VALUES (
      ${body.vendedor_id},
      ${body.mes},
      ${body.ano},
      ${body.meta_valor},
      ${body.meta_quantidade ?? null},
      ${user.id}::uuid
    )
    ON CONFLICT (vendedor_id, mes, ano) DO UPDATE SET
      meta_valor      = EXCLUDED.meta_valor,
      meta_quantidade = EXCLUDED.meta_quantidade
    RETURNING id
  `;

  return NextResponse.json({ id: meta.id }, { status: 201 });
}
