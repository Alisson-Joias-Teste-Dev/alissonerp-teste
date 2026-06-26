import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";
import { internalError } from "@/lib/api-error";

/**
 * REGRA DE NEGÓCIO: Produto Upgrade
 * O QUE: Configuração de upgrade por produto — valor por grama de mão de obra
 * e percentual de quebra no processo.
 * POR QUE: Cada SKU de upgrade pode ter seu próprio valor/grama e quebra.
 * Admin/gerente_loja edita; todos autenticados consultam.
 * IMPACTO SE REMOVIDO: Sem config, o sistema não sabe calcular o valor
 * do upgrade e o fluxo de venda falha ao detectar um item upgrade.
 */

const ROLES_EDITAR = ["admin", "desenvolvedor", "gerente_loja"];

const UpgradeConfigPutSchema = z.object({
  produto_id: z.coerce.number().int().positive("produto_id obrigatório"),
  valor_por_grama: z.coerce.number().positive("valor_por_grama deve ser > 0"),
  quebra_percentual: z.coerce.number().min(0).max(100).optional(),
  ativo: z.boolean().optional(),
});

// GET /api/produtos/upgrade-config?produto_id=X
// Sem produto_id: retorna todas as configs ativas.
// Com produto_id: retorna config daquele produto (ou 404).
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { searchParams } = new URL(req.url);
  const produtoIdRaw = searchParams.get("produto_id");

  try {
    if (produtoIdRaw) {
      const produtoId = Number(produtoIdRaw);
      if (isNaN(produtoId) || produtoId <= 0) {
        return NextResponse.json({ error: "produto_id inválido" }, { status: 400 });
      }

      const [row] = await sql`
        SELECT produto_id, valor_por_grama, quebra_percentual, ativo,
               created_at, updated_at
        FROM alissonerp.produto_upgrade_config
        WHERE produto_id = ${produtoId}
      `;

      if (!row) {
        return NextResponse.json(null);
      }

      return NextResponse.json({
        ...row,
        valor_por_grama: Number(row.valor_por_grama),
        quebra_percentual: Number(row.quebra_percentual),
      });
    }

    const rows = await sql`
      SELECT puc.produto_id, puc.valor_por_grama, puc.quebra_percentual,
             puc.ativo, puc.created_at, puc.updated_at,
             p.nome AS produto_nome, p.sku AS produto_sku
      FROM alissonerp.produto_upgrade_config puc
      JOIN public.produtos p ON p.id_produto = puc.produto_id
      WHERE puc.ativo = true
      ORDER BY p.nome
    `;

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        valor_por_grama: Number(r.valor_por_grama),
        quebra_percentual: Number(r.quebra_percentual),
      }))
    );
  } catch (err) {
    return internalError("[GET /api/produtos/upgrade-config]", err, "Erro ao buscar configurações de upgrade");
  }
}

// PUT /api/produtos/upgrade-config
// Cria ou atualiza config de upgrade para um produto.
// Apenas admin/gerente_loja.
export async function PUT(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!isFullAccess(user.role) && !ROLES_EDITAR.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão para editar configuração de upgrade" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const parsed = UpgradeConfigPutSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { produto_id, valor_por_grama, quebra_percentual, ativo } = parsed.data;

  try {
    const [existing] = await sql`
      SELECT produto_id FROM alissonerp.produto_upgrade_config
      WHERE produto_id = ${produto_id}
    `;

    if (existing) {
      await sql`
        UPDATE alissonerp.produto_upgrade_config
        SET valor_por_grama   = ${valor_por_grama},
            quebra_percentual = ${quebra_percentual ?? 10.00},
            ativo             = ${ativo ?? true},
            updated_at        = now()
        WHERE produto_id = ${produto_id}
      `;
    } else {
      await sql`
        INSERT INTO alissonerp.produto_upgrade_config
          (produto_id, valor_por_grama, quebra_percentual, ativo)
        VALUES
          (${produto_id}, ${valor_por_grama}, ${quebra_percentual ?? 10.00}, ${ativo ?? true})
      `;
    }

    return NextResponse.json({ ok: true, produto_id });
  } catch (err) {
    return internalError("[PUT /api/produtos/upgrade-config]", err, "Erro ao salvar configuração de upgrade");
  }
}
