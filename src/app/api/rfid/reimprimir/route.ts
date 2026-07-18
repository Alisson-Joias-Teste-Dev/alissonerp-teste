import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";
import { ROLES_CADASTRAR_RFID } from "@/lib/rfid/roles";
import { RfidReimprimirSchema } from "@/lib/rfid/tipos";
import { buscarJoiaPorEpc, registrarReimpressao, modeloEtiquetaPadrao } from "@/lib/rfid/repo";
import { validateEpc, extrairIdProduto } from "@/lib/rfid/epc";
import { gerarZplJoiaDoModelo } from "@/lib/rfid/zpl";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/rfid/reimprimir
 *
 * Body: { epc: string }
 *
 * Regenera ZPL para uma joia ja ativa (util quando etiqueta fisica sai ruim).
 * NAO cria nova joia, NAO gera novo EPC — reutiliza o existente.
 * Registra evento 'reimpressao' na timeline.
 *
 * Response:
 *   200 { ok: true, epc, zpl }
 *   401 nao autenticado
 *   403 sem permissao
 *   400 epc invalido / body invalido
 *   404 joia nao encontrada
 *   409 joia nao esta ativa
 */
export async function POST(req: NextRequest) {
  // -----------------------------------------------------------
  // 1. Auth
  // -----------------------------------------------------------
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  // -----------------------------------------------------------
  // 2. Role check
  // -----------------------------------------------------------
  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CADASTRAR_RFID))) {
    return NextResponse.json(
      { error: "Sem permissao para reimprimir tag RFID" },
      { status: 403 },
    );
  }

  // -----------------------------------------------------------
  // 3. Parse + valida body
  // -----------------------------------------------------------
  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RfidReimprimirSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const epc = parsed.data.epc.trim();

  // Valida formato EPC (24 digitos, prefixo 1001 ou 0000)
  if (!validateEpc(epc)) {
    return NextResponse.json(
      { error: "EPC invalido — esperado 24 digitos numericos" },
      { status: 400 },
    );
  }

  try {
    // -----------------------------------------------------------
    // 4. Busca joia pelo EPC
    // -----------------------------------------------------------
    const joia = await buscarJoiaPorEpc(epc);

    if (!joia) {
      return NextResponse.json(
        { error: "Joia nao encontrada" },
        { status: 404 },
      );
    }

    if (joia.status !== "ativo") {
      return NextResponse.json(
        { error: `Joia esta em status '${joia.status}' — so joias ativas podem ser reimpressas` },
        { status: 409 },
      );
    }

    if (!joia.sku || !joia.nome) {
      return NextResponse.json(
        { error: "Joia nao tem SKU ou nome preenchidos — impossivel gerar etiqueta" },
        { status: 422 },
      );
    }

    // Extrai id_produto do EPC para montar DadosEtiqueta
    const idProduto = extrairIdProduto(epc);
    if (idProduto === null) {
      return NextResponse.json(
        { error: "Nao foi possivel extrair id_produto do EPC" },
        { status: 500 },
      );
    }

    // -----------------------------------------------------------
    // 5. Registra evento de reimpressao
    // -----------------------------------------------------------
    await registrarReimpressao(epc, user.id);

    // -----------------------------------------------------------
    // 6. Gera ZPL
    // -----------------------------------------------------------
    const modelo = await modeloEtiquetaPadrao();
    const zpl = gerarZplJoiaDoModelo(
      { id_produto: idProduto, sku: joia.sku, nome: joia.nome },
      epc,
      modelo,
    );

    return NextResponse.json({ ok: true, epc, zpl });
  } catch (err) {
    return internalError("[POST /api/rfid/reimprimir]", err, "Erro interno");
  }
}
