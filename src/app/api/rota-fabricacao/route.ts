/**
 * GET /api/rota-fabricacao
 *
 * Retorna a estrutura de kanban da Rota de Fabricação:
 *   • Lista de setores ativos (cada um com requer_peso e operadores responsáveis)
 *   • OFs (PCPs) ativas agrupadas por setor — incluindo a coluna "Sem rota"
 *     pra OFs sem setor cadastrado
 *
 * OFs ativas = etapas NOT IN ('concluido', 'cancelado').
 */

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface SetorRow {
  id: number;
  nome: string;
  requer_peso: boolean;
  operadores: { deposito_id: number; deposito_nome: string }[];
}

interface OFRow {
  pcp_id: number;
  ordem_id: number;
  numero_ordem: string | null;
  cliente_nome: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  peso_negociado: number | null;
  setor_id: number | null;
  setor_nome: string | null;
  rota_etapa_atual: number | null;
  operador_atribuido_id: number | null;
  operador_atribuido_nome: string | null;
  eh_reposicao: boolean;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    // 1. Setores ativos + colaboradores responsáveis (agregados em JSON)
    const setoresRows = await sql`
      SELECT
        s.id, s.nome, s.requer_peso,
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
      ORDER BY s.nome ASC
    `;

    const setores: SetorRow[] = setoresRows.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome),
      requer_peso: Boolean(r.requer_peso),
      operadores: Array.isArray(r.operadores) ? r.operadores : [],
    }));

    // 2. OFs ativas no PCP. O setor da OF é derivado de produto_rota:
    //    produto_id = ordens.produto_reposicao_id (auto-OF) ou itens_ordem.produto_id (OF normal)
    //    ordem      = pcp.rota_etapa_atual (1-indexed, default 1)
    //    Sem rota cadastrada → setor_id NULL → coluna "Sem rota"
    const ofsRows = await sql`
      SELECT
        pcp.id AS pcp_id,
        pcp.ordem_id,
        o.numero_ordem,
        cli.nome AS cliente_nome,
        COALESCE(p.nome, io.nome_produto) AS produto_nome,
        p.sku AS produto_sku,
        o.peso_metal_negociado AS peso_negociado,
        pr.setor_id,
        s.nome AS setor_nome,
        pcp.rota_etapa_atual,
        pcp.operador_atribuido_id,
        d.nome AS operador_atribuido_nome,
        (o.produto_reposicao_id IS NOT NULL) AS eh_reposicao
      FROM alissonerp.pcp pcp
      JOIN alissonerp.ordens o ON o.id = pcp.ordem_id
      LEFT JOIN public.contatos cli ON cli.id_contato = o.cliente_id
      LEFT JOIN LATERAL (
        SELECT produto_id, nome_produto FROM alissonerp.itens_ordem
        WHERE ordem_id = o.id ORDER BY id ASC LIMIT 1
      ) io ON true
      LEFT JOIN public.produtos p
        ON p.id_produto = COALESCE(o.produto_reposicao_id, io.produto_id)
      LEFT JOIN alissonerp.produto_rota pr
        ON pr.produto_id = COALESCE(o.produto_reposicao_id, io.produto_id)
        AND pr.ordem = COALESCE(pcp.rota_etapa_atual, 1)
      LEFT JOIN alissonerp.setores s ON s.id = pr.setor_id
      LEFT JOIN alissonerp.depositos d ON d.id = pcp.operador_atribuido_id
      WHERE pcp.etapas::text NOT IN ('concluido', 'cancelado')
      ORDER BY pcp.id DESC
    `;

    const ofs: OFRow[] = ofsRows.map((r) => ({
      pcp_id: Number(r.pcp_id),
      ordem_id: Number(r.ordem_id),
      numero_ordem: r.numero_ordem != null ? String(r.numero_ordem) : null,
      cliente_nome: r.cliente_nome != null ? String(r.cliente_nome) : null,
      produto_nome: r.produto_nome != null ? String(r.produto_nome) : null,
      produto_sku: r.produto_sku != null ? String(r.produto_sku) : null,
      peso_negociado: r.peso_negociado != null ? Number(r.peso_negociado) : null,
      setor_id: r.setor_id != null ? Number(r.setor_id) : null,
      setor_nome: r.setor_nome != null ? String(r.setor_nome) : null,
      rota_etapa_atual: r.rota_etapa_atual != null ? Number(r.rota_etapa_atual) : null,
      operador_atribuido_id: r.operador_atribuido_id != null ? Number(r.operador_atribuido_id) : null,
      operador_atribuido_nome: r.operador_atribuido_nome != null ? String(r.operador_atribuido_nome) : null,
      eh_reposicao: Boolean(r.eh_reposicao),
    }));

    return NextResponse.json({ setores, ofs });
  } catch (err) {
    console.error("[GET /api/rota-fabricacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
