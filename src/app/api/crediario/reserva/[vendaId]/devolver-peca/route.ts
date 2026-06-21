import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { criarNotificacao } from "@/lib/notificacoes";
import { logAudit } from "@/lib/audit";
import { internalError } from "@/lib/api-error";

/**
 * POST /api/crediario/reserva/[vendaId]/devolver-peca
 *
 * Aprovação do ESTOQUE para devolver ao saldo a peça de uma venda que VIROU
 * CRÉDITO (③ — reserva do crediário estourou os 7 dias e virou VC-). Enquanto
 * a venda está 'virou_credito' a peça fica SEGURADA (reserva ativa); só volta ao
 * saldo quando alguém do estoque CONFIRMA a recolocação física aqui (regra §3).
 *
 * NÃO mexe na venda (continua 'virou_credito'), NÃO estorna o pagamento (que já
 * virou VC) nem o VC. Só cancela a reserva ativa → o saldo disponível volta.
 *
 * Auth: aprovador configurado (Config › Aprovadores 'aprovador_devolucao_estoque')
 *   OU acesso pleno OU cargo de estoque/gerência.
 */
const ROLES_ESTOQUE = [
  "gerente_fabrica", "estoquista_fabrica", "estoquista_loja", "gerente_loja", "pcp",
];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ vendaId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!u) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  // Aprovadores configurados em Config › Aprovadores (chave MULTI, UUIDs por vírgula).
  // Se a lista existir, ela é a AUTORIDADE: só os selecionados (+ acesso pleno como
  // salvaguarda anti-deadlock). Se estiver vazia, cai no fallback por cargo de estoque.
  const [cfg] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovadores_devolver_peca'`;
  const listaConfig = String(cfg?.valor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const autorizado = listaConfig.length > 0
    ? (listaConfig.includes(user.id) || isFullAccess(u.role as string))
    : (isFullAccess(u.role as string) || ROLES_ESTOQUE.includes(u.role as string));
  if (!autorizado) {
    return NextResponse.json({ error: "Sem permissão — você não está na lista de aprovadores da devolução de peça." }, { status: 403 });
  }

  const { vendaId } = await params;
  const id = Number(vendaId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, numero_venda, situacao, created_by FROM alissonerp.vendas_erp WHERE id = ${id}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao !== "virou_credito") {
    return NextResponse.json(
      { error: "Só vendas que viraram crédito têm peça reservada para devolver." },
      { status: 409 }
    );
  }

  // Defensivo: 'virou_credito' nunca foi entregue → NÃO deve ter saída efetivada.
  // Se tiver, é anomalia — recusa (não devolver sozinho às cegas).
  const [{ cnt_saidas }] = await sql`
    SELECT COUNT(*) AS cnt_saidas FROM alissonerp.movimentacoes_estoque_comercial
    WHERE referencia_id = ${id} AND referencia_tipo = 'vendas_erp'
      AND tipo = 'saida' AND status = 'efetivado' AND estornado_por_id IS NULL
  `;
  if (Number(cnt_saidas) > 0) {
    return NextResponse.json(
      { error: "Venda tem saída de estoque efetivada (inesperado p/ virou_credito). Revise manualmente." },
      { status: 409 }
    );
  }

  const [{ cnt_ativas }] = await sql`
    SELECT COUNT(*) AS cnt_ativas FROM alissonerp.reservas_estoque_comercial
    WHERE venda_id = ${id} AND status = 'ativo'
  `;
  if (Number(cnt_ativas) === 0) {
    return NextResponse.json(
      { error: "Nenhuma peça reservada para devolver (já devolvida?)." },
      { status: 409 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devolvidas = await (sql as any).begin(async (tx: typeof sql) => {
      const reservas = await tx`
        UPDATE alissonerp.reservas_estoque_comercial
        SET status = 'cancelado', cancelado_em = now()
        WHERE venda_id = ${id} AND status = 'ativo'
        RETURNING id, produto_id, quantidade
      `;
      await logAudit(tx, {
        tabela: "reservas_estoque_comercial",
        operacao: "UPDATE",
        registro_id: id,
        usuario_id: user.id,
        dados_antes: { status: "ativo" },
        dados_depois: {
          status: "cancelado",
          motivo: "devolucao da peca apos venda virar credito (crediario ③)",
          reservas_canceladas: reservas.length,
        },
      });
      return reservas;
    });

    if (venda.created_by) {
      await criarNotificacao({
        usuarioId: venda.created_by as string,
        tipo: "aviso",
        titulo: "Peça devolvida ao estoque",
        mensagem: `Venda ${venda.numero_venda}: o estoque confirmou a recolocação. A peça voltou ao saldo disponível.`,
        link: "/crediario",
        vendaId: id,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, reservas_devolvidas: devolvidas.length });
  } catch (err) {
    return internalError(`[POST /api/crediario/reserva/${id}/devolver-peca]`, err, "Falha ao devolver a peça. Tente novamente.");
  }
}
