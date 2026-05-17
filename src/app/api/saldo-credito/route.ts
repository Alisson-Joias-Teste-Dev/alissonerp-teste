import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";
import { getSaldoAtual, getSaldoLimite, ajustarSaldo } from "@/lib/saldo-credito";
import { internalError } from "@/lib/api-error";

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

  const body = await req.json() as { valor?: number; descricao?: string };
  if (!body.valor || body.valor === 0) {
    return NextResponse.json({ error: "Valor obrigatório e diferente de zero" }, { status: 400 });
  }
  if (!body.descricao?.trim()) {
    return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 });
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

  const body = await req.json() as { limite?: number };
  if (body.limite == null || body.limite < 0) {
    return NextResponse.json({ error: "Limite inválido" }, { status: 400 });
  }

  await sql`
    UPDATE alissonerp.configuracoes_sistema
    SET valor = ${String(body.limite)}, updated_at = now(), updated_by = ${user.id}::uuid
    WHERE chave = 'saldo_gerente_limite'
  `;

  return NextResponse.json({ ok: true, limite: body.limite });
}
