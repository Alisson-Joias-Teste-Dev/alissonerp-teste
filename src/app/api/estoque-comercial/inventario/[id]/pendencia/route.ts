import { NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { defineRoute } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_CONTAR, ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";

/**
 * PATCH /api/estoque-comercial/inventario/[id]/pendencia
 *
 * O QUÊ: registra/edita a DESCRIÇÃO da pendência de um item divergente do
 *   inventário e o DESFECHO dela ("foi resolvida?" Sim/Não).
 * POR QUÊ: estoque de milhões — toda falta/sobra precisa de explicação
 *   escrita e de um responsável pela resposta, com trilha de auditoria.
 * IMPACTO SE ALTERADO: a tela do inventário perde o fluxo de pendências;
 *   divergências voltam a ficar sem explicação nem acompanhamento.
 *
 * Regras:
 *   - Descrever pendência: quem pode contar (estoquistas + gerência).
 *   - Responder "resolvida Sim/Não": SOMENTE gerência (decisão gerencial).
 *   - Inventário cancelado: nada pode ser alterado.
 *   - Pendência só existe em item divergente (diferenca != 0) ou não contado.
 *   - Resolução continua permitida após o inventário concluir (a pendência
 *     costuma ser tratada depois do fechamento da contagem).
 */
const PendenciaSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  pendencia_obs: z.string().trim().min(3, "descreva a pendência").max(2000).optional(),
  // true = resolvida | false = não resolvida | null = limpar resposta
  resolvida: z.boolean().nullable().optional(),
  resolucao_obs: z.string().trim().max(2000).optional(),
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
      SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
    `;
    if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
    if (inv.status === "cancelado") {
      return NextResponse.json({ error: "Inventário cancelado — pendências bloqueadas" }, { status: 409 });
    }

    // Item precisa pertencer AO inventário da URL (nunca confiar só no item_id)
    const [item] = await sql`
      SELECT id, produto_id, quantidade_sistema, quantidade_contada, diferenca,
             pendencia_obs, pendencia_resolvida, pendencia_resolucao_obs
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

    const antes = {
      pendencia_obs: item.pendencia_obs,
      pendencia_resolvida: item.pendencia_resolvida,
      pendencia_resolucao_obs: item.pendencia_resolucao_obs,
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
      if (body.resolvida !== undefined) {
        // resolvida = null limpa a resposta (desfaz um clique errado)
        await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET pendencia_resolvida     = ${body.resolvida},
              pendencia_resolucao_obs = ${body.resolvida === null ? null : (body.resolucao_obs ?? null)},
              pendencia_resolvida_por = ${body.resolvida === null ? null : user.id}::uuid,
              pendencia_resolvida_em  = CASE WHEN ${body.resolvida === null} THEN NULL ELSE now() END
          WHERE id = ${item.id}
        `;
      }

      const rows = await tx`
        SELECT ii.id, ii.produto_id, ii.pendencia_obs, ii.pendencia_registrada_em,
               ii.pendencia_resolvida, ii.pendencia_resolucao_obs, ii.pendencia_resolvida_em,
               ur.email AS pendencia_registrada_por_email,
               uz.email AS pendencia_resolvida_por_email
        FROM alissonerp.itens_inventario_comercial ii
        LEFT JOIN auth.users ur ON ur.id = ii.pendencia_registrada_por
        LEFT JOIN auth.users uz ON uz.id = ii.pendencia_resolvida_por
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
        },
      });

      return rows;
    });

    return NextResponse.json({ item: atualizado });
  },
});
