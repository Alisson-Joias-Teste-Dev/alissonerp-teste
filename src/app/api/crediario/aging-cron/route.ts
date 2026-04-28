import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// POST /api/crediario/aging-cron
//
// Disparado diariamente (n8n ou curl) com header x-cron-secret.
// Também pode ser chamado manualmente por admin autenticado.
//
// Lógica:
//   1. Contas VENCIDAS sem cobrança nos últimos 3 dias → notifica consultora + gerentes
//   2. Contas VENCE_EM_BREVE sem nenhuma cobrança anterior → notifica gerentes
//   3. Registra em comunicacoes_crediario para deduplicar

const DIAS_RENOTIFICACAO_VENCIDO = 3; // re-notifica a cada 3 dias
const CRON_SECRET_ENV = "CREDIARIO_CRON_SECRET";

export async function POST(req: NextRequest) {
  // Auth: cron secret OU admin autenticado
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env[CRON_SECRET_ENV] ?? null;

  let autenticado = false;
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    autenticado = true;
  } else {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
      if (u && (isFullAccess(u.role as string) || u.role === "gerente_loja")) autenticado = true;
    }
  }
  if (!autenticado) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Buscar gerentes de loja (destinatários fixos das notificações)
  const gerentes = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE role IN ('gerente_loja', 'admin', 'desenvolvedor', 'diretor')
      AND id IS NOT NULL
  `;

  // ── 1. Contas vencidas ────────────────────────────────────────────────────
  // Sem cobrança registrada em comunicacoes_crediario nos últimos DIAS_RENOTIFICACAO_VENCIDO dias
  const vencidas = await sql`
    SELECT
      cr.conta_receber_id,
      cr.valor,
      cr.dias_atraso,
      cr.descricao,
      cr.numero_venda,
      cr.cliente_nome,
      cr.vendedor_nome,
      cr.consultora_uuid,
      cr.venda_id
    FROM alissonerp.vw_crediario cr
    WHERE cr.situacao = 'pendente'
      AND cr.status_aging = 'vencido'
      AND NOT EXISTS (
        SELECT 1 FROM alissonerp.comunicacoes_crediario cc
        WHERE cc.conta_receber_id = cr.conta_receber_id
          AND cc.tipo = 'cobranca'
          AND cc.created_at > NOW() - (${DIAS_RENOTIFICACAO_VENCIDO} || ' days')::interval
      )
    ORDER BY cr.dias_atraso DESC
  `;

  // ── 2. Contas vencendo em breve ───────────────────────────────────────────
  // Sem NENHUMA notificação anterior de cobrança (notifica só uma vez)
  const vencemBreve = await sql`
    SELECT
      cr.conta_receber_id,
      cr.valor,
      cr.data_vencimento,
      cr.descricao,
      cr.numero_venda,
      cr.cliente_nome,
      cr.vendedor_id,
      cr.consultora_uuid,
      cr.venda_id
    FROM alissonerp.vw_crediario cr
    WHERE cr.situacao = 'pendente'
      AND cr.status_aging = 'vence_em_breve'
      AND NOT EXISTS (
        SELECT 1 FROM alissonerp.comunicacoes_crediario cc
        WHERE cc.conta_receber_id = cr.conta_receber_id
          AND cc.tipo IN ('cobranca', 'aviso_vencimento')
      )
  `;

  let notificacoesEnviadas = 0;
  let registrosCobrados = 0;

  // ── Processar vencidas ────────────────────────────────────────────────────
  for (const c of vencidas) {
    const titulo = `Crediário vencido — ${c.cliente_nome ?? "cliente"} (${c.dias_atraso}d)`;
    const mensagem = `${c.descricao} · Venda ${c.numero_venda ?? c.venda_id} · ${fmtBRL(Number(c.valor))} · ${c.dias_atraso} dia${c.dias_atraso !== 1 ? "s" : ""} em atraso`;
    // Notifica consultora
    if (c.consultora_uuid) {
      await notificar(c.consultora_uuid as string, "crediario_vencido", titulo, mensagem);
      notificacoesEnviadas++;
    }

    // Notifica gerentes
    for (const g of gerentes) {
      await notificar(g.id as string, "crediario_vencido", titulo, mensagem);
      notificacoesEnviadas++;
    }

    // Registrar cobrança para deduplicação
    await sql`
      INSERT INTO alissonerp.comunicacoes_crediario
        (conta_receber_id, tipo, mensagem, usuario_id)
      VALUES (
        ${c.conta_receber_id as number},
        'cobranca',
        ${`Notificação automática de atraso: ${c.dias_atraso} dia${c.dias_atraso !== 1 ? "s" : ""}`},
        NULL
      )
    `.catch(() => {});
    registrosCobrados++;
  }

  // ── Processar vencendo em breve ───────────────────────────────────────────
  for (const c of vencemBreve) {
    const titulo = `Crediário vencendo — ${c.cliente_nome ?? "cliente"}`;
    const mensagem = `${c.descricao} · Venda ${c.numero_venda ?? c.venda_id} · ${fmtBRL(Number(c.valor))} · vence em breve`;
    // Notifica apenas gerentes (consultora recebe só quando vence)
    for (const g of gerentes) {
      await notificar(g.id as string, "crediario_vence_breve", titulo, mensagem);
      notificacoesEnviadas++;
    }

    await sql`
      INSERT INTO alissonerp.comunicacoes_crediario
        (conta_receber_id, tipo, mensagem, usuario_id)
      VALUES (
        ${c.conta_receber_id as number},
        'cobranca',
        'Notificação automática: vencimento em breve',
        NULL
      )
    `.catch(() => {});
    registrosCobrados++;
  }

  return NextResponse.json({
    ok: true,
    vencidas_processadas: vencidas.length,
    vencendo_breve_processadas: vencemBreve.length,
    notificacoes_enviadas: notificacoesEnviadas,
    registros_cobrados: registrosCobrados,
    executado_em: new Date().toISOString(),
  });
}

// GET /api/crediario/aging-cron — preview (admin: vê o que seria notificado)
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u || (!isFullAccess(u.role as string) && u.role !== "gerente_loja")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [resumo] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status_aging = 'vencido' AND situacao = 'pendente')::int AS vencidas,
      COUNT(*) FILTER (WHERE status_aging = 'vence_em_breve' AND situacao = 'pendente')::int AS vencendo_breve,
      COALESCE(SUM(valor) FILTER (WHERE status_aging = 'vencido' AND situacao = 'pendente'), 0) AS valor_vencido,
      COALESCE(SUM(valor) FILTER (WHERE status_aging = 'vence_em_breve' AND situacao = 'pendente'), 0) AS valor_vencendo_breve
    FROM alissonerp.vw_crediario
  `;

  const ultimasCobrancas = await sql`
    SELECT
      cc.conta_receber_id,
      MAX(cc.created_at) AS ultima_cobranca
    FROM alissonerp.comunicacoes_crediario cc
    WHERE cc.tipo = 'cobranca'
      AND cc.created_at > NOW() - INTERVAL '7 days'
    GROUP BY cc.conta_receber_id
    ORDER BY ultima_cobranca DESC
    LIMIT 20
  `;

  return NextResponse.json({
    resumo: {
      vencidas: resumo.vencidas,
      vencendo_breve: resumo.vencendo_breve,
      valor_vencido: Number(resumo.valor_vencido),
      valor_vencendo_breve: Number(resumo.valor_vencendo_breve),
    },
    ultimas_cobrancas_7d: ultimasCobrancas,
    proxima_execucao: "Diária — disparar POST com x-cron-secret",
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function notificar(
  usuarioId: string,
  tipo: string,
  titulo: string,
  mensagem: string,
) {
  await sql`
    INSERT INTO alissonerp.notificacoes
      (usuario_id, tipo, titulo, mensagem)
    VALUES (
      ${usuarioId}::uuid,
      ${tipo},
      ${titulo},
      ${mensagem}
    )
  `.catch((err: Error) => {
    console.error("[aging-cron] Erro ao notificar:", err.message);
  });
}
