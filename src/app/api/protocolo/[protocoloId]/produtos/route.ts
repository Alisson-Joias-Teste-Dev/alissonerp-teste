import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

/**
 * GET /api/protocolo/[protocoloId]/produtos — itens de um protocolo de
 * transferência de estoque (SKU, produto, quantidade) + o trajeto e o estado.
 *
 * POR QUE rota separada do GET do protocolo: aquele devolve ORDENS e é consumido
 * por telas que esperam exatamente esse formato (o modal de conclusão inclusive
 * usa "veio lista vazia" para saber que é sangria). Misturar produto ali mudaria
 * o contrato de quem já usa.
 *
 * O `estado` é DERIVADO, não é coluna: solicitado (nada saiu) → em_rota
 * (transferência pendente) → recebido. Ver docs/regras-negocio/protocolo.md §5.3.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ protocoloId: string }> }
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { protocoloId } = await params;
  const id = parseInt(protocoloId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Protocolo inválido" }, { status: 400 });
  }

  const [prot] = await sql`
    SELECT
      p.id,
      p.etapas::text AS etapas,
      p.tipo_protocolo,
      p.motoboy_id,
      p.motivo_cancelamento,
      p.local_origem_id,
      lo.nome AS local_origem_nome,
      p.local_destino_id,
      ld.nome AS local_destino_nome,
      um.nome AS motoboy_nome,
      uc.nome AS solicitante_nome,
      (SELECT count(*)::int FROM alissonerp.transferencias_estoque_comercial t
        WHERE t.protocolo_id = p.id AND t.status = 'pendente') AS transferencias_pendentes
    FROM alissonerp.protocolos p
    LEFT JOIN alissonerp.locais_estoque lo ON lo.id = p.local_origem_id
    LEFT JOIN alissonerp.locais_estoque ld ON ld.id = p.local_destino_id
    LEFT JOIN alissonerp.usuarios um ON um.id = p.motoboy_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = p.created_by
    WHERE p.id = ${id}
  `;
  if (!prot) return NextResponse.json({ error: "Protocolo não encontrado" }, { status: 404 });

  const itens = await sql`
    SELECT pp.produto_id, pp.quantidade, pr.sku, pr.nome AS nome_produto
    FROM alissonerp.protocolo_produtos pp
    LEFT JOIN public.produtos pr ON pr.id_produto = pp.produto_id
    WHERE pp.protocolo_id = ${id}
    ORDER BY pr.sku
  `;

  const estado =
    prot.etapas === "concluido" ? "recebido"
    : prot.etapas === "cancelado" ? "cancelado"
    : Number(prot.transferencias_pendentes) > 0 ? "em_rota"
    : "solicitado";

  return NextResponse.json({ ...prot, estado, itens });
}
