import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import { podeDecidir } from "@/lib/aprovacoes";
import { resolverPrecoCheio, buscarFaixasComissao, calcularComissaoItem } from "@/lib/comissao-item";

const SolicitacaoDescontoPatchSchema = z.object({
  status: z.enum(["aprovado", "rejeitado"]),
  observacao: z.string().optional(),
}).passthrough();

// GET — qualquer usuário autenticado pode checar o status (para polling)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const [row] = await sql`
    SELECT id, status, pct_desconto_solicitado, preco_solicitado, autorizado_por_nome
    FROM alissonerp.solicitacoes_desconto
    WHERE id = ${Number(id)}
  `;
  if (!row) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  return NextResponse.json(row);
}

// PATCH — decisão pela camada config-first (Fase 4, item 3): só quem está configurado em
// Configurações › Aprovadores (chave aprovador_desconto_padrao, evento "desconto") decide — a
// MESMA autoridade da porta oficial (tarefa, tarefas/[id]/aprovacao). Antes era hardcoded
// admin/desenvolvedor, divergindo da porta oficial (que já usava podeDecidir desde a Fase 3g.3).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT nome, role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // REGRA DE NEGÓCIO (Fase 4, item 3): mesma chave/evento que a porta oficial (via tarefa) usa —
  // "desconto" / aprovador_desconto_padrao. Sem ctx.solicitanteId (desconto não exclui quem
  // solicitou, igual à porta oficial). Config vazia/inativa → ninguém decide (nem admin).
  const dec = await podeDecidir({ id: user.id, role: u.role ?? null }, "desconto");
  if (!dec.pode) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitacaoDescontoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const [solicitacao] = await sql`
    SELECT id, item_id, venda_id, pct_desconto_solicitado, preco_solicitado,
           preco_lista, status AS current_status
    FROM alissonerp.solicitacoes_desconto
    WHERE id = ${Number(id)}
  `;
  if (!solicitacao) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (solicitacao.current_status !== "pendente") {
    return NextResponse.json({ error: "Solicitação já processada" }, { status: 409 });
  }

  const nomeAuth = (u.nome as string) || user.email || "";

  await sql`
    UPDATE alissonerp.solicitacoes_desconto
    SET status             = ${body.status},
        autorizado_por_id  = ${user.id}::uuid,
        autorizado_por_nome = ${nomeAuth},
        observacao         = COALESCE(${body.observacao ?? null}, observacao),
        updated_at         = now()
    WHERE id = ${Number(id)}
  `;

  // Se aprovado e item já existe: aplicar desconto diretamente no item
  if (body.status === "aprovado" && solicitacao.item_id) {
    const pct        = Number(solicitacao.pct_desconto_solicitado);
    const precoLista = Number(solicitacao.preco_lista);
    const precoUnit  = precoLista * (1 - pct / 100);

    const [item] = await sql`
      SELECT quantidade, produto_id FROM alissonerp.itens_venda_erp
      WHERE id = ${solicitacao.item_id}
    `;
    if (item) {
      const totalItem = precoUnit * Number(item.quantidade);

      // REGRA DE NEGÓCIO (Fase 4, item 3 — fim do 0% fixo): comissão pela MESMA regra da porta
      // oficial (tarefas/[id]/aprovacao/route.ts, bloco "desconto_acima"): acima de 30% de
      // desconto, comissão fixa em 0,5%; senão, pela tabela de faixas (faixas_comissao) pelo
      // desconto real do item. Antes esta porta zerava a comissão sempre — divergia da oficial.
      //
      // ⚠️ CORREÇÃO 03/08/2026: o desconto da COMISSÃO sai do preço CHEIO, não do
      // `pct` solicitado. `solicitacao.preco_lista` é o preço PROMOCIONAL num item
      // em campanha — medir por ele dá um desconto menor e uma faixa maior do que
      // a devida. O `pct` solicitado continua sendo o da ALÇADA (é sobre o preço
      // promocional que a vendedora pede aprovação; promoção é pré-aprovada e não
      // entra na conta da alçada). São dois descontos diferentes de propósito.
      // Ver comissao-item.ts.
      const precoCheio = await resolverPrecoCheio(item.produto_id ?? null, precoLista);
      const faixas = await buscarFaixasComissao();
      const calc = calcularComissaoItem(precoCheio, precoUnit, totalItem, faixas);

      await sql`
        UPDATE alissonerp.itens_venda_erp
        SET pct_desconto          = ${pct},
            preco_unitario        = ${precoUnit},
            total_item            = ${totalItem},
            preco_lista_cheio     = ${calc.preco_lista_cheio},
            pct_comissao          = ${calc.pct_comissao},
            valor_comissao        = ${calc.valor_comissao},
            desconto_autorizado_por = ${user.id}::uuid
        WHERE id = ${solicitacao.item_id}
      `;
    }
  }

  // REGRA DE NEGÓCIO (Fase 4, item 3 — fecha o R3 do dossiê): grava o lock canônico da venda
  // (vendas_erp.desconto_aprovado_por/_em) quando a solicitação tem venda_id — independente de
  // ter item_id — sem isso, o portão do crédito (vendas-aprovar.ts, baixa-credito.ts) continuava
  // vendo a venda travada mesmo depois do desconto ter sido aprovado por esta porta (item-a-item).
  if (body.status === "aprovado" && solicitacao.venda_id) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET desconto_aprovado_por = ${user.id}::uuid,
          desconto_aprovado_em  = NOW(),
          updated_at = NOW()
      WHERE id = ${solicitacao.venda_id}
    `;
  }

  return NextResponse.json({ ok: true, status: body.status });
}
