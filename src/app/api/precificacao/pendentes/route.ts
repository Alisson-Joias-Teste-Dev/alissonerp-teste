/**
 * GET /api/precificacao/pendentes
 * Retorna alterações de markup:
 *   - pendentes: aguardando aprovação
 *   - historico: aprovadas e rejeitadas (últimas 30)
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const todas = await sql<{
      id: number;
      tipo: string;
      faixa_id: number;
      faixa_nome: string;
      markup_anterior: string;
      markup_novo: string;
      produtos_afetados: number;
      variacao_media: string;
      variacao_min: string;
      variacao_max: string;
      simulacao_json: unknown;
      status: string;
      criado_por: string;
      data_criacao: string;
      criado_por_nome: string | null;
      aprovado_por: string | null;
      aprovado_por_nome: string | null;
      data_aprovacao: string | null;
      motivo_rejeicao: string | null;
    }[]>`
      SELECT
        ma.id,
        ma.tipo,
        ma.faixa_id,
        ma.faixa_nome,
        ma.markup_anterior,
        ma.markup_novo,
        ma.produtos_afetados,
        ma.variacao_media,
        ma.variacao_min,
        ma.variacao_max,
        ma.simulacao_json,
        ma.status,
        ma.criado_por::text,
        ma.data_criacao,
        up1.name AS criado_por_nome,
        ma.aprovado_por::text,
        up2.name AS aprovado_por_nome,
        ma.data_aprovacao,
        ma.motivo_rejeicao
      FROM alissonerp.markup_alteracoes ma
      LEFT JOIN public.user_profiles up1 ON up1.id_user = ma.criado_por
      LEFT JOIN public.user_profiles up2 ON up2.id_user = ma.aprovado_por
      ORDER BY ma.data_criacao DESC
      LIMIT 50
    `;

    const pendentes = todas.filter((a) => a.status === "pendente");
    const historico = todas.filter((a) => a.status !== "pendente");

    return NextResponse.json({
      pendentes,
      historico,
      total: pendentes.length,
    });
  } catch (err) {
    console.error("[GET /api/precificacao/pendentes]", err);
    return NextResponse.json({ error: "Erro ao buscar alterações" }, { status: 500 });
  }
}
