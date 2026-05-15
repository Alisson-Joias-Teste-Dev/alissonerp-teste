import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/mercado-pago/uso-reserva
//   Registra log de uso de máquina reserva por um vendedor
//   Body: { venda_id?: number, device_id_reserva: string, justificativa: string }
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    venda_id?: number;
    device_id_reserva: string;
    justificativa: string;
  };

  if (!body.device_id_reserva) {
    return NextResponse.json({ error: "device_id_reserva obrigatório" }, { status: 400 });
  }
  if (!body.justificativa?.trim() || body.justificativa.trim().length < 10) {
    return NextResponse.json({ error: "Justificativa deve ter no mínimo 10 caracteres" }, { status: 400 });
  }

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
