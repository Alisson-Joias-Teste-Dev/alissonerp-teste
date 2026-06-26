import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError, IdSchema, DateSchema } from "@/lib/schemas/common";

const OrdensPatchSchema = z.object({
  data_entrega: DateSchema.nullable().optional(),
  detalhes_ordem: z.string().max(LIMITS.DESCRICAO_LONGA_MAX).nullable().optional(),
  situacao: z.string().max(50).nullable().optional(),
  cliente_id: IdSchema.nullable().optional(),
  vendedor_id: IdSchema.nullable().optional(),
  tipo_ordem: z.string().max(50).nullable().optional(),
  peso_metal_negociado: z.number().nonnegative().nullable().optional(),
}).partial();

// PATCH /api/ordens/[id]
// Edição completa de uma ordem — apenas role 'desenvolvedor'.
// Usa SET LOCAL app.role para bypassar fn_proteger_campos_pdv dentro da transação.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ordemId = parseInt(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || usuario.role !== "desenvolvedor") {
    return NextResponse.json({ error: "Sem permissão — apenas desenvolvedor" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsedBody = OrdensPatchSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  // Cópia mutável para permitir normalizacao de enums abaixo.
  const body: z.infer<typeof OrdensPatchSchema> = { ...parsedBody.data };

  // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
  try {
    checkStringLength("detalhes_ordem", body.detalhes_ordem, LIMITS.DESCRICAO_LONGA_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // Normaliza enums: view retorna display (Criado) mas enum espera lowercase (criado)
  if (body.situacao)   body.situacao   = body.situacao.toLowerCase();
  if (body.tipo_ordem) body.tipo_ordem = body.tipo_ordem.toLowerCase();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (sql as any).begin(async (tx: typeof sql) => {
      await tx`SELECT set_config('app.role', 'desenvolvedor', true)`;
      return tx`
        UPDATE alissonerp.ordens
        SET
          data_entrega         = COALESCE(${body.data_entrega         ?? null}::date,      data_entrega),
          detalhes_ordem       = COALESCE(${body.detalhes_ordem       ?? null},            detalhes_ordem),
          situacao             = COALESCE(${body.situacao             ?? null},            situacao),
          cliente_id           = COALESCE(${body.cliente_id           ?? null}::bigint,    cliente_id),
          vendedor_id          = COALESCE(${body.vendedor_id          ?? null}::bigint,    vendedor_id),
          tipo_ordem           = COALESCE(${body.tipo_ordem           ?? null},            tipo_ordem),
          peso_metal_negociado = COALESCE(${body.peso_metal_negociado ?? null}::numeric,   peso_metal_negociado)
        WHERE id = ${ordemId}
        RETURNING id, numero_ordem, data_entrega::text, detalhes_ordem, situacao,
                  cliente_id, vendedor_id, tipo_ordem, peso_metal_negociado
      `;
    });
    const [updated] = rows as Record<string, unknown>[];

    if (!updated) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return internalError(`[PATCH /api/ordens/${ordemId}]`, err, "Erro interno ao salvar");
  }
}
