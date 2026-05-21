import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { estornarVenda, concluirVenda, approveVenda } from "@/lib/vendas-aprovar";
import { logAudit } from "@/lib/audit";

// Campos da venda que só podem ser alterados em rascunho (cliente/vendedor/data).
// Espelha a regra do PATCH /api/vendas/[id] linhas 293-297.
const CAMPOS_RESTRITOS_RASCUNHO = new Set(["cliente_id", "vendedor_id", "data_venda"]);

// Situações que precisam de helper próprio (com transação interna) — não podem ser
// envolvidos em sql.begin() externo porque aninhamento de transações não é suportado.
const SITUACOES_COM_HELPER = new Set(["aprovado", "concluido"]);

const ROLES_FINANCEIRO = ["admin", "desenvolvedor", "diretor"];

const DecidirSchema = z.object({
  decisao: z.enum(["aprovado", "rejeitado"]),
  motivo: z.string().max(1000).optional(),
});

// Campos editáveis na venda (espelha CAMPOS_ADMIN_ONLY do PATCH /api/vendas/[id]).
const CAMPOS_VENDA_PERMITIDOS = new Set([
  "situacao", "cliente_id", "vendedor_id", "data_venda",
]);

const STATUS_PAGAMENTO_VALIDOS = new Set([
  "pendente", "confirmado", "cancelado", "estornado",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!ROLES_FINANCEIRO.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const solId = Number(id);
  if (isNaN(solId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = DecidirSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const [sol] = await sql`
    SELECT id, tipo, venda_id, pagamento_id, campo,
           valor_atual, valor_solicitado, motivo,
           solicitado_por_id, solicitado_por_nome, status
    FROM alissonerp.solicitacoes_alteracao
    WHERE id = ${solId}
    LIMIT 1
  `;
  if (!sol) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  if (sol.status !== "pendente") {
    return NextResponse.json({ error: "Solicitação já processada" }, { status: 409 });
  }

  const [u] = await sql`SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const aprovadorNome = (u?.nome as string | undefined) ?? user.email ?? "Admin";

  const decisaoFinal: "aprovado" | "rejeitado" = body.decisao;
  const motivoFinal: string | null = body.motivo ?? null;

  // ── Auditoria compartilhada ──────────────────────────────────────────────────
  const auditParams = {
    tabela: "solicitacoes_alteracao",
    operacao: "UPDATE" as const,
    registro_id: solId,
    usuario_id: user.id,
    dados_antes: { status: "pendente" },
    dados_depois: {
      status: decisaoFinal,
      decidido_por_nome: aprovadorNome,
      motivo_decisao: motivoFinal,
      acao: decisaoFinal === "aprovado" ? "alteracao_aprovada" : "alteracao_rejeitada",
    },
  };

  // ── REJEIÇÃO ─────────────────────────────────────────────────────────────────
  // Marca + audit em transação única (atômica).
  if (body.decisao === "rejeitado") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx`
        UPDATE alissonerp.solicitacoes_alteracao
        SET status           = 'rejeitado',
            decidido_por_id  = ${user.id}::uuid,
            decidido_por_nome = ${aprovadorNome},
            motivo_decisao   = ${motivoFinal},
            decidido_em      = NOW()
        WHERE id = ${solId}
      `;
      await logAudit(tx, auditParams);
    });

    await notificarSolicitante(sol, body.decisao, aprovadorNome, body.motivo, user.id);
    return NextResponse.json({ ok: true });
  }

  // ── APROVAÇÃO ────────────────────────────────────────────────────────────────

  if (sol.tipo === "pagamento_status") {
    const pagId = Number(sol.pagamento_id);
    if (!pagId) {
      return NextResponse.json({ error: "Solicitação sem pagamento_id" }, { status: 409 });
    }
    const novoStatus = String(sol.valor_solicitado);
    if (!STATUS_PAGAMENTO_VALIDOS.has(novoStatus)) {
      return NextResponse.json({ error: "Status de pagamento inválido na solicitação" }, { status: 409 });
    }

    const [pagAtual] = await sql`
      SELECT id, status FROM alissonerp.pagamentos_venda
      WHERE id = ${pagId} AND venda_id = ${sol.venda_id}
    `;
    if (!pagAtual) return NextResponse.json({ error: "Pagamento não existe mais" }, { status: 409 });

    // Tudo numa transação: UPDATE pagamento + marca solicitação + audit.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sql as any).begin(async (tx: typeof sql) => {
        if (novoStatus === "confirmado") {
          await tx`
            UPDATE alissonerp.pagamentos_venda SET
              status           = 'confirmado',
              data_confirmacao = COALESCE(data_confirmacao, NOW())
            WHERE id = ${pagId}
          `;
        } else {
          await tx`
            UPDATE alissonerp.pagamentos_venda SET status = ${novoStatus} WHERE id = ${pagId}
          `;
        }
        await tx`
          UPDATE alissonerp.solicitacoes_alteracao
          SET status            = 'aprovado',
              decidido_por_id   = ${user.id}::uuid,
              decidido_por_nome = ${aprovadorNome},
              motivo_decisao    = ${motivoFinal},
              decidido_em       = NOW()
          WHERE id = ${solId}
        `;
        await logAudit(tx, auditParams);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao aplicar status";
      console.error(`[solicitacoes-alteracao] erro ao aplicar pagamento sol=${solId}:`, e);
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // Pós-commit: auto-aprovar / concluir / estornar (best-effort, fora da tx).
    // Bug 6: se falhar, reverte solicitação para "pendente"
    const posOk = await posCommitPagamento(Number(sol.venda_id), pagId, novoStatus, user.id);
    if (!posOk) {
      await sql`
        UPDATE alissonerp.solicitacoes_alteracao
        SET status = 'pendente', decidido_por_id = NULL, decidido_por_nome = NULL,
            motivo_decisao = 'Falha ao processar pós-confirmação — solicitação reaberta',
            decidido_em = NULL
        WHERE id = ${solId}
      `;
      return NextResponse.json(
        { error: "Pagamento aprovado mas houve falha ao concluir a venda. Solicitação reaberta." },
        { status: 502 },
      );
    }

  } else if (sol.tipo === "venda_campo") {
    const campo = String(sol.campo);
    if (!CAMPOS_VENDA_PERMITIDOS.has(campo)) {
      return NextResponse.json({ error: "Campo não permitido" }, { status: 409 });
    }

    // Guard: campos restritos a rascunho.
    if (CAMPOS_RESTRITOS_RASCUNHO.has(campo)) {
      const [vAtual] = await sql<{ situacao: string }[]>`
        SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${sol.venda_id}
      `;
      if (vAtual && vAtual.situacao !== "rascunho") {
        // Auto-rejeita dentro de transação.
        const motivoAuto = `Auto-rejeitada: campo "${campo}" só pode ser alterado em venda em rascunho (situacao atual: ${vAtual.situacao}).`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sql as any).begin(async (tx: typeof sql) => {
          await tx`
            UPDATE alissonerp.solicitacoes_alteracao
            SET status            = 'rejeitado',
                decidido_por_id   = ${user.id}::uuid,
                decidido_por_nome = ${aprovadorNome},
                motivo_decisao    = ${motivoAuto},
                decidido_em       = NOW()
            WHERE id = ${solId}
          `;
          await logAudit(tx, {
            ...auditParams,
            dados_depois: { ...auditParams.dados_depois, status: "rejeitado", acao: "auto_rejeitada" },
          });
        });
        return NextResponse.json(
          { error: `Só é possível alterar esse campo em vendas em rascunho. Solicitação foi rejeitada automaticamente.` },
          { status: 400 },
        );
      }
    }

    // Situações que passam por helpers com transação própria (approveVenda / concluirVenda):
    // não podem ser envolvidas em sql.begin() externo.
    // Strategy: aplica o helper primeiro; depois marca + audit em tx separada.
    if (campo === "situacao" && SITUACOES_COM_HELPER.has(String(sol.valor_solicitado))) {
      const v = String(sol.valor_solicitado);
      try {
        if (v === "aprovado") {
          await approveVenda(Number(sol.venda_id), user.id, { tinyBestEffort: true });
        } else {
          await concluirVenda(Number(sol.venda_id), user.id, { tinyBestEffort: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao aplicar situação";
        console.error(`[solicitacoes-alteracao] erro ao aplicar situacao sol=${solId}:`, e);
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      // Marca + audit após o helper ter commitado com sucesso.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sql as any).begin(async (tx: typeof sql) => {
        await tx`
          UPDATE alissonerp.solicitacoes_alteracao
          SET status            = 'aprovado',
              decidido_por_id   = ${user.id}::uuid,
              decidido_por_nome = ${aprovadorNome},
              motivo_decisao    = ${motivoFinal},
              decidido_em       = NOW()
          WHERE id = ${solId}
        `;
        await logAudit(tx, auditParams);
      });
    } else {
      // Todos os demais campos (cliente_id, vendedor_id, data_venda,
      // situacao simples): aplica + marca + audit em transação única.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sql as any).begin(async (tx: typeof sql) => {
          await aplicarCampoVendaTx(tx, Number(sol.venda_id), campo, sol.valor_solicitado);
          await tx`
            UPDATE alissonerp.solicitacoes_alteracao
            SET status            = 'aprovado',
                decidido_por_id   = ${user.id}::uuid,
                decidido_por_nome = ${aprovadorNome},
                motivo_decisao    = ${motivoFinal},
                decidido_em       = NOW()
            WHERE id = ${solId}
          `;
          await logAudit(tx, auditParams);
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao aplicar campo";
        console.error(`[solicitacoes-alteracao] erro ao aplicar campo sol=${solId}:`, e);
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    }
  }

  await notificarSolicitante(sol, body.decisao, aprovadorNome, body.motivo, user.id);
  return NextResponse.json({ ok: true });
}

// ─── Helper: notifica o solicitante ──────────────────────────────────────────
async function notificarSolicitante(
  sol: Record<string, unknown>,
  decisao: "aprovado" | "rejeitado",
  aprovadorNome: string,
  motivo: string | undefined,
  adminId: string,
): Promise<void> {
  try {
    const titulo = decisao === "aprovado" ? "Solicitação aprovada" : "Solicitação rejeitada";
    const alvo = sol.tipo === "pagamento_status"
      ? `pagamento ${sol.pagamento_id}`
      : `campo ${sol.campo}`;
    const mensagem = decisao === "aprovado"
      ? `Sua solicitação de alteração em ${alvo} foi aprovada por ${aprovadorNome}.`
      : `Sua solicitação de alteração em ${alvo} foi rejeitada. ${motivo ?? ""}`.trim();
    const link = `/vendas/${sol.venda_id}`;
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, venda_id, link)
      VALUES
        (${String(sol.solicitado_por_id)}::uuid, 'aprovacao', ${titulo}, ${mensagem},
         ${adminId}::uuid, ${sol.venda_id as number}, ${link})
    `;
  } catch (e) {
    console.error(`[solicitacoes-alteracao] erro ao notificar solicitante sol=${sol.id}:`, e);
  }
}

// ─── Helper pós-commit para pagamentos ───────────────────────────────────────
// Chamado DEPOIS que a transação principal commitou — best-effort.
async function posCommitPagamento(
  vendaId: number,
  pagId: number,
  novoStatus: string,
  adminId: string,
): Promise<boolean> {
  if (novoStatus === "confirmado") {
    try {
      const [pvenda] = await sql`
        SELECT v.situacao, v.aprovacao_credito_tipo
        FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
      `;
      const [pendentes] = await sql`
        SELECT COUNT(*)::int AS cnt FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND status = 'pendente'
      `;
      const todosPagos = Number(pendentes.cnt) === 0;

      if (pvenda?.situacao === "rascunho" && pvenda?.aprovacao_credito_tipo) {
        const [outrosPend] = await sql`
          SELECT COUNT(*)::int AS cnt FROM alissonerp.pagamentos_venda
          WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
        `;
        if (Number(outrosPend.cnt) === 0) {
          await approveVenda(vendaId, adminId, { tinyBestEffort: true });
        }
      }
      if (todosPagos) {
        const [atual] = await sql`SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
        if (atual?.situacao === "aprovado") {
          await concluirVenda(vendaId, adminId, { tinyBestEffort: true });
        }
      }
    } catch (e) {
      console.error(`[posCommitPagamento] auto-aprovar/concluir venda=${vendaId}:`, e);
      return false;
    }
  } else if (novoStatus === "estornado") {
    try {
      await estornarVenda(vendaId, pagId, { motivo: "Estorno via solicitação de alteração" });
    } catch (e) {
      console.error(`[posCommitPagamento] estornarVenda venda=${vendaId} pag=${pagId}:`, e);
      return false;
    }
  }
  return true;
}

// ─── Aplicação de campo da venda dentro de uma transação ─────────────────────
// Recebe `tx` (não `sql`) para participar de sql.begin() externo.
// NÃO cobre situacao=aprovado/concluido (esses usam helpers próprios).
async function aplicarCampoVendaTx(
  tx: typeof sql,
  vendaId: number,
  campo: string,
  valorJson: unknown,
): Promise<void> {
  switch (campo) {
    case "situacao": {
      const v = String(valorJson);
      // Somente transições simples chegam aqui (rascunho, cancelado, enviado, entregue).
      // aprovado/concluido são roteados antes pelo helper com tx própria.
      await tx`UPDATE alissonerp.vendas_erp SET situacao = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "cliente_id": {
      const v = valorJson == null ? null : Number(valorJson);
      if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error("cliente_id inválido");
      await tx`UPDATE alissonerp.vendas_erp SET cliente_id = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "vendedor_id": {
      const v = valorJson == null ? null : Number(valorJson);
      if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error("vendedor_id inválido");
      await tx`UPDATE alissonerp.vendas_erp SET vendedor_id = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "data_venda": {
      const v = String(valorJson);
      await tx`UPDATE alissonerp.vendas_erp SET data_venda = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    default:
      throw new Error(`Campo "${campo}" não suportado`);
  }
}
