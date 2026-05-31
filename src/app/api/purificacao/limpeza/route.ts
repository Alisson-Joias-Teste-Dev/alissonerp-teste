import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { STATUS_BAIXA_OURO, STATUS_LABEL, validarTransicao } from "@/lib/cofre-ouro-status";

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
  foto_entrada: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

const ConcluirLimpezaSchema = z.object({
  baixa_id: z.coerce.number().int().positive(),
  peso_saida: z.coerce.number().positive(),
  foto_saida: z.string().min(1),
  obs: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const statusFiltro = req.nextUrl.searchParams.get("status") || "em_limpeza";

  const rows = await sql`
    SELECT
      id, gramas, destino, status, protocolo_id,
      realizado_nome, transportador_nome, recebedor_nome,
      confirmado_em, foto_comprovacao, obs,
      created_at, updated_at
    FROM alissonerp.cofre_ouro_baixas
    WHERE status = ${statusFiltro}
    ORDER BY id DESC
    LIMIT 50
  `;

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
    const { baixa_id, peso_saida, foto_saida, obs } = parsedConcluir.data;

    /**
     * REGRA DE NEGÓCIO: ao concluir limpeza, o operador informa peso limpo + foto.
     * Dados são armazenados como JSON no campo obs da baixa + foto_comprovacao.
     * Transitado em_limpeza → aguardando_aprovacao.
     */
    return concluirLimpeza(user, baixa_id, peso_saida, foto_saida, obs);
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
  foto_entrada?: string,
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

  const [atualizada] = await sql`
    UPDATE alissonerp.cofre_ouro_baixas
    SET status = ${STATUS_BAIXA_OURO.EM_LIMPEZA},
        foto_comprovacao = COALESCE(${foto_entrada ?? null}, foto_comprovacao),
        obs = ${obs ?? null} || COALESCE(obs, ''),
        updated_at = now()
    WHERE id = ${baixa_id}
    RETURNING id, status, gramas, destino, created_at
  `;

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
        ${obs ?? 'Limpeza iniciada'}
      )
  `;

  return NextResponse.json(atualizada);
}

async function concluirLimpeza(
  user: { id: string; email?: string },
  baixa_id: number,
  peso_saida: number,
  foto_saida: string,
  obs?: string,
) {
  const [baixa] = await sql`
    SELECT id, status, gramas, destino, obs FROM alissonerp.cofre_ouro_baixas WHERE id = ${baixa_id}
  `;
  if (!baixa) return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  if (!validarTransicao(baixa.status, STATUS_BAIXA_OURO.AGUARDANDO_APROVACAO)) {
    return NextResponse.json({ error: "Baixa não está em limpeza" }, { status: 400 });
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
  const dadosLimpezaTexto = [
    `Limpeza concluída por ${nome}`,
    `Peso sujo: ${Number(baixa.gramas).toFixed(3)}g`,
    `Peso limpo: ${Number(peso_saida).toFixed(3)}g`,
    `Perda: ${Number(perda).toFixed(3)}g`,
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
        ${dadosLimpezaTexto}
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

  return NextResponse.json(atualizada);
}
