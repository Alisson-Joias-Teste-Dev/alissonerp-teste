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
 * IMPACTO SE ALTERADO: remover validação de unicidade permite pagamento
 * duplicado. Remover validação de motoboy_id permite pagar entrega de
 * outro motoboy.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja"];

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
  const vencimento = data_vencimento ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  // Validação: as entregas pertencem ao motoboy, estão confirmadas e não pagas
  const entregasRows: Record<string, unknown>[] = await sql`
    SELECT ev.id, ev.frete_motoboy, ev.codigo_entrega, ev.situacao
    FROM alissonerp.entregas_venda ev
    WHERE ev.id = ANY(${entrega_ids})
      AND ev.motoboy_id = ${motoboy_id}::uuid
      AND ev.situacao = 'confirmada'
      AND NOT EXISTS (
        SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi
        WHERE pmi.entrega_id = ev.id
      )
  `;

  if (entregasRows.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma entrega válida encontrada. Verifique se as entregas são confirmadas, pertencem ao motoboy e ainda não foram pagas." },
      { status: 400 },
    );
  }

  const entregas = entregasRows.map((r) => ({
    id: Number(r.id),
    frete_motoboy: Number(r.frete_motoboy ?? 0),
  }));

  const valorTotal = entregas.reduce((sum, e) => sum + e.frete_motoboy, 0);

  // Transação: criar pagamento + itens + conta a pagar
  try {
    await sql.begin(async (tx: DbTx) => {
      const [pagamento] = await tx`
        INSERT INTO alissonerp.pagamentos_motoboy
          (motoboy_id, valor_total, observacoes, created_by)
        VALUES
          (${motoboy_id}::uuid, ${valorTotal}, ${observacoes ?? null}, ${user.id}::uuid)
        RETURNING id
      `;

      for (const e of entregas) {
        await tx`
          INSERT INTO alissonerp.pagamentos_motoboy_itens
            (pagamento_id, entrega_id, frete_motoboy)
          VALUES
            (${Number(pagamento.id)}, ${e.id}, ${e.frete_motoboy})
        `;
      }

      // REGRA DE NEGÓCIO: ao pagar motoboy, criar conta a pagar no financeiro.
      // Isso faz o pagamento aparecer em Contas a Pagar e no fluxo de caixa.
      // Categoria 'motoboy' permite filtrar/fechar por tipo de despesa.
      const codigosStr = entregas.map((e) => (e as Record<string, unknown>).codigo_entrega).join(", ");
      await tx`
        INSERT INTO alissonerp.contas_pagar
          (descricao, valor, data_vencimento, situacao, categoria, obs, created_by)
        VALUES
          (
            ${`Pagamento ${motoboyNome} — ${entregas.length} entregas`},
            ${valorTotal},
            ${vencimento}::date,
            'pendente',
            'motoboy',
            ${`Entregas: ${codigosStr}. ${observacoes ?? ""}`},
            ${user.id}::uuid
          )
      `;
    });

    return NextResponse.json({
      ok: true,
      entregas_pagas: entregas.length,
      valor_total: valorTotal,
      message: `${entregas.length} entrega(s) paga(s). Total: R$ ${valorTotal.toFixed(2)}`,
    });
  } catch (err) {
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
