import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";
import { gerarZplEtiquetaJoia } from "@/lib/rfid-zpl";
import { zodError } from "@/lib/schemas/common";

const RfidReimprimirSchema = z.object({
  epc: z.string().min(1, "obrigatório"),
}).passthrough();

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
 *   404 joia nao encontrada ou nao esta ativa
 */

const ROLES_REIMPRIMIR_RFID = [
  "admin",
  "desenvolvedor",
  "gerente_fabrica",
  "estoquista_fabrica",
] as const;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_REIMPRIMIR_RFID))) {
    return NextResponse.json(
      { error: "Sem permissao para reimprimir tag RFID" },
      { status: 403 },
    );
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RfidReimprimirSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const epc = parsed.data.epc.trim();
  if (!/^AJ\d{2}\d{8}$/.test(epc)) {
    return NextResponse.json(
      { error: "epc invalido — esperado formato AJ{AA}{NNNNNNNN}" },
      { status: 400 },
    );
  }

  try {
    const [joia] = await sql`
      SELECT epc, sku, nome, status
      FROM alissonerp.joias_rfid
      WHERE epc = ${epc}
    `;

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

    // Registra evento de reimpressao
    await sql`
      INSERT INTO alissonerp.joias_leituras (
        epc, evento, localizacao, leitor_id, operador
      ) VALUES (
        ${epc},
        'reimpressao',
        null,
        'ZEBRA-ZD621R',
        ${user.id}::uuid
      )
    `;

    const zpl = gerarZplEtiquetaJoia({
      epc:  joia.epc,
      sku:  joia.sku,
      nome: joia.nome,
    });

    return NextResponse.json({ ok: true, epc: joia.epc, zpl });
  } catch (err) {
    console.error("[POST /api/rfid/reimprimir] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
