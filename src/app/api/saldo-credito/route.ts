import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { getSaldoAtual, getSaldoLimite, ajustarSaldo } from "@/lib/saldo-credito";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const SaldoCreditoPostSchema = z.object({
  valor: z.coerce.number(),
  descricao: z.string().min(1, "obrigatório"),
}).passthrough();

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

  const [saldoAtual, limite] = await Promise.all([
    getSaldoAtual(),
    getSaldoLimite(),
  ]);

  return NextResponse.json({ saldo_atual: saldoAtual, limite });
}

// ─── POST /api/saldo-credito ────────────────────────────────────────────────
// Ajuste manual do saldo. Apenas admin/diretor.
// Body: { valor: number (positivo=crédito, negativo=débito), descricao: string }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Apenas admin/diretor pode ajustar saldo" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsedPost = SaldoCreditoPostSchema.safeParse(raw);
  if (!parsedPost.success) return zodError(parsedPost.error);
  const body = parsedPost.data;
  if (!body.valor || body.valor === 0) {
    return NextResponse.json({ error: "Valor obrigatório e diferente de zero" }, { status: 400 });
  }

  try {
    const result = await ajustarSaldo(body.valor, body.descricao.trim(), user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return internalError("[POST /api/saldo-credito]", err, "Erro ao ajustar saldo", 400);
  }
}

// ─── PATCH /api/saldo-credito ───────────────────────────────────────────────
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
