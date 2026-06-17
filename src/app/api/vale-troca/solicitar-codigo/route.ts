// POST /api/vale-troca/solicitar-codigo  { vale_numero }
//
// REGRA DE NEGOCIO (brecha #1): dispara a 2a confirmacao do vale — gera o codigo
// de 6 digitos e envia no WhatsApp do DONO. Versao desacoplada da venda (o caixa
// pode pedir o codigo antes de a venda existir; o codigo fica atrelado ao
// vale+dono). A aplicacao do vale (POST de pagamentos) so libera com o codigo
// confirmado ou via excecao de um responsavel.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { solicitarCodigoVale } from "@/lib/vale-troca-codigo";

const Schema = z.object({ vale_numero: z.string().min(1).max(100) });

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const result = await solicitarCodigoVale(parsed.data.vale_numero.trim(), null, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
