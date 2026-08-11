/**
 * GET /api/entregas-venda/saldo-frete
 *
 * Retorna o saldo atual de frete grátis da gerente logada e as últimas
 * movimentações (créditos e débitos).
 *
 * REGRA DE NEGÓCIO: o saldo de frete grátis pertence à gerente da loja.
 * Créditos = sobra do frete cobrado do cliente vs pago ao motoboy.
 * Débitos = quando frete cobrado < motoboy ou frete grátis total.
 * Fechamento mensal (BLOCO 2/3, ver migration 356 e frete-verba.ts): positivo
 * ZERA (não é cumulativo); negativo vira conta a pagar da gerente, via
 * tarefa de aprovação — não é mais desconto em folha.
 *
 * O QUE: consulta saldo_frete_gratis para o gerente_id resolvido por
 * resolverGerenteFreteGratisId (config `gerente_frete_gratis`, fonte única —
 * ver BLOCO 1, 21/07, mesma função usada por lancarSaldoFreteAvulsoNoTx).
 * POR QUE: a gerente precisa acompanhar seu saldo para decidir se pode
 * conceder frete grátis em novas vendas.
 * IMPACTO SE REMOVIDO: a gerente perde visibilidade do saldo e o controle
 * de frete grátis fica impossível de gerenciar.
 */

import { NextRequest, NextResponse } from "next/server";
import { obterSaldoFreteGerente, listarMovimentacoesFrete, resolverGerenteFreteGratisId } from "@/lib/entrega-venda";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT id, role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // REGRA DE NEGÓCIO (BLOCO 1, 21/07): saldo de frete é da gerente da loja,
  // não do usuário logado. Fonte ÚNICA de leitura — mesma função usada por
  // lancarSaldoFreteAvulsoNoTx (ver resolverGerenteFreteGratisId em
  // entrega-venda.ts). Fallback para o próprio usuário se nem a config nem
  // o antigo gerente_loja existirem.
  const gerenteId = await resolverGerenteFreteGratisId(sql, user.id);

  try {
    const [saldo, movimentacoes] = await Promise.all([
      obterSaldoFreteGerente(gerenteId),
      listarMovimentacoesFrete(gerenteId, 10),
    ]);

    return NextResponse.json({ saldo, movimentacoes });
  } catch (err) {
    console.error("[saldo-frete] Erro:", err);
    return NextResponse.json({ error: "Erro ao consultar saldo" }, { status: 500 });
  }
}
