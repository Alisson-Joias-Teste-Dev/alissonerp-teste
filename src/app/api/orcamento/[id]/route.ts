import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { validateFichaTecnica, migrateProfile, CALIBRACAO_DEFAULTS, type CalibracaoDefaults } from "@/app/(dashboard)/orcamento/validations";
import { computeStoneCapacity } from "@/app/(dashboard)/orcamento/constants";
import { ProfileType } from "@/app/(dashboard)/orcamento/types";
import { ROLES_ORCAMENTO, ROLES_APROVACAO, orcamentoNumericChecks } from "@/lib/orcamento-shared";
import { ForbiddenError } from "@/lib/auth-server";
import { requireOrcamentoOwnership, NotFoundError } from "@/lib/auth-vendas";
import {
  LIMITS,
  checkBase64Length,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError, IdSchema } from "@/lib/schemas/common";

const OrcamentoPatchSchema = z.object({
  status: z.enum(["enviado", "aprovado", "rejeitado"]),
  motivo_rejeicao: z.string().max(LIMITS.OBSERVACOES_MAX).optional(),
  cliente_id: IdSchema.optional(),
}).passthrough();

const OrcamentoPutSchema = z.object({
  nome_cliente: z.string().max(LIMITS.NOME_MAX).optional(),
  nome_modelo: z.string().max(LIMITS.NOME_MAX).optional(),
  peso: z.number().nullable().optional(),
  valor: z.number().nullable().optional(),
  markup: z.number().nullable().optional(),
  desconto_pct: z.number().nullable().optional(),
  cotacao_ouro: z.number().nullable().optional(),
  cotacao_dolar: z.number().nullable().optional(),
  valor_ouro: z.number().nullable().optional(),
  valor_pedras: z.number().nullable().optional(),
  tipo: z.string().max(50).optional(),
  ficha: z.record(z.string(), z.unknown()).nullable().optional(),
  ficha2: z.record(z.string(), z.unknown()).nullable().optional(),
  quantidade: z.union([z.number(), z.string()]).optional(),
  cliente_id: IdSchema.nullable().optional(),
  foto_3d_base64: z.string().max(LIMITS.IMAGE_BASE64_MAX).optional(),
  snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  valor_negociado_locked: z.boolean().optional(),
  client_updated_at: z.string().max(50).optional(),
}).passthrough();

// GET /api/orcamento/[id] — detalhe do orçamento
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Onda 1D: bloqueia consultora de ler orcamento alheio
  const [usuarioGet] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuarioGet) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    await requireOrcamentoOwnership({ id: user.id, role: usuarioGet.role, email: user.email ?? "" }, orcId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // o.* + ft.* causava colisão de `id` (orçamento vs ficha) — o `id` da ficha
  // sobrescrevia o do orçamento no resultado. Voltamos a ficha como objeto
  // separado e preservamos `o.id`.
  const [orc] = await sql`
    SELECT o.*,
           row_to_json(ft.*) AS ficha,
           row_to_json(ft2.*) AS ficha2,
           c.nome AS cliente_nome_contato, c.cpf_cnpj, c.telefone AS cliente_telefone
    FROM alissonerp.orcamentos o
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft2 ON ft2.id = o.ficha_tecnica_2_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE o.id = ${orcId}
  `;
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  return NextResponse.json({ orcamento: orc });
}

// PATCH /api/orcamento/[id] — atualizar status (aprovar/rejeitar/enviar)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT u.role, v.id_vendedor
    FROM alissonerp.usuarios u
    LEFT JOIN public.vendedores v ON v.email = u.email
    WHERE u.id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  const role = caller.role as string;
  const hasAccess = isFullAccess(role) || ROLES_ORCAMENTO.includes(role as typeof ROLES_ORCAMENTO[number]);
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsedPatch = OrcamentoPatchSchema.safeParse(raw);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const body = parsedPatch.data as {
    status: "enviado" | "aprovado" | "rejeitado";
    motivo_rejeicao?: string;
    cliente_id?: number;
  };

  // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
  try {
    checkStringLength("motivo_rejeicao", body.motivo_rejeicao, LIMITS.OBSERVACOES_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // Onda 1K: consolida ownership no mesmo helper do GET/PUT (antes era check
  // manual `orc.usuario_id !== user.id` que so disparava DEPOIS do SELECT
  // gigante abaixo e nao tinha a regra de full-access centralizada).
  try {
    await requireOrcamentoOwnership(
      { id: user.id, role, email: user.email ?? "" },
      orcId,
    );
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Buscar orçamento atual
  const [orc] = await sql`
    SELECT o.*, ft.modelo, ft.aro_numeracao, ft.largura, ft.espessura, ft.peso_estimado,
           ft.perfil, ft.diametro, ft.densidade_ouro, ft.cor_metal,
           ft.tipo_fonte, ft.texto, ft.qtd_pedras, ft.tamanho_pedra, ft.tipo_pedra,
           ft.tipo_aplicacao_pedra, ft.profundidade_concava, ft.friso_lado,
           ft.friso_largura, ft.friso_profundidade, ft.friso_offset,
           ft.canal_largura, ft.canal_borda_altura, ft.chanfro_tamanho,
           ft.dome_porcentagem, ft.pedra_fileiras, ft.pedra_drill,
           ft.pedra_meia_lua, ft.pedra_volta_completa, ft.pedras_detalhadas
    FROM alissonerp.orcamentos o
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    WHERE o.id = ${orcId}
  `;
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  // Aprovar/rejeitar exige ROLES_APROVACAO (admin/gerentes/desenvolvedor) —
  // consultora pode só enviar e atualizar cliente_id dos próprios.
  const isFull = isFullAccess(role);
  if ((body.status === "aprovado" || body.status === "rejeitado")
      && !isFull
      && !ROLES_APROVACAO.includes(role as typeof ROLES_APROVACAO[number])) {
    return NextResponse.json({ error: "Sem permissão para aprovar/rejeitar" }, { status: 403 });
  }

  // Atualizar cliente_id se fornecido
  if (body.cliente_id) {
    await sql`UPDATE alissonerp.orcamentos SET cliente_id = ${body.cliente_id} WHERE id = ${orcId}`;
    orc.cliente_id = body.cliente_id;
  }

  // ── ENVIAR ────────────────────────────────────────────────────────────────
  if (body.status === "enviado") {
    await sql`UPDATE alissonerp.orcamentos SET status = 'enviado', updated_at = NOW() WHERE id = ${orcId}`;
    return NextResponse.json({ ok: true, status: "enviado" });
  }

  // ── REJEITAR ──────────────────────────────────────────────────────────────
  if (body.status === "rejeitado") {
    await sql`
      UPDATE alissonerp.orcamentos
      SET status = 'rejeitado', observacoes = COALESCE(${body.motivo_rejeicao ?? null}, observacoes), updated_at = NOW()
      WHERE id = ${orcId}
    `;
    return NextResponse.json({ ok: true, status: "rejeitado" });
  }

  // ── APROVAR → CRIAR VENDA PRÉ-PREENCHIDA ──────────────────────────────────
  if (body.status === "aprovado") {
    const clienteId = orc.cliente_id as number | null;
    if (!clienteId) {
      return NextResponse.json({ error: "Vincule um cliente antes de aprovar" }, { status: 422 });
    }

    // Bug #13: valida que o cliente_id realmente existe em public.contatos
    // antes de criar a venda. Sem isso, FK quebrava com mensagem genérica.
    const [clienteExiste] = await sql`SELECT 1 AS ok FROM public.contatos WHERE id_contato = ${clienteId} LIMIT 1`;
    if (!clienteExiste) {
      return NextResponse.json({ error: "Cliente vinculado não foi encontrado (pode ter sido removido). Selecione outro." }, { status: 422 });
    }

    // B9 (idempotência, opção A): se este orçamento JÁ gerou uma venda, devolve ELA
    // em vez de criar outra. Cobre o caso comum de re-clique / reabrir a tela depois
    // de já ter aprovado. A trava final contra corrida real é o índice único
    // uq_vendas_erp_orcamento (migration 312) + o FOR UPDATE dentro da transação.
    const [vendaJaGerada] = await sql`
      SELECT id, numero_venda FROM alissonerp.vendas_erp
      WHERE orcamento_id = ${orcId} ORDER BY id ASC LIMIT 1
    `;
    if (vendaJaGerada) {
      return NextResponse.json({
        ok: true, status: "convertido",
        venda_id: vendaJaGerada.id, numero_venda: vendaJaGerada.numero_venda,
        ja_existia: true,
      });
    }

    // Bug #18 + B6: defesa em profundidade — revalida ficha técnica (1 E 2)
    // antes da aprovação. Se algum endpoint legado/manual deixou a ficha
    // inviável, o PUT já barra, mas o PATCH não tinha proteção própria. B6
    // estende pra ficha2: par com bug em anel 2 não pode chegar à venda.
    if (orc.tipo === "alianca") {
      const fichaIds = [orc.ficha_tecnica_id, orc.ficha_tecnica_2_id].filter((id): id is number => !!id);
      if (fichaIds.length > 0) {
        const [configRow] = await sql`SELECT calibracao FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1`;
        const calibAp: CalibracaoDefaults = (configRow?.calibracao as CalibracaoDefaults) ?? CALIBRACAO_DEFAULTS;
        for (const fichaId of fichaIds) {
          const [fichaApro] = await sql`
            SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${fichaId} LIMIT 1
          `;
          if (!fichaApro) continue;
          const profileAp = migrateProfile(String(fichaApro.perfil ?? "Simples"));
          const capacityAp = computeStoneCapacity(
            Number(fichaApro.diametro ?? 0),
            Number(fichaApro.espessura ?? 0),
            Number(fichaApro.canal_borda_altura ?? 1.0),
            Number(fichaApro.tamanho_pedra ?? 0),
            Number(fichaApro.pedra_fileiras ?? 1),
            profileAp,
          );
          const errsAp = validateFichaTecnica(fichaApro as unknown as Record<string, unknown>, capacityAp, calibAp);
          if (errsAp.length > 0) {
            const label = fichaId === orc.ficha_tecnica_id ? "anel 1" : "anel 2";
            return NextResponse.json({ error: `Ficha técnica inválida (${label}): ${errsAp[0].message}`, errors: errsAp }, { status: 422 });
          }
        }
      }
    }

    const perfilNomes: Record<string, string> = {
      Anatomica: "Anatômica", Boleada: "Boleada", BoleadaDouble: "Boleada Dupla",
      Chanfrada: "Chanfrada", Concava: "Côncava", QuadradoCanal: "Bordas Elevadas",
      Simples: "Reta",
      // Legado (orçamentos antigos)
      FrisoUnico: "Reta + Friso", FrisoLateral: "Reta + Friso Duplo",
    };

    // Retry defensivo em unique_violation do numero_venda. Migration 259
    // alinha o sequence com MAX(numero_pedido/numero_venda), mas se ela ainda
    // não rodou em prod (ou alguém inserir via outro caminho), o nextval pode
    // colidir. Como sequence é monotônico, a 2ª tentativa pega número novo.
    // B9: distingue a unique_violation da trava de orçamento (uq_vendas_erp_orcamento,
    // mig 312) das demais. Essa NÃO pode ser retentada — retentar não ajuda, é uma
    // duplicata real ("orçamento já tem venda"); é tratada como idempotente abaixo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isOrcDup = (e: any) =>
      e?.code === "23505" &&
      (String(e?.constraint_name ?? "").includes("orcamento") ||
        String(e?.detail ?? "").includes("orcamento_id"));
    const runWithRetry = async <T>(fn: () => Promise<T>, max = 3): Promise<T> => {
      let lastErr: unknown;
      for (let i = 0; i < max; i++) {
        try { return await fn(); }
        catch (e) {
          lastErr = e;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const code = (e as any)?.code;
          // só retentamos unique_violation de numero_venda; a trava de orçamento não.
          if (code !== "23505" || isOrcDup(e)) throw e;
        }
      }
      throw lastErr;
    };
    type ResultadoAprovacao = { venda_id: number; numero_venda: string; ja_existia?: boolean };
    let resultado: ResultadoAprovacao;
    try {
    resultado = await runWithRetry<ResultadoAprovacao>(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sql as any).begin(async (tx: typeof sql) => {
      // B9 (trava de corrida): trava a linha do orçamento. Duas aprovações
      // simultâneas serializam aqui — a 2ª espera a 1ª commitar, relê e devolve a
      // venda já criada em vez de inserir outra. (Backstop final: índice único.)
      await tx`SELECT 1 FROM alissonerp.orcamentos WHERE id = ${orcId} FOR UPDATE`;
      const [jaTemVenda] = await tx`
        SELECT id, numero_venda FROM alissonerp.vendas_erp
        WHERE orcamento_id = ${orcId} ORDER BY id ASC LIMIT 1
      `;
      if (jaTemVenda) {
        return { venda_id: jaTemVenda.id, numero_venda: jaTemVenda.numero_venda as string, ja_existia: true };
      }

      // 1. Data entrega: +10 dias úteis em America/Sao_Paulo.
      // Bug #19: `new Date()` no servidor em UTC pulava sábado/domingo errado
      // (sex 23h SP = sáb 02h UTC, então `getDay()` retornava 6 e atrasava 1 dia).
      // Aqui montamos a data no fuso SP usando Intl, depois caminhamos em UTC
      // (independente do TZ do host).
      const partsBR = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const y = Number(partsBR.find(p => p.type === "year")?.value);
      const m = Number(partsBR.find(p => p.type === "month")?.value);
      const d = Number(partsBR.find(p => p.type === "day")?.value);
      const dataEntrega = new Date(Date.UTC(y, m - 1, d));
      let diasUteis = 0;
      while (diasUteis < 10) {
        dataEntrega.setUTCDate(dataEntrega.getUTCDate() + 1);
        const dow = dataEntrega.getUTCDay();
        if (dow !== 0 && dow !== 6) diasUteis++;
      }

      // 2. Criar venda (rascunho) pré-preenchida — número via sequence
      // (migration 259) elimina race condition do MAX+1 entre INSERTs paralelos.
      const vendedorId = orc.vendedor_id ?? (caller.id_vendedor ? Number(caller.id_vendedor) : null);
      const [venda] = await tx`
        INSERT INTO alissonerp.vendas_erp (
          numero_venda, cliente_id, vendedor_id, data_venda, data_entrega,
          situacao, observacoes, orcamento_id, created_by
        ) VALUES (
          nextval('alissonerp.venda_numero_seq')::text,
          ${clienteId}, ${vendedorId},
          CURRENT_DATE, ${dataEntrega.toISOString().split("T")[0]},
          'rascunho',
          ${'Orçamento ' + orc.numero_orcamento + (orc.nome_modelo ? ' - ' + orc.nome_modelo : '')},
          ${orcId}, ${user.id}::uuid
        )
        RETURNING id, numero_venda
      `;
      const vendaFinal = { numero_venda: venda.numero_venda as string };

      // 3. Criar item da venda com comissão calculada via faixas_comissao
      // Usa nome_modelo salvo (preserva friso, par, label customizado).
      // Fallback p/ orçamentos antigos sem nome_modelo: monta via perfilNomes.
      const nomeModeloSaved = orc.nome_modelo as string | null;
      const nomeFallback = perfilNomes[orc.perfil as string] ?? orc.modelo ?? "Personalizada";
      const nomeItem = orc.tipo === "alianca"
        ? (nomeModeloSaved
            ? (nomeModeloSaved.startsWith("Par:")
                ? `Alianças (${nomeModeloSaved.replace(/^Par:\s*/, "")})`
                : `Aliança ${nomeModeloSaved}`)
            : `Aliança ${nomeFallback}`)
        : `Peça Personalizada`;
      // Buscar valor, peso, desconto, quantidade, snapshot e lock direto do orçamento.
      // Bug #14: quando snapshot lock está ativo, usar o valor congelado em vez
      // do `valor` cru — assim qualquer dessincronia entre coluna e snapshot
      // (cenário raro mas possível) não vaza pra venda gerada.
      // Bug #12: respeitar quantidade=2 do par — antes a venda nascia sempre
      // com 1 item, perdendo o "par" e o relatório de produção desalinhava.
      const [orcValores] = await tx`
        SELECT valor, peso, desconto_pct, quantidade, snapshot, valor_negociado_locked
        FROM alissonerp.orcamentos WHERE id = ${orcId}
      `;
      const lockedAtivo = orcValores?.valor_negociado_locked === true;
      const snap = (lockedAtivo && orcValores?.snapshot && typeof orcValores.snapshot === "object")
        ? (orcValores.snapshot as Record<string, unknown>)
        : null;
      const valorTotal = Number(snap?.valor ?? orcValores?.valor ?? 0);
      const pesoTotal = Number(snap?.peso ?? orcValores?.peso ?? orc.peso_estimado ?? 0);
      const qtdRaw = Number(orcValores?.quantidade ?? 1);
      const qtdItem = Number.isFinite(qtdRaw) && qtdRaw >= 1 ? Math.floor(qtdRaw) : 1;
      // Bug duplicacao: ate v2.56 o item nascia com preco_unitario = valor TOTAL
      // do par + quantidade=2, mas o display de venda calcula linha como
      // preco_un × quantidade. Isso fazia a linha aparecer dobrada na tela
      // (R$ 229k em vez de R$ 114k), enquanto o sumario usava total_item e
      // ficava correto — gerando inconsistencia visivel.
      // Fix: preco_unitario = valor por unidade (par => valor/2), total_item =
      // valor TOTAL da linha, qtde mantida. Agora preco_un × qtde = total_item.
      const valorUnitario = qtdItem > 1 ? valorTotal / qtdItem : valorTotal;
      const pesoUnitario = qtdItem > 1 ? pesoTotal / qtdItem : pesoTotal;
      // Replica o desconto do orçamento no item da venda. Reconstrói o preço
      // cheio para manter coerência: lista × (1 − pct/100) = unitário.
      // Sem isso, lista ficava como o próprio valor já descontado, e qualquer
      // desconto adicional na venda aplicava em cascata multiplicativa
      // (30% no orçamento + 30% na venda = 51% real, não 60% e não 30%).
      const descontoPctItem = Number(snap?.desconto_pct ?? orcValores?.desconto_pct ?? 0);
      const precoListaItem = descontoPctItem > 0 && descontoPctItem < 100
        ? Math.round((valorUnitario / (1 - descontoPctItem / 100)) * 100) / 100
        : valorUnitario;

      // Comissão segue faixas_comissao pelo desconto efetivo do orçamento —
      // mesma regra que produto cadastrado usa no checkout. Aliança com 30%
      // desconto (típica em promoção) cai na faixa 30 → 0.5% comissão.
      // Acima de 30% → 0.5% fixo (mesmo teto do frontend).
      //
      // UNIT NOTE: faixas_comissao.comissao_pct é armazenado em "1 = 1%"
      // (seed 104: 0% desc → 4.00 = 4%; 30% desc → 0.50 = 0.5%). Por isso
      // a fórmula é (valor * pct) / 100 — não (valor * pct).
      // Clamp [0, 100] defende contra dados corrompidos (ex: alguém gravando
      // fração 0.04 em vez de 4) que gerariam comissão zerada em silêncio.
      let pctComissao = 0;
      if (descontoPctItem > 30) {
        pctComissao = 0.5;
      } else {
        const [faixa] = await tx`
          SELECT comissao_pct FROM alissonerp.faixas_comissao
          WHERE desconto_pct = ${Math.round(descontoPctItem)} AND ativo = true
          LIMIT 1
        `;
        pctComissao = Number(faixa?.comissao_pct ?? 0);
      }
      if (!Number.isFinite(pctComissao) || pctComissao < 0) pctComissao = 0;
      if (pctComissao > 100) pctComissao = 100;
      // Comissao calculada sobre o TOTAL da linha (par inteiro), nao por unidade
      // — totalComissao do venda detail soma valor_comissao sem multiplicar
      // pela quantidade.
      const valorComissao = Math.round(valorTotal * pctComissao) / 100;

      await tx`
        INSERT INTO alissonerp.itens_venda_erp (
          venda_id, nome_produto, quantidade, preco_lista,
          pct_desconto, preco_unitario, total_item, peso_estimado,
          pct_comissao, valor_comissao, observacao
        ) VALUES (
          ${venda.id}, ${nomeItem}, ${qtdItem}, ${precoListaItem},
          ${descontoPctItem}, ${valorUnitario}, ${valorTotal}, ${pesoUnitario},
          ${pctComissao}, ${valorComissao},
          ${'Orçamento ' + orc.numero_orcamento}
        )
      `;

      // 4. Marcar orçamento como convertido com venda vinculada
      await tx`
        UPDATE alissonerp.orcamentos
        SET status = 'convertido', venda_gerada_id = ${venda.id}, updated_at = NOW()
        WHERE id = ${orcId}
      `;

      return { venda_id: venda.id, numero_venda: vendaFinal.numero_venda as string };
    }),
    );
    } catch (e) {
      // Backstop B9: se o índice único uq_vendas_erp_orcamento (mig 312) disparou
      // (corrida que escapou do FOR UPDATE, ou inserção por outro caminho), trata
      // como idempotente — devolve a venda que já existe, sem erro feio.
      if (isOrcDup(e)) {
        const [ex] = await sql`
          SELECT id, numero_venda FROM alissonerp.vendas_erp
          WHERE orcamento_id = ${orcId} ORDER BY id ASC LIMIT 1
        `;
        if (ex) {
          return NextResponse.json({
            ok: true, status: "convertido",
            venda_id: ex.id, numero_venda: ex.numero_venda, ja_existia: true,
          });
        }
      }
      throw e;
    }

    // Venda criada como rascunho — usuário preenche pagamento/frete e aprova manualmente

    return NextResponse.json({
      ok: true,
      status: "convertido",
      venda_id: resultado.venda_id,
      numero_venda: resultado.numero_venda,
      ja_existia: resultado.ja_existia ?? false,
    });
  }

  return NextResponse.json({ error: "Status inválido" }, { status: 400 });
}

// PUT /api/orcamento/[id] — atualizar orçamento existente
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orcId = parseInt(id);
  if (isNaN(orcId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Permissões: descobre role + mx_desconto_permitido do caller pra decidir
  // se pode destravar valor negociado E se pode passar do limite de desconto.
  const [callerRow] = await sql`SELECT role, mx_desconto_permitido FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const callerRole = (callerRow?.role ?? "") as string;
  const canUnlock = isFullAccess(callerRole);
  const callerMaxDesc = Number(callerRow?.mx_desconto_permitido ?? 0);

  // Onda 1D: consultora so atualiza orcamento proprio (usuario_id == user.id)
  try {
    await requireOrcamentoOwnership({ id: user.id, role: callerRole, email: user.email ?? "" }, orcId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsedPut = OrcamentoPutSchema.safeParse(raw);
  if (!parsedPut.success) return zodError(parsedPut.error);
  // body legado eh usado em UPDATEs com ficha/ficha2/snapshot livres — manter
  // tipo `any` evita perda de inferencia do sql tagged template.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = parsedPut.data as any;
  const {
    nome_cliente, nome_modelo, peso, valor, markup, desconto_pct,
    cotacao_ouro, cotacao_dolar, valor_ouro, valor_pedras,
    tipo, ficha, ficha2, quantidade, cliente_id, foto_3d_base64,
    snapshot, valor_negociado_locked, client_updated_at,
  } = body;

  try {
    checkStringLength("nome_cliente", nome_cliente, LIMITS.NOME_MAX);
    checkStringLength("nome_modelo", nome_modelo, LIMITS.NOME_MAX);
    checkBase64Length("foto_3d_base64", foto_3d_base64, LIMITS.IMAGE_BASE64_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // Locking otimista (ADR 0006). Se o cliente envia client_updated_at, comparamos
  // com o updated_at atual; mismatch = 409 (outro usuário editou desde o GET).
  // Sem isso, dois usuários editando o mesmo orçamento sobrescrevem em silêncio.
  if (client_updated_at) {
    const [row] = await sql`SELECT updated_at FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    if (row && new Date(row.updated_at).getTime() !== new Date(client_updated_at).getTime()) {
      return NextResponse.json(
        { error: "Conflito: orçamento foi modificado por outro usuário. Recarregue a página." },
        { status: 409 },
      );
    }
  }

  // Validacao numerica (helper compartilhado — antes era copy-paste do POST).
  const numErr = orcamentoNumericChecks({
    peso, valor, markup, desconto_pct, cotacao_ouro, cotacao_dolar, valor_ouro, valor_pedras,
  });
  if (numErr) return NextResponse.json({ error: numErr }, { status: 400 });
  if (cliente_id != null) {
    const [existe] = await sql`SELECT 1 AS ok FROM public.contatos WHERE id_contato = ${Number(cliente_id)} LIMIT 1`;
    if (!existe) return NextResponse.json({ error: "Cliente informado não foi encontrado" }, { status: 422 });
  }

  // B7: trava backend de desconto_pct (espelha POST). Não-admin não pode
  // ultrapassar mx_desconto_permitido via cURL.
  if (!canUnlock && desconto_pct != null) {
    const descNum = Number(desconto_pct);
    if (Number.isFinite(descNum) && descNum > callerMaxDesc) {
      return NextResponse.json(
        { error: `Desconto ${descNum}% excede seu limite (${callerMaxDesc}%). Solicite aprovação.` },
        { status: 403 },
      );
    }
  }

  // Normaliza quantidade UMA vez. Antes alguns checks faziam `=== 2` estrito,
  // outros `Number(...) === 2` — string "2" passava na fase 1 mas pulava o
  // INSERT da ficha2 (bug v2.42.2 voltava por outro caminho).
  const qtdNum = Number(quantidade);

  // Par de alianças exige as DUAS fichas (idem POST).
  if ((tipo ?? "alianca") === "alianca" && qtdNum === 2 && (!ficha2 || typeof ficha2 !== "object")) {
    return NextResponse.json({ error: "Par de alianças exige ficha técnica do anel 2" }, { status: 422 });
  }

  // ── Validação de travas (bilateral: frontend + backend) ─────────────────
  // Re-valida ficha técnica no PUT também. O PATCH (aprovação) é intocado.
  if ((tipo ?? "alianca") === "alianca") {
    const [configRow] = await sql`
      SELECT calibracao FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1
    `;
    const calib: CalibracaoDefaults = (configRow?.calibracao as CalibracaoDefaults) ?? CALIBRACAO_DEFAULTS;

    const fichasParaValidar: Array<{ f: Record<string, unknown>; label: string }> = [];
    if (ficha && typeof ficha === "object") fichasParaValidar.push({ f: ficha, label: "alianca" });
    if (ficha2 && typeof ficha2 === "object" && qtdNum === 2) fichasParaValidar.push({ f: ficha2, label: "alianca 2" });

    for (const { f, label } of fichasParaValidar) {
      const profile = migrateProfile(String(f.perfil ?? "Simples"));
      const capacity = computeStoneCapacity(
        Number(f.diametro ?? 0),
        Number(f.espessura ?? 0),
        Number(f.canal_borda_altura ?? 1.0),
        Number(f.tamanho_pedra ?? 0),
        Number(f.pedra_fileiras ?? 1),
        profile,
      );
      const errors = validateFichaTecnica(f, capacity, calib);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: `Validacao falhou (${label}): ${errors[0].message}`, errors },
          { status: 400 },
        );
      }
    }
  }

  // Upload foto 3D se enviada. Path determinístico (`${numero_orcamento}/3d.jpg`)
  // com upsert=true evita acumular arquivos órfãos a cada save. Cache-bust via
  // query string. Unificado com POST pra um único arquivo por orçamento.
  let foto3dUrl: string | undefined;
  if (foto_3d_base64 && typeof foto_3d_base64 === "string" && foto_3d_base64.startsWith("data:")) {
    const [numRow] = await sql`SELECT numero_orcamento FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    const numero = numRow?.numero_orcamento as string | undefined;
    if (numero) {
      const { uploadFile } = await import("@/lib/storage");
      const path = `orcamento/${numero}/3d.jpg`;
      const result = await uploadFile("ordem-fotos", path, foto_3d_base64, "image/jpeg");
      if (!("error" in result)) foto3dUrl = `${result.url}?v=${Date.now()}`;
    }
  }

  // Atualizar ficha técnica 1
  let fichaId: number | undefined;
  if (ficha && typeof ficha === "object") {
    const [existing] = await sql`SELECT ficha_tecnica_id FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    if (existing?.ficha_tecnica_id) {
      await sql`
        UPDATE alissonerp.orcamento_fichas_tecnicas SET
          modelo = ${ficha.modelo ?? null}, aro_numeracao = ${ficha.aro_numeracao ?? null},
          largura = ${ficha.largura ?? null}, espessura = ${ficha.espessura ?? null},
          peso_estimado = ${ficha.peso_estimado ?? null}, perfil = ${ficha.perfil ?? null},
          diametro = ${ficha.diametro ?? null}, densidade_ouro = ${ficha.densidade_ouro ?? null},
          cor_metal = ${ficha.cor_metal ?? null}, tipo_fonte = ${ficha.tipo_fonte ?? null},
          texto = ${ficha.texto ?? null}, qtd_pedras = ${ficha.qtd_pedras ?? null},
          tamanho_pedra = ${ficha.tamanho_pedra ?? null}, tipo_pedra = ${ficha.tipo_pedra ?? null},
          tipo_aplicacao_pedra = ${ficha.tipo_aplicacao_pedra ?? null},
          profundidade_concava = ${ficha.profundidade_concava ?? null},
          has_friso = ${ficha.has_friso ?? false},
          friso_kind = ${ficha.friso_kind ?? "friso"},
          friso_tipo = ${ficha.friso_tipo ?? null},
          friso_lado = ${ficha.friso_lado ?? null},
          friso_largura = ${ficha.friso_largura ?? null},
          friso_profundidade = ${ficha.friso_profundidade ?? null},
          friso_offset = ${ficha.friso_offset ?? null},
          dome_porcentagem = ${ficha.dome_porcentagem ?? null},
          canal_largura = ${ficha.canal_largura ?? null},
          canal_borda_altura = ${ficha.canal_borda_altura ?? null},
          chanfro_tamanho = ${ficha.chanfro_tamanho ?? null},
          pedra_fileiras = ${ficha.pedra_fileiras ?? null},
          pedras_detalhadas = ${ficha.pedras_detalhadas != null ? sql.json(ficha.pedras_detalhadas) : sql`pedras_detalhadas`},
          pedra_drill = ${ficha.pedra_drill ?? false}, pedra_meia_lua = ${ficha.pedra_meia_lua ?? false},
          pedra_volta_completa = ${ficha.pedra_volta_completa ?? false}
        WHERE id = ${existing.ficha_tecnica_id}
      `;
      fichaId = existing.ficha_tecnica_id;
    }
  }

  // Atualizar ficha técnica 2 (par)
  let ficha2Id: number | undefined;
  if (ficha2 && typeof ficha2 === "object" && qtdNum === 2) {
    const [existing] = await sql`SELECT ficha_tecnica_2_id FROM alissonerp.orcamentos WHERE id = ${orcId}`;
    if (existing?.ficha_tecnica_2_id) {
      await sql`
        UPDATE alissonerp.orcamento_fichas_tecnicas SET
          modelo = ${ficha2.modelo ?? null}, aro_numeracao = ${ficha2.aro_numeracao ?? null},
          largura = ${ficha2.largura ?? null}, espessura = ${ficha2.espessura ?? null},
          peso_estimado = ${ficha2.peso_estimado ?? null}, perfil = ${ficha2.perfil ?? null},
          diametro = ${ficha2.diametro ?? null}, densidade_ouro = ${ficha2.densidade_ouro ?? null},
          cor_metal = ${ficha2.cor_metal ?? null}, tipo_fonte = ${ficha2.tipo_fonte ?? null},
          texto = ${ficha2.texto ?? null}, qtd_pedras = ${ficha2.qtd_pedras ?? null},
          tamanho_pedra = ${ficha2.tamanho_pedra ?? null}, tipo_pedra = ${ficha2.tipo_pedra ?? null},
          tipo_aplicacao_pedra = ${ficha2.tipo_aplicacao_pedra ?? null},
          profundidade_concava = ${ficha2.profundidade_concava ?? null},
          has_friso = ${ficha2.has_friso ?? false}, friso_kind = ${ficha2.friso_kind ?? "friso"},
          friso_tipo = ${ficha2.friso_tipo ?? null},
          friso_lado = ${ficha2.friso_lado ?? null}, friso_largura = ${ficha2.friso_largura ?? null},
          friso_profundidade = ${ficha2.friso_profundidade ?? null}, friso_offset = ${ficha2.friso_offset ?? null},
          dome_porcentagem = ${ficha2.dome_porcentagem ?? null},
          canal_largura = ${ficha2.canal_largura ?? null},
          canal_borda_altura = ${ficha2.canal_borda_altura ?? null},
          chanfro_tamanho = ${ficha2.chanfro_tamanho ?? null},
          pedra_fileiras = ${ficha2.pedra_fileiras ?? null},
          pedras_detalhadas = ${ficha2.pedras_detalhadas != null ? sql.json(ficha2.pedras_detalhadas) : sql`pedras_detalhadas`},
          pedra_drill = ${ficha2.pedra_drill ?? false}, pedra_meia_lua = ${ficha2.pedra_meia_lua ?? false},
          pedra_volta_completa = ${ficha2.pedra_volta_completa ?? false}
        WHERE id = ${existing.ficha_tecnica_2_id}
      `;
      ficha2Id = existing.ficha_tecnica_2_id;
    } else {
      // Criar ficha 2 se não existe (caso: usuário editou orçamento unidade
      // e converteu pra par). B5: INSERT alinhado com o POST ficha2 — antes
      // faltavam profundidade_concava, canal_largura, canal_borda_altura,
      // chanfro_tamanho, pedra_fileiras, e pedras_detalhadas era hardcoded
      // como '[]'. Resultado: anel 2 nascia incompleto e a tela mostrava "—"
      // até um segundo save sobrescrever via UPDATE.
      const [newFicha] = await sql`
        INSERT INTO alissonerp.orcamento_fichas_tecnicas (
          modelo, aro_numeracao, largura, espessura, peso_estimado,
          perfil, diametro, densidade_ouro, cor_metal,
          tipo_fonte, texto, qtd_pedras, tamanho_pedra, tipo_pedra, tipo_aplicacao_pedra,
          profundidade_concava, has_friso, friso_kind, friso_tipo,
          friso_lado, friso_largura, friso_profundidade, friso_offset,
          canal_largura, canal_borda_altura, chanfro_tamanho, dome_porcentagem,
          pedra_fileiras, pedra_drill, pedra_meia_lua, pedra_volta_completa,
          pedras_detalhadas
        ) VALUES (
          ${ficha2.modelo ?? null}, ${ficha2.aro_numeracao ?? null},
          ${ficha2.largura ?? null}, ${ficha2.espessura ?? null}, ${ficha2.peso_estimado ?? null},
          ${ficha2.perfil ?? null}, ${ficha2.diametro ?? null},
          ${ficha2.densidade_ouro ?? null}, ${ficha2.cor_metal ?? null},
          ${ficha2.tipo_fonte ?? null}, ${ficha2.texto ?? null},
          ${ficha2.qtd_pedras ?? null}, ${ficha2.tamanho_pedra ?? null}, ${ficha2.tipo_pedra ?? null},
          ${ficha2.tipo_aplicacao_pedra ?? null},
          ${ficha2.profundidade_concava ?? null},
          ${ficha2.has_friso ?? false}, ${ficha2.friso_kind ?? "friso"}, ${ficha2.friso_tipo ?? null},
          ${ficha2.friso_lado ?? null},
          ${ficha2.friso_largura ?? null}, ${ficha2.friso_profundidade ?? null},
          ${ficha2.friso_offset ?? null},
          ${ficha2.canal_largura ?? null}, ${ficha2.canal_borda_altura ?? null},
          ${ficha2.chanfro_tamanho ?? null}, ${ficha2.dome_porcentagem ?? null},
          ${ficha2.pedra_fileiras ?? null}, ${ficha2.pedra_drill ?? false},
          ${ficha2.pedra_meia_lua ?? false}, ${ficha2.pedra_volta_completa ?? false},
          ${sql.json(ficha2.pedras_detalhadas ?? [])}
        ) RETURNING id
      `;
      ficha2Id = newFicha.id as number;
    }
  }

  // snapshot=null → preserva colunas snapshot+congelado_em.
  // snapshot=objeto → sobrescreve e carimba congelado_em=NOW().
  // Fragment dinâmico evita `could not determine data type` que postgres@3
  // emite ao passar null como parâmetro pra coluna JSONB via COALESCE.
  const hasSnapshot = snapshot != null && typeof snapshot === "object";
  const snapshotSql = hasSnapshot
    ? sql`snapshot = ${sql.json(snapshot)}, congelado_em = NOW(),`
    : sql``;

  // Regra do lock (regressão v2.42.0):
  //  - true              → trava sempre
  //  - undefined/null    → preserva o valor atual (COALESCE)
  //  - false sem permissão → IGNORA (qualquer não-admin não destrava)
  //  - false com permissão → destrava (admin/desenvolvedor)
  // Antes, qualquer cliente API podia mandar false e destravar silenciosamente
  // o valor negociado, reabrindo a janela pro bug original do v2.42.0.
  const [currentLock] = await sql`SELECT valor_negociado_locked FROM alissonerp.orcamentos WHERE id = ${orcId}`;
  const currentLockVal = currentLock?.valor_negociado_locked === true;
  let lockedToPersist: boolean;
  if (valor_negociado_locked === true) lockedToPersist = true;
  else if (valor_negociado_locked === false && canUnlock) lockedToPersist = false;
  else lockedToPersist = currentLockVal;

  await sql`
    UPDATE alissonerp.orcamentos SET
      nome_cliente = COALESCE(${nome_cliente ?? null}, nome_cliente),
      nome_modelo = COALESCE(${nome_modelo ?? null}, nome_modelo),
      peso = COALESCE(${peso ?? null}, peso),
      valor = COALESCE(${valor ?? null}, valor),
      markup = COALESCE(${markup ?? null}, markup),
      desconto_pct = COALESCE(${desconto_pct ?? null}, desconto_pct),
      cotacao_ouro = COALESCE(${cotacao_ouro ?? null}, cotacao_ouro),
      cotacao_dolar = COALESCE(${cotacao_dolar ?? null}, cotacao_dolar),
      valor_ouro = COALESCE(${valor_ouro ?? null}, valor_ouro),
      valor_pedras = COALESCE(${valor_pedras ?? null}, valor_pedras),
      tipo = COALESCE(${tipo ?? null}, tipo),
      quantidade = COALESCE(${quantidade ?? null}, quantidade),
      cliente_id = COALESCE(${cliente_id ?? null}, cliente_id),
      foto_3d = COALESCE(${foto3dUrl ?? null}, foto_3d),
      ficha_tecnica_2_id = COALESCE(${ficha2Id ?? null}, ficha_tecnica_2_id),
      ${snapshotSql}
      valor_negociado_locked = ${lockedToPersist},
      updated_at = NOW()
    WHERE id = ${orcId}
  `;

  // Retorna updated_at pra o cliente sincronizar e poder enviar próximo PUT
  // com client_updated_at correto.
  const [updated] = await sql`SELECT updated_at FROM alissonerp.orcamentos WHERE id = ${orcId}`;
  return NextResponse.json({ ok: true, updated_at: updated?.updated_at });
}
