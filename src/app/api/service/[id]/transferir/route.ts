import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const TransferirServicoSchema = z.object({
  deposito_destino_id: z.coerce.number().int().positive(),
}).passthrough();

// POST /api/service/[id]/transferir
// Transfere um serviço para outro operador.
// Atualiza servicos.operador_id, pcp.deposito_id, ordens.local_atual.
// Registra em transferencias_ordem (setor_id=NULL para não disparar trigger legado).
// Auth: is_operador_service = true OU fullAccess

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const servicoId = parseInt(id);
  if (isNaN(servicoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, deposito_id, is_operador_service
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // ── Body ──────────────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => ({}));
  const parsed = TransferirServicoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { deposito_destino_id } = parsed.data;
  if (deposito_destino_id === 1) {
    return NextResponse.json(
      { error: "Não é possível transferir para o Almoxarifado Central" },
      { status: 400 }
    );
  }

  // ── 1. Buscar serviço ─────────────────────────────────────────────────────
  const [servico] = await sql`
    SELECT s.id, s.status, s.operador_id, s.pcp_id, s.ordem_id
    FROM alissonerp.servicos s
    WHERE s.id = ${servicoId}
  `;
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  if (servico.status !== "em_servico") {
    return NextResponse.json(
      { error: `Só é possível transferir serviços com status 'em_servico'` },
      { status: 422 }
    );
  }

  const origemDepositoId = servico.operador_id as number;
  const pcpId            = servico.pcp_id as number | null;
  const ordemId          = servico.ordem_id as number;

  if (origemDepositoId === deposito_destino_id) {
    return NextResponse.json({ error: "Destino deve ser diferente da origem" }, { status: 422 });
  }

  // ── 2. Verificar destino existe ───────────────────────────────────────────
  const [destino] = await sql`SELECT id FROM alissonerp.depositos WHERE id = ${deposito_destino_id}`;
  if (!destino) {
    return NextResponse.json({ error: "Depósito de destino não encontrado" }, { status: 404 });
  }

  // ── 3. Executar transferência em transação ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // 3a. Atualizar servico
    await tx`
      UPDATE alissonerp.servicos
      SET operador_id = ${deposito_destino_id}
      WHERE id = ${servicoId}
    `;

    // 3b. Atualizar pcp
    if (pcpId) {
      await tx`
        UPDATE alissonerp.pcp
        SET deposito_id = ${deposito_destino_id},
            updated_at  = NOW()
        WHERE id = ${pcpId}
      `;
    }

    // 3c. Atualizar ordens.local_atual (fonte de verdade do kanban)
    await tx`
      UPDATE alissonerp.ordens
      SET local_atual = ${deposito_destino_id},
          updated_at  = NOW()
      WHERE id = ${ordemId}
    `;

    // 3d. Registrar transferência
    //     setor_id = NULL intencionalmente — guard do trigger fn_processar_transferencia:
    //     IF NEW.setor_id IS NULL THEN RETURN NEW (bypass trigger legado)
    if (pcpId) {
      await tx`
        INSERT INTO alissonerp.transferencias_ordem
          (pcp_id, ordem_id, deposito_id, setor_id, obs, created_by)
        VALUES
          (${pcpId}, ${ordemId}, ${deposito_destino_id}, ${null},
           ${'Transferência service #' + servicoId},
           ${user.id}::uuid)
      `;
    }
  });

  return NextResponse.json({
    success:              true,
    servico_id:           servicoId,
    origem_deposito_id:   origemDepositoId,
    destino_deposito_id:  deposito_destino_id,
  });
}
