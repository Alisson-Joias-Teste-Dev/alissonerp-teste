import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/tiny/sync-produtos
//
// Worker de sincronização de produtos fabricaAJ → Tiny ERP (v3).
// Deve ser chamado por cron 1×/min. Processa até BATCH_SIZE itens por rodada,
// respeitando o rate limit do Tiny (60 req/min no plano Evoluir).
//
// Fluxo:
//   1. Pega até BATCH_SIZE itens com status='pendente' da fila
//   2. Delega o envio para syncProdutoToTiny() (serviço compartilhado)
//   3. syncProdutoToTiny gerencia token, payload, retry e marcação na fila
// ═══════════════════════════════════════════════════════════════════════════════

const BATCH_SIZE = 40;
const MAX_TENTATIVAS = 5;

// GET — status da fila (para UI e debug)
export async function GET() {
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pendente')     AS pendente,
      COUNT(*) FILTER (WHERE status = 'processando')  AS processando,
      COUNT(*) FILTER (WHERE status = 'ok')           AS ok,
      COUNT(*) FILTER (WHERE status = 'erro')         AS erro
    FROM alissonerp.tiny_sync_produtos
  `;
  return NextResponse.json(counts);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET ?? "fabricaaj-cron";
  if (authHeader && authHeader !== cronSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fila = await sql`
    SELECT produto_id, operacao
    FROM alissonerp.tiny_sync_produtos
    WHERE status = 'pendente' AND tentativas < ${MAX_TENTATIVAS}
    ORDER BY updated_at ASC
    LIMIT ${BATCH_SIZE}
  `;

  if (fila.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: "Fila vazia" });
  }

  const ids = fila.map(r => r.produto_id);
  await sql`
    UPDATE alissonerp.tiny_sync_produtos
    SET status = 'processando', updated_at = NOW()
    WHERE produto_id = ANY(${ids})
  `;

  let ok = 0, erros = 0;

  for (const item of fila) {
    const produtoId = Number(item.produto_id);
    const result = await syncProdutoToTiny(produtoId, item.operacao);
    if (result.ok) {
      ok++;
    } else {
      erros++;
    }
  }

  return NextResponse.json({ ok: true, processados: fila.length, sucesso: ok, erros });
}
