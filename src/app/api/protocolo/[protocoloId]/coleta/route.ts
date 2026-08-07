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
 * O QUE: o motoboy confirma, com foto, que pegou as peças. Aqui o estoque SAI do
 *   local de origem e a reserva da solicitação é efetivada — a partir deste
 *   instante a peça está "em rota" (transferência `pendente`, ninguém recebeu).
 * POR QUE só o motoboy do protocolo: é ele quem assume a responsabilidade física
 *   pelo caminho. Mesma lógica dos protocolos de ordem, onde o motoboy é quem
 *   abre o transporte — e continua sem poder concluir (quem recebe é o destino).
 * IMPACTO SE ALTERADO/REMOVIDO: sem este passo, a peça só sairia do estoque na
 *   chegada — e o período em que ela está com o motoboy ficaria invisível, que é
 *   exatamente o buraco que este módulo veio fechar.
 *
 * Trajeto SEM transporte (mesmo prédio) não passa por aqui: `motoboy_id` nulo, a
 * saída e a entrada acontecem juntas no recebimento.
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
  if (!prot.motoboy_id) {
    return NextResponse.json(
      { error: "Este protocolo não tem transporte. A saída acontece na confirmação de chegada." },
      { status: 409 }
    );
  }
  if (prot.motoboy_id !== user.id && !isFullAccess(user.role)) {
    return NextResponse.json({ error: "Só o motoboy deste protocolo pode confirmar a coleta." }, { status: 403 });
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
      // A foto do transporte é a foto de criação do protocolo — quem cria a
      // solicitação (a loja) não tem a peça em mãos; quem fotografa é quem pega.
      await tx`
        UPDATE alissonerp.protocolos
        SET foto_criacao = ${foto_path}, updated_at = now()
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
