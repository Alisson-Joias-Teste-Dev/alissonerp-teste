/**
 * GET /api/entregas-venda/fechamentos
 *
 * REGRA DE NEGÓCIO (BLOCO 5, 21/07 — aba "Fechamentos de frete", mockup
 * aprovado pelo Jonathan): lista PAGINADA (10/página, mês mais recente
 * primeiro) dos fechamentos mensais da verba de frete grátis já gravados
 * pela rotina automática do dia 01 (`fecharMesFreteGratisAutomatico`,
 * src/lib/frete-fechamento.ts, BLOCO 4). 100% READ-ONLY — esta rota nunca
 * escreve em `fechamentos_frete` (o fechamento em si é feito pelo cron/
 * disparo manual de `POST .../fechamento-frete-cron`, não por esta tela).
 *
 * Dois chamadores da MESMA função (`listarFechamentosFrete`), MESMO padrão
 * de `motoboy/relatorio-pagamento/route.ts` (GET):
 *   1. `page.tsx` (SSR, primeira carga + navegação de página via Link/
 *      Paginacao).
 *   2. Esta rota (existe pra simetria com as rotas irmãs da família
 *      `entregas-venda/*` e uso futuro — hoje o painel não recarrega via
 *      client-fetch porque é 100% read-only, sem ação que precise de refresh
 *      sem navegação).
 *
 * Papéis permitidos: MESMO conjunto de `motoboy/pagar`/`motoboy/relatorio-
 * pagamento` (`ROLES_PAGAMENTO_MOTOBOY` — desenvolvedor/admin/gerente_loja).
 * "Quem gerencia" — não alarga pra consultora/estoquista_loja (que veem a
 * TELA de entregas, mas não este relatório financeiro).
 *
 * IMPACTO SE ALTERADO: mudar os papéis aqui SEM sincronizar com a gate do
 * front (AbasEntrega.tsx/page.tsx) cria uma tela cujo botão não aparece pra
 * ninguém que teria acesso (ou pior, aparece pra quem o backend recusa).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ROLES_PAGAMENTO_MOTOBOY } from "@/lib/pagamento-motoboy";
import { listarFechamentosFrete, PAGE_SIZE_FECHAMENTOS_FRETE } from "@/lib/frete-fechamento";

const ROLES_PERMITIDOS = ROLES_PAGAMENTO_MOTOBOY;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = PAGE_SIZE_FECHAMENTOS_FRETE;

  const { items, total } = await listarFechamentosFrete(sql, { page, limit });

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
