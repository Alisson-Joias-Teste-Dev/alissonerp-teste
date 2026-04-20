import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/rfid/reverter
 *
 * Body: { epc: string, motivo?: string }
 *
 * Chamado pelo frontend quando o Zebra Browser Print falha (impressora offline,
 * driver ausente, papel/tag acabou, etc). Rollback total: deleta a joia + leituras.
 *
 * ⚠ So permite reverter joias em status 'pendente_impressao'.
 *   Se a joia ja foi confirmada (status='ativo'), retorna 409 — cancelar uma
 *   joia ativa exige fluxo separado (futuro: /api/rfid/cancelar com auditoria).
 *
 * Response:
 *   200 { ok: true }
 *   401 nao autenticado
 *   400 epc invalido / body invalido
 *   409 joia nao esta pendente (ja confirmada, cancelada, ou inexistente)
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let body: { epc?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const epc = typeof body?.epc === "string" ? body.epc.trim() : "";
  if (!epc || !/^AJ\d{2}\d{8}$/.test(epc)) {
    return NextResponse.json(
      { error: "epc invalido — esperado formato AJ{AA}{NNNNNNNN}" },
      { status: 400 },
    );
  }

  const motivo =
    typeof body?.motivo === "string" && body.motivo.trim().length > 0
      ? body.motivo.trim().slice(0, 500)
      : null;

  try {
    const result = await sql.begin(async (tx: any) => {
      // Verifica se existe e esta pendente antes de deletar
      const [joia] = await tx`
        SELECT id, status
        FROM alissonerp.joias_rfid
        WHERE epc = ${epc}
      `;

      if (!joia) {
        return { ok: false, reason: "nao_encontrada" };
      }
      if (joia.status !== "pendente_impressao") {
        return { ok: false, reason: "nao_pendente", status: joia.status };
      }

      // Registra evento de cancelamento ANTES de deletar (rastro de auditoria)
      await tx`
        INSERT INTO alissonerp.joias_leituras (
          epc, evento, leitor_id, operador, metadata
        ) VALUES (
          ${epc},
          'cancelamento',
          'ZEBRA-ZD621R',
          ${user.id}::uuid,
          ${sql.json({ motivo: motivo ?? "falha_impressao" })}
        )
      `;

      // Deleta leituras de cadastro/reimpressao da joia
      await tx`
        DELETE FROM alissonerp.joias_leituras
        WHERE epc = ${epc}
          AND evento IN ('cadastro', 'reimpressao')
      `;

      // Deleta a joia (so se estiver pendente — garantia extra)
      await tx`
        DELETE FROM alissonerp.joias_rfid
        WHERE epc = ${epc}
          AND status = 'pendente_impressao'
      `;

      return { ok: true };
    });

    if (!result.ok) {
      if (result.reason === "nao_encontrada") {
        return NextResponse.json(
          { error: "Joia nao encontrada" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error: `Joia ja esta em status '${result.status}' — nao pode ser revertida. Use cancelamento auditado.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/rfid/reverter] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
