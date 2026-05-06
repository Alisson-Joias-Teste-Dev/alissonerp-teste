import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/rfid/inventario
// Body: { leituras: string[], leitor_id?: string }
//   leituras: Array de EPCs lidos pelo leitor TSL 1128
//   leitor_id: identificador do leitor (ex: "TSL-1128-BT-001")
//
// Recebe lote de leituras do leitor RFID, compara com o estoque esperado
// e retorna divergências para conferência.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as { leituras: string[]; leitor_id?: string };
  if (!Array.isArray(body.leituras) || body.leituras.length === 0) {
    return NextResponse.json({ error: "leituras é obrigatório (array de strings)" }, { status: 400 });
  }

  const leituras = [...new Set(body.leituras.map(l => l.trim()).filter(Boolean))];
  const leitorId = body.leitor_id ?? "TSL-1128";

  // 1. Registra todas as leituras na tabela de eventos
  const inserts = leituras.map(epc => ({
    epc,
    evento: "leitura_inventario",
    localizacao: "Loja",
    leitor_id: leitorId,
    operador: user.id,
  }));

  // Batch insert via sql.unsafe (mais rapido que inserts individuais)
  const valuesStr = inserts.map(i =>
    `('${i.epc}', '${i.evento}', '${i.localizacao}', '${i.leitor_id}', '${i.operador}'::uuid, now())`
  ).join(",\n");

  await sql.unsafe(`
    INSERT INTO alissonerp.joias_leituras (epc, evento, localizacao, leitor_id, operador, lido_em)
    VALUES ${valuesStr}
  `);

  // 2. Identifica quais RFIDs foram lidos e seus produtos
  const lidos = await sql`
    SELECT j.epc, j.produto_id, j.sku, j.nome, j.status, j.localizacao_atual,
           p.nome AS produto_nome
    FROM alissonerp.joias_rfid j
    LEFT JOIN public.produtos p ON p.id_produto = j.produto_id::bigint
    WHERE j.epc = ANY(${leituras}::text[])
  `;

  // 3. Identifica RFIDs que deveriam estar presentes mas NAO foram lidos
  const epcsLidos = new Set(lidos.map(r => r.epc));
  const naoLidos = await sql`
    SELECT j.epc, j.produto_id, j.sku, j.nome, j.status,
           p.nome AS produto_nome
    FROM alissonerp.joias_rfid j
    LEFT JOIN public.produtos p ON p.id_produto = j.produto_id::bigint
    WHERE j.status = 'ativo'
      AND j.localizacao_atual = 'Loja'
      AND j.epc != ALL(${leituras}::text[])
  `;

  // 4. Agrupa por produto para resumo
  const resumo: Record<number, { produto: string; sku: string; esperado: number; lidos: number; divergencia: number }> = {};
  for (const r of lidos) {
    const pid = Number(r.produto_id);
    if (!resumo[pid]) {
      const [prod] = await sql`SELECT nome, sku FROM public.produtos WHERE id_produto = ${pid}::bigint`;
      resumo[pid] = { produto: prod?.nome ?? "?", sku: prod?.sku ?? "?", esperado: 0, lidos: 0, divergencia: 0 };
    }
    resumo[pid].lidos++;
  }
  for (const r of naoLidos) {
    const pid = Number(r.produto_id);
    if (!resumo[pid]) {
      resumo[pid] = { produto: r.produto_nome ?? "?", sku: r.sku ?? "?", esperado: 0, lidos: 0, divergencia: 0 };
    }
    resumo[pid].esperado++;
    resumo[pid].divergencia--;
  }
  // Ajusta: lidos que estao no esperado
  for (const pid of Object.keys(resumo)) {
    const esperadoTotal = naoLidos.filter(r => Number(r.produto_id) === Number(pid)).length + resumo[Number(pid)].lidos;
    resumo[Number(pid)].esperado = esperadoTotal;
    resumo[Number(pid)].divergencia = resumo[Number(pid)].lidos - esperadoTotal;
  }

  return NextResponse.json({
    ok: true,
    total_leituras: leituras.length,
    rfids_lidos: lidos.length,
    rfids_esperados_nao_lidos: naoLidos.length,
    lidos: lidos.map(r => ({
      epc: r.epc,
      produto: r.produto_nome,
      sku: r.sku,
      status: r.status,
    })),
    nao_lidos: naoLidos.map(r => ({
      epc: r.epc,
      produto: r.produto_nome,
      sku: r.sku,
      status: r.status,
    })),
    resumo: Object.entries(resumo).map(([pid, r]) => ({
      produto_id: Number(pid),
      ...r,
    })),
  });
}

// GET /api/rfid/inventario
// Retorna: histórico de leituras de inventário
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const leituras = await sql`
    SELECT epc, evento, localizacao, leitor_id, created_at
    FROM alissonerp.joias_leituras
    WHERE evento = 'leitura_inventario'
    ORDER BY created_at DESC
    LIMIT 100
  `;

  return NextResponse.json(leituras);
}
