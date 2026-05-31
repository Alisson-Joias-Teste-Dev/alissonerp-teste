import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import {
  LIMITS,
  checkArrayLength,
  checkBase64Length,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError, IdSchema, UuidSchema } from "@/lib/schemas/common";
import { STATUS_BAIXA_OURO } from "@/lib/cofre-ouro-status";

const ProtocoloPostSchema = z.object({
  direcao: z.enum(["ida", "volta"]),
  ordem_ids: z.array(IdSchema).min(1, "Parâmetros inválidos").max(LIMITS.ORDENS_LOTE_MAX).optional(),
  baixa_id: IdSchema.optional(), // REGRA: sangria vincula 1 baixa por protocolo
  motoboy_id: UuidSchema.optional(),
  foto_criacao: z.string().max(LIMITS.IMAGE_BASE64_MAX).optional(),
  user_id: UuidSchema.optional(),
  tipo_protocolo: z.string().max(50).optional(),
}).refine(
  (data) => (data.ordem_ids && data.ordem_ids.length > 0) || data.baixa_id,
  { message: "Informe ao menos um ordem_ids ou baixa_id" }
);

// GET /api/protocolo?user_id=UUID — lista protocolos do motoboy (ou todos se todos=true)
export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const userId = req.nextUrl.searchParams.get("user_id");
  const todos = req.nextUrl.searchParams.get("todos") === "true";

  const rows = todos
    ? await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        ORDER BY p.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT p.id, p.direcao::text, p.etapas::text, p.created_at, p.tipo_protocolo,
          (SELECT count(*)::int FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = p.id) AS total_ordens
        FROM alissonerp.protocolos p
        WHERE p.created_by = ${userId}::uuid OR p.motoboy_id = ${userId}::uuid
        ORDER BY p.created_at DESC LIMIT 50
      `;

  return NextResponse.json(rows);
}

// POST /api/protocolo — cria protocolo + vincula ordens
export async function POST(req: NextRequest) {
  // Auth obrigatória — user.id substitui body.user_id para created_by e permissões
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ProtocoloPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { direcao, ordem_ids, baixa_id, motoboy_id, foto_criacao, user_id, tipo_protocolo } = parsed.data;
  void user_id; // body.user_id é ignorado intencionalmente (usa user.id da sessão)

  // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
  try {
    if (ordem_ids) checkArrayLength("ordem_ids", ordem_ids, LIMITS.ORDENS_LOTE_MAX);
    checkBase64Length("foto_criacao", foto_criacao, LIMITS.IMAGE_BASE64_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  const tipoFinal = tipo_protocolo ?? "fabrica";
  const isSangria = !!baixa_id;

  // Validar permissão do usuário autenticado (admin/dev ignoram)
  {
    const [usuario] = await sql`
      SELECT role::text AS role, tipos_protocolo_permitidos
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
    `;

    if (usuario) {
      const role = usuario.role as string;
      const tiposPermitidos: string[] = usuario.tipos_protocolo_permitidos ?? [];

      if (!["admin", "desenvolvedor"].includes(role)) {
        // Para sangria, validar permissão contra o destino da baixa
        if (isSangria) {
          if (!tiposPermitidos.includes("fabrica") && !tiposPermitidos.includes("service")) {
            return NextResponse.json(
              { error: "Sem permissão para criar protocolo de sangria" },
              { status: 403 }
            );
          }
        } else if (!tiposPermitidos.includes(tipoFinal)) {
          return NextResponse.json(
            { error: `Sem permissão para criar protocolo ${tipoFinal}` },
            { status: 403 }
          );
        }
      }
    }
  }

  const [prot] = await sql`
    INSERT INTO alissonerp.protocolos (direcao, etapas, motoboy_id, foto_criacao, created_by, tipo_protocolo)
    VALUES (
      ${direcao}, 'pendente',
      ${motoboy_id ?? null}::uuid,
      ${foto_criacao ?? null},
      ${user.id}::uuid,
      ${tipoFinal}
    )
    RETURNING id
  `;

  /**
   * REGRA DE NEGÓCIO: sangria vincula exatamente 1 baixa ao protocolo.
   * Ao abrir o protocolo, a baixa transita de esperando_protocolo → em_trafego.
   *
   * O QUE: atualiza cofre_ouro_baixas com protocolo_id e status em_trafego.
   * POR QUE: o metal só sai da loja quando alguém registra o protocolo,
   *   assumindo responsabilidade pelo transporte.
   * IMPACTO SE REMOVIDO: baixa fica eternamente em esperando_protocolo
   *   e o metal não sai do cofre para o destino.
   */
  if (isSangria) {
    await sql`
      UPDATE alissonerp.cofre_ouro_baixas
      SET protocolo_id = ${prot.id},
          status = ${STATUS_BAIXA_OURO.EM_TRAFEGO},
          updated_at = now()
      WHERE id = ${baixa_id}
        AND status = ${STATUS_BAIXA_OURO.ESPERANDO_PROTOCOLO}
    `;

    const [bx] = await sql`
      SELECT id, gramas, destino FROM alissonerp.cofre_ouro_baixas WHERE id = ${baixa_id}
    `;
    const [u] = await sql`SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
    await sql`
      INSERT INTO alissonerp.cofre_ouro_rastreios
        (baixa_id, protocolo_id, evento, gramas, origem_nome, destino_nome, observacao)
      VALUES
        (
          ${baixa_id},
          ${prot.id},
          'protocolo_aberto',
          ${Number(bx?.gramas ?? 0)},
          ${u?.nome ?? user.email ?? 'Sistema'},
          ${String(bx?.destino ?? '')},
          ${'Protocolo #' + prot.id + ' aberto para sangria'}
        )
    `;
  }

  // Fluxo ordens (existente, preservado)
  if (ordem_ids && ordem_ids.length > 0) {
    const rows = ordem_ids.map((ordem_id) => ({ protocolo_id: prot.id, ordem_id }));
    await sql`INSERT INTO alissonerp.protocolo_ordens ${sql(rows)}`;

    // Vincular protocolo a transferencias service pendentes (caso as ordens tenham)
    await sql`
      UPDATE alissonerp.transferencias_ordem
      SET protocolo_id = ${prot.id}::integer
      WHERE ordem_id = ANY(${ordem_ids}::int[])
        AND tipo_transferencia = 'service'
        AND protocolo_id IS NULL
    `;

    // Criar movimentações para ordens conversao_sku
    const ordensSku = await sql`
      SELECT cs.id, cs.sku_origem_id, cs.sku_origem_quantidade,
             cs.local_origem_id, cs.sku_destino_id, cs.quantidade_produzida,
             cs.sku_destino_quantidade_desejada, cs.status_conversao, cs.ordem_id,
             cs.reserva_id, cs.local_destino_id,
             o.numero_ordem
      FROM alissonerp.conversoes_sku cs
      JOIN alissonerp.ordens o ON o.id = cs.ordem_id
      WHERE cs.ordem_id = ANY(${ordem_ids}::int[])
    `;

    for (const cs of ordensSku) {
      if (direcao === "ida" && cs.status_conversao === "aprovado") {
        await sql`
          INSERT INTO alissonerp.movimentacoes_estoque_comercial
            (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
             ordem_id, protocolo_id, referencia_id, observacao, created_by)
          VALUES
            (${cs.sku_origem_id}, 'saida', ${cs.sku_origem_quantidade},
             'conversao_sku_ida', ${cs.local_origem_id}, 'efetivado',
             ${cs.ordem_id}, ${prot.id}, ${cs.ordem_id},
             'Saida ' || COALESCE(${cs.numero_ordem}, '#' || ${cs.ordem_id}) || ' (prot ' || ${prot.id} || ')',
             ${user.id}::uuid)
        `;
        if (cs.reserva_id) {
          await sql`
            UPDATE alissonerp.reservas_estoque_comercial
            SET status = 'efetivado', efetivado_em = NOW()
            WHERE id = ${cs.reserva_id} AND status = 'ativo'
          `;
        }
      } else if (direcao === "volta" && cs.status_conversao === "aguardando_volta") {
        const localFabrica = tipoFinal === "service" ? 3 : 1;
        const qtdVolta = cs.quantidade_produzida ?? cs.sku_destino_quantidade_desejada;
        await sql`
          INSERT INTO alissonerp.movimentacoes_estoque_comercial
            (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
             ordem_id, protocolo_id, referencia_id, observacao, created_by)
          VALUES
            (${cs.sku_destino_id}, 'saida', ${qtdVolta},
             'conversao_sku_volta', ${localFabrica}, 'efetivado',
             ${cs.ordem_id}, ${prot.id}, ${cs.ordem_id},
             'Retorno ' || ${cs.numero_ordem ?? '#' + cs.ordem_id} || ' (prot ' || ${prot.id} || ')',
             ${user.id}::uuid)
        `;
      }
    }
  }

  await logAudit(sql, {
    tabela: "protocolos",
    operacao: "INSERT",
    registro_id: prot.id,
    usuario_id: user.id,
    dados_depois: { direcao, tipo_protocolo: tipoFinal, ordens: (ordem_ids ?? []).length, sangria: isSangria ? baixa_id : null },
  });

  return NextResponse.json({ id: prot.id });
}
