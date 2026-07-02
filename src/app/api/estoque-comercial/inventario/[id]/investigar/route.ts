import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/estoque-comercial/inventario/[id]/investigar?produto_id=N
 *
 * O QUÊ: o "Detetive" do inventário — investiga POR QUE um item está
 *   faltando, cruzando os rastros que o sistema já tem:
 *     1. Reservas ATIVAS do produto no local (venda feita e nunca marcada
 *        como entregue → a peça saiu fisicamente mas o estoque não baixou);
 *     2. Transferências PENDENTES saindo do local (peça foi pra outra loja
 *        e ninguém confirmou o recebimento);
 *     3. Movimentações efetivadas DEPOIS da abertura do inventário (a foto
 *        inicial ficou velha — a falta pode ser só isso).
 * POR QUÊ: a gerência precisa fechar pendência com CERTEZA e sempre com o
 *   número da venda — nunca no achismo. A rota só APONTA quando a conta
 *   bate exatamente; caso contrário devolve os achados como "pistas".
 * IMPACTO SE ALTERADO: 100% leitura — não mexe em nada. Se remover, a
 *   investigação volta a ser manual (caçar venda por venda).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);
  const produtoId = Number(req.nextUrl.searchParams.get("produto_id"));
  if (!Number.isInteger(invId) || invId <= 0 || !Number.isInteger(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const [inv] = await sql`
    SELECT id, local_estoque_id, data_abertura
    FROM alissonerp.inventarios_comercial
    WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });

  const [item] = await sql`
    SELECT id, produto_id, quantidade_sistema, quantidade_contada, diferenca
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId} AND produto_id = ${produtoId}
  `;
  if (!item) return NextResponse.json({ error: "Item não pertence a este inventário" }, { status: 404 });

  // 1) Vendas com reserva ativa (aprovadas e NÃO marcadas como entregue)
  const reservas = await sql`
    SELECT r.id AS reserva_id, r.quantidade, r.venda_id, r.created_at,
           v.numero_venda, v.situacao, v.data_venda, v.vendedor_nome
    FROM alissonerp.reservas_estoque_comercial r
    JOIN alissonerp.vw_vendas_erp_completa v ON v.id = r.venda_id
    WHERE r.produto_id = ${produtoId}
      AND r.local_estoque_id = ${inv.local_estoque_id}
      AND r.status = 'ativo'
    ORDER BY r.created_at DESC
  `;

  // 2) Transferências pendentes saindo deste local (destino nunca confirmou)
  const transferencias = await sql`
    SELECT t.id, t.quantidade, t.local_destino_id, ld.nome AS local_destino_nome, t.created_at
    FROM alissonerp.transferencias_estoque_comercial t
    LEFT JOIN alissonerp.locais_estoque ld ON ld.id = t.local_destino_id
    WHERE t.produto_id = ${produtoId}
      AND t.local_origem_id = ${inv.local_estoque_id}
      AND t.status = 'pendente'
    ORDER BY t.created_at DESC
  `;

  // 3) Movimentações efetivadas após a abertura (foto do inventário ficou velha)
  const movimentacoes = await sql`
    SELECT m.id, m.tipo, m.quantidade, m.motivo, m.created_at
    FROM alissonerp.movimentacoes_estoque_comercial m
    WHERE m.produto_id = ${produtoId}
      AND m.local_estoque_id = ${inv.local_estoque_id}
      AND m.status = 'efetivado'
      AND m.created_at > ${inv.data_abertura}
    ORDER BY m.created_at DESC
  `;

  // Falta REAL: só existe quando o item foi contado e deu menos que o sistema
  const falta =
    item.quantidade_contada !== null && Number(item.diferenca) < 0
      ? -Number(item.diferenca)
      : null;

  const somaReservas = reservas.reduce((s: number, r: any) => s + Number(r.quantidade), 0);
  const somaTransf = transferencias.reduce((s: number, t: any) => s + Number(t.quantidade), 0);
  const saidasPosAbertura = movimentacoes
    .filter((m: any) => m.tipo === "saida")
    .reduce((s: number, m: any) => s + Number(m.quantidade), 0);

  /**
   * CONCLUSÃO — só afirma quando a conta bate EXATAMENTE com uma única
   * explicação (sem confusão): quantidade da(s) reserva(s) == falta e nada
   * mais no radar. Senão, devolve confiança menor ou nenhuma conclusão.
   */
  let conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null = null;
  if (falta !== null) {
    if (somaReservas === falta && somaTransf === 0 && saidasPosAbertura === 0) {
      const numeros = reservas.map((r: any) => `#${r.numero_venda}`).join(", ");
      conclusao = {
        tipo: "venda_sem_baixa",
        confianca: reservas.length === 1 ? "alta" : "media",
        resumo: reservas.length === 1
          ? `Venda ${numeros} (${reservas[0].vendedor_nome ?? "vendedora ?"}) não foi marcada como entregue — reserva ativa de ${falta} un. bate com a falta.`
          : `${reservas.length} vendas não marcadas como entregues (${numeros}) somam exatamente a falta de ${falta} un.`,
      };
    } else if (somaTransf === falta && somaReservas === 0 && saidasPosAbertura === 0) {
      conclusao = {
        tipo: "transferencia_pendente",
        confianca: transferencias.length === 1 ? "alta" : "media",
        resumo: `Transferência de ${falta} un. para ${transferencias[0]?.local_destino_nome ?? "outra loja"} ainda não confirmada no destino — bate com a falta.`,
      };
    } else if (saidasPosAbertura >= falta && somaReservas === 0 && somaTransf === 0) {
      conclusao = {
        tipo: "movimento_pos_abertura",
        confianca: "media",
        resumo: `Houve saída de ${saidasPosAbertura} un. DEPOIS da abertura do inventário — a "falta" pode ser só a foto inicial desatualizada.`,
      };
    }
  }

  return NextResponse.json({
    produto_id: produtoId,
    falta,
    conclusao,
    reservas,
    transferencias,
    movimentacoes,
  });
}
