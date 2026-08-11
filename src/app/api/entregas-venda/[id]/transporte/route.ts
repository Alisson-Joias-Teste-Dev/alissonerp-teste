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
import { atualizarTransporte } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";
import { authOr401, ForbiddenError } from "@/lib/auth-server";
import { requireEntregaVendaAccess, NotFoundError } from "@/lib/auth-vendas";

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
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  /**
   * REGRA DE NEGÓCIO (fecha buraco de autorização, 21/07 — o mais grave dos 3):
   * antes esta rota só verificava que o usuário EXISTIA em alissonerp.usuarios
   * — QUALQUER autenticado (motoboy incluso) conseguia alterar frete_motoboy e
   * motoboy_id de QUALQUER entrega. Isso permitia:
   *   (a) inflar o próprio acerto — o pagamento do motoboy lê
   *       ev.frete_motoboy no momento de pagar;
   *   (b) roubar corrida do pool contornando o claim atômico de
   *       aceitarFreteAvulso (entregas-venda/[id]/aceitar-avulso/route.ts).
   *
   * O QUE: reusa requireEntregaVendaAccess (auth-vendas.ts) SEM
   * permitirMotoboy — mesmo padrão de cancelar/route.ts (a rota irmã mais
   * próxima: também é uma alteração administrativa da entrega, não uma ação
   * do motoboy na rua). Libera:
   *   - roles de vendas full (admin/dev/diretor/gerente_loja/gerente_fabrica);
   *   - consultora dona da venda da entrega.
   * Motoboy/entregador NÃO entram aqui de propósito — são o vetor de abuso
   * descrito acima (frete e atribuição de motoboy são decisão de loja/gestão,
   * não do próprio entregador).
   *
   * MAPEAMENTO DE CHAMADORES (21/07): o único ponto do front que chama este
   * PATCH é components/entregas/AprovacaoFreteModal.tsx — e este componente
   * NÃO é importado/renderizado em NENHUM lugar da árvore atual (grep por
   * "<AprovacaoFreteModal" não retorna nada) — ou seja, hoje não existe fluxo
   * de produção usando esta rota. Isso reduz a zero o risco de quebrar tela
   * existente ao restringir o gate.
   *
   * IMPACTO SE REMOVIDO: reabre o buraco — qualquer autenticado volta a poder
   * alterar transporte de qualquer entrega.
   */
  try {
    await requireEntregaVendaAccess(user, entregaId);
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
