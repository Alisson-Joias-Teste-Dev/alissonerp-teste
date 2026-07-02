import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_CONTAR, hasRole } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/estoque-comercial/inventario/[id]/contar
 *
 * O QUÊ: registra a contagem física e/ou o flag "conferido" de itens.
 * POR QUÊ: é o coração do inventário — o número contado aqui é o que
 *   denuncia falta/sobra num estoque de milhões.
 * IMPACTO SE ALTERADO: contagens erradas mascaram furto/perda.
 *
 * Regras de blindagem:
 *   - "diferenca" é coluna GERADA pelo banco — NUNCA escrever nela
 *     (escrever causava erro 500 silencioso; migration 336 garante isso).
 *   - Marcar "conferido" NÃO inventa contagem: quantidade_contada é
 *     opcional e só é gravada quando enviada explicitamente.
 *   - Tudo roda numa transação única: ou grava tudo, ou nada.
 */
const ContagemItemSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  // Opcional: permite marcar conferido sem alterar a contagem
  quantidade_contada: z.coerce.number().int().min(0, "quantidade não pode ser negativa").optional(),
  conferido: z.boolean().optional(),
}).refine(
  (c) => c.quantidade_contada !== undefined || c.conferido !== undefined,
  { message: "informe quantidade_contada e/ou conferido" },
);

const ContarPostSchema = z.object({
  contagens: z.array(ContagemItemSchema).min(1, "ao menos uma contagem").max(5000),
});

export async function POST(req: NextRequest, { params }: Params) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!hasRole(user.role, ROLES_INVENTARIO_CONTAR)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === "concluido" || inv.status === "cancelado") {
    return NextResponse.json({ error: `Inventário já está ${inv.status}` }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ContarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  let atualizados = 0;
  let recusados = 0;
  await sql.begin(async (tx: any) => {
    // Primeira contagem move o inventário para "em_contagem"
    if (inv.status === "aberto") {
      await tx`
        UPDATE alissonerp.inventarios_comercial SET status = 'em_contagem' WHERE id = ${invId}
      `;
    }

    for (const c of body.contagens) {
      // Contagem informada: grava quantidade + autor. "diferenca" o banco calcula.
      if (c.quantidade_contada !== undefined) {
        const [item] = await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET quantidade_contada = ${c.quantidade_contada},
              contado_por        = ${user.id}::uuid,
              contado_em         = now()
              ${c.conferido !== undefined
                ? tx`, conferido = ${c.conferido}, conferido_em = CASE WHEN ${c.conferido} THEN now() ELSE NULL END`
                : tx``}
          WHERE inventario_id = ${invId} AND produto_id = ${c.produto_id}
          RETURNING id
        `;
        if (item) atualizados++;
      } else if (c.conferido !== undefined) {
        // Só o flag conferido — NÃO toca na quantidade contada.
        // BLINDAGEM: item SEM contagem não pode ser marcado conferido
        // (a regra do front revalidada no servidor) — desmarcar pode.
        const [item] = await tx`
          UPDATE alissonerp.itens_inventario_comercial
          SET conferido    = ${c.conferido},
              conferido_em = CASE WHEN ${c.conferido} THEN now() ELSE NULL END
          WHERE inventario_id = ${invId} AND produto_id = ${c.produto_id}
            AND (quantidade_contada IS NOT NULL OR ${c.conferido} = false)
          RETURNING id
        `;
        if (item) atualizados++; else recusados++;
      }
    }

    // registro_id = inventário (a operação é sobre o inventário; as
    // contagens item a item vão completas em dados_depois)
    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "UPDATE",
      registro_id: invId,
      usuario_id: user.id,
      dados_depois: {
        contexto: "contagem_inventario",
        inventario_id: invId,
        itens_atualizados: atualizados,
        itens_recusados: recusados,
        contagens: body.contagens,
      },
    });
  });

  return NextResponse.json({ atualizados, recusados });
}
