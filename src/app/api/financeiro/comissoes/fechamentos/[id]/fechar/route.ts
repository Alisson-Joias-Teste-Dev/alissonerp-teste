import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/fechamentos/[id]/fechar
//
// REGRA DE NEGÓCIO: aprova o fechamento e trava os valores.
// O que: muda status de 'rascunho' para 'fechado' e registra quem aprovou.
// Por que: impede edição de valores depois de aprovado.
// Impacto se alterado: risco de comissão ser recalculada depois de aprovada.
//
// REDE DE SEGURANÇA (06/07/2026, ver comercial.md §2): antes de travar,
// varre os itens em busca de pagamento não-comissionável (comissionavel=false
// — defesa contra dado escrito fora do fluxo normal) e de comentário com
// palavra-chave de "não é dinheiro" (vale-troca/permuta/desconto), mesmo
// quando comissionavel=true — cobre forma nova que ainda não entrou na
// lista de exclusão. Bloqueia com 409 a menos que venha `forcar: true`
// (fica auditado). Motivo: um bug assim já gerou comissão indevida em
// jun/2026 antes de ser pego manualmente.
const PALAVRAS_SUSPEITAS = ["vale-troca", "vale troca", "permuta", "descontad"];

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "administrativo", "financeiro", "gerente_loja"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const forcar = body?.forcar === true;

    const [atual] = await sql`
      SELECT status FROM alissonerp.fechamentos_comissao WHERE id = ${id}::uuid
    `;
    if (!atual) return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
    if (atual.status !== "rascunho") {
      return NextResponse.json({ error: "Apenas fechamentos em rascunho podem ser fechados" }, { status: 409 });
    }

    if (!forcar) {
      const suspeitos = await sql`
        SELECT fci.id, fci.numero_venda_snapshot, fci.comissao_calculada,
               pv.comissionavel, cc.mensagem AS comentario
        FROM alissonerp.fechamento_comissao_itens fci
        LEFT JOIN alissonerp.pagamentos_venda pv ON pv.id = fci.pagamento_venda_id
        LEFT JOIN alissonerp.contas_receber cr
          ON cr.venda_erp_id = fci.venda_id AND cr.situacao = 'pago' AND cr.valor = fci.valor_pagamento
        LEFT JOIN alissonerp.comunicacoes_crediario cc
          ON cc.conta_receber_id = cr.id AND cc.tipo = 'aviso_recebimento'
        WHERE fci.fechamento_id = ${id}::uuid
          AND fci.status <> 'cancelado'
          AND (
            -- comissionavel=false com comissao_calculada=0 é o esperado (Vale-Troca/Permuta/
            -- Ajuste Consultora aparecem no relatório pra auditoria, mas não pagam nada).
            -- Só é suspeito se ALGUÉM conseguiu gravar comissão em cima disso.
            (pv.comissionavel = false AND fci.comissao_calculada <> 0)
            OR COALESCE(cc.mensagem, '') ~* ${PALAVRAS_SUSPEITAS.join("|")}
          )
      `;
      if (suspeitos.length > 0) {
        return NextResponse.json({
          error: "Itens suspeitos de comissão sobre pagamento que não é dinheiro novo (Vale-Troca/permuta/desconto). Revise antes de fechar.",
          itens_suspeitos: suspeitos.map((s) => ({
            item_id: s.id,
            numero_venda: s.numero_venda_snapshot,
            comissao_calculada: Number(s.comissao_calculada),
            comentario: s.comentario,
          })),
        }, { status: 409 });
      }
    }

    await sql`
      UPDATE alissonerp.fechamentos_comissao SET
        status = 'fechado',
        approved_by = ${user.id}::uuid,
        approved_at = now()
      WHERE id = ${id}::uuid
    `;

    // Atualiza status dos itens
    await sql`
      UPDATE alissonerp.fechamento_comissao_itens SET
        status = 'fechado'
      WHERE fechamento_id = ${id}::uuid AND status = 'liberado'
    `;

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: id,
      usuario_id: user.id,
      dados_depois: { status: "fechado", ...(forcar ? { forcado_apesar_de_suspeita: true } : {}) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/fechamentos/[id]/fechar]", err);
  }
}
