import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// id_contato eh BIGINT — passamos ::bigint no SQL.
// ─── GET /api/fiscal/contatos-fiscais/[id_contato] ─────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id_contato: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id_contato } = await params;
  if (!/^\d+$/.test(id_contato)) {
    return NextResponse.json({ error: "id_contato invalido" }, { status: 400 });
  }

  const [row] = await sql`
    SELECT id_contato, ie, indicador_ie, codigo_ibge_municipio, regime_tributario, updated_at
    FROM alissonerp.contatos_fiscais
    WHERE id_contato = ${id_contato}::bigint
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  return NextResponse.json({ ...row, id_contato: String(row.id_contato) });
}

// ─── PUT /api/fiscal/contatos-fiscais/[id_contato] — upsert ────────────────
// Body: { ie?, indicador_ie?, codigo_ibge_municipio?, regime_tributario? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id_contato: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id_contato } = await params;
  if (!/^\d+$/.test(id_contato)) {
    return NextResponse.json({ error: "id_contato invalido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const indicadorIe = body.indicador_ie != null ? Number(body.indicador_ie) : null;
  if (indicadorIe !== null && ![1, 2, 9].includes(indicadorIe)) {
    return NextResponse.json({ error: "indicador_ie deve ser 1, 2 ou 9" }, { status: 400 });
  }

  // IE: so digitos (ou string vazia se isento/nao contribuinte)
  let ie: string | null = null;
  if (body.ie != null && body.ie !== "") {
    ie = String(body.ie).replace(/\D/g, "");
    if (ie.length === 0 || ie.length > 20) {
      return NextResponse.json({ error: "ie deve ter entre 1 e 20 digitos" }, { status: 400 });
    }
  }
  // Se indicador_ie = 2 ou 9, IE deve ser vazia
  if (indicadorIe && (indicadorIe === 2 || indicadorIe === 9) && ie) {
    return NextResponse.json({ error: "IE deve ser vazia quando indicador_ie = 2 ou 9" }, { status: 400 });
  }
  // Se indicador_ie = 1, IE e obrigatoria
  if (indicadorIe === 1 && !ie) {
    return NextResponse.json({ error: "IE obrigatoria quando indicador_ie = 1" }, { status: 400 });
  }

  let ibge: string | null = null;
  if (body.codigo_ibge_municipio != null && body.codigo_ibge_municipio !== "") {
    ibge = String(body.codigo_ibge_municipio).replace(/\D/g, "");
    if (ibge.length !== 7) {
      return NextResponse.json({ error: "codigo_ibge_municipio deve ter 7 digitos" }, { status: 400 });
    }
  }

  const regime = body.regime_tributario != null ? Number(body.regime_tributario) : null;
  if (regime !== null && ![1, 2, 3].includes(regime)) {
    return NextResponse.json({ error: "regime_tributario deve ser 1, 2 ou 3" }, { status: 400 });
  }

  try {
    await sql`
      INSERT INTO alissonerp.contatos_fiscais (
        id_contato, ie, indicador_ie, codigo_ibge_municipio, regime_tributario, updated_at
      ) VALUES (
        ${id_contato}::bigint,
        ${ie},
        ${indicadorIe},
        ${ibge},
        ${regime},
        NOW()
      )
      ON CONFLICT (id_contato) DO UPDATE SET
        ie                     = EXCLUDED.ie,
        indicador_ie           = EXCLUDED.indicador_ie,
        codigo_ibge_municipio  = EXCLUDED.codigo_ibge_municipio,
        regime_tributario      = EXCLUDED.regime_tributario,
        updated_at             = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/fiscal/contatos-fiscais:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
