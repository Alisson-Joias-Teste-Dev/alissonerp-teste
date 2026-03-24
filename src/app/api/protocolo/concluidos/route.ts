import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/protocolo/concluidos?direcao=ida|volta
export async function GET(req: NextRequest) {
  const direcao = req.nextUrl.searchParams.get("direcao");

  const rows = await sql`
    SELECT
      p.id                              AS protocolo_id,
      p.direcao::text,
      p.created_at                      AS protocolo_criado,
      p.data_conclusao,
      p.foto_criacao,
      p.foto_conclusao,
      -- nome de quem criou
      m.nome                            AS criado_por_nome,
      -- nome de quem concluiu
      r.nome                            AS concluido_por_nome,
      -- ordens como array JSON
      COALESCE(
        json_agg(
          json_build_object(
            'ordem_id',      o.id,
            'numero_ordem',  o.numero_ordem,
            'tipo_ordem',    o.tipo_ordem::text,
            'peso_negociado', o.peso_metal_negociado,
            'cliente_nome',  c.nome
          ) ORDER BY o.numero_ordem
        ) FILTER (WHERE o.id IS NOT NULL),
        '[]'
      )                                 AS ordens
    FROM alissonerp.protocolos p
    LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
    LEFT JOIN alissonerp.ordens o           ON o.id = po.ordem_id
    LEFT JOIN public.contatos c             ON c.id_contato = o.cliente_id
    LEFT JOIN alissonerp.usuarios m        ON m.id = p.motoboy_id
    LEFT JOIN alissonerp.usuarios r        ON r.id = p.recebedor_id
    WHERE p.etapas = 'concluido'
      ${direcao ? sql`AND p.direcao::text = ${direcao}` : sql``}
    GROUP BY p.id, m.nome, r.nome
    ORDER BY p.data_conclusao DESC NULLS LAST
    LIMIT 100
  `;

  return NextResponse.json(rows);
}
