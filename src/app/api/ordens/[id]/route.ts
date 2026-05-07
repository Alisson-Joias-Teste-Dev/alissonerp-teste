import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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

  const body = await req.json().catch(() => ({})) as {
    data_entrega?:         string | null;
    detalhes_ordem?:       string | null;
    situacao?:             string | null;
    cliente_id?:           number | null;
    vendedor_id?:          number | null;
    tipo_ordem?:           string | null;
    peso_metal_negociado?: number | null;
  };

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
    console.error("[PATCH /api/ordens/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno ao salvar" },
      { status: 500 }
    );
  }
}
