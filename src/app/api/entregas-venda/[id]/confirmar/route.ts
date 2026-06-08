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
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { confirmarEntrega } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// Schema de validação do body
// REGRA DE NEGÓCIO: código de verificação obrigatório. foto_base64 é opcional
// e permite anexar comprovante visual da retirada/entrega.
const ConfirmarEntregaSchema = z.object({
  codigo: z
    .string()
    .min(1, "Código de verificação é obrigatório")
    .max(6, "Código deve ter no máximo 6 dígitos"),
  foto_base64: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Verifica se o usuário existe no ERP (qualquer role autenticada pode confirmar)
  const [usuario] = await sql`
    SELECT id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Validação do body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = ConfirmarEntregaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { codigo, foto_base64 } = parsed.data;

  // Delega a confirmação para a lib, que gerencia:
  // - Verificação de unicidade e validade do código
  // - Atualização dos campos de confirmação (data_saida, data_retirada, etc)
  // - Baixa de estoque (baixa_estoque_realizada = true)
  // - Upload da foto de entrega (se fornecida)
  // - Transação atômica e auditoria
  //
  // REGRA DE NEGÓCIO: a lib lança Error com mensagens específicas para
  // cada caso de erro (código inválido, já confirmada, já cancelada, etc).
  // Capturamos e retornamos como erro 400 para o frontend.
  try {
    const resultado = await confirmarEntrega(entregaId, codigo, user.id, foto_base64);

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
