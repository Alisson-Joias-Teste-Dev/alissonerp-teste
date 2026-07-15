import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { importarLocalizacoesBloco } from "@/lib/importar-localizacao";

// ─── POST /api/estoque-comercial/importar-localizacao ─────────────────────────
// Ferramenta (uso admin): importa a LOCALIZACAO das pecas a partir da fonte externa.
// Processa UM BLOCO de paginas por chamada (o front chama em blocos, mostrando progresso,
// para respeitar o limite da fonte e nao estourar timeout). Body: { offset }.
// REGRA: so grava a localizacao (nao mexe em saldo/reserva/financeiro).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin/dev" }, { status: 403 });
  }

  let body: { offset?: number } = {};
  try { body = await req.json(); } catch { body = {}; }
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);

  const progresso = await importarLocalizacoesBloco(offset);
  if (progresso.erro) {
    return NextResponse.json(progresso, { status: 502 });
  }
  return NextResponse.json(progresso);
}
