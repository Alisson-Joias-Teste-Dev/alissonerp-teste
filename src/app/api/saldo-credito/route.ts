import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { getSaldoDisponivel } from "@/lib/saldo-credito";
import { zodError } from "@/lib/schemas/common";

const SaldoCreditoPatchSchema = z.object({
  limite: z.coerce.number().min(0),
}).passthrough();

const ROLES_VER_SALDO = ["desenvolvedor", "admin", "diretor", "gerente_loja"];

// ─── GET /api/saldo-credito ─────────────────────────────────────────────────
// Retorna saldo atual e limite configurado.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!isFullAccess(usuario.role) && !hasRole(usuario.role, ROLES_VER_SALDO))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Saldo GERAL derivado (regra v2.78.0): limite − todo o A Receber pendente.
  const { disponivel, limite } = await getSaldoDisponivel();

  return NextResponse.json({ saldo_atual: disponivel, limite });
}

// ─── PATCH /api/saldo-credito ───────────────────────────────────────────────
// NOTA (v2.78.0): o ajuste manual de saldo (POST) foi REMOVIDO — o saldo agora é
// DERIVADO ao vivo (limite − A Receber pendente), não há número à mão pra ajustar.
// O que dá pra configurar é o LIMITE (PATCH abaixo).
// Atualiza o limite do saldo. Apenas admin/diretor.
// Body: { limite: number }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Apenas admin/diretor pode alterar limite" }, { status: 403 });
  }

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = SaldoCreditoPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const body = parsedPatch.data;

  await sql`
    UPDATE alissonerp.configuracoes_sistema
    SET valor = ${String(body.limite)}, updated_at = now(), updated_by = ${user.id}::uuid
    WHERE chave = 'saldo_gerente_limite'
  `;

  return NextResponse.json({ ok: true, limite: body.limite });
}
