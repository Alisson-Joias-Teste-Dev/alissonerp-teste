/**
 * GET  /api/admin/api-chaves  — lista todas as chaves (nunca retorna a chave real)
 * POST /api/admin/api-chaves  — gera nova chave (retorna a chave UMA ÚNICA VEZ)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { gerarApiKey } from "@/lib/api-publica";

async function autorizarAdmin(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!isFullAccess(user.role)) return null;
    return user;
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const user = await autorizarAdmin(req);
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const chaves = await sql`
    SELECT id, nome, chave_preview, ativa, rate_limit_por_minuto,
           total_requisicoes, ultimo_uso, created_at
    FROM alissonerp.api_chaves
    ORDER BY created_at DESC
  `;

  return NextResponse.json(chaves);
}

export async function POST(req: NextRequest) {
  const user = await autorizarAdmin(req);
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as {
    nome: string;
    rate_limit_por_minuto?: number;
  };

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  const { chave, hash, preview } = gerarApiKey();

  const [registro] = await sql`
    INSERT INTO alissonerp.api_chaves (nome, chave_hash, chave_preview, rate_limit_por_minuto)
    VALUES (
      ${body.nome.trim()},
      ${hash},
      ${preview},
      ${body.rate_limit_por_minuto ?? 60}
    )
    RETURNING id, nome, chave_preview, ativa, rate_limit_por_minuto, created_at
  `;

  // Retorna a chave COMPLETA apenas neste momento — nunca mais será exibida
  return NextResponse.json(
    { ...registro, chave_completa: chave, aviso: "Salve esta chave agora — ela não será exibida novamente." },
    { status: 201 }
  );
}
