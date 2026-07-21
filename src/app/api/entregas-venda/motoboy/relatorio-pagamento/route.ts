/**
 * GET /api/entregas-venda/motoboy/relatorio-pagamento
 *
 * REGRA DE NEGÓCIO: relatório de pagamento do motoboy por ENTREGADOR +
 * PERÍODO — substitui o processo manual (PDF gerado por script Python) que
 * o Jonathan hoje manda ao financeiro para pagar o entregador. Decisão do
 * Jonathan (21/07/2026, ver docs/regras-negocio/entregas.md §11 e a memória
 * reference_relatorio_corridas_motoboy.md):
 *   - Fonte ÚNICA: `alissonerp.entregas_venda` (forma_entrega='motoboy',
 *     situacao='confirmada') — NUNCA a legada `public.controle_entregas`.
 *   - Isso só é seguro porque o pagamento foi feito até 19/07/2026 — tudo
 *     anterior já está quitado ("começando do zero"). Por isso o período NÃO
 *     pode começar antes de `MARCO_RELATORIO_PAGAMENTO_MOTOBOY` (20/07/2026).
 *   - Cada corrida do período é classificada em Pagar/Revisar/Não pagar
 *     (`classificarCorridaMotoboy`, `src/lib/relatorio-pagamento-motoboy.ts`
 *     — fonte única da regra, não duplicar aqui).
 *
 * O QUE: recebe `entregadorId` (uuid do motoboy) + `inicio`/`fim`
 * ('YYYY-MM-DD'), retorna TODAS as corridas confirmadas dele no período
 * (avulsas e de pedido) já classificadas, com fotos (link, não embutidas),
 * `foi_pago` (já liquidada num lote anterior) e a SUGESTÃO de total a pagar
 * (soma bruta das classificadas "pagar", ainda sem revisão do financeiro).
 *
 * REGRA DE NEGÓCIO (21/07/2026, decisão do Jonathan — "o usuário pode
 * revisar e ajustar os pagamentos no relatório"): a classificação devolvida
 * aqui é só uma SUGESTÃO — o financeiro ajusta cada linha (Pagar/Não pagar)
 * no FRONT antes de decidir o que realmente entra no pagamento. Esta rota
 * NÃO persiste nenhuma decisão ajustada — o ajuste vive no estado do
 * componente até o financeiro clicar "Confirmar pagamento", que reusa a
 * rota JÁ EXISTENTE `POST /api/entregas-venda/motoboy/pagar` (mesmo
 * mecanismo do painel de pagamento em lote, `PagamentoMotoboyPainel.tsx`) —
 * é ALI que a decisão vira fato persistido (`pagamentos_motoboy_itens`).
 * Por isso `foi_pago` é exposto: uma corrida já paga não deve ser oferecida
 * de novo para pagamento (a UNIQUE do banco barraria, mas o front já evita
 * a tentativa).
 *
 * IMPACTO SE ALTERADO: mexer no filtro de situação/forma_entrega muda o que
 * conta como "corrida" no acerto financeiro; mexer no marco reabre corridas
 * já pagas manualmente (risco de pagamento em dobro).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { buscarFotosEntregaEmLote } from "@/lib/entrega-venda";
import {
  MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
  periodoAntesDoMarco,
  classificarCorridaMotoboy,
  calcularTotalPagar,
  type ClassificacaoCorridaMotoboy,
} from "@/lib/relatorio-pagamento-motoboy";
import { getPublicUrl } from "@/lib/storage-url";

// REGRA DE NEGÓCIO: mesma lista de papéis que já paga o motoboy hoje
// (idêntica a `motoboy/pagar` e `motoboy/pagamentos`) — quem confirma o
// pagamento em lote é quem também deve poder conferir o relatório que
// justifica o valor pago. NUNCA divergir dessa lista sem decisão do Jonathan.
const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja"];

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const entregadorId = url.searchParams.get("entregadorId") ?? "";
  const inicio = url.searchParams.get("inicio") ?? "";
  const fim = url.searchParams.get("fim") ?? "";

  if (!entregadorId) {
    return NextResponse.json({ error: "Selecione um entregador" }, { status: 400 });
  }
  if (!REGEX_DATA.test(inicio) || !REGEX_DATA.test(fim)) {
    return NextResponse.json({ error: "Informe o período (início e fim) no formato AAAA-MM-DD" }, { status: 400 });
  }
  if (inicio > fim) {
    return NextResponse.json({ error: "A data de início não pode ser depois da data de fim" }, { status: 400 });
  }

  // REGRA DE NEGÓCIO: pagamento manual cobriu tudo até 19/07/2026 — período
  // não pode começar antes do marco (evita pagar 2x a mesma corrida).
  if (periodoAntesDoMarco(inicio)) {
    return NextResponse.json(
      {
        error: `Corridas anteriores a ${MARCO_RELATORIO_PAGAMENTO_MOTOBOY.split("-").reverse().join("/")} já foram pagas e não entram neste relatório. Selecione um período a partir dessa data.`,
      },
      { status: 400 },
    );
  }

  // ─── Consulta única (SEM N+1): corridas confirmadas do entregador no
  // período, já com venda/cliente/cadastro de motoboy via JOIN, a posição
  // da corrida dentro da mesma venda (para detectar duplicidade) via
  // ROW_NUMBER, e `foi_pago` (mesmo EXISTS já usado em `motoboy/minhas` —
  // reusa o critério, não inventa um novo) — tudo em uma única ida ao banco.
  const rows: Record<string, unknown>[] = await sql`
    SELECT
      ev.id, ev.codigo_entrega, ev.venda_id, ev.is_avulso, ev.descricao_avulso,
      ev.frete_motoboy, ev.regiao, ev.data_entrega_realizada, ev.created_at,
      ve.numero_venda, ve.situacao AS venda_situacao,
      COALESCE(c.nome, ca.nome) AS cliente_nome,
      (mb.id IS NOT NULL) AS tem_cadastro_motoboy,
      EXISTS (
        SELECT 1 FROM alissonerp.pagamentos_motoboy_itens pmi WHERE pmi.entrega_id = ev.id
      ) AS foi_pago,
      CASE WHEN ev.venda_id IS NOT NULL THEN
        ROW_NUMBER() OVER (PARTITION BY ev.venda_id ORDER BY ev.data_entrega_realizada ASC, ev.id ASC)
      ELSE 1 END AS ordem_na_venda
    FROM alissonerp.entregas_venda ev
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    LEFT JOIN public.contatos ca ON ca.id_contato = ev.contato_id
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
    WHERE ev.motoboy_id = ${entregadorId}::uuid
      AND ev.forma_entrega = 'motoboy'
      AND ev.situacao = 'confirmada'
      AND ev.data_entrega_realizada >= ${inicio}::date
      AND ev.data_entrega_realizada < (${fim}::date + interval '1 day')
    ORDER BY ev.data_entrega_realizada ASC, ev.id ASC
  `;

  // Fotos em LOTE (1 query para todas as corridas do período) — nunca em loop.
  const fotosPorEntrega = await buscarFotosEntregaEmLote(rows.map((r) => Number(r.id)));

  const corridas = rows.map((r) => {
    const vendaId = r.venda_id === null ? null : Number(r.venda_id);
    const vendaSituacao = (r.venda_situacao as string | null) ?? null;
    const isAvulso = Boolean(r.is_avulso);
    const descricaoAvulso = (r.descricao_avulso as string | null) ?? null;
    const temCadastroMotoboy = Boolean(r.tem_cadastro_motoboy);
    const ordemNaVenda = Number(r.ordem_na_venda ?? 1);
    const foiPago = Boolean(r.foi_pago);

    const { classificacao, motivo } = classificarCorridaMotoboy({
      vendaId,
      vendaSituacao,
      isAvulso,
      descricaoAvulso,
      temCadastroMotoboy,
      ordemNaVenda,
    });

    const freteMotoboy = Number(r.frete_motoboy ?? 0);
    const fotos = (fotosPorEntrega.get(Number(r.id)) ?? []).map((path) =>
      getPublicUrl("pagamento-fotos", path),
    );

    return {
      id: Number(r.id),
      codigo_entrega: r.codigo_entrega,
      venda_id: vendaId,
      numero_venda: r.numero_venda ?? null,
      cliente_nome: r.cliente_nome ?? null,
      is_avulso: isAvulso,
      descricao_avulso: descricaoAvulso,
      regiao: r.regiao ?? null,
      frete_motoboy: freteMotoboy,
      data_entrega_realizada: r.data_entrega_realizada,
      // REGRA DE NEGÓCIO: `classificacao`/`motivo` são a SUGESTÃO do sistema —
      // o financeiro ajusta a decisão final no front (ver doc no topo do
      // arquivo); esta rota nunca trava a decisão.
      classificacao: classificacao as ClassificacaoCorridaMotoboy,
      motivo,
      // Já liquidada num pagamento em lote anterior — front não oferece de
      // novo para pagamento (mesmo critério de `motoboy/minhas`/`motoboy/pagar`).
      foi_pago: foiPago,
      fotos,
    };
  });

  // REGRA DE NEGÓCIO: `total_pagar` aqui é a SUGESTÃO bruta do sistema (soma
  // das "pagar" ainda não pagas) — só informativo. O total REAL que o
  // financeiro vê em destaque no front é calculado LÁ (calcularTotalAjustado),
  // depois de ele revisar/ajustar cada linha — nunca duplicado aqui.
  const totalPagarSugerido = calcularTotalPagar(
    corridas.map((c) => ({ classificacao: c.classificacao, freteMotoboy: c.frete_motoboy, foiPago: c.foi_pago })),
  );

  return NextResponse.json({
    marco: MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
    corridas,
    total_pagar: totalPagarSugerido,
    quantidade_pagar: corridas.filter((c) => c.classificacao === "pagar").length,
    quantidade_revisar: corridas.filter((c) => c.classificacao === "revisar").length,
    quantidade_nao_pagar: corridas.filter((c) => c.classificacao === "nao_pagar").length,
  });
}
