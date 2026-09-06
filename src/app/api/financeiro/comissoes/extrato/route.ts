import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { resolverEscopoComissao } from "@/lib/comissao-permissao";
import {
  linhasExtrato, saldoAnterior, comissoesPendentes, somaBalde,
} from "@/lib/comissao-extrato";
import { chaveResultado, resultadosMeta, ritmoMeta } from "@/lib/comissao-fator";

/**
 * GET /api/financeiro/comissoes/extrato?competencia=2026-07
 *
 * TELA 1 do extrato de comissão: uma linha por vendedora, no formato de
 * conta-corrente — saldo anterior, os baldes do mês e o saldo final.
 *
 * REGRA: saldo = saldo anterior + comissões − devoluções + outros créditos
 *              − outros débitos − pagamentos.
 * "Comis. pend." (crediário não pago) fica FORA da conta: o que firma a
 * comissão é o pagamento. Ver docs/regras-negocio/comercial.md §2.1.
 *
 * IMPACTO: somar as pendentes no saldo faz a empresa pagar comissão sobre
 * dinheiro que ainda não entrou.
 */

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Esta é a tela que mostra TODAS as vendedoras — só para quem vê todas.
  // A consultora não passa aqui: ela abre /minha-comissao, que bate na rota de
  // detalhe e lá o escopo força o id dela.
  const escopo = await resolverEscopoComissao(user.id);
  if (!escopo || !escopo.podeVerTodas) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const competencia = req.nextUrl.searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "competencia obrigatória no formato AAAA-MM" }, { status: 400 });
  }

  const de = `${competencia}-01`;
  const [ano, mes] = competencia.split("-").map(Number);
  const ate = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  try {
    const [linhas, saldos, pendentes, vendedores] = await Promise.all([
      linhasExtrato(null, de, ate),
      saldoAnterior(null, de),
      comissoesPendentes(null),
      sql<Array<{ id_vendedor: number; nome: string }>>`
        SELECT id_vendedor, nome FROM public.vendedores
        WHERE situacao = 'Ativo' ORDER BY nome
      `,
    ]);

    const porConsultora = new Map<number, typeof linhas>();
    for (const l of linhas) {
      if (!porConsultora.has(l.consultora_id)) porConsultora.set(l.consultora_id, []);
      porConsultora.get(l.consultora_id)!.push(l);
    }

    const ids = new Set<number>([
      ...vendedores.map((v) => Number(v.id_vendedor)),
      ...porConsultora.keys(),
      ...saldos.keys(),
    ]);

    const nomes = new Map(vendedores.map((v) => [Number(v.id_vendedor), v.nome]));

    // Meta do mês de cada consultora — a lista mostra o atingimento ao lado do
    // saldo, para o financeiro ver num relance quem está abaixo e quanto isso já
    // está reduzindo da comissão.
    const metas = await resultadosMeta([competencia], Array.from(ids));
    // Ritmo só no mês corrente (ver comentário na rota de detalhe).
    const ritmos = competencia === new Date().toISOString().slice(0, 7)
      ? await ritmoMeta(competencia, Array.from(ids))
      : new Map();

    const rows = Array.from(ids).map((id) => {
      const ls = porConsultora.get(id) ?? [];
      const ant = saldos.get(id) ?? 0;
      const comissao = somaBalde(ls, "comissao");
      const devolucao = somaBalde(ls, "devolucao");
      const outroCredito = somaBalde(ls, "outro_credito");
      const outroDebito = somaBalde(ls, "outro_debito");
      const pagamento = somaBalde(ls, "pagamento");
      const pend = pendentes.get(id);

      return {
        consultora_id: id,
        consultora: nomes.get(id) ?? ls[0]?.consultora_nome ?? `#${id}`,
        saldo_anterior: ant,
        comissoes_mes: comissao,
        debito_devolucoes: Math.abs(devolucao),
        outros_creditos: outroCredito,
        outros_debitos: Math.abs(outroDebito),
        pagamentos: Math.abs(pagamento),
        comissoes_pendentes: pend?.total ?? 0,
        pendentes_atrasado: pend?.atrasado ?? 0,
        saldo: Math.round((ant + comissao + devolucao + outroCredito + outroDebito + pagamento) * 100) / 100,
        tem_movimento: ls.length > 0,
        meta_valor: metas.get(chaveResultado(id, competencia))?.meta_valor ?? 0,
        meta_realizado: metas.get(chaveResultado(id, competencia))?.realizado ?? 0,
        meta_pct: metas.get(chaveResultado(id, competencia))?.pct_atingido ?? 0,
        meta_fator: metas.get(chaveResultado(id, competencia))?.fator ?? 1,
        // Atrás (negativo) ou à frente do que o mês já pedia até agora, e quanto
        // de comissão a consultora deixa na mesa se o mês fechar assim.
        meta_ritmo: ritmos.get(id)
          ? Math.round(((metas.get(chaveResultado(id, competencia))?.realizado ?? 0)
              - ritmos.get(id)!.meta_ate_agora) * 100) / 100
          : null,
        em_jogo: Math.round((
          ls.filter((l) => l.balde === "comissao").reduce((s, l) => s + l.comissao_bruta, 0) - comissao
        ) * 100) / 100,
      };
    }).sort((a, b) => a.consultora.localeCompare(b.consultora));

    return NextResponse.json({ competencia, de, ate, linhas: rows });
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/extrato]", err);
  }
}
