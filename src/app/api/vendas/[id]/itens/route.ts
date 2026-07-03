import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { isFullAccess } from "@/lib/roles";
import {
  validarPersonalizacao,
  normalizarPersonalizacao,
  appendPersonalizacaoObservacao,
  calcularPrecoPorLetra,
  calcularPesoPorLetra,
  type ConfigPersonalizacao,
  type CaracteresPermitidos,
} from "@/lib/personalizacao-validacao";
import { zodError, IdSchema } from "@/lib/schemas/common";
import { LIMITS } from "@/lib/payload-limits";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";

// REGRA DE NEGOCIO: helpers de rodio centralizados em src/lib/servico-rodio.ts
// Frente B do Plano de Acao (30/05/2026) — nao duplicar estas funcoes nos endpoints.
import { normalizarTextoBusca, isServicoRodio, round2, getPctRodio } from "@/lib/servico-rodio";

const VendaItemPostSchema = z.object({
  produto_id: IdSchema.nullable().optional(),
  nome_produto: z.string().min(1, "nome_produto obrigatório").max(LIMITS.NOME_MAX),
  sku: z.string().max(100).nullable().optional(),
  quantidade: z.number().int().min(1, "Quantidade inválida"),
  preco_lista: z.number().nonnegative(),
  pct_desconto: z.number().min(0).max(100),
  preco_unitario: z.number().nonnegative(),
  total_item: z.number().nonnegative(),
  pct_comissao: z.number().min(0).max(100),
  valor_comissao: z.number().nonnegative(),
  peso_estimado: z.number().nullable().optional(),
  observacao: z.string().max(LIMITS.OBSERVACOES_MAX).nullable().optional(),
  personalizacao: z.record(z.string(), z.unknown()).nullable().optional(),
}).passthrough();

async function checkOwnership(userId: string, vendaId: number): Promise<{ role: string; mxDesconto: number }> {
  const [u] = await sql<{ role: string; mx_desconto_permitido: number | null }[]>`
    SELECT role, mx_desconto_permitido FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
  return { role: u.role, mxDesconto: Number(u.mx_desconto_permitido ?? 0) };
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
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda já aprovada. Não é possível adicionar itens." }, { status: 409 });
  }

  // Onda 1D: bloqueia consultora de adicionar item em venda alheia
  let userRole: string;
  let userMxDesconto: number;
  try {
    const own = await checkOwnership(user.id, vendaId);
    userRole = own.role;
    userMxDesconto = own.mxDesconto;
  }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = VendaItemPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as {
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

  // ── Gate de desconto (v2.60.4): bloqueia vendedora/gerente de ultrapassar
  // mx_desconto_permitido. Espelha a regra que já existia em /api/orcamento
  // (linha 151-165) — antes, venda direta de peça pronta aceitava qualquer
  // desconto. Agora ambos os caminhos usam a MESMA regra. Admin/desenvolvedor/
  // diretor (isFullAccess) podem ultrapassar. Retorna 403+solicitar:true pra
  // engatar no fluxo de solicitação de alteração.
  const descAplicado = Number(body.pct_desconto ?? 0);
  if (!isFullAccess(userRole) && Number.isFinite(descAplicado) && descAplicado > userMxDesconto) {
    return NextResponse.json(
      {
        error: `Desconto ${descAplicado}% excede seu limite (${userMxDesconto}%). Solicite aprovação.`,
        solicitar: true,
      },
      { status: 403 },
    );
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

  // ── Produto Upgrade: deteccao e recalculo server-side ────────────
  // REGRA DE NEGOCIO: Produto Upgrade — cliente entrega metal (ouro),
  // paga mao de obra por grama. O valor do item e calculado como
  // peso_gramas × valor_por_grama. A quebra e informativa (nao afeta
  // o cofre). Foto da balanca e obrigatoria.
  // IMPACTO SE REMOVIDO: itens upgrade adicionados pelo detalhe da
  // venda viram itens normais sem validacao de peso/foto e sem
  // recalculo de valor.
  let upgradeData: {
    peso_gramas: number;
    peso_liquido: number;
    quebra_percentual: number;
    valor_por_grama: number;
    foto_balanca_path: string;
  } | null = null;

  // REGRA DE NEGOCIO (Ródio automático):
  // O que: serviço de ródio sempre calcula no backend como 30% do preço da joia base.
  // Por que: elimina cálculo manual e garante consistência entre consultoras.
  // Impacto: sem este bloco, o preço do ródio volta a depender do valor digitado no frontend.
  if (body.produto_id) {
    const [metaProduto] = await sql`
      SELECT p.sku, p.nome, ti.tipo_item, psc.pct_calculo_servico
      FROM public.produtos p
      LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
      LEFT JOIN public.produtos_servico_config psc ON psc.id_produto = p.id_produto
      WHERE p.id_produto = ${body.produto_id}
      LIMIT 1
    `;
    const ehServicoRodio =
      (metaProduto?.tipo_item === "servico" || normalizarTextoBusca(typeof metaProduto?.sku === "string" ? metaProduto.sku : null) === "srv-rodio") &&
      isServicoRodio(
        typeof metaProduto?.sku === "string" ? metaProduto.sku : null,
        typeof metaProduto?.nome === "string" ? metaProduto.nome : null,
      );
    if (ehServicoRodio) {
      const skuBase = typeof body.personalizacao?.valor === "string" ? body.personalizacao.valor.trim() : "";
      if (!skuBase) {
        return NextResponse.json(
          { error: "Servico de rodio exige SKU base da joia" },
          { status: 400 },
        );
      }

      const [baseRow] = await sql`
        SELECT p.id_produto, p.sku, p.nome, v.preco_venda
        FROM public.produtos p
        LEFT JOIN alissonerp.vw_produtos_geral_preco v ON v.id_produto = p.id_produto
        WHERE LOWER(p.sku) = LOWER(${skuBase})
          AND p.situacao = 'A'
        LIMIT 1
      `;
      const precoBase = baseRow?.preco_venda != null ? Number(baseRow.preco_venda) : null;
      if (!baseRow || precoBase == null || !Number.isFinite(precoBase) || precoBase <= 0) {
        return NextResponse.json(
          { error: `SKU base \"${skuBase}\" inválido para serviço de ródio (sem preço vigente)` },
          { status: 400 },
        );
      }

      const pctRodio = getPctRodio({ pct_calculo_servico: metaProduto?.pct_calculo_servico });
      const precoRodio = round2(precoBase * pctRodio);
      const qtdRodio = Math.max(1, Number(body.quantidade) || 1);
      const totalRodio = round2(precoRodio * qtdRodio);
      const pctComissaoRodio = Number(body.pct_comissao ?? 0);
      const valorComissaoRodio = round2(totalRodio * (pctComissaoRodio / 100));

      precoListaFinal = precoRodio;
      precoUnitarioFinal = precoRodio;
      totalItemFinal = totalRodio;
      valorComissaoFinal = valorComissaoRodio;
      personalizacaoJson = { valor: String(baseRow.sku) };
      const pctExibicao = Math.round(pctRodio * 100);
      const linhaRodio = `Ródio ${pctExibicao}% - Base: ${String(baseRow.sku).toUpperCase()} - Preço base: R$ ${precoBase.toFixed(2)}`;
      observacaoFinal = [
        observacaoFinal?.trim() || "",
        observacaoFinal?.includes(linhaRodio) ? "" : linhaRodio,
      ].filter(Boolean).join("\n");
    }
  }

  // ── Produto Upgrade: deteccao e validacao ─────────────────────────
  // REGRA DE NEGOCIO: mesma logica do POST /api/vendas (route.ts),
  // verifica config de upgrade do produto e recalcula valores.
  if (body.produto_id) {
    const [upgradeCfg] = await sql`
      SELECT valor_por_grama, quebra_percentual
      FROM alissonerp.produto_upgrade_config
      WHERE produto_id = ${body.produto_id} AND ativo = true
    `;

    if (upgradeCfg) {
      const upgRaw = (raw as Record<string, unknown>).upgrade;

      if (!upgRaw || typeof upgRaw !== "object") {
        return NextResponse.json(
          { error: `Item upgrade "${body.sku ?? body.nome_produto}" exige dados de upgrade (peso, foto)` },
          { status: 400 },
        );
      }

      const upg = upgRaw as Record<string, unknown>;
      const pesoGramas = Number(upg.peso_gramas ?? 0);
      const fotoBalanca = typeof upg.foto_balanca_path === "string"
        ? upg.foto_balanca_path.trim()
        : null;

      if (!pesoGramas || pesoGramas <= 0) {
        return NextResponse.json(
          { error: `Peso do metal e obrigatorio para upgrade "${body.sku ?? body.nome_produto}"` },
          { status: 400 },
        );
      }

      if (!fotoBalanca || fotoBalanca.length === 0) {
        return NextResponse.json(
          { error: `Foto da balanca e obrigatoria para upgrade "${body.sku ?? body.nome_produto}"` },
          { status: 400 },
        );
      }

      const valorPorGrama = Number(upgradeCfg.valor_por_grama);
      const quebraPct = Number(upgradeCfg.quebra_percentual);
      const pesoLiquido = Math.round(pesoGramas * (1 - quebraPct / 100) * 10000) / 10000;
      const valorCalculado = Math.round(pesoGramas * valorPorGrama * 100) / 100;
      const totalUpgrade = Math.round(valorCalculado * (Number(body.quantidade) || 1) * 100) / 100;
      const pctComUpgrade = Number(body.pct_comissao ?? 0);
      const comissaoUpgrade = Math.round(totalUpgrade * (pctComUpgrade / 100) * 100) / 100;

      // Sobrescreve valores do item com o calculo do upgrade
      precoListaFinal    = valorCalculado;
      precoUnitarioFinal = valorCalculado;
      totalItemFinal     = totalUpgrade;
      valorComissaoFinal = comissaoUpgrade;
      pesoEstimadoFinal  = pesoGramas;

      upgradeData = {
        peso_gramas: pesoGramas,
        peso_liquido: pesoLiquido,
        quebra_percentual: quebraPct,
        valor_por_grama: valorPorGrama,
        foto_balanca_path: fotoBalanca,
      };
    }
  }

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

  // ── Server-side elegibilidade: produto sem estoque + reposição inativa não pode ser vendido ──
  // REGRA DE NEGÓCIO (correção URGENTE 07/2026 — PROBLEMA 2): revalida no servidor para evitar
  // bypass pela busca direta por SKU/RFID.
  if (body.produto_id) {
    const [eleg] = await sql`
      SELECT
        COALESCE(ecc.controla_estoque, true) AS controla_estoque,
        COALESCE(est.saldo, 0)::float8 AS saldo,
        (prc.ativo = true) AS reposicao_ativa
      FROM public.produtos p
      LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
      LEFT JOIN (
        SELECT produto_id, SUM(disponivel)::float8 AS saldo
        FROM alissonerp.vw_saldo_estoque_comercial
        GROUP BY produto_id
      ) est ON est.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_reposicao_config prc ON prc.produto_id = p.id_produto AND prc.ativo = true
      WHERE p.id_produto = ${body.produto_id}
      LIMIT 1
    `;
    if (eleg && Boolean(eleg.controla_estoque) && Number(eleg.saldo) <= 0 && !Boolean(eleg.reposicao_ativa)) {
      return NextResponse.json(
        { error: `"${body.nome_produto}" (${body.sku ?? 'sem SKU'}) não pode ser vendido: sem estoque e sem reposição ativa.` },
        { status: 409 },
      );
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

  // ── Item upgrade: grava snapshot dos dados do metal ────────────────
  // REGRA DE NEGOCIO: Os dados do upgrade (peso, quebra, foto) sao
  // congelados no momento do item. Se a config mudar depois, itens
  // antigos mantem os valores originais. cofre_registrado = false
  // ate a venda ser aprovada.
  if (upgradeData) {
    await sql`
      INSERT INTO alissonerp.itens_venda_upgrade (
        item_venda_id, peso_gramas, peso_liquido,
        quebra_percentual, valor_por_grama, foto_balanca_path
      ) VALUES (
        ${novoItem.id},
        ${upgradeData.peso_gramas},
        ${upgradeData.peso_liquido},
        ${upgradeData.quebra_percentual},
        ${upgradeData.valor_por_grama},
        ${upgradeData.foto_balanca_path}
      )
    `;
  }

  // Se novo item tem desconto > threshold numa venda em rascunho, invalida aprovação anterior
  const thresholdNovoItem = await getDescontoThreshold(vendaId);
  if (venda.situacao === "rascunho" && (body.pct_desconto ?? 0) > thresholdNovoItem) {
    // BUG FIX (jun/2026, venda 15628): captura o ponteiro da tarefa ANTES de zerar.
    // Soltar aprovacao_desconto_tarefa_id é obrigatório — senão, se a tarefa antiga
    // já estava 'aprovada', o front esconde o botão de solicitar e o banner de
    // aguardando, e a venda trava em rascunho sem como reaprovar.
    const [vDesc] = await sql`
      SELECT aprovacao_desconto_tarefa_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const tarefaAnteriorId = vDesc?.aprovacao_desconto_tarefa_id as number | null;
    await sql`
      UPDATE alissonerp.vendas_erp
      SET desconto_aprovado_por           = NULL,
          desconto_aprovado_em            = NULL,
          aprovacao_desconto_tarefa_id    = NULL,
          desconto_revalidacao_necessaria = true,
          updated_at                      = NOW()
      WHERE id = ${vendaId}
    `;
    // Cancela a tarefa vinculada SÓ se ainda estava pendente. Mira pelo ID (o filtro
    // por tag 'aprovacao_desconto' antigo nunca batia: a tag real é 'aprov_desconto_acima').
    if (tarefaAnteriorId) {
      await sql`
        UPDATE alissonerp.tarefas
        SET status = 'cancelado', updated_at = NOW()
        WHERE id = ${tarefaAnteriorId}
          AND status = 'aguardando_aprovacao'
      `.catch((err) => console.error("[vendas/itens] tarefa cancel falhou", err));
    }
  }

  return NextResponse.json({ id: novoItem.id }, { status: 201 });
}
