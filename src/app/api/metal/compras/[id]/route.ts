// ═══════════════════════════════════════════════════════════════════════════
// TASK-010: GET /api/metal/compras/[id]
//
// REGRA DE NEGÓCIO: Retorna detalhe completo de uma compra de metal
// com dados do fornecedor (JOIN public.contatos).
// Se compra estiver pendente_aprovacao, retorna também o registro de
// aprovação para permitir que o aprovador aprove/rejeite.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { getCompraPorId } from "@/lib/metal/compras";
import sql from "@/lib/db";

const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const compra = await getCompraPorId(Number(id));
    if (!compra) {
      return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
    }

    // Busca aprovação pendente, se houver
    let aprovacao = null;
    if (compra.status === "pendente_aprovacao") {
      const [aprov] = await sql`
        SELECT * FROM alissonerp.compras_metal_aprovacoes
        WHERE compra_id = ${compra.id} AND status = 'pendente'
        ORDER BY id DESC LIMIT 1
      `;
      aprovacao = aprov ?? null;
    }

    // Busca todos os pagamentos registrados
    const pagamentos = await sql`
      SELECT * FROM alissonerp.compras_metal_pagamentos
      WHERE compra_id = ${compra.id}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ ...compra, aprovacao, pagamentos });
  } catch (err) {
    return internalError("[GET /api/metal/compras/[id]]", err);
  }
}
