import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const ROLES_SETORES_WRITE = ["admin", "desenvolvedor"];

const SetorPostSchema = z.object({
  nome: z.string().min(1, "obrigatório").max(120),
  deposito_id: z.number().int().positive().nullable().optional(),
}).passthrough();

// GET /api/setores?deposito_id=X — lista setores (filtro opcional por depósito)
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const depositoId = req.nextUrl.searchParams.get("deposito_id");

  const rows = depositoId
    ? await sql<{ id: number; nome: string; deposito_id: number | null; ativo: boolean; requer_peso: boolean; ordem: number }[]>`
        SELECT id, nome, deposito_id, ativo, requer_peso, ordem
        FROM alissonerp.setores
        WHERE deposito_id = ${parseInt(depositoId)}
        ORDER BY ordem ASC, nome ASC
      `
    : await sql<{ id: number; nome: string; deposito_id: number | null; ativo: boolean; requer_peso: boolean; ordem: number }[]>`
        SELECT id, nome, deposito_id, ativo, requer_peso, ordem
        FROM alissonerp.setores
        ORDER BY ordem ASC, nome ASC
      `;

  return NextResponse.json(rows);
}

// POST /api/setores — criar setor (impede duplicatas via uniq_setores_nome_ativo)
// Body: { nome: string, deposito_id?: number }
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_SETORES_WRITE.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = SetorPostSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;
    const nome = body.nome.trim();
    if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

    // Pré-check pra mensagem clara antes do erro de constraint do DB
    const [existente] = await sql<{ id: number }[]>`
      SELECT id FROM alissonerp.setores
      WHERE LOWER(TRIM(nome)) = LOWER(TRIM(${nome})) AND ativo = true
      LIMIT 1
    `;
    if (existente) {
      return NextResponse.json(
        { error: `Setor "${nome}" já existe (id ${existente.id}). Cada nome só pode aparecer uma vez na lista de ativos.` },
        { status: 409 }
      );
    }

    // Próxima ordem disponível: max + 10 (espaçamento pra inserções intermediárias)
    const [{ proxima }] = await sql<{ proxima: number }[]>`
      SELECT COALESCE(MAX(ordem), 0) + 10 AS proxima FROM alissonerp.setores
    `;

    const rows = await sql<{ id: number }[]>`
      INSERT INTO alissonerp.setores (nome, deposito_id, ativo, ordem)
      VALUES (${nome}, ${body.deposito_id ?? null}, true, ${Number(proxima)})
      RETURNING id
    `;
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/setores]", err);
  }
}
