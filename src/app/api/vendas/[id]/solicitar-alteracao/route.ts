import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401, ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";

const SolicitarAlteracaoSchema = z.object({
  tipo: z.enum(["pagamento_status", "venda_campo"]),
  pagamento_id: z.number().int().positive().optional(),
  campo: z.string().max(50).optional(),
  valor_solicitado: z.unknown(),
  motivo: z.string().min(1).max(1000),
});

// Campos permitidos pra solicitação de alteração de venda — espelha a lista
// de CAMPOS_ADMIN_ONLY do PATCH /api/vendas/[id].
const CAMPOS_VENDA_PERMITIDOS = new Set([
  "situacao", "cliente_id", "vendedor_id", "data_venda",
]);

// Status válidos para pagamento (espelha enum do PagamentoPatchSchema).
const STATUS_PAGAMENTO_VALIDOS = new Set([
  "pendente", "confirmado", "cancelado", "estornado",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Ownership: vendedora só pede alteração de venda própria
  try {
    await requireVendaOwnership(user, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Bloqueia solicitação se venda já está num estado final
  const [vendaSituacao] = await sql<{ situacao: string }[]>`
    SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId} LIMIT 1
  `;
  if (vendaSituacao && ["cancelada", "cancelado", "bloqueada", "bloqueado", "concluida", "concluido"].includes(vendaSituacao.situacao)) {
    return NextResponse.json(
      { error: "Não é possível solicitar alteração em venda cancelada, bloqueada ou concluída." },
      { status: 409 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitarAlteracaoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Validação por tipo + snapshot do valor atual
  let valorAtual: unknown = null;

  if (body.tipo === "pagamento_status") {
    if (!body.pagamento_id) {
      return NextResponse.json({ error: "pagamento_id é obrigatório para tipo pagamento_status" }, { status: 400 });
    }
    const valor = body.valor_solicitado;
    if (typeof valor !== "string" || !STATUS_PAGAMENTO_VALIDOS.has(valor)) {
      return NextResponse.json({ error: "valor_solicitado inválido para status de pagamento" }, { status: 400 });
    }
    const [pag] = await sql`
      SELECT id, status FROM alissonerp.pagamentos_venda
      WHERE id = ${body.pagamento_id} AND venda_id = ${vendaId}
      LIMIT 1
    `;
    if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    valorAtual = pag.status;
  } else {
    // venda_campo
    if (!body.campo || !CAMPOS_VENDA_PERMITIDOS.has(body.campo)) {
      return NextResponse.json({ error: "Campo não permitido para solicitação" }, { status: 400 });
    }
    const [venda] = await sql<Record<string, unknown>[]>`
      SELECT situacao, cliente_id, vendedor_id, data_venda
      FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
    valorAtual = venda[body.campo] ?? null;
  }

  // Bloqueia duplicata pendente
  const [duplicada] = await sql`
    SELECT id FROM alissonerp.solicitacoes_alteracao
    WHERE venda_id = ${vendaId}
      AND status = 'pendente'
      AND COALESCE(campo, '') = COALESCE(${body.campo ?? null}, '')
      AND COALESCE(pagamento_id, 0) = COALESCE(${body.pagamento_id ?? null}, 0)
    LIMIT 1
  `;
  if (duplicada) {
    return NextResponse.json(
      { error: "Já existe uma solicitação pendente para esta alteração." },
      { status: 409 },
    );
  }

  // Nome do solicitante para snapshot (evita JOIN futuro na listagem)
  const [u] = await sql`SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const solicitanteNome = (u?.nome as string | undefined) ?? user.email ?? "Usuário";

  const [criada] = await sql`
    INSERT INTO alissonerp.solicitacoes_alteracao
      (tipo, venda_id, pagamento_id, campo, valor_atual, valor_solicitado,
       motivo, solicitado_por_id, solicitado_por_nome)
    VALUES (
      ${body.tipo},
      ${vendaId},
      ${body.pagamento_id ?? null},
      ${body.campo ?? null},
      ${JSON.stringify(valorAtual)}::jsonb,
      ${JSON.stringify(body.valor_solicitado)}::jsonb,
      ${body.motivo},
      ${user.id}::uuid,
      ${solicitanteNome}
    )
    RETURNING id, status
  `;

  // Notifica admins/desenvolvedores/diretores. Erro em notificação não derruba a operação.
  try {
    const admins = await sql<{ id: string }[]>`
      SELECT id FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'diretor')
    `;
    const [vendaRow] = await sql`SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
    const numeroVenda = vendaRow?.numero_venda ?? `#${vendaId}`;
    const titulo = "Solicitação de alteração de venda";
    const descricaoAlvo = body.tipo === "pagamento_status"
      ? `pagamento ${body.pagamento_id}`
      : `campo ${body.campo}`;
    const mensagem = `${solicitanteNome} pediu alteração em ${descricaoAlvo} da venda ${numeroVenda}.`;
    const link = `/vendas/solicitacoes-alteracao`;
    for (const admin of admins) {
      await criarNotificacao({
        usuarioId: admin.id,
        tipo: "aprovacao",
        titulo,
        mensagem,
        remetenteId: user.id,
        vendaId,
        link,
      });
    }
  } catch (e) {
    console.error(`[solicitar-alteracao] erro ao notificar admins venda=${vendaId}:`, e);
  }

  return NextResponse.json({ id: criada.id, status: criada.status });
}
