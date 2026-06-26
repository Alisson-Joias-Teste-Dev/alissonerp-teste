// ═══════════════════════════════════════════════════════════════════════════
// TASK-014: POST/GET /api/metal/recebimentos
//
// REGRA DE NEGÓCIO:
//   POST: Registra recebimento de metal do cliente como parte de pag.
//         Vincula à venda. Excedente → saldo do cliente.
//   GET:  Lista recebimentos com filtros (data, status, cliente).
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { RecebimentoPostSchema } from "@/lib/metal/types";
import { criarRecebimentoMetal, listarRecebimentos } from "@/lib/metal/recebimentos";
import { getModuloConfig } from "@/lib/metal/config";
import { criarNotificacao } from "@/lib/notificacoes";
import { ROLES_METAL } from "@/lib/roles";
import sql from "@/lib/db";


export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão para registrar recebimentos de metal" }, { status: 403 });
  }

  try {
    rateLimit(`metal-recebimento:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = RecebimentoPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await criarRecebimentoMetal(parsed.data, user.id);

    // REGRA DE NEGÓCIO: Se recebimento acima do teto, cria tarefa de aprovação
    // + notificação para o aprovador configurado (mesmo fluxo da compra de metal).
    if (result.status === "pendente_aprovacao") {
      const config = await getModuloConfig();
      const aprovadorId = (config.metal_aprovador_id ?? "").trim();
      if (aprovadorId) {
        // Busca nome do cliente para o resumo da tarefa
        const [cli] = await sql`
          SELECT nome FROM public.contatos WHERE id_contato = ${result.cliente_id} LIMIT 1
        `;
        const clienteNome = String(cli?.nome ?? "Não informado");

        const descricao = [
          `Recebimento de Metal #${result.numero}`,
          `Cliente: ${clienteNome}`,
          `Peso: ${Number(result.peso_gramas).toFixed(3)}g`,
          `Crédito: R$ ${Number(result.valor_credito_grama).toFixed(2)}/g`,
          `Valor total: R$ ${Number(result.valor_total).toFixed(2)}`,
          `Teto: R$ ${Number(result.max_limit).toFixed(2)}/g (${Math.round(Number(result.valor_credito_grama) / Number(result.cotacao_ouro) * 100)}% da cotação)`,
        ].join("\n");

        const [tarefa] = await sql`
          INSERT INTO alissonerp.tarefas
            (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo)
          VALUES (
            ${`Aprovação Recebimento Metal ${result.numero}`},
            ${descricao},
            ${aprovadorId}::uuid,
            ${user.id}::uuid,
            'alta',
            'aguardando_aprovacao',
            ${sql.array(["aprovacao_recebimento_metal", `recebimento_metal:${result.id}`])},
            'recebimento_metal'
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
          VALUES (${tarefa.id}, ${user.id}::uuid, ${aprovadorId}::uuid, 'pendente')
        `;

        await sql`
          UPDATE alissonerp.recebimentos_metal
          SET tarefa_aprovacao_id = ${tarefa.id}
          WHERE id = ${result.id}
        `;

        await criarNotificacao({
          usuarioId: aprovadorId,
          tipo: "aprovacao",
          titulo: `Recebimento de Metal ${result.numero} aguardando aprovação`,
          mensagem: `${Number(result.peso_gramas).toFixed(3)}g a R$ ${Number(result.valor_credito_grama).toFixed(2)}/g (acima do teto). Total: R$ ${Number(result.valor_total).toFixed(2)}`,
          remetenteId: user.id,
          link: `/tarefas?abrir=${tarefa.id}`,
        }).catch(() => {});
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/metal/recebimentos]", err, (err as Error).message || "Erro ao registrar recebimento", 400);
  }
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const filtros = {
      data_inicio: searchParams.get("data_inicio") || undefined,
      data_fim: searchParams.get("data_fim") || undefined,
      status: searchParams.get("status") || undefined,
      cliente_id: searchParams.get("cliente_id") ? Number(searchParams.get("cliente_id")) : undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    };

    const result = await listarRecebimentos(filtros);
    return NextResponse.json(result);
  } catch (err) {
    return internalError("[GET /api/metal/recebimentos]", err);
  }
}
