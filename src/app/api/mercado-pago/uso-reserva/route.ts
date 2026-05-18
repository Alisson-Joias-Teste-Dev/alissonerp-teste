import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const UsoReservaPostSchema = z.object({
  venda_id: z.coerce.number().int().optional(),
  device_id_reserva: z.string().min(1, "obrigatório"),
  justificativa: z.string().min(10, "mínimo 10 caracteres"),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/mercado-pago/uso-reserva
//   Registra log de uso de máquina reserva por um vendedor
//   Body: { venda_id?: number, device_id_reserva: string, justificativa: string }
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = UsoReservaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Buscar vendedor_id do usuário logado
  const [usuario] = await sql`
    SELECT vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;

  if (!usuario?.vendedor_id) {
    return NextResponse.json(
      { error: "Usuário não possui vendedor associado" },
      { status: 422 },
    );
  }

  const vendedorId: number = usuario.vendedor_id;

  // Validar que o device existe e é uma máquina reserva
  const [device] = await sql`
    SELECT id, is_reserva FROM alissonerp.mp_point_devices
    WHERE device_id = ${body.device_id_reserva} AND ativo = true
    LIMIT 1
  `;

  if (!device) {
    return NextResponse.json(
      { error: "Maquininha não encontrada ou inativa" },
      { status: 404 },
    );
  }
  if (!device.is_reserva) {
    return NextResponse.json(
      { error: "A maquininha informada não é uma máquina reserva" },
      { status: 422 },
    );
  }

  // Inserir log
  const [inserted] = await sql`
    INSERT INTO alissonerp.uso_maquina_reserva (
      venda_id, vendedor_id, device_id_reserva, justificativa
    ) VALUES (
      ${body.venda_id ?? null},
      ${vendedorId},
      ${body.device_id_reserva},
      ${body.justificativa.trim()}
    )
    RETURNING id
  `;

  return NextResponse.json({ ok: true, id: inserted.id });
}
