import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { registrarQuebra, buscarOuroRecebido } from "@/lib/registrar-quebra";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/pcp/transferir
// Move uma ordem do PCP de um depósito/operador para outro.
//
// O que faz:
//   1. Determina a ORIGEM correta:
//      - ordens.local_atual (fonte de verdade)
//   2. Recebe os insumos confirmados pelo usuário (pré-preenchidos pela GET insumos-transferencia)
//   3. Cria movimentacoes_estoque dupla-entrada para cada insumo com quantidade > 0
//      → SAÍDA da origem + ENTRADA no destino
//   4. Registra em transferencias_ordem (setor_id=NULL para não disparar trigger legado)
//   5. Atualiza pcp.deposito_id e ordens.local_atual para o destino

export async function POST(req: NextRequest) {
  const {
    pcp_id,
    destino_deposito_id,
    setor_id,
    insumos,
    obs,
    user_id,
    foto_balanca,
  } = await req.json() as {
    pcp_id: number;
    destino_deposito_id: number;
    setor_id?: number | null;
    insumos?: Array<{ insumo_id: number; quantidade: number }>;
    obs?: string | null;
    user_id?: string | null;
    foto_balanca?: string | null;
  };

  if (!pcp_id || !destino_deposito_id) {
    return NextResponse.json(
      { error: "pcp_id e destino_deposito_id são obrigatórios" },
      { status: 400 },
    );
  }
  if (destino_deposito_id === 1) {
    return NextResponse.json(
      { error: "Não é possível transferir para o Almoxarifado Central" },
      { status: 400 },
    );
  }

  // Guard ourives: só pode transferir PCPs do seu depósito
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const [caller] = await sql`
      SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];
    if (caller && !ROLES_VE_TUDO.includes(caller.role as string) && caller.deposito_id != null) {
      const [pcpRow] = await sql`SELECT deposito_id FROM alissonerp.pcp WHERE id = ${pcp_id} LIMIT 1`;
      if (pcpRow && pcpRow.deposito_id !== caller.deposito_id) {
        return NextResponse.json({ error: "Ordem não pertence ao seu depósito" }, { status: 403 });
      }
    }
  }

  // 1. Buscar PCP + local_atual da ordem (fonte de verdade da origem)
  const [pcp] = await sql`
    SELECT p.id, p.deposito_id, p.ordem_id, p.etapas,
           COALESCE(p.dist_ouro_real, 0)::float8 AS dist_ouro_real,
           o.local_atual, o.setor_atual, o.numero_ordem,
           dep.nome AS origem_deposito_nome,
           set_.nome AS origem_setor_nome
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    LEFT JOIN alissonerp.depositos dep ON dep.id = o.local_atual
    LEFT JOIN alissonerp.setores set_  ON set_.id = o.setor_atual
    WHERE p.id = ${pcp_id}
    LIMIT 1
  `;
  if (!pcp) {
    return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  }
  if (pcp.etapas === "concluido" || pcp.etapas === "cancelado") {
    return NextResponse.json(
      { error: "PCP já concluído ou cancelado não pode ser transferido" },
      { status: 422 },
    );
  }

  const ordemId      = pcp.ordem_id as number | null;
  const distOuroReal = Number(pcp.dist_ouro_real ?? 0);

  // 2. Depósito de origem = onde a ordem está agora
  //    Fonte de verdade: ordens.local_atual, fallback: pcp.deposito_id, último fallback: Almoxarifado (1)
  const origemDepositoId = Number(pcp.local_atual) || Number(pcp.deposito_id) || 1;

  if (origemDepositoId === destino_deposito_id) {
    return NextResponse.json(
      { error: "Destino deve ser diferente da origem" },
      { status: 422 },
    );
  }

  // 3. Movimentações: usa insumos confirmados pelo usuário (via modal)
  //    Se insumos não enviados (chamada legada), calcula saldo automaticamente
  const insumosParaMovimentar: Array<{ insumo_id: number; quantidade: number }> =
    insumos && insumos.length > 0
      ? insumos.filter((i) => i.quantidade > 0)
      : await calcularSaldoAutomatico(pcp_id, distOuroReal);

  // 3a-pre. Capturar saldo líquido de ouro da origem ANTES de inserir qualquer CE.
  //   buscarOuroRecebido retorna SUM(entrada)−SUM(saída) do operador para esta ordem.
  //   Precisa ser chamado aqui para evitar dupla-contagem: se o operador já recebeu
  //   ouro desta ordem antes, as saídas anteriores devem ser subtraídas das entradas.
  const ouroInsumoParaQuebra = origemDepositoId !== 1
    ? insumosParaMovimentar.find((i) => i.insumo_id === 1)
    : undefined;
  const ouroRecebidoAntes = (origemDepositoId !== 1 && ouroInsumoParaQuebra && ouroInsumoParaQuebra.quantidade > 0)
    ? await buscarOuroRecebido(ordemId!, origemDepositoId)
    : 0;

  for (const insumo of insumosParaMovimentar) {
    // SAÍDA da origem
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, setor_id, ordem_id, saida, entrada,
         marcador, obs, data_hora, valor_total, preco_compra, created_by, local_estoque_id)
      VALUES
        (${insumo.insumo_id}, ${origemDepositoId}, ${null}, ${ordemId ?? null},
         ${insumo.quantidade}, ${0},
         ${"TED"}, ${obs ?? null}, now(), ${0}, ${0}, ${user?.id ?? null}::uuid, ${1})
    `;

    // ENTRADA no destino
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, setor_id, ordem_id, saida, entrada,
         marcador, obs, data_hora, valor_total, preco_compra, created_by, local_estoque_id)
      VALUES
        (${insumo.insumo_id}, ${destino_deposito_id}, ${setor_id ?? null}, ${ordemId ?? null},
         ${0}, ${insumo.quantidade},
         ${"TED"}, ${obs ?? null}, now(), ${0}, ${0}, ${user?.id ?? null}::uuid, ${1})
    `;
  }

  // 3b. Registrar quebra do operador de ORIGEM (se não for o pote)
  //     Usa ouroRecebidoAntes (saldo líquido capturado ANTES das CEs desta transferência).
  if (origemDepositoId !== 1 && ouroInsumoParaQuebra && ouroInsumoParaQuebra.quantidade > 0) {
    {
      const ouroInsumo = ouroInsumoParaQuebra;
      const ouroRecebido = ouroRecebidoAntes;
      await registrarQuebra({
        ordem_id:      ordemId!,
        pcp_id,
        deposito_id:   origemDepositoId,
        setor_id:      pcp.setor_atual as number | null ?? null,
        numero_ordem:  (pcp.numero_ordem as string) ?? "",
        deposito_nome: (pcp.origem_deposito_nome as string) ?? "",
        setor_nome:    (pcp.origem_setor_nome as string | null) ?? null,
        tipo:          "transferencia",
        ouro_recebido: ouroRecebido,
        ouro_entregue: ouroInsumo.quantidade,
        created_by:    user?.id ?? null,
      });

      // 3c. CE de baixa da quebra no saldo contábil do operador de ORIGEM
      //     Sem essa movimentação o saldo residual (ouro_recebido − ouro_entregue)
      //     permanece no depósito do operador indefinidamente.
      //     Marcador QUEBRA_PCP é o padrão do sistema para baixa de residual de ouro
      //     (mesmo enum usado pela saída PCP — não existe QUEBRA_TED no enum).
      const quebraTransf = parseFloat((ouroRecebido - ouroInsumo.quantidade).toFixed(4));
      if (quebraTransf > 0) {
        await sql`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, saida, marcador, ordem_id, obs, created_at, local_estoque_id)
          VALUES
            (1, ${origemDepositoId}, ${quebraTransf}::real,
             'QUEBRA_PCP'::alissonerp.enum_marcador_estoque,
             ${ordemId ?? null},
             ${'Quebra transferência PCP #' + pcp_id},
             NOW(), 1)
        `;
      }
    }
  }

  // 4. Registrar em transferencias_ordem
  //    setor_id = NULL INTENCIONALMENTE para bloquear o trigger fn_processar_transferencia
  //    (guard: IF NEW.setor_id IS NULL THEN RETURN NEW — trigger usa dados legados incorretos)
  //
  //    foto_balanca: salva no campo obs até que a coluna seja adicionada:
  //    ALTER TABLE alissonerp.transferencias_ordem ADD COLUMN IF NOT EXISTS foto_balanca text;
  const obsComFoto = [obs?.trim() || null, foto_balanca ? `[foto:${foto_balanca}]` : null]
    .filter(Boolean)
    .join(" ") || null;

  await sql`
    INSERT INTO alissonerp.transferencias_ordem
      (pcp_id, ordem_id, deposito_id, setor_id, obs, created_by)
    VALUES
      (${pcp_id}, ${ordemId ?? null}, ${destino_deposito_id}, ${null},
       ${obsComFoto}, ${user?.id ?? null}::uuid)
  `;

  // 5. Atualizar depósito do PCP
  //    Se estava 'aguardando' (distribuição), a transferência inicia o trabalho → em_andamento
  const novaEtapa = pcp.etapas === "aguardando" ? "em_andamento" : (pcp.etapas as string);
  await sql`
    UPDATE alissonerp.pcp
    SET deposito_id = ${destino_deposito_id},
        etapas      = ${novaEtapa}::alissonerp.enum_etapas_pcp,
        updated_at  = now()
    WHERE id = ${pcp_id}
  `;

  // 6. Atualizar ordens.local_atual
  //    vw_pcp_erp usa o.local_atual (não pcp.deposito_id) para exibir no Kanban
  if (ordemId) {
    await sql`
      UPDATE alissonerp.ordens
      SET local_atual  = ${destino_deposito_id},
          setor_atual  = ${setor_id ?? null},
          updated_at   = now()
      WHERE id = ${ordemId}
    `;
  }

  return NextResponse.json({
    ok: true,
    pcp_id,
    origem_deposito_id: origemDepositoId,
    destino_deposito_id,
    movimentacoes: insumosParaMovimentar.length * 2,
  });
}

// Fallback: calcula saldo automaticamente quando insumos não são enviados.
// Mantido para compatibilidade — o modal sempre envia insumos confirmados.
async function calcularSaldoAutomatico(
  pcp_id: number,
  distOuroReal: number,
): Promise<Array<{ insumo_id: number; quantidade: number }>> {
  const result: Array<{ insumo_id: number; quantidade: number }> = [];

  // Metal (insumo_id=1)
  const [metalRow] = await sql`
    SELECT
      COALESCE(p.dist_ouro_real, 0)
      + COALESCE(SUM(CASE
          WHEN a.tipo_apontamento_id = 1                                    THEN a.qtd
          WHEN a.tipo_apontamento_id = 2 AND ${distOuroReal}::float8 = 0   THEN a.qtd
          ELSE 0
        END), 0)
      - COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 5 THEN a.qtd ELSE 0 END), 0)
      AS saldo
    FROM alissonerp.pcp p
    LEFT JOIN alissonerp.apontamentos_pcp a ON a.pcp_id = p.id AND a.insumo_id = 1
    WHERE p.id = ${pcp_id}
    GROUP BY p.id, p.dist_ouro_real
  `;
  const metalSaldo = Number(metalRow?.saldo ?? 0);
  if (metalSaldo > 0) result.push({ insumo_id: 1, quantidade: metalSaldo });

  // Pedras (cat=2): Entrada (tipo 3) − Retorno (tipo 6)
  const pedrasSaldos = await sql`
    SELECT
      a.insumo_id,
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END), 0)
      AS saldo
    FROM alissonerp.apontamentos_pcp a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE a.pcp_id = ${pcp_id}
      AND i.categoria_id = 2
      AND a.insumo_id IS NOT NULL
    GROUP BY a.insumo_id
    HAVING
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END), 0)
      > 0
  `;
  for (const row of pedrasSaldos) {
    result.push({ insumo_id: Number(row.insumo_id), quantidade: Number(row.saldo) });
  }

  return result;
}
