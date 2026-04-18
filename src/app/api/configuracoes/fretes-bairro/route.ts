import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/configuracoes/fretes-bairro ─────────────────────────────────────
// Lista todos os bairros com seus valores de frete, ordenados por municipio e bairro.
// Qualquer usuário autenticado pode consultar.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const fretes = await sql`
      SELECT id, bairro, municipio, valor, ativo, created_at
      FROM alissonerp.fretes_bairro
      ORDER BY municipio, bairro
    `;
    return NextResponse.json(fretes.map((f) => ({ ...f, valor: Number(f.valor) })));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

// ─── POST /api/configuracoes/fretes-bairro ────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES = ["desenvolvedor", "admin", "gerente_loja"];
  if (!usuario || !ROLES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { bairro, municipio, valor } = await req.json() as { bairro: string; municipio?: string; valor?: number };
  if (!bairro?.trim()) return NextResponse.json({ error: "Bairro é obrigatório" }, { status: 400 });

  try {
    const [frete] = await sql`
      INSERT INTO alissonerp.fretes_bairro (bairro, municipio, valor)
      VALUES (${bairro.trim()}, ${municipio?.trim() || "Fortaleza"}, ${valor ?? 0})
      ON CONFLICT (bairro, municipio) DO UPDATE SET valor = EXCLUDED.valor
      RETURNING id, bairro, municipio, valor, ativo
    `;
    return NextResponse.json({ ...frete, valor: Number(frete.valor) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao salvar";
    const notFound = msg.includes("does not exist") || msg.includes("relation");
    return NextResponse.json(
      { error: notFound ? "Tabela não encontrada — execute a migration 153 no banco" : msg },
      { status: 500 }
    );
  }
}
