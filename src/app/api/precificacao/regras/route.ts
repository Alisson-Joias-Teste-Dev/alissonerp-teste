/**
 * GET   /api/precificacao/regras — ler regras de atualização de preço
 * PATCH /api/precificacao/regras — salvar regras em configuracoes_sistema
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const RegrasPatchSchema = z.object({
  preco_limiar_subir: z.coerce.number().optional(),
  preco_limiar_descer: z.coerce.number().optional(),
  preco_arredondamento: z.string().optional(),
}).passthrough();

const CHAVES = ["preco_limiar_subir", "preco_limiar_descer", "preco_arredondamento"] as const;
type Chave = (typeof CHAVES)[number];

const DEFAULTS: Record<Chave, string> = {
  preco_limiar_subir: "2",
  preco_limiar_descer: "5",
  preco_arredondamento: "dezena",
};

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  void user;

  try {
    const rows = await sql<{ chave: string; valor: string }[]>`
      SELECT chave, valor
      FROM alissonerp.configuracoes_sistema
      WHERE chave IN ('preco_limiar_subir', 'preco_limiar_descer', 'preco_arredondamento')
    `;

    const config: Record<Chave, string> = { ...DEFAULTS };
    for (const r of rows) {
      if (CHAVES.includes(r.chave as Chave)) {
        config[r.chave as Chave] = r.valor;
      }
    }

    return NextResponse.json({ config });
  } catch {
    // Fallback to defaults if table not seeded yet
    return NextResponse.json({ config: { ...DEFAULTS } });
  }
}

export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = RegrasPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const ARREDONDAMENTOS = ["dezena", "unidade", "centena"];

  if (body.preco_limiar_subir !== undefined) {
    const val = Math.max(0, Math.min(50, Number(body.preco_limiar_subir)));
    if (isNaN(val)) return NextResponse.json({ error: "preco_limiar_subir inválido" }, { status: 400 });
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
      VALUES ('preco_limiar_subir', ${String(val)}, 'Percentual mínimo de alta para disparar atualização de preço de venda (%)')
      ON CONFLICT (chave) DO UPDATE SET valor = ${String(val)}, updated_at = NOW(), updated_by = ${user.id}::uuid
    `;
  }

  if (body.preco_limiar_descer !== undefined) {
    const val = Math.max(0, Math.min(50, Number(body.preco_limiar_descer)));
    if (isNaN(val)) return NextResponse.json({ error: "preco_limiar_descer inválido" }, { status: 400 });
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
      VALUES ('preco_limiar_descer', ${String(val)}, 'Percentual mínimo de queda para disparar atualização de preço de venda (%)')
      ON CONFLICT (chave) DO UPDATE SET valor = ${String(val)}, updated_at = NOW(), updated_by = ${user.id}::uuid
    `;
  }

  if (body.preco_arredondamento !== undefined) {
    if (!ARREDONDAMENTOS.includes(body.preco_arredondamento)) {
      return NextResponse.json({ error: "Arredondamento inválido" }, { status: 400 });
    }
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
      VALUES ('preco_arredondamento', ${body.preco_arredondamento}, 'Tipo de arredondamento: dezena | unidade | centena')
      ON CONFLICT (chave) DO UPDATE SET valor = ${body.preco_arredondamento}, updated_at = NOW(), updated_by = ${user.id}::uuid
    `;
  }

  return NextResponse.json({ ok: true });
}
