import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ServiceReceberSchema = z.object({
  protocolo_id: z.coerce.number().int().positive(),
  foto_base64: z.string().min(1, "obrigatório"),
}).passthrough();

// POST /api/service/receber
// Quem clicou "Receber" fica com a peça — primeiro operador que chamar esta rota leva.
// Fluxo: valida protocolo pendente → upload foto → conclui protocolo (dispara
//   fn_concluir_protocolo → PCP → trg_criar_servico_from_pcp cria servico com operador_id=NULL)
//   → atribui servicos ao caller (guard AND operador_id IS NULL evita dupla atribuição).
// Auth: is_operador_service = true OU fullAccess

export async function POST(req: NextRequest) {
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

  if (!caller.deposito_id) {
    return NextResponse.json({ error: "Usuário não possui depósito/operador vinculado" }, { status: 422 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ServiceReceberSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { protocolo_id, foto_base64 } = parsed.data;

  // 1. Validar protocolo
  const [protocolo] = await sql`
    SELECT id, direcao, etapas FROM alissonerp.protocolos
    WHERE id = ${protocolo_id} AND direcao = 'ida' AND etapas = 'pendente'
  `;
  if (!protocolo) {
    return NextResponse.json(
      { error: "Protocolo não encontrado, não é uma ida ou já foi concluído" },
      { status: 404 }
    );
  }

  // 2. Validar que TODAS as ordens são de tipo service OU vieram de transferência PCP→Service
  const isTransfService = await sql`
    SELECT 1 FROM alissonerp.transferencias_ordem t
    WHERE t.protocolo_id = ${protocolo_id} AND t.tipo_transferencia = 'service'
    LIMIT 1
  `;
  if (isTransfService.length === 0) {
    // Protocolo normal: validar tipo_ordem
    const ordensNaoService = await sql`
      SELECT o.id FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON o.id = po.ordem_id
      WHERE po.protocolo_id = ${protocolo_id}
        AND o.tipo_ordem::text NOT IN (
          SELECT jsonb_array_elements_text(
            COALESCE(
              (SELECT valor::jsonb FROM alissonerp.configuracoes_sistema WHERE chave = 'service_tipos_ordem'),
              '["servico_venda","garantia","servico_interno"]'::jsonb
            )
          )
        )
    `;
    if (ordensNaoService.length > 0) {
      return NextResponse.json(
        { error: "Este protocolo contém ordens que não são do módulo Service" },
        { status: 422 }
      );
    }
  }

  // 3. Upload foto de recebimento
  const contentType = foto_base64.startsWith("data:image/png") ? "image/png"
    : foto_base64.startsWith("data:image/webp") ? "image/webp"
    : "image/jpeg";
  const fotoPath = `service/${protocolo_id}/recebimento-${Date.now()}.jpg`;
  const uploadResult = await uploadFile("service-fotos", fotoPath, foto_base64, contentType);
  if ("error" in uploadResult) {
    return NextResponse.json({ error: `Erro no upload da foto: ${uploadResult.error}` }, { status: 500 });
  }
  const fotoUrl = uploadResult.url;

  // 4-6. Transação atômica: conclui protocolo + atribui serviços ao operador.
  //    Se qualquer passo falhar, tudo é revertido.
  let servicoIds: number[] = [];
  try {
    await (sql as any).begin(async (tx: typeof sql) => {
      // 4. Concluir protocolo com guard de concorrência (WHERE etapas='pendente').
      //    Dispara fn_concluir_protocolo → cria PCP → trg_criar_servico_from_pcp cria
      //    servicos com operador_id=NULL e status='aguardando'.
      const [protocoloAtualizado] = await tx`
        UPDATE alissonerp.protocolos
        SET etapas         = 'concluido',
            recebedor_id   = ${user.id}::uuid,
            foto_conclusao = ${fotoUrl},
            data_conclusao = NOW(),
            updated_at     = NOW()
        WHERE id = ${protocolo_id}
          AND etapas = 'pendente'
        RETURNING id
      `;
      if (!protocoloAtualizado) {
        throw new Error("RACE_CONDITION");
      }

      // 5. Buscar ordens do protocolo
      const ordemRows = await tx`
        SELECT ordem_id FROM alissonerp.protocolo_ordens
        WHERE protocolo_id = ${protocolo_id}
      `;
      const ordemIds = ordemRows.map(r => r.ordem_id as number);

      // 6. Verificar se é transferência service
      const [isTransf] = await tx`
        SELECT id, pcp_id FROM alissonerp.transferencias_ordem
        WHERE protocolo_id = ${protocolo_id} AND tipo_transferencia = 'service'
        LIMIT 1
      `;

      if (isTransf) {
        // Transferência PCP→Service: criar servico manualmente
        // (fn_concluir_protocolo não cria PCP novo pois já existe)
        for (const ordemId of ordemIds) {
          // Buscar PCP ativo desta ordem
          const [pcp] = await tx`
            SELECT id FROM alissonerp.pcp
            WHERE ordem_id = ${ordemId}
              AND etapas NOT IN ('concluido', 'cancelado')
            ORDER BY id DESC LIMIT 1
          `;
          const [existente] = await tx`
            SELECT id FROM alissonerp.servicos
            WHERE ordem_id = ${ordemId}
              AND status IN ('em_servico', 'aguardando')
            LIMIT 1
          `;
          if (!existente) {
            const [peso] = await tx`
              SELECT COALESCE(peso_peca_servico, 0) AS peso FROM alissonerp.ordens WHERE id = ${ordemId}
            `;
            const [novo] = await tx`
              INSERT INTO alissonerp.servicos
                (ordem_id, pcp_id, operador_id, peso_entrada, status,
                 foto_recebimento, recebido_em, transferencia_service_id)
              VALUES
                (${ordemId}, ${pcp?.id ?? null}, ${caller.deposito_id as number},
                 ${Number(peso?.peso ?? 0)}, 'em_servico',
                 ${fotoUrl}, NOW(), ${isTransf.id})
              RETURNING id
            `;
            servicoIds.push(novo.id as number);
          } else {
            // Já existe: atualizar operador
            await tx`
              UPDATE alissonerp.servicos
              SET operador_id = ${caller.deposito_id as number},
                  status = 'em_servico',
                  foto_recebimento = ${fotoUrl},
                  recebido_em = NOW()
              WHERE id = ${existente.id}
            `;
            servicoIds.push(existente.id as number);
          }
        }
      } else {
        // Protocolo normal: atribuir servicos existentes ao operador
        // AND operador_id IS NULL garante que só o primeiro recebimento é aceito.
        const servicosAssigned = await tx`
          UPDATE alissonerp.servicos
          SET operador_id      = ${caller.deposito_id as number},
              status           = 'em_servico',
              foto_recebimento = ${fotoUrl},
              recebido_em      = NOW()
          WHERE ordem_id = ANY(${ordemIds}::int[])
            AND status = 'aguardando'
            AND operador_id IS NULL
          RETURNING id
        `;
        servicoIds = servicosAssigned.map(r => r.id as number);
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RACE_CONDITION") {
      return NextResponse.json(
        { error: "Este protocolo já foi recebido por outro operador" },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({
    success: true,
    protocolo_id,
    servico_ids: servicoIds,
  });
}
