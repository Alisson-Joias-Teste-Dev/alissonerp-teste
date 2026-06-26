import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const LookupPostSchema = z.object({
  epcs: z.array(z.string()).min(1, "epcs obrigatório"),
}).passthrough();

function extrairIdApi(epc: string): number | null {
  if (!epc || epc.length < 13) return null;
  if (!/^\d{24}$/.test(epc)) return null;
  const id = parseInt(epc.slice(4, 13), 10);
  return isNaN(id) || id <= 0 ? null : id;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = LookupPostSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    const epcs = [...new Set(body.epcs.map(e => e.trim()).filter(Boolean))].slice(0, 500);

    // 1. Busca em joias_rfid (para tags AJ registradas)
    const rfidRows = await sql`
      SELECT j.epc, j.sku, j.nome, j.produto_id, p.nome AS produto_nome
      FROM alissonerp.joias_rfid j
      LEFT JOIN alissonerp.produtos_compat p ON p.id_produto = j.produto_id::bigint
      WHERE j.epc = ANY(${epcs}::text[])
    `;

    // 2. Para EPCs não encontrados, tenta extrair id_api_produto e buscar nos produtos
    const foundSet = new Set(rfidRows.map(r => r.epc as string));
    const idsApi: number[] = [];

    for (const epc of epcs) {
      if (!foundSet.has(epc)) {
        const idApi = extrairIdApi(epc);
        if (idApi) idsApi.push(idApi);
      }
    }

    let prodRows: Array<{ id_api_produto: number; id_produto: number; sku: string; nome: string }> = [];
    if (idsApi.length > 0) {
      prodRows = await sql`
        SELECT id_api_produto, id_produto, sku, nome
        FROM alissonerp.produtos_compat
        WHERE id_api_produto = ANY(${idsApi}::int[])
      `;
    }

    const prodByApi = new Map(prodRows.map(r => [Number(r.id_api_produto), r]));

    const resultados = epcs.map(epc => {
      const rfid = rfidRows.find(r => r.epc === epc);
      if (rfid) {
        return {
          epc,
          sku: rfid.sku as string | null,
          nome: rfid.nome as string | null,
          produto_nome: rfid.produto_nome as string | null,
          origem: "joias_rfid",
        };
      }

      const idApi = extrairIdApi(epc);
      if (idApi) {
        const prod = prodByApi.get(idApi);
        if (prod) {
          return {
            epc,
            sku: prod.sku,
            nome: prod.nome,
            produto_nome: prod.nome,
            id_produto: prod.id_produto,
            id_api_produto: idApi,
            origem: "id_api_produto",
          };
        }
        return {
          epc,
          sku: null,
          nome: null,
          produto_nome: null,
          id_api_produto: idApi,
          origem: "id_api_nao_encontrado",
        };
      }

      return {
        epc,
        sku: null,
        nome: null,
        produto_nome: null,
        origem: "desconhecido",
      };
    });

    return NextResponse.json({ resultados });
  } catch (err) {
    return internalError("[POST /api/rfid/lookup]", err);
  }
}
