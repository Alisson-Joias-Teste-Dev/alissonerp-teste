// ═══════════════════════════════════════════════════════════════════════════
// TASK-014: POST/GET /api/metal/recebimentos
//
// REGRA DE NEGÓCIO:
//   POST: Registra recebimento de metal do cliente como parte de pag.
//         Vincula à venda. Excedente → saldo do cliente.
//   GET:  Lista recebimentos com filtros (data, status, cliente).
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { RecebimentoPostSchema } from "@/lib/metal/types";
import { criarRecebimentoMetal, listarRecebimentos } from "@/lib/metal/recebimentos";

/**
 * REGRA DE NEGÓCIO: todas as consultoras podem operar o módulo de recebimento de metal.
 *
 * O QUE: inclui role `consultora` na whitelist da API de recebimentos.
 * POR QUE: sem isso, a consultora acessa o módulo mas é bloqueada no POST/GET.
 * IMPACTO SE REMOVIDO: quebra operacional com erro 403 ao salvar ou listar recebimentos.
 */
const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"];

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão para registrar recebimentos de metal" }, { status: 403 });
  }

  try {
    rateLimit(`metal-recebimento:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = RecebimentoPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await criarRecebimentoMetal(parsed.data, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/metal/recebimentos]", err, (err as Error).message || "Erro ao registrar recebimento", 400);
  }
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const filtros = {
      data_inicio: searchParams.get("data_inicio") || undefined,
      data_fim: searchParams.get("data_fim") || undefined,
      status: searchParams.get("status") || undefined,
      cliente_id: searchParams.get("cliente_id") ? Number(searchParams.get("cliente_id")) : undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    };

    const result = await listarRecebimentos(filtros);
    return NextResponse.json(result);
  } catch (err) {
    return internalError("[GET /api/metal/recebimentos]", err);
  }
}
