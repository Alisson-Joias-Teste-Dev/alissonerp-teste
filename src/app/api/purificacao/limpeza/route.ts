import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { STATUS_BAIXA_OURO, STATUS_LABEL, validarTransicao } from "@/lib/cofre-ouro-status";
import { criarNotificacao } from "@/lib/notificacoes";

/**
 * REGRA DE NEGÓCIO: API de limpeza de metal sujo (sangria).
 *
 * O QUE: recebe baixas "recebido" para limpeza e transita status
 *   recebido → em_limpeza → aguardando_aprovacao.
 * POR QUE: separa responsabilidade — limpeza fica em Purificação,
 *   não na tela de baixa ou protocolo.
 * IMPACTO SE REMOVIDO: sem esta API a aba Limpeza não funciona.
 */

const IniciarLimpezaSchema = z.object({
  baixa_id: z.coerce.number().int().positive(),
  foto_entrada: z.string().min(1),
  obs: z.string().optional(),
}).passthrough();

const ConcluirLimpezaSchema = z.object({
  baixa_id: z.coerce.number().int().positive(),
  peso_saida: z.coerce.number().positive(),
  foto_saida: z.string().min(1),
  houve_pedras: z.coerce.boolean().optional().default(false),
  peso_pedras: z.coerce.number().positive().optional(),
  foto_peso_pedras: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const statusFiltro = req.nextUrl.searchParams.get("status");
  const baixaIdRaw = req.nextUrl.searchParams.get("baixa_id");
  const baixaId = baixaIdRaw ? Number(baixaIdRaw) : null;

  if (baixaIdRaw && (!baixaId || Number.isNaN(baixaId))) {
    return NextResponse.json({ error: "baixa_id inválido" }, { status: 400 });
  }

  const rows = await sql`
    SELECT
      b.id, b.gramas, b.destino, b.status, b.protocolo_id,
      b.realizado_nome, b.transportador_nome, b.recebedor_nome,
      b.confirmado_em, b.foto_comprovacao, b.obs,
      b.created_at, b.updated_at,
      l.id AS limpeza_id,
      l.tentativa AS limpeza_tentativa,
      l.status AS limpeza_status,
      l.peso_sujo AS limpeza_peso_sujo,
      l.peso_limpo AS limpeza_peso_limpo,
      l.perda_bruta_g AS limpeza_perda_bruta_g,
      l.perda_bruta_pct AS limpeza_perda_bruta_pct,
      l.perda_ouro_g AS limpeza_perda_ouro_g,
      l.perda_ouro_pct AS limpeza_perda_ouro_pct,
      l.houve_pedras AS limpeza_houve_pedras,
      l.peso_pedras AS limpeza_peso_pedras,
      l.foto_antes_path AS limpeza_foto_antes_path,
      l.foto_depois_path AS limpeza_foto_depois_path,
      l.foto_peso_pedras_path AS limpeza_foto_peso_pedras_path
    FROM alissonerp.cofre_ouro_baixas b
    LEFT JOIN LATERAL (
      SELECT id, tentativa, status, peso_sujo, peso_limpo, perda_bruta_g,
             perda_bruta_pct, perda_ouro_g, perda_ouro_pct, houve_pedras, peso_pedras, foto_antes_path,
             foto_depois_path, foto_peso_pedras_path
      FROM alissonerp.limpezas_ouro
      WHERE baixa_id = b.id
      ORDER BY tentativa DESC
      LIMIT 1
    ) l ON true
    WHERE 1=1
      ${statusFiltro ? sql`AND b.status = ${statusFiltro}` : sql``}
      ${baixaId ? sql`AND b.id = ${baixaId}` : sql``}
    ORDER BY b.id DESC
    LIMIT ${baixaId ? 1 : 50}
  `;

  if (baixaId) return NextResponse.json(rows[0] ?? null);
  return NextResponse.json(rows);
}

/**
 * REGRA DE NEGÓCIO: inicia limpeza de uma baixa recebida.
 * Transita recebido → em_limpeza.
 */
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const isIniciar = raw.acao === "iniciar";
  const isConcluir = raw.acao === "concluir";

  if (isConcluir) {
    const parsedConcluir = ConcluirLimpezaSchema.safeParse(raw);
    if (!parsedConcluir.success) return zodError(parsedConcluir.error);
    const { baixa_id, peso_saida, foto_saida, houve_pedras, peso_pedras, foto_peso_pedras, obs } = parsedConcluir.data;

    if (houve_pedras && (!peso_pedras || !foto_peso_pedras?.trim())) {
      return NextResponse.json(
        { error: "Peso das pedras e foto do peso das pedras são obrigatórios quando houver pedras removidas" },
        { status: 400 }
      );
    }

    /**
     * REGRA DE NEGÓCIO: ao concluir limpeza, o operador informa peso limpo + foto.
     * Dados são armazenados como JSON no campo obs da baixa + foto_comprovacao.
     * Transitado em_limpeza → aguardando_aprovacao.
     */
    return concluirLimpeza(user, baixa_id, peso_saida, foto_saida, houve_pedras, peso_pedras, foto_peso_pedras, obs);
  }

  const parsedIniciar = IniciarLimpezaSchema.safeParse(raw);
  if (!parsedIniciar.success) return zodError(parsedIniciar.error);
  const { baixa_id, foto_entrada, obs } = parsedIniciar.data;

  /**
   * REGRA DE NEGÓCIO: iniciar limpeza da baixa.
   * Transitado recebido → em_limpeza com foto opcional de entrada.
   */
  return iniciarLimpeza(user, baixa_id, foto_entrada, obs);
}

async function iniciarLimpeza(
  user: { id: string; email?: string },
  baixa_id: number,
  foto_entrada: string,
  obs?: string,
) {
  // Validar que baixa existe e está em status recebido
  const [baixa] = await sql`
    SELECT id, status, gramas, destino FROM alissonerp.cofre_ouro_baixas WHERE id = ${baixa_id}
  `;
  if (!baixa) return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  if (!validarTransicao(baixa.status, STATUS_BAIXA_OURO.EM_LIMPEZA)) {
    return NextResponse.json({ error: "Baixa não está em status recebido" }, { status: 400 });
  }

  const [usuario] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const nome = usuario?.nome ?? user.email ?? "Sistema";

  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_limpeza' LIMIT 1
  `;
  const aprovadorId = String(cfg?.valor ?? "").trim();
  if (!aprovadorId) {
    return NextResponse.json(
      { error: "Aprovador de limpeza não configurado em Configurações > Aprovadores." },
      { status: 409 }
    );
  }

  const atualizada = await sql.begin(async (tx: any) => {
    const [row] = await tx`
      UPDATE alissonerp.cofre_ouro_baixas
      SET status = ${STATUS_BAIXA_OURO.EM_LIMPEZA},
          obs = CASE
            WHEN ${obs ?? null}::text IS NULL THEN obs
            WHEN obs IS NULL OR obs = '' THEN ${obs ?? null}
            ELSE obs || ' | ' || ${obs ?? null}
          END,
          updated_at = now()
      WHERE id = ${baixa_id}
      RETURNING id, status, gramas, destino, created_at
    `;

    /**
     * REGRA DE NEGÓCIO: cada início da limpeza gera uma tentativa nova com
     * foto obrigatória do metal antes do processo.
     * O QUE: persiste a evidência em tabela própria, sem sobrescrever foto de
     * protocolo/recebimento da baixa.
     * POR QUE: a aprovação precisa comparar antes/depois e reprovações podem
     * gerar novas tentativas.
     * IMPACTO SE REMOVIDO: aprovação fica sem prova visual inicial.
     */
    const [tentativaRow] = await tx`
      SELECT COALESCE(MAX(tentativa), 0) + 1 AS tentativa
      FROM alissonerp.limpezas_ouro
      WHERE baixa_id = ${baixa_id}
    `;
    await tx`
      INSERT INTO alissonerp.limpezas_ouro
        (baixa_id, tentativa, status, peso_sujo, foto_antes_path, operador_inicio_id)
      VALUES
        (${baixa_id}, ${Number(tentativaRow.tentativa)}, 'em_limpeza', ${Number(baixa.gramas)}, ${foto_entrada}, ${user.id}::uuid)
    `;

    return row;
  });

  await sql`
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (baixa_id, evento, gramas, origem_nome, destino_nome, observacao)
    VALUES
      (
        ${baixa_id},
        'limpeza_iniciada',
        ${Number(baixa.gramas)},
        ${nome},
        ${String((baixa as any).destino ?? '')},
        ${obs ? `Limpeza iniciada | Foto antes: ${foto_entrada} | ${obs}` : `Limpeza iniciada | Foto antes: ${foto_entrada}`}
      )
  `;

  return NextResponse.json(atualizada);
}

async function concluirLimpeza(
  user: { id: string; email?: string },
  baixa_id: number,
  peso_saida: number,
  foto_saida: string,
  houve_pedras: boolean,
  peso_pedras?: number,
  foto_peso_pedras?: string,
  obs?: string,
) {
  const [baixa] = await sql`
    SELECT id, status, gramas, destino, obs FROM alissonerp.cofre_ouro_baixas WHERE id = ${baixa_id}
  `;
  if (!baixa) return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  if (!validarTransicao(baixa.status, STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO)) {
    return NextResponse.json({ error: "Baixa não está em limpeza" }, { status: 400 });
  }
  if (peso_saida > Number(baixa.gramas)) {
    return NextResponse.json({ error: "Peso de saída não pode ser maior que o peso sujo" }, { status: 400 });
  }

  const [limpeza] = await sql`
    SELECT id, tentativa, foto_antes_path
    FROM alissonerp.limpezas_ouro
    WHERE baixa_id = ${baixa_id}
      AND status = 'em_limpeza'
    ORDER BY tentativa DESC
    LIMIT 1
  `;
  if (!limpeza) {
    return NextResponse.json({ error: "Tentativa de limpeza não encontrada. Inicie a limpeza novamente com foto antes." }, { status: 409 });
  }

  const [usuario] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const nome = usuario?.nome ?? user.email ?? "Sistema";

  /**
   * REGRA DE NEGÓCIO: somente pode concluir limpeza se existir aprovador
   * configurado, porque o próximo estado é aguardando aprovação formal.
   *
   * O QUE: valida e captura `aprovador_limpeza` para criar tarefa e vínculo.
   * POR QUE: evita baixa presa em aguardando_aprovacao sem responsável.
   * IMPACTO SE REMOVIDO: cria tarefa inválida/sem dono e quebra o fluxo de
   * aprovação da limpeza.
   */
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_limpeza' LIMIT 1
  `;
  const aprovadorId = String(cfg?.valor ?? "").trim();
  if (!aprovadorId) {
    return NextResponse.json(
      { error: "Aprovador de limpeza não configurado em Configurações > Aprovadores." },
      { status: 409 }
    );
  }

  /**
   * REGRA DE NEGÓCIO: dados da limpeza (peso limpo, perda, operador)
   * são armazenados como JSON no campo obs da baixa até que haja colunas dedicadas.
   * foto_comprovacao é sobrescrita com a foto de saída da limpeza.
   */
  const perda = Number(baixa.gramas) - peso_saida;
  const perdaPct = Number(baixa.gramas) > 0 ? (perda / Number(baixa.gramas)) * 100 : 0;
  const perdaOuro = houve_pedras ? perda - Number(peso_pedras ?? 0) : perda;
  if (perdaOuro < -0.001) {
    return NextResponse.json({ error: "Peso limpo + peso das pedras não pode ultrapassar o peso sujo" }, { status: 400 });
  }
  const perdaOuroPct = Number(baixa.gramas) > 0 ? (Math.max(perdaOuro, 0) / Number(baixa.gramas)) * 100 : 0;
  const dadosLimpezaTexto = [
    `Limpeza concluída por ${nome}`,
    `Peso sujo: ${Number(baixa.gramas).toFixed(3)}g`,
    `Peso limpo: ${Number(peso_saida).toFixed(3)}g`,
    `Perda: ${Number(perda).toFixed(3)}g`,
    houve_pedras ? `Perda ouro: ${Math.max(perdaOuro, 0).toFixed(3)}g` : null,
    houve_pedras ? `Pedras removidas: ${Number(peso_pedras).toFixed(3)}g` : null,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    obs ? `Obs: ${obs}` : null,
  ].filter(Boolean).join(" | ");

  const [atualizada] = await sql`
    UPDATE alissonerp.cofre_ouro_baixas
    SET status = ${STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO},
        foto_comprovacao = ${foto_saida},
        obs = CASE
          WHEN obs IS NULL OR obs = '' THEN ${dadosLimpezaTexto}
          ELSE obs || ' | ' || ${dadosLimpezaTexto}
        END,
        updated_at = now()
    WHERE id = ${baixa_id}
    RETURNING id, status, gramas, destino
  `;

  /**
   * REGRA DE NEGÓCIO: conclusão da limpeza v2 exige foto depois e, quando
   * houver pedras, peso/foto das pedras removidas.
   * O QUE: grava os dados estruturados usados pela aprovação e pelo estoque.
   * POR QUE: evita regex em obs como fonte de peso/foto e mantém histórico por
   * tentativa.
   * IMPACTO SE REMOVIDO: aprovador não consegue auditar antes/depois/pedras.
   */
  await sql`
    UPDATE alissonerp.limpezas_ouro
    SET status = 'aguardando_aprovacao',
        peso_limpo = ${peso_saida},
        perda_bruta_g = ${perda},
        perda_bruta_pct = ${perdaPct},
        perda_ouro_g = ${Math.max(perdaOuro, 0)},
        perda_ouro_pct = ${perdaOuroPct},
        houve_pedras = ${houve_pedras},
        peso_pedras = ${houve_pedras ? peso_pedras ?? null : null},
        foto_depois_path = ${foto_saida},
        foto_peso_pedras_path = ${houve_pedras ? foto_peso_pedras ?? null : null},
        operador_conclusao_id = ${user.id}::uuid,
        updated_at = now()
    WHERE id = ${Number(limpeza.id)}
  `;

  await sql`
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (baixa_id, evento, gramas, origem_nome, destino_nome, observacao)
    VALUES
      (
        ${baixa_id},
        'limpeza_concluida',
        ${Number(peso_saida)},
        ${nome},
        ${String(baixa.destino)},
        ${`${dadosLimpezaTexto} | Foto antes: ${String(limpeza.foto_antes_path)} | Foto depois: ${foto_saida}${houve_pedras ? ` | Foto pedras: ${foto_peso_pedras}` : ''}`}
      )
  `;

  /**
   * REGRA DE NEGÓCIO: limpeza concluída deve gerar tarefa para o aprovador
   * configurado em Configurações > Aprovadores (aprovador_limpeza).
   */
  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo)
    VALUES (
      ${`Aprovação de Quebra Limpeza Baixa Ouro #${baixa_id}`},
      ${[
        `Baixa: #${baixa_id}`,
        `Destino: ${String(baixa.destino)}`,
        `Peso sujo: ${Number(baixa.gramas).toFixed(3)}g`,
        `Peso limpo: ${Number(peso_saida).toFixed(3)}g`,
        `Perda: ${Number(perda).toFixed(3)}g`,
      ].join("\n")},
      ${aprovadorId}::uuid,
      ${user.id}::uuid,
      'alta',
      'aguardando_aprovacao',
      ${sql.array([`limpeza_ouro:${baixa_id}`, `cofre_baixa:${baixa_id}`])},
      /**
       * REGRA DE NEGÓCIO: esta tarefa NÃO é confirmação de recebimento.
       *
       * O QUE: usa tipo específico de aprovação de quebra da limpeza.
       * POR QUE: aprovador valida a perda/quebra (peso sujo x limpo), não o
       *   recebimento logístico do metal.
       * IMPACTO SE REMOVIDO: a UI pode exibir ações com nomenclatura errada
       *   ("Confirmar Recebimento") para um fluxo de quebra.
       */
      'aprovacao_quebra_metal'
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${tarefa.id}, ${user.id}::uuid, ${aprovadorId}::uuid, 'pendente')
  `;

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo: `Aprovação de Quebra Limpeza Baixa Ouro #${baixa_id}`,
    mensagem: [
      `Baixa: #${baixa_id}`,
      `Destino: ${String(baixa.destino)}`,
      `Peso sujo: ${Number(baixa.gramas).toFixed(3)}g`,
      `Peso limpo: ${Number(peso_saida).toFixed(3)}g`,
      `Perda: ${Number(perda).toFixed(3)}g`,
    ].join("\n"),
    remetenteId: user.id,
    link: `/tarefas?abrir=${tarefa.id}`,
  }).catch(() => {});

  return NextResponse.json(atualizada);
}
