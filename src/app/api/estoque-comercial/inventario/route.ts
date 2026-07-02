import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_GERENTES, ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const InventarioPostSchema = z.object({
  local_estoque_id: z.coerce.number().int().positive(),
  obs: z.string().optional(),
  categoria: z.string().optional(),
}).passthrough();

// GET /api/estoque-comercial/inventario — listar inventários
// BLINDAGEM: restrito às roles de estoque/gerência — quantidades do
// estoque comercial não são dado público interno.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rows = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.obs, i.data_abertura, i.data_conclusao,
      i.created_at, i.categoria,
      uc.email AS criado_por_email,
      uf.email AS concluido_por_email,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id) AS total_itens,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id AND quantidade_contada IS NOT NULL) AS itens_contados,
      (SELECT COUNT(*) FROM alissonerp.itens_inventario_comercial WHERE inventario_id = i.id AND diferenca != 0) AS itens_divergentes
    FROM alissonerp.inventarios_comercial i
    LEFT JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = i.created_by
    LEFT JOIN auth.users uf ON uf.id = i.concluido_por
    ORDER BY
      CASE i.status WHEN 'aberto' THEN 0 WHEN 'em_contagem' THEN 1 ELSE 2 END,
      i.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json(rows);
}

// POST /api/estoque-comercial/inventario — abrir novo inventário
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InventarioPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { local_estoque_id, obs, categoria } = parsed.data;
  const cat = categoria?.trim() || null;

  // Verificar se já existe inventário aberto para esse local
  const [existente] = await sql`
    SELECT id FROM alissonerp.inventarios_comercial
    WHERE local_estoque_id = ${local_estoque_id} AND status IN ('aberto', 'em_contagem')
  `;
  if (existente) {
    return NextResponse.json(
      { error: `Já existe inventário aberto para esse local (ID: ${existente.id})` },
      { status: 409 }
    );
  }

  // Criar inventário + snapshot numa transação única (ou tudo, ou nada)
  const inv = await sql.begin(async (tx: any) => {
    const [novo] = await tx`
      INSERT INTO alissonerp.inventarios_comercial
        (local_estoque_id, obs, categoria, created_by)
      VALUES
        (${local_estoque_id}, ${obs ?? null}, ${cat}, ${user.id})
      RETURNING id, created_at
    `;

    /**
     * Snapshot: todos os produtos com saldo > 0 no local, filtrados pela categoria se informada.
     *
     * O QUÊ: INVENTÁRIO É DE PEÇA PRONTA — pedra solta e personalizada sob
     *   encomenda ficam FORA da foto inicial.
     * POR QUÊ: pedra é matéria-prima contada em quilates (não em unidades de
     *   prateleira) e personalizada (SKU PZ) só existe depois de encomendada —
     *   ambas inflavam o "Faltando" com itens que ninguém vai contar.
     * CRITÉRIO pedra = espelho SQL de ehPedraSolta() (src/lib/compras-pedras.ts):
     *   categoria 'Pedras%', OU produto_pedra_extras, OU nome COMEÇA com nome de
     *   pedra. NUNCA usar tem_pedra_preciosa (joia COM pedra) nem includes() no nome.
     * IMPACTO SE ALTERADO: pedras/personalizadas voltam a poluir o inventário
     *   e a contagem de faltas fica mentirosa.
     */
    await tx`
      INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
      SELECT
        ${novo.id},
        v.produto_id,
        v.saldo_fisico::INTEGER
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      JOIN alissonerp.produtos_compat p ON p.id_produto = v.produto_id
      WHERE v.local_estoque_id = ${local_estoque_id}
        AND v.saldo_fisico > 0
        ${cat ? tx`AND (p.categoria = ${cat} OR p.categoria LIKE ${cat + ' -> %'})` : tx``}
        AND NOT (
          p.categoria ILIKE 'Pedras%'
          OR EXISTS (SELECT 1 FROM alissonerp.produto_pedra_extras ppe WHERE ppe.produto_id = v.produto_id)
          OR p.nome ILIKE 'diamante%' OR p.nome ILIKE 'zirc%' OR p.nome ILIKE 'rubi%'
          OR p.nome ILIKE 'esmeralda%' OR p.nome ILIKE 'safira%' OR p.nome ILIKE 'pedra%'
          OR p.nome ILIKE 'moissanita%' OR p.nome ILIKE 'mossainite%'
          -- LIXO DE TESTE, OURO-INSUMO, PREFIXOS IS/PD/AS/PZ e SERVIÇOS
          -- (v2.81.5) — espelho de condPecaPronta()
          OR p.sku ILIKE 'teste%' OR p.nome ILIKE 'teste%'
          OR p.nome ILIKE 'ouro%'
          OR p.sku ILIKE 'IS%' OR p.sku ILIKE 'PD%'
          OR p.sku ILIKE 'AS%' OR p.sku ILIKE 'PZ%'
          OR COALESCE(p.categoria, '') ILIKE 'Servi%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM alissonerp.produto_personalizacao pp
          WHERE pp.produto_id = v.produto_id AND pp.ativo = true
        )
    `;

    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "INSERT",
      registro_id: novo.id,
      usuario_id: user.id,
      dados_depois: { local_estoque_id, categoria: cat, obs: obs ?? null },
    });

    return novo;
  });

  return NextResponse.json({ id: inv.id, created_at: inv.created_at }, { status: 201 });

}
