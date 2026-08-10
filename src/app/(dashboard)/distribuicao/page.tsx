import sql, { normalizeRow } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import DistribuicaoClient from "@/components/DistribuicaoClient";

export const dynamic = 'force-dynamic';

// Fase 3.6: colunas real → numeric — driver devolve como string, front usa .toFixed()/aritmética
const DIST_NUMERIC_FIELDS = ["total_metal", "retorno_metal", "pmc", "quebra", "porcentagem_de_quebra", "peso_final"];

export default async function DistribuicaoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let depositoIdFiltro: number | null = null;
  let semDeposito = false;
  let userRole: string | null = null;

  if (user) {
    const [usuario] = await sql`
      SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = (usuario?.role as string | null) ?? null;
    if (userRole === 'ourives') {
      if (usuario?.deposito_id != null) {
        depositoIdFiltro = usuario.deposito_id as number;
      } else {
        semDeposito = true;
      }
    }
  }

  // Se ourives sem depósito, retornar lista vazia
  if (semDeposito) {
    return <DistribuicaoClient dists={[]} semDeposito={true} userRole={userRole} />;
  }

  const dists = depositoIdFiltro != null
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
          dep.nome    AS deposito_nome,
          s.nome      AS setor_nome,
          up.name     AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          COUNT(DISTINCT doo.id)::integer                                   AS total_ordens,
          COUNT(DISTINCT CASE WHEN fd.peso > 0 THEN fd.id END)::integer     AS ordens_concluidas
        FROM alissonerp.distribuicoes d
        LEFT JOIN alissonerp.depositos dep ON dep.id = d.deposito_id
        LEFT JOIN alissonerp.setores s     ON s.id  = d.setor_id
        LEFT JOIN public.user_profiles up  ON up.id_user = d.created_by
        LEFT JOIN alissonerp.distribuicao_ordens doo ON doo.distribuicao_id = d.id
        LEFT JOIN alissonerp.fechamentos_distribuicao fd ON fd.distribuicao_id = d.id
        WHERE d.deposito_id = ${depositoIdFiltro}
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
          dep.nome    AS deposito_nome,
          s.nome      AS setor_nome,
          up.name     AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          COUNT(DISTINCT doo.id)::integer                                   AS total_ordens,
          COUNT(DISTINCT CASE WHEN fd.peso > 0 THEN fd.id END)::integer     AS ordens_concluidas
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

  const distsNormalizados = (dists as Record<string, unknown>[]).map((d) => normalizeRow(d, DIST_NUMERIC_FIELDS));

  return <DistribuicaoClient dists={distsNormalizados as any[]} semDeposito={false} userRole={userRole} />;
}
