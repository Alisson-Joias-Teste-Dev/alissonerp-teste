import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ConversaoReversaAprovarSchema = z.object({
  tarefa_id: z.coerce.number().int().positive(),
  conversao_reversa_id: z.coerce.number().int().positive().optional(),
}).passthrough();

/**
 * REGRA DE NEGÓCIO: peso restante disponível no Caixa de Ouro para uma origem.
 * DUPLICADO INTENCIONALMENTE de /api/conversao-reversa/route.ts — mesma fórmula,
 * usada aqui para REVALIDAR dentro da transação de aprovação (pode ter havido
 * sangria do cofre entre a abertura e a aprovação da conversão reversa).
 * Qualquer mudança na fórmula deve ser replicada nos dois arquivos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarPesoRestanteOrigem(db: any, origemTipo: "venda_ouro" | "upgrade" | "compra_metal" | "conversao", origemId: number) {
  // REGRA DE NEGÓCIO: cada tipo de origem guarda o peso bruto que entrou no cofre
  // num lugar diferente. status_ok = origem confirmada/registrada no cofre.
  let origem: { peso_origem: number; status_ok: boolean; origem_referencia: string | null } | undefined;
  if (origemTipo === "conversao") {
    [origem] = await db`
      SELECT ce.peso_total AS peso_origem,
             (ce.status_conversao = 'concluido' AND ce.cofre_registrado = true) AS status_ok,
             o.numero_ordem AS origem_referencia
      FROM alissonerp.conversoes_estoque ce
      JOIN alissonerp.ordens o ON o.id = ce.ordem_id
      WHERE ce.id = ${origemId} LIMIT 1
    `;
  } else if (origemTipo === "compra_metal") {
    [origem] = await db`
      SELECT peso_gramas AS peso_origem,
             (status = 'confirmado' AND cofre_registrado = true) AS status_ok,
             numero AS origem_referencia
      FROM alissonerp.compras_metal
      WHERE id = ${origemId} LIMIT 1
    `;
  } else if (origemTipo === "venda_ouro") {
    // Pagamento de venda em ouro: o peso em gramas fica em pagamentos_venda.OURO_PESO
    // (a coluna ouro_gramas fica nula nesses pagamentos — o front expõe ouro_peso AS
    // ouro_gramas). origem_id = pagamentos_venda.id.
    [origem] = await db`
      SELECT pv.ouro_peso AS peso_origem,
             (pv.ouro_peso IS NOT NULL AND pv.ouro_peso > 0) AS status_ok,
             ('Venda #' || COALESCE(ve.numero_venda::text, pv.venda_id::text)) AS origem_referencia
      FROM alissonerp.pagamentos_venda pv
      LEFT JOIN alissonerp.vw_vendas_erp_completa ve ON ve.id = pv.venda_id
      WHERE pv.id = ${origemId} LIMIT 1
    `;
  } else {
    // upgrade: peso = peso_gramas do item de upgrade (origem_id = item_venda_id)
    [origem] = await db`
      SELECT iuv.peso_gramas AS peso_origem,
             (iuv.cofre_registrado = true) AS status_ok,
             ('Venda #' || COALESCE(ve.numero_venda::text, ive.venda_id::text)) AS origem_referencia
      FROM alissonerp.itens_venda_upgrade iuv
      JOIN alissonerp.itens_venda_erp ive ON ive.id = iuv.item_venda_id
      LEFT JOIN alissonerp.vw_vendas_erp_completa ve ON ve.id = ive.venda_id
      WHERE iuv.item_venda_id = ${origemId} LIMIT 1
    `;
  }

  if (!origem) return null;

  const [{ gramas_baixadas }] = await db`
    SELECT COALESCE(SUM(boi.gramas), 0) AS gramas_baixadas
    FROM alissonerp.cofre_ouro_baixa_itens boi
    JOIN alissonerp.cofre_ouro_baixas b ON b.id = boi.baixa_id
    WHERE boi.origem_tipo = ${origemTipo} AND boi.origem_id = ${origemId}
      AND b.status IN ('pendente', 'em_trafego', 'concluido')
  `;

  return {
    statusOk: origem.status_ok === true,
    restante: Number(origem.peso_origem) - Number(gramas_baixadas),
    origemReferencia: String(origem.origem_referencia ?? ""),
  };
}

/** Erro de validação de negócio — lançado DENTRO da transação para abortar o
 * COMMIT e ser convertido em resposta HTTP com status apropriado (400/409). */
class ConversaoReversaValidacaoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// POST /api/conversao-reversa/aprovar
// Body: { tarefa_id: number, conversao_reversa_id?: number }
// Admin/desenvolvedor aprova a conversão reversa → metal sai do Caixa de Ouro
// (baixa concluída direto, sem transporte/protocolo) e a peça pronta entra no
// estoque comercial (Loja). NENHUM lançamento financeiro é feito aqui.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  // REGRA DE NEGÓCIO (Fase 5, Jonathan 15/07): SÓ quem está na lista configurada
  // em Configurações → Aprovadores → "Conversão Reversa" pode aprovar. Lista vazia
  // = fallback admin/desenvolvedor (pra não travar). Basta UM da lista aprovar.
  const [cfgAprov] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovadores_conversao_reversa' LIMIT 1
  `;
  const aprovadoresCfg = String(cfgAprov?.valor ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const autorizado = aprovadoresCfg.length > 0
    ? aprovadoresCfg.includes(user.id)
    : ["admin", "desenvolvedor"].includes(usuario.role);
  if (!autorizado) {
    return NextResponse.json({ error: "Você não está na lista de aprovadores da conversão reversa." }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoReversaAprovarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tarefa_id, conversao_reversa_id } = parsed.data;

  // Verificar se tarefa existe e está 'aguardando_aprovacao'
  const [tarefa] = await sql`
    SELECT id, status::text as status, ordem_id
    FROM alissonerp.tarefas WHERE id = ${tarefa_id} AND ordem_id IS NOT NULL
    LIMIT 1
  `;
  if (!tarefa) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }
  if (tarefa.status !== "aguardando_aprovacao") {
    return NextResponse.json({ error: `Tarefa já foi ${tarefa.status}` }, { status: 409 });
  }

  // Buscar conversão reversa pelo ordem_id da tarefa (ou pelo conversao_reversa_id enviado)
  const [conversao] = conversao_reversa_id
    ? await sql`
        SELECT cr.id, cr.status_conversao, cr.ordem_id, cr.origem_tipo, cr.origem_id,
               cr.produto_id, cr.quantidade, cr.peso_saida,
               o.numero_ordem, p.nome AS produto_nome
        FROM alissonerp.conversoes_reversas cr
        JOIN alissonerp.ordens o ON o.id = cr.ordem_id
        JOIN public.produtos p ON p.id_produto = cr.produto_id
        WHERE cr.id = ${conversao_reversa_id}
        LIMIT 1
      `
    : await sql`
        SELECT cr.id, cr.status_conversao, cr.ordem_id, cr.origem_tipo, cr.origem_id,
               cr.produto_id, cr.quantidade, cr.peso_saida,
               o.numero_ordem, p.nome AS produto_nome
        FROM alissonerp.conversoes_reversas cr
        JOIN alissonerp.ordens o ON o.id = cr.ordem_id
        JOIN public.produtos p ON p.id_produto = cr.produto_id
        WHERE cr.ordem_id = ${tarefa.ordem_id}
        LIMIT 1
      `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão reversa não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão reversa já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  const realizadoNome = usuario.nome ?? user.email ?? "Sistema";
  const pesoSaida = Number(conversao.peso_saida);

  try {
    // Aprovação — tudo dentro de transação (inclusive a revalidação de peso restante)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      // ── TRAVA ATÔMICA contra aprovação dupla CONCORRENTE (Fable, pente-fino 15/07) ──
      // REGRA DE NEGÓCIO: o guard "status='pendente'" lá fora não protege dois
      // aprovadores clicando ao MESMO tempo (ambos leem 'pendente' antes de
      // qualquer um commitar). Este UPDATE condicional trava a linha; a segunda
      // transação espera o commit da primeira, reavalia o WHERE, não encontra
      // linha e cai no 409. Sem isso, o peso sairia 2x do cofre (ouro=dinheiro).
      const [lock] = await tx`
        UPDATE alissonerp.conversoes_reversas
        SET updated_at = NOW()
        WHERE id = ${conversao.id} AND status_conversao = 'pendente'
        RETURNING id
      `;
      if (!lock) {
        throw new ConversaoReversaValidacaoError(
          "Conversão reversa já foi processada por outro aprovador",
          409,
        );
      }

      // ── REVALIDAR peso restante DENTRO da transação ──
      // REGRA DE NEGÓCIO: pode ter havido uma sangria do cofre (outra baixa)
      // entre a abertura desta conversão reversa e a aprovação agora — o
      // saldo precisa ser conferido de novo, na mesma transação que vai
      // criar a baixa, para não permitir saída além do que existe.
      const infoOrigem = await buscarPesoRestanteOrigem(tx, conversao.origem_tipo, conversao.origem_id);
      if (!infoOrigem || !infoOrigem.statusOk) {
        throw new ConversaoReversaValidacaoError(
          `Origem (${conversao.origem_tipo} #${conversao.origem_id}) não está mais confirmada/registrada no Caixa de Ouro`,
          409,
        );
      }
      if (infoOrigem.restante < pesoSaida) {
        throw new ConversaoReversaValidacaoError(
          `Peso insuficiente no cofre para esta origem. Restante: ${infoOrigem.restante.toFixed(3)}g, saída: ${pesoSaida.toFixed(3)}g`,
          409,
        );
      }

      // 1. Tarefa → aprovada
      await tx`
        UPDATE alissonerp.tarefas
        SET status = 'aprovada', concluida_em = NOW(), updated_at = NOW()
        WHERE id = ${tarefa_id}
      `;

      // 2. Baixa do cofre — concluída direto (destino='estoque', sem transporte/protocolo)
      const [baixa] = await tx`
        INSERT INTO alissonerp.cofre_ouro_baixas
          (gramas, destino, status, realizado_por, realizado_nome, obs, confirmado_em)
        VALUES
          (${pesoSaida}, 'estoque', 'concluido', ${user.id}::uuid, ${realizadoNome},
           ${'Conversão reversa ' + conversao.numero_ordem}, NOW())
        RETURNING id
      `;

      // 3. Item da baixa — rastreia a origem ORIGINAL (conversão/compra), não a ordem CR-xxxx
      await tx`
        INSERT INTO alissonerp.cofre_ouro_baixa_itens
          (baixa_id, origem_tipo, origem_id, referencia, gramas, valor_brl)
        VALUES
          (${baixa.id}, ${conversao.origem_tipo}, ${conversao.origem_id},
           ${infoOrigem.origemReferencia}, ${pesoSaida}, 0)
      `;

      // 4. Entrada no estoque comercial (Loja) — peça pronta
      // quantidade da conversao_reversas é NUMERIC (consistência com o restante do
      // módulo de conversões), mas movimentacoes_estoque_comercial.quantidade é
      // INTEGER — arredonda explicitamente ao inserir.
      const [mov] = await tx`
        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, observacao, created_by)
        VALUES
          (${conversao.produto_id}, 'entrada', ROUND(${conversao.quantidade}::numeric)::integer,
           'entrada_conversao_reversa', 2, 'efetivado', ${conversao.ordem_id},
           ${'Conversão reversa — entrada de peça pronta (Ordem ' + conversao.numero_ordem + ')'},
           ${user.id}::uuid)
        RETURNING id
      `;

      // 5. Concluir a conversão reversa
      await tx`
        UPDATE alissonerp.conversoes_reversas
        SET status_conversao = 'concluido',
            baixa_id = ${baixa.id},
            movimento_entrada_id = ${mov.id},
            aprovado_por = ${user.id}::uuid,
            aprovado_em = NOW(),
            updated_at = NOW()
        WHERE id = ${conversao.id}
      `;

      // 6. Concluir a ordem
      await tx`
        UPDATE alissonerp.ordens
        SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
        WHERE id = ${conversao.ordem_id}
      `;

      // 7. Histórico da tarefa — não pode falhar a operação principal
      await tx`
        INSERT INTO alissonerp.tarefas_historico
          (tarefa_id, usuario_id, acao, created_at)
        VALUES (${tarefa_id}, ${user.id}::uuid, 'aprovada', NOW())
      `.catch(() => {});
    });
  } catch (e) {
    if (e instanceof ConversaoReversaValidacaoError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    message: `Conversão reversa aprovada! ${pesoSaida.toFixed(3)}g saíram do cofre e ${conversao.produto_nome} entrou no estoque.`,
  });
}
