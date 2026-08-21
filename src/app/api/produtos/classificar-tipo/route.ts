/**
 * GET  /api/produtos/classificar-tipo
 *      Preview das classificações (joia/insumo/null) sem aplicar nada.
 *
 * POST /api/produtos/classificar-tipo
 *      body: { apply: true }
 *      Cria a tabela (se não existir) e aplica a classificação automática.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const ClassificarTipoSchema = z.object({
  apply: z.literal(true),
}).passthrough();

async function auth(req: NextRequest | undefined, acao: "ler" | "escrever" = "ler") {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes };
  if (!(await temAcessoModulo(user.role, "produtos", acao))) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { user };
}

function regraInsumo() {
  return sql`(
    p.sku ILIKE 'IS%'
    OR p.categoria ILIKE 'Insumos%'
    OR p.categoria ILIKE 'Matérias Primas%'
    OR p.categoria ILIKE 'Ferramentas%'
    OR p.categoria ILIKE 'Pedras%'
  )`;
}

function regraJoia() {
  return sql`(
    p.categoria ILIKE 'Anel%'
    OR p.categoria ILIKE 'Pulseira%'
    OR p.categoria ILIKE 'Pingente%'
    OR p.categoria ILIKE 'Corrente%'
    OR p.categoria ILIKE 'Brinco%'
    OR p.categoria ILIKE 'Aliança%'
    OR p.categoria ILIKE 'Alianças%'
    OR p.categoria ILIKE 'Bracelete%'
    OR p.categoria ILIKE 'Escapulário%'
    OR p.categoria ILIKE 'Piercing%'
    OR p.categoria ILIKE 'Tornozeleira%'
    OR p.categoria ILIKE 'Fecho%'
    OR p.categoria ILIKE 'Rodinada%'
    OR p.categoria ILIKE 'Promoção%'
    OR p.categoria ILIKE 'Mostruário%'
  )`;
}

export async function GET(req: NextRequest) {
  const a = await auth(req, "ler");
  if ("error" in a) return a.error;

  const [contagem] = await sql<{ insumo: string; joia: string; semclass: string; total: string }[]>`
    SELECT
      COUNT(*) FILTER (WHERE ${regraInsumo()})::text AS insumo,
      COUNT(*) FILTER (WHERE ${regraJoia()} AND NOT ${regraInsumo()})::text AS joia,
      COUNT(*) FILTER (WHERE NOT ${regraInsumo()} AND NOT ${regraJoia()})::text AS semclass,
      COUNT(*)::text AS total
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = p.id_produto
  `;

  // Tabela existe?
  const [tbl] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='alissonerp' AND table_name='produto_tipo_item'
    ) AS exists
  `;

  let distribAtual: { tipo_item: string | null; total: number }[] = [];
  if (tbl?.exists) {
    distribAtual = await sql<{ tipo_item: string | null; total: number }[]>`
      SELECT t.tipo_item, COUNT(*)::int AS total
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_tipo_item t ON t.produto_id = p.id_produto
      GROUP BY 1
      ORDER BY 2 DESC
    `;
  }

  return NextResponse.json({ tabelaExiste: tbl?.exists === true, preview: contagem, distribAtual });
}

export async function POST(req: NextRequest) {
  const a = await auth(req, "escrever");
  if ("error" in a) return a.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = ClassificarTipoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Envie { apply: true } para confirmar" }, { status: 400 });
  }

  try {
    // 1) CREATE TABLE (idempotente)
    await sql`
      CREATE TABLE IF NOT EXISTS alissonerp.produto_tipo_item (
        produto_id BIGINT PRIMARY KEY,
        tipo_item  TEXT   NOT NULL CHECK (tipo_item IN ('joia', 'insumo')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_produto_tipo_item_tipo ON alissonerp.produto_tipo_item (tipo_item)`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_tipo_item TO authenticated`;

    // 2) INSERT INSUMO (sobrescreve regra JOIA quando ambas batem — insumo precede)
    const insertedIns = await sql<{ produto_id: number }[]>`
      INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
      SELECT p.id_produto, 'insumo'
      FROM public.produtos p
      WHERE ${regraInsumo()}
      ON CONFLICT (produto_id) DO NOTHING
      RETURNING produto_id
    `;

    // 3) INSERT JOIA (só onde ainda não foi classificado)
    const insertedJoia = await sql<{ produto_id: number }[]>`
      INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
      SELECT p.id_produto, 'joia'
      FROM public.produtos p
      WHERE ${regraJoia()}
      ON CONFLICT (produto_id) DO NOTHING
      RETURNING produto_id
    `;

    // 4) Distribuição final
    const distrib = await sql<{ tipo_item: string | null; total: number }[]>`
      SELECT t.tipo_item, COUNT(*)::int AS total
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_tipo_item t ON t.produto_id = p.id_produto
      WHERE p.situacao = 'A'
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    return NextResponse.json({
      inseridos: { insumo: insertedIns.length, joia: insertedJoia.length },
      distribAtivos: distrib,
    });
  } catch (err) {
    return internalError("[POST /api/produtos/classificar-tipo]", err);
  }
}
