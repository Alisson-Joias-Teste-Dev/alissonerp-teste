// ═══════════════════════════════════════════════════════════════════════════
// Solicitação de Aprovação de Venda
//
// REGRA DE NEGÓCIO GERAL: cada tipo de aprovação (desconto, cartão, crédito)
// usa seu próprio campo em vendas_erp para não se bloquearem mutuamente.
// Antes da refatoração, UM campo (aprovacao_credito_tarefa_id) servia para
// os 3 tipos — uma tarefa de desconto pendente impedia a solicitação de
// crédito, e o gerente nunca recebia a aprovação.
//
// Se alterar: manter a separação dos campos. Mexer num não pode afetar o outro.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { submeterVendaParaAprovacaoCredito } from "@/lib/vendas-credito-aprovar";
import { approveVenda } from "@/lib/vendas-aprovar";
import { avaliarRegras, criarTarefaAprovacao, getDescontoThreshold } from "@/lib/aprovacao-regras";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const SolicitarAprovacaoSchema = z.object({
  tipo: z.string().max(50).optional(),
}).partial();

// ─── POST /api/vendas/[id]/solicitar-aprovacao ───────────────────────────────
// Consultora/gerente solicita aprovação de venda.
// Se tem "A Receber" → cria tarefa de aprovação de crédito.
// Se não tem "A Receber" e user é gerente+/admin/diretor → approveVenda direto.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsedBody = SolicitarAprovacaoSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const tipo = parsedBody.data.tipo ?? "";

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  // Validar venda em rascunho
  const descontoThreshold = await getDescontoThreshold(vendaId);
  const [venda] = await sql`
    SELECT v.id, v.status AS situacao, v.bloqueado,
           v.aprovacao_credito_tarefa_id,
           v.aprovacao_desconto_tarefa_id,
           v.aprovacao_cartao_desconto_tarefa_id,
           v.desconto_aprovado_por,
           v.desconto_cartao_aprovado_por,
           EXISTS(
             SELECT 1 FROM alissonerp.itens_venda_erp
             WHERE venda_id = ${vendaId} AND pct_desconto > ${descontoThreshold}
           ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda não está em rascunho" }, { status: 409 });
  }
  if (venda.bloqueado) {
    return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  }

  // Onda 1D: consultora so solicita aprovacao para venda propria
  try {
    await requireVendaOwnership({ id: user.id, role: usuario.role, email: user.email ?? "" }, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  // ── Bloquear solicitação de crédito/gerente se desconto > threshold não aprovado ─
  if (tipo !== "desconto" && venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    return NextResponse.json(
      { error: `Esta venda tem desconto acima de ${descontoThreshold}%. Solicite aprovação de desconto primeiro (tipo=desconto).` },
      { status: 409 }
    );
  }

  // ── Aprovação de desconto (via engine de regras) ─────────────────────────
  // Usa campo próprio aprovacao_desconto_tarefa_id — não conflita com crédito
  if (tipo === "desconto") {
    if (venda.aprovacao_desconto_tarefa_id) {
      return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: true, message: "Já existe aprovação pendente" });
    }

    const itensDesconto = await sql`
      SELECT pct_desconto FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > 0
      ORDER BY pct_desconto DESC
    `;
    const maiorDesconto = itensDesconto.length > 0
      ? Math.max(...itensDesconto.map(i => Number(i.pct_desconto)))
      : 0;

    const [vendaInfo] = await sql`
      SELECT numero_venda, total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;

    const regras = await avaliarRegras({
      tipo: "desconto_acima",
      venda_id: vendaId,
      percentual_desconto: maiorDesconto,
      valor_venda: Number(vendaInfo?.total_venda ?? 0),
    });

    if (regras.length === 0) {
      return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: false, message: "Nenhuma regra de aprovação aplicável" });
    }

    const regra = regras[0];

    const itensDetalhe = await sql`
      SELECT sku, nome_produto, preco_lista, pct_desconto, preco_unitario, quantidade
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > ${descontoThreshold}
      ORDER BY id
    `;
    const linhasItens = itensDetalhe.map((it) => {
      const sem = Number(it.preco_lista).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const com = Number(it.preco_unitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `• ${it.sku ?? "?"} — ${it.nome_produto ?? it.sku ?? "Produto"}\n  Tabela: ${sem} | Desconto: ${Number(it.pct_desconto).toFixed(0)}% | Final: ${com}`;
    }).join("\n");

    const tarefaId = await criarTarefaAprovacao(
      regra,
      {
        tipo: "desconto_acima",
        venda_id: vendaId,
        percentual_desconto: maiorDesconto,
        valor_venda: Number(vendaInfo?.total_venda ?? 0),
        venda_numero: vendaInfo?.numero_venda ?? `#${vendaId}`,
        venda_total: Number(vendaInfo?.total_venda ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        itens_desconto: linhasItens,
      },
      user.id,
    );

    await sql`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_desconto_tarefa_id = ${tarefaId}, updated_at = NOW()
      WHERE id = ${vendaId}
    `;

    return NextResponse.json({ ok: true, aguardando_aprovacao_desconto: true, tarefa_id: tarefaId });
  }

  // ── Aprovação para Cartão de Crédito com desconto >20% ───────────────────
  // Usa campo próprio aprovacao_cartao_desconto_tarefa_id — não conflita com crédito
  if (tipo === "cartao_desconto") {
    if (venda.desconto_cartao_aprovado_por) {
      return NextResponse.json({ ok: true, ja_aprovado: true, message: "Cartão de crédito já foi liberado para esta venda." });
    }
    if (venda.aprovacao_cartao_desconto_tarefa_id) {
      return NextResponse.json({ ok: true, aguardando_aprovacao_cartao: true, message: "Já existe aprovação pendente para cartão de crédito." });
    }

    // BLINDAGEM: gate de cartão só se a venda tem pagamento em Cartão de Crédito
    // de fato pendente. Sem isso, venda paga em Pix/Dinheiro com desconto >20%
    // disparava aprovação de cartão indevidamente (caso da venda 15516).
    const [pagCartao] = await sql`
      SELECT 1 FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Cartão de Crédito' AND status = 'pendente'
      LIMIT 1
    `;
    if (!pagCartao) {
      return NextResponse.json({ ok: true, message: "Esta venda não tem pagamento em cartão de crédito." });
    }

    const itensDesconto = await sql`
      SELECT pct_desconto FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > 20
      ORDER BY pct_desconto DESC
    `;
    if (itensDesconto.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum item com desconto acima de 20%." });
    }

    const maiorDesconto = Math.max(...itensDesconto.map(i => Number(i.pct_desconto)));

    const [vendaInfo] = await sql`
      SELECT numero_venda, total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;

    const regras = await avaliarRegras({
      tipo: "cartao_desconto",
      venda_id: vendaId,
      percentual_desconto: maiorDesconto,
      valor_venda: Number(vendaInfo?.total_venda ?? 0),
    });

    if (regras.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma regra de aprovação aplicável para cartão de crédito." });
    }

    const regra = regras[0];

    const itensDetalhe = await sql`
      SELECT sku, nome_produto, preco_lista, pct_desconto, preco_unitario, quantidade
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND pct_desconto > 20
      ORDER BY id
    `;
    const linhasItens = itensDetalhe.map((it) => {
      const sem = Number(it.preco_lista).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const com = Number(it.preco_unitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `• ${it.sku ?? "?"} — ${it.nome_produto ?? it.sku ?? "Produto"}\n  Tabela: ${sem} | Desconto: ${Number(it.pct_desconto).toFixed(0)}% | Final: ${com}`;
    }).join("\n");

    const tarefaId = await criarTarefaAprovacao(
      regra,
      {
        tipo: "cartao_desconto",
        venda_id: vendaId,
        percentual_desconto: maiorDesconto,
        valor_venda: Number(vendaInfo?.total_venda ?? 0),
        venda_numero: vendaInfo?.numero_venda ?? `#${vendaId}`,
        venda_total: Number(vendaInfo?.total_venda ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        itens_desconto: linhasItens,
      },
      user.id,
    );

    await sql`
      UPDATE alissonerp.vendas_erp
      SET aprovacao_cartao_desconto_tarefa_id = ${tarefaId}, updated_at = NOW()
      WHERE id = ${vendaId}
    `;

    return NextResponse.json({ ok: true, aguardando_aprovacao_cartao: true, tarefa_id: tarefaId });
  }

  // Verificar se já tem aprovação de crédito pendente (campo próprio, não afeta desconto/cartão)
  if (venda.aprovacao_credito_tarefa_id) {
    return NextResponse.json({
      ok: true,
      aguardando_aprovacao_credito: true,
      message: "Já existe uma aprovação pendente para esta venda",
    });
  }

  // Checar se tem "A Receber"
  const [aReceber] = await sql`
    SELECT COALESCE(SUM(valor), 0) AS total
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
  `;
  const totalAReceber = parseFloat(aReceber.total);

  if (totalAReceber > 0) {
    // Precisa aprovação de crédito
    try {
      const result = await submeterVendaParaAprovacaoCredito(vendaId, user.id);
      // Camada 2: bloqueio de validação (ex.: cliente sem celular) — não cria
      // a tarefa e devolve 409 com a mensagem pra consultora corrigir antes.
      if (result.erro) {
        return NextResponse.json({ error: result.erro }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        aguardando_aprovacao_credito: result.precisa_aprovacao,
        tipo_aprovacao: result.tipo,
        tarefa_id: result.tarefa_id,
        message: result.message,
      });
    } catch (err) {
      return internalError("[POST /api/vendas/[id]/solicitar-aprovacao]", err);
    }
  }

  // Sem "A Receber" — aprovar direto (qualquer role, incluindo consultora).
  // Dinheiro/Cartão/Pix não precisam aprovação do gerente de loja — essa
  // aprovação só é necessária quando há crédito (A Receber) envolvido.
  void usuario;
  try {
    const result = await approveVenda(vendaId, user.id, { tinyBestEffort: true });
    return NextResponse.json({
      ok: true,
      aguardando_aprovacao_credito: false,
      ordem_criada: result.ordem_criada,
      tiny_erro: result.tiny_erro,
    });
  } catch (err) {
    return internalError("[POST /api/vendas/[id]/solicitar-aprovacao] approveVenda", err, "Erro ao aprovar venda", 502);
  }
}
