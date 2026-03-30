import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

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

  const body = await req.json() as {
    protocolo_id: number;
    foto_base64: string;
  };

  const { protocolo_id, foto_base64 } = body;
  if (!protocolo_id) {
    return NextResponse.json({ error: "protocolo_id é obrigatório" }, { status: 400 });
  }
  if (!foto_base64) {
    return NextResponse.json({ error: "foto_base64 é obrigatória" }, { status: 400 });
  }

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

  // 2. Validar que TODAS as ordens do protocolo são de tipo service
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

  // 4. Concluir protocolo com guard de concorrência (WHERE etapas='pendente').
  //    Dispara fn_concluir_protocolo → cria PCP → trg_criar_servico_from_pcp cria
  //    servicos com operador_id=NULL e status='aguardando'.
  const [protocoloAtualizado] = await sql`
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
    return NextResponse.json(
      { error: "Este protocolo já foi recebido por outro operador" },
      { status: 409 }
    );
  }

  // 5. Buscar ordens do protocolo
  const ordemRows = await sql`
    SELECT ordem_id FROM alissonerp.protocolo_ordens
    WHERE protocolo_id = ${protocolo_id}
  `;
  const ordemIds = ordemRows.map(r => r.ordem_id as number);

  // 6. Atribuir servicos ao operador que clicou "Receber".
  //    AND operador_id IS NULL garante que só o primeiro recebimento é aceito.
  const servicosAssigned = await sql`
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

  const servicoIds = servicosAssigned.map(r => r.id as number);

  return NextResponse.json({
    success: true,
    protocolo_id,
    servico_ids: servicoIds,
  });
}
