import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const SaidaPostSchema = z.object({
  ordem_id: z.coerce.number().int().positive(),
  peso_bruto: z.coerce.number().optional(),
  pedras_utilizadas: z.array(z.object({
    insumo_id: z.coerce.number().int().positive(),
    qtd_utilizada: z.coerce.number().optional(),
    peso_ct_utilizado: z.coerce.number().optional(),
  })).optional(),
  foto_balanca: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  sem_peso: z.boolean().optional(),
  justificativa_sem_peso: z.string().nullable().optional(),
}).passthrough();

// POST /api/distribuicao/[id]/saida — registra saída por ordem
//
// Fluxo normal (sem_peso = false ou não enviado):
//   peso_bruto     = peso da peça na balança (ouro + pedras)
//   peso_pedras    = Σ(qtd_utilizada × peso_pedra_unitario)
//   peso_ouro_real = peso_bruto − peso_pedras
//   foto da balança obrigatória + validação IA
//
// Fluxo sem peso (sem_peso = true):
//   justificativa_sem_peso OBRIGATÓRIA
//   peso_bruto = peso_pedras = peso_ouro_real = 0
//   NÃO exige foto, NÃO cria movimentação, NÃO calcula quebra
//
// Quebra/saldo NÃO é calculada por ordem — só na conclusão do lote.
//
// CE: UPDATE fechamentos_distribuicao → trigger fn_processar_fechamento_dist
//     move peso_ouro_real do dep_dist → almoxarifado (TEDD), atualiza PCP.
//
// Pedras consumidas ficam na peça — NÃO voltam ao estoque.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SaidaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const {
    ordem_id,
    peso_bruto,
    pedras_utilizadas,
    foto_balanca,
    user_id,
    sem_peso,
    justificativa_sem_peso,
  } = parsed.data;

  // Auth obrigatória
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!ordem_id) {
    return NextResponse.json({ error: "ordem_id obrigatório" }, { status: 400 });
  }

  // ── Validações divergem por modo ──────────────────────────────────────────
  if (sem_peso === true) {
    // Modo sem peso: justificativa obrigatória, sem foto, sem peso_bruto
    if (!justificativa_sem_peso || justificativa_sem_peso.trim() === "") {
      return NextResponse.json(
        { error: "Justificativa obrigatória quando sem_peso = true" },
        { status: 400 },
      );
    }
  } else {
    // Modo normal: peso_bruto > 0 e foto obrigatórios
    if (!peso_bruto || peso_bruto <= 0) {
      return NextResponse.json({ error: "Peso bruto deve ser maior que zero" }, { status: 400 });
    }
    if (!foto_balanca) {
      return NextResponse.json({ error: "Foto da balança obrigatória" }, { status: 400 });
    }
  }

  // 1. Verificar que a ordem pertence a esta distribuição e não teve saída
  const [doo] = await sql`
    SELECT id, data_baixa
    FROM alissonerp.distribuicao_ordens
    WHERE distribuicao_id = ${distId} AND ordens_id = ${ordem_id}
    LIMIT 1
  `;
  if (!doo) {
    return NextResponse.json({ error: "Ordem não está nesta distribuição" }, { status: 400 });
  }
  if (doo.data_baixa) {
    return NextResponse.json({ error: "Esta ordem já teve saída registrada" }, { status: 400 });
  }

  // ── MODO SEM PESO ─────────────────────────────────────────────────────────
  if (sem_peso === true) {
    await sql`
      UPDATE alissonerp.distribuicao_ordens
      SET
        sem_peso               = true,
        justificativa_sem_peso = ${justificativa_sem_peso!.trim()},
        peso_bruto             = 0,
        peso_pedras            = 0,
        peso_ouro_real         = 0,
        data_baixa             = now(),
        saida_por              = ${user.id}
      WHERE id = ${doo.id}
    `;

    return NextResponse.json({
      ok: true,
      sem_peso: true,
      peso_bruto: 0,
      peso_pedras: 0,
      peso_ouro_real: 0,
    });
  }

  // ── MODO NORMAL (fluxo 100% igual ao anterior) ───────────────────────────

  // 2. Calcular peso das pedras + buscar insumo unitário
  let peso_pedras_total = 0;
  const pedrasComPeso: {
    insumo_id: number;
    qtd: number;
    peso_unitario: number;
    peso_total: number;
    peso_ct_utilizado?: number;
  }[] = [];

  for (const p of pedras_utilizadas ?? []) {
    const [ins] = await sql`
      SELECT COALESCE(peso_pedra, 0)::float8    AS peso_pedra,
             COALESCE(peso_pedra_ct, 0)::float8 AS peso_pedra_ct
      FROM alissonerp.insumos WHERE id = ${p.insumo_id} LIMIT 1
    `;
    const pu_g  = Number(ins?.peso_pedra ?? 0);
    const pu_ct = Number(ins?.peso_pedra_ct ?? 0);

    if (p.peso_ct_utilizado != null && p.peso_ct_utilizado > 0) {
      // Sprint 3: converter ct → g
      const pt  = p.peso_ct_utilizado * 0.2;
      const qtd = pu_ct > 0 ? p.peso_ct_utilizado / pu_ct : 0;
      peso_pedras_total += pt;
      pedrasComPeso.push({ insumo_id: p.insumo_id, qtd, peso_unitario: pu_g, peso_total: pt, peso_ct_utilizado: p.peso_ct_utilizado });
    } else {
      const qtdUtil = p.qtd_utilizada ?? 0;
      if (!qtdUtil || qtdUtil <= 0) continue;
      const pt = qtdUtil * pu_g;
      peso_pedras_total += pt;
      pedrasComPeso.push({ insumo_id: p.insumo_id, qtd: qtdUtil, peso_unitario: pu_g, peso_total: pt });
    }
  }

  const peso_ouro_real = peso_bruto! - peso_pedras_total;
  if (peso_ouro_real < 0) {
    return NextResponse.json(
      { error: `Peso ouro real negativo (${peso_ouro_real.toFixed(3)}g) — peso das pedras excede o peso bruto` },
      { status: 400 },
    );
  }

  // 3. INSERT detalhe de pedras usadas
  for (const p of pedrasComPeso) {
    await sql`
      INSERT INTO alissonerp.distribuicao_saida_pedras
        (distribuicao_ordem_id, insumo_id, qtd_utilizada, peso_unitario, peso_total, peso_ct_utilizado)
      VALUES
        (${doo.id}, ${p.insumo_id}, ${p.qtd}, ${p.peso_unitario}, ${p.peso_total}, ${p.peso_ct_utilizado ?? null})
    `;
  }

  // 4. UPDATE distribuicao_ordens — somente dados físicos da peça
  //    quebra e ouro_entregue NÃO são gravados aqui — calculados na conclusão do lote
  await sql`
    UPDATE alissonerp.distribuicao_ordens
    SET
      peso_bruto     = ${peso_bruto!},
      peso_pedras    = ${peso_pedras_total},
      peso_ouro_real = ${peso_ouro_real},
      data_baixa     = now(),
      saida_por      = ${user_id ?? null},
      foto_balanca   = ${foto_balanca!}
    WHERE id = ${doo.id}
  `;

  // 5. UPDATE fechamentos_distribuicao (peso = peso_ouro_real)
  //    → trigger fn_processar_fechamento_dist:
  //      • CE TEDD: peso_ouro_real de dep_dist → almoxarifado (insumo_id=1 proxy)
  //      • PCP.total_metal += pmc, total_pedras_un += total_pedras
  //      • ordens.local_atual = 1
  const totalPedrasUn = pedrasComPeso.reduce((s, p) => s + p.qtd, 0);
  const [fech] = await sql`
    SELECT id, peso AS peso_atual
    FROM alissonerp.fechamentos_distribuicao
    WHERE distribuicao_id = ${distId} AND ordem_id = ${ordem_id}
    LIMIT 1
  `;
  if (fech && !(fech.peso_atual && Number(fech.peso_atual) > 0)) {
    await sql`
      UPDATE alissonerp.fechamentos_distribuicao
      SET
        peso            = ${peso_ouro_real},
        pmc             = ${peso_ouro_real},
        total_pedras_un = ${totalPedrasUn},
        foto_balanca    = ${foto_balanca!},
        created_by      = ${user.id},
        updated_at      = now()
      WHERE id = ${fech.id}
    `;
  }

  // 6. Recalcular totais dist_* no PCP desta ordem (fire-and-forget)
  sql`
    SELECT id FROM alissonerp.pcp WHERE ordem_id = ${ordem_id} LIMIT 1
  `.then(([pcpRow]) => {
    if (pcpRow?.id) recalcularTotaisPCP(pcpRow.id as number).catch(() => {});
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    peso_bruto: peso_bruto!,
    peso_pedras: peso_pedras_total,
    peso_ouro_real,
  });
}
