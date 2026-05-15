import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/distribuicao?etapas=em_andamento|concluido
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const etapas = req.nextUrl.searchParams.get("etapas");

  const rows = etapas
    ? await sql`
        SELECT
          d.id,
          d.etapas::text,
          d.setor::text,
          d.deposito_id,
          d.setor_id,
          d.created_at,
          d.total_metal,
          d.retorno_metal,
          d.pmc,
          d.quebra,
          d.porcentagem_de_quebra,
          d.peso_final,
          dep.nome  AS deposito_nome,
          s.nome    AS setor_nome,
          up.name   AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          COUNT(DISTINCT doo.id)::integer                                      AS total_ordens,
          COUNT(DISTINCT CASE WHEN fd.peso > 0 THEN fd.id END)::integer        AS ordens_concluidas
        FROM alissonerp.distribuicoes d
        LEFT JOIN alissonerp.depositos dep ON dep.id = d.deposito_id
        LEFT JOIN alissonerp.setores s     ON s.id  = d.setor_id
        LEFT JOIN public.user_profiles up  ON up.id_user = d.created_by
        LEFT JOIN alissonerp.distribuicao_ordens doo ON doo.distribuicao_id = d.id
        LEFT JOIN alissonerp.fechamentos_distribuicao fd ON fd.distribuicao_id = d.id
        WHERE d.etapas::text = ${etapas}
        GROUP BY d.id, dep.nome, s.nome, up.name, up.avatar_url
        ORDER BY d.id DESC
        LIMIT 100
      `
    : await sql`
        SELECT
          d.id,
          d.etapas::text,
          d.setor::text,
          d.deposito_id,
          d.setor_id,
          d.created_at,
          d.total_metal,
          d.retorno_metal,
          d.pmc,
          d.quebra,
          d.porcentagem_de_quebra,
          d.peso_final,
          dep.nome  AS deposito_nome,
          s.nome    AS setor_nome,
          up.name   AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          COUNT(DISTINCT doo.id)::integer                                      AS total_ordens,
          COUNT(DISTINCT CASE WHEN fd.peso > 0 THEN fd.id END)::integer        AS ordens_concluidas
        FROM alissonerp.distribuicoes d
        LEFT JOIN alissonerp.depositos dep ON dep.id = d.deposito_id
        LEFT JOIN alissonerp.setores s     ON s.id  = d.setor_id
        LEFT JOIN public.user_profiles up  ON up.id_user = d.created_by
        LEFT JOIN alissonerp.distribuicao_ordens doo ON doo.distribuicao_id = d.id
        LEFT JOIN alissonerp.fechamentos_distribuicao fd ON fd.distribuicao_id = d.id
        GROUP BY d.id, dep.nome, s.nome, up.name, up.avatar_url
        ORDER BY d.id DESC
        LIMIT 100
      `;

  return NextResponse.json(rows);
}

// POST /api/distribuicao — criar distribuição com ordens
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { deposito_id, setor_id, ordem_ids, user_id } = body as {
    deposito_id: number;
    setor_id?: number | null;
    ordem_ids: number[];
    user_id?: string | null;
  };

  // Auth obrigatória
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!deposito_id || !ordem_ids?.length) {
    return NextResponse.json(
      { error: "Depósito e ao menos uma ordem são obrigatórios" },
      { status: 400 },
    );
  }

  // Validar exclusividade: nenhuma ordem pode estar em outra distribuição ativa
  for (const ordens_id of ordem_ids) {
    const conflito = await sql`
      SELECT d.id
      FROM alissonerp.distribuicao_ordens doo
      JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
      WHERE doo.ordens_id = ${ordens_id}
        AND d.etapas = 'em_andamento'
      LIMIT 1
    `;
    if (conflito.length > 0) {
      return NextResponse.json(
        { error: `Ordem já está na distribuição #${(conflito[0] as { id: number }).id}. Uma ordem só pode estar em um lote por vez.` },
        { status: 400 },
      );
    }
  }

  // Criar distribuição
  const [dist] = await sql`
    INSERT INTO alissonerp.distribuicoes
      (deposito_id, setor_id, etapas,
       total_metal, retorno_metal,
       total_pedras_un, total_pedras_g,
       total_outros_pesos, total_geral_outros_pesos,
       created_by)
    VALUES
      (${deposito_id}, ${setor_id ?? null}, 'em_andamento',
       0, 0, 0, 0, 0, 0,
       ${user.id}::uuid)
    RETURNING id
  `;

  const distId = (dist as { id: number }).id;

  // Vincular ordens
  for (const ordens_id of ordem_ids) {
    await sql`
      INSERT INTO alissonerp.distribuicao_ordens (distribuicao_id, ordens_id)
      VALUES (${distId}, ${ordens_id})
      ON CONFLICT (distribuicao_id, ordens_id) DO NOTHING
    `;
  }

  // Definir depósito + mover PCP para "aguardando"
  for (const ordens_id of ordem_ids) {
    await sql`
      UPDATE alissonerp.pcp
      SET etapas     = 'aguardando',
          deposito_id = ${deposito_id},
          updated_at  = now()
      WHERE ordem_id = ${ordens_id}
        AND etapas NOT IN ('concluido', 'cancelado')
    `;
  }

  // Definir depósito e setor na ordem (local_atual + setor_atual)
  for (const ordens_id of ordem_ids) {
    await sql`
      UPDATE alissonerp.ordens
      SET local_atual  = ${deposito_id},
          setor_atual  = ${setor_id ?? null},
          updated_at   = now()
      WHERE id = ${ordens_id}
    `;
  }

  return NextResponse.json({ id: distId });
}
