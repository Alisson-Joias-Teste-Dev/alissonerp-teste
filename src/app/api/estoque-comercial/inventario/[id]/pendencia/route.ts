import { NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { defineRoute } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { ROLES_BAIXA_MANUAL, ROLES_INVENTARIO_CONTAR, ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";

/**
 * PATCH /api/estoque-comercial/inventario/[id]/pendencia
 *
 * O QUÊ: registra/edita a DESCRIÇÃO da pendência de um item divergente do
 *   inventário e o DESFECHO dela. Movimento de estoque SÓ existe por
 *   CONCILIAÇÃO — a divergência precisa casar com um documento real que o
 *   sistema confere:
 *     venda_sem_baixa      → CONCILIAÇÃO falta ↔ venda: exige a venda; valida
 *                            de verdade (existe? tem o produto? não é
 *                            rascunho/cancelada) e gera a SAÍDA que faltou,
 *                            efetivando a reserva ativa da venda.
 *     excedente_confirmado → CONCILIAÇÃO sobra ↔ devolução/vale-troca: exige a
 *                            devolução; valida (existe? tem o produto com
 *                            retorno aprovado? a entrada ainda NÃO aconteceu?)
 *                            e gera a ENTRADA que faltou, amarrada à devolução.
 *     perda                → SÓ REGISTRO, SEM BAIXA (não há documento que
 *                            concilie — o saldo fica divergente até resolução).
 *     localizada           → a peça reapareceu: zera a falta assumindo a
 *                            quantidade do sistema como contada (decisão
 *                            gerencial explícita, auditada). Sem movimento.
 *     outro                → só registro (observação obrigatória), sem efeito.
 * POR QUÊ: regra do Jonathan — baixa/entrada manual NÃO existe para ninguém.
 *   Estoque só se move por documento conferido. A conciliação é mecanismo
 *   TEMPORÁRIO até o sistema se organizar; depois divergência não deve mais
 *   acontecer.
 * IMPACTO SE ALTERADO: reabre baixa manual "no motivo" — peça some do saldo
 *   sem documento e o estoque de milhões volta a mentir.
 *
 * Regras:
 *   - Descrever pendência: quem pode contar (estoquistas + gerência).
 *   - Responder desfecho (Sim/Não): gerência; CONCILIAÇÕES (com movimento):
 *     SOMENTE admin/desenvolvedor (ROLES_BAIXA_MANUAL) + dupla confirmação.
 *   - Quantidade do movimento vem SEMPRE do servidor (|diferenca| do item).
 *   - Movimento + resposta gravam na MESMA transação (ou tudo, ou nada).
 *   - Desfecho que gerou movimento NÃO pode ser desfeito por aqui (409) —
 *     estorno é operação de estoque, não um clique de "voltar".
 *   - Inventário cancelado: nada pode ser alterado.
 */
const DESFECHOS = ["venda_sem_baixa", "perda", "localizada", "excedente_confirmado", "outro"] as const;
// Desfechos que geram movimento — exigem conciliação, admin e dupla confirmação
const DESFECHOS_COM_MOVIMENTO = ["venda_sem_baixa", "excedente_confirmado"];

const PendenciaSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  pendencia_obs: z.string().trim().min(3, "descreva a pendência").max(2000).optional(),
  // true = resolvida | false = não resolvida | null = limpar resposta
  resolvida: z.boolean().nullable().optional(),
  resolucao_obs: z.string().trim().max(2000).optional(),
  // Desfecho (obrigatório quando resolvida = true)
  desfecho_tipo: z.enum(DESFECHOS).optional(),
  numero_venda: z.string().trim().max(30).optional(),
  numero_devolucao: z.string().trim().max(30).optional(),
  // Dupla confirmação exigida para conciliações (geram movimento)
  confirmar_baixa: z.boolean().optional(),
}).refine(
  (d) => d.pendencia_obs !== undefined || d.resolvida !== undefined,
  { message: "informe pendencia_obs e/ou resolvida" },
);

export const PATCH = defineRoute({
  requireRoles: [...ROLES_INVENTARIO_CONTAR],
  inputSchema: PendenciaSchema,
  handler: async (_req, { user, body, params }) => {
    const invId = Number(params?.id);
    if (!Number.isInteger(invId) || invId <= 0) {
      return NextResponse.json({ error: "ID de inventário inválido" }, { status: 400 });
    }

    const [inv] = await sql`
      SELECT id, status, local_estoque_id FROM alissonerp.inventarios_comercial WHERE id = ${invId}
    `;
    if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
    if (inv.status === "cancelado") {
      return NextResponse.json({ error: "Inventário cancelado — pendências bloqueadas" }, { status: 409 });
    }

    // Item precisa pertencer AO inventário da URL (nunca confiar só no item_id)
    const [item] = await sql`
      SELECT id, produto_id, quantidade_sistema, quantidade_contada, diferenca,
             pendencia_obs, pendencia_resolvida, pendencia_resolucao_obs,
             pendencia_desfecho_tipo, movimento_ajuste_id
      FROM alissonerp.itens_inventario_comercial
      WHERE id = ${body.item_id} AND inventario_id = ${invId}
    `;
    if (!item) return NextResponse.json({ error: "Item não pertence a este inventário" }, { status: 404 });

    // Pendência só faz sentido em item com problema (divergente ou sem contagem)
    const divergente = item.quantidade_contada === null || Number(item.diferenca) !== 0;
    if (body.pendencia_obs !== undefined && !divergente) {
      return NextResponse.json(
        { error: "Item sem divergência não recebe pendência" }, { status: 422 },
      );
    }

    // BLINDAGEM: pendência já respondida pela gerência não pode ter a
    // descrição reescrita por estoquista — o "resolvida=Sim" passaria a
    // referenciar um texto diferente do que foi aprovado.
    if (
      body.pendencia_obs !== undefined &&
      item.pendencia_resolvida !== null &&
      !hasRole(user.role, ROLES_INVENTARIO_GERENTES)
    ) {
      return NextResponse.json(
        { error: "Pendência já respondida — somente gerência pode editar a descrição" },
        { status: 403 },
      );
    }

    // Responder "resolvida?" é decisão gerencial — bloqueia estoquista
    if (body.resolvida !== undefined && !hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
      return NextResponse.json(
        { error: "Somente gerência pode marcar pendência como resolvida/não resolvida" },
        { status: 403 },
      );
    }
    // Não existe desfecho sem pendência descrita
    if (body.resolvida !== undefined && !item.pendencia_obs && body.pendencia_obs === undefined) {
      return NextResponse.json(
        { error: "Descreva a pendência antes de registrar a resolução" }, { status: 422 },
      );
    }

    // BLINDAGEM: desfecho que já gerou movimentação não se desfaz num clique.
    // Estorno de estoque é movimento REVERSO (nunca deletar) — fora deste PATCH.
    // ('perda' fica na lista por legado: até v2.81.2 ela gerava movimento.)
    if (
      body.resolvida !== undefined && body.resolvida !== true &&
      item.pendencia_resolvida === true && item.pendencia_desfecho_tipo &&
      item.movimento_ajuste_id !== null &&
      ["venda_sem_baixa", "perda", "excedente_confirmado"].includes(item.pendencia_desfecho_tipo)
    ) {
      return NextResponse.json(
        { error: "Este desfecho gerou movimentação de estoque — para reverter, faça o estorno do movimento (não é um simples desfazer)" },
        { status: 409 },
      );
    }

    // ---------- Validações do desfecho (resolvida = true) ----------
    const diff = item.quantidade_contada === null ? null : Number(item.diferenca);
    let vendaVinculada: { id: number; numero_venda: string } | null = null;
    let devolucaoVinculada: { id: number; numero: string; venda_id: number | null } | null = null;

    if (body.resolvida === true) {
      if (!body.desfecho_tipo) {
        return NextResponse.json(
          { error: "Fechar como resolvida exige o desfecho: o que aconteceu com a peça?" },
          { status: 422 },
        );
      }

      // BLINDAGEM (v2.81.3): CONCILIAÇÃO (movimento de estoque) é exclusiva
      // de admin/desenvolvedor e exige dupla confirmação. Mecanismo
      // temporário até o sistema se organizar.
      if (DESFECHOS_COM_MOVIMENTO.includes(body.desfecho_tipo)) {
        if (!hasRole(user.role, ROLES_BAIXA_MANUAL)) {
          return NextResponse.json(
            { error: "Conciliação com movimento de estoque é exclusiva do administrador" },
            { status: 403 },
          );
        }
        if (body.confirmar_baixa !== true) {
          return NextResponse.json(
            { error: "Conciliação gera movimento de estoque — confirme a operação (confirmar_baixa)" },
            { status: 422 },
          );
        }
      }

      // Desfechos de falta exigem item CONTADO e FALTANDO (qtd vem do servidor)
      if (["venda_sem_baixa", "perda", "localizada"].includes(body.desfecho_tipo)) {
        if (diff === null || diff >= 0) {
          return NextResponse.json(
            { error: "Este desfecho é para item contado e FALTANDO — confira a contagem primeiro" },
            { status: 422 },
          );
        }
      }
      if (body.desfecho_tipo === "excedente_confirmado" && (diff === null || diff <= 0)) {
        return NextResponse.json(
          { error: "Conciliação com devolução é para item contado com SOBRA" }, { status: 422 },
        );
      }

      // Motivo do desfecho é obrigatório onde não há documento que explique
      if (
        ["perda", "localizada", "outro"].includes(body.desfecho_tipo) &&
        (body.resolucao_obs ?? "").trim().length < 3
      ) {
        return NextResponse.json(
          { error: "Informe o motivo/observação do desfecho" }, { status: 422 },
        );
      }

      if (body.desfecho_tipo === "venda_sem_baixa") {
        if (!body.numero_venda) {
          return NextResponse.json(
            { error: "Conciliação exige o número da venda que explica a falta" }, { status: 422 },
          );
        }
        // Venda validada DE VERDADE: existe, não é rascunho/cancelada e tem o produto
        const vendas = await sql`
          SELECT id, numero_venda, status AS situacao FROM alissonerp.vendas_erp
          WHERE numero_venda = ${body.numero_venda}
          LIMIT 2
        `;
        if (vendas.length === 0) {
          return NextResponse.json({ error: `Venda ${body.numero_venda} não encontrada` }, { status: 422 });
        }
        if (vendas.length > 1) {
          return NextResponse.json({ error: `Mais de uma venda com número ${body.numero_venda} — verifique` }, { status: 422 });
        }
        const venda = vendas[0];
        if (["rascunho", "cancelado", "cancelada"].includes(String(venda.situacao))) {
          return NextResponse.json(
            { error: `Venda ${venda.numero_venda} está '${venda.situacao}' — não explica baixa de estoque` },
            { status: 422 },
          );
        }
        const [temProduto] = await sql`
          SELECT 1 AS ok FROM alissonerp.itens_venda_erp
          WHERE venda_id = ${venda.id} AND produto_id = ${item.produto_id}
          LIMIT 1
        `;
        if (!temProduto) {
          return NextResponse.json(
            { error: `A venda ${venda.numero_venda} não contém este produto — conciliação bloqueada` },
            { status: 422 },
          );
        }
        vendaVinculada = { id: venda.id, numero_venda: venda.numero_venda };

        // Saída nunca pode negativar o saldo físico
        const qtd = -Number(diff);
        const [saldo] = await sql`
          SELECT saldo_fisico FROM alissonerp.vw_saldo_estoque_comercial_v2
          WHERE produto_id = ${item.produto_id} AND local_estoque_id = ${inv.local_estoque_id}
        `;
        const fisico = Number(saldo?.saldo_fisico ?? 0);
        if (fisico < qtd) {
          return NextResponse.json(
            { error: `Saldo físico insuficiente (${fisico}) para conciliar ${qtd} un.` }, { status: 422 },
          );
        }
      }

      if (body.desfecho_tipo === "excedente_confirmado") {
        if (!body.numero_devolucao) {
          return NextResponse.json(
            { error: "Conciliação exige o número da devolução/vale-troca que explica a sobra" },
            { status: 422 },
          );
        }
        // Devolução validada DE VERDADE: existe, aprovada/concluída, tem o
        // produto com retorno aprovado e a entrada ainda NÃO aconteceu
        const devolucoes = await sql`
          SELECT id, numero, status, venda_id FROM alissonerp.devolucoes_venda
          WHERE numero = ${body.numero_devolucao}
          LIMIT 2
        `;
        if (devolucoes.length === 0) {
          return NextResponse.json({ error: `Devolução ${body.numero_devolucao} não encontrada` }, { status: 422 });
        }
        if (devolucoes.length > 1) {
          return NextResponse.json({ error: `Mais de uma devolução com número ${body.numero_devolucao} — verifique` }, { status: 422 });
        }
        const dev = devolucoes[0];
        if (!["aprovado", "concluido"].includes(String(dev.status))) {
          return NextResponse.json(
            { error: `Devolução ${dev.numero} está '${dev.status}' — não explica entrada de estoque` },
            { status: 422 },
          );
        }
        const [retorno] = await sql`
          SELECT COALESCE(SUM(di.quantidade), 0)::int AS qtd_aprovada
          FROM alissonerp.devolucoes_itens di
          WHERE di.devolucao_id = ${dev.id}
            AND di.produto_id = ${item.produto_id}
            AND di.condicao = 'aprovado_retorno'
        `;
        const [entradas] = await sql`
          SELECT COALESCE(SUM(m.quantidade), 0)::int AS qtd_entrada
          FROM alissonerp.movimentacoes_estoque_comercial m
          WHERE m.devolucao_id = ${dev.id}
            AND m.produto_id = ${item.produto_id}
            AND m.tipo = 'entrada'
            AND m.status = 'efetivado'
        `;
        const pendenteEntrada = Number(retorno.qtd_aprovada) - Number(entradas.qtd_entrada);
        const sobra = Number(diff);
        if (pendenteEntrada < sobra) {
          return NextResponse.json(
            { error: `Devolução ${dev.numero} não cobre a sobra: retorno aprovado sem entrada = ${Math.max(pendenteEntrada, 0)} un., sobra = ${sobra} un. — conciliação bloqueada` },
            { status: 422 },
          );
        }
        devolucaoVinculada = { id: dev.id, numero: dev.numero, venda_id: dev.venda_id ?? null };
      }
    }

    const antes = {
      pendencia_obs: item.pendencia_obs,
      pendencia_resolvida: item.pendencia_resolvida,
      pendencia_resolucao_obs: item.pendencia_resolucao_obs,
      pendencia_desfecho_tipo: item.pendencia_desfecho_tipo,
    };

    const [atualizado] = await sql.begin(async (tx: any) => {
      if (body.pendencia_obs !== undefined) {
        await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET pendencia_obs            = ${body.pendencia_obs},
              pendencia_registrada_por = ${user.id}::uuid,
              pendencia_registrada_em  = now()
          WHERE id = ${item.id}
        `;
      }

      let movimentoId: number | null = null;

      if (body.resolvida === true && body.desfecho_tipo) {
        // ---------- Efeito no estoque: SÓ conciliação ----------
        if (body.desfecho_tipo === "venda_sem_baixa" && vendaVinculada) {
          const qtd = -Number(diff);
          const [mov] = await tx`
            INSERT INTO alissonerp.movimentacoes_estoque_comercial
              (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
               referencia_id, referencia_tipo, observacao, created_by)
            VALUES
              (${item.produto_id}, 'saida', ${qtd}, 'pendencia_venda_sem_baixa',
               ${inv.local_estoque_id}, 'efetivado',
               ${vendaVinculada.id}, 'vendas_erp',
               ${`Conciliação pendência inventário #${invId}: venda #${vendaVinculada.numero_venda} sem baixa`},
               ${user.id})
            RETURNING id
          `;
          movimentoId = mov.id;
          // Efetiva a reserva ativa da venda (senão o "disponível" cai em dobro:
          // a saída baixa o físico E a reserva ativa seguiria descontando)
          await tx`
            UPDATE alissonerp.reservas_estoque_comercial
            SET status = 'efetivado', efetivado_em = now(), movimento_id = ${mov.id}
            WHERE venda_id = ${vendaVinculada.id}
              AND produto_id = ${item.produto_id}
              AND local_estoque_id = ${inv.local_estoque_id}
              AND status = 'ativo'
          `;
        } else if (body.desfecho_tipo === "excedente_confirmado" && devolucaoVinculada) {
          const qtd = Number(diff);
          const [mov] = await tx`
            INSERT INTO alissonerp.movimentacoes_estoque_comercial
              (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
               referencia_id, referencia_tipo, devolucao_id, observacao, created_by)
            VALUES
              (${item.produto_id}, 'entrada', ${qtd}, 'pendencia_devolucao_sem_entrada',
               ${inv.local_estoque_id}, 'efetivado',
               ${devolucaoVinculada.venda_id}, 'vendas_erp', ${devolucaoVinculada.id},
               ${`Conciliação pendência inventário #${invId}: devolução ${devolucaoVinculada.numero} sem entrada`},
               ${user.id})
            RETURNING id
          `;
          movimentoId = mov.id;
        } else if (body.desfecho_tipo === "localizada") {
          // Peça reapareceu: a falta era falsa. Decisão GERENCIAL explícita —
          // assume a quantidade do sistema como contada (fica auditado abaixo).
          await tx`
            UPDATE alissonerp.itens_inventario_comercial
            SET quantidade_contada = quantidade_sistema,
                contado_por = ${user.id}::uuid,
                contado_em  = now()
            WHERE id = ${item.id}
          `;
        }
        // 'perda' e 'outro' = SÓ REGISTRO, sem movimento (não há documento
        // que concilie — baixa manual não existe para ninguém, v2.81.3)

        await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET pendencia_resolvida        = true,
              pendencia_resolucao_obs    = ${body.resolucao_obs ?? null},
              pendencia_resolvida_por    = ${user.id}::uuid,
              pendencia_resolvida_em     = now(),
              pendencia_desfecho_tipo    = ${body.desfecho_tipo},
              pendencia_desfecho_venda_id = ${vendaVinculada?.id ?? devolucaoVinculada?.venda_id ?? null},
              movimento_ajuste_id        = COALESCE(${movimentoId}, movimento_ajuste_id)
          WHERE id = ${item.id}
        `;
      } else if (body.resolvida !== undefined && body.resolvida !== true) {
        // resolvida = false (segue em aberto) ou null (limpa a resposta)
        await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET pendencia_resolvida        = ${body.resolvida},
              pendencia_resolucao_obs    = ${body.resolvida === null ? null : (body.resolucao_obs ?? null)},
              pendencia_resolvida_por    = ${body.resolvida === null ? null : user.id}::uuid,
              pendencia_resolvida_em     = CASE WHEN ${body.resolvida === null} THEN NULL ELSE now() END,
              pendencia_desfecho_tipo    = ${body.resolvida === null ? null : body.desfecho_tipo ?? null},
              pendencia_desfecho_venda_id = NULL
          WHERE id = ${item.id}
        `;
      }

      const rows = await tx`
        SELECT ii.id, ii.produto_id, ii.quantidade_sistema, ii.quantidade_contada, ii.diferenca,
               ii.pendencia_obs, ii.pendencia_registrada_em,
               ii.pendencia_resolvida, ii.pendencia_resolucao_obs, ii.pendencia_resolvida_em,
               ii.pendencia_desfecho_tipo, ii.pendencia_desfecho_venda_id,
               vd.numero_venda AS pendencia_desfecho_numero_venda,
               ii.movimento_ajuste_id,
               ur.email AS pendencia_registrada_por_email,
               uz.email AS pendencia_resolvida_por_email
        FROM alissonerp.itens_inventario_comercial ii
        LEFT JOIN auth.users ur ON ur.id = ii.pendencia_registrada_por
        LEFT JOIN auth.users uz ON uz.id = ii.pendencia_resolvida_por
        LEFT JOIN alissonerp.vendas_erp vd ON vd.id = ii.pendencia_desfecho_venda_id
        WHERE ii.id = ${item.id}
      `;

      await logAudit(tx, {
        tabela: "itens_inventario_comercial",
        operacao: "UPDATE",
        registro_id: item.id,
        usuario_id: user.id,
        dados_antes: antes,
        dados_depois: {
          contexto: "pendencia_inventario",
          inventario_id: invId,
          pendencia_obs: rows[0].pendencia_obs,
          pendencia_resolvida: rows[0].pendencia_resolvida,
          pendencia_resolucao_obs: rows[0].pendencia_resolucao_obs,
          pendencia_desfecho_tipo: rows[0].pendencia_desfecho_tipo,
          pendencia_desfecho_venda_id: rows[0].pendencia_desfecho_venda_id,
          devolucao_conciliada_id: devolucaoVinculada?.id ?? null,
          movimento_gerado_id: rows[0].movimento_ajuste_id,
        },
      });

      return rows;
    });

    return NextResponse.json({ item: atualizado });
  },
});
