/**
 * Configuração de MÚLTIPLOS campos personalizáveis por produto.
 *
 *   GET  /api/produtos/[id]/personalizacao-campos
 *     → { campos: [{ id, ordem, nome, tipo, obrigatorio, ..., opcoes: [...] }] }
 *
 *   PUT  /api/produtos/[id]/personalizacao-campos
 *     → substitui TODA a config (replace).
 *
 * Convive com o endpoint legado /personalizacao (1:1) — esse novo é o que
 * a UI multi-campos usa. Produtos antigos com 1 campo de gravação de letras
 * aparecem como 1 campo do tipo "texto" nesse endpoint também (compatibilidade).
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess, hasRole } from "@/lib/roles";

const ROLES_CONFIG = ["admin", "desenvolvedor", "diretor", "gerente_loja", "gerente_fabrica"] as const;

const TIPOS_VALIDOS = new Set(["texto", "numero", "selecao_unica", "selecao_multipla"]);
// Tipos legados — viram "texto" na UI nova
const TIPOS_LEGADOS_MAP: Record<string, string> = {
  nome: "texto", iniciais: "texto", simbolo: "texto", livre: "texto", data: "texto",
};
const CARACTERES_VALIDOS = new Set([
  "alfa", "alfa_acento", "alfa_acento_espaco",
  "alfanum", "alfanum_acento_espaco", "numero", "qualquer",
]);

interface OpcaoIn { valor?: unknown; preco_extra?: unknown; peso_extra?: unknown; }
interface CampoIn {
  id?: unknown;
  nome?: unknown;
  tipo?: unknown;
  obrigatorio?: unknown;
  min_caracteres?: unknown;
  max_caracteres?: unknown;
  caracteres_permitidos?: unknown;
  min_valor?: unknown;
  max_valor?: unknown;
  preco_extra?: unknown;
  peso_extra?: unknown;
  preco_por_letra?: unknown;
  peso_por_letra?: unknown;
  opcoes?: unknown;
}

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const produtoId = parseId(id);
  if (!produtoId) return NextResponse.json({ error: "produto_id inválido" }, { status: 400 });

  const campos = await sql<{
    id: number; ordem: number; nome: string; tipo_db: string; obrigatorio: boolean;
    min_caracteres: number | null; max_caracteres: number | null;
    caracteres_permitidos: string | null;
    min_valor: number | null; max_valor: number | null;
    preco_extra: number | null; peso_extra: number | null;
    preco_por_letra: number | null; peso_por_letra: number | null;
  }[]>`
    SELECT id, ordem, label AS nome, tipo AS tipo_db, obrigatorio,
           min_caracteres, max_caracteres, caracteres_permitidos,
           min_valor, max_valor, preco_extra, peso_extra,
           preco_por_letra, peso_por_letra
    FROM alissonerp.produto_personalizacao
    WHERE produto_id = ${produtoId} AND ativo = true
    ORDER BY ordem ASC, id ASC
  `;
  if (campos.length === 0) return NextResponse.json({ campos: [] });

  const ids = campos.map((c) => c.id);
  const opcoes = await sql<{ id: number; campo_id: number; ordem: number; valor: string; preco_extra: number | null; peso_extra: number | null }[]>`
    SELECT id, campo_id, ordem, valor, preco_extra, peso_extra
    FROM alissonerp.produto_personalizacao_opcao
    WHERE campo_id = ANY(${ids}) AND ativo = true
    ORDER BY ordem ASC, id ASC
  `;

  const out = campos.map((c) => {
    // Normaliza tipos legados pra "texto"
    const tipo = TIPOS_VALIDOS.has(c.tipo_db) ? c.tipo_db : (TIPOS_LEGADOS_MAP[c.tipo_db] ?? "texto");
    return {
      id: c.id,
      ordem: c.ordem,
      nome: c.nome,
      tipo,
      obrigatorio: c.obrigatorio,
      min_caracteres: c.min_caracteres,
      max_caracteres: c.max_caracteres,
      caracteres_permitidos: c.caracteres_permitidos,
      min_valor: c.min_valor != null ? Number(c.min_valor) : null,
      max_valor: c.max_valor != null ? Number(c.max_valor) : null,
      preco_extra: c.preco_extra != null ? Number(c.preco_extra) : null,
      peso_extra: c.peso_extra != null ? Number(c.peso_extra) : null,
      preco_por_letra: c.preco_por_letra != null ? Number(c.preco_por_letra) : null,
      peso_por_letra: c.peso_por_letra != null ? Number(c.peso_por_letra) : null,
      opcoes: opcoes.filter((o) => o.campo_id === c.id).map((o) => ({
        id: o.id,
        ordem: o.ordem,
        valor: o.valor,
        preco_extra: o.preco_extra != null ? Number(o.preco_extra) : null,
        peso_extra: o.peso_extra != null ? Number(o.peso_extra) : null,
      })),
    };
  });
  return NextResponse.json({ campos: out });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CONFIG))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseId(id);
  if (!produtoId) return NextResponse.json({ error: "produto_id inválido" }, { status: 400 });

  let body: { campos?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  if (!Array.isArray(body.campos)) {
    return NextResponse.json({ error: "campos deve ser array" }, { status: 400 });
  }
  const camposIn = body.campos as CampoIn[];

  // Validação prévia
  for (let i = 0; i < camposIn.length; i++) {
    const c = camposIn[i];
    const nome = typeof c.nome === "string" ? c.nome.trim() : "";
    if (!nome) return NextResponse.json({ error: `Campo #${i + 1}: nome é obrigatório` }, { status: 400 });
    if (typeof c.tipo !== "string" || !TIPOS_VALIDOS.has(c.tipo)) {
      return NextResponse.json({ error: `Campo "${nome}": tipo inválido (${String(c.tipo)})` }, { status: 400 });
    }
    if (c.tipo === "texto" && c.caracteres_permitidos != null) {
      if (typeof c.caracteres_permitidos !== "string" || !CARACTERES_VALIDOS.has(c.caracteres_permitidos)) {
        return NextResponse.json({ error: `Campo "${nome}": caracteres_permitidos inválido` }, { status: 400 });
      }
    }
    if (c.tipo === "selecao_unica" || c.tipo === "selecao_multipla") {
      if (!Array.isArray(c.opcoes) || c.opcoes.length === 0) {
        return NextResponse.json({ error: `Campo "${nome}": ao menos 1 opção` }, { status: 400 });
      }
      for (const o of c.opcoes as OpcaoIn[]) {
        if (typeof o.valor !== "string" || !o.valor.trim()) {
          return NextResponse.json({ error: `Campo "${nome}": opção sem valor` }, { status: 400 });
        }
      }
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      const idsMantidos = camposIn
        .map((c) => (typeof c.id === "number" ? c.id : null))
        .filter((v): v is number => v != null && v > 0);

      // Apaga campos que não vieram no payload
      if (idsMantidos.length > 0) {
        await tx`
          DELETE FROM alissonerp.produto_personalizacao
          WHERE produto_id = ${produtoId}
            AND id NOT IN ${tx(idsMantidos)}
        `;
      } else {
        await tx`
          DELETE FROM alissonerp.produto_personalizacao
          WHERE produto_id = ${produtoId}
        `;
      }

      // Upsert dos campos + opções
      for (let i = 0; i < camposIn.length; i++) {
        const c = camposIn[i];
        const nome = (c.nome as string).trim();
        const tipo = c.tipo as string;
        const obrigatorio = c.obrigatorio === true;
        const minC = c.min_caracteres != null ? Number(c.min_caracteres) : 0;
        const maxC = c.max_caracteres != null ? Number(c.max_caracteres) : 0;
        const charsPerm = (c.caracteres_permitidos as string | null | undefined) ?? "qualquer";
        const minV = c.min_valor != null ? Number(c.min_valor) : null;
        const maxV = c.max_valor != null ? Number(c.max_valor) : null;
        const precoExtra = c.preco_extra != null && c.preco_extra !== "" ? Number(c.preco_extra) : null;
        const pesoExtra = c.peso_extra != null && c.peso_extra !== "" ? Number(c.peso_extra) : null;
        const precoPorLetra = c.preco_por_letra != null && c.preco_por_letra !== "" ? Number(c.preco_por_letra) : null;
        const pesoPorLetra = c.peso_por_letra != null && c.peso_por_letra !== "" ? Number(c.peso_por_letra) : null;

        let campoId: number;
        if (typeof c.id === "number" && c.id > 0) {
          campoId = c.id;
          await tx`
            UPDATE alissonerp.produto_personalizacao SET
              ordem = ${i},
              label = ${nome},
              tipo = ${tipo},
              obrigatorio = ${obrigatorio},
              min_caracteres = ${minC},
              max_caracteres = ${maxC},
              caracteres_permitidos = ${charsPerm},
              min_valor = ${minV},
              max_valor = ${maxV},
              preco_extra = ${precoExtra},
              peso_extra = ${pesoExtra},
              preco_por_letra = ${precoPorLetra},
              peso_por_letra = ${pesoPorLetra},
              ativo = true,
              updated_at = NOW()
            WHERE id = ${campoId} AND produto_id = ${produtoId}
          `;
          await tx`DELETE FROM alissonerp.produto_personalizacao_opcao WHERE campo_id = ${campoId}`;
        } else {
          const [row] = await tx<{ id: number }[]>`
            INSERT INTO alissonerp.produto_personalizacao (
              produto_id, ordem, label, tipo, obrigatorio,
              min_caracteres, max_caracteres, caracteres_permitidos,
              min_valor, max_valor, preco_extra, peso_extra,
              preco_por_letra, peso_por_letra, ativo
            ) VALUES (
              ${produtoId}, ${i}, ${nome}, ${tipo}, ${obrigatorio},
              ${minC}, ${maxC}, ${charsPerm},
              ${minV}, ${maxV}, ${precoExtra}, ${pesoExtra},
              ${precoPorLetra}, ${pesoPorLetra}, true
            )
            RETURNING id
          `;
          campoId = row.id;
        }

        if ((tipo === "selecao_unica" || tipo === "selecao_multipla") && Array.isArray(c.opcoes)) {
          const opcs = c.opcoes as OpcaoIn[];
          for (let j = 0; j < opcs.length; j++) {
            const o = opcs[j];
            await tx`
              INSERT INTO alissonerp.produto_personalizacao_opcao
                (campo_id, ordem, valor, preco_extra, peso_extra)
              VALUES
                (${campoId}, ${j}, ${(o.valor as string).trim()},
                 ${o.preco_extra != null && o.preco_extra !== "" ? Number(o.preco_extra) : null},
                 ${o.peso_extra  != null && o.peso_extra  !== "" ? Number(o.peso_extra)  : null})
            `;
          }
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/produtos/[id]/personalizacao-campos]", err);
    return NextResponse.json({ error: (err as Error).message ?? "Erro interno" }, { status: 500 });
  }
}
