import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";

/**
 * Config de personalizacao por produto.
 *
 *   GET    /api/produtos/[id]/personalizacao  → retorna config (ou null)
 *   POST   /api/produtos/[id]/personalizacao  → upsert (admin)
 *   DELETE /api/produtos/[id]/personalizacao  → soft delete (ativo=false)
 */

const ROLES_CONFIG_PERSONALIZACAO = [
  "admin",
  "desenvolvedor",
  "gerente_loja",
  "gerente_fabrica",
] as const;

const CARACTERES_PERMITIDOS_VALIDOS = [
  "alfa",
  "alfa_acento",
  "alfa_acento_espaco",
  "alfanum",
  "alfanum_acento_espaco",
  "numero",
  "qualquer",
] as const;

const TIPOS_VALIDOS = [
  "nome",
  "iniciais",
  "data",
  "numero",
  "simbolo",
  "livre",
] as const;

function parseProdutoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  try {
    const [row] = await sql`
      SELECT
        produto_id,
        tipo,
        obrigatorio,
        min_caracteres,
        max_caracteres,
        caracteres_permitidos,
        label,
        placeholder,
        exemplo,
        observacao,
        ativo,
        preco_por_letra,
        peso_por_letra
      FROM alissonerp.produto_personalizacao
      WHERE produto_id = ${produtoId}
        AND ativo = true
    `;

    if (!row) {
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({
      config: {
        produto_id:             Number(row.produto_id),
        tipo:                   row.tipo as string,
        obrigatorio:            Boolean(row.obrigatorio),
        min_caracteres:         Number(row.min_caracteres),
        max_caracteres:         Number(row.max_caracteres),
        caracteres_permitidos:  row.caracteres_permitidos as string,
        label:                  row.label as string,
        placeholder:            (row.placeholder as string | null) ?? null,
        exemplo:                (row.exemplo as string | null) ?? null,
        observacao:             (row.observacao as string | null) ?? null,
        ativo:                  Boolean(row.ativo),
        preco_por_letra:        row.preco_por_letra != null ? Number(row.preco_por_letra) : null,
        peso_por_letra:         row.peso_por_letra  != null ? Number(row.peso_por_letra)  : null,
      },
    });
  } catch (err) {
    console.error("[GET /api/produtos/[id]/personalizacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── POST (upsert) ───────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CONFIG_PERSONALIZACAO))) {
    return NextResponse.json(
      { error: "Sem permissao para configurar personalizacao" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  let body: {
    tipo?: unknown;
    obrigatorio?: unknown;
    min_caracteres?: unknown;
    max_caracteres?: unknown;
    caracteres_permitidos?: unknown;
    label?: unknown;
    placeholder?: unknown;
    exemplo?: unknown;
    observacao?: unknown;
    ativo?: unknown;
    preco_por_letra?: unknown;
    peso_por_letra?: unknown;
    descricao_produto?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Validacao de tipos
  const tipo = typeof body.tipo === "string" && TIPOS_VALIDOS.includes(body.tipo as typeof TIPOS_VALIDOS[number])
    ? body.tipo
    : "nome";

  const obrigatorio = typeof body.obrigatorio === "boolean" ? body.obrigatorio : true;

  const min = Number(body.min_caracteres);
  const max = Number(body.max_caracteres);
  if (!Number.isInteger(min) || min < 0) {
    return NextResponse.json(
      { error: "min_caracteres invalido (inteiro >= 0)" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(max) || max < min) {
    return NextResponse.json(
      { error: "max_caracteres invalido (inteiro >= min_caracteres)" },
      { status: 400 },
    );
  }

  const caracteres =
    typeof body.caracteres_permitidos === "string" &&
    CARACTERES_PERMITIDOS_VALIDOS.includes(body.caracteres_permitidos as typeof CARACTERES_PERMITIDOS_VALIDOS[number])
      ? body.caracteres_permitidos
      : "alfa_acento_espaco";

  const label       = typeof body.label       === "string" && body.label.trim()       ? body.label.trim().slice(0, 100)       : "Nome a gravar";
  const placeholder = typeof body.placeholder === "string" && body.placeholder.trim() ? body.placeholder.trim().slice(0, 100) : null;
  const exemplo     = typeof body.exemplo     === "string" && body.exemplo.trim()     ? body.exemplo.trim().slice(0, 100)     : null;
  const observacao  = typeof body.observacao  === "string" && body.observacao.trim()  ? body.observacao.trim().slice(0, 2000) : null;
  const ativo       = typeof body.ativo       === "boolean" ? body.ativo : true;

  // preco_por_letra: NUMBER >= 0 ou null (null = usa preco_tiny do produto)
  let precoPorLetra: number | null = null;
  if (body.preco_por_letra != null && body.preco_por_letra !== "") {
    const n = Number(body.preco_por_letra);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "preco_por_letra invalido (numero >= 0 ou null)" },
        { status: 400 },
      );
    }
    precoPorLetra = Math.round(n * 100) / 100;
  }

  // peso_por_letra: NUMBER >= 0 ou null (null = usa peso_precificado do produto)
  let pesoPorLetra: number | null = null;
  if (body.peso_por_letra != null && body.peso_por_letra !== "") {
    const n = Number(body.peso_por_letra);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "peso_por_letra invalido (numero >= 0 ou null)" },
        { status: 400 },
      );
    }
    pesoPorLetra = Math.round(n * 100) / 100;
  }

  // descricao_produto: se presente, faz UPDATE public.produtos.nome
  const descricaoProduto =
    typeof body.descricao_produto === "string" && body.descricao_produto.trim().length > 0
      ? body.descricao_produto.trim().slice(0, 500)
      : null;

  try {
    const resultado = await sql.begin(async (tx: any) => {
      // Confirma existencia do produto
      const [produto] = await tx`
        SELECT id_produto FROM public.produtos WHERE id_produto = ${produtoId}
      `;
      if (!produto) {
        throw new HttpError(404, "Produto nao encontrado");
      }

      // Se descricao_produto foi enviada, atualiza public.produtos.nome
      if (descricaoProduto) {
        await tx`
          UPDATE public.produtos
          SET nome = ${descricaoProduto}
          WHERE id_produto = ${produtoId}
        `;
      }

      const [row] = await tx`
        INSERT INTO alissonerp.produto_personalizacao (
          produto_id, tipo, obrigatorio,
          min_caracteres, max_caracteres, caracteres_permitidos,
          label, placeholder, exemplo, observacao, ativo,
          preco_por_letra, peso_por_letra
        ) VALUES (
          ${produtoId}, ${tipo}, ${obrigatorio},
          ${min}, ${max}, ${caracteres},
          ${label}, ${placeholder}, ${exemplo}, ${observacao}, ${ativo},
          ${precoPorLetra}, ${pesoPorLetra}
        )
        ON CONFLICT (produto_id) DO UPDATE SET
          tipo                  = EXCLUDED.tipo,
          obrigatorio           = EXCLUDED.obrigatorio,
          min_caracteres        = EXCLUDED.min_caracteres,
          max_caracteres        = EXCLUDED.max_caracteres,
          caracteres_permitidos = EXCLUDED.caracteres_permitidos,
          label                 = EXCLUDED.label,
          placeholder           = EXCLUDED.placeholder,
          exemplo               = EXCLUDED.exemplo,
          observacao            = EXCLUDED.observacao,
          ativo                 = EXCLUDED.ativo,
          preco_por_letra       = EXCLUDED.preco_por_letra,
          peso_por_letra        = EXCLUDED.peso_por_letra,
          updated_at            = now()
        RETURNING id
      `;

      return { id: Number(row.id) };
    });

    return NextResponse.json({ ok: true, id: resultado.id });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/produtos/[id]/personalizacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Helper interno para codigo HTTP custom dentro de sql.begin
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ─── DELETE (soft delete) ────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CONFIG_PERSONALIZACAO))) {
    return NextResponse.json(
      { error: "Sem permissao" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  try {
    const result = await sql`
      UPDATE alissonerp.produto_personalizacao
      SET ativo = false, updated_at = now()
      WHERE produto_id = ${produtoId} AND ativo = true
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Config nao encontrada ou ja inativa" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/produtos/[id]/personalizacao]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
