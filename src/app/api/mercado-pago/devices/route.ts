import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { listPointDevices } from "@/lib/mercado-pago";
import { isFullAccess } from "@/lib/roles";

// ═══════════════════════════════════════════════════════════════════════════
// GET  /api/mercado-pago/devices       → lista maquininhas cadastradas
// POST /api/mercado-pago/devices       → sync (upsert) com MP Integration API
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const devices = await sql`
      SELECT id, device_id, nome_legivel, store_id, pos_id, operating_mode,
             ativo, loja, last_sync_at, created_at, updated_at
      FROM alissonerp.mp_point_devices
      WHERE ativo = true
      ORDER BY nome_legivel
    `;
    return NextResponse.json(devices);
  } catch (err: unknown) {
    // Tabela pode não existir se migration 135 ainda não foi rodada
    const msg = err instanceof Error ? err.message : String(err);
    if (/mp_point_devices/.test(msg) && /does not exist|não existe/i.test(msg)) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Apenas gerentes podem sincronizar maquininhas" }, { status: 403 });
  }

  let mpDevices;
  try {
    mpDevices = await listPointDevices();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao consultar Mercado Pago";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let inserted = 0;
  let updated = 0;

  for (const dev of mpDevices) {
    if (!dev.id) continue;

    const [existing] = await sql`
      SELECT id FROM alissonerp.mp_point_devices WHERE device_id = ${dev.id}
    `;

    if (existing) {
      await sql`
        UPDATE alissonerp.mp_point_devices SET
          store_id        = ${dev.store_id != null ? String(dev.store_id) : null},
          pos_id          = ${dev.pos_id != null ? String(dev.pos_id) : null},
          operating_mode  = ${dev.operating_mode ?? null},
          last_sync_at    = NOW()
        WHERE device_id = ${dev.id}
      `;
      updated++;
    } else {
      // Nome legível default = id truncado pro humano editar depois
      const defaultNome = String(dev.id).split("__").pop()?.slice(-12) ?? String(dev.id);
      await sql`
        INSERT INTO alissonerp.mp_point_devices (
          device_id, nome_legivel, store_id, pos_id, operating_mode,
          ativo, last_sync_at
        ) VALUES (
          ${dev.id},
          ${`Maquininha ${defaultNome}`},
          ${dev.store_id != null ? String(dev.store_id) : null},
          ${dev.pos_id != null ? String(dev.pos_id) : null},
          ${dev.operating_mode ?? null},
          true, NOW()
        )
      `;
      inserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: mpDevices.length,
    inserted,
    updated,
  });
}

// ─── PATCH device (renomear, ativar/desativar) ───────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    id: number;
    nome_legivel?: string;
    loja?: string | null;
    ativo?: boolean;
  };

  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await sql`
    UPDATE alissonerp.mp_point_devices SET
      nome_legivel = COALESCE(${body.nome_legivel ?? null}, nome_legivel),
      loja         = COALESCE(${body.loja ?? null},         loja),
      ativo        = COALESCE(${body.ativo ?? null},        ativo)
    WHERE id = ${body.id}
  `;

  return NextResponse.json({ ok: true });
}
