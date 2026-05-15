import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/depositos — lista todos (ativos + inativos)
export async function GET() {
  const rows = await sql<{ id: number; nome: string; tipo: string; ativo: boolean }[]>`
    SELECT id, nome, tipo, ativo
    FROM alissonerp.depositos
    ORDER BY id
  `;
  return NextResponse.json(rows);
}

// POST /api/depositos — criar depósito
// Body: { nome: string, tipo?: "administrativo" | "producao" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { nome?: string; tipo?: string };
    const nome = body.nome?.trim();
    if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    const tipo = body.tipo ?? "producao";
    const TIPOS_VALIDOS = ["administrativo", "producao"];
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    const rows = await sql<{ id: number }[]>`
      INSERT INTO alissonerp.depositos (nome, tipo, ativo)
      VALUES (${nome}, ${tipo}::alissonerp.enum_tipo_deposito, true)
      RETURNING id
    `;
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
