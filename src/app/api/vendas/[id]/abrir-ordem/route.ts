/**
 * Abertura MANUAL da ordem de fabricação de aliança, com confirmação do aro.
 *
 * O QUE:
 *   GET  → devolve as alianças da venda (uma por ficha do orçamento) com o aro
 *          atual, a gravação, as medidas e o peso de cada aro possível, para a
 *          tela montar a confirmação.
 *   POST → recebe o aro confirmado de cada aliança, grava na ficha técnica
 *          (aro + diâmetro + peso recalculado) e SÓ ENTÃO cria a ordem.
 *
 * POR QUE: antes a ordem nascia dentro da aprovação da venda. Como o aro é
 * obrigatório no orçamento e o cliente muitas vezes ainda não sabe o tamanho do
 * dedo, a consultora chutava um número para fechar a venda — e a fábrica
 * recebia a numeração errada no mesmo instante (relato do Jonathan, 27/07/2026).
 * Agora a venda aprova sem ordem e a ordem só sai quando alguém confirma o aro,
 * aliança por aliança.
 *
 * IMPACTO SE REMOVIDO: a venda de aliança fica sem NENHUM caminho para virar
 * ordem — a trava em criarOrdemDoOrcamento (opts.aroConfirmado) só é liberada
 * aqui. Este endpoint é a única porta.
 *
 * QUEM PODE: a consultora dona da venda (é ela que fala com o cliente e
 * descobre o tamanho) e as roles de acesso pleno a vendas — mesma regra de
 * ownership do resto do módulo (requireVendaOwnership).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { ForbiddenError } from "@/lib/auth-server";
import { criarOrdemDoOrcamento } from "@/lib/vendas-aprovar";
import { RING_SIZES } from "@/app/(dashboard)/orcamento/constants";
import { aroDaFicha, aroValido, pesoParaAro } from "@/lib/orcamento-aro-peso";
import { splitGravacao } from "@/lib/gravacao";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

const PERFIL_LABEL: Record<string, string> = {
  Anatomica: "Anatômica",
  Boleada: "Boleada",
  BoleadaDouble: "Boleada Dentro e Fora",
  Chanfrada: "Chanfrada",
  Concava: "Côncava",
  FrisoUnico: "Friso Único",
  FrisoLateral: "Friso Lateral",
  QuadradoCanal: "Bordas Elevadas",
  Simples: "Reta",
};

const BodySchema = z.object({
  aros: z.array(z.object({
    ficha_id: z.number().int().positive(),
    aro: z.number().int().min(1).max(36),
  })).min(1).max(2),
});

/** Situações em que a venda já pode virar ordem (venda fechada de verdade). */
const SITUACOES_OK = ["aprovado", "confirmado", "concluido", "entregue", "em_rota"];

type Ctx = { params: Promise<{ id: string }> };

/**
 * Carrega venda + orçamento de aliança + fichas. Fonte única usada pelo GET e
 * pelo POST — as duas rotas precisam exatamente das mesmas validações.
 */
async function carregar(vendaId: number) {
  const [venda] = await sql`
    SELECT id, numero_venda, situacao, orcamento_id
      FROM alissonerp.vendas_erp
     WHERE id = ${vendaId}
     LIMIT 1
  `;
  if (!venda) return { erro: "Venda não encontrada", status: 404 } as const;

  // O orçamento aponta para a venda por venda_gerada_id (mesma leitura da tela
  // da venda). vendas_erp.orcamento_id é o caminho inverso e pode estar nulo em
  // venda antiga — por isso os dois.
  const [orc] = await sql`
    SELECT id, tipo, quantidade, peso, numero_orcamento, nome_modelo,
           ficha_tecnica_id, ficha_tecnica_2_id, ordem_gerada_id,
           aro_confirmado_por, aro_confirmado_em
      FROM alissonerp.orcamentos
     WHERE (venda_gerada_id = ${vendaId} OR id = ${venda.orcamento_id ?? 0})
     ORDER BY id DESC
     LIMIT 1
  `;
  if (!orc) return { erro: "Esta venda não veio de um orçamento", status: 404 } as const;
  if (orc.tipo !== "alianca") {
    return { erro: "Confirmação de aro existe só para orçamento de aliança", status: 409 } as const;
  }

  /**
   * A segunda ficha só conta quando o orçamento é PAR (quantidade = 2) — mesma
   * regra da criação da ordem em criarOrdemDoOrcamento. Existe orçamento com
   * quantidade 1 e ficha_tecnica_2_id preenchida (resíduo de quando o orçamento
   * foi par e voltou para unidade; ex.: ORC-0000144 no homolog). Se
   * considerássemos essa ficha, a tela pediria dois aros para uma aliança só e a
   * ordem sairia com um deles ignorado.
   */
  const ehPar = Number(orc.quantidade ?? 1) === 2;
  const fichaIds = [orc.ficha_tecnica_id, ehPar ? orc.ficha_tecnica_2_id : null]
    .filter((x): x is number => x != null);
  if (fichaIds.length === 0) {
    return { erro: "Orçamento sem ficha técnica — não é possível abrir a ordem", status: 409 } as const;
  }

  const fichas = await sql`
    SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ANY(${fichaIds}::int[])
  `;
  const byId = new Map(fichas.map((f) => [Number(f.id), f as Record<string, unknown>]));
  // Ordem importa: anel 1 = ficha_tecnica_id, anel 2 = ficha_tecnica_2_id.
  const ordenadas = fichaIds.map((fid) => byId.get(Number(fid))).filter((f): f is Record<string, unknown> => !!f);
  if (ordenadas.length === 0) {
    return { erro: "Ficha técnica do orçamento não encontrada", status: 404 } as const;
  }

  return { venda, orc, fichas: ordenadas } as const;
}

// ─── GET: dados para a tela de confirmação ───────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;
    const vendaId = Number(id);
    if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const [usuario] = await sql`
      SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
    await requireVendaOwnership({ id: user.id, role: usuario.role, email: user.email ?? "" }, vendaId);

    const dados = await carregar(vendaId);
    if ("erro" in dados) return NextResponse.json({ error: dados.erro }, { status: dados.status });
    const { venda, orc, fichas } = dados;

    const [ordemExistente] = orc.ordem_gerada_id ? await sql`
      SELECT id, numero_ordem, situacao, status
        FROM alissonerp.ordens WHERE id = ${orc.ordem_gerada_id} LIMIT 1
    ` : [null];

    // Uma entrada por aliança. `pesos` traz o peso de CADA aro possível, para a
    // tela mostrar o efeito da troca na hora, sem ida e volta ao servidor.
    const aliancas = fichas.map((f, i) => {
      const aroAtual = aroDaFicha(f);
      const gravacao = splitGravacao(f.texto);
      return {
        ficha_id: Number(f.id),
        anel: i + 1,
        perfil: PERFIL_LABEL[String(f.perfil ?? "")] ?? (f.modelo as string | null) ?? "Personalizada",
        largura: f.largura != null ? Number(f.largura) : null,
        espessura: f.espessura != null ? Number(f.espessura) : null,
        cor_metal: (f.cor_metal as string | null) ?? null,
        qtd_pedras: f.qtd_pedras != null ? Number(f.qtd_pedras) : 0,
        tipo_pedra: (f.tipo_pedra as string | null) ?? null,
        gravacao,
        aro_atual: aroAtual,
        peso_atual: f.peso_estimado != null ? Number(f.peso_estimado) : null,
        pesos: RING_SIZES.map((r) => {
          const p = pesoParaAro(f, r.size);
          return { aro: r.size, diametro: r.diameter, peso: p?.peso ?? null, delta: p?.delta ?? 0 };
        }),
      };
    });

    return NextResponse.json({
      venda: { id: Number(venda.id), numero_venda: venda.numero_venda, situacao: venda.situacao },
      orcamento: {
        id: Number(orc.id),
        numero_orcamento: orc.numero_orcamento,
        nome_modelo: orc.nome_modelo,
        quantidade: Number(orc.quantidade ?? 1),
        aro_confirmado_em: orc.aro_confirmado_em,
      },
      ordem: ordemExistente ? {
        id: Number(ordemExistente.id),
        numero_ordem: ordemExistente.numero_ordem,
        situacao: ordemExistente.situacao,
        status: ordemExistente.status,
      } : null,
      pode_abrir: !orc.ordem_gerada_id && SITUACOES_OK.includes(String(venda.situacao)),
      aliancas,
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return internalError("GET /api/vendas/[id]/abrir-ordem", e);
  }
}

// ─── POST: confirma o aro e cria a ordem ─────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;
    const vendaId = Number(id);
    if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const [usuario] = await sql`
      SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
    await requireVendaOwnership({ id: user.id, role: usuario.role, email: user.email ?? "" }, vendaId);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Informe o aro de cada aliança (1 a 36)" }, { status: 400 });
    }

    const dados = await carregar(vendaId);
    if ("erro" in dados) return NextResponse.json({ error: dados.erro }, { status: dados.status });
    const { venda, orc, fichas } = dados;

    // Idempotência: ordem já aberta não abre de novo (duplo clique, retry).
    if (orc.ordem_gerada_id) {
      const [ja] = await sql`
        SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${orc.ordem_gerada_id} LIMIT 1
      `;
      return NextResponse.json({
        ok: true, ja_aberta: true,
        ordem: ja ? { id: Number(ja.id), numero_ordem: String(ja.numero_ordem) } : null,
      });
    }

    if (!SITUACOES_OK.includes(String(venda.situacao))) {
      return NextResponse.json(
        { error: `Venda em "${venda.situacao}" — aprove a venda antes de abrir a ordem` },
        { status: 409 }
      );
    }

    // O corpo tem que cobrir TODAS as alianças do orçamento, uma vez cada. É
    // isso que garante que ninguém confirma o par informando só um aro (e a
    // segunda aliança sair com o número chutado do orçamento).
    const esperadas = fichas.map((f) => Number(f.id)).sort();
    const recebidas = parsed.data.aros.map((a) => a.ficha_id).sort();
    const mesmasFichas = esperadas.length === recebidas.length
      && esperadas.every((v, i) => v === recebidas[i]);
    if (!mesmasFichas) {
      return NextResponse.json(
        { error: `Confirme o aro de ${esperadas.length === 2 ? "AMBAS as alianças" : "a aliança"} antes de abrir a ordem` },
        { status: 400 }
      );
    }

    // Recalcula tudo ANTES de escrever: se um aro for inválido, nada é gravado.
    const atualizacoes = parsed.data.aros.map((entrada) => {
      const ficha = fichas.find((f) => Number(f.id) === entrada.ficha_id)!;
      if (!aroValido(entrada.aro)) return null;
      const calc = pesoParaAro(ficha, entrada.aro);
      if (!calc) return null;
      return {
        ficha_id: entrada.ficha_id,
        anel: fichas.indexOf(ficha) + 1,
        aroAntes: aroDaFicha(ficha),
        ...calc,
      };
    });
    if (atualizacoes.some((u) => u == null)) {
      return NextResponse.json({ error: "Aro inválido — use um número da tabela de aros (1 a 36)" }, { status: 400 });
    }
    const updates = atualizacoes as NonNullable<(typeof atualizacoes)[number]>[];

    // Grava aro + diâmetro + peso em cada ficha e assina a confirmação no
    // orçamento. Transação própria: a ficha nunca fica com aro novo e peso
    // velho (o ourives leria uma grama que não fecha com o aro).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      for (const u of updates) {
        await tx`
          UPDATE alissonerp.orcamento_fichas_tecnicas
             SET aro_numeracao = ${"Aro " + u.aro},
                 diametro      = ${u.diametro},
                 peso_estimado = ${u.peso}
           WHERE id = ${u.ficha_id}
        `;
      }
      await tx`
        UPDATE alissonerp.orcamentos
           SET aro_confirmado_por = ${user.id}::uuid,
               aro_confirmado_em  = NOW(),
               updated_at         = NOW()
         WHERE id = ${orc.id}
      `;
    });

    // Só agora a ordem pode nascer. A flag aroConfirmado é a única chave que
    // libera a criação de ordem de aliança (ver vendas-aprovar.ts).
    const ordem = await criarOrdemDoOrcamento(vendaId, user.id, { aroConfirmado: true });
    if (!ordem) {
      return NextResponse.json(
        { error: "Aro confirmado, mas a ordem não foi criada. Chame o suporte antes de tentar de novo." },
        { status: 500 }
      );
    }

    // Registra a troca no detalhe da ordem: a fábrica precisa saber que o aro
    // mudou depois do orçamento (é a explicação de por que o peso mudou).
    const trocados = updates.filter((u) => u.aroAntes != null && u.aroAntes !== u.aro);
    if (trocados.length > 0) {
      const resumo = trocados
        .map((u) => `Aliança ${u.anel}: aro ${u.aroAntes}→${u.aro} (${u.pesoAtual}g→${u.peso}g)`)
        .join(" · ");
      await sql`
        UPDATE alissonerp.ordens
           SET detalhes_ordem = COALESCE(detalhes_ordem, '') || ${" | Aro confirmado na abertura — " + resumo}
         WHERE id = ${ordem.id}
      `;
    }

    await logAudit(sql, {
      tabela: "ordens",
      operacao: "INSERT",
      registro_id: ordem.id,
      usuario_id: user.id,
      dados_depois: {
        origem: "abrir_ordem_alianca",
        venda_id: vendaId,
        orcamento_id: Number(orc.id),
        numero_ordem: ordem.numero_ordem,
        aros: updates.map((u) => ({ anel: u.anel, de: u.aroAntes, para: u.aro, peso_de: u.pesoAtual, peso_para: u.peso })),
      },
    });

    return NextResponse.json({
      ok: true,
      ordem,
      aros: updates.map((u) => ({ anel: u.anel, aro: u.aro, peso: u.peso, delta: u.delta })),
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return internalError("POST /api/vendas/[id]/abrir-ordem", e);
  }
}
