import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import type { RankingConsultora, TipoMeta } from "@/lib/types/dashboard-comercial";
import { safeDiv } from "@/lib/dashboard-comercial/utils";
import { internalError } from "@/lib/api-error";

// GET /api/dashboard-comercial/ranking?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna array ordenado de RankingConsultora (DESC por faturamento líquido).

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const [perm] = await sql`
    SELECT pode_ler FROM alissonerp.role_permissoes
    WHERE role = ${user.role} AND modulo = 'dashboard_comercial'
  `;
  if (!perm?.pode_ler) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? hoje.toISOString().slice(0, 10);

  try {
    // Vendas agregadas por consultora (legado + ERP), vale-troca pré-computado na view
    const vendas = await sql<
      Array<{
        vendedor_id: number;
        nome: string | null;
        foto: string | null;
        total_bruto: string;
        total_vale_troca: string;
        qtd: string;
      }>
    >`
      SELECT
        v.vendedor_id,
        vd.nome,
        vd.foto,
        SUM(v.total_venda)::text                AS total_bruto,
        SUM(v.valor_vale_troca)::text           AS total_vale_troca,
        COUNT(*)::text                          AS qtd
      FROM alissonerp.vw_dash_vendas_todas v
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = v.vendedor_id
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status = 2
        AND v.vendedor_id IS NOT NULL
      GROUP BY v.vendedor_id, vd.nome, vd.foto
    `;

    // Metas totais do período por consultora e tipo
    const metas = await sql<
      Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>
    >`
      SELECT
        consultora::text,
        tipo_meta,
        COALESCE(SUM(valor_meta), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora BETWEEN ${from}::timestamp AND (${to}::date + INTERVAL '1 day - 1 second')::timestamp
        AND valor_meta > 0
      GROUP BY consultora, tipo_meta
    `;

    const metasMap = new Map<number, { Prata: number; Ouro: number; Diamante: number }>();
    for (const m of metas) {
      const id = Number(m.consultora);
      if (!metasMap.has(id)) metasMap.set(id, { Prata: 0, Ouro: 0, Diamante: 0 });
      metasMap.get(id)![m.tipo_meta] = Number(m.total);
    }

    const ranking: RankingConsultora[] = vendas
      .map((v) => {
        const totalBruto = Number(v.total_bruto);
        const totalVale = Number(v.total_vale_troca);
        const liquido = totalBruto - totalVale;
        const qtd = Number(v.qtd);
        const meta = metasMap.get(Number(v.vendedor_id)) ?? { Prata: 0, Ouro: 0, Diamante: 0 };
        const percPrata = safeDiv(liquido, meta.Prata) * 100;
        const percOuro = safeDiv(liquido, meta.Ouro) * 100;
        const percDiamante = safeDiv(liquido, meta.Diamante) * 100;
        const atingiuPrata = percPrata >= 100;
        const atingiuOuro = percOuro >= 100;
        const atingiuDiamante = percDiamante >= 100;
        let maior: TipoMeta | null = null;
        if (atingiuDiamante) maior = "Diamante";
        else if (atingiuOuro) maior = "Ouro";
        else if (atingiuPrata) maior = "Prata";

        return {
          posicao: 0, // preenchido após ordenação
          id_vendedor: Number(v.vendedor_id),
          nome: v.nome ?? "Não informada",
          foto: v.foto,
          total_vendas: totalBruto,
          valor_liquido: liquido,
          total_vale_troca: totalVale,
          quantidade_vendas: qtd,
          ticket_medio: safeDiv(liquido, qtd),
          meta_prata: meta.Prata,
          meta_ouro: meta.Ouro,
          meta_diamante: meta.Diamante,
          percentual_prata: percPrata,
          percentual_ouro: percOuro,
          percentual_diamante: percDiamante,
          atingiu_prata: atingiuPrata,
          atingiu_ouro: atingiuOuro,
          atingiu_diamante: atingiuDiamante,
          maior_meta_atingida: maior,
        } satisfies RankingConsultora;
      })
      .sort((a, b) => b.valor_liquido - a.valor_liquido)
      .map((r, i) => ({ ...r, posicao: i + 1 }));

    return NextResponse.json({ ranking });
  } catch (err) {
    return internalError("[GET /api/dashboard-comercial/ranking]", err);
  }
}
