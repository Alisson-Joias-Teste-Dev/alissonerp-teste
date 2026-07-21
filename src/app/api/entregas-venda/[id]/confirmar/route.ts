/**
 * POST /api/entregas-venda/[id]/confirmar
 * [id] = entrega_id em entregas_venda
 *
 * Confirma uma entrega usando o código de verificação informado.
 *
 * REGRA DE NEGÓCIO: o fluxo de confirmação usa dois códigos distintos:
 *   - CÓDIGO B (codigo_motoboy): entregue ao motoboy para retirar na loja.
 *     Quando usado, registra data_saida e baixa estoque (etapa 'retirada_loja').
 *   - CÓDIGO A (codigo_cliente): entregue ao cliente.
 *     Se forma_entrega='retirada': cliente retirou na loja → data_retirada,
 *       situacao='confirmada', etapa='retirada_loja'.
 *     Se forma_entrega='motoboy': cliente recebeu em casa → data_entrega_realizada,
 *       situacao='confirmada', etapa='entrega_cliente'.
 *
 * A baixa de estoque (baixa_estoque_realizada = true) ocorre na confirmação,
 * seja pela retirada do motoboy ou pelo recebimento do cliente.
 *
 * O QUE: recebe o código do body, busca a entrega, valida o código contra
 * os códigos de verificação (codigo_cliente / codigo_motoboy), e delega
 * para confirmarEntrega() da lib que faz a transação atômica completa.
 *
 * POR QUE: o sistema de dois códigos garante segurança — apenas quem possui
 * o código correto pode confirmar a entrega, prevenindo retiradas indevidas.
 *
 * IMPACTO SE ALTERADO: a baixa de estoque é disparada aqui. Alterar este
 * fluxo pode causar estoque inconsistente (dupla baixa ou baixa faltante).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmarEntrega, MAX_FOTOS_ENTREGA } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";
import { authOr401, ForbiddenError } from "@/lib/auth-server";
import { requireEntregaVendaAccess, NotFoundError } from "@/lib/auth-vendas";
import { LIMITS, checkArrayLength, checkBase64Length, payloadTooLargeResponse } from "@/lib/payload-limits";

// Schema de validação do body
// REGRA DE NEGÓCIO: código de verificação obrigatório — NUNCA mexer nesta
// validação por causa das fotos (ver comentário abaixo). fotos_base64 é
// OPCIONAL (migration 357) e permite anexar VÁRIAS fotos de comprovação da
// retirada/entrega — até MAX_FOTOS_ENTREGA.
const ConfirmarEntregaSchema = z.object({
  codigo: z
    .string()
    .min(1, "Código de verificação é obrigatório")
    .max(6, "Código deve ter no máximo 6 dígitos"),
  fotos_base64: z.array(z.string().max(LIMITS.IMAGE_BASE64_MAX)).max(MAX_FOTOS_ENTREGA).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // REGRA DE NEGÓCIO (Blindagem 2026-06): confirmar entrega exige permissão real:
  //   - roles de vendas (admin/dev/diretor/gerentes) — operador do balcão;
  //   - consultora dona da venda;
  //   - motoboy DESIGNADO desta entrega (confirma o código A do cliente no app).
  // POR QUE: antes qualquer usuário autenticado confirmava qualquer entrega,
  // dando baixa de estoque indevida (falha C1 da análise).
  // IMPACTO SE REMOVIDO: volta o buraco de segurança e a baixa por engano.
  try {
    await requireEntregaVendaAccess(user, entregaId, { permitirMotoboy: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Validação do body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = ConfirmarEntregaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { codigo, fotos_base64 } = parsed.data;

  // Defesa em profundidade (zod já limita acima) — mesmo padrão de
  // src/app/api/produtos/[id]/imagens/route.ts.
  if (fotos_base64) {
    try {
      checkArrayLength("fotos_base64", fotos_base64, MAX_FOTOS_ENTREGA);
      fotos_base64.forEach((f, i) => checkBase64Length(`fotos_base64[${i}]`, f, LIMITS.IMAGE_BASE64_MAX));
    } catch (e) {
      const r = payloadTooLargeResponse(e);
      if (r) return r;
      throw e;
    }
  }

  // Delega a confirmação para a lib, que gerencia:
  // - Verificação de unicidade e validade do código (SEMPRE antes de tudo —
  //   ver ordem inviolável no comentário de confirmarEntrega)
  // - Atualização dos campos de confirmação (data_saida, data_retirada, etc)
  // - Baixa de estoque (baixa_estoque_realizada = true)
  // - Upload das fotos de entrega, se fornecidas (opcional, best-effort,
  //   processado só DEPOIS do código validado — nunca condiciona a aprovação)
  // - Transação atômica e auditoria
  //
  // REGRA DE NEGÓCIO: a lib lança Error com mensagens específicas para
  // cada caso de erro (código inválido, já confirmada, já cancelada, etc).
  // Capturamos e retornamos como erro 400 para o frontend.
  try {
    const resultado = await confirmarEntrega(entregaId, codigo, user.id, fotos_base64);

    // Mensagem amigável conforme a etapa da confirmação
    // REGRA DE NEGÓCIO: mensagens diferentes ajudam o operador a entender
    // o que acabou de acontecer (retirada pelo motoboy vs entrega ao cliente).
    if (resultado.etapa === "retirada_loja") {
      if (resultado.situacao === "confirmada") {
        return NextResponse.json({
          mensagem: "Baixa de estoque realizada. Entrega concluída.",
          ...resultado,
        });
      }
      return NextResponse.json({
        mensagem: "Retirada pelo motoboy registrada. Entrega em andamento.",
        ...resultado,
      });
    }

    // etapa === 'entrega_cliente'
    return NextResponse.json({
      mensagem: "Entrega confirmada pelo cliente.",
      ...resultado,
    });
  } catch (err) {
    // Traduz erros da lib em respostas HTTP amigáveis
    const message = err instanceof Error ? err.message : "Erro ao confirmar entrega";
    console.error("[entregas-venda/confirmar] Erro:", err);

    // Mapeia mensagens conhecidas para status HTTP apropriados
    if (message.includes("Código inválido")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("já foi confirmada") || message.includes("já foi retirada") || message.includes("já foi entregue")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("cancelada")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("não encontrada")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
