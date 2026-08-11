import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { RfidReverterSchema } from "@/lib/rfid/tipos";
import { reverterCadastro } from "@/lib/rfid/repo";
import { validateEpc } from "@/lib/rfid/epc";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/rfid/reverter
 *
 * Body: { epc: string, motivo?: string }
 *
 * Chamado pelo frontend quando o Zebra Browser Print falha (impressora offline,
 * driver ausente, papel/tag acabou, etc). Rollback total: deleta a joia + leituras.
 *
 * So permite reverter joias em status 'pendente_impressao'.
 * Se a joia ja foi confirmada (status='ativo'), retorna 409 — cancelar uma
 * joia ativa exige fluxo separado.
 *
 * Leitor padrao: ZEBRA-ZD500R.
 *
 * Response:
 *   200 { ok: true }
 *   401 nao autenticado
 *   400 epc invalido / body invalido
 *   404 joia nao encontrada
 *   409 joia nao esta pendente (ja confirmada, cancelada, ou inexistente)
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
  // 2. Parse + valida body
  // -----------------------------------------------------------
  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RfidReverterSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const epc = body.epc.trim();

  // Valida formato EPC (24 digitos, prefixo 1001 ou 0000)
  if (!validateEpc(epc)) {
    return NextResponse.json(
      { error: "EPC invalido — esperado 24 digitos numericos" },
      { status: 400 },
    );
  }

  const motivo =
    typeof body.motivo === "string" && body.motivo.trim().length > 0
      ? body.motivo.trim().slice(0, 500)
      : undefined;

  try {
    // -----------------------------------------------------------
    // 3. Reverte cadastro via repo (transacao unica)
    // -----------------------------------------------------------
    const result = await reverterCadastro(epc, user.id, motivo);

    if (!result.ok) {
      if (result.reason === "nao_encontrada") {
        return NextResponse.json(
          { error: "Joia nao encontrada" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Joia nao esta pendente de impressao — nao pode ser revertida" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/rfid/reverter]", err, "Erro interno");
  }
}
