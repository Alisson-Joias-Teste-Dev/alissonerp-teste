import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { podedarBaixaCaixa } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * Caixa — conferência dos pagamentos recebidos pelo MOTOBOY na entrega (Etapa 2).
 *
 * REGRA DE NEGÓCIO (13/06 — Jonathan): Dinheiro/Ouro que o motoboy recebeu na rua
 * ficam 'aguard_conferencia' — não entram no financeiro até o caixa CONFERIR. Aqui
 * o caixa vê esses pendentes (GET) e confirma cada um (POST). Ao confirmar, o status
 * vira 'confirmado' e os gatilhos que JÁ existem fazem o resto: dinheiro entra na
 * baixa do caixa, ouro entra no cofre (fn_venda_baixar_recebimento_pago cria a CR;
 * fn_rastreio_pagamento_ouro registra no cofre). Depois disso o fluxo é o de sempre.
 *
 * IMPACTO SE REMOVIDO: dinheiro/ouro do motoboy nunca entra no financeiro, ou entra
 * sem conferência.
 */

// ─── GET: lista os pagamentos do motoboy aguardando conferência ──────────────
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !podedarBaixaCaixa(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const pendentes = await sql`
    SELECT
      p.id, p.forma, p.valor::numeric AS valor,
      p.ouro_gramas::numeric AS ouro_gramas, p.ouro_valor_grama::numeric AS ouro_valor_grama,
      p.data_confirmacao::text AS data_confirmacao,
      v.id AS venda_id, v.numero_venda,
      c.nome AS cliente_nome,
      mb.nome AS motoboy_nome
    FROM alissonerp.pagamentos_venda p
    JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN LATERAL (
      SELECT ev.motoboy_id FROM alissonerp.entregas_venda ev
      WHERE ev.venda_id = v.id AND ev.motoboy_id IS NOT NULL
      ORDER BY ev.id DESC LIMIT 1
    ) e ON true
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = e.motoboy_id
    -- Não listar pagamento de venda CANCELADA (senão o caixa confirmaria dinheiro
    -- de uma venda que não existe mais). Bug pego no code-review 13/06.
    WHERE p.status = 'aguard_conferencia' AND p.forma IN ('Dinheiro', 'Ouro')
      AND v.situacao <> 'cancelado'
    ORDER BY p.data_confirmacao ASC NULLS LAST, p.id ASC
  `;

  return NextResponse.json({
    pendentes: pendentes.map((p) => ({
      id: Number(p.id),
      forma: p.forma,
      valor: Number(p.valor ?? 0),
      ouro_gramas: p.ouro_gramas != null ? Number(p.ouro_gramas) : null,
      ouro_valor_grama: p.ouro_valor_grama != null ? Number(p.ouro_valor_grama) : null,
      data_confirmacao: p.data_confirmacao,
      venda_id: Number(p.venda_id),
      numero_venda: p.numero_venda,
      cliente_nome: p.cliente_nome ?? null,
      motoboy_nome: p.motoboy_nome ?? null,
    })),
    total: pendentes.reduce((s, p) => s + Number(p.valor ?? 0), 0),
  });
}

// ─── POST: confirma um pagamento do motoboy → entra no financeiro ────────────
const ConfirmarSchema = z.object({ pagamento_id: z.coerce.number().int().positive() }).passthrough();

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !podedarBaixaCaixa(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para confirmar pagamento do motoboy" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConfirmarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const pagamentoId = parsed.data.pagamento_id;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sql.begin: pitfall de tipo do postgres.js (ver CLAUDE.md §3)
    const resultado = await (sql as any).begin(async (tx: any) => {
      // Trava a linha e garante que ainda está aguardando conferência
      const [pag] = await tx`
        SELECT p.id, p.venda_id, p.forma, p.valor, p.ouro_gramas
        FROM alissonerp.pagamentos_venda p
        JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
        WHERE p.id = ${pagamentoId} AND p.status = 'aguard_conferencia'
          AND p.forma IN ('Dinheiro', 'Ouro')
          AND v.situacao <> 'cancelado'
        FOR UPDATE OF p
      `;
      if (!pag) return { erro: "Pagamento não está aguardando conferência (venda cancelada ou já confirmado?)", status: 409 };

      // Confirmar → para DINHEIRO o gatilho fn_venda_baixar_recebimento_pago
      // (AFTER UPDATE OF status) cria a conta a receber paga, e o dinheiro entra
      // na lista normal de baixa do caixa.
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET status = 'confirmado', data_confirmacao = now()
        WHERE id = ${pagamentoId}
      `;

      // OURO: o gatilho de rastreio (fn_rastreio_pagamento_ouro) é AFTER INSERT —
      // não dispara nessa confirmação por UPDATE. Então registramos o rastreio no
      // cofre AQUI (mesmo conteúdo do gatilho), pra o ouro entrar no cofre.
      // Não mexemos no gatilho pra não dobrar nas vendas de loja (que já inserem
      // o pagamento de ouro como 'confirmado').
      if (pag.forma === "Ouro") {
        const [v] = await tx`SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${Number(pag.venda_id)}`;
        await tx`
          INSERT INTO alissonerp.cofre_ouro_rastreios (pagamento_id, evento, gramas, observacao)
          VALUES (${pagamentoId}, 'venda_confirmada', ${pag.ouro_gramas}, ${"Venda #" + (v?.numero_venda ?? pag.venda_id) + " — conferido (motoboy)"})
        `;
      }
      await logAudit(tx, {
        tabela: "pagamentos_venda", operacao: "UPDATE", registro_id: Number(pag.venda_id), usuario_id: user.id,
        dados_antes: { status: "aguard_conferencia", forma: pag.forma },
        dados_depois: { status: "confirmado", contexto: "conferencia_motoboy_caixa", conferido_por: usuario.nome ?? user.email },
      });
      return { ok: true, forma: pag.forma, valor: Number(pag.valor) };
    });

    if (resultado?.erro) return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
    return NextResponse.json(resultado);
  } catch (e) {
    return internalError("[POST /api/financeiro/caixa/motoboy]", e, "Erro ao confirmar pagamento do motoboy.");
  }
}
