import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { buscarOuroRecebido } from "@/lib/registrar-quebra";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const TransferirFabricaSchema = z.object({
  deposito_destino_id: z.coerce.number().int().positive(),
  motoboy_id: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

// POST /api/service/[id]/transferir-fabrica
// Transfere um serviço de volta para a fábrica (depósito de ourives).
// Cria protocolo ida automático + move ouro + registra transferência.
// Body: { deposito_destino_id, motoboy_id?, observacao? }
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

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, deposito_id, is_operador_service
    FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = TransferirFabricaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { deposito_destino_id, motoboy_id, observacao } = parsed.data;

  // 1. Buscar serviço
  const [servico] = await sql`
    SELECT s.id, s.status, s.operador_id, s.pcp_id, s.ordem_id
    FROM alissonerp.servicos s WHERE s.id = ${servicoId}
  `;
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  if (servico.status !== "em_servico") {
    return NextResponse.json({ error: "Só é possível transferir serviços em andamento" }, { status: 422 });
  }

  const origemDepositoId = servico.operador_id as number;
  const pcpId = servico.pcp_id as number | null;
  const ordemId = servico.ordem_id as number;

  // 2. Verificar destino existe
  const [destino] = await sql`SELECT id, nome FROM alissonerp.depositos WHERE id = ${deposito_destino_id}`;
  if (!destino) return NextResponse.json({ error: "Depósito destino não encontrado" }, { status: 404 });

  // 3. Calcular ouro a transferir
  const ouroSaldo = origemDepositoId && origemDepositoId !== 1
    ? await buscarOuroRecebido(ordemId, origemDepositoId)
    : 0;

  // 4. Transação
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultado = await (sql as any).begin(async (tx: typeof sql) => {
    // 4a. Registrar transferência
    const [transf] = await tx`
      INSERT INTO alissonerp.transferencias_ordem
        (pcp_id, ordem_id, deposito_id, setor_id, observacao, created_by,
         tipo_transferencia, deposito_origem_id)
      VALUES
        (${pcpId}, ${ordemId}, ${deposito_destino_id}, ${null},
         ${observacao ?? `Transferência service→fábrica #${servicoId}`},
         ${user.id}::uuid, 'service', ${origemDepositoId})
      RETURNING id
    `;

    // 4b. Mover ouro
    if (ouroSaldo > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, observacao, ordem_id, created_by, local_estoque_id)
        VALUES
          (1, ${origemDepositoId}, ${ouroSaldo}::real, 0,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Transf. Fábrica #' + servicoId}, ${ordemId}, ${user.id}::uuid, 1)
      `;
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, observacao, ordem_id, created_by, local_estoque_id)
        VALUES
          (1, ${deposito_destino_id}, 0, ${ouroSaldo}::real,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Transf. Fábrica #' + servicoId}, ${ordemId}, ${user.id}::uuid, 1)
      `;
    }

    // 4c. Criar protocolo ida automático
    const [proto] = await tx`
      INSERT INTO alissonerp.protocolos
        (direcao, etapas, tipo_protocolo, created_by, motoboy_id)
      VALUES
        ('ida'::alissonerp.enum_direcao_protocolo,
         'pendente'::alissonerp.enum_etapas_protocolo,
         'fabrica', ${user.id}::uuid, ${motoboy_id ?? null}::uuid)
      RETURNING id
    `;

    // 4d. Vincular ordem ao protocolo
    await tx`
      INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id)
      VALUES (${proto.id}, ${ordemId})
    `;

    // 4e. Atualizar transferência com protocolo
    await tx`
      UPDATE alissonerp.transferencias_ordem
      SET protocolo_id = ${proto.id}
      WHERE id = ${transf.id}
    `;

    // 4f. Atualizar PCP
    if (pcpId) {
      await tx`
        UPDATE alissonerp.pcp
        SET deposito_id = ${deposito_destino_id}, etapas = 'em_andamento'::alissonerp.enum_etapas_pcp, updated_at = NOW()
        WHERE id = ${pcpId}
      `;
    }

    // 4g. Atualizar ordem
    await tx`
      UPDATE alissonerp.ordens
      SET local_atual = ${deposito_destino_id}, updated_at = NOW()
      WHERE id = ${ordemId}
    `;

    // 4h. Marcar serviço como transferido (remove da lista do operador)
    await tx`
      UPDATE alissonerp.servicos
      SET status = 'concluido', concluido_em = NOW(), concluido_por = ${user.id}::uuid
      WHERE id = ${servicoId}
    `;

    return { transferencia_id: transf.id, protocolo_id: proto.id };
  });

  return NextResponse.json({
    success: true,
    servico_id: servicoId,
    transferencia_id: resultado.transferencia_id,
    protocolo_id: resultado.protocolo_id,
    ouro_transferido: parseFloat(ouroSaldo.toFixed(2)),
    deposito_destino: destino.nome,
  });
}
