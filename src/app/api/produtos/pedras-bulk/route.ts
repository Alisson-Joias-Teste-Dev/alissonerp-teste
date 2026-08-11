/**
 * POST /api/produtos/pedras-bulk
 *
 * Cadastra pedras preciosas em massa como produtos independentes.
 * Cada item vira uma linha em public.produtos + alissonerp.erp_produtos.
 *
 * Convenções (pedra = produto simples, não variação):
 *   • categoria      = 'Pedras'
 *   • tipo_metal     = NULL  (trigger atualizar_preco_produto deixa preco_sync NULL)
 *   • peso_precificado = ct * 0.2  (1 ct = 0.2 g)
 *   • markup / fator   = 1         (preço final vem de preco_tiny)
 *   • preco_tiny       = preço de venda calculado
 *   • tem_pedra_preciosa = true
 *   • eh_pai = eh_variacao = false
 *   • nome = "{Label} {mm}mm" (ex: "Diamante Natural 1.5mm")
 *   • sku  = auto-gerado sequencial (mesma regra do POST /api/produtos)
 *
 * Dedup: se já existir produto com mesmo nome + categoria='Pedras' +
 * situacao='A', pula (registra em `pulados`).
 *
 * Body:
 * {
 *   qtd_inicial?: number;   // saldo a adicionar em public.estoque para cada pedra criada
 *   itens: Array<{
 *     tipo: string;      // ex: "diamante" | "rubi" | ... (só para compor o nome via label)
 *     label: string;     // ex: "Diamante Natural"
 *     mm: number;        // ex: 1.5
 *     ct: number;        // ex: 0.015
 *     preco_venda: number; // R$ já calculado no cliente
 *   }>
 * }
 *
 * Resposta:
 * { ok, criados: number, pulados: Array<{ nome, motivo }>, produtos: Array<{ sku, nome, preco_tiny }> }
 *
 * ----------------------------------------------------------------
 * GET /api/produtos/pedras-bulk — diagnóstico
 * Retorna contagem de produtos já cadastrados com categoria='Pedras'
 * agrupados por label. Útil para validar rapidamente se os INSERTs
 * chegaram ao banco (sem depender do filtro da listagem).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

interface PedraItem {
  tipo: string;
  label: string;
  mm: number;
  ct: number;
  preco_venda: number;
}

const MAX_BATCH = 200;

const PedraBulkPostSchema = z.object({
  qtd_inicial: z.coerce.number().optional(),
  itens: z.array(z.object({}).passthrough()).min(1, "itens obrigatório").max(MAX_BATCH),
}).passthrough();

const PedraBulkPatchSchema = z.object({
  qtd: z.coerce.number().optional(),
}).passthrough();

const PedraBulkDeleteSchema = z.object({
  label: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = PedraBulkPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const itensRaw: unknown = body.itens;
  const qtdInicial = Math.max(0, Number(body.qtd_inicial ?? 0) | 0);

  // Sanitiza e valida
  const itens: PedraItem[] = [];
  for (const raw of itensRaw as Record<string, unknown>[]) {
    const tipo = String(raw?.tipo ?? "").trim();
    const label = String(raw?.label ?? "").trim();
    const mm = Number(raw?.mm);
    const ct = Number(raw?.ct);
    const preco_venda = Number(raw?.preco_venda);
    if (!tipo || !label) continue;
    if (!Number.isFinite(mm) || mm <= 0) continue;
    if (!Number.isFinite(ct) || ct <= 0) continue;
    if (!Number.isFinite(preco_venda) || preco_venda <= 0) continue;
    itens.push({ tipo, label, mm, ct, preco_venda });
  }

  if (itens.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido recebido" }, { status: 400 });
  }

  try {
    const pulados: Array<{ nome: string; motivo: string }> = [];
    const produtos: Array<{ sku: string; nome: string; preco_tiny: number; id_produto: number }> = [];
    const atualizados: Array<{ sku: string; nome: string; preco_antes: number; preco_depois: number }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: any) => {
      // Pega próximo SKU numérico considerando AMBAS as tabelas.
      // erp_produtos pode ter SKUs órfãos de DELETEs parciais anteriores,
      // causando colisão com a UNIQUE erp_produtos_sku_key se olhássemos só public.
      // FIX: ignora SKUs >= 90000000 (produtos "(saldo inicial)" da migração,
      // placeholders — não SKUs reais). Sem esse filtro o próximo SKU saía gigante
      // (ex: 90000056) em vez de seguir a sequência normal da loja (mesmo bug já
      // corrigido em peca-avulsa; achado no lote de Moissanita 2.6–5.0mm).
      const [skuRow] = await tx<{ next: number }[]>`
        SELECT (COALESCE(
          GREATEST(
            (SELECT MAX(sku::integer) FROM public.produtos         WHERE sku ~ '^[0-9]+$' AND sku::bigint < 90000000),
            (SELECT MAX(sku::integer) FROM alissonerp.erp_produtos WHERE sku ~ '^[0-9]+$' AND sku::bigint < 90000000)
          ),
          1603
        ) + 1)::int AS next
      `;
      let proxSku = Number(skuRow?.next ?? 1604);

      for (const it of itens) {
        // Nome padronizado com 1 casa decimal fixa (ex: "Rubi 1.5mm")
        const mmFmt = Number.isInteger(it.mm) ? it.mm.toFixed(1) : String(it.mm);
        const nome = `${it.label} ${mmFmt}mm`;

        // Se já existe (mesmo nome + categoria Pedras), não cria novo:
        // atualiza preço + peso_ct no produto existente.
        const [dup] = await tx<{ id_produto: string; sku: string; preco_tiny: string | null }[]>`
          SELECT id_produto, sku, preco_tiny FROM public.produtos
          WHERE LOWER(TRIM(nome)) = LOWER(${nome})
            AND situacao = 'A'
            AND categoria ILIKE 'Pedras%'
          LIMIT 1
        `;
        if (dup) {
          const precoAntes = Number(dup.preco_tiny ?? 0);
          const novoPreco = Math.round(Number(it.preco_venda));
          if (Math.abs(precoAntes - novoPreco) >= 0.5) {
            await tx`UPDATE alissonerp.erp_produtos SET preco_tiny = ${novoPreco} WHERE produto_id = ${dup.id_produto}`;
          }
          await tx`
            INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
            VALUES (${dup.id_produto}, ${Number(it.ct.toFixed(4))})
            ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
          `;
          atualizados.push({ sku: dup.sku, nome, preco_antes: precoAntes, preco_depois: novoPreco });
          continue;
        }

        // Garante SKU único em AMBAS as tabelas (public.produtos e erp_produtos).
        let sku = String(proxSku);
         
        while (true) {
          const [ex] = await tx`
            SELECT 1
            WHERE EXISTS (SELECT 1 FROM public.produtos         WHERE sku = ${sku})
               OR EXISTS (SELECT 1 FROM alissonerp.erp_produtos WHERE sku = ${sku})
          `;
          if (!ex) break;
          proxSku += 1;
          sku = String(proxSku);
        }

        const pesoG = Math.max(Number((it.ct * 0.2).toFixed(4)), 0.0001);
        const precoTiny = Math.round(Number(it.preco_venda));

        // Próximo produto_id
        const [seq] = await tx<{ id: string }[]>`
          SELECT nextval('alissonerp.seq_produto_id') AS id
        `;
        const paiId = Number(seq.id);

        // FIX: antes eram DOIS INSERT no mesmo produto_id (o 2o violava o indice
        // UNIQUE de produto_id em erp_produtos) -> transacao inteira cancelava e
        // NENHUMA pedra do lote era criada (mesmo bug ja corrigido em peca-avulsa).
        // Agora 1 INSERT so, com todas as colunas.
        await tx`
          INSERT INTO alissonerp.erp_produtos
            (produto_id, sku, nome, tipo_metal, situacao,
             peso_precificado, markup, fator,
             categoria_precificacao, categoria, tem_pedra_preciosa,
             preco_tiny, eh_pai, eh_variacao)
          VALUES
            (${paiId}, ${sku}, ${nome}, ${null}, 'A',
             ${pesoG}, 1, 1,
             ${null}, 'Pedras', true,
             ${precoTiny}, false, false)
        `;

        // Marca 'insumo' - sem ela a pedra NAO entra na vw_pedras_preco (some da
        // vitrine/orcamento) nem fica com o mesmo comportamento de estoque das
        // outras pedras do catalogo (mesma regra do peca-avulsa).
        await tx`
          INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
          SELECT ${paiId}, 'insumo'
          WHERE NOT EXISTS (
            SELECT 1 FROM alissonerp.produto_tipo_item
            WHERE produto_id = ${paiId} AND tipo_item = 'insumo'
          )
        `;

        // Peso real (em ct) — public.produtos.peso_precificado é arredondado
        // pelo trigger arredondar_peso_para_cima; guardamos o ct fiel aqui.
        await tx`
          INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
          VALUES (${paiId}, ${Number(it.ct.toFixed(4))})
          ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
        `;

        // Saldo inicial em public.estoque (se solicitado).
        // Necessário para a pedra aparecer na listagem /produtos com
        // o filtro "Apenas com estoque" ligado (padrão da UI).
        //
        // NOTA: public.estoque.sku não tem UNIQUE constraint, então não
        // dá pra usar ON CONFLICT — fazemos UPSERT manual.
        if (qtdInicial > 0) {
          const updRes = await tx`
            UPDATE public.estoque
            SET saldo        = saldo        + ${qtdInicial},
                estoque_loja = estoque_loja + ${qtdInicial}
            WHERE sku = ${sku}
          `;
          if ((updRes.count ?? 0) === 0) {
            await tx`
              INSERT INTO public.estoque (sku, saldo, estoque_loja)
              VALUES (${sku}, ${qtdInicial}, ${qtdInicial})
            `;
          }
        }

        produtos.push({ sku, nome, preco_tiny: precoTiny, id_produto: paiId });
        proxSku += 1;
      }
    });

    return NextResponse.json(
      {
        ok: true,
        criados: produtos.length,
        atualizados: atualizados.length,
        pulados,
        produtos,
        mudancas: atualizados,
      },
      { status: 201 }
    );
  } catch (err) {
    return internalError("[POST /api/produtos/pedras-bulk]", err, "Erro ao cadastrar pedras");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET — Diagnóstico rápido: conta pedras já cadastradas no catálogo.
// Ignora filtros da listagem (esconder_insumos, apenas_com_estoque) para
// permitir verificar se os INSERTs chegaram ao banco mesmo quando o filtro
// da tela está escondendo.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const [totais] = await sql<{ total: number; com_estoque: number }[]>`
      SELECT
        COUNT(*)::int                                                           AS total,
        COUNT(*) FILTER (WHERE COALESCE(e.saldo, 0) >= 1)::int                  AS com_estoque
      FROM public.produtos p
      LEFT JOIN public.estoque e ON e.sku = p.sku
      WHERE p.categoria ILIKE 'Pedras%'
        AND p.situacao = 'A'
    `;

    // Agrupa por label: remove o sufixo " {mm}mm" do nome, pega o resto.
    const porLabel = await sql<{ nome_raiz: string; qtd: number }[]>`
      SELECT
        TRIM(REGEXP_REPLACE(p.nome, '\\s+[0-9.,]+\\s*mm\\s*$', '', 'i')) AS nome_raiz,
        COUNT(*)::int AS qtd
      FROM public.produtos p
      WHERE p.categoria ILIKE 'Pedras%'
        AND p.situacao = 'A'
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    const ultimos = await sql<{ sku: string; nome: string; preco_tiny: number | null; saldo: number | null }[]>`
      SELECT p.sku, p.nome, p.preco_tiny, COALESCE(e.saldo, 0) AS saldo
      FROM public.produtos p
      LEFT JOIN public.estoque e ON e.sku = p.sku
      WHERE p.categoria ILIKE 'Pedras%'
        AND p.situacao = 'A'
      ORDER BY p.id_produto DESC
      LIMIT 20
    `;

    return NextResponse.json({
      total: Number(totais?.total ?? 0),
      com_estoque: Number(totais?.com_estoque ?? 0),
      por_label: porLabel,
      ultimos,
    });
  } catch (err) {
    return internalError("[GET /api/produtos/pedras-bulk]", err, "Erro ao consultar pedras");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH — Garante saldo >= qtd em public.estoque para todas as pedras ativas
// do catálogo. Útil quando pedras foram cadastradas com qtd_inicial=0 e
// estão invisíveis na listagem por causa do filtro "Apenas com estoque".
//
// Body: { qtd?: number }  (default 1)
// Retorna: { atualizados: number, pedras_sem_saldo_antes: number }
// ────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = PedraBulkPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const qtd = Math.max(1, Number(parsedPatch.data.qtd ?? 1) | 0);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: any) => {
      // Lista pedras ativas
      const pedras = await tx<{ sku: string }[]>`
        SELECT sku FROM public.produtos
        WHERE categoria ILIKE 'Pedras%' AND situacao = 'A'
      `;
      if (pedras.length === 0) return { atualizados: 0, pedras_sem_saldo_antes: 0 };

      const skus = pedras.map((p: { sku: string }) => p.sku);

      // Quantas estavam sem saldo antes (para reporting)
      const [before] = await tx<{ zeradas: number }[]>`
        SELECT
          (COUNT(*) FILTER (WHERE e.sku IS NULL OR COALESCE(e.saldo, 0) = 0))::int AS zeradas
        FROM public.produtos p
        LEFT JOIN public.estoque e ON e.sku = p.sku
        WHERE p.sku = ANY(${skus})
      `;

      // UPSERT manual: public.estoque.sku não tem UNIQUE, então não dá pra
      // usar ON CONFLICT. Fazemos UPDATE; se nenhum linha foi afetada, INSERT.
      // Se houver múltiplas linhas em estoque pelo mesmo sku (caso legado),
      // o UPDATE sobe o saldo de TODAS — não usamos LIMIT aqui de propósito.
      let atualizados = 0;
      for (const s of skus) {
        const updRes = await tx`
          UPDATE public.estoque
          SET saldo        = GREATEST(saldo,        ${qtd}),
              estoque_loja = GREATEST(estoque_loja, ${qtd})
          WHERE sku = ${s}
        `;
        if ((updRes.count ?? 0) === 0) {
          await tx`
            INSERT INTO public.estoque (sku, saldo, estoque_loja)
            VALUES (${s}, ${qtd}, ${qtd})
          `;
        }
        atualizados += 1;
      }

      return {
        atualizados,
        pedras_sem_saldo_antes: Number(before?.zeradas ?? 0),
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return internalError("[PATCH /api/produtos/pedras-bulk]", err, "Erro ao ajustar saldo");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE — Exclusão em massa de pedras cadastradas.
//
// Escopo restrito: só exclui produtos com categoria ILIKE 'Pedras%'.
// Remove de cascata:
//   1. public.estoque     (saldo)
//   2. alissonerp.erp_produtos
//   3. public.produtos
//
// Modos:
//   body: { label?: string }
//     - label fornecido     → exclui só pedras cujo nome comece com esse label
//                             (ex: "Diamante Natural" exclui "Diamante Natural 1.0mm"..."2.5mm")
//     - label ausente/''    → exclui TODAS as pedras ativas
//
// Segurança:
//   - WHERE com categoria ILIKE 'Pedras%' é a única cláusula que protege o
//     resto do catálogo; MANTER SEMPRE.
//   - Operação em transação.
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rawDel = await req.json().catch(() => ({}));
  const parsedDel = PedraBulkDeleteSchema.safeParse(rawDel);
  if (!parsedDel.success) return zodError(parsedDel.error);
  const labelRaw = String(parsedDel.data.label ?? "").trim();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: any) => {
      // Lista alvo (SKUs + ids) — sempre restrita a categoria Pedras.
      const alvos = labelRaw
        ? await tx<{ sku: string; id_produto: number }[]>`
            SELECT sku, id_produto
            FROM public.produtos
            WHERE categoria ILIKE 'Pedras%'
              AND LOWER(TRIM(nome)) LIKE LOWER(${labelRaw + " %"} || '%')
          `
        : await tx<{ sku: string; id_produto: number }[]>`
            SELECT sku, id_produto
            FROM public.produtos
            WHERE categoria ILIKE 'Pedras%'
          `;

      if (alvos.length === 0) {
        return { excluidos: 0, inativados: 0, skus: [] as string[] };
      }

      const allIds  = alvos.map((a: { id_produto: number }) => a.id_produto);
      const allSkus = alvos.map((a: { sku: string }) => a.sku);

      // Identifica quais alvos têm referência em vendas (não dá pra deletar — só inativar).
      const referenciados = await tx<{ id_produto: number }[]>`
        SELECT DISTINCT produto_id AS id_produto
        FROM alissonerp.itens_venda_erp
        WHERE produto_id = ANY(${allIds})
      `.catch(() =>
        tx<{ id_produto: number }[]>`
          SELECT DISTINCT produto_id AS id_produto
          FROM public.itens_venda
          WHERE produto_id = ANY(${allIds})
        `.catch(() => [] as { id_produto: number }[])
      );
      const idsRef = new Set(referenciados.map((r: { id_produto: number }) => Number(r.id_produto)));
      const idsDel = allIds.filter((id: number) => !idsRef.has(Number(id)));
      const idsInativar = allIds.filter((id: number) => idsRef.has(Number(id)));
      const skusDel = alvos.filter((a: { id_produto: number; sku: string }) => !idsRef.has(Number(a.id_produto))).map((a: { sku: string }) => a.sku);
      const etapas: string[] = [];

      // ── Inativar pedras com referência em vendas (preserva FK) ────────────
      if (idsInativar.length > 0) {
        try {
          await tx`
            UPDATE alissonerp.erp_produtos
            SET situacao = 'I'
            WHERE produto_id = ANY(${idsInativar})
              AND categoria ILIKE 'Pedras%'
          `;
          etapas.push(`inativadas: ${idsInativar.length}`);
        } catch (e) {
          etapas.push(`inativar: ${e instanceof Error ? e.message : "erro"}`);
          throw new Error(`Falha ao inativar: ${e instanceof Error ? e.message : e}`);
        }
      }

      // ── Deletar pedras sem referência ──────────────────────────────────────
      if (idsDel.length > 0) {
        // 1. Saldo em public.estoque
        try {
          await tx`DELETE FROM public.estoque WHERE sku = ANY(${skusDel})`;
          etapas.push("estoque ok");
        } catch (e) {
          etapas.push(`estoque: ${e instanceof Error ? e.message : "erro"}`);
          throw new Error(`Falha em public.estoque: ${e instanceof Error ? e.message : e}`);
        }

        // 2. Extras de pedra
        try {
          await tx`DELETE FROM alissonerp.produto_pedra_extras WHERE produto_id = ANY(${idsDel})`;
        } catch { /* tolerante */ }

        // 3. Composição (BOM) — tolerante
        try {
          await tx`DELETE FROM alissonerp.produto_composicao WHERE produto_id = ANY(${idsDel})`;
        } catch { /* tolerante */ }

        // 4. Ficha técnica — tolerante
        try {
          await tx`DELETE FROM alissonerp.fichas_tecnicas_produto WHERE produto_id = ANY(${idsDel})`;
        } catch { /* tolerante */ }

        // 5. erp_produtos
        try {
          await tx`DELETE FROM alissonerp.erp_produtos WHERE produto_id = ANY(${idsDel})`;
          etapas.push("erp_produtos ok");
        } catch (e) {
          etapas.push(`erp_produtos: ${e instanceof Error ? e.message : "erro"}`);
          throw new Error(`Falha em alissonerp.erp_produtos: ${e instanceof Error ? e.message : e}`);
        }

        // 6. public.produtos (com proteção dupla: só Pedras)
        try {
          await tx`
            DELETE FROM alissonerp.erp_produtos
            WHERE produto_id = ANY(${idsDel})
              AND categoria ILIKE 'Pedras%'
          `;
          etapas.push(`deletadas: ${idsDel.length}`);
        } catch (e) {
          etapas.push(`produtos: ${e instanceof Error ? e.message : "erro"}`);
          throw new Error(`Falha em public.produtos: ${e instanceof Error ? e.message : e}`);
        }
      }

      return {
        excluidos: idsDel.length,
        inativados: idsInativar.length,
        skus: allSkus,
        etapas,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return internalError("[DELETE /api/produtos/pedras-bulk]", err, "Erro ao excluir pedras");
  }
}
