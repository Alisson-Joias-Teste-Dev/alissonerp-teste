import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

const ROLES = ["desenvolvedor", "admin", "gerente_loja", "estoquista_loja"];

const AdicionarSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
  quantidade_sistema: z.coerce.number().int().min(0),
  quantidade_contada: z.coerce.number().int().min(0),
}).passthrough();

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usr] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usr || !ROLES.includes(usr.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT id, status, local_estoque_id FROM alissonerp.auditorias_estoque WHERE id = ${auditoriaId}
  `;
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  if (auditoria.status !== "em_andamento") return NextResponse.json({ error: "Auditoria não está em andamento" }, { status: 409 });

  const raw = await req.json().catch(() => ({}));
  const parsed = AdicionarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { produto_id, quantidade_sistema, quantidade_contada } = parsed.data;

  const [produto] = await sql`
    SELECT id_produto, sku, nome FROM public.produtos WHERE id_produto = ${produto_id}
  `;
  if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  // Sistema e Contado sao informados manualmente pelo usuario (nao busca saldo automatico).
  // Todo item criado aqui entra como "pendente" — so vira "resolvido" quando aprovado (nunca "ok").
  const [existente] = await sql`
    SELECT id FROM alissonerp.auditorias_estoque_itens
    WHERE auditoria_id = ${auditoriaId} AND produto_id = ${produto_id}
  `;

  if (existente) {
    await sql`
      UPDATE alissonerp.auditorias_estoque_itens
      SET quantidade_contada = ${quantidade_contada},
          quantidade_sistema = ${quantidade_sistema},
          status = 'pendente',
          contado_por = ${user.id},
          contado_em = now()
      WHERE id = ${existente.id}
    `;
  } else {
    await sql`
      INSERT INTO alissonerp.auditorias_estoque_itens
        (auditoria_id, produto_id, sku, nome_produto, quantidade_sistema, quantidade_contada, status, contado_por, contado_em)
      VALUES
        (${auditoriaId}, ${produto_id}, ${produto.sku}, ${produto.nome},
         ${quantidade_sistema}, ${quantidade_contada},
         'pendente', ${user.id}, now())
    `;
  }

  // Recalcular stats
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL)::int AS contados,
      COUNT(*) FILTER (WHERE status IN ('pendente', 'aguardando', 'resolvido'))::int AS divergentes
    FROM alissonerp.auditorias_estoque_itens
    WHERE auditoria_id = ${auditoriaId}
  `;
  await sql`
    UPDATE alissonerp.auditorias_estoque
    SET total_itens = ${stats.total}, itens_contados = ${stats.contados}, itens_divergentes = ${stats.divergentes}
    WHERE id = ${auditoriaId}
  `;

  return NextResponse.json({
    id: existente?.id ?? "new",
    quantidade_sistema,
    status: "pendente",
  }, { status: 201 });
}
