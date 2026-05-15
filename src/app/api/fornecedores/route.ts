/**
 * GET  /api/fornecedores — lista cadastro mestre + nomes distintos em uso
 * POST /api/fornecedores — cria/atualiza fornecedor mestre
 *
 * A tabela alissonerp.fornecedores é opcional (autocomplete + agregação).
 * O campo `fornecedor` em erp_produtos é texto livre — pode haver valores
 * que não constam no mestre. O GET retorna a união de ambos.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { colunaExiste, tabelaExiste } from "@/lib/schema-check";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const temMestre = await tabelaExiste("alissonerp", "fornecedores");
    const temColuna = await colunaExiste("alissonerp", "erp_produtos", "fornecedor");

    // Nada existe ainda — retorna vazio (migration 159 pendente)
    if (!temMestre && !temColuna) {
      return NextResponse.json({ fornecedores: [], migracao_pendente: true });
    }

    // Só a coluna existe (caso raro)
    if (!temMestre && temColuna) {
      const rows = await sql<{ nome: string; em_uso: number }[]>`
        SELECT fornecedor AS nome, COUNT(*)::int AS em_uso
        FROM alissonerp.erp_produtos
        WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> ''
        GROUP BY fornecedor
        ORDER BY em_uso DESC, nome ASC
      `;
      return NextResponse.json({
        fornecedores: rows.map(r => ({ ...r, cnpj: null, ativo: true })),
      });
    }

    // Só o mestre (sem coluna em produtos) — apenas cadastro
    if (temMestre && !temColuna) {
      const rows = await sql<{ nome: string; cnpj: string | null; ativo: boolean }[]>`
        SELECT nome, cnpj, ativo FROM alissonerp.fornecedores
        WHERE ativo = true ORDER BY nome ASC
      `;
      return NextResponse.json({
        fornecedores: rows.map(r => ({ ...r, em_uso: 0 })),
      });
    }

    // Ambos: faz o FULL OUTER JOIN
    const rows = await sql<{ nome: string; cnpj: string | null; ativo: boolean; em_uso: number }[]>`
      WITH mestre AS (
        SELECT nome, cnpj, ativo
        FROM alissonerp.fornecedores
        WHERE ativo = true
      ),
      em_uso AS (
        SELECT fornecedor AS nome, COUNT(*)::int AS total
        FROM alissonerp.erp_produtos
        WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> ''
        GROUP BY fornecedor
      )
      SELECT
        COALESCE(m.nome, u.nome)          AS nome,
        m.cnpj,
        COALESCE(m.ativo, true)           AS ativo,
        COALESCE(u.total, 0)              AS em_uso
      FROM mestre m
      FULL OUTER JOIN em_uso u ON LOWER(TRIM(u.nome)) = LOWER(TRIM(m.nome))
      ORDER BY em_uso DESC, nome ASC
    `;
    return NextResponse.json({ fornecedores: rows });
  } catch (err) {
    console.error("[GET /api/fornecedores]", err);
    return NextResponse.json({ error: "Erro ao listar fornecedores", fornecedores: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  const cnpj       = body?.cnpj       ? String(body.cnpj).trim()       : null;
  const contato    = body?.contato    ? String(body.contato).trim()    : null;
  const observacao = body?.observacao ? String(body.observacao).trim() : null;

  try {
    if (!(await tabelaExiste("alissonerp", "fornecedores"))) {
      return NextResponse.json(
        { error: "Tabela alissonerp.fornecedores não existe. Aplique a migration 159." },
        { status: 503 }
      );
    }

    const [row] = await sql<{ id: number; nome: string }[]>`
      INSERT INTO alissonerp.fornecedores (nome, cnpj, contato, observacao)
      VALUES (${nome}, ${cnpj}, ${contato}, ${observacao})
      ON CONFLICT (nome) DO UPDATE SET
        cnpj       = COALESCE(EXCLUDED.cnpj, alissonerp.fornecedores.cnpj),
        contato    = COALESCE(EXCLUDED.contato, alissonerp.fornecedores.contato),
        observacao = COALESCE(EXCLUDED.observacao, alissonerp.fornecedores.observacao),
        ativo      = true
      RETURNING id, nome
    `;
    return NextResponse.json({ ok: true, fornecedor: row }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/fornecedores]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao salvar fornecedor" },
      { status: 500 }
    );
  }
}
