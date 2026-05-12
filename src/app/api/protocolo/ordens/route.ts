import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/protocolo/ordens?direcao=ida|volta&tipo_protocolo=fabrica|service
export async function GET(req: NextRequest) {
  const direcao = req.nextUrl.searchParams.get("direcao");
  const tipoProtocolo = req.nextUrl.searchParams.get("tipo_protocolo");

  // Branch no JS: arrays de tipo ficam como literais SQL (sem parâmetros problemáticos)
  async function queryIda() {
    if (tipoProtocolo === "fabrica") {
      return sql`
        SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
        FROM alissonerp.vw_ordens_prontas_ida v
        JOIN alissonerp.ordens o ON o.id = v.id
        WHERE o.tipo_ordem::text = ANY(ARRAY['fabricacao','reposicao_venda','reposicao_loja','compra_fornecedor','garantia','conversao'])
        ORDER BY v.id DESC LIMIT 200
      `;
    }
    if (tipoProtocolo === "service") {
      return sql`
        SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
        FROM alissonerp.vw_ordens_prontas_ida v
        JOIN alissonerp.ordens o ON o.id = v.id
        WHERE o.tipo_ordem::text = ANY(ARRAY['servico_venda','garantia','servico_interno'])
        ORDER BY v.id DESC LIMIT 200
      `;
    }
    return sql`
      SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
      FROM alissonerp.vw_ordens_prontas_ida v
      JOIN alissonerp.ordens o ON o.id = v.id
      ORDER BY v.id DESC LIMIT 200
    `;
  }

  async function queryVolta() {
    if (tipoProtocolo === "fabrica") {
      return sql`
        SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
        FROM alissonerp.vw_ordens_prontas_volta v
        JOIN alissonerp.ordens o ON o.id = v.id
        WHERE o.tipo_ordem::text = ANY(ARRAY['fabricacao','reposicao_venda','reposicao_loja','compra_fornecedor','garantia'])
        ORDER BY v.id DESC LIMIT 200
      `;
    }
    if (tipoProtocolo === "service") {
      return sql`
        SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
        FROM alissonerp.vw_ordens_prontas_volta v
        JOIN alissonerp.ordens o ON o.id = v.id
        WHERE o.tipo_ordem::text = ANY(ARRAY['servico_venda','garantia','servico_interno'])
        ORDER BY v.id DESC LIMIT 200
      `;
    }
    return sql`
      SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
      FROM alissonerp.vw_ordens_prontas_volta v
      JOIN alissonerp.ordens o ON o.id = v.id
      ORDER BY v.id DESC LIMIT 200
    `;
  }

  if (direcao === "ida") return NextResponse.json(await queryIda());
  if (direcao === "volta") return NextResponse.json(await queryVolta());

  return NextResponse.json({ error: "direcao deve ser 'ida' ou 'volta'" }, { status: 400 });
}
