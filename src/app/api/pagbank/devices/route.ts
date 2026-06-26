/**
 * GET/POST/PATCH /api/pagbank/devices
 *
 * Gerência de dispositivos Moderninha PagBank.
 * Estrutura igual ao /api/mercado-pago/devices.
 *
 * GET: lista dispositivos ativos
 * POST: sincroniza com API PagBank (futuro)
 * PATCH: renomeia, ativa/desativa, atribui vendedor
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_MANUTENCAO = ["desenvolvedor", "admin", "diretor"];
const ROLES_LEITURA = [...ROLES_MANUTENCAO, "gerente_fabrica", "gerente_loja", "consultora"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_LEITURA.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const minha = searchParams.get("minha") === "true";

  let devices;
  if (minha && usuario.role === "consultora") {
    // Consultora vê seus devices + reservas
    devices = await sql`
      SELECT * FROM alissonerp.pagbank_devices
      WHERE ativo = true
        AND (vendedor_id = ${usuario.vendedor_id} OR is_reserva = true)
      ORDER BY nome_legivel
    `;
  } else {
    // Admin/gerente vê todos
    devices = await sql`
      SELECT * FROM alissonerp.pagbank_devices
      ORDER BY ativo DESC, nome_legivel
    `;
  }

  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_MANUTENCAO.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Futuro: sincronizar dispositivos com a API PagBank Moderninha
  // Por enquanto, apenas aceita criação manual
  const raw = await req.json().catch(() => ({}));
  const { device_id, nome_legivel } = raw;

  if (!device_id || !nome_legivel) {
    return NextResponse.json(
      { error: "device_id e nome_legivel são obrigatórios" },
      { status: 400 },
    );
  }

  const [device] = await sql`
    INSERT INTO alissonerp.pagbank_devices (device_id, nome_legivel)
    VALUES (${String(device_id)}, ${String(nome_legivel)})
    ON CONFLICT (device_id) DO UPDATE SET
      nome_legivel = EXCLUDED.nome_legivel,
      last_sync_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `;

  return NextResponse.json({ ok: true, device });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_MANUTENCAO.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const { id, device_id, nome_legivel, ativo, loja, vendedor_id, is_reserva } = raw;

  const targetId = id ?? device_id;
  if (!targetId) {
    return NextResponse.json({ error: "id ou device_id obrigatório" }, { status: 400 });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (nome_legivel !== undefined) {
    sets.push(`nome_legivel = $${vals.length + 1}`);
    vals.push(String(nome_legivel));
  }
  if (ativo !== undefined) {
    sets.push(`ativo = $${vals.length + 1}`);
    vals.push(Boolean(ativo));
  }
  if (loja !== undefined) {
    sets.push(`loja = $${vals.length + 1}`);
    vals.push(loja);
  }
  if (vendedor_id !== undefined) {
    sets.push(`vendedor_id = $${vals.length + 1}`);
    vals.push(vendedor_id == null ? null : Number(vendedor_id));
  }
  if (is_reserva !== undefined) {
    sets.push(`is_reserva = $${vals.length + 1}`);
    vals.push(Boolean(is_reserva));
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  sets.push(`updated_at = NOW()`);

  const whereClause = typeof targetId === "number"
    ? `id = $${vals.length + 1}`
    : `device_id = $${vals.length + 1}`;
  vals.push(targetId);

  // REGRA DE NEGÓCIO: edição administrativa de Moderninhas usa campos opcionais.
  // O QUE: mantém UPDATE dinâmico sem sobrescrever atributos não enviados.
  // POR QUE: cada ação da tela altera só nome/loja/vendedor/reserva conforme escolha.
  // IMPACTO SE ALTERADO: pode apagar vínculo de consultora ou reserva da maquininha.
  await sql.unsafe(
    `UPDATE alissonerp.pagbank_devices SET ${sets.join(", ")} WHERE ${whereClause}`,
    vals as any[],
  );

  return NextResponse.json({ ok: true });
}
