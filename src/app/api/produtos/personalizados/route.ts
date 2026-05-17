import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

/**
 * POST /api/produtos/personalizados
 *
 * Cria produto novo em public.produtos (com SKU AP automatico)
 * + config de personalizacao em alissonerp.produto_personalizacao.
 * Tudo em transacao atomica.
 *
 * Body:
 *   {
 *     descricao: string,               // obrigatorio — vira public.produtos.nome
 *     preco_por_letra: number,         // obrigatorio — R$ por letra
 *     max_caracteres?: number,         // default 20
 *     min_caracteres?: number,         // default 1
 *     caracteres_permitidos?: string,  // default "alfa_acento_espaco"
 *     label?: string,                  // default "Nome a gravar"
 *     exemplo?: string,
 *     obrigatorio?: boolean            // default true
 *   }
 *
 * Response 201:
 *   { ok: true, id_produto: number, sku: string, nome: string }
 *
 * Errors:
 *   400 body invalido
 *   401 nao autenticado
 *   403 sem permissao
 *   500 erro interno
 */

const ROLES_CADASTRAR_PERSONALIZADO = [
  "admin",
  "desenvolvedor",
  "gerente_loja",
  "gerente_fabrica",
] as const;

const CARACTERES_VALIDOS = [
  "alfa",
  "alfa_acento",
  "alfa_acento_espaco",
  "alfanum",
  "alfanum_acento_espaco",
  "numero",
  "qualquer",
] as const;

export async function POST(req: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────────────────
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
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CADASTRAR_PERSONALIZADO))) {
    return NextResponse.json(
      { error: "Sem permissao para cadastrar produto personalizado" },
      { status: 403 },
    );
  }

  // ─── Parse + valida body ──────────────────────────────────────────────
  let body: {
    descricao?: unknown;
    preco_por_letra?: unknown;
    peso_por_letra?: unknown;
    max_caracteres?: unknown;
    min_caracteres?: unknown;
    caracteres_permitidos?: unknown;
    label?: unknown;
    exemplo?: unknown;
    obrigatorio?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const descricao =
    typeof body.descricao === "string" && body.descricao.trim().length > 0
      ? body.descricao.trim().slice(0, 500)
      : null;
  if (!descricao) {
    return NextResponse.json(
      { error: "descricao obrigatoria (texto nao vazio)" },
      { status: 400 },
    );
  }

  const precoPorLetraRaw = Number(body.preco_por_letra);
  if (!Number.isFinite(precoPorLetraRaw) || precoPorLetraRaw < 0) {
    return NextResponse.json(
      { error: "preco_por_letra obrigatorio (numero >= 0)" },
      { status: 400 },
    );
  }
  const precoPorLetra = Math.round(precoPorLetraRaw * 100) / 100;

  // peso_por_letra: opcional no backend (null aceito)
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

  const min =
    body.min_caracteres != null && Number.isFinite(Number(body.min_caracteres))
      ? Math.max(0, Math.floor(Number(body.min_caracteres)))
      : 1;
  const max =
    body.max_caracteres != null && Number.isFinite(Number(body.max_caracteres))
      ? Math.max(min, Math.floor(Number(body.max_caracteres)))
      : 20;
  if (max < min) {
    return NextResponse.json(
      { error: "max_caracteres precisa ser >= min_caracteres" },
      { status: 400 },
    );
  }

  const caracteres =
    typeof body.caracteres_permitidos === "string" &&
    CARACTERES_VALIDOS.includes(body.caracteres_permitidos as typeof CARACTERES_VALIDOS[number])
      ? body.caracteres_permitidos
      : "alfa_acento_espaco";

  const label =
    typeof body.label === "string" && body.label.trim().length > 0
      ? body.label.trim().slice(0, 100)
      : "Nome a gravar";
  const exemplo =
    typeof body.exemplo === "string" && body.exemplo.trim().length > 0
      ? body.exemplo.trim().slice(0, 100)
      : null;
  const obrigatorio = typeof body.obrigatorio === "boolean" ? body.obrigatorio : true;

  // ─── Transacao: cria produto + config ─────────────────────────────────
  try {
    const resultado = await sql.begin(async (tx: any) => {
      // 1) Novo id_produto via sequence existente
      const [{ id: idProdutoStr }] = await tx`
        SELECT nextval('alissonerp.seq_produto_id') AS id
      `;
      const idProduto = Number(idProdutoStr);

      // 2) Novo SKU PZ via sequence criada na migration 164/165
      const [{ sku }] = await tx`
        SELECT alissonerp.proximo_sku_pz() AS sku
      `;

      // 3) INSERT public.produtos (minimo necessario)
      //    categoria='Personalizado' para facilitar filtro/agrupamento
      //    situacao='A', qtd_estoque=0 (sob encomenda)
      await tx`
        INSERT INTO public.produtos (
          id_produto, sku, nome,
          tipo_metal, situacao, categoria,
          qtd_estoque, tem_pedra_preciosa
        ) VALUES (
          ${idProduto}, ${sku}, ${descricao},
          NULL, 'A', 'Personalizado',
          0, false
        )
      `;

      // 4) INSERT alissonerp.produto_personalizacao
      await tx`
        INSERT INTO alissonerp.produto_personalizacao (
          produto_id, tipo, obrigatorio,
          min_caracteres, max_caracteres, caracteres_permitidos,
          label, placeholder, exemplo,
          ativo, preco_por_letra, peso_por_letra
        ) VALUES (
          ${idProduto}, 'nome', ${obrigatorio},
          ${min}, ${max}, ${caracteres},
          ${label}, ${exemplo ? `Ex: ${exemplo}` : null}, ${exemplo},
          true, ${precoPorLetra}, ${pesoPorLetra}
        )
      `;

      return { id_produto: idProduto, sku: sku as string, nome: descricao };
    });

    return NextResponse.json(
      {
        ok: true,
        id_produto: resultado.id_produto,
        sku: resultado.sku,
        nome: resultado.nome,
      },
      { status: 201 },
    );
  } catch (err) {
    return internalError("[POST /api/produtos/personalizados]", err, "Erro ao criar produto personalizado");
  }
}
