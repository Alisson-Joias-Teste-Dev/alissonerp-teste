import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";

/**
 * POST /api/lia/personalizar/configurar
 *
 * Ferramenta que a LIA usa para SALVAR as regras de personalizaÃ§Ã£o
 * que o usuÃ¡rio definiu na conversa.
 *
 * Body:
 * {
 *   produtoId: number,
 *   tipo?: string,            // "nome" | "iniciais" | "data" | "numero" | "simbolo" | "livre"
 *   label?: string,           // ex: "Nome a gravar"
 *   obrigatorio?: boolean,
 *   min_caracteres?: number,
 *   max_caracteres?: number,
 *   caracteres_permitidos?: string,
 *   campos_gratis?: number,           // ex: 3 (quantos campos inclusos)
 *   preco_campo_adicional?: number | null, // ex: 100 (R$ por campo extra)
 *   preco_por_letra?: number | null,
 *   peso_por_letra?: number | null,
 *   regras?: {                        // regras de formataÃ§Ã£o
 *     primeira_letra_maiuscula?: boolean,
 *     sem_espacos?: boolean,
 *     sem_numeros?: boolean,
 *     sem_simbolos?: boolean,
 *     sem_acentos?: boolean,
 *   },
 *   descricao_produto?: string        // opcional: atualiza nome do produto
 * }
 *
 * Response:
 * { ok: true, config_id: number, regras_id?: number }
 */

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

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
  }

  // Verifica permissÃ£o (admin, desenvolvedor, gerente)
  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ["admin", "desenvolvedor", "gerente_loja", "gerente_fabrica"] as const))) {
    return NextResponse.json(
      { error: "Sem permissÃ£o para configurar personalizaÃ§Ã£o" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invÃ¡lido" }, { status: 400 });
  }

  const produtoId = Number(body.produtoId);
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "produtoId invÃ¡lido" }, { status: 400 });
  }

  try {
    const resultado = await sql.begin(async (tx: any) => {
      // Confirma existencia do produto
      const [produto] = await tx`
        SELECT id_produto FROM public.produtos WHERE id_produto = ${produtoId}
      `;
      if (!produto) {
        throw new Error("Produto nÃ£o encontrado");
      }

      // Se descricao_produto foi enviada, atualiza nome
      if (body.descricao_produto && typeof body.descricao_produto === "string") {
        await tx`
          UPDATE public.produtos
          SET nome = ${body.descricao_produto.trim().slice(0, 500)}
          WHERE id_produto = ${produtoId}
        `;
      }

      // Valida campos
      const tipo = typeof body.tipo === "string" && TIPOS_VALIDOS.includes(body.tipo as any)
        ? body.tipo
        : undefined;

      const label = typeof body.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 100)
        : undefined;

      const obrigatorio = typeof body.obrigatorio === "boolean"
        ? body.obrigatorio
        : undefined;

      const min_caracteres = typeof body.min_caracteres === "number"
        ? Math.max(0, Math.floor(Number(body.min_caracteres)))
        : undefined;

      const max_caracteres = typeof body.max_caracteres === "number"
        ? Math.max(1, Math.floor(Number(body.max_caracteres)))
        : undefined;

      const caracteres_permitidos = typeof body.caracteres_permitidos === "string"
        && CARACTERES_PERMITIDOS_VALIDOS.includes(body.caracteres_permitidos as any)
        ? body.caracteres_permitidos
        : undefined;

      const campos_gratis = typeof body.campos_gratis === "number"
        ? Math.max(0, Math.floor(Number(body.campos_gratis)))
        : undefined;

      let preco_campo_adicional: number | null | undefined = undefined;
      if (body.preco_campo_adicional !== undefined) {
        if (body.preco_campo_adicional === null || body.preco_campo_adicional === "") {
          preco_campo_adicional = null;
        } else {
          const n = Number(body.preco_campo_adicional);
          if (Number.isFinite(n) && n >= 0) {
            preco_campo_adicional = Math.round(n * 100) / 100;
          }
        }
      }

      // Monta SET dinÃ¢mico no SQL com only os campos enviados
      const sets: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (tipo !== undefined) { sets.push(`tipo = $${idx++}`); params.push(tipo); }
      if (label !== undefined) { sets.push(`label = $${idx++}`); params.push(label); }
      if (obrigatorio !== undefined) { sets.push(`obrigatorio = $${idx++}`); params.push(obrigatorio); }
      if (min_caracteres !== undefined) { sets.push(`min_caracteres = $${idx++}`); params.push(min_caracteres); }
      if (max_caracteres !== undefined) { sets.push(`max_caracteres = $${idx++}`); params.push(max_caracteres); }
      if (caracteres_permitidos !== undefined) { sets.push(`caracteres_permitidos = $${idx++}`); params.push(caracteres_permitidos); }
      if (campos_gratis !== undefined) { sets.push(`campos_gratis = $${idx++}`); params.push(campos_gratis); }
      if (preco_campo_adicional !== undefined) { sets.push(`preco_campo_adicional = $${idx++}`); params.push(preco_campo_adicional); }

      // Atualiza ou insere config
      let configId: number;

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        const setClause = sets.join(", ");
        params.push(produtoId);
        const [row] = await tx.unsafe(`
          INSERT INTO alissonerp.produto_personalizacao (
            produto_id, tipo, obrigatorio, min_caracteres, max_caracteres,
            caracteres_permitidos, label, campos_gratis, preco_campo_adicional
          ) VALUES (
            $${idx}, 'nome'::varchar, true, 1, 20,
            'alfa_acento_espaco'::varchar, 'Nome a gravar', 1, NULL
          )
          ON CONFLICT (produto_id) DO UPDATE SET ${setClause}
          RETURNING id
        `, params);
        configId = Number(row.id);
      } else {
        // Apenas busca config existente
        const [row] = await tx`
          SELECT id FROM alissonerp.produto_personalizacao
          WHERE produto_id = ${produtoId} AND ativo = true
        `;
        if (!row) {
          // Cria default
          const [newRow] = await tx`
            INSERT INTO alissonerp.produto_personalizacao (produto_id)
            VALUES (${produtoId})
            RETURNING id
          `;
          configId = Number(newRow.id);
        } else {
          configId = Number(row.id);
        }
      }

      // Salva regras de formataÃ§Ã£o, se enviadas
      let regrasId: number | undefined;
      const regras = body.regras as Record<string, unknown> | undefined;
      if (regras && typeof regras === "object") {
        const rPrimeira = typeof regras.primeira_letra_maiuscula === "boolean"
          ? regras.primeira_letra_maiuscula : true;
        const rSemEspacos = typeof regras.sem_espacos === "boolean"
          ? regras.sem_espacos : false;
        const rSemNumeros = typeof regras.sem_numeros === "boolean"
          ? regras.sem_numeros : true;
        const rSemSimbolos = typeof regras.sem_simbolos === "boolean"
          ? regras.sem_simbolos : true;
        const rSemAcentos = typeof regras.sem_acentos === "boolean"
          ? regras.sem_acentos : false;

        const [row] = await tx`
          INSERT INTO alissonerp.produto_personalizacao_regras (
            config_id, primeira_letra_maiuscula, sem_espacos,
            sem_numeros, sem_simbolos, sem_acentos
          ) VALUES (
            ${configId}, ${rPrimeira}, ${rSemEspacos},
            ${rSemNumeros}, ${rSemSimbolos}, ${rSemAcentos}
          )
          ON CONFLICT (config_id) DO UPDATE SET
            primeira_letra_maiuscula = EXCLUDED.primeira_letra_maiuscula,
            sem_espacos             = EXCLUDED.sem_espacos,
            sem_numeros             = EXCLUDED.sem_numeros,
            sem_simbolos            = EXCLUDED.sem_simbolos,
            sem_acentos             = EXCLUDED.sem_acentos,
            updated_at              = now()
          RETURNING id
        `;
        regrasId = Number(row.id);
      }

      return { config_id: configId, regras_id: regrasId };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[LIA Configurar]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/lia/personalizar/configurar?produtoId=X
 *
 * Retorna a config atual para a LIA ler antes de configurar.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NÃ£o autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const produtoId = Number(searchParams.get("produtoId"));
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "produtoId invÃ¡lido" }, { status: 400 });
  }

  try {
    const [row] = await sql`
      SELECT
        pp.id, pp.produto_id, pp.tipo, pp.obrigatorio,
        pp.min_caracteres, pp.max_caracteres,
        pp.caracteres_permitidos, pp.label, pp.placeholder,
        pp.exemplo, pp.observacao, pp.ativo,
        pp.campos_gratis, pp.preco_campo_adicional,
        pp.preco_por_letra, pp.peso_por_letra,
        ppr.primeira_letra_maiuscula, ppr.sem_espacos,
        ppr.sem_numeros, ppr.sem_simbolos, ppr.sem_acentos
      FROM alissonerp.produto_personalizacao pp
      LEFT JOIN alissonerp.produto_personalizacao_regras ppr ON ppr.config_id = pp.id
      WHERE pp.produto_id = ${produtoId} AND pp.ativo = true
    `;

    if (!row) {
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({
      config: {
        id: Number(row.id),
        produto_id: Number(row.produto_id),
        tipo: row.tipo,
        obrigatorio: Boolean(row.obrigatorio),
        min_caracteres: Number(row.min_caracteres),
        max_caracteres: Number(row.max_caracteres),
        caracteres_permitidos: row.caracteres_permitidos,
        label: row.label,
        placeholder: row.placeholder ?? null,
        exemplo: row.exemplo ?? null,
        observacao: row.observacao ?? null,
        ativo: Boolean(row.ativo),
        campos_gratis: row.campos_gratis != null ? Number(row.campos_gratis) : 1,
        preco_campo_adicional: row.preco_campo_adicional != null ? Number(row.preco_campo_adicional) : null,
        preco_por_letra: row.preco_por_letra != null ? Number(row.preco_por_letra) : null,
        peso_por_letra: row.peso_por_letra != null ? Number(row.peso_por_letra) : null,
        regras: row.primeira_letra_maiuscula != null ? {
          primeira_letra_maiuscula: Boolean(row.primeira_letra_maiuscula),
          sem_espacos: Boolean(row.sem_espacos),
          sem_numeros: Boolean(row.sem_numeros),
          sem_simbolos: Boolean(row.sem_simbolos),
          sem_acentos: Boolean(row.sem_acentos),
        } : null,
      },
    });
  } catch (err) {
    console.error("[LIA Configurar GET]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
