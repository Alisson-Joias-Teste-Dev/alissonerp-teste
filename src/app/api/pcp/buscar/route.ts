import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/pcp/buscar?q=termo
//
// Busca server-side em TODO o histórico de PCPs — ignora o filtro de 30 dias
// da tela principal e ignora os filtros de service/transferência que podem
// estar escondendo ordens "no limbo". Retorna até 100 resultados.
//
// Busca case-insensitive em:
//   - numero_ordem (da ordem via view)
//   - cliente_nome
//   - vendedor_nome
//   - setor_nome
//   - deposito_nome
//   - ordens.numero_pedido
//
// Respeita filtro de depósito pra ourives (só acha PCPs do seu depósito).

const ROLES_VE_TUDO = ["admin", "desenvolvedor", "gerente_fabrica", "pcp", "gerente_loja"];
const MAX_RESULTADOS = 100;
const MIN_QUERY = 2;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_QUERY) {
    return NextResponse.json(
      { error: `Busca precisa de pelo menos ${MIN_QUERY} caracteres` },
      { status: 400 }
    );
  }

  // Auth + resolve role/deposito do usuário
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [caller] = await sql`
    SELECT role, deposito_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!caller) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const role = caller.role as string;
  const restrictDeposito = !ROLES_VE_TUDO.includes(role) && caller.deposito_id != null
    ? (caller.deposito_id as number)
    : null;

  // Pattern pra ILIKE — usa surrounding wildcards pra substring match
  const pattern = `%${q}%`;

  // Duas queries separadas (com/sem filtro de depósito) porque postgres.js
  // não deixa branching inline em template literal facilmente. Mesmo padrão
  // da page.tsx.
  //
  // NOTA: não aplica os filtros de service/transferência. Quem busca quer
  // achar a ordem mesmo se ela estiver num fluxo ambíguo.
  // unaccent() torna a busca insensível a acentos (ex: "Joao" encontra
  // "João"). Requer extensão unaccent (migration 136).
  // numero_pedido é TEXT de dígitos, não precisa unaccent.
  const rows = restrictDeposito != null
    ? await sql`
        SELECT
          v.id, v.ordem_id, v.etapas, v.etapas_cod, v.numero_ordem,
          v.cliente_nome, v.vendedor_nome, v.setor_nome, v.deposito_nome,
          v.peso_final, v.total_metal, v.data_conclusao,
          v.created_at, v.deposito_id, v.setor_id,
          o.numero_pedido,
          COALESCE(o.eh_teste, false) AS eh_teste,
          o.peso_metal_externo,
          EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando')
              AND s.transferencia_service_id IS NOT NULL
          ) AS na_service
        FROM alissonerp.vw_pcp_erp v
        LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
        WHERE v.deposito_id = ${restrictDeposito}
          AND (
            unaccent(v.numero_ordem)   ILIKE unaccent(${pattern})
            OR unaccent(v.cliente_nome)  ILIKE unaccent(${pattern})
            OR unaccent(v.vendedor_nome) ILIKE unaccent(${pattern})
            OR unaccent(v.setor_nome)    ILIKE unaccent(${pattern})
            OR unaccent(v.deposito_nome) ILIKE unaccent(${pattern})
            OR o.numero_pedido ILIKE ${pattern}
          )
        ORDER BY
          CASE WHEN unaccent(v.numero_ordem) ILIKE unaccent(${q + '%'}) THEN 0 ELSE 1 END,
          v.id DESC
        LIMIT ${MAX_RESULTADOS}
      `
    : await sql`
        SELECT
          v.id, v.ordem_id, v.etapas, v.etapas_cod, v.numero_ordem,
          v.cliente_nome, v.vendedor_nome, v.setor_nome, v.deposito_nome,
          v.peso_final, v.total_metal, v.data_conclusao,
          v.created_at, v.deposito_id, v.setor_id,
          o.numero_pedido,
          COALESCE(o.eh_teste, false) AS eh_teste,
          o.peso_metal_externo,
          EXISTS (
            SELECT 1 FROM alissonerp.servicos s
            WHERE s.pcp_id = v.id
              AND s.status IN ('em_servico', 'aguardando')
              AND s.transferencia_service_id IS NOT NULL
          ) AS na_service
        FROM alissonerp.vw_pcp_erp v
        LEFT JOIN alissonerp.ordens o ON o.id = v.ordem_id
        WHERE
          unaccent(v.numero_ordem)   ILIKE unaccent(${pattern})
          OR unaccent(v.cliente_nome)  ILIKE unaccent(${pattern})
          OR unaccent(v.vendedor_nome) ILIKE unaccent(${pattern})
          OR unaccent(v.setor_nome)    ILIKE unaccent(${pattern})
          OR unaccent(v.deposito_nome) ILIKE unaccent(${pattern})
          OR o.numero_pedido ILIKE ${pattern}
        ORDER BY
          CASE WHEN unaccent(v.numero_ordem) ILIKE unaccent(${q + '%'}) THEN 0 ELSE 1 END,
          v.id DESC
        LIMIT ${MAX_RESULTADOS}
      `;

  return NextResponse.json({
    ok: true,
    query: q,
    total: rows.length,
    limit: MAX_RESULTADOS,
    results: rows,
  });
}
