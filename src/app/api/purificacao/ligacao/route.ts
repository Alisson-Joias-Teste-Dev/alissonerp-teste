import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql, { normalizeRow } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const LigacaoPostSchema = z.object({
  tipo_18k_insumo_id: z.coerce.number().int().positive(),
  peso_24k: z.coerce.number().positive(),
  pureza: z.coerce.number().optional(),
  teor: z.coerce.number(),
  foto_envio: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  throw e;
}

// GET /api/purificacao/ligacao?status=em_processo&page=1
export async function GET(req: NextRequest) {
  try { await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const status = req.nextUrl.searchParams.get("status");
  const page   = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const rows = status
    ? await sql`
        SELECT
          l.id,
          l.status,
          l.tipo_18k_insumo_id,
          l.tipo_18k_nome,
          l.liga_insumo_id,
          l.liga_nome,
          l.peso_24k,
          l.pureza,
          l.teor,
          l.peso_liga_calculado,
          l.peso_18k_esperado,
          l.foto_envio,
          l.observacao_envio,
          l.data_envio,
          l.peso_18k_real,
          l.perda_processo,
          l.perda_percentual,
          l.foto_resultado,
          l.observacao_resultado,
          l.data_conclusao,
          l.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.ligacoes l
        LEFT JOIN public.user_profiles up ON up.id_user = l.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = l.concluido_por
        WHERE l.status = ${status}
        ORDER BY l.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          l.id,
          l.status,
          l.tipo_18k_insumo_id,
          l.tipo_18k_nome,
          l.liga_insumo_id,
          l.liga_nome,
          l.peso_24k,
          l.pureza,
          l.teor,
          l.peso_liga_calculado,
          l.peso_18k_esperado,
          l.foto_envio,
          l.observacao_envio,
          l.data_envio,
          l.peso_18k_real,
          l.perda_processo,
          l.perda_percentual,
          l.foto_resultado,
          l.observacao_resultado,
          l.data_conclusao,
          l.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.ligacoes l
        LEFT JOIN public.user_profiles up ON up.id_user = l.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = l.concluido_por
        ORDER BY l.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const [countRow] = status
    ? await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ligacoes WHERE status = ${status}`
    : await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ligacoes`;

  const [statsRow] = await sql`
    SELECT
      COUNT(CASE WHEN status = 'em_processo' THEN 1 END)::int          AS em_processo_count,
      COALESCE(SUM(CASE WHEN status = 'em_processo' THEN peso_24k END), 0)::numeric AS em_processo_g,
      COUNT(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS concluidas_30d,
      COALESCE(AVG(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN perda_percentual END), 0)::numeric AS perda_media_pct
    FROM alissonerp.ligacoes
  `;

  const NUMERIC_FIELDS = ["peso_24k", "pureza", "teor", "peso_liga_calculado", "peso_18k_esperado", "peso_18k_real", "perda_processo", "perda_percentual"];
  const ligacoes = rows.map(row => normalizeRow(row as Record<string, unknown>, NUMERIC_FIELDS));

  return NextResponse.json({
    ligacoes,
    total: (countRow as { total: number }).total,
    stats: {
      em_processo_count: (statsRow as any).em_processo_count,
      em_processo_g:     Number((statsRow as any).em_processo_g),
      concluidas_30d:    (statsRow as any).concluidas_30d,
      perda_media_pct:   Number((statsRow as any).perda_media_pct),
    },
  });
}

// POST /api/purificacao/ligacao — Criar nova ligação
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const raw = await req.json().catch(() => ({}));
  const parsed = LigacaoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tipo_18k_insumo_id, peso_24k, pureza = 100, teor, foto_envio, observacao } = parsed.data;

  // Verificar permissão granular (admin/dev/diretor passam sempre)
  if (!isFullAccess(user.role)) {
    const [perm] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user.id}::uuid AND acao = 'abrir_ligacao'
    `;
    if (!perm?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação. Solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  if (!tipo_18k_insumo_id || !Number.isInteger(tipo_18k_insumo_id)) {
    return NextResponse.json({ error: "tipo_18k_insumo_id obrigatório" }, { status: 400 });
  }

  if (!peso_24k || peso_24k <= 0) {
    return NextResponse.json({ error: "peso_24k deve ser maior que zero" }, { status: 400 });
  }

  if (!teor || teor <= 0.01 || teor > 1.0) {
    return NextResponse.json({ error: "teor inválido. Deve ser entre 0.01 e 1.00" }, { status: 400 });
  }

  // Buscar mapeamento liga↔tipo
  const [mapeamento] = await sql`
    SELECT
      lto.id,
      lto.liga_insumo_id,
      lto.teor_default,
      i18k.nome  AS tipo_18k_nome,
      iliga.nome AS liga_nome
    FROM alissonerp.liga_tipo_ouro lto
    JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
    JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
    WHERE lto.tipo_18k_insumo_id = ${tipo_18k_insumo_id}
      AND lto.ativo = true
    LIMIT 1
  `;

  if (!mapeamento) {
    return NextResponse.json(
      { error: "Liga não configurada para este tipo de 18k" },
      { status: 400 },
    );
  }

  const liga_insumo_id  = (mapeamento as any).liga_insumo_id as number;
  const teor_default    = Number((mapeamento as any).teor_default);
  const tipo_18k_nome   = (mapeamento as any).tipo_18k_nome  as string;
  const liga_nome       = (mapeamento as any).liga_nome      as string;

  // REGRA DE NEGÓCIO: o teor define quanto de liga é consumido e quanto de 18k é gerado
  // (ouro = dinheiro). O cadeado de "editar teor manual" existe na tela, mas a tela pode ser
  // burlada por requisição direta — por isso a permissão é REVALIDADA aqui no servidor.
  // Só checa quando o teor enviado difere do teor_default do tipo (tolerância de float, §3).
  // IMPACTO se removido: usuário sem 'editar_teor_ligacao' poderia forjar teor arbitrário,
  // alterando o consumo de liga e a produção de 18k sem rastro de permissão.
  const teorDivergeDoPadrao = Math.abs(teor - teor_default) > 0.0001;
  if (teorDivergeDoPadrao && !isFullAccess(user.role)) {
    const [permTeor] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user.id}::uuid AND acao = 'editar_teor_ligacao'
    `;
    if (!permTeor?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para alterar o teor. Use o teor padrão ou solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  const ouro24kLigaId = await getParametroNumber(PARAM.OURO_24K_LIGA_INSUMO_ID);
  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // Calcular pesos (com pureza)
  const pureza_decimal      = Math.min(Math.max(pureza, 0), 100) / 100;
  const ouro_puro_real      = Number((peso_24k * pureza_decimal).toFixed(3));
  const peso_18k_esperado   = Number((ouro_puro_real / teor).toFixed(3));
  const peso_liga_calculado = Number((peso_18k_esperado - peso_24k).toFixed(3));

  // REGRA DE NEGÓCIO (§3): a ligação consome do POTE = depósito ID=1 (Almoxarifado Central).
  // O saldo tem que vir de vw_saldo_estoque filtrado nesse depósito (SUM(saldo)), NÃO do total
  // global. vw_detalhe_pote soma TODOS os depósitos (inclui operadores), e um operador negativo
  // derrubava o "Disponível" — mostrando/bloqueando menos ouro do que o pote realmente tem.
  // IMPACTO se voltar ao total global: tela engana e o backend bloqueia ligações válidas.
  const [saldo24kRow] = await sql`
    SELECT COALESCE(SUM(saldo), 0)::numeric AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE insumo_id = ${ouro24kLigaId} AND deposito_id = ${almoxarifadoId}
  `;
  const saldo24k = Number((saldo24kRow as any)?.saldo ?? 0);
  if (peso_24k > saldo24k) {
    return NextResponse.json(
      { error: `Saldo insuficiente de Ouro 24k. Saldo: ${saldo24k.toFixed(3)}g, Solicitado: ${peso_24k}g` },
      { status: 400 },
    );
  }

  // Verificar saldo da liga no pote (mesma regra: depósito 1)
  const [saldoLigaRow] = await sql`
    SELECT COALESCE(SUM(saldo), 0)::numeric AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE insumo_id = ${liga_insumo_id} AND deposito_id = ${almoxarifadoId}
  `;
  const saldoLiga = Number((saldoLigaRow as any)?.saldo ?? 0);
  if (peso_liga_calculado > saldoLiga) {
    return NextResponse.json(
      { error: `Saldo insuficiente de ${liga_nome}. Saldo: ${saldoLiga.toFixed(3)}g, Necessário: ${peso_liga_calculado.toFixed(3)}g` },
      { status: 400 },
    );
  }

  // Upload foto
  let foto_url: string | null = null;
  if (foto_envio) {
    const timestamp = Date.now();
    const uploadResult = await uploadFile(
      "purificacao-fotos",
      `ligacao-envio-${timestamp}.jpg`,
      foto_envio,
      "image/jpeg",
    );
    if ("error" in uploadResult) {
      return NextResponse.json({ error: `Erro ao fazer upload da foto: ${uploadResult.error}` }, { status: 500 });
    }
    foto_url = uploadResult.url;
  }

  // Inserir ligação + as 2 CEs de saída em UMA transação atômica (§0 dupla-entrada).
  // IMPACTO se removido: se a 2ª CE falhar, ouro/liga sai do pote sem contrapartida e a
  // ligação fica órfã → saldo do pote inconsistente. Aqui é "ou grava tudo, ou nada".
  let ligacao_id = 0;
  let saldoErro: string | null = null;
  try {
    await sql.begin(async (tx: any) => {
      // Trava as linhas dos insumos (ordem de id p/ evitar deadlock) — serializa ligações
      // concorrentes sobre os mesmos insumos e fecha o race do saldo (TOCTOU).
      await tx`
        SELECT id FROM alissonerp.insumos
        WHERE id IN (${ouro24kLigaId}, ${liga_insumo_id})
        ORDER BY id
        FOR UPDATE
      `;

      // Reconfere saldo DENTRO da transação (autoritativo) — pode ter mudado entre a
      // checagem inicial e o upload da foto. Mesma regra §3: saldo do POTE (depósito 1).
      const [s24] = await tx`
        SELECT COALESCE(SUM(saldo), 0)::numeric AS saldo
        FROM alissonerp.vw_saldo_estoque
        WHERE insumo_id = ${ouro24kLigaId} AND deposito_id = ${almoxarifadoId}
      `;
      const saldo24kTx = Number((s24 as any)?.saldo ?? 0);
      if (peso_24k > saldo24kTx) {
        saldoErro = `Saldo insuficiente de Ouro 24k. Saldo: ${saldo24kTx.toFixed(3)}g, Solicitado: ${peso_24k}g`;
        throw new Error("SALDO_INSUFICIENTE");
      }

      const [sLiga] = await tx`
        SELECT COALESCE(SUM(saldo), 0)::numeric AS saldo
        FROM alissonerp.vw_saldo_estoque
        WHERE insumo_id = ${liga_insumo_id} AND deposito_id = ${almoxarifadoId}
      `;
      const saldoLigaTx = Number((sLiga as any)?.saldo ?? 0);
      if (peso_liga_calculado > saldoLigaTx) {
        saldoErro = `Saldo insuficiente de ${liga_nome}. Saldo: ${saldoLigaTx.toFixed(3)}g, Necessário: ${peso_liga_calculado.toFixed(3)}g`;
        throw new Error("SALDO_INSUFICIENTE");
      }

      const [ligacao] = await tx`
        INSERT INTO alissonerp.ligacoes (
          status,
          tipo_18k_insumo_id, tipo_18k_nome,
          liga_insumo_id, liga_nome,
          peso_24k, pureza, teor,
          peso_liga_calculado, peso_18k_esperado,
          foto_envio, observacao_envio,
          data_envio, criado_por
        ) VALUES (
          'em_processo',
          ${tipo_18k_insumo_id}, ${tipo_18k_nome},
          ${liga_insumo_id}, ${liga_nome},
          ${peso_24k}, ${Number(pureza.toFixed(2))}, ${Number(teor.toFixed(4))},
          ${peso_liga_calculado}, ${peso_18k_esperado},
          ${foto_url},
          ${observacao ?? null},
          NOW(),
          ${user.id}::uuid
        )
        RETURNING id
      `;
      ligacao_id = (ligacao as { id: number }).id;

      // CE saída 24k do pote — insumo_id vem do PARÂMETRO (não literal 275), §5.
      // IMPACTO se voltar a ser literal: a checagem de saldo e a movimentação podem apontar
      // para insumos diferentes caso o parâmetro mude.
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, marcador, observacao, created_by, created_at, local_estoque_id)
        VALUES (
          ${ouro24kLigaId}, 1,
          ${peso_24k}::real,
          'LIGA_SAIDA_24K'::alissonerp.enum_marcador_estoque,
          ${'Ligação #' + ligacao_id + ' — saída Ouro 24k'},
          ${user.id}::uuid,
          NOW(), 1
        )
      `;

      // CE saída liga do pote
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, marcador, observacao, created_by, created_at, local_estoque_id)
        VALUES (
          ${liga_insumo_id}, 1,
          ${peso_liga_calculado}::real,
          'LIGA_SAIDA_LIGA'::alissonerp.enum_marcador_estoque,
          ${'Ligação #' + ligacao_id + ' — saída ' + liga_nome},
          ${user.id}::uuid,
          NOW(), 1
        )
      `;
    });
  } catch (e) {
    // Saldo insuficiente detectado dentro da tx → 400 amigável; demais erros sobem.
    if (saldoErro) {
      return NextResponse.json({ error: saldoErro }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ id: ligacao_id, ok: true });
}
