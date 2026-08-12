/**
 * POST /api/produtos/peca-avulsa
 *
 * Cadastra UMA pedra avulsa (peça única) como produto independente.
 * Diferença do /pedras-bulk: foco em pedra única (não em lote de 30+ tamanhos)
 * e a descrição é livre, definida pelo usuário (ex: "Safira pear 3x5mm AAA").
 *
 * Fórmula: preco_venda = peso_ct * custo_usd_ct * dolar * markup
 *
 * Convenções (mesmas do pedras-bulk):
 *   • categoria       = 'Pedras'
 *   • tipo_metal      = NULL
 *   • markup / fator  = 1 (preço final vem de preco_tiny)
 *   • preco_tiny      = preço de venda calculado, arredondado p/ inteiro
 *   • tem_pedra_preciosa = false (pedra SOLTA não é "joia com pedra")
 *   • tipo_de_pedra = tipo_pedra (etiqueta; a vw_pedras_preco casa o preço por ela — mig 338)
 *   • produto_tipo_item = 'insumo' (sem isso a pedra não entra na vw_pedras_preco)
 *   • eh_pai = eh_variacao = false
 *   • peso_precificado = ct * 0.2 (1 ct = 0.2 g) — trigger arredonda pra cima
 *   • peso_ct fiel salvo em alissonerp.produto_pedra_extras
 *
 * Dedup: se já existir produto ativo com mesmo nome + categoria='Pedras',
 * atualiza preço + peso_ct e retorna criado=false.
 *
 * Body:
 * {
 *   tipo_pedra: string;     // ex: "diamante", "safira" (slug de STONE_TYPES)
 *   descricao: string;      // nome do produto (3..200 chars)
 *   peso_ct: number;        // > 0
 *   custo_usd_ct: number;   // > 0
 *   markup: number;         // > 0
 *   criar_estoque: boolean; // se true, insere/incrementa +1 em public.estoque
 * }
 *
 * Resposta 201:
 * { ok, id_produto, sku, nome, preco_venda, dolar, criado }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";

const InputSchema = z.object({
  tipo_pedra: z.string().trim().min(2),
  descricao: z.string().trim().min(3).max(200),
  peso_ct: z.number().positive(),
  custo_usd_ct: z.number().positive(),
  markup: z.number().positive(),
  criar_estoque: z.boolean(),
});

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", detalhes: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const [cot] = await sql<{ dollar: string | number | null }[]>`
      SELECT dollar FROM public.parametros LIMIT 1
    `;
    const dolar = Number(cot?.dollar ?? 0);
    if (!Number.isFinite(dolar) || dolar <= 0) {
      return NextResponse.json(
        { error: "Dólar não cadastrado em public.parametros" },
        { status: 422 },
      );
    }

    const precoVenda = Math.round(
      input.peso_ct * input.custo_usd_ct * dolar * input.markup,
    );
    if (!Number.isFinite(precoVenda) || precoVenda <= 0) {
      return NextResponse.json(
        { error: "Preço calculado inválido" },
        { status: 422 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: any) => {
      const nome = input.descricao.trim();

      // Dedup: nome (case-insensitive, trimmed) + categoria Pedras + ativo
      const [dup] = await tx<{ id_produto: string; sku: string; preco_tiny: string | null }[]>`
        SELECT id_produto, sku, preco_tiny
        FROM alissonerp.produtos_compat
        WHERE LOWER(TRIM(nome)) = LOWER(${nome})
          AND situacao = 'A'
          AND categoria ILIKE 'Pedras%'
        LIMIT 1
      `;

      if (dup) {
        const idProduto = Number(dup.id_produto);
        const precoAntes = Number(dup.preco_tiny ?? 0);
        if (Math.abs(precoAntes - precoVenda) >= 0.5) {
          await tx`
            UPDATE alissonerp.erp_produtos
            SET preco_tiny = ${precoVenda}
            WHERE produto_id = ${idProduto}
          `;
        }
        await tx`
          INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
          VALUES (${idProduto}, ${Number(input.peso_ct.toFixed(4))})
          ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
        `;

        if (input.criar_estoque) {
          await upsertEstoque(tx, dup.sku, 1);
        }

        return {
          id_produto: idProduto,
          sku: dup.sku,
          nome,
          criado: false,
        };
      }

      // Próximo SKU único em AMBAS as tabelas.
      // REGRA: ignora SKUs >= 90000000 — são produtos "(saldo inicial)" da migração
      // (placeholders), não SKUs reais. Sem esse filtro o próximo SKU saía gigante
      // (ex: 90000056) em vez de seguir a sequência normal da loja (~1845).
      const [skuRow] = await tx<{ next: number }[]>`
        SELECT (COALESCE(
          GREATEST(
            (SELECT MAX(sku::integer) FROM alissonerp.produtos_compat WHERE sku ~ '^[0-9]+$' AND sku::bigint < 90000000),
            (SELECT MAX(sku::integer) FROM alissonerp.erp_produtos   WHERE sku ~ '^[0-9]+$' AND sku::bigint < 90000000)
          ),
          1603
        ) + 1)::int AS next
      `;
      let proxSku = Number(skuRow?.next ?? 1604);
      let sku = String(proxSku);
      while (true) {
        const [ex] = await tx`
          SELECT 1
          WHERE EXISTS (SELECT 1 FROM alissonerp.produtos_compat WHERE sku = ${sku})
             OR EXISTS (SELECT 1 FROM alissonerp.erp_produtos WHERE sku = ${sku})
        `;
        if (!ex) break;
        proxSku += 1;
        sku = String(proxSku);
      }

      const pesoG = Math.max(Number((input.peso_ct * 0.2).toFixed(4)), 0.0001);

      const [seq] = await tx<{ id: string }[]>`
        SELECT nextval('alissonerp.seq_produto_id') AS id
      `;
      const idProduto = Number(seq.id);

      // FIX: antes eram DOIS INSERT no mesmo produto_id (o 2o violava o indice UNIQUE
      // de produto_id criado pela migracao de produtos -> "erro ao cadastrar"). Agora 1
      // INSERT so, com todas as colunas. Tambem: tem_pedra_preciosa=false (pedra SOLTA
      // nao e "joia com pedra") e tipo_de_pedra=etiqueta (a vw_pedras_preco casa o preco
      // por ela - mig 338); eh_pai/eh_variacao no mesmo insert.
      await tx`
        INSERT INTO alissonerp.erp_produtos
          (produto_id, sku, nome, tipo_metal, situacao,
           peso_precificado, markup, fator,
           categoria_precificacao, categoria, tem_pedra_preciosa, tipo_de_pedra,
           preco_tiny, eh_pai, eh_variacao)
        VALUES
          (${idProduto}, ${sku}, ${nome}, ${null}, 'A',
           ${pesoG}, 1, 1,
           ${null}, 'Pedras', false, ${input.tipo_pedra},
           ${precoVenda}, false, false)
      `;

      // Marca 'insumo' - sem ela a pedra NAO entra na vw_pedras_preco (some da vitrine/orcamento).
      await tx`
        INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
        SELECT ${idProduto}, 'insumo'
        WHERE NOT EXISTS (
          SELECT 1 FROM alissonerp.produto_tipo_item
          WHERE produto_id = ${idProduto} AND tipo_item = 'insumo'
        )
      `;

      // Pedra solta = insumo: NAO usa o controle de estoque comercial (reserva/baixa
      // de venda) — saldo proprio em public.estoque. Sem essa linha, o padrao
      // (COALESCE true) mostra "controla estoque" errado pra pedra recem-criada
      // (mesmo achado do cadastro em lote, 11/08).
      await tx`
        INSERT INTO alissonerp.estoque_comercial_config (produto_id, controla_estoque, ativo)
        VALUES (${idProduto}, false, true)
        ON CONFLICT (produto_id) DO NOTHING
      `;

      await tx`
        INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
        VALUES (${idProduto}, ${Number(input.peso_ct.toFixed(4))})
        ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
      `;

      if (input.criar_estoque) {
        await upsertEstoque(tx, sku, 1);
      }

      return { id_produto: idProduto, sku, nome, criado: true };
    });

    return NextResponse.json(
      {
        ok: true,
        id_produto: result.id_produto,
        sku: result.sku,
        nome: result.nome,
        preco_venda: precoVenda,
        dolar,
        criado: result.criado,
      },
      { status: 201 },
    );
  } catch (err) {
    return internalError("[POST /api/produtos/peca-avulsa]", err, "Erro ao cadastrar peça avulsa");
  }
}

// UPSERT manual: public.estoque.sku não tem UNIQUE — replica padrão do pedras-bulk.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertEstoque(tx: any, sku: string, qtd: number) {
  const updRes = await tx`
    UPDATE public.estoque
    SET saldo        = saldo        + ${qtd},
        estoque_loja = estoque_loja + ${qtd}
    WHERE sku = ${sku}
  `;
  if ((updRes.count ?? 0) === 0) {
    await tx`
      INSERT INTO public.estoque (sku, saldo, estoque_loja)
      VALUES (${sku}, ${qtd}, ${qtd})
    `;
  }
}
