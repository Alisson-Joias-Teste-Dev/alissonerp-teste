import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/distribuicao/[id] — detalhe com lista de ordens
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [dist] = await sql`
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
      dep.nome    AS deposito_nome,
      s.nome      AS setor_nome,
      up.name     AS criado_por_nome,
      up.avatar_url AS criado_por_foto
    FROM alissonerp.distribuicoes d
    LEFT JOIN alissonerp.depositos dep ON dep.id = d.deposito_id
    LEFT JOIN alissonerp.setores s     ON s.id  = d.setor_id
    LEFT JOIN public.user_profiles up  ON up.id_user = d.created_by
    WHERE d.id = ${distId}
  `;

  if (!dist) {
    return NextResponse.json({ error: "Distribuição não encontrada" }, { status: 404 });
  }

  const ordens = await sql`
    SELECT
      doo.id              AS doo_id,
      doo.ordens_id       AS ordem_id,
      o.numero_ordem,
      o.tipo_ordem::text,
      o.peso_metal_negociado,
      c.nome              AS cliente_nome,
      -- Saída por ordem (novos campos migration 051)
      doo.peso_bruto,
      doo.peso_pedras,
      doo.peso_ouro_real,
      doo.quebra,
      doo.ouro_entregue,
      doo.data_baixa,
      -- Saída sem peso (migration 077)
      doo.sem_peso,
      doo.justificativa_sem_peso,
      -- Fechamento (trigger result, para compatibilidade)
      fd.peso             AS peso_fechamento,
      fd.pmc              AS pmc_fechamento,
      fd.total_pedras_un  AS pedras_fechamento,
      fd.foto_balanca     AS foto_fechamento,
      -- Estorno (migration 081)
      ed.id               AS estorno_id,
      ed.motivo           AS estorno_motivo,
      ed.justificativa    AS estorno_justificativa,
      ed.created_at       AS estorno_em,
      up.name             AS estorno_por_nome
    FROM alissonerp.distribuicao_ordens doo
    JOIN alissonerp.ordens o ON o.id = doo.ordens_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN alissonerp.fechamentos_distribuicao fd
      ON fd.distribuicao_id = doo.distribuicao_id AND fd.ordem_id = doo.ordens_id
    -- Último estorno da ordem neste lote (data_baixa=NULL após estorno)
    LEFT JOIN LATERAL (
      SELECT id, motivo, justificativa, estornado_por, created_at
      FROM alissonerp.estornos_distribuicao
      WHERE distribuicao_id = ${distId} AND ordem_id = doo.ordens_id
      ORDER BY created_at DESC
      LIMIT 1
    ) ed ON true
    LEFT JOIN public.user_profiles up ON up.id_user = ed.estornado_por
    WHERE doo.distribuicao_id = ${distId}
    ORDER BY o.numero_ordem
  `;

  // Último estorno de lote inteiro (ordem_id IS NULL)
  const [loteEstorno] = await sql`
    SELECT e.motivo, e.justificativa, e.created_at,
           up.name AS estornado_por_nome
    FROM alissonerp.estornos_distribuicao e
    LEFT JOIN public.user_profiles up ON up.id_user = e.estornado_por
    WHERE e.distribuicao_id = ${distId} AND e.ordem_id IS NULL
    ORDER BY e.created_at DESC
    LIMIT 1
  `;

  return NextResponse.json({ dist, ordens, lote_estorno: loteEstorno ?? null });
}
