/**
 * PATCH /api/entregas-venda/[id]/correios
 * [id] = entrega_id em entregas_venda
 *
 * Atualiza os dados de rastreio dos Correios (ou transportadora) para uma entrega.
 *
 * REGRA DE NEGÓCIO: quando uma entrega é despachada via Correios,
 * o código de rastreio e a data de postagem são registrados para que
 * o cliente possa acompanhar o envio. Também suporta código de rastreio
 * de transportadoras (Jadlog, Azul Cargo, etc).
 *
 * O QUE: recebe o código de rastreio no body, valida que a entrega existe
 * e não está cancelada, e delega para atualizarCorreios() da lib que faz
 * a transação atômica com atualização de correios_rastreio e
 * correios_data_postagem, além de auditoria.
 *
 * POR QUE: centraliza o rastreio na entrega, permitindo que o frontend
 * exiba o link de rastreamento e o cliente acompanhe online.
 *
 * IMPACTO SE ALTERADO: se os campos forem renomeados, o frontend de
 * acompanhamento de entrega para de mostrar o rastreio.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { atualizarCorreios } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// Schema de validação: apenas o código de rastreio é obrigatório
const AtualizarCorreiosSchema = z.object({
  rastreio: z
    .string()
    .min(1, "Código de rastreio é obrigatório")
    .max(100, "Código de rastreio muito longo"),
});

export async function PATCH(
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

  // Verifica se o usuário existe no ERP
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

  const parsed = AtualizarCorreiosSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { rastreio } = parsed.data;

  // Delega para a lib, que gerencia:
  // - Validação de que a entrega existe e não está cancelada
  // - Atualização de correios_rastreio e correios_data_postagem
  // - Transação atômica e auditoria
  //
  // REGRA DE NEGÓCIO: a lib retorna o registro atualizado da entrega.
  // Retornamos o objeto completo para o frontend atualizar a UI.
  try {
    const updated = await atualizarCorreios(entregaId, rastreio, user.id);

    return NextResponse.json({
      ...updated,
      mensagem: "Rastreio atualizado com sucesso",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar rastreio";
    console.error("[entregas-venda/correios] Erro:", err);

    if (message.includes("não encontrada")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("cancelada")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
