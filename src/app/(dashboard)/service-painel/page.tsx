import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isFullAccess, ROLES_SERVICE_PANEL } from "@/lib/roles";
import ServicePainelClient from "@/components/service/ServicePainelClient";

export const dynamic = "force-dynamic";

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

export default async function ServicePainelPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) redirect("/login");

  const hasAccess =
    isFullAccess(caller.role as string) ||
    ROLES_SERVICE_PANEL.includes(caller.role as typeof ROLES_SERVICE_PANEL[number]);
  if (!hasAccess) redirect("/");

  const [statsRows, operadoresRows, ativosRows, historicoRows, consumoRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'em_servico')::int                                       AS em_servico,
        COUNT(*) FILTER (WHERE status = 'aguardando')::int                                       AS aguardando,
        COUNT(*) FILTER (WHERE status = 'concluido' AND concluido_em::date = CURRENT_DATE)::int  AS concluidos_hoje,
        COUNT(*) FILTER (WHERE status = 'reprovado')::int                                        AS reprovados
      FROM alissonerp.servicos
    `,

    sql`
      SELECT d.id    AS deposito_id,
             d.nome  AS operador,
             COALESCE(vs.saldo, 0) AS saldo_solda
      FROM alissonerp.depositos d
      JOIN alissonerp.usuarios u ON u.deposito_id = d.id
      LEFT JOIN alissonerp.vw_saldo_estoque vs
             ON vs.deposito_id = d.id AND vs.insumo_id = 1
      WHERE u.is_operador_service = true
      ORDER BY d.nome
    `,

    sql`
      SELECT s.id, s.ordem_id, s.operador_id, s.tentativa,
             s.peso_entrada, s.peso_saida, s.usou_solda, s.consumo_solda,
             s.colocou_pedra, s.pedras_colocadas, s.status,
             s.foto_recebimento, s.foto_conclusao, s.foto_fio_solda,
             s.recebido_em, s.concluido_em, s.created_at,
             o.numero_ordem, o.tipo_ordem::text AS tipo_ordem,
             o.detalhes_ordem, o.foto_peca_servico,
             o.peso_peca_servico,
             c.nome AS cliente_nome,
             d.nome AS operador_nome,
             u.nome AS concluido_por_nome
      FROM alissonerp.servicos s
      JOIN alissonerp.ordens o ON o.id = s.ordem_id
      LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
      LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
      LEFT JOIN alissonerp.usuarios u ON u.id = s.concluido_por::uuid
      WHERE s.status IN ('em_servico', 'aguardando')
      ORDER BY s.created_at ASC
    `,

    sql`
      SELECT s.id, s.ordem_id, s.operador_id, s.tentativa,
             s.peso_entrada, s.peso_saida, s.usou_solda, s.consumo_solda,
             s.colocou_pedra, s.pedras_colocadas, s.status,
             s.foto_recebimento, s.foto_conclusao, s.foto_fio_solda,
             s.recebido_em, s.concluido_em, s.created_at,
             o.numero_ordem, o.tipo_ordem::text AS tipo_ordem,
             o.detalhes_ordem, o.foto_peca_servico,
             o.peso_peca_servico,
             c.nome AS cliente_nome,
             d.nome AS operador_nome,
             u.nome AS concluido_por_nome
      FROM alissonerp.servicos s
      JOIN alissonerp.ordens o ON o.id = s.ordem_id
      LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
      LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
      LEFT JOIN alissonerp.usuarios u ON u.id = s.concluido_por::uuid
      WHERE s.status IN ('concluido', 'reprovado')
        AND s.concluido_em >= NOW() - INTERVAL '30 days'
      ORDER BY s.concluido_em DESC
    `,

    sql`
      SELECT date_trunc('week', s.concluido_em)::text AS semana,
             d.nome                                   AS operador,
             ROUND(SUM(s.consumo_solda)::numeric, 4)  AS consumo_total,
             COUNT(*)::int                            AS qtd_servicos
      FROM alissonerp.servicos s
      JOIN alissonerp.depositos d ON d.id = s.operador_id
      WHERE s.usou_solda = true
        AND s.status = 'concluido'
        AND s.concluido_em >= NOW() - INTERVAL '12 weeks'
      GROUP BY semana, d.nome
      ORDER BY semana, d.nome
    `,
  ]);

  const stats = {
    em_servico:     (statsRows[0]?.em_servico     as number) ?? 0,
    aguardando:     (statsRows[0]?.aguardando     as number) ?? 0,
    concluidos_hoje:(statsRows[0]?.concluidos_hoje as number) ?? 0,
    reprovados:     (statsRows[0]?.reprovados     as number) ?? 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normServico = (r: any) => ({
    ...r,
    peso_entrada:     parseNum(r.peso_entrada),
    peso_saida:       parseNum(r.peso_saida),
    peso_peca_servico:parseNum(r.peso_peca_servico),
    consumo_solda:    parseNum(r.consumo_solda),
    pedras_colocadas: Array.isArray(r.pedras_colocadas) ? r.pedras_colocadas : [],
    recebido_em:      r.recebido_em  ? new Date(r.recebido_em as string).toISOString()  : null,
    concluido_em:     r.concluido_em ? new Date(r.concluido_em as string).toISOString() : null,
    created_at:       r.created_at   ? new Date(r.created_at  as string).toISOString()  : null,
  });

  return (
    <ServicePainelClient
      stats={stats}
      operadores={operadoresRows.map(r => ({
        deposito_id: r.deposito_id as number,
        operador:    String(r.operador),
        saldo_solda: parseNum(r.saldo_solda) ?? 0,
      }))}
      ativos={ativosRows.map(normServico)}
      historico={historicoRows.map(normServico)}
      consumoSolda={consumoRows.map(r => ({
        semana:        String(r.semana),
        operador:      String(r.operador),
        consumo_total: parseNum(r.consumo_total) ?? 0,
        qtd_servicos:  (r.qtd_servicos as number) ?? 0,
      }))}
    />
  );
}
