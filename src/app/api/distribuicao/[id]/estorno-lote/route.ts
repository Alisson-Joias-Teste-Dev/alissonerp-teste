import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { recalcularTotaisPCP } from "@/lib/recalcular-totais-pcp";

// POST /api/distribuicao/[id]/estorno-lote
// Body: { motivo: string, justificativa: string }
//
// Reverte TODOS os efeitos de um lote inteiro (em_andamento ou concluido).
// Lógica central: para CADA CE do lote (marcador != ESTORNO), cria uma reversa exata.
// Delta = zero garantido.
//
// FLUXO:
//   Fase 1 (se concluido): reabrir lote + reverter CE QUEBRA_LOTE + deletar quebra_operador
//   Fase 2: reverter CADA CE individualmente (TED, TEDD, etc.) — delta zero
//   Fase 3: resetar distribuicao_ordens + fechamentos + pedras + itens_insumos + local_atual
//   Fase 4: decrementar PCP.total_metal/total_pedras_* por ordem
//   Fase 5: registrar estorno com snapshot JSONB (ordem_id = NULL = lote inteiro)
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
  const { motivo, justificativa } = await req.json() as {
    motivo: string;
    justificativa: string;
  };

  if (!motivo?.trim()) return NextResponse.json({ error: "Motivo obrigatório" }, { status: 400 });
  if (!justificativa?.trim() || justificativa.trim().length < 10) {
    return NextResponse.json({ error: "Justificativa obrigatória (mínimo 10 caracteres)" }, { status: 400 });
  }
  if (motivo === "outro" && justificativa.trim().length < 20) {
    return NextResponse.json({ error: "Para 'Outro motivo', justificativa mínima de 20 caracteres" }, { status: 400 });
  }

  // ── Validações ──────────────────────────────────────────────────────────────
  const [dist] = await sql`
    SELECT id, etapas::text, deposito_id, setor_id, quebra_lote
    FROM alissonerp.distribuicoes WHERE id = ${distId}
  `;
  if (!dist) return NextResponse.json({ error: "Distribuição não encontrada" }, { status: 404 });

  const ordens = await sql`
    SELECT doo.id, doo.ordens_id, doo.data_baixa,
           doo.peso_bruto, doo.peso_pedras, doo.peso_ouro_real, doo.sem_peso,
           o.numero_ordem
    FROM alissonerp.distribuicao_ordens doo
    JOIN alissonerp.ordens o ON o.id = doo.ordens_id
    WHERE doo.distribuicao_id = ${distId}
  `;
  if (ordens.length === 0) {
    return NextResponse.json({ error: "Distribuição sem ordens" }, { status: 400 });
  }

  const ordemIds = ordens.map((o) => Number(o.ordens_id));

  // ── Coleta snapshot ANTES de qualquer mudança ────────────────────────────────
  const fechamentos = await sql`
    SELECT id, ordem_id, peso, pmc, total_pedras_un, total_pedras_g, foto_balanca
    FROM alissonerp.fechamentos_distribuicao
    WHERE distribuicao_id = ${distId}
  `;

  const pedrasSaida = await sql`
    SELECT dsp.id, dsp.distribuicao_ordem_id, dsp.insumo_id, dsp.qtd_utilizada,
           dsp.peso_unitario, dsp.peso_total
    FROM alissonerp.distribuicao_saida_pedras dsp
    JOIN alissonerp.distribuicao_ordens doo ON doo.id = dsp.distribuicao_ordem_id
    WHERE doo.distribuicao_id = ${distId}
  `;

  // Todas as CEs do lote (exceto ESTORNO — nunca reverter o estorno)
  const movimentacoes = await sql`
    SELECT id, insumo_id, deposito_id, entrada, saida, marcador::text AS marcador, ordem_id, obs
    FROM alissonerp.movimentacoes_estoque
    WHERE ordem_id = ANY(${ordemIds})
    AND marcador::text IN ('TEDD', 'QUEBRA_LOTE')
    AND obs ~ ${'distribuicao #' + distId + '([^0-9]|$)'}
    ORDER BY created_at, id
  `;

  // PCPs ativos de cada ordem (para recalcular pós-tx e reverter totais)
  const pcps = await sql`
    SELECT DISTINCT ON (ordem_id) id, ordem_id
    FROM alissonerp.pcp
    WHERE ordem_id = ANY(${ordemIds})
    AND etapas::text NOT IN ('concluido', 'cancelado')
    ORDER BY ordem_id, id DESC
  `;

  const quebraLote    = Number(dist.quebra_lote ?? 0);
  const loteConcluido = dist.etapas === "concluido";
  const depDist       = dist.deposito_id as number;
  const obsBase       = `Estorno lote #${distId}`;

  // Apontamentos do lote (para Fase 2.5 e snapshot)
  const apontamentos = await sql`
    SELECT id, tipo_apontamento_id, deposito_id, insumo_id, qtd
    FROM alissonerp.apontamentos_distribuicao
    WHERE distribuicao_id = ${distId}
  `;

  const snapshot = {
    distribuicao_id:         distId,
    lote_etapa_anterior:     dist.etapas,
    deposito_id:             depDist,
    quebra_lote:             quebraLote,
    ordens:                  [...ordens],
    fechamentos:             [...fechamentos],
    pedras_saida:            [...pedrasSaida],
    apontamentos:            [...apontamentos],
    movimentacoes_revertidas: movimentacoes.length,
    movimentacoes_snapshot:  [...movimentacoes],
    estornado_por:           user.id,
    estornado_em:            new Date().toISOString(),
  };

  // ── TRANSAÇÃO ÚNICA ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {

    // FASE 1 — Se lote CONCLUÍDO: reabrir + reverter QUEBRA_LOTE + deletar quebra_operador
    if (loteConcluido) {
      await tx`
        UPDATE alissonerp.distribuicoes
        SET etapas                  = 'em_andamento',
            ouro_entregue           = NULL,
            ouro_pecas              = NULL,
            quebra_lote             = NULL,
            peso_final              = NULL,
            pmc                     = NULL,
            quebra                  = NULL,
            porcentagem_de_quebra   = NULL,
            total_metal             = 0,
            retorno_metal           = 0,
            total_pedras_un         = 0,
            total_pedras_g          = 0,
            total_outros_pesos      = 0,
            total_geral_outros_pesos = 0,
            updated_at              = now()
        WHERE id = ${distId}
      `;

      // CE QUEBRA_LOTE só existe quando quebraLote > 0 (ver concluir/route.ts linha 117)
      // QUEBRA_LOTE não tem ordem_id → não é capturada pela Fase 2 → tratar aqui
      if (quebraLote > 0) {
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_by, created_at, local_estoque_id)
          VALUES
            (1, ${depDist}, ${quebraLote}, 0,
             'ESTORNO'::alissonerp.enum_marcador_estoque,
             ${`${obsBase} — estorno quebra lote`},
             ${user.id}::uuid, now(), 1)
        `;
      }

      await tx`
        DELETE FROM alissonerp.quebra_operador
        WHERE distribuicao_id = ${distId} AND tipo = 'conclusao_lote'
      `;
    }

    // FASE 2 — Reverter CADA CE individualmente (CORAÇÃO DO ESTORNO — delta zero)
    for (const ce of movimentacoes) {
      const entradaReversa = Number(ce.saida)   || 0; // saida original  → vira entrada
      const saidaReversa   = Number(ce.entrada) || 0; // entrada original → vira saida

      if (entradaReversa > 0 || saidaReversa > 0) {
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, ordem_id, obs, created_by, created_at, local_estoque_id)
          VALUES (
            ${ce.insumo_id as number},
            ${ce.deposito_id as number},
            ${entradaReversa},
            ${saidaReversa},
            'ESTORNO'::alissonerp.enum_marcador_estoque,
            ${ce.ordem_id as number},
            ${`${obsBase} — reversão CE #${ce.id}`},
            ${user.id}::uuid,
            now(),
            1
          )
        `;
      }
    }

    // FASE 2.5 — Reverter apontamentos de distribuição
    // apontamentos_distribuicao tem distribuicao_id mas NÃO tem ordem_id → CEs com ordem_id=NULL
    const almox = 1;
    for (const ap of apontamentos) {
      const tipo = Number(ap.tipo_apontamento_id);
      const dep  = Number(ap.deposito_id);
      const ins  = Number(ap.insumo_id);
      const qtd  = Number(ap.qtd);
      const obs  = `${obsBase} — reversão apontamento #${ap.id}`;

      if ([1, 2, 3].includes(tipo)) {
        // Entrada (Almox → Operador): reversa devolve ao Almox
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_by, created_at, local_estoque_id)
          VALUES (${ins}, ${dep},   0,     ${qtd}, 'ESTORNO'::alissonerp.enum_marcador_estoque, ${obs}, ${user.id}::uuid, now(), 1)
        `;
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_by, created_at, local_estoque_id)
          VALUES (${ins}, ${almox}, ${qtd},   0,    'ESTORNO'::alissonerp.enum_marcador_estoque, ${obs}, ${user.id}::uuid, now(), 1)
        `;
      } else if ([5, 6].includes(tipo)) {
        // Retorno (Operador → Almox): reversa devolve ao Operador
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_by, created_at, local_estoque_id)
          VALUES (${ins}, ${almox}, 0,     ${qtd}, 'ESTORNO'::alissonerp.enum_marcador_estoque, ${obs}, ${user.id}::uuid, now(), 1)
        `;
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, entrada, saida, marcador, obs, created_by, created_at, local_estoque_id)
          VALUES (${ins}, ${dep},  ${qtd},   0,    'ESTORNO'::alissonerp.enum_marcador_estoque, ${obs}, ${user.id}::uuid, now(), 1)
        `;
      }
    }

    // Deletar apontamentos do lote para que o operador reapontar do zero
    await tx`
      DELETE FROM alissonerp.apontamentos_distribuicao WHERE distribuicao_id = ${distId}
    `;

    // FASE 3 — Resetar cada ordem do lote
    for (const ordem of ordens) {
      // 3a. Reset distribuicao_ordens (desfaz saída registrada)
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
        WHERE id = ${ordem.id as number}
      `;

      // 3b. Deletar pedras de saída desta ordem
      await tx`
        DELETE FROM alissonerp.distribuicao_saida_pedras
        WHERE distribuicao_ordem_id = ${ordem.id as number}
      `;

      // 3c. Resetar fechamento (peso=0 → trigger guard peso<=0 impede redisparo)
      await tx`
        UPDATE alissonerp.fechamentos_distribuicao
        SET peso            = 0,
            pmc             = 0,
            total_pedras_un = 0,
            total_pedras_g  = 0,
            foto_balanca    = NULL,
            updated_at      = now()
        WHERE distribuicao_id = ${distId} AND ordem_id = ${ordem.ordens_id as number}
      `;

      // 3d. Deletar itens_ordem_insumos (cópia criada pelo trigger)
      await tx`
        DELETE FROM alissonerp.itens_ordem_insumos WHERE ordem_id = ${ordem.ordens_id as number}
      `;

      // 3e. Restaurar local_atual da ordem para o depósito do lote
      await tx`
        UPDATE alissonerp.ordens SET local_atual = ${depDist}, updated_at = now()
        WHERE id = ${ordem.ordens_id as number}
      `;
    }

    // FASE 4 — Reverter PCP de cada ordem (subtrai o que o trigger havia somado)
    for (const ordem of ordens) {
      const fech = fechamentos.find((f) => Number(f.ordem_id) === Number(ordem.ordens_id));
      if (!fech || Number(fech.peso) <= 0) continue;

      const pcp = pcps.find((p) => Number(p.ordem_id) === Number(ordem.ordens_id));
      if (!pcp) continue;

      await tx`
        UPDATE alissonerp.pcp
        SET total_metal     = GREATEST(0, total_metal     - ${Number(fech.pmc)           || 0}),
            total_pedras_un = GREATEST(0, total_pedras_un - ${Number(fech.total_pedras_un) || 0}),
            total_pedras_g  = GREATEST(0, total_pedras_g  - ${Number(fech.total_pedras_g)  || 0}),
            updated_at      = now()
        WHERE id = ${pcp.id as number}
      `;
    }

    // FASE 5 — Registrar estorno (auditoria imutável, ordem_id = NULL = lote inteiro)
    await tx`
      INSERT INTO alissonerp.estornos_distribuicao
        (distribuicao_id, ordem_id, motivo, justificativa, estornado_por, dados_revertidos)
      VALUES
        (${distId}, NULL, ${motivo.trim()}, ${justificativa.trim()},
         ${user.id}::uuid, ${JSON.stringify(snapshot)})
    `;
  });

  // Fora da transação: recalcular dist_* no PCP (fire-and-forget)
  for (const pcp of pcps) {
    recalcularTotaisPCP(pcp.id as number).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
