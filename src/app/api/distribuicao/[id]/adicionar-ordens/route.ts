import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import { LIMITS, checkArrayLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError, IdSchema } from "@/lib/schemas/common";

const AdicionarOrdensSchema = z.object({
  ordem_ids: z.array(IdSchema).min(1, "Selecione ao menos uma ordem.").max(LIMITS.ORDENS_LOTE_MAX),
});

// POST /api/distribuicao/[id]/adicionar-ordens
// Body: { ordem_ids: number[] }
// Adiciona ordens a um lote de distribuição já em andamento.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "distribuicao", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = AdicionarOrdensSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { ordem_ids } = parsed.data;

  // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
  try {
    checkArrayLength("ordem_ids", ordem_ids, LIMITS.ORDENS_LOTE_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  // 1. Verificar que a distribuição existe e está em andamento
  const [dist] = await sql`
    SELECT id, etapas::text, deposito_id, setor_id
    FROM alissonerp.distribuicoes
    WHERE id = ${distId}
    LIMIT 1
  `;
  if (!dist) {
    return NextResponse.json({ error: "Distribuição não encontrada" }, { status: 404 });
  }
  if (dist.etapas !== "em_andamento") {
    return NextResponse.json(
      { error: "Só é possível adicionar ordens a uma distribuição em andamento." },
      { status: 400 },
    );
  }

  // 2. Validar cada ordem
  for (const ordens_id of ordem_ids) {
    // 2a. Ordem existe e não está concluída
    const [ordem] = await sql`
      SELECT id, status::text AS status
      FROM alissonerp.ordens
      WHERE id = ${ordens_id}
      LIMIT 1
    `;
    if (!ordem) {
      return NextResponse.json(
        { error: `Ordem #${ordens_id} não encontrada.` },
        { status: 400 },
      );
    }
    if ((ordem.status as string) === "3") {
      return NextResponse.json(
        { error: `Ordem #${ordens_id} já está concluída e não pode ser adicionada a um lote.` },
        { status: 400 },
      );
    }

    // 2b. Ordem não está JÁ NESTE lote
    const jaNesteL = await sql`
      SELECT 1 FROM alissonerp.distribuicao_ordens
      WHERE distribuicao_id = ${distId} AND ordens_id = ${ordens_id}
      LIMIT 1
    `;
    if (jaNesteL.length > 0) {
      return NextResponse.json(
        { error: `Ordem #${ordens_id} já está neste lote.` },
        { status: 400 },
      );
    }

    // 2c. Ordem não está em outro lote ativo
    const conflito = await sql`
      SELECT d.id
      FROM alissonerp.distribuicao_ordens doo
      JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
      WHERE doo.ordens_id = ${ordens_id}
        AND d.etapas = 'em_andamento'
        AND d.id != ${distId}
      LIMIT 1
    `;
    if (conflito.length > 0) {
      return NextResponse.json(
        { error: `Ordem #${ordens_id} já está na distribuição #${(conflito[0] as { id: number }).id}. Uma ordem só pode estar em um lote por vez.` },
        { status: 400 },
      );
    }

    // 2d. PCP não está concluído/cancelado
    const pcpCheck = await sql`
      SELECT etapas::text AS etapas FROM alissonerp.pcp
      WHERE ordem_id = ${ordens_id}
        AND etapas NOT IN ('concluido', 'cancelado')
      LIMIT 1
    `;
    if (pcpCheck.length === 0) {
      return NextResponse.json(
        { error: `Ordem #${ordens_id} não possui PCP ativo (concluído ou cancelado).` },
        { status: 400 },
      );
    }
  }

  // 3. Inserir ordens na distribuição
  //    ON CONFLICT DO NOTHING para evitar duplicatas silenciosamente
  let adicionadas = 0;
  for (const ordens_id of ordem_ids) {
    const result = await sql`
      INSERT INTO alissonerp.distribuicao_ordens (distribuicao_id, ordens_id)
      VALUES (${distId}, ${ordens_id})
      ON CONFLICT (distribuicao_id, ordens_id) DO NOTHING
      RETURNING id
    `;
    if (result.length > 0) {
      adicionadas++;

      // Mover PCP para "aguardando" e definir depósito (mesmo comportamento do POST /api/distribuicao)
      await sql`
        UPDATE alissonerp.pcp
        SET etapas      = 'aguardando',
            deposito_id = ${dist.deposito_id as number},
            updated_at  = now()
        WHERE ordem_id = ${ordens_id}
          AND etapas NOT IN ('concluido', 'cancelado')
      `;

      // Atualizar local_atual + setor_atual na ordem
      await sql`
        UPDATE alissonerp.ordens
        SET local_atual = ${dist.deposito_id as number},
            setor_atual = ${(dist.setor_id as number | null) ?? null},
            updated_at  = now()
        WHERE id = ${ordens_id}
      `;
    }
  }

  // 4. Contar total de ordens no lote após a inserção
  const [{ total }] = await sql`
    SELECT COUNT(*)::integer AS total
    FROM alissonerp.distribuicao_ordens
    WHERE distribuicao_id = ${distId}
  `;

  return NextResponse.json({ adicionadas, total_ordens: total as number });
}
