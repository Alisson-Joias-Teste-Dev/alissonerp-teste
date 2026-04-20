import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// Coerçoes para SQL (postgres.js nao aceita {} | null)
const s = (v: unknown): string | null => v == null ? null : String(v);
const n = (v: unknown): number | null => v == null ? null : Number(v);
const bo = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;

// ─── GET /api/fiscal/emitentes/[id] ────────────────────────────────────────
// NAO retorna focus_token — so um boolean tem_token.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const emId = Number(id);
  if (isNaN(emId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [row] = await sql`
    SELECT e.id, e.nome_fantasia, e.razao_social, e.cnpj, e.ie, e.im,
           e.regime_tributario, e.logradouro, e.numero, e.complemento,
           e.bairro, e.codigo_ibge_municipio, e.municipio, e.uf, e.cep,
           e.ambiente, e.serie_nfe, e.serie_nfce, e.proxima_nfe, e.proxima_nfce,
           e.local_estoque_id, l.nome AS local_estoque_nome,
           e.ativo, e.created_at, e.updated_at,
           (e.focus_token_criptografado IS NOT NULL AND e.focus_token_criptografado <> '') AS tem_token
    FROM alissonerp.empresas_emitentes e
    LEFT JOIN alissonerp.locais_estoque l ON l.id = e.local_estoque_id
    WHERE e.id = ${emId}
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  return NextResponse.json(row);
}

// ─── PATCH /api/fiscal/emitentes/[id] ──────────────────────────────────────
// NAO aceita id nem cnpj. focus_token opcional: se vier, atualiza; ausente, preserva.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const emId = Number(id);
  if (isNaN(emId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Validacoes pontuais
  if (body.regime_tributario !== undefined && ![1, 2, 3].includes(Number(body.regime_tributario))) {
    return NextResponse.json({ error: "regime_tributario invalido" }, { status: 400 });
  }
  if (body.uf !== undefined && body.uf !== null && String(body.uf).length !== 2) {
    return NextResponse.json({ error: "uf deve ter 2 caracteres" }, { status: 400 });
  }
  if (body.ambiente !== undefined && !["homologacao", "producao"].includes(String(body.ambiente))) {
    return NextResponse.json({ error: "ambiente invalido" }, { status: 400 });
  }

  const tokenProvided = Object.prototype.hasOwnProperty.call(body, "focus_token");
  const newToken = tokenProvided ? (body.focus_token as string | null) ?? null : null;

  // TODO(Sprint 3): criptografar newToken via pgp_sym_encrypt.
  try {
    const [row] = await sql`
      UPDATE alissonerp.empresas_emitentes SET
        nome_fantasia         = COALESCE(${s(body.nome_fantasia)}::text, nome_fantasia),
        razao_social          = COALESCE(${s(body.razao_social)}::text, razao_social),
        ie                    = COALESCE(${s(body.ie)}::text, ie),
        im                    = COALESCE(${s(body.im)}::text, im),
        regime_tributario     = COALESCE(${n(body.regime_tributario)}::smallint, regime_tributario),
        logradouro            = COALESCE(${s(body.logradouro)}::text, logradouro),
        numero                = COALESCE(${s(body.numero)}::text, numero),
        complemento           = COALESCE(${s(body.complemento)}::text, complemento),
        bairro                = COALESCE(${s(body.bairro)}::text, bairro),
        codigo_ibge_municipio = COALESCE(${s(body.codigo_ibge_municipio)}::text, codigo_ibge_municipio),
        municipio             = COALESCE(${s(body.municipio)}::text, municipio),
        uf                    = COALESCE(${s(body.uf)}::text, uf),
        cep                   = COALESCE(${s(body.cep)}::text, cep),
        ambiente              = COALESCE(${s(body.ambiente)}::text, ambiente),
        serie_nfe             = COALESCE(${n(body.serie_nfe)}::smallint, serie_nfe),
        serie_nfce            = COALESCE(${n(body.serie_nfce)}::smallint, serie_nfce),
        proxima_nfe           = COALESCE(${n(body.proxima_nfe)}::integer, proxima_nfe),
        proxima_nfce          = COALESCE(${n(body.proxima_nfce)}::integer, proxima_nfce),
        local_estoque_id      = COALESCE(${n(body.local_estoque_id)}::integer, local_estoque_id),
        ativo                 = COALESCE(${bo(body.ativo)}::boolean, ativo),
        focus_token_criptografado = CASE
          WHEN ${tokenProvided}::boolean THEN ${newToken}::text
          ELSE focus_token_criptografado
        END,
        updated_at = NOW()
      WHERE id = ${emId}
      RETURNING id
    `;
    if (!row) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/fiscal/emitentes/[id]:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── DELETE /api/fiscal/emitentes/[id] — soft delete ───────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const emId = Number(id);
  if (isNaN(emId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [row] = await sql`
    UPDATE alissonerp.empresas_emitentes
       SET ativo = false, updated_at = NOW()
     WHERE id = ${emId}
     RETURNING id
  `;
  if (!row) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
