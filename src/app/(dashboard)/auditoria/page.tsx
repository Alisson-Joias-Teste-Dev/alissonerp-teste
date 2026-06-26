import sql from "@/lib/db";
import AuditoriaClient from "./AuditoriaClient";

export const dynamic = 'force-dynamic';

export default async function AuditoriaPage() {
  const [dashboards, auditorias] = await Promise.all([
    // Array com uma linha por tipo_auditoria (loja | fabrica)
    sql`SELECT * FROM alissonerp.vw_dashboard_auditoria ORDER BY tipo_auditoria`,
    sql`
      SELECT
        id,
        situacao,
        situacao_label,
        tipo_auditoria,
        tipo_auditoria_label,
        rota_processo,
        ordem_id,
        numero_ordem,
        numero_pedido,
        tipo_ordem,
        rota_ordem,
        ourives_nome,
        peso_negociado,
        peso_final,
        pmc,
        quebra,
        quebra_percentual,
        total_metal,
        retorno_metal,
        metal_externo,
        ficha_tecnica_obs,
        dados_ordem,
        responsavel_id,
        responsavel_nome,
        parecer,
        motivo_reprovacao,
        tipo_retrabalho,
        ordem_retrabalho_id,
        ordem_retrabalho_numero,
        cliente_nome,
        vendedor_nome,
        diff_peso_pct,
        created_at,
        data_conclusao,
        dias_analise,
        data_entrega,
        peso_metal_externo,
        detalhes_ordem
      FROM alissonerp.vw_auditorias_completa
      ORDER BY id DESC
      LIMIT 500
    `,
  ]);

  return (
    <AuditoriaClient
      dashboards={dashboards as any[]}
      auditorias={auditorias as any[]}
    />
  );
}
