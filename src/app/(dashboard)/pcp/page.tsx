import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import KanbanClient from "@/components/KanbanClient";

export const dynamic = 'force-dynamic';

// Roles que vêem TODOS os PCPs (sem filtro por depósito)
const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];

// Janela default para ordens concluídas no kanban (em dias).
// Concluídas mais antigas não aparecem por default — só via busca server-side
// (/api/pcp/buscar) que procura em todo o histórico.
const JANELA_CONCLUIDAS_DIAS = 30;

export default async function PcpPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let depositoIdFiltro: number | null = null;
  let userRole: string | null = null;

  if (user) {
    const [usuario] = await sql`
      SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = (usuario?.role as string | null) ?? null;
    if (userRole && !ROLES_VE_TUDO.includes(userRole) && usuario?.deposito_id != null) {
      depositoIdFiltro = usuario.deposito_id as number;
    }
  }

  // Filtro temporal: concluídas só dos últimos JANELA_CONCLUIDAS_DIAS dias.
  // Etapas ativas (novas_ordens, em_andamento, pendencia, aguardando, cancelado)
  // carregam sempre. Busca por ordem antiga usa /api/pcp/buscar.
  const pcps = depositoIdFiltro != null
    ? await sql`
        SELECT
          v.id, v.ordem_id, v.etapas, v.numero_ordem,
          v.cliente_nome, v.vendedor_nome, v.setor_nome,
          v.peso_final, v.total_metal, v.data_conclusao,
          v.created_at, v.deposito_id, v.setor_id,
          COALESCE(o.eh_teste, false) AS eh_teste,
          o.peso_metal_externo,
          o.tipo_ordem::text AS tipo_ordem,
          o.data_entrega,
          o.created_at AS ordem_created_at,
          EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando')
              AND s.transferencia_service_id IS NOT NULL
          ) AS na_service
        FROM alissonerp.vw_pcp_erp v
        LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
        WHERE v.deposito_id = ${depositoIdFiltro}
          AND NOT EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando', 'concluido')
          )
          AND NOT EXISTS (
            SELECT 1 FROM alissonerp.transferencias_ordem t
            WHERE t.pcp_id = v.id
              AND t.tipo_transferencia = 'service'
          )
          AND (
            v.etapas_cod <> 'concluido'
            OR v.data_conclusao >= NOW() - (${JANELA_CONCLUIDAS_DIAS} || ' days')::interval
          )
        ORDER BY v.id DESC
        LIMIT 300
      `
    : await sql`
        SELECT
          v.id, v.ordem_id, v.etapas, v.numero_ordem,
          v.cliente_nome, v.vendedor_nome, v.setor_nome,
          v.peso_final, v.total_metal, v.data_conclusao,
          v.created_at, v.deposito_id, v.setor_id,
          COALESCE(o.eh_teste, false) AS eh_teste,
          o.peso_metal_externo,
          o.tipo_ordem::text AS tipo_ordem,
          o.data_entrega,
          o.created_at AS ordem_created_at,
          EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando')
              AND s.transferencia_service_id IS NOT NULL
          ) AS na_service
        FROM alissonerp.vw_pcp_erp v
        LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
        WHERE NOT EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando', 'concluido')
          )
          AND NOT EXISTS (
            SELECT 1 FROM alissonerp.transferencias_ordem t
            WHERE t.pcp_id = v.id
              AND t.tipo_transferencia = 'service'
          )
          AND (
            v.etapas_cod <> 'concluido'
            OR v.data_conclusao >= NOW() - (${JANELA_CONCLUIDAS_DIAS} || ' days')::interval
          )
        ORDER BY v.id DESC
        LIMIT 300
      `;

  return <KanbanClient pcps={pcps} userRole={userRole} janelaConcluidasDias={JANELA_CONCLUIDAS_DIAS} />;
}
