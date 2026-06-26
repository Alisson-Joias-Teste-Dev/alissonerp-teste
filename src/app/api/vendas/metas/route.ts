import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const MetaPostSchema = z.object({
  vendedor_id: z.coerce.number().int().positive(),
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().positive(),
  meta_prata: z.coerce.number().optional(),
  meta_ouro: z.coerce.number().optional(),
  meta_diamante: z.coerce.number().optional(),
  horario_inicio: z.string().optional(),
  horas_por_dia: z.coerce.number().optional(),
  dias_nao_trabalhados: z.array(z.coerce.number().int()).optional(),
  meta_valor: z.coerce.number().optional(),
  meta_quantidade: z.coerce.number().nullable().optional(),
}).passthrough();

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
      m.id, m.vendedor_id, v.nome AS vendedor_nome,
      m.mes, m.ano,
      m.meta_valor, m.meta_quantidade,
      m.meta_prata, m.meta_ouro, m.meta_diamante,
      m.horario_inicio::text, m.horas_por_dia, m.dias_nao_trabalhados,
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
      meta_valor:      m.meta_valor != null ? Number(m.meta_valor) : null,
      meta_quantidade: m.meta_quantidade != null ? Number(m.meta_quantidade) : null,
      meta_prata:      m.meta_prata != null ? Number(m.meta_prata) : null,
      meta_ouro:       m.meta_ouro != null ? Number(m.meta_ouro) : null,
      meta_diamante:   m.meta_diamante != null ? Number(m.meta_diamante) : null,
      horas_por_dia:   Number(m.horas_por_dia ?? 8),
      horario_inicio:  m.horario_inicio ? String(m.horario_inicio).slice(0, 5) : "09:00",
      dias_nao_trabalhados: m.dias_nao_trabalhados ?? [],
    }))
  );
}

// ─── POST /api/vendas/metas ───────────────────────────────────────────────────
// Cria ou atualiza meta com tiers (Prata/Ouro/Diamante) + horário/dias
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_GERENCIAR = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja"];
  if (!PODE_GERENCIAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas gerentes podem definir metas" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = MetaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const prata    = body.meta_prata ?? body.meta_valor ?? 0;
  const ouro     = body.meta_ouro ?? 0;
  const diamante = body.meta_diamante ?? 0;

  if (prata <= 0) {
    return NextResponse.json({ error: "Meta Prata deve ser positiva" }, { status: 400 });
  }
  if (ouro > 0 && ouro <= prata) {
    return NextResponse.json({ error: "Meta Ouro deve ser maior que Prata" }, { status: 400 });
  }
  if (diamante > 0 && diamante <= ouro) {
    return NextResponse.json({ error: "Meta Diamante deve ser maior que Ouro" }, { status: 400 });
  }

  const horarioInicio      = body.horario_inicio ?? "09:00";
  const horasPorDia        = body.horas_por_dia ?? 8;
  const diasNaoTrabalhados = body.dias_nao_trabalhados ?? [];

  const [meta] = await sql`
    INSERT INTO alissonerp.metas_vendedoras (
      vendedor_id, mes, ano,
      meta_prata, meta_ouro, meta_diamante,
      meta_valor,
      horario_inicio, horas_por_dia, dias_nao_trabalhados,
      meta_quantidade, created_by
    ) VALUES (
      ${body.vendedor_id}, ${body.mes}, ${body.ano},
      ${prata}, ${ouro}, ${diamante},
      ${prata},
      ${horarioInicio}::time, ${horasPorDia}, ${sql.array(diasNaoTrabalhados, 23)},
      ${body.meta_quantidade ?? null},
      ${user.id}::uuid
    )
    ON CONFLICT (vendedor_id, mes, ano) DO UPDATE SET
      meta_prata            = EXCLUDED.meta_prata,
      meta_ouro             = EXCLUDED.meta_ouro,
      meta_diamante         = EXCLUDED.meta_diamante,
      meta_valor            = EXCLUDED.meta_prata,
      horario_inicio        = EXCLUDED.horario_inicio,
      horas_por_dia         = EXCLUDED.horas_por_dia,
      dias_nao_trabalhados  = EXCLUDED.dias_nao_trabalhados,
      meta_quantidade       = EXCLUDED.meta_quantidade
    RETURNING id
  `;

  return NextResponse.json({ id: meta.id }, { status: 201 });
}
