import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import * as inter from "@/lib/inter";

export async function POST(req: NextRequest) {
  // Auth: cron secret (DB) OU usuario com full access
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = (await inter.getInterCronSecret()) ?? process.env.INTER_CRON_SECRET ?? null;

  // Caso 1: cron com secret válido → autorizado direto (sem user)
  if (cronSecret && expected && cronSecret === expected) {
    // segue
  } else {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    // 401 quando não há cron_secret válido nem usuário autenticado.
    // Antes: caía direto em 403 (semanticamente errado: "não autenticado", não "sem permissão").
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    if (!u || !isFullAccess(u.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  // Excluir também 'ERRO' (mapearStatusInter trata como rejeitado terminal).
  // Antes, contas com inter_status='ERRO' eram re-consultadas em cada sync
  // sem nunca sair do loop.
  const pendentes = await sql<
    { id: number; inter_pagamento_id: string; inter_tipo: string; inter_status: string | null; valor: string }[]
  >`
    SELECT id, inter_pagamento_id, inter_tipo, inter_status, valor
    FROM alissonerp.contas_pagar
    WHERE inter_pagamento_id IS NOT NULL
      AND situacao = 'pendente'
      AND (inter_status IS NULL OR inter_status NOT IN ('PAGO','EXECUTADO','CANCELADO','REJEITADO','ERRO'))
    ORDER BY inter_atualizado_em ASC NULLS FIRST
    LIMIT 200
  `;

  const erros: { id: number; erro: string }[] = [];
  let atualizados = 0;

  for (const c of pendentes) {
    const tipo = c.inter_tipo as "pix" | "boleto" | "ted";
    if (!["pix", "boleto", "ted"].includes(tipo)) continue;

    try {
      const consulta = await inter.getPagamento(c.inter_pagamento_id, tipo, c.id);
      const novoStatus = consulta.status;

      if (novoStatus === c.inter_status) {
        // Apenas atualiza timestamp da consulta
        await sql`
          UPDATE alissonerp.contas_pagar
          SET inter_atualizado_em = now()
          WHERE id = ${c.id}
        `;
        continue;
      }

      const interno = inter.mapearStatusInter(novoStatus);

      if (interno === "pago") {
        const dataPag = consulta.dataPagamento ?? new Date().toISOString().slice(0, 10);
        await sql`
          UPDATE alissonerp.contas_pagar
          SET situacao            = 'pago',
              data_pagamento      = ${dataPag}::date,
              inter_status        = ${novoStatus},
              inter_atualizado_em = now()
          WHERE id = ${c.id}
        `;
      } else {
        await sql`
          UPDATE alissonerp.contas_pagar
          SET inter_status        = ${novoStatus},
              inter_atualizado_em = now()
          WHERE id = ${c.id}
        `;
      }
      atualizados++;
    } catch (e) {
      erros.push({ id: c.id, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    processados: pendentes.length,
    atualizados,
    erros,
  });
}

export const GET = POST;
