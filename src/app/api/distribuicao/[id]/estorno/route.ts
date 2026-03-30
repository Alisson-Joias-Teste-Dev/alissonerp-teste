import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";

// POST /api/distribuicao/[id]/estorno
// Body: { ordem_id, motivo, justificativa }
//
// Reverte TODOS os efeitos da saída de uma ordem num lote (em_andamento ou concluido).
// Operação atômica (sql.begin). NÃO altera triggers — faz reversão manual.
//
// FLUXO DE REVERSÃO:
//   Fase 1 (se lote concluido): reabrir lote + reverter CE QUEBRA_LOTE + deletar quebra_operador
//   Fase 2 (!sem_peso): criar par de CEs ESTORNO inversas ao TEDD original
//   Fase 3 (!sem_peso): decrementar PCP.total_metal/total_pedras_*
//   Fase 4: restaurar ordens.local_atual → dep_dist
//   Fase 5: deletar distribuicao_saida_pedras + itens_ordem_insumos
//   Fase 6: resetar distribuicao_ordens (data_baixa=NULL, pesos=0)
//   Fase 7: resetar fechamentos_distribuicao (peso=0 → trigger não dispara, guard peso<=0)
//   Fase 8: registrar estorno com snapshot JSONB
//   Pós-tx: recalcularTotaisPCP (fire-and-forget)

const ROLES_PERMITIDOS = ["admin", "desenvolvedor", "gerente_fabrica"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [meuPerfil] = await sql`
    SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!meuPerfil || !ROLES_PERMITIDOS.includes(meuPerfil.role as string)) {
    return NextResponse.json({ error: "Sem permissão — apenas admin, desenvolvedor ou gerente_fabrica" }, { status: 403 });
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  const { ordem_id, motivo, justificativa } = await req.json() as {
    ordem_id: number;
    motivo: string;
    justificativa: string;
  };

  if (!ordem_id) return NextResponse.json({ error: "ordem_id obrigatório" }, { status: 400 });
  if (!motivo?.trim()) return NextResponse.json({ error: "Motivo obrigatório" }, { status: 400 });
  if (!justificativa?.trim() || justificativa.trim().length < 10) {
    return NextResponse.json({ error: "Justificativa obrigatória (mínimo 10 caracteres)" }, { status: 400 });
  }
  if (motivo === "outro" && justificativa.trim().length < 20) {
    return NextResponse.json({ error: "Para 'Outro motivo', justificativa mínima de 20 caracteres" }, { status: 400 });
  }

  // ── Validações de existência ─────────────────────────────────────────────────
  const [dist] = await sql`
    SELECT id, deposito_id, etapas::text, quebra_lote, setor_id
    FROM alissonerp.distribuicoes WHERE id = ${distId}
  `;
  if (!dist) return NextResponse.json({ error: "Distribuição não encontrada" }, { status: 404 });

  const [doo] = await sql`
    SELECT id, ordens_id, data_baixa, peso_bruto, peso_pedras, peso_ouro_real,
           sem_peso, justificativa_sem_peso, foto_balanca, saida_por
    FROM alissonerp.distribuicao_ordens
    WHERE distribuicao_id = ${distId} AND ordens_id = ${ordem_id}
    LIMIT 1
  `;
  if (!doo) return NextResponse.json({ error: "Ordem não pertence a esta distribuição" }, { status: 400 });
  if (!doo.data_baixa) {
    return NextResponse.json({ error: "Esta ordem ainda não teve saída registrada — nada a estornar" }, { status: 400 });
  }

  // ── Coleta snapshot ANTES de qualquer mudança ────────────────────────────────
  const [fech] = await sql`
    SELECT id, peso, pmc, total_pedras_un, total_pedras_g, foto_balanca
    FROM alissonerp.fechamentos_distribuicao
    WHERE distribuicao_id = ${distId} AND ordem_id = ${ordem_id}
    LIMIT 1
  `;
  const pedras = await sql`
    SELECT id, insumo_id, qtd_utilizada, peso_unitario, peso_total
    FROM alissonerp.distribuicao_saida_pedras
    WHERE distribuicao_ordem_id = ${doo.id}
  `;
  const [pcp] = await sql`
    SELECT id FROM alissonerp.pcp
    WHERE ordem_id = ${ordem_id} AND etapas::text NOT IN ('concluido', 'cancelado')
    ORDER BY id DESC LIMIT 1
  `;

  const semPeso      = doo.sem_peso === true;
  const pmc          = Number(fech?.pmc ?? 0);
  const totPedrasUn  = Number(fech?.total_pedras_un ?? 0);
  const totPedrasG   = Number(fech?.total_pedras_g ?? 0);
  const depDist      = dist.deposito_id as number;
  const quebraLote   = Number(dist.quebra_lote ?? 0);
  const loteConcluido = dist.etapas === "concluido";
  const obsEstorno   = `Estorno dist #${distId} ordem ${ordem_id}`;

  const snapshot = {
    distribuicao_id:  distId,
    ordem_id,
    doo:              { ...doo },
    fechamento:       fech   ? { ...fech }    : null,
    pedras:           [...pedras],
    pcp_id:           pcp?.id ?? null,
    sem_peso:         semPeso,
    pmc,
    total_pedras_un:  totPedrasUn,
    total_pedras_g:   totPedrasG,
    lote_concluido:   loteConcluido,
    quebra_lote:      quebraLote,
    estornado_por:    user.id,
    estornado_em:     new Date().toISOString(),
  };

  // ── TRANSAÇÃO ÚNICA ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {

    // FASE 1 — Se lote CONCLUÍDO: reabrir + reverter balanço
    if (loteConcluido) {
      await tx`
        UPDATE alissonerp.distribuicoes
        SET etapas                = 'em_andamento',
            ouro_entregue         = NULL,
            ouro_pecas            = NULL,
            quebra_lote           = NULL,
            peso_final            = NULL,
            pmc                   = NULL,
            quebra                = NULL,
            porcentagem_de_quebra = NULL,
            updated_at            = now()
        WHERE id = ${distId}
      `;

      // CE QUEBRA_LOTE só existe se quebraLote > 0 (ver concluir/route.ts linha 117)
      if (quebraLote > 0) {
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_at, local_estoque_id)
          VALUES
            (1, ${depDist}, ${quebraLote}, 0,
             'ESTORNO'::alissonerp.enum_marcador_estoque,
             ${`${obsEstorno} — estorno quebra lote`}, now(), 1)
        `;
      }

      // Deletar registro de quebra do operador (tipo='conclusao_lote')
      await tx`
        DELETE FROM alissonerp.quebra_operador
        WHERE distribuicao_id = ${distId} AND tipo = 'conclusao_lote'
      `;
    }

    // FASE 2 — Reverter par TEDD (somente saída com peso)
    if (!semPeso && pmc > 0) {
      // Devolver ouro ao operador (entrada no dep_dist)
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, entrada, saida, marcador, obs, ordem_id, created_at, local_estoque_id)
        VALUES
          (1, ${depDist}, ${pmc}, 0,
           'ESTORNO'::alissonerp.enum_marcador_estoque,
           ${obsEstorno}, ${ordem_id}, now(), 1)
      `;
      // Retirar ouro do almoxarifado (saída do dep1)
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, entrada, saida, marcador, obs, ordem_id, created_at, local_estoque_id)
        VALUES
          (1, 1, 0, ${pmc},
           'ESTORNO'::alissonerp.enum_marcador_estoque,
           ${obsEstorno}, ${ordem_id}, now(), 1)
      `;
    }

    // FASE 3 — Decrementar totais no PCP
    if (pcp?.id && !semPeso) {
      await tx`
        UPDATE alissonerp.pcp
        SET total_metal     = total_metal     - ${pmc},
            total_pedras_un = total_pedras_un - ${totPedrasUn},
            total_pedras_g  = total_pedras_g  - ${totPedrasG},
            updated_at      = now()
        WHERE id = ${pcp.id as number}
      `;
    }

    // FASE 3b — Restaurar local_atual para dep_dist (saiu do almoxarifado)
    await tx`
      UPDATE alissonerp.ordens
      SET local_atual = ${depDist}, updated_at = now()
      WHERE id = ${ordem_id}
    `;

    // FASE 4 — Deletar dados físicos da saída
    await tx`DELETE FROM alissonerp.distribuicao_saida_pedras WHERE distribuicao_ordem_id = ${doo.id as number}`;
    await tx`DELETE FROM alissonerp.itens_ordem_insumos WHERE ordem_id = ${ordem_id}`;

    // FASE 5 — Resetar distribuicao_ordens (desfaz a saída registrada)
    await tx`
      UPDATE alissonerp.distribuicao_ordens
      SET peso_bruto             = 0,
          peso_pedras            = 0,
          peso_ouro_real         = 0,
          data_baixa             = NULL,
          saida_por              = NULL,
          foto_balanca           = NULL,
          sem_peso               = false,
          justificativa_sem_peso = NULL
      WHERE id = ${doo.id as number}
    `;

    // FASE 6 — Resetar fechamentos_distribuicao
    // Trigger fn_processar_fechamento_dist NÃO dispara: guard "peso <= 0 → RETURN NEW"
    if (fech?.id) {
      await tx`
        UPDATE alissonerp.fechamentos_distribuicao
        SET peso            = 0,
            pmc             = 0,
            total_pedras_un = 0,
            total_pedras_g  = 0,
            foto_balanca    = NULL,
            updated_at      = now()
        WHERE id = ${fech.id as number}
      `;
    }

    // FASE 7 — Registrar estorno (auditoria imutável)
    await tx`
      INSERT INTO alissonerp.estornos_distribuicao
        (distribuicao_id, ordem_id, motivo, justificativa, estornado_por, dados_revertidos)
      VALUES
        (${distId}, ${ordem_id}, ${motivo.trim()}, ${justificativa.trim()},
         ${user.id}::uuid, ${JSON.stringify(snapshot)})
    `;
  });

  // Fora da transação: recalcular dist_* no PCP (fire-and-forget)
  if (pcp?.id) {
    recalcularTotaisPCP(pcp.id as number).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
