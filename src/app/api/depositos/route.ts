import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const DepositoPostSchema = z.object({
  nome: z.string().min(1, "obrigatório").max(120),
  tipo: z.enum(["administrativo", "producao"]).optional(),
}).passthrough();

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
    const raw = await req.json().catch(() => ({}));
    const parsed = DepositoPostSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;
    const nome = body.nome.trim();
    if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    const tipo = body.tipo ?? "producao";

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
