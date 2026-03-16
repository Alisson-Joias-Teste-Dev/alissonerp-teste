import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { registrarQuebra, buscarOuroRecebido } from "@/lib/registrar-quebra";

// POST /api/pcp/saida — registra saída final do PCP
//
// Estratégia: BYPASS trigger trg_after_saida_ordem (insert com peso=0)
// e gerencia tudo manualmente com dados reais dos apontamentos_pcp.
//
// Lógica:
//   ouro_entregue = Σ tipos 2+1 (entrada+aditivo) − tipo 5 (retorno) + dist_ouro_real
//   peso_pedras   = Σ(qtd_utilizada × peso_pedra)
//   peso_ouro_real = peso_bruto − peso_pedras
//   pmc           = peso_ouro_real − metal_externo − total_outros (= peso_ouro_real, pois sem dist)
//   consumo       = ouro_entregue − retorno_metal
//   quebra        = consumo − pmc
//   %             = quebra / consumo × 100
//
// CE SM: saida dep_operador — peso_ouro_real — SEM entrada no pote (ouro virou peça)
// CE QUEBRA_PCP: saida dep_operador — quebra — SEM entrada no pote (só se quebra > 0)
// Pedras: NÃO geram movimentação (consumidas na peça)
export async function POST(req: NextRequest) {
  const {
    pcp_id,
    peso_bruto,
    pedras_utilizadas,
    peso_outros,
    foto_balanca,
    user_id,
  } = await req.json() as {
    pcp_id: number;
    peso_bruto: number;
    pedras_utilizadas?: { insumo_id: number; qtd_utilizada: number }[];
    peso_outros?: number | null;
    foto_balanca?: string | null;
    user_id?: string | null;
  };

  if (!pcp_id) {
    return NextResponse.json({ error: "pcp_id obrigatório" }, { status: 400 });
  }
  if (!peso_bruto || peso_bruto <= 0) {
    return NextResponse.json({ error: "Peso bruto deve ser maior que zero" }, { status: 400 });
  }
  if (!foto_balanca) {
    return NextResponse.json({ error: "Foto da balança obrigatória" }, { status: 400 });
  }

  // 1. Carregar PCP e validar estado
  const [pcp] = await sql`
    SELECT
      p.id, p.etapas::text AS etapas, p.ordem_id, p.deposito_id,
      p.total_metal, p.retorno_metal, p.metal_externo,
      p.total_geral_outros_pesos, p.dist_ouro_real
    FROM alissonerp.pcp p
    WHERE p.id = ${pcp_id}
    LIMIT 1
  `;
  if (!pcp) {
    return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  }
  if (pcp.etapas !== "em_andamento") {
    return NextResponse.json(
      { error: `PCP está em etapa "${pcp.etapas}" — somente em_andamento pode ter saída` },
      { status: 400 },
    );
  }

  const ordemId   = pcp.ordem_id as number;
  const depositoId = (pcp.deposito_id as number | null) ?? 2; // depósito do operador

  // 2. Calcular peso das pedras utilizadas
  let peso_pedras_total = 0;
  const pedrasInfo: { insumo_id: number; qtd: number; peso_unitario: number; peso_total: number }[] = [];

  for (const p of pedras_utilizadas ?? []) {
    if (!p.qtd_utilizada || p.qtd_utilizada <= 0) continue;
    const [ins] = await sql`
      SELECT COALESCE(peso_pedra, 0)::float8 AS peso_pedra
      FROM alissonerp.insumos WHERE id = ${p.insumo_id} LIMIT 1
    `;
    const pu = Number(ins?.peso_pedra ?? 0);
    const pt = p.qtd_utilizada * pu;
    peso_pedras_total += pt;
    pedrasInfo.push({ insumo_id: p.insumo_id, qtd: p.qtd_utilizada, peso_unitario: pu, peso_total: pt });
  }

  // 3. Calcular valores finais
  const peso_outros_num    = Number(peso_outros ?? 0);
  // ouro_real = bruto − pedras − outros (formula simplificada)
  const peso_ouro_real     = peso_bruto - peso_pedras_total - peso_outros_num;
  const metal_externo      = Number(pcp.metal_externo ?? 0);
  const dist_ouro_real     = Number(pcp.dist_ouro_real ?? 0);

  // PMC = peso_ouro_real − metal_externo (outros já descontado em peso_ouro_real)
  const pmc = peso_ouro_real - metal_externo;

  // Total Metal = mesma fórmula do resumo do card:
  //   Σ qtd tipos 1+2 (entrada+aditivo) − Σ qtd tipo 5 (retorno) + dist_ouro_real
  //   Calculado ao vivo de apontamentos_pcp — NÃO usa pcp.total_metal (campo stored pode estar errado)
  const [metalCalc] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id IN (1, 2) THEN a.qtd ELSE 0 END), 0)::float8 AS entrada,
      COALESCE(SUM(CASE WHEN a.tipo_apontamento_id = 5        THEN a.qtd ELSE 0 END), 0)::float8 AS retorno
    FROM alissonerp.apontamentos_pcp a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE a.pcp_id = ${pcp_id}
      AND i.categoria_id = 1
  `;
  const metal_liquido = Number(metalCalc.entrada) - Number(metalCalc.retorno);
  const total_metal   = metal_liquido + dist_ouro_real;

  // quebra = total_metal − ouro_real
  const quebra             = total_metal - peso_ouro_real;
  const porcentagem_quebra = total_metal !== 0 ? (quebra / total_metal) * 100 : 0;

  // 4. Inserir saida_ordem com peso=0 para SUPRIMIR o trigger
  //    (trigger guard: IF NEW.peso IS NULL OR NEW.peso <= 0 → RETURN NEW)
  const [saida] = await sql`
    INSERT INTO alissonerp.saidas_ordem (ordem_id, deposito_id, peso, obs, created_by)
    VALUES (${ordemId}, ${depositoId}, 0, 'Saída via PCP — gerenciado pelo ERP', ${user_id ?? null})
    RETURNING id
  `;
  const saidaId = saida.id as number;

  // 5. Atualizar PCP: peso_final, pmc, quebra, etapas=concluido
  await sql`
    UPDATE alissonerp.pcp SET
      peso_final               = ${peso_ouro_real},
      pmc                      = ${Math.round(pmc * 1000) / 1000},
      total_geral_outros_pesos = ${peso_outros_num},
      quebra                   = ${Math.round(quebra * 1000) / 1000},
      porcentagem_de_quebra    = ${Math.round(porcentagem_quebra * 100) / 100},
      saida_ordem_id           = ${saidaId},
      etapas                   = 'concluido',
      data_conclusao           = now(),
      updated_at               = now()
    WHERE id = ${pcp_id}
  `;

  // 6. Atualizar ordens: local_atual → Almox (peça volta pro pote)
  //    status permanece em_andamento — a ordem só conclui na Entrega
  await sql`
    UPDATE alissonerp.ordens SET
      local_atual = 1,
      setor_atual = NULL,
      updated_at  = now()
    WHERE id = ${ordemId}
  `;

  // 7. CE: SM — saída do depósito do operador (ouro virou peça — sem entrada no pote)
  //    Só cria se houver ouro real (peso_ouro_real > 0)
  if (peso_ouro_real > 0) {
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, saida, marcador, ordem_id, obs, created_at)
      VALUES
        (1, ${depositoId}, ${peso_ouro_real}::real,
         'SM'::alissonerp.enum_marcador_estoque,
         ${ordemId},
         ${'Saída PCP #' + pcp_id + ' → saida_id #' + saidaId},
         NOW())
    `;
  }

  // 7b. CE de baixa definitiva da quebra — só se quebra > 0 e operador != pote
  //     Saída do depósito do operador, sem entrada no almoxarifado.
  //     Marcador 'QUEBRA_PCP' identifica baixa de residual de saída PCP.
  if (depositoId !== 1 && quebra > 0) {
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, saida, marcador, ordem_id, created_at)
      VALUES
        (1, ${depositoId}, ${Math.round(quebra * 1000) / 1000},
         'QUEBRA_PCP'::alissonerp.enum_marcador_estoque,
         ${ordemId}, NOW())
    `;
  }

  // 7d. Registrar quebra do operador que realizou a saída (se não for o pote)
  if (depositoId !== 1 && peso_ouro_real > 0) {
    const [depRow] = await sql`
      SELECT nome FROM alissonerp.depositos WHERE id = ${depositoId} LIMIT 1
    `;
    const [pcpSetor] = await sql`
      SELECT o.setor_atual AS setor_id, s.nome AS setor_nome, o.numero_ordem
      FROM alissonerp.pcp p
      JOIN alissonerp.ordens o ON o.id = p.ordem_id
      LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
      WHERE p.id = ${pcp_id} LIMIT 1
    `;
    const ouroRecebido = await buscarOuroRecebido(ordemId, depositoId);
    await registrarQuebra({
      ordem_id:      ordemId,
      pcp_id,
      deposito_id:   depositoId,
      setor_id:      (pcpSetor?.setor_id as number | null) ?? null,
      numero_ordem:  (pcpSetor?.numero_ordem as string) ?? "",
      deposito_nome: (depRow?.nome as string) ?? "",
      setor_nome:    (pcpSetor?.setor_nome as string | null) ?? null,
      tipo:          "saida_pcp",
      ouro_recebido: ouroRecebido,
      ouro_entregue: peso_ouro_real,
      created_by:    user_id ?? null,
    });
  }

  // 8. Buscar dados complementares para a auditoria
  const [ordem] = await sql`
    SELECT o.peso_metal_negociado FROM alissonerp.ordens o WHERE o.id = ${ordemId} LIMIT 1
  `;
  const [pcpFull] = await sql`
    SELECT p.operador FROM alissonerp.pcp p WHERE p.id = ${pcp_id} LIMIT 1
  `;
  let ourives_nome = "Sem operador";
  if (pcpFull?.operador) {
    const [up] = await sql`
      SELECT name FROM public.user_profiles WHERE id_user = ${pcpFull.operador} LIMIT 1
    `;
    if (up?.name) ourives_nome = up.name as string;
  }

  // 9. Criar auditoria FÁBRICA (financeiro, automática pós-saída PCP)
  const jaExisteAuditoria = await sql`
    SELECT 1 FROM alissonerp.auditorias
    WHERE ordem_id = ${ordemId}
      AND tipo_auditoria = 'fabrica'
      AND situacao != 'reprovado'
    LIMIT 1
  `;
  if (jaExisteAuditoria.length === 0) {
    await sql`
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, peso_final, pmc,
        quebra, quebra_percentual,
        total_metal, retorno_metal, metal_externo,
        ourives_nome
      ) VALUES (
        'pendente',
        'fabrica',
        'saida_pcp',
        ${ordemId},
        ${Number(ordem?.peso_metal_negociado ?? 0)},
        ${peso_ouro_real},
        ${Math.round(pmc * 1000) / 1000},
        ${Math.round(quebra * 1000) / 1000},
        ${Math.round(porcentagem_quebra * 100) / 100},
        ${total_metal},
        ${Number(metalCalc.retorno)},
        ${metal_externo},
        ${ourives_nome}
      )
    `;
  }

  return NextResponse.json({
    ok: true,
    saida_id:          saidaId,
    peso_bruto,
    peso_pedras:       peso_pedras_total,
    peso_outros:       peso_outros_num,
    peso_ouro_real,
    total_metal:       Math.round(total_metal * 1000) / 1000,
    pmc:               Math.round(pmc * 1000) / 1000,
    quebra:            Math.round(quebra * 1000) / 1000,
    porcentagem_quebra: Math.round(porcentagem_quebra * 100) / 100,
  });
}
