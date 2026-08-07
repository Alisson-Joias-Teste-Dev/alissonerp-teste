import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";
import { isFullAccess } from "@/lib/roles";
import {
  TIPO_PROTOCOLO_TRANSFERENCIA,
  ErroTransferencia,
  registrarSaidaProtocolo,
} from "@/lib/protocolo-transferencia";

const ColetaSchema = z.object({
  foto_path: z.string().min(1, "Foto da coleta é obrigatória").max(500),
});

/**
 * POST /api/protocolo/[protocoloId]/coleta — passo 2 da transferência de estoque.
 *
 * O QUE: quem vai levar as peças confirma, com foto, que as pegou. Aqui o estoque
 *   SAI do local de origem, a reserva da solicitação é efetivada e o protocolo
 *   passa a registrar QUEM levou (`motoboy_id`). A partir deste instante a peça
 *   está "em rota" (transferência `pendente`, ninguém recebeu).
 * POR QUE qualquer transportador, e não uma pessoa escolhida na solicitação: na
 *   prática quase sempre é o mesmo motoboy, mas em muitos dias quem leva é outra
 *   pessoa que está na loja na hora. Quem pega é quem confirma — e é isso que
 *   fica gravado, sempre verdadeiro.
 * IMPACTO SE ALTERADO/REMOVIDO: sem este passo, a peça só sairia do estoque na
 *   chegada — e o período em que ela está no caminho ficaria invisível, que é
 *   exatamente o buraco que este módulo veio fechar.
 *
 * Trajeto sem transporte (mesmo prédio) simplesmente não passa por aqui: ninguém
 * coleta, e quem confirma a chegada registra saída e entrada no mesmo ato.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ protocoloId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { protocoloId } = await params;
  const id = parseInt(protocoloId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Protocolo inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ColetaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { foto_path } = parsed.data;

  const [prot] = await sql`
    SELECT id, tipo_protocolo, etapas::text AS etapas, motoboy_id
    FROM alissonerp.protocolos
    WHERE id = ${id}
  `;
  if (!prot) return NextResponse.json({ error: "Protocolo não encontrado" }, { status: 404 });
  if (prot.tipo_protocolo !== TIPO_PROTOCOLO_TRANSFERENCIA) {
    return NextResponse.json({ error: "Este protocolo não é de transferência de estoque." }, { status: 409 });
  }
  if (prot.etapas !== "pendente") {
    return NextResponse.json({ error: `Protocolo já está ${prot.etapas}.` }, { status: 409 });
  }
  if (prot.motoboy_id && prot.motoboy_id !== user.id) {
    return NextResponse.json(
      { error: "Outra pessoa já confirmou a coleta destas peças." },
      { status: 409 }
    );
  }

  /**
   * REGRA DE NEGÓCIO: só quem está marcado como transportador (`is_transportador`,
   * mesma marca que a tela de entregas já usa) pode dizer "peguei" — é quem assume
   * a responsabilidade física pelo caminho. Não é papel: o Lenilson é motoboy, mas
   * o gerente e o dono também levam peça, e nenhum dos dois deveria virar motoboy
   * no sistema só por isso.
   */
  const [quemColeta] = await sql`
    SELECT is_transportador FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!quemColeta?.is_transportador && !isFullAccess(user.role)) {
    return NextResponse.json(
      { error: "Só quem está cadastrado como transportador pode confirmar a coleta." },
      { status: 403 }
    );
  }

  const [jaSaiu] = await sql`
    SELECT id FROM alissonerp.transferencias_estoque_comercial
    WHERE protocolo_id = ${id} AND status <> 'cancelado'
    LIMIT 1
  `;
  if (jaSaiu) {
    return NextResponse.json({ error: "A coleta deste protocolo já foi confirmada." }, { status: 409 });
  }

  try {
    const transferencias = await (sql as unknown as {
      begin: (fn: (tx: typeof sql) => Promise<number[]>) => Promise<number[]>;
    }).begin(async (tx) => {
      const criadas = await registrarSaidaProtocolo(tx, id, user.id);
      // Grava QUEM levou (é aqui que se sabe, não na solicitação) e a foto da
      // retirada — quem cria a solicitação não tem a peça em mãos; quem
      // fotografa é quem pega.
      await tx`
        UPDATE alissonerp.protocolos
        SET motoboy_id = ${user.id}::uuid, foto_criacao = ${foto_path}, updated_at = now()
        WHERE id = ${id}
      `;
      return criadas;
    });

    await logAudit(sql, {
      tabela: "protocolos",
      operacao: "UPDATE",
      registro_id: id,
      usuario_id: user.id,
      dados_depois: { evento: "coleta_transferencia", transferencias },
    });

    return NextResponse.json({ id, transferencias });
  } catch (e) {
    if (e instanceof ErroTransferencia) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
