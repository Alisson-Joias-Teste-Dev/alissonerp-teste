import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { STATUS_BAIXA_OURO, validarTransicao } from "@/lib/cofre-ouro-status";

const CofreBaixaPostSchema = z.object({
  gramas: z.coerce.number().positive(),
  destino: z.enum(["alisson", "fabrica", "service"]),
  transportador_id: z.string().optional(),
  transportador_nome: z.string().optional(),
  obs: z.string().optional(),
  itens: z.array(z.object({
    /**
     * REGRA DE NEGÓCIO: Upgrade é uma entrada física de ouro no cofre, apesar de
     * nascer como item de venda e não como forma de pagamento.
     * O QUE: permite baixar itens de origem "upgrade" junto das fontes já existentes.
     * POR QUE: o peso do upgrade vira responsabilidade da empresa após aprovação da venda.
     * IMPACTO SE REMOVIDO: upgrades registrados no cofre ficam sem caminho auditável de baixa.
     */
    origem_tipo: z.enum(["venda_ouro", "compra_metal", "recebimento_metal", "conversao", "upgrade"]),
    origem_id: z.coerce.number().int().positive(),
    referencia: z.string().min(1),
    pessoa_nome: z.string().optional(),
    data_origem: z.string().optional(),
    gramas: z.coerce.number().positive(),
    valor_brl: z.coerce.number().nonnegative().optional(),
  })).min(1),
}).passthrough();

const CofreBaixaPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.string().min(1),
}).passthrough();

// GET /api/financeiro/cofre-ouro/baixas — lista baixas
// Parâmetros opcionais: ?status=esperando_protocolo&destino=fabrica&protocolo_id=123
// (usado pelo protocolo sangria para localizar a baixa vinculada)
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const statusFiltro = req.nextUrl.searchParams.get("status");
  const destinoFiltro = req.nextUrl.searchParams.get("destino");
  const protocoloIdRaw = req.nextUrl.searchParams.get("protocolo_id");
  const protocoloId = protocoloIdRaw ? Number(protocoloIdRaw) : null;

  if (protocoloIdRaw && (!protocoloId || Number.isNaN(protocoloId))) {
    return NextResponse.json({ error: "protocolo_id inválido" }, { status: 400 });
  }

  const rows = await sql`
    SELECT
      id, gramas, destino, status,
      protocolo_id,
      realizado_nome, transportador_nome, recebedor_nome,
      confirmado_em, foto_comprovacao, observacao AS obs,
      created_at, updated_at
    FROM alissonerp.cofre_ouro_baixas
    WHERE 1=1
      ${statusFiltro ? sql`AND status = ${statusFiltro}` : sql``}
      ${destinoFiltro ? sql`AND destino = ${destinoFiltro}` : sql``}
      ${protocoloId ? sql`AND protocolo_id = ${protocoloId}` : sql``}
    ORDER BY id DESC
    LIMIT 100
  `;
  return NextResponse.json(rows);
}

// POST /api/financeiro/cofre-ouro/baixas — cria baixa
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsedPost = CofreBaixaPostSchema.safeParse(raw);
  if (!parsedPost.success) return zodError(parsedPost.error);
  const body = parsedPost.data;

  /**
   * REGRA DE NEGÓCIO: baixa do cofre de ouro deve ocorrer SOMENTE com itens
   * explicitamente selecionados no front, sem baixa "global" implícita.
   *
   * O QUE: exige ao menos 1 item no payload e valida soma dos itens com o total.
   * POR QUE: garante rastreabilidade (snapshot por item) e impede baixar ouro fora
   * da seleção operacional do usuário.
   * IMPACTO SE REMOVIDO: pode permitir baixa sem vínculo item-a-item, quebrando
   * auditoria e gerando divergência entre pendentes e histórico.
   */
  const itens = body.itens;
  const somaItens = itens.reduce((s, it) => s + Number(it.gramas), 0);
  if (Math.abs(Number(body.gramas) - somaItens) > 0.001) {
    return NextResponse.json(
      { error: `Soma dos itens (${somaItens.toFixed(3)}g) difere da baixa (${Number(body.gramas).toFixed(3)}g)` },
      { status: 400 }
    );
  }

  // Validar saldo disponível
  const [disp] = await sql`SELECT * FROM alissonerp.vw_cofre_ouro_disponivel`;
  const disponivel = disp ? Number(disp.disponivel_gramas) : 0;
  if (body.gramas > disponivel) {
    return NextResponse.json(
      { error: `Saldo insuficiente. Disponível: ${disponivel.toFixed(3)}g, solicitado: ${body.gramas.toFixed(3)}g` },
      { status: 400 }
    );
  }

  const [usuario] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const realizadoNome = usuario?.nome ?? user.email ?? "Sistema";

  /**
   * REGRA DE NEGÓCIO: baixa para Alisson é concluída direto.
   * Para Fábrica/Service, fica em esperando_protocolo — NÃO cria protocolo automático.
   *
   * O QUE: status inicial da baixa conforme destino escolhido.
   * POR QUE: protocolo agora é manual (quem transporta abre), garantindo
   *   responsabilidade sobre o saquinho com número da baixa.
   * IMPACTO SE ALTERADO: quebra o fluxo de sangria e a separação de baixa/protocolo.
   *   Status "pendente" é legado, substituído por esperando_protocolo.
   */
  const statusInicial = body.destino === "alisson"
    ? STATUS_BAIXA_OURO.CONCLUIDO
    : STATUS_BAIXA_OURO.ESPERANDO_PROTOCOLO;

  const baixa = await sql.begin(async (tx: any) => {
    const [nova] = await tx`
      INSERT INTO alissonerp.cofre_ouro_baixas
        (gramas, destino, status, realizado_por, realizado_nome,
         transportador_id, transportador_nome, observacao,
         confirmado_em)
      VALUES
        (${body.gramas}, ${body.destino}, ${statusInicial},
         ${user.id}::uuid, ${realizadoNome},
         ${body.transportador_id ?? null}::uuid,
         ${body.transportador_nome ?? null},
         ${body.obs ?? null},
         ${statusInicial === 'concluido' ? sql`now()` : null})
      RETURNING id, gramas, destino, status, protocolo_id, created_at
    `;

    // REGRA DE NEGÓCIO: persistir itens da baixa para rastrear origem.
    // IMPACTO: sem isso não dá para abrir a baixa e ver de onde saiu.
    if (itens.length > 0) {
      for (const item of itens) {
        await tx`
          INSERT INTO alissonerp.cofre_ouro_baixa_itens
            (baixa_id, origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl)
          VALUES
            (${nova.id}, ${item.origem_tipo}, ${item.origem_id}, ${item.referencia},
             ${item.pessoa_nome ?? null}, ${item.data_origem ?? null}::timestamptz,
             ${item.gramas}, ${item.valor_brl ?? 0})
        `;
      }
    }

    return nova;
  });

  await logAudit(sql, {
    tabela: "cofre_ouro_baixas",
    operacao: "INSERT",
    registro_id: baixa.id,
    usuario_id: user.id,
    dados_depois: { gramas: body.gramas, destino: body.destino },
  });

  /**
   * REGRA DE NEGÓCIO: toda baixa registra evento cronológico para linha do tempo.
   */
  await sql`
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (baixa_id, evento, gramas, origem_nome, destino_nome, observacao)
    VALUES
      (
        ${baixa.id},
        ${body.destino === "alisson" ? "baixa_direta_alisson" : "baixa_aguardando_protocolo"},
        ${body.gramas},
        ${realizadoNome},
        ${body.destino},
        ${body.obs ?? null}
      )
  `;

  /**
   * REGRA DE NEGÓCIO: baixa para Fábrica/Service NÃO cria protocolo automático.
   *
   * O QUE: a baixa fica em esperando_protocolo. Quem transporta o metal abre
   *   o protocolo manualmente via tela de Protocolo > Sangria.
   * POR QUE: garante rastreabilidade — o saquinho com número da baixa só sai da loja
   *   quando alguém registra o protocolo, assumindo responsabilidade pelo transporte.
   * IMPACTO SE REMOVIDO: protocolo criado sem registro de quem transporta,
   *   quebra auditoria da sangria.
   */
  return NextResponse.json(baixa);
}

// PATCH /api/financeiro/cofre-ouro/baixas — atualiza status da baixa
/**
 * REGRA DE NEGÓCIO: só permite transições válidas (definidas em cofre-ouro-status.ts).
 * Bloqueia pular etapas (ex.: de esperando_protocolo direto para concluido).
 *
 * O QUE: valida transição usando mapa central antes de executar UPDATE.
 * POR QUE: garante que o fluxo esperando_protocolo → em_trafego → recebido → ...
 *   seja respeitado em qualquer ponto de entrada (API, frontend, scripts).
 * IMPACTO SE REMOVIDO: qualquer chamada pode pular etapas e corromper auditoria.
 */
export async function PATCH(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = CofreBaixaPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const { id, status: novoStatus } = parsedPatch.data;

  // Buscar status atual para validar transição
  const [atual] = await sql`
    SELECT id, status FROM alissonerp.cofre_ouro_baixas WHERE id = ${id}
  `;
  if (!atual) {
    return NextResponse.json({ error: "Baixa não encontrada" }, { status: 404 });
  }

  if (!validarTransicao(atual.status, novoStatus)) {
    return NextResponse.json(
      { error: `Transição inválida: de "${atual.status}" para "${novoStatus}"` },
      { status: 400 }
    );
  }

  const [baixa] = await sql`
    UPDATE alissonerp.cofre_ouro_baixas
    SET status = ${novoStatus}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, status
  `;

  await logAudit(sql, {
    tabela: "cofre_ouro_baixas",
    operacao: "UPDATE",
    registro_id: id,
    usuario_id: user.id,
    dados_depois: { status_anterior: atual.status, status_novo: novoStatus },
  });

  return NextResponse.json(baixa);
}
