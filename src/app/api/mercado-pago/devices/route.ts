import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { listPointDevices } from "@/lib/mercado-pago";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

// ═══════════════════════════════════════════════════════════════════════════
// GET  /api/mercado-pago/devices            → lista maquininhas cadastradas
// GET  /api/mercado-pago/devices?minha=true → maquininha do vendedor logado + reservas
// POST /api/mercado-pago/devices            → sync (upsert) com MP Integration API
// PATCH /api/mercado-pago/devices           → atualiza device (nome, loja, ativo, vendedor, reserva)
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const minha = req.nextUrl.searchParams.get("minha") === "true";

  try {
    if (minha) {
      // Buscar vendedor_id do usuário logado
      const [usuario] = await sql`
        SELECT vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
      `;

      const vendedorId: number | null = usuario?.vendedor_id ?? null;

      // Máquina própria do vendedor (null se não tiver vendedor_id atribuído)
      const minhaDevice = vendedorId
        ? await sql`
            SELECT id, device_id, nome_legivel, store_id, pos_id, operating_mode,
                   ativo, loja, vendedor_id, is_reserva, last_sync_at, created_at, updated_at
            FROM alissonerp.mp_point_devices
            WHERE vendedor_id = ${vendedorId} AND ativo = true
            LIMIT 1
          `
        : [];

      // Todas as máquinas reserva ativas
      const reservas = await sql`
        SELECT id, device_id, nome_legivel, store_id, pos_id, operating_mode,
               ativo, loja, vendedor_id, is_reserva, last_sync_at, created_at, updated_at
        FROM alissonerp.mp_point_devices
        WHERE is_reserva = true AND ativo = true
        ORDER BY nome_legivel
      `;

      // Buscar parcelas_padrao_mp do usuário logado
      const [usuarioRow] = await sql`
        SELECT parcelas_padrao_mp FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
      `;
      const parcelas_padrao = Number(usuarioRow?.parcelas_padrao_mp ?? 1);

      return NextResponse.json({
        minha: minhaDevice[0] ?? null,
        reservas,
        parcelas_padrao,
      });
    }

    // Comportamento original: lista todos os devices ativos
    // Inclui parcelas_padrao_mp via JOIN com usuarios (para pré-preencher no modal de edição)
    const devices = await sql`
      SELECT d.id, d.device_id, d.nome_legivel, d.store_id, d.pos_id, d.operating_mode,
             d.ativo, d.loja, d.vendedor_id, d.is_reserva, d.last_sync_at, d.created_at, d.updated_at,
             COALESCE(u.parcelas_padrao_mp, 1) AS parcelas_padrao_mp
      FROM alissonerp.mp_point_devices d
      LEFT JOIN alissonerp.usuarios u ON u.vendedor_id = d.vendedor_id
      WHERE d.ativo = true
      ORDER BY d.nome_legivel
    `;
    return NextResponse.json(devices);
  } catch (err) {
    // Tabela pode não existir se migration 135 ainda não foi rodada
    const msg = err instanceof Error ? err.message : String(err);
    if (/mp_point_devices/.test(msg) && /does not exist|não existe/i.test(msg)) {
      return minha
        ? NextResponse.json({ minha: null, reservas: [] })
        : NextResponse.json([]);
    }
    return internalError("[GET /api/mercado-pago/devices]", err);
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
    return internalError("[POST /api/mercado-pago/devices] listPointDevices", err, "Erro ao consultar Mercado Pago", 502);
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

// ─── PATCH device (renomear, ativar/desativar, atribuir vendedor, marcar reserva) ──
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
    vendedor_id?: number | null;
    is_reserva?: boolean;
    parcelas_padrao_mp?: number;
  };

  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Resolver mutualidade: is_reserva e vendedor_id são exclusivos
  let resolvedVendedorId: number | null | undefined = body.vendedor_id;
  let resolvedIsReserva: boolean | undefined = body.is_reserva;

  if (body.is_reserva === true) {
    // Marcar como reserva → limpar vendedor
    resolvedVendedorId = null;
    resolvedIsReserva = true;
  } else if (body.vendedor_id !== undefined && body.vendedor_id !== null) {
    // Atribuir vendedor → desmarcar reserva
    resolvedIsReserva = false;

    // Constraint lógica: 1 máquina por vendedor — verificar se outro device já tem esse vendedor_id
    const [conflito] = await sql`
      SELECT id FROM alissonerp.mp_point_devices
      WHERE vendedor_id = ${body.vendedor_id} AND id != ${body.id}
      LIMIT 1
    `;
    if (conflito) {
      return NextResponse.json(
        { error: `Vendedor já possui uma maquininha atribuída (device id=${conflito.id}). Remova a atribuição anterior antes de reatribuir.` },
        { status: 409 },
      );
    }
  }

  await sql`
    UPDATE alissonerp.mp_point_devices SET
      nome_legivel = COALESCE(${body.nome_legivel ?? null}, nome_legivel),
      loja         = COALESCE(${body.loja ?? null},         loja),
      ativo        = COALESCE(${body.ativo ?? null},        ativo),
      vendedor_id  = CASE
                       WHEN ${resolvedVendedorId !== undefined}
                       THEN ${resolvedVendedorId ?? null}
                       ELSE vendedor_id
                     END,
      is_reserva   = CASE
                       WHEN ${resolvedIsReserva !== undefined}
                       THEN ${resolvedIsReserva ?? false}
                       ELSE is_reserva
                     END
    WHERE id = ${body.id}
  `;

  // Atualizar parcelas_padrao_mp do vendedor atribuído ao device
  if (body.parcelas_padrao_mp != null) {
    // Buscar vendedor_id atual do device (pode ter sido atualizado acima)
    const [deviceRow] = await sql`
      SELECT vendedor_id FROM alissonerp.mp_point_devices WHERE id = ${body.id} LIMIT 1
    `;
    const vendedorId = deviceRow?.vendedor_id ?? null;
    if (!vendedorId) {
      return NextResponse.json(
        { error: "Não é possível configurar parcelas padrão sem vendedor atribuído ao device" },
        { status: 400 },
      );
    }
    const p = Math.min(12, Math.max(1, Number(body.parcelas_padrao_mp)));
    await sql`
      UPDATE alissonerp.usuarios
      SET parcelas_padrao_mp = ${p}
      WHERE vendedor_id = ${vendedorId}
    `;
  }

  return NextResponse.json({ ok: true });
}
