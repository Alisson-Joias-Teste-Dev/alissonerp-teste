import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

const ROLES_CONTAR = [
  "desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "estoquista_loja"
];

const ItensPatchSchema = z.object({
  itens: z.array(z.object({
    id: z.coerce.number().int().positive(),
    quantidade_contada: z.coerce.number().int().min(0).nullable().optional(),
    localizacao_fisica: z.string().max(100).nullable().optional(),
    consultora: z.string().max(200).nullable().optional(),
    status: z.enum(["ok", "pendente", "resolvido", "aguardando"]).optional(),
    observacao: z.string().nullable().optional(),
    venda_numero: z.string().max(50).nullable().optional(),
  })).min(1).max(100),
}).passthrough();

export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_CONTAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT id, status FROM alissonerp.auditorias_estoque WHERE id = ${auditoriaId}
  `;
  if (!auditoria) {
    return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  }
  if (auditoria.status !== "em_andamento") {
    return NextResponse.json({ error: "Auditoria não está em andamento" }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ItensPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { itens } = parsed.data;

  let atualizados = 0;
  for (const item of itens) {
    const sets: string[] = [];
    const vals: any[] = [];
    let p = 1;

    if (item.quantidade_contada !== undefined) {
      sets.push(`quantidade_contada = $${p++}`);
      vals.push(item.quantidade_contada);
    }
    if (item.localizacao_fisica !== undefined) {
      sets.push(`localizacao_fisica = $${p++}`);
      vals.push(item.localizacao_fisica);
    }
    if (item.consultora !== undefined) {
      sets.push(`consultora = $${p++}`);
      vals.push(item.consultora);
    }
    if (item.status !== undefined) {
      sets.push(`status = $${p++}`);
      vals.push(item.status);
    }
    if (item.observacao !== undefined) {
      sets.push(`observacao = $${p++}`);
      vals.push(item.observacao);
    }
    if (item.venda_numero !== undefined && item.venda_numero !== null) {
      const [venda] = await sql`
        SELECT id, numero_venda FROM alissonerp.vendas_erp
        WHERE numero_venda::text = ${item.venda_numero.trim()}
        LIMIT 1
      `;
      if (venda) {
        sets.push(`venda_id = $${p++}`);
        vals.push(venda.id);
        sets.push(`venda_numero = $${p++}`);
        vals.push(venda.numero_venda);
      }
    }

    if (sets.length === 0) continue;

    sets.push(`contado_por = COALESCE(contado_por, $${p++}::uuid)`);
    vals.push(user.id);
    sets.push(`contado_em = COALESCE(contado_em, now())`);

    vals.push(item.id);
    const query = `
      UPDATE alissonerp.auditorias_estoque_itens
      SET ${sets.join(", ")}
      WHERE id = $${p}
    `;

    const result = await sql.unsafe(query, vals);
    if (result && result.count !== undefined && result.count > 0) atualizados++;
  }

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL)::int AS itens_contados,
      COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL AND validado = false)::int AS itens_divergentes
    FROM alissonerp.auditorias_estoque_itens
    WHERE auditoria_id = ${auditoriaId}
  `;

  await sql`
    UPDATE alissonerp.auditorias_estoque
    SET itens_contados = ${stats.itens_contados}, itens_divergentes = ${stats.itens_divergentes}
    WHERE id = ${auditoriaId}
  `;

  return NextResponse.json({
    atualizados,
    stats: { itens_contados: stats.itens_contados, itens_divergentes: stats.itens_divergentes },
  });
}
