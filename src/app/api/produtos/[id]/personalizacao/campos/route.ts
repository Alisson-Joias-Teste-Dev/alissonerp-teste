import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";

/**
 * Gerenciamento de campos de personalizacao por produto.
 *
 *   GET    /api/produtos/:id/personalizacao/campos  → lista campos (ordenados por posicao)
 *   POST   /api/produtos/:id/personalizacao/campos  → upsert array de campos (substitui todos)
 *   DELETE /api/produtos/:id/personalizacao/campos  → remove todos os campos
 */

const ROLES_CONFIG = ["admin", "desenvolvedor", "gerente_loja", "gerente_fabrica"] as const;

const CARACTERES_VALIDOS = [
  "alfa", "alfa_acento", "alfa_acento_espaco",
  "alfanum", "alfanum_acento_espaco", "numero", "qualquer",
] as const;

const TIPOS_VALIDOS = ["nome", "iniciais", "data", "numero", "simbolo", "livre"] as const;

function parseProdutoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface CampoInput {
  label?: unknown;
  placeholder?: unknown;
  exemplo?: unknown;
  tipo?: unknown;
  obrigatorio?: unknown;
  min_caracteres?: unknown;
  max_caracteres?: unknown;
  caracteres_permitidos?: unknown;
  posicao?: unknown;
}

function validarCampo(c: CampoInput, idx: number): string | null {
  if (typeof c.label !== "string" || !c.label.trim()) {
    return `Campo #${idx + 1}: label é obrigatório`;
  }
  if (typeof c.max_caracteres !== "number" || !Number.isInteger(c.max_caracteres) || c.max_caracteres < 1) {
    return `Campo #${idx + 1} ("${c.label}"): max_caracteres inválido (inteiro >= 1)`;
  }
  const min = typeof c.min_caracteres === "number" && Number.isInteger(c.min_caracteres) ? c.min_caracteres : 1;
  if (min < 0 || min > c.max_caracteres) {
    return `Campo #${idx + 1} ("${c.label}"): min_caracteres inválido (0 <= min <= max)`;
  }
  if (c.caracteres_permitidos != null && typeof c.caracteres_permitidos === "string" &&
      !CARACTERES_VALIDOS.includes(c.caracteres_permitidos as typeof CARACTERES_VALIDOS[number])) {
    return `Campo #${idx + 1} ("${c.label}"): caracteres_permitidos inválido`;
  }
  if (c.tipo != null && typeof c.tipo === "string" &&
      !TIPOS_VALIDOS.includes(c.tipo as typeof TIPOS_VALIDOS[number])) {
    return `Campo #${idx + 1} ("${c.label}"): tipo inválido`;
  }
  return null;
}

// ─── GET ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const campos = await sql`
      SELECT
        pc.id,
        pc.config_id,
        pc.label,
        pc.placeholder,
        pc.exemplo,
        pc.tipo,
        pc.obrigatorio,
        pc.min_caracteres,
        pc.max_caracteres,
        pc.caracteres_permitidos,
        pc.posicao
      FROM alissonerp.produto_personalizacao_campos pc
      JOIN alissonerp.produto_personalizacao pp ON pp.id = pc.config_id
      WHERE pp.produto_id = ${produtoId}
        AND pp.ativo = true
      ORDER BY pc.posicao ASC, pc.id ASC
    `;

    return NextResponse.json({
      campos: campos.map((c: Record<string, unknown>) => ({
        id: Number(c.id),
        config_id: Number(c.config_id),
        label: String(c.label),
        placeholder: c.placeholder ? String(c.placeholder) : null,
        exemplo: c.exemplo ? String(c.exemplo) : null,
        tipo: String(c.tipo),
        obrigatorio: Boolean(c.obrigatorio),
        min_caracteres: Number(c.min_caracteres),
        max_caracteres: Number(c.max_caracteres),
        caracteres_permitidos: String(c.caracteres_permitidos),
        posicao: Number(c.posicao),
      })),
    });
  } catch (err) {
    console.error("[GET /api/produtos/[id]/personalizacao/campos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── POST (substitui todos os campos) ──────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`
    SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CONFIG))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let bodyRaw: { campos?: unknown[] };
  try {
    bodyRaw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const camposBody = bodyRaw.campos;
  if (!Array.isArray(camposBody)) {
    return NextResponse.json({ error: "campos deve ser um array" }, { status: 400 });
  }

  if (camposBody.length === 0) {
    return NextResponse.json({ error: "Pelo menos 1 campo é obrigatório" }, { status: 400 });
  }

  // Validar cada campo
  for (let i = 0; i < camposBody.length; i++) {
    const erro = validarCampo(camposBody[i] as CampoInput, i);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  }

  try {
    const resultado = await sql.begin(async (tx: any) => {
      // Confirma existencia do produto + config
      const [config] = await tx`
        SELECT id FROM alissonerp.produto_personalizacao
        WHERE produto_id = ${produtoId} AND ativo = true
      `;
      if (!config) {
        throw new HttpError(404, "Produto não possui configuração de personalização. Crie a config primeiro.");
      }
      const configId = Number(config.id);

      // Deleta campos existentes
      await tx`
        DELETE FROM alissonerp.produto_personalizacao_campos
        WHERE config_id = ${configId}
      `;

      // Insere novos campos
      const inseridos: number[] = [];
      for (let i = 0; i < camposBody.length; i++) {
        const c = camposBody[i] as CampoInput;
        const [row] = await tx`
          INSERT INTO alissonerp.produto_personalizacao_campos (
            config_id, label, placeholder, exemplo,
            tipo, obrigatorio, min_caracteres, max_caracteres,
            caracteres_permitidos, posicao
          ) VALUES (
            ${configId},
            ${String(c.label).trim()},
            ${typeof c.placeholder === "string" && c.placeholder.trim() ? c.placeholder.trim().slice(0, 100) : null},
            ${typeof c.exemplo === "string" && c.exemplo.trim() ? c.exemplo.trim().slice(0, 100) : null},
            ${typeof c.tipo === "string" && TIPOS_VALIDOS.includes(c.tipo as typeof TIPOS_VALIDOS[number]) ? c.tipo : "nome"},
            ${typeof c.obrigatorio === "boolean" ? c.obrigatorio : true},
            ${typeof c.min_caracteres === "number" ? Math.max(0, Math.floor(c.min_caracteres)) : 1},
            ${Math.max(1, Math.floor(Number(c.max_caracteres)))},
            ${typeof c.caracteres_permitidos === "string" && CARACTERES_VALIDOS.includes(c.caracteres_permitidos as typeof CARACTERES_VALIDOS[number]) ? c.caracteres_permitidos : "alfa_acento_espaco"},
            ${i}
          )
          RETURNING id
        `;
        inseridos.push(Number(row.id));
      }

      return { total: inseridos.length };
    });

    return NextResponse.json({ ok: true, total: resultado.total });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/produtos/[id]/personalizacao/campos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── DELETE (remove todos os campos) ───────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`
    SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CONFIG))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const result = await sql`
      DELETE FROM alissonerp.produto_personalizacao_campos pc
      USING alissonerp.produto_personalizacao pp
      WHERE pp.id = pc.config_id
        AND pp.produto_id = ${produtoId}
      RETURNING pc.id
    `;

    return NextResponse.json({ ok: true, removidos: result.length });
  } catch (err) {
    console.error("[DELETE /api/produtos/[id]/personalizacao/campos]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
