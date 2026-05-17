import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import {
  validarPersonalizacao,
  normalizarPersonalizacao,
  appendPersonalizacaoObservacao,
  calcularPrecoPorLetra,
  calcularPesoPorLetra,
  type ConfigPersonalizacao,
  type CaracteresPermitidos,
} from "@/lib/personalizacao-validacao";

async function checkOwnership(userId: string, vendaId: number) {
  const [u] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
}

// ─── GET /api/vendas/[id]/itens ────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Onda 1D: bloqueia consultora de ler itens de venda alheia
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const itens = await sql`
    SELECT
      id, venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista, pct_desconto, preco_unitario,
      total_item, pct_comissao, valor_comissao,
      desconto_autorizado_por, observacao, peso_estimado, personalizacao, created_at
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json(
    itens.map((i) => ({
      ...i,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      pct_desconto:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
      pct_comissao:   Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
    }))
  );
}

// ─── POST /api/vendas/[id]/itens ───────────────────────────────────────────────
// Adiciona item à venda (trigger recalcula totais automaticamente)
// Body: { produto_id, nome_produto, sku?, quantidade, preco_lista,
//         pct_desconto, preco_unitario, total_item, pct_comissao,
//         valor_comissao, peso_estimado?, observacao? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });
  }

  // Onda 1D: bloqueia consultora de adicionar item em venda alheia
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json() as {
    produto_id?:   number | null;
    nome_produto:  string;
    sku?:          string | null;
    quantidade:    number;
    preco_lista:   number;
    pct_desconto:  number;
    preco_unitario: number;
    total_item:    number;
    pct_comissao:  number;
    valor_comissao: number;
    peso_estimado?: number | null;
    observacao?:   string | null;
    personalizacao?: { valor?: string } | null;
  };

  if (!body.nome_produto) {
    return NextResponse.json({ error: "nome_produto obrigatório" }, { status: 400 });
  }
  if (!body.quantidade || body.quantidade < 1) {
    return NextResponse.json({ error: "Quantidade inválida" }, { status: 400 });
  }
  if (body.preco_lista == null || body.preco_unitario == null || body.total_item == null) {
    return NextResponse.json({ error: "Preços obrigatórios" }, { status: 400 });
  }

  // ── Personalizacao: valida contra config do produto (se existir) ────────────
  // Alem disso, se config tem preco_por_letra > 0, RECALCULA preco_unitario/
  // total_item server-side (seguranca — body pode vir adulterado).
  let personalizacaoJson: Record<string, unknown> | null = null;
  let observacaoFinal = body.observacao ?? null;
  let precoListaFinal    = body.preco_lista;
  let precoUnitarioFinal = body.preco_unitario;
  let totalItemFinal     = body.total_item;
  let valorComissaoFinal = body.valor_comissao ?? 0;
  let pesoEstimadoFinal: number | null = body.peso_estimado ?? null;

  if (body.produto_id) {
    const [cfg] = await sql`
      SELECT
        tipo, obrigatorio,
        min_caracteres, max_caracteres, caracteres_permitidos,
        label, preco_por_letra, peso_por_letra
      FROM alissonerp.produto_personalizacao
      WHERE produto_id = ${body.produto_id}
        AND ativo = true
    `;
    if (cfg) {
      const config: ConfigPersonalizacao = {
        tipo: cfg.tipo as string,
        obrigatorio: Boolean(cfg.obrigatorio),
        min_caracteres: Number(cfg.min_caracteres),
        max_caracteres: Number(cfg.max_caracteres),
        caracteres_permitidos: cfg.caracteres_permitidos as CaracteresPermitidos,
        label: cfg.label as string,
      };
      const valor = body.personalizacao?.valor;
      const validacao = validarPersonalizacao(valor, config);
      if (!validacao.ok) {
        return NextResponse.json(
          { error: `Personalizacao invalida: ${validacao.erro}` },
          { status: 400 },
        );
      }
      if (valor?.trim()) {
        const norm = normalizarPersonalizacao(valor, config);
        personalizacaoJson = { ...norm };
        observacaoFinal = appendPersonalizacaoObservacao(observacaoFinal, norm);

        // Recalculo server-side se preco_por_letra esta configurado
        const precoPorLetra = cfg.preco_por_letra != null ? Number(cfg.preco_por_letra) : null;
        if (precoPorLetra != null && precoPorLetra > 0) {
          const calc = calcularPrecoPorLetra(
            { ...config, preco_por_letra: precoPorLetra },
            valor,
            body.pct_desconto ?? 0,
            body.quantidade ?? 1,
            body.pct_comissao ?? 0,
          );
          if (calc) {
            precoListaFinal    = calc.preco_lista;
            precoUnitarioFinal = calc.preco_unitario;
            totalItemFinal     = calc.total_item;
            valorComissaoFinal = calc.valor_comissao;
          }
        }

        // Recalculo server-side de peso_estimado se peso_por_letra esta configurado
        const pesoPorLetra = cfg.peso_por_letra != null ? Number(cfg.peso_por_letra) : null;
        if (pesoPorLetra != null && pesoPorLetra > 0) {
          const pesoCalc = calcularPesoPorLetra(
            { ...config, peso_por_letra: pesoPorLetra },
            valor,
          );
          if (pesoCalc != null) {
            pesoEstimadoFinal = pesoCalc;
          }
        }
      }
    }
  }

  const [novoItem] = await sql`
    INSERT INTO alissonerp.itens_venda_erp (
      venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista,
      pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao,
      peso_estimado, observacao, personalizacao
    ) VALUES (
      ${vendaId},
      ${body.produto_id ?? null},
      ${body.nome_produto},
      ${body.sku ?? null},
      ${body.quantidade},
      ${precoListaFinal},
      ${body.pct_desconto ?? 0},
      ${precoUnitarioFinal},
      ${totalItemFinal},
      ${body.pct_comissao ?? 0},
      ${valorComissaoFinal},
      ${pesoEstimadoFinal},
      ${observacaoFinal},
      ${personalizacaoJson ? sql.json(personalizacaoJson as never) : null}
    )
    RETURNING id
  `;

  // Se novo item tem desconto >30% numa venda em rascunho, invalida aprovação anterior
  if (venda.situacao === "rascunho" && (body.pct_desconto ?? 0) > 30) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET desconto_aprovado_por           = NULL,
          desconto_aprovado_em            = NULL,
          desconto_revalidacao_necessaria = true,
          updated_at                      = NOW()
      WHERE id = ${vendaId}
    `;
    await sql`
      UPDATE alissonerp.tarefas
      SET status = 'cancelado', updated_at = NOW()
      WHERE venda_id = ${vendaId}
        AND status = 'aguardando_aprovacao'
        AND tags @> ARRAY['aprovacao_desconto']::text[]
    `.catch((err) => console.error("[vendas/itens] tarefa cancel falhou", err));
  }

  return NextResponse.json({ id: novoItem.id }, { status: 201 });
}
