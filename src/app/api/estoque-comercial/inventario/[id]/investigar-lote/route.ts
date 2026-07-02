import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";
import { condPecaPronta } from "@/lib/inventario-peca-pronta";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/estoque-comercial/inventario/[id]/investigar-lote
 *
 * O QUÊ: roda o Detetive (mesma regra de `/investigar`) para TODOS os itens
 *   divergentes do inventário NUMA SÓ CHAMADA — usado para mostrar o
 *   resultado direto na linha da lista (sem abrir item por item).
 * POR QUÊ: inventário grande tem dezenas de faltas/sobras; abrir uma a uma
 *   pra saber "tem pista ou não" é inviável na prática. O detalhe completo
 *   (lista de reservas/transferências/devoluções) continua vindo só de
 *   `/investigar?produto_id=` quando o usuário expande o item.
 * IMPACTO SE ALTERADO: 100% leitura — não mexe em nada. Se remover, a tela
 *   volta a exigir abrir cada item pra saber se há pista.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);
  if (!Number.isInteger(invId) || invId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [inv] = await sql`
    SELECT id, local_estoque_id, data_abertura
    FROM alissonerp.inventarios_comercial
    WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });

  const divergentes = await sql`
    SELECT ii.produto_id, ii.diferenca
    FROM alissonerp.itens_inventario_comercial ii
    WHERE ii.inventario_id = ${invId}
      AND ii.quantidade_contada IS NOT NULL
      AND ii.diferenca != 0
      AND ${condPecaPronta(sql)}
  `;
  if (divergentes.length === 0) return NextResponse.json({ resultados: {} });

  const faltaIds = divergentes.filter((d: any) => Number(d.diferenca) < 0).map((d: any) => Number(d.produto_id));
  const sobraIds = divergentes.filter((d: any) => Number(d.diferenca) > 0).map((d: any) => Number(d.produto_id));
  const todosIds = divergentes.map((d: any) => Number(d.produto_id));

  const [reservas, transferencias, movimentacoes, devolucoesAgrupadas, entradasPorDevolucao] = await Promise.all([
    faltaIds.length ? sql`
      SELECT r.produto_id, r.id AS reserva_id, r.quantidade, r.venda_id,
             v.numero_venda, v.situacao, v.vendedor_nome
      FROM alissonerp.reservas_estoque_comercial r
      JOIN alissonerp.vw_vendas_erp_completa v ON v.id = r.venda_id
      WHERE r.produto_id = ANY(${faltaIds}::bigint[])
        AND r.local_estoque_id = ${inv.local_estoque_id}
        AND r.status = 'ativo'
    ` : [],
    faltaIds.length ? sql`
      SELECT t.produto_id, t.id, t.quantidade, ld.nome AS local_destino_nome
      FROM alissonerp.transferencias_estoque_comercial t
      LEFT JOIN alissonerp.locais_estoque ld ON ld.id = t.local_destino_id
      WHERE t.produto_id = ANY(${faltaIds}::bigint[])
        AND t.local_origem_id = ${inv.local_estoque_id}
        AND t.status = 'pendente'
    ` : [],
    todosIds.length ? sql`
      SELECT m.produto_id, m.tipo, m.quantidade
      FROM alissonerp.movimentacoes_estoque_comercial m
      WHERE m.produto_id = ANY(${todosIds}::bigint[])
        AND m.local_estoque_id = ${inv.local_estoque_id}
        AND m.status = 'efetivado'
        AND m.created_at > ${inv.data_abertura}
    ` : [],
    sobraIds.length ? sql`
      SELECT di.produto_id, d.id, d.numero,
             SUM(di.quantidade)::int AS qtd_aprovada
      FROM alissonerp.devolucoes_venda d
      JOIN alissonerp.devolucoes_itens di ON di.devolucao_id = d.id
      WHERE di.produto_id = ANY(${sobraIds}::bigint[])
        AND di.condicao = 'aprovado_retorno'
        AND d.status IN ('aprovado', 'concluido')
      GROUP BY di.produto_id, d.id, d.numero
    ` : [],
    sobraIds.length ? sql`
      SELECT m.devolucao_id, m.produto_id, SUM(m.quantidade)::int AS qtd_entrada
      FROM alissonerp.movimentacoes_estoque_comercial m
      WHERE m.produto_id = ANY(${sobraIds}::bigint[])
        AND m.tipo = 'entrada' AND m.status = 'efetivado'
        AND m.devolucao_id IS NOT NULL
      GROUP BY m.devolucao_id, m.produto_id
    ` : [],
  ]);

  const entradaPorChave = new Map<string, number>();
  for (const e of entradasPorDevolucao) {
    entradaPorChave.set(`${e.devolucao_id}-${e.produto_id}`, Number(e.qtd_entrada));
  }
  const devolucoesPorProduto = new Map<number, { numero: string; qtd_pendente: number }[]>();
  for (const d of devolucoesAgrupadas) {
    const entrada = entradaPorChave.get(`${d.id}-${d.produto_id}`) ?? 0;
    const pendente = Number(d.qtd_aprovada) - entrada;
    if (pendente <= 0) continue;
    const lista = devolucoesPorProduto.get(Number(d.produto_id)) ?? [];
    lista.push({ numero: d.numero, qtd_pendente: pendente });
    devolucoesPorProduto.set(Number(d.produto_id), lista);
  }

  const reservasPorProduto = new Map<number, any[]>();
  for (const r of reservas) {
    const lista = reservasPorProduto.get(Number(r.produto_id)) ?? [];
    lista.push(r);
    reservasPorProduto.set(Number(r.produto_id), lista);
  }
  const transferenciasPorProduto = new Map<number, any[]>();
  for (const t of transferencias) {
    const lista = transferenciasPorProduto.get(Number(t.produto_id)) ?? [];
    lista.push(t);
    transferenciasPorProduto.set(Number(t.produto_id), lista);
  }
  const movsPorProduto = new Map<number, any[]>();
  for (const m of movimentacoes) {
    const lista = movsPorProduto.get(Number(m.produto_id)) ?? [];
    lista.push(m);
    movsPorProduto.set(Number(m.produto_id), lista);
  }

  const resultados: Record<number, {
    falta: number | null;
    sobra: number | null;
    conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null;
    temPistas: boolean;
  }> = {};

  for (const d of divergentes) {
    const produtoId = Number(d.produto_id);
    const diff = Number(d.diferenca);
    const falta = diff < 0 ? -diff : null;
    const sobra = diff > 0 ? diff : null;

    const rs = reservasPorProduto.get(produtoId) ?? [];
    const ts = transferenciasPorProduto.get(produtoId) ?? [];
    const ms = movsPorProduto.get(produtoId) ?? [];
    const devs = devolucoesPorProduto.get(produtoId) ?? [];

    const somaReservas = rs.reduce((s, r) => s + Number(r.quantidade), 0);
    const somaTransf = ts.reduce((s, t) => s + Number(t.quantidade), 0);
    const saidasPos = ms.filter(m => m.tipo === "saida").reduce((s, m) => s + Number(m.quantidade), 0);
    const somaDevPendentes = devs.reduce((s, dv) => s + dv.qtd_pendente, 0);

    let conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null = null;
    if (falta !== null) {
      if (somaReservas === falta && somaTransf === 0 && saidasPos === 0) {
        const numeros = rs.map(r => `#${r.numero_venda}`).join(", ");
        conclusao = {
          tipo: "venda_sem_baixa",
          confianca: rs.length === 1 ? "alta" : "media",
          resumo: rs.length === 1
            ? `Venda ${numeros} (${rs[0].vendedor_nome ?? "vendedora ?"}) não entregue — concilia ${falta} un.`
            : `${rs.length} vendas não entregues (${numeros}) somam ${falta} un.`,
        };
      } else if (somaTransf === falta && somaReservas === 0 && saidasPos === 0) {
        conclusao = {
          tipo: "transferencia_pendente",
          confianca: ts.length === 1 ? "alta" : "media",
          resumo: `Transferência de ${falta} un. para ${ts[0]?.local_destino_nome ?? "outra loja"} não confirmada.`,
        };
      } else if (saidasPos >= falta && somaReservas === 0 && somaTransf === 0) {
        conclusao = {
          tipo: "movimento_pos_abertura",
          confianca: "media",
          resumo: `Saída de ${saidasPos} un. DEPOIS da abertura — pode ser foto desatualizada.`,
        };
      }
    } else if (sobra !== null && somaDevPendentes === sobra && devs.length > 0) {
      const numeros = devs.map(dv => dv.numero).join(", ");
      conclusao = {
        tipo: "devolucao_sem_entrada",
        confianca: devs.length === 1 ? "alta" : "media",
        resumo: devs.length === 1
          ? `Devolução ${numeros} com ${sobra} un. sem entrada — concilia a sobra.`
          : `${devs.length} devoluções (${numeros}) somam ${sobra} un. sem entrada.`,
      };
    }

    resultados[produtoId] = {
      falta, sobra, conclusao,
      temPistas: rs.length > 0 || ts.length > 0 || ms.length > 0 || devs.length > 0,
    };
  }

  return NextResponse.json({ resultados });
}
