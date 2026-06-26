/**
 * GET /api/rota-fabricacao
 *
 * Estrutura do kanban da Rota de Fabricação. Retorna:
 *   • setores  — setores ativos (cada um com requer_peso e operadores responsáveis)
 *   • ofs      — OFs (PCPs) com a MESMA shape do vw_pcp_erp usado pelo
 *                kanban PCP, enriquecida com:
 *                  - setor_id_rota / setor_nome_rota → setor derivado da rota
 *                    (produto_rota[rota_etapa_atual]) ≠ pcp.setor_id (operador)
 *                  - rota_etapa_atual
 *                  - operador_atribuido_id / operador_atribuido_nome
 *                  - eh_reposicao (auto-OF de estoque mínimo)
 *
 *   Observação: o KanbanCard agrupa pelo *setor_id_rota* — pra usar no kanban
 *   de Rota de Fabricação, sobrescrevemos pcp.setor_id com setor_id_rota.
 *
 * Query params:
 *   status=ativas (default) | concluidas | canceladas | todas
 *     - ativas      → etapas_cod NOT IN ('concluido','cancelado')
 *     - concluidas  → etapas_cod = 'concluido' (últimos 30 dias)
 *     - canceladas  → etapas_cod = 'cancelado' (últimos 30 dias)
 *     - todas       → sem filtro de etapa (últimos 30 dias pra finalizadas)
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const JANELA_FINALIZADAS_DIAS = 30;

type StatusFiltro = "ativas" | "concluidas" | "canceladas" | "todas";

interface SetorRow {
  id: number;
  nome: string;
  requer_peso: boolean;
  ordem: number;
  operadores: { deposito_id: number; deposito_nome: string }[];
}

// Roles que veem TUDO (sem filtro por depósito). Outros roles (ex: ourives)
// só veem PCPs do depósito ao qual estão vinculados.
const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Filtro por depósito: leitor que NÃO é gerente/admin só vê PCPs do próprio dep.
  const [usuario] = await sql`
    SELECT role::text AS role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const userRole = (usuario?.role as string | null) ?? null;
  const userDepositoId = (usuario?.deposito_id as number | null) ?? null;
  const filtraPorDeposito = userRole && !ROLES_VE_TUDO.includes(userRole) && userDepositoId != null;

  // Status filter — default 'ativas' (igual o comportamento anterior)
  const statusRaw = req.nextUrl.searchParams.get("status") ?? "ativas";
  const status: StatusFiltro = (["ativas", "concluidas", "canceladas", "todas"] as const)
    .includes(statusRaw as StatusFiltro) ? (statusRaw as StatusFiltro) : "ativas";

  try {
    // 1. Setores ativos + colaboradores responsáveis
    const setoresRows = await sql`
      SELECT
        s.id, s.nome, s.requer_peso, s.ordem,
        COALESCE(
          (
            SELECT json_agg(json_build_object('deposito_id', d.id, 'deposito_nome', d.nome) ORDER BY d.nome)
            FROM alissonerp.setor_operadores so
            JOIN alissonerp.depositos d ON d.id = so.deposito_id
            WHERE so.setor_id = s.id
          ),
          '[]'::json
        ) AS operadores
      FROM alissonerp.setores s
      WHERE s.ativo = true
      ORDER BY s.ordem ASC, s.nome ASC
    `;

    const setores: SetorRow[] = setoresRows.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome),
      requer_peso: Boolean(r.requer_peso),
      ordem: Number(r.ordem ?? 999),
      operadores: Array.isArray(r.operadores) ? r.operadores : [],
    }));

    // 2. OFs ativas — mesma shape do vw_pcp_erp + campos da rota.
    //    Só etapas ativas (sem concluido/cancelado) e exclui OFs que já
    //    foram pra service (mesmo filtro do kanban PCP).
    const ofsRows = await sql`
      SELECT
        v.id, v.ordem_id, v.etapas, v.etapas_cod, v.numero_ordem,
        v.cliente_nome, v.vendedor_nome, v.setor_nome,
        o.vendedor_id,
        v.peso_final, v.total_metal, v.data_conclusao,
        v.created_at, v.deposito_id,
        v.deposito_nome, v.total_apontamentos,
        COALESCE(o.eh_teste, false) AS eh_teste,
        o.peso_metal_externo,
        o.tipo_ordem::text AS tipo_ordem,
        o.data_entrega,
        o.created_at AS ordem_created_at,
        EXISTS (
          SELECT 1 FROM alissonerp.servicos s2
          WHERE s2.pcp_id = v.id
            AND s2.status IN ('em_servico', 'aguardando')
            AND s2.transferencia_service_id IS NOT NULL
        ) AS na_service,
        -- Setor derivado da rota (≠ v.setor_id, que é o setor do operador atribuído)
        pr.setor_id AS setor_id_rota,
        sr.nome     AS setor_nome_rota,
        pcp.rota_etapa_atual,
        pcp.operador_atribuido_id,
        dop.nome    AS operador_atribuido_nome,
        (o.produto_reposicao_id IS NOT NULL) AS eh_reposicao,
        COALESCE(o.produto_reposicao_id, io.produto_id) AS produto_id,
        prod.nome AS produto_nome
      FROM alissonerp.vw_pcp_erp v
      JOIN alissonerp.pcp pcp ON pcp.id = v.id
      JOIN alissonerp.ordens o ON o.id = v.ordem_id
      LEFT JOIN LATERAL (
        SELECT produto_id FROM alissonerp.itens_ordem
        WHERE ordem_id = o.id ORDER BY id ASC LIMIT 1
      ) io ON true
      LEFT JOIN alissonerp.produto_rota pr
        ON pr.produto_id = COALESCE(o.produto_reposicao_id, io.produto_id)
        AND pr.ordem = COALESCE(pcp.rota_etapa_atual, 1)
      LEFT JOIN alissonerp.setores sr ON sr.id = pr.setor_id
      LEFT JOIN alissonerp.depositos dop ON dop.id = pcp.operador_atribuido_id
      LEFT JOIN alissonerp.produtos_compat prod ON prod.id_produto = COALESCE(o.produto_reposicao_id, io.produto_id)
      WHERE
        -- Filtro por STATUS:
        -- ativas: ativas (nada concluido/cancelado)
        -- concluidas: só etapas_cod='concluido' (últimos N dias)
        -- canceladas: só etapas_cod='cancelado' (últimos N dias)
        -- todas: sem restrição de etapa, mas finalizadas só dos últimos N dias
        (
          (${status}::text = 'ativas' AND v.etapas_cod NOT IN ('concluido', 'cancelado'))
          OR (${status}::text = 'concluidas' AND v.etapas_cod = 'concluido'
              AND v.data_conclusao >= NOW() - (${JANELA_FINALIZADAS_DIAS} || ' days')::interval)
          OR (${status}::text = 'canceladas' AND v.etapas_cod = 'cancelado'
              AND v.data_conclusao >= NOW() - (${JANELA_FINALIZADAS_DIAS} || ' days')::interval)
          OR (${status}::text = 'todas' AND (
              v.etapas_cod NOT IN ('concluido', 'cancelado')
              OR v.data_conclusao >= NOW() - (${JANELA_FINALIZADAS_DIAS} || ' days')::interval
          ))
        )
        -- Exclui OFs em service SOMENTE quando status=ativas. Pra histórico
        -- (concluidas/canceladas/todas) mostrar tudo, mesmo se a OF passou
        -- por service em algum momento — afinal a fabricação terminou.
        AND (
          ${status}::text <> 'ativas'
          OR (
            NOT EXISTS (
              SELECT 1 FROM alissonerp.servicos s3
              WHERE s3.pcp_id = v.id
                AND s3.status IN ('em_servico', 'aguardando', 'concluido')
            )
            AND NOT EXISTS (
              SELECT 1 FROM alissonerp.transferencias_ordem t
              WHERE t.pcp_id = v.id
                AND t.tipo_transferencia = 'service'
            )
          )
        )
        AND (
          ${!filtraPorDeposito}::boolean
          OR pcp.deposito_id = ${userDepositoId}
          OR pcp.operador_atribuido_id = ${userDepositoId}
        )
      ORDER BY v.id DESC
      LIMIT 500
    `;

    return NextResponse.json({ setores, ofs: ofsRows });
  } catch (err) {
    console.error("[GET /api/rota-fabricacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
