import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ConciliarPostSchema = z.object({
  lancamento_id: z.coerce.number().int().positive(),
  conta_pagar_id: z.coerce.number().int().positive().optional(),
  conta_receber_id: z.coerce.number().int().positive().optional(),
}).passthrough();

// ─── GET /api/financeiro/conciliar ────────────────────────────────────────────
// Retorna sugestões de conciliação: match automático lancamento ↔ conta
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Mesma checagem do POST — antes qualquer usuário autenticado via
  // sugestões financeiras (match lançamento ↔ conta).
  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Buscar lançamentos não conciliados
  const lancamentos = await sql`
    SELECT id, fitid, tipo, valor, data_transacao, descricao
    FROM alissonerp.fin_lancamentos_bancarios
    WHERE conciliado = false
    ORDER BY data_transacao DESC
    LIMIT 100
  `;

  // Buscar matches em batch (evita N+1 queries)
  const valoresDebito = lancamentos.filter((l) => l.tipo === "D").map((l) => Number(l.valor));
  const valoresCredito = lancamentos.filter((l) => l.tipo !== "D").map((l) => Number(l.valor));

  // Uma query para contas_pagar (matches de débitos)
  const matchesPagar = valoresDebito.length > 0
    ? await sql`
        SELECT id, fornecedor_nome, valor, data_vencimento, descricao
        FROM alissonerp.contas_pagar
        WHERE situacao = 'pendente'
          AND valor = ANY(${valoresDebito}::numeric[])
      `
    : [];

  // Uma query para contas_receber (matches de créditos)
  const matchesReceber = valoresCredito.length > 0
    ? await sql`
        SELECT id, cliente_nome, valor, data_vencimento, descricao
        FROM alissonerp.contas_receber
        WHERE situacao = 'pendente'
          AND valor = ANY(${valoresCredito}::numeric[])
      `
    : [];

  // Montar sugestões em JS
  const sugestoes = [];

  for (const l of lancamentos) {
    const valor = Number(l.valor);
    const data = l.data_transacao ? new Date(l.data_transacao).getTime() : null;

    if (l.tipo === "D") {
      const matches = (matchesPagar as Array<Record<string, unknown>>)
        .filter((m) => {
          const diff = Math.abs(Number(m.valor) - valor);
          if (diff >= valor * 0.01 + 0.01) return false;
          if (data && m.data_vencimento) {
            const vencMs = new Date(m.data_vencimento as string).getTime();
            if (Math.abs(vencMs - data) >= 259200 * 1000) return false;
          }
          return true;
        })
        .slice(0, 3);
      if (matches.length > 0) {
        sugestoes.push({
          lancamento: { ...l, valor },
          tipo_match: "conta_pagar",
          matches: matches.map((m) => ({ ...m, valor: Number(m.valor) })),
        });
      }
    } else {
      const matches = (matchesReceber as Array<Record<string, unknown>>)
        .filter((m) => {
          const diff = Math.abs(Number(m.valor) - valor);
          if (diff >= valor * 0.01 + 0.01) return false;
          if (data && m.data_vencimento) {
            const vencMs = new Date(m.data_vencimento as string).getTime();
            if (Math.abs(vencMs - data) >= 259200 * 1000) return false;
          }
          return true;
        })
        .slice(0, 3);
      if (matches.length > 0) {
        sugestoes.push({
          lancamento: { ...l, valor },
          tipo_match: "conta_receber",
          matches: matches.map((m) => ({ ...m, valor: Number(m.valor) })),
        });
      }
    }
  }

  return NextResponse.json({ sugestoes, total_nao_conciliados: lancamentos.length });
}

// ─── POST /api/financeiro/conciliar ───────────────────────────────────────────
// Confirma conciliação: vincula lançamento bancário ↔ conta pagar/receber
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConciliarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  if (!body.conta_pagar_id && !body.conta_receber_id) {
    return NextResponse.json({ error: "conta_pagar_id ou conta_receber_id obrigatórios" }, { status: 400 });
  }

  // Guard: verificar se lançamento existe e não está já conciliado
  const [lanc] = await sql`
    SELECT id, conciliado FROM alissonerp.fin_lancamentos_bancarios WHERE id = ${body.lancamento_id}
  `;
  if (!lanc) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (lanc.conciliado) return NextResponse.json({ error: "Lançamento já conciliado" }, { status: 409 });

  // Operação atômica — antes eram 4 statements soltos; se o UPDATE da conta
  // falhasse no fim, a conciliação ficava registrada mas a conta nunca era
  // marcada como paga, gerando inconsistência permanente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    await tx`
      INSERT INTO alissonerp.fin_conciliacoes
        (lancamento_id, conta_pagar_id, conta_receber_id, tipo, status)
      VALUES (
        ${body.lancamento_id},
        ${body.conta_pagar_id ?? null},
        ${body.conta_receber_id ?? null},
        'manual',
        'confirmado'
      )
    `;

    await tx`
      UPDATE alissonerp.fin_lancamentos_bancarios
      SET conciliado = true
      WHERE id = ${body.lancamento_id}
    `;

    if (body.conta_pagar_id) {
      await tx`
        UPDATE alissonerp.contas_pagar
        SET situacao = 'pago', data_pagamento = COALESCE(data_pagamento, CURRENT_DATE), updated_at = NOW()
        WHERE id = ${body.conta_pagar_id}
      `;
    }
    if (body.conta_receber_id) {
      await tx`
        UPDATE alissonerp.contas_receber
        SET situacao = 'recebido', data_recebimento = COALESCE(data_recebimento, CURRENT_DATE), updated_at = NOW()
        WHERE id = ${body.conta_receber_id}
      `;
    }
  });

  return NextResponse.json({ ok: true });
}
