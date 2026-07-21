// ═══════════════════════════════════════════════════════════════════════════
// POST /api/entregas-venda/fechamento-frete-cron
//
// BLOCO 4 (verba de frete grátis, 21/07) — rotina automática do dia 01.
// Disparado diariamente (n8n ou curl, chamada idempotente — ver
// src/lib/frete-fechamento.ts) com header x-cron-secret. Também pode ser
// chamado manualmente por admin/gerente_loja autenticado — MESMO padrão de
// src/app/api/crediario/aging-cron/route.ts (auth: cron secret OU usuário
// autenticado com role elegível).
//
// Lógica pesada em src/lib/frete-fechamento.ts (testável sem HTTP,
// fecharMesFreteGratisAutomatico) — esta rota só cuida de autenticação e
// resolve o "ator" (created_by) das linhas gravadas quando não há usuário
// logado (disparo via cron secret puro).
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { criarNotificacao } from "@/lib/notificacoes";
import { fecharMesFreteGratisAutomatico } from "@/lib/frete-fechamento";

const CRON_SECRET_ENV = "FRETE_FECHAMENTO_CRON_SECRET";

export async function POST(req: NextRequest) {
  // Auth: cron secret OU admin/gerente_loja autenticado (mesmo padrão de
  // aging-cron/route.ts).
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env[CRON_SECRET_ENV] ?? null;

  let autenticado = false;
  let usuarioLogadoId: string | null = null;
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    autenticado = true;
  } else {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
      if (u && (isFullAccess(u.role as string) || u.role === "gerente_loja")) {
        autenticado = true;
        usuarioLogadoId = user.id;
      }
    }
  }
  if (!autenticado) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // REGRA DE NEGÓCIO: quando a chamada vem SÓ do cron secret (sem usuário
  // autenticado — o caso real do agendamento diário), ainda assim as linhas
  // gravadas (fechamentos_frete.created_by, saldo_frete_gratis.created_by,
  // tarefas.criado_por) precisam de um UUID válido — não há conceito de
  // "usuário sistema" neste projeto. Fallback: primeiro admin/desenvolvedor
  // ativo (mesmo padrão ORDER BY created_at LIMIT 1 já usado em
  // resolverGerenteFreteGratisId para o caso extremo de config vazia).
  // IMPACTO SE REMOVIDO: chamada via cron secret puro (sem usuário logado)
  // falharia ao gravar (created_by NULL sem candidato) sempre que não houver
  // admin logado no momento do disparo diário.
  let atorId = usuarioLogadoId;
  if (!atorId) {
    const [sistema] = await sql`
      SELECT id FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor') AND ativo = true
      ORDER BY created_at LIMIT 1
    `;
    atorId = sistema?.id ? String(sistema.id) : null;
  }
  if (!atorId) {
    return NextResponse.json(
      { error: "Nenhum admin/desenvolvedor ativo encontrado para executar a rotina." },
      { status: 500 },
    );
  }

  try {
    const resultado = await fecharMesFreteGratisAutomatico(new Date(), atorId);

    // Notificação do pool de aprovadores — fora da transação (best-effort,
    // não deve reverter um fechamento já válido), mesmo padrão .catch(()=>{})
    // usado no resto do módulo.
    if (!resultado.jaFechado && resultado.tarefaId && resultado.aprovadoresNotificar?.length) {
      await Promise.all(resultado.aprovadoresNotificar.map((aprovadorId) =>
        criarNotificacao({
          usuarioId: aprovadorId,
          tipo: "aprovacao",
          titulo: "Fechamento de frete grátis — saldo negativo",
          mensagem: `Saldo negativo de R$ ${Math.abs(resultado.saldoFinal ?? 0).toFixed(2)} no fechamento de ${resultado.mesReferencia}. Aguardando decisão.`,
          remetenteId: atorId!,
          link: `/tarefas?abrir=${resultado.tarefaId}`,
        }).catch(() => {})
      ));
    }

    return NextResponse.json({ ok: true, ...resultado, executado_em: new Date().toISOString() });
  } catch (err) {
    console.error("[fechamento-frete-cron] Erro:", err);
    return NextResponse.json({ error: "Erro ao executar o fechamento do frete grátis" }, { status: 500 });
  }
}

// GET /api/entregas-venda/fechamento-frete-cron — preview (admin/gerente_loja:
// vê os últimos fechamentos, sem executar nada). Útil para conferir o estado
// antes/depois de um disparo manual em homolog.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u || (!isFullAccess(u.role as string) && u.role !== "gerente_loja")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const ultimosFechamentos = await sql`
    SELECT id, gerente_id, mes_referencia, saldo_anterior, total_creditos, total_debitos,
           saldo_final, status, verba_creditada, faturamento_base, percentual_verba,
           tarefa_aprovacao_id, conta_pagar_id, created_at
    FROM alissonerp.fechamentos_frete
    ORDER BY mes_referencia DESC, id DESC
    LIMIT 12
  `;

  return NextResponse.json({
    ultimos_fechamentos: ultimosFechamentos,
    proxima_execucao: "Dia 01 de cada mês — disparar POST com x-cron-secret (idempotente, seguro rodar 2x).",
  });
}
