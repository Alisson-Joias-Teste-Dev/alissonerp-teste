import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/pcp/[id]/atribuir-operador
// Body: { deposito_id: number }
// Atribui operador (depósito) a um PCP que ainda não tem operador definido.
// NÃO cria movimentação de estoque, NÃO muda etapa.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pcpId = parseInt(id, 10);
  if (isNaN(pcpId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json() as { deposito_id?: number };
  const { deposito_id } = body;

  if (!deposito_id) {
    return NextResponse.json({ error: "deposito_id é obrigatório" }, { status: 400 });
  }

  // Validar deposito_id != 1 (Almoxarifado Central não é operador)
  if (deposito_id === 1) {
    return NextResponse.json(
      { error: "Almoxarifado Central não pode ser atribuído como operador de PCP." },
      { status: 400 }
    );
  }

  // Buscar PCP existente
  const [pcpRow] = await sql`
    SELECT p.id, p.ordem_id, p.deposito_id AS pcp_deposito_id,
           o.local_atual AS ordem_deposito_id
    FROM alissonerp.pcp p
    LEFT JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.id = ${pcpId}
    LIMIT 1
  `;

  if (!pcpRow) {
    return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  }

  // Verificar se já tem operador atribuído — source of truth é ordens.local_atual
  // (pcp.deposito_id é secundário; vw_pcp_erp usa ordens.local_atual como deposito_id)
  if (pcpRow.ordem_deposito_id != null) {
    return NextResponse.json(
      { error: "Operador já atribuído. Use transferência para mudar." },
      { status: 400 }
    );
  }

  // Validar que depósito existe e está ativo
  const [deposito] = await sql`
    SELECT id, nome FROM alissonerp.depositos
    WHERE id = ${deposito_id} AND ativo = true
    LIMIT 1
  `;

  if (!deposito) {
    return NextResponse.json(
      { error: "Depósito não encontrado ou inativo." },
      { status: 400 }
    );
  }

  // Atualizar pcp.deposito_id e ordens.local_atual
  await sql`
    UPDATE alissonerp.pcp
    SET deposito_id = ${deposito_id}, updated_at = NOW()
    WHERE id = ${pcpId}
  `;

  if (pcpRow.ordem_id != null) {
    await sql`
      UPDATE alissonerp.ordens
      SET local_atual = ${deposito_id}, updated_at = NOW()
      WHERE id = ${pcpRow.ordem_id}
    `;
  }

  return NextResponse.json({
    ok: true,
    pcp_id: pcpId,
    deposito_id,
    deposito_nome: deposito.nome,
  });
}
