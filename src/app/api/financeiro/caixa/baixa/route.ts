import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { podedarBaixaCaixa } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const BaixaPostSchema = z.object({
  obs: z.string().optional(),
}).passthrough();

// ─── GET /api/financeiro/caixa/baixa ─────────────────────────────────────────
// Retorna histórico de baixas + pagamentos pendentes de baixa
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Mesma checagem de role do POST — antes qualquer usuário autenticado
  // conseguia ver o histórico de baixas e pagamentos pendentes.
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !podedarBaixaCaixa(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [baixas, pendentes] = await Promise.all([
    sql`
      SELECT
        b.id, b.total, b.qtd_pagamentos,
        b.realizado_nome, b.obs,
        b.created_at::text AS created_at
      FROM alissonerp.fin_caixa_baixas b
      ORDER BY b.id DESC
      LIMIT 50
    `,
    sql`
      SELECT
        p.id, p.valor, p.data_confirmacao::text AS data_confirmacao,
        v.numero_venda, v.id AS venda_id,
        vend.nome AS vendedor_nome
      FROM alissonerp.pagamentos_venda p
      JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
      LEFT JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id
      WHERE p.forma = 'Dinheiro'
        AND p.status = 'confirmado'
        AND p.caixa_baixa_id IS NULL
      ORDER BY p.data_confirmacao ASC NULLS LAST, p.id ASC
    `,
  ]);

  return NextResponse.json({
    baixas: baixas.map(b => ({ ...b, total: Number(b.total) })),
    pendentes: pendentes.map(p => ({ ...p, valor: Number(p.valor) })),
    total_pendente: pendentes.reduce((s, p) => s + Number(p.valor), 0),
  });
}

// ─── POST /api/financeiro/caixa/baixa ────────────────────────────────────────
// Registra uma baixa de caixa (apenas roles autorizadas)
// Body: { obs? }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  if (!podedarBaixaCaixa(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para dar baixa no caixa" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = BaixaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { obs } = parsed.data;

  // Buscar pagamentos pendentes de baixa
  const pendentes = await sql`
    SELECT id, valor
    FROM alissonerp.pagamentos_venda
    WHERE forma = 'Dinheiro'
      AND status = 'confirmado'
      AND caixa_baixa_id IS NULL
  `;

  if (pendentes.length === 0) {
    return NextResponse.json({ error: "Nenhum pagamento pendente de baixa" }, { status: 400 });
  }

  const total = pendentes.reduce((s, p) => s + Number(p.valor), 0);
  const ids = pendentes.map(p => p.id);

  const baixa = await sql.begin(async (tx: any) => {
    const [nova] = await tx`
      INSERT INTO alissonerp.fin_caixa_baixas (total, qtd_pagamentos, realizado_por, realizado_nome, obs)
      VALUES (${total}, ${pendentes.length}, ${user.id}::uuid, ${usuario.nome ?? user.email}, ${obs ?? null})
      RETURNING id, total, qtd_pagamentos, realizado_nome, obs, created_at::text AS created_at
    `;

    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET caixa_baixa_id = ${nova.id}
      WHERE id = ANY(${ids}::int[])
    `;

    return nova;
  });

  return NextResponse.json({
    id: baixa.id,
    total: Number(baixa.total),
    qtd_pagamentos: baixa.qtd_pagamentos,
    realizado_nome: baixa.realizado_nome,
    created_at: baixa.created_at,
  }, { status: 201 });
}
