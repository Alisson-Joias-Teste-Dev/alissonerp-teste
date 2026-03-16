import sql from "@/lib/db";
import DistribuicaoClient from "@/components/DistribuicaoClient";

export const dynamic = 'force-dynamic';

export default async function DistribuicaoPage() {
  const dists = await sql`
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

  return <DistribuicaoClient dists={dists as any[]} />;
}
