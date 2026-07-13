import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { solicitarAprovacaoDevolucao, HttpError } from "@/lib/devolucoes";
import { internalError } from "@/lib/api-error";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const devId = Number(id);
  if (isNaN(devId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  try {
    const res = await solicitarAprovacaoDevolucao(devId, user.id);
    return NextResponse.json(res);
  } catch (err) {
    // REGRA DE NEGÓCIO (Fase 3e): "aprovador não configurado" tem status/mensagem
    // próprios (política config-first) — as demais mensagens de erro continuam
    // genéricas via internalError, contrato idêntico ao de antes.
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return internalError(`[POST /api/devolucoes/${devId}/solicitar-aprovacao]`, err, "Erro ao solicitar aprovacao", 400);
  }
}
