import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { LIMITS } from "@/lib/payload-limits";

const ReceberSchema = z.object({
  protocolo_id: IdSchema,
  foto_base64: z.string().min(1, "foto_base64 é obrigatória").max(LIMITS.IMAGE_BASE64_MAX),
});

// POST /api/pcp/transferir-service/receber
// Operador service recebe a peça via protocolo de transferência.
// Diferente do /api/service/receber: a ordem já tem PCP ativo.
// fn_concluir_protocolo cria um PCP duplicado — esta rota o deleta
// e cria o servico manualmente com transferencia_service_id.
//
// Auth: is_operador_service = true OU fullAccess
// Body: { protocolo_id, foto_base64 }

export async function POST(req: NextRequest) {
  try {
    return await _handler(req);
  } catch (err) {
    return internalError("[POST /api/pcp/transferir-service/receber]", err);
  }
}

async function _handler(req: NextRequest) {
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

  if (!caller.deposito_id) {
    return NextResponse.json(
      { error: "Usuário não possui depósito/operador vinculado" },
      { status: 422 }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ReceberSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { protocolo_id, foto_base64 } = parsed.data;

  // 1. Validar protocolo: deve ser ida, pendente, tipo_protocolo='fabrica'
  const [protocolo] = await sql`
    SELECT id, direcao, etapas, tipo_protocolo
    FROM alissonerp.protocolos
    WHERE id = ${protocolo_id}::integer
      AND direcao = 'ida'::alissonerp.enum_direcao_protocolo
      AND etapas  = 'pendente'::alissonerp.enum_etapas_protocolo
  `;
  if (!protocolo) {
    return NextResponse.json(
      { error: "Protocolo não encontrado, não é uma ida ou já foi recebido" },
      { status: 404 }
    );
  }

  // 2. Validar que todas as ordens têm transferencia_service ativa para este protocolo
  const ordensRows = await sql`
    SELECT po.ordem_id, t.id AS transf_id, t.deposito_origem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.transferencias_ordem t
      ON t.protocolo_id = ${protocolo_id}::integer
      AND t.ordem_id = po.ordem_id
      AND t.tipo_transferencia = 'service'
    WHERE po.protocolo_id = ${protocolo_id}::integer
  `;
  if (ordensRows.length === 0) {
    return NextResponse.json(
      { error: "Este protocolo não é de transferência service ou não tem ordens vinculadas" },
      { status: 422 }
    );
  }

  // 3. Para cada ordem, encontrar o PCP ativo original (antes de concluir protocolo)
  const ordemIds = ordensRows.map(r => r.ordem_id as number);
  const pcpsOriginais: Record<number, number> = {}; // ordem_id → pcp_id
  for (const ordemId of ordemIds) {
    const [pcpOrig] = await sql`
      SELECT id FROM alissonerp.pcp
      WHERE ordem_id = ${ordemId}::integer
        AND etapas NOT IN ('concluido', 'cancelado')
      ORDER BY id ASC
      LIMIT 1
    `;
    if (pcpOrig) {
      pcpsOriginais[ordemId] = pcpOrig.id as number;
    }
  }

  // 4. Upload foto de recebimento
  const contentType = foto_base64.startsWith("data:image/png") ? "image/png"
    : foto_base64.startsWith("data:image/webp") ? "image/webp"
    : "image/jpeg";
  const fotoPath = `service/${protocolo_id}/recebimento-transf-${Date.now()}.jpg`;
  const uploadResult = await uploadFile("service-fotos", fotoPath, foto_base64, contentType);
  if ("error" in uploadResult) {
    return NextResponse.json(
      { error: `Erro no upload da foto: ${(uploadResult as { error: string }).error}` },
      { status: 500 }
    );
  }
  const fotoUrl = (uploadResult as { url: string }).url;

  const callerDepositoId = caller.deposito_id as number;

  // 5. Transação: concluir protocolo + limpar PCP duplicado + criar servicos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servicoIds = await (sql as any).begin(async (tx: typeof sql) => {
    // 5a. Concluir protocolo (dispara fn_concluir_protocolo → cria PCP duplicado)
    const [protAtualizado] = await tx`
      UPDATE alissonerp.protocolos
      SET etapas         = 'concluido'::alissonerp.enum_etapas_protocolo,
          recebedor_id   = ${user.id}::uuid,
          foto_conclusao = ${fotoUrl},
          data_conclusao = NOW(),
          updated_at     = NOW()
      WHERE id = ${protocolo_id}::integer
        AND etapas = 'pendente'::alissonerp.enum_etapas_protocolo
      RETURNING id
    `;
    if (!protAtualizado) {
      throw new Error("Protocolo já recebido por outro operador");
    }

    const ids: number[] = [];

    for (const ordemId of ordemIds) {
      const pcpOriginalId = pcpsOriginais[ordemId];
      const transfRow = ordensRows.find(r => r.ordem_id === ordemId);
      const transfId  = transfRow?.transf_id as number;

      // 5b. Encontrar o PCP duplicado criado por fn_concluir_protocolo
      //     (etapas='novas_ordens', mais recente, diferente do original)
      const [pcpDuplicado] = await tx`
        SELECT id, saida_ordem_id
        FROM alissonerp.pcp
        WHERE ordem_id = ${ordemId}::integer
          AND etapas = 'novas_ordens'::alissonerp.enum_etapas_pcp
          AND id != ${pcpOriginalId ?? 0}::integer
        ORDER BY id DESC
        LIMIT 1
      `;

      if (pcpDuplicado) {
        const dupPcpId    = pcpDuplicado.id as number;
        const dupSaidaId  = pcpDuplicado.saida_ordem_id as number | null;

        // 5c. Deletar servicos que o trigger criou para o PCP duplicado (se houver)
        await tx`
          DELETE FROM alissonerp.servicos
          WHERE pcp_id = ${dupPcpId}::integer
        `;

        // 5d. Deletar o PCP duplicado
        await tx`
          DELETE FROM alissonerp.pcp WHERE id = ${dupPcpId}::integer
        `;

        // 5e. Deletar a saida_ordem gerada para o PCP duplicado
        if (dupSaidaId) {
          await tx`
            DELETE FROM alissonerp.saidas_ordem WHERE id = ${dupSaidaId}::integer
          `;
        }
      }

      // 5f. Criar servico vinculado ao PCP original + transferencia_service_id
      const [novoServico] = await tx`
        INSERT INTO alissonerp.servicos
          (ordem_id, pcp_id, operador_id, status, foto_recebimento,
           recebido_em, transferencia_service_id)
        VALUES
          (${ordemId}::integer,
           ${pcpOriginalId ?? null}::integer,
           ${callerDepositoId}::integer,
           'em_servico',
           ${fotoUrl},
           NOW(),
           ${transfId}::integer)
        RETURNING id
      `;
      ids.push(novoServico.id as number);
    }

    // 5g. Atualizar ordens para status em_andamento (redundante mas garante consistência)
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'em_andamento'::alissonerp.enum_status_ordem,
          updated_at = NOW()
      WHERE id = ANY(${ordemIds}::int[])
    `;

    return ids;
  });

  return NextResponse.json({
    success: true,
    protocolo_id,
    servico_ids: servicoIds,
  });
}
