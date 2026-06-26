/**
 * PATCH /api/entregas-venda/[id]/transporte
 * [id] = entrega_id em entregas_venda
 *
 * Atualiza os dados de transporte de uma entrega (região, motoboy, frete,
 * data prevista). Permite ajustes logísticos pós-criação sem precisar
 * cancelar e recriar a entrega.
 *
 * REGRA DE NEGÓCIO: apenas os campos informados no body são alterados
 * (partial update / PATCH). Se a região mudar, o frete_motoboy é
 * recalculado automaticamente. Se o frete_motoboy for alterado,
 * aprovacao_frete_necessaria é recalculada comparando com frete_cobrado.
 *
 * O QUE: recebe os campos de transporte no body, valida que a entrega
 * existe e não está cancelada, e delega para atualizarTransporte() da lib.
 *
 * POR QUE: flexibilidade operacional — troca de motoboy, mudança de rota
 * ou ajuste de data não devem exigir recriar toda a entrega, o que
 * geraria novos códigos e confundiria o cliente.
 *
 * IMPACTO SE ALTERADO: a lógica de recálculo de frete e aprovação está
 * na lib. Se esta rota for contornada, alterações manuais via SQL podem
 * deixar aprovacao_frete_necessaria inconsistente com a realidade.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { atualizarTransporte } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// Schema de validação: todos os campos são opcionais (partial update)
// REGRA DE NEGÓCIO: o frontend envia apenas os campos que o usuário alterou.
// A lib aplica apenas as mudanças recebidas, sem sobrescrever o resto com null.
const AtualizarTransporteSchema = z.object({
  regiao: z
    .enum(["fortaleza", "fora_fortaleza", "longe", "correios"])
    .optional(),
  motoboyId: z.string().optional(),
  freteMotoboy: z.number().nonnegative("Frete não pode ser negativo").optional(),
  dataEntregaPrevista: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Data deve estar no formato YYYY-MM-DD")
    .optional(),
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

  const parsed = AtualizarTransporteSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  // REGRA DE NEGÓCIO: pelo menos um campo deve ser informado.
  // A lib também valida isso internamente, mas fazemos aqui para
  // dar feedback rápido ao frontend.
  if (
    body.regiao === undefined &&
    body.motoboyId === undefined &&
    body.freteMotoboy === undefined &&
    body.dataEntregaPrevista === undefined
  ) {
    return NextResponse.json(
      { error: "Pelo menos um campo deve ser informado para atualização" },
      { status: 400 },
    );
  }

  // Delega para a lib, que gerencia:
  // - Validação de que a entrega existe e não está cancelada
  // - Atualização dinâmica apenas dos campos informados (SET parcial)
  // - Recálculo de frete_motoboy se região mudou
  // - Recálculo de aprovacao_frete_necessaria se frete ou região mudou
  // - Transação atômica e auditoria
  try {
    const updated = await atualizarTransporte(
      entregaId,
      {
        regiao: body.regiao,
        motoboyId: body.motoboyId,
        freteMotoboy: body.freteMotoboy,
        dataEntregaPrevista: body.dataEntregaPrevista,
      },
      user.id,
    );

    return NextResponse.json({
      ...updated,
      mensagem: "Transporte atualizado com sucesso",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar transporte";
    console.error("[entregas-venda/transporte] Erro:", err);

    if (message.includes("não encontrada")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("cancelada")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("Nenhum dado")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
