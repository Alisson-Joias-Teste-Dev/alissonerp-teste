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

const ROLES_FINANCEIRO = ["admin", "desenvolvedor", "diretor"];

const DecidirSchema = z.object({
  decisao: z.enum(["aprovado", "rejeitado"]),
  motivo: z.string().max(1000).optional(),
});

// Campos editáveis na venda (espelha CAMPOS_ADMIN_ONLY do PATCH /api/vendas/[id]).
const CAMPOS_VENDA_PERMITIDOS = new Set([
  "situacao", "total_frete", "cliente_id", "vendedor_id", "data_venda",
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

  // Aplica a mudança ANTES de marcar como aprovado — se falhar, devolve 409 e
  // a solicitação fica pendente para nova tentativa.
  // Se algum campo só pode ser alterado em rascunho e a venda saiu desse estado,
  // a solicitação é auto-rejeitada (status='rejeitado' + retorno 400).
  const decisaoFinal: "aprovado" | "rejeitado" = body.decisao;
  const motivoFinal: string | null = body.motivo ?? null;

  if (body.decisao === "aprovado") {
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

      try {
        await aplicarStatusPagamento(Number(sol.venda_id), pagId, novoStatus, user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao aplicar status";
        console.error(`[solicitacoes-alteracao] erro ao aplicar pagamento sol=${solId}:`, e);
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    } else if (sol.tipo === "venda_campo") {
      const campo = String(sol.campo);
      if (!CAMPOS_VENDA_PERMITIDOS.has(campo)) {
        return NextResponse.json({ error: "Campo não permitido" }, { status: 409 });
      }

      // Espelha o guard "só rascunho" do PATCH /api/vendas/[id] linha 293-297.
      if (CAMPOS_RESTRITOS_RASCUNHO.has(campo)) {
        const [vAtual] = await sql<{ situacao: string }[]>`
          SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${sol.venda_id}
        `;
        if (vAtual && vAtual.situacao !== "rascunho") {
          // Auto-rejeita: registra decisão como rejeitado, com motivo explicando.
          const motivoAuto = `Auto-rejeitada: campo "${campo}" só pode ser alterado em venda em rascunho (situacao atual: ${vAtual.situacao}).`;
          await sql`
            UPDATE alissonerp.solicitacoes_alteracao
            SET status = 'rejeitado',
                decidido_por_id = ${user.id}::uuid,
                decidido_por_nome = ${aprovadorNome},
                motivo_decisao = ${motivoAuto},
                decidido_em = NOW()
            WHERE id = ${solId}
          `;
          return NextResponse.json(
            { error: `Só é possível alterar esse campo em vendas em rascunho. Solicitação foi rejeitada automaticamente.` },
            { status: 400 },
          );
        }
      }

      try {
        await aplicarCampoVenda(Number(sol.venda_id), campo, sol.valor_solicitado, user.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao aplicar campo";
        console.error(`[solicitacoes-alteracao] erro ao aplicar campo sol=${solId}:`, e);
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    }
  }

  await sql`
    UPDATE alissonerp.solicitacoes_alteracao
    SET status = ${decisaoFinal},
        decidido_por_id = ${user.id}::uuid,
        decidido_por_nome = ${aprovadorNome},
        motivo_decisao = ${motivoFinal},
        decidido_em = NOW()
    WHERE id = ${solId}
  `;

  // Auditoria da decisão — fora de tx pq logAudit é fire-and-forget seguro.
  await logAudit(sql, {
    tabela: "solicitacoes_alteracao",
    operacao: "UPDATE",
    registro_id: solId,
    usuario_id: user.id,
    dados_antes: { status: "pendente" },
    dados_depois: {
      status: decisaoFinal,
      decidido_por_nome: aprovadorNome,
      motivo_decisao: motivoFinal,
      acao: decisaoFinal === "aprovado" ? "alteracao_aprovada" : "alteracao_rejeitada",
    },
  });

  // Notifica solicitante
  try {
    const titulo = body.decisao === "aprovado"
      ? "Solicitação aprovada"
      : "Solicitação rejeitada";
    const alvo = sol.tipo === "pagamento_status"
      ? `pagamento ${sol.pagamento_id}`
      : `campo ${sol.campo}`;
    const mensagem = body.decisao === "aprovado"
      ? `Sua solicitação de alteração em ${alvo} foi aprovada por ${aprovadorNome}.`
      : `Sua solicitação de alteração em ${alvo} foi rejeitada. ${body.motivo ?? ""}`.trim();
    const link = `/vendas/${sol.venda_id}`;
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, venda_id, link)
      VALUES
        (${String(sol.solicitado_por_id)}::uuid, 'aprovacao', ${titulo}, ${mensagem},
         ${user.id}::uuid, ${sol.venda_id}, ${link})
    `;
  } catch (e) {
    console.error(`[solicitacoes-alteracao] erro ao notificar solicitante sol=${solId}:`, e);
  }

  return NextResponse.json({ ok: true });
}

// ─── Aplicação de mudança de status de pagamento ─────────────────────────────
// Espelha a lógica do PATCH /api/vendas/[id]/pagamentos/[pagId] sem os
// guards de role (admin já passou no gate do PATCH desta rota).
async function aplicarStatusPagamento(
  vendaId: number,
  pagId: number,
  novoStatus: string,
  adminId: string,
): Promise<void> {
  // Atomicidade do UPDATE em pagamentos_venda. As cadeias approveVenda/
  // concluirVenda/estornarVenda têm transações próprias internas e rodam
  // depois do commit deste UPDATE (best-effort, fora da tx).
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
  });

  if (novoStatus === "confirmado") {
    // Auto-aprovar + auto-concluir, mesma cadeia do PATCH original
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
      console.error(`[aplicarStatusPagamento] auto-aprovar/concluir venda=${vendaId}:`, e);
    }
  } else if (novoStatus === "estornado") {
    try {
      await estornarVenda(vendaId, pagId, { motivo: "Estorno via solicitação de alteração" });
    } catch (e) {
      console.error(`[aplicarStatusPagamento] estornarVenda venda=${vendaId} pag=${pagId}:`, e);
    }
  }
}

// ─── Aplicação de mudança de campo da venda ──────────────────────────────────
// Cada campo tem cast específico para casar o tipo da coluna.
// `situacao` é roteado pelos helpers compartilhados (approveVenda,
// concluirVenda, estornarVenda) — mesma cadeia do PATCH /api/vendas/[id].
async function aplicarCampoVenda(
  vendaId: number,
  campo: string,
  valorJson: unknown,
  adminId: string,
): Promise<void> {
  switch (campo) {
    case "situacao": {
      const v = String(valorJson);
      // Roteia transição de estado pelos helpers oficiais — evita bypass
      // dos guards (Tiny sync, ordem, conta receber, etc).
      if (v === "aprovado") {
        await approveVenda(vendaId, adminId, { tinyBestEffort: true });
        return;
      }
      if (v === "concluido") {
        await concluirVenda(vendaId, adminId, { tinyBestEffort: true });
        return;
      }
      // Demais transições (rascunho/cancelado/enviado/entregue) — UPDATE direto
      // mantém o comportamento atual do PATCH (linha 701-725).
      await sql`UPDATE alissonerp.vendas_erp SET situacao = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "total_frete": {
      const v = Number(valorJson);
      if (isNaN(v) || v < 0) throw new Error("total_frete inválido");
      await sql`
        UPDATE alissonerp.vendas_erp
        SET total_frete = ${v},
            total_venda = total_produtos + ${v},
            updated_at = NOW()
        WHERE id = ${vendaId}
      `;
      return;
    }
    case "cliente_id": {
      const v = valorJson == null ? null : Number(valorJson);
      if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error("cliente_id inválido");
      await sql`UPDATE alissonerp.vendas_erp SET cliente_id = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "vendedor_id": {
      const v = valorJson == null ? null : Number(valorJson);
      if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error("vendedor_id inválido");
      await sql`UPDATE alissonerp.vendas_erp SET vendedor_id = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    case "data_venda": {
      const v = String(valorJson);
      await sql`UPDATE alissonerp.vendas_erp SET data_venda = ${v}, updated_at = NOW() WHERE id = ${vendaId}`;
      return;
    }
    default:
      throw new Error(`Campo "${campo}" não suportado`);
  }
}
