import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ROLES_GERENTES = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
const ROLES_CONTAR = [...ROLES_GERENTES, "estoquista_fabrica", "estoquista_loja"];

const InventarioPostSchema = z.object({
  local_estoque_id: z.coerce.number().int().positive(),
  obs: z.string().optional(),
  categoria: z.string().optional(),
}).passthrough();

// GET /api/estoque-comercial/inventario — listar inventários
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

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
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_GERENTES.includes(usuario.role)) {
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

  // Criar inventário
  const [inv] = await sql`
    INSERT INTO alissonerp.inventarios_comercial
      (local_estoque_id, obs, categoria, created_by)
    VALUES
      (${local_estoque_id}, ${obs ?? null}, ${cat}, ${user.id})
    RETURNING id, created_at
  `;

  // Snapshot: todos os produtos com saldo > 0 no local, filtrados pela categoria se informada
  await sql`
    INSERT INTO alissonerp.itens_inventario_comercial (inventario_id, produto_id, quantidade_sistema)
    SELECT
      ${inv.id},
      v.produto_id,
      v.saldo_fisico::INTEGER
    FROM alissonerp.vw_saldo_estoque_comercial_v2 v
    JOIN alissonerp.produtos_compat p ON p.id_produto = v.produto_id
    WHERE v.local_estoque_id = ${local_estoque_id}
      AND v.saldo_fisico > 0
      ${cat ? sql`AND (p.categoria = ${cat} OR p.categoria LIKE ${cat + ' -> %'})` : sql``}
  `;

  return NextResponse.json({ id: inv.id, created_at: inv.created_at }, { status: 201 });

}
