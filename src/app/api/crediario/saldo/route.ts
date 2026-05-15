import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_SALDO = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// GET /api/crediario/saldo
// Retorna saldo_limite, saldo_atual e total_pendente (soma das contas a receber pendentes)
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_SALDO.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [configs, pendente] = await Promise.all([
    sql`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave IN ('saldo_gerente_limite', 'saldo_gerente_atual')
    `,
    sql`
      SELECT
        COUNT(*)::integer                   AS qtd_pendente,
        COALESCE(SUM(valor), 0)             AS total_pendente,
        COUNT(*) FILTER (WHERE status_aging = 'vencido')::integer  AS qtd_vencido,
        COALESCE(SUM(valor) FILTER (WHERE status_aging = 'vencido'), 0) AS total_vencido
      FROM alissonerp.vw_crediario
      WHERE situacao = 'pendente'
    `,
  ]);

  const cfgMap = Object.fromEntries(configs.map((c) => [c.chave, c.valor as string]));
  const saldoLimite = Number(cfgMap["saldo_gerente_limite"] ?? 50000);
  const saldoAtual  = Number(cfgMap["saldo_gerente_atual"]  ?? 50000);
  const p           = pendente[0];

  return NextResponse.json({
    saldo_limite:   saldoLimite,
    saldo_atual:    saldoAtual,
    saldo_usado:    saldoLimite - saldoAtual,
    total_pendente: Number(p.total_pendente),
    qtd_pendente:   p.qtd_pendente as number,
    total_vencido:  Number(p.total_vencido),
    qtd_vencido:    p.qtd_vencido as number,
  });
}
