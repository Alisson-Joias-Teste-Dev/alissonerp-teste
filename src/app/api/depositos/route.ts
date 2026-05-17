import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

// GET /api/depositos — lista todos (ativos + inativos)
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const rows = await sql<{ id: number; nome: string; tipo: string; ativo: boolean }[]>`
    SELECT id, nome, tipo, ativo
    FROM alissonerp.depositos
    ORDER BY id
  `;
  return NextResponse.json(rows);
}

// POST /api/depositos — criar depósito (somente full access)
// Body: { nome: string, tipo?: "administrativo" | "producao" }
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

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
    return internalError("[POST /api/depositos]", err);
  }
}
