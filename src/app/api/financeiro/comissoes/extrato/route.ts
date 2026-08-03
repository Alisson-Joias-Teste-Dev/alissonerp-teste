import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import {
  linhasExtrato, saldoAnterior, comissoesPendentes, somaBalde,
} from "@/lib/comissao-extrato";

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

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [perfil] = await sql<Array<{ role: string }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!perfil || (!isFullAccess(perfil.role) && !ROLES_FINANCEIRO.includes(perfil.role))) {
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
      };
    }).sort((a, b) => a.consultora.localeCompare(b.consultora));

    return NextResponse.json({ competencia, de, ate, linhas: rows });
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/extrato]", err);
  }
}
