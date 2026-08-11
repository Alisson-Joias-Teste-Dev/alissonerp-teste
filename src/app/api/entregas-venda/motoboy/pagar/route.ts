/**
 * POST /api/entregas-venda/motoboy/pagar
 *
 * REGRA DE NEGÓCIO: pagamento em lote (semanal). Admin, gerente_loja ou dev
 * seleciona N entregas confirmadas de um motoboy e confirma o pagamento.
 * Cria registro em pagamentos_motoboy (cabeçalho) + pagamentos_motoboy_itens
 * (entregas pagas). Cada entrega só pode ser paga 1x (UNIQUE).
 *
 * O QUE: recebe motoboy_id + lista de entrega_ids, valida que são entregas
 * confirmadas daquele motoboy e ainda não pagas, cria o pagamento.
 *
 * REGRA DE NEGÓCIO (21/07/2026 — reforma "relatórios persistidos" da aba
 * Pagamento do motoboy, ver docs/regras-negocio/entregas.md §12.8): o INSERT
 * de fato (cabeçalho + itens + conta a pagar) foi extraído para
 * `src/lib/pagamento-motoboy.ts` (`criarPagamentoMotoboyTx`) para ser
 * REUSADO por `motoboy/relatorio-pagamento/[id]/confirmar` (confirmar
 * pagamento a partir de um relatório salvo) sem duplicar a lógica. Esta rota
 * continua com o MESMO contrato (request/response) de antes — só passou a
 * chamar a função compartilhada.
 *
 * IMPACTO SE ALTERADO: remover validação de unicidade permite pagamento
 * duplicado. Remover validação de motoboy_id permite pagar entrega de
 * outro motoboy. Mudar a assinatura de `criarPagamentoMotoboyTx` afeta
 * também a confirmação via relatório.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import {
  ROLES_PAGAMENTO_MOTOBOY,
  buscarEntregasValidasParaPagar,
  criarPagamentoMotoboyTx,
  vencimentoPadrao,
} from "@/lib/pagamento-motoboy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

const ROLES_PERMITIDOS = ROLES_PAGAMENTO_MOTOBOY;

const PagarMotoboySchema = z.object({
  motoboy_id: z.string().min(1, "Motoboy é obrigatório"),
  entrega_ids: z.array(z.number().int().positive()).min(1, "Selecione pelo menos uma entrega"),
  observacoes: z.string().max(500).optional(),
  data_vencimento: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = PagarMotoboySchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { motoboy_id, entrega_ids, observacoes, data_vencimento } = parsed.data;

  // Busca nome do motoboy para descrição da conta a pagar
  const [motoboy] = await sql`
    SELECT nome FROM alissonerp.motoboys
    WHERE user_id = ${motoboy_id}::uuid LIMIT 1
  `;
  const motoboyNome = (motoboy as { nome: string } | null)?.nome ?? "Motoboy";

  // Data de vencimento: padrão hoje + 7 dias se não informada
  const vencimento = data_vencimento ?? vencimentoPadrao();

  // Validação: as entregas pertencem ao motoboy, estão confirmadas e não pagas
  // (função compartilhada — mesma condição usada na confirmação via relatório).
  let entregas: Awaited<ReturnType<typeof buscarEntregasValidasParaPagar>> = [];

  try {
    await sql.begin(async (tx: DbTx) => {
      entregas = await buscarEntregasValidasParaPagar(tx, motoboy_id, entrega_ids);

      if (entregas.length === 0) {
        // REGRA DE NEGÓCIO: lançar dentro da tx para abortar o begin() sem
        // gravar nada — o catch abaixo trata como erro de validação (400),
        // não como falha de banco.
        throw new Error("NENHUMA_ENTREGA_VALIDA");
      }

      // Transação: criar pagamento + itens + conta a pagar (lógica
      // compartilhada com a confirmação via relatório salvo).
      await criarPagamentoMotoboyTx(tx, {
        motoboyId: motoboy_id,
        motoboyNome,
        entregas,
        observacoes,
        dataVencimento: vencimento,
        userId: user.id,
      });
    });

    const valorTotal = entregas.reduce((sum, e) => sum + e.frete_motoboy, 0);

    return NextResponse.json({
      ok: true,
      entregas_pagas: entregas.length,
      valor_total: valorTotal,
      message: `${entregas.length} entrega(s) paga(s). Total: R$ ${valorTotal.toFixed(2)}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NENHUMA_ENTREGA_VALIDA") {
      return NextResponse.json(
        { error: "Nenhuma entrega válida encontrada. Verifique se as entregas são confirmadas, pertencem ao motoboy e ainda não foram pagas." },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Erro ao registrar pagamento";
    console.error("[motoboy/pagar] Erro:", err);
    // Trata violação de UNIQUE (pagamento duplicado)
    if (message.includes("duplicate") || message.includes("unicidade") || message.includes("unique")) {
      return NextResponse.json(
        { error: "Uma ou mais entregas selecionadas já foram pagas. Recarregue a lista." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
