import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { RfidLookupSchema } from "@/lib/rfid/tipos";
import {
  validateEpc,
  isEpcERP,
  isEpcLegado,
  extrairIdProduto,
} from "@/lib/rfid/epc";

/**
 * POST /api/rfid/lookup
 *
 * Resolve uma lista de EPCs para produtos, seguindo a ordem de resolução
 * do Plano B.2:
 *
 *   1. Casamento exato em alissonerp.joias_rfid (fonte da verdade)
 *   2. Prefixo ERP (1001) → id_produto → public.produtos
 *   3. Prefixo legado/externo (0000) → id_api_produto → alissonerp.produtos_compat
 *   4. Não identificado → "desconhecido"
 *
 * Body: { epcs: string[] }  — validado com RfidLookupSchema
 * Response: { resultados: Array<ResultadoLookup> }
 */

interface ResultadoLookup {
  epc: string;
  sku: string | null;
  nome: string | null;
  produto_nome: string | null;
  origem: "joias_rfid" | "id_produto" | "id_api_produto" | "id_api_nao_encontrado" | "desconhecido";
  id_produto?: number;
  id_api_produto?: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = RfidLookupSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    const epcs = [...new Set(body.epcs.map((e) => e.trim()).filter(Boolean))].slice(0, 500);

    // ── Step 1: Exact match in joias_rfid (fonte da verdade) ────────────────
    const rfidRows = await sql`
      SELECT j.epc, j.sku, j.nome, j.produto_id, p.nome AS produto_nome
      FROM alissonerp.joias_rfid j
      LEFT JOIN alissonerp.produtos_compat p ON p.id_produto = j.produto_id::bigint
      WHERE j.epc = ANY(${epcs}::text[])
    `;

    const rfidMap = new Map(rfidRows.map((r) => [r.epc as string, r]));
    const foundSet = new Set(rfidRows.map((r) => r.epc as string));
    const unmatched = epcs.filter((e) => !foundSet.has(e));

    // ── Step 2: ERP EPCs (prefixo 1001) → id_produto → public.produtos ─────
    const erpEpcs = unmatched.filter((e) => isEpcERP(e));
    const erpIdMap = new Map<string, number>();
    for (const e of erpEpcs) {
      const id = extrairIdProduto(e);
      if (id !== null) erpIdMap.set(e, id);
    }
    const erpIds = [...new Set(erpIdMap.values())];

    let erpProdMap = new Map<
      number,
      { id_produto: number; sku: string; nome: string }
    >();
    if (erpIds.length > 0) {
      const rows = await sql`
        SELECT id_produto, sku, nome
        FROM public.produtos
        WHERE id_produto = ANY(${erpIds}::int[])
      `;
      for (const r of rows) {
        const id = Number(r.id_produto);
        erpProdMap.set(id, {
          id_produto: id,
          sku: (r.sku as string) ?? "",
          nome: (r.nome as string) ?? "",
        });
      }
    }

    // ── Step 3: Legacy EPCs (prefixo 0000) → id_api_produto → produtos_compat
    const legadoEpcs = unmatched.filter((e) => isEpcLegado(e));
    const legadoIdMap = new Map<string, number>();
    for (const e of legadoEpcs) {
      const id = extrairIdProduto(e);
      if (id !== null) legadoIdMap.set(e, id);
    }
    const legadoIds = [...new Set(legadoIdMap.values())];

    let legadoProdMap = new Map<
      number,
      { id_produto: number; sku: string; nome: string }
    >();
    if (legadoIds.length > 0) {
      const rows = await sql`
        SELECT id_api_produto, id_produto, sku, nome
        FROM alissonerp.produtos_compat
        WHERE id_api_produto = ANY(${legadoIds}::int[])
      `;
      for (const r of rows) {
        const apiId = Number(r.id_api_produto);
        legadoProdMap.set(apiId, {
          id_produto: Number(r.id_produto),
          sku: (r.sku as string) ?? "",
          nome: (r.nome as string) ?? "",
        });
      }
    }

    // ── Build results in the original epcs order ────────────────────────────
    const resultados: ResultadoLookup[] = epcs.map((epc) => {
      // Step 1: joias_rfid exact match
      const rfid = rfidMap.get(epc);
      if (rfid) {
        return {
          epc,
          sku: (rfid.sku as string) ?? null,
          nome: (rfid.nome as string) ?? null,
          produto_nome: (rfid.produto_nome as string) ?? null,
          origem: "joias_rfid",
        };
      }

      // Step 2: ERP EPC → id_produto → public.produtos
      if (isEpcERP(epc)) {
        const idProduto = erpIdMap.get(epc);
        if (idProduto !== undefined) {
          const prod = erpProdMap.get(idProduto);
          if (prod) {
            return {
              epc,
              sku: prod.sku,
              nome: prod.nome,
              produto_nome: prod.nome,
              id_produto: prod.id_produto,
              origem: "id_produto",
            };
          }
          // ERP EPC decoded but product not found in public.produtos
          return {
            epc,
            sku: null,
            nome: null,
            produto_nome: null,
            id_produto: idProduto,
            origem: "id_api_nao_encontrado",
          };
        }
        // ERP prefix but failed to extract valid id (malformed)
        return { epc, sku: null, nome: null, produto_nome: null, origem: "desconhecido" };
      }

      // Step 3: Legacy EPC → id_api_produto → produtos_compat
      if (isEpcLegado(epc)) {
        const idApi = legadoIdMap.get(epc);
        if (idApi !== undefined) {
          const prod = legadoProdMap.get(idApi);
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
          // Legacy EPC decoded but not found in produtos_compat
          return {
            epc,
            sku: null,
            nome: null,
            produto_nome: null,
            id_api_produto: idApi,
            origem: "id_api_nao_encontrado",
          };
        }
        // Legacy prefix but failed to extract valid id (malformed)
        return { epc, sku: null, nome: null, produto_nome: null, origem: "desconhecido" };
      }

      // Step 4: Unknown EPC (no recognized prefix or invalid format)
      return { epc, sku: null, nome: null, produto_nome: null, origem: "desconhecido" };
    });

    return NextResponse.json({ resultados });
  } catch (err) {
    return internalError("[POST /api/rfid/lookup]", err);
  }
}
