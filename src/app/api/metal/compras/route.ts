// ═══════════════════════════════════════════════════════════════════════════
// TASK-009: POST/GET /api/metal/compras
//
// REGRA DE NEGÓCIO:
//   POST: Registra uma nova compra de metal (empresa → fornecedor).
//         Compra nasce com status 'pendente_pagamento'.
//         Se acima do teto, nasce 'pendente_aprovacao' e gera notificação
//         para o aprovador configurado.
//   GET:  Lista compras com filtros (data, status, fornecedor).
//
// IMPACTO SE REMOVIDO: Empresa não consegue registrar compras de metal.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { CompraPostSchema } from "@/lib/metal/types";
import { criarCompraMetal, listarCompras } from "@/lib/metal/compras";
import { getModuloConfig } from "@/lib/metal/config";
import { criarNotificacao } from "@/lib/notificacoes";
import { ROLES_METAL } from "@/lib/roles";
import sql from "@/lib/db";

/**
 * REGRA DE NEGÓCIO: verificação de permissão centralizada em @/lib/roles.
 * A constante ROLES_METAL é a fonte única para compras, recebimentos e sidebar.
 */
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão para registrar compras de metal" }, { status: 403 });
  }

  try {
    rateLimit(`metal-compra:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CompraPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await criarCompraMetal(parsed.data, user.id);

    // Se compra foi criada como pendente_aprovacao, cria tarefa + notifica
    if (result.status === "pendente_aprovacao") {
      const config = await getModuloConfig();
      const aprovadorId = (config.metal_aprovador_id ?? "").trim();
      if (aprovadorId) {
        // Cria tarefa no sistema de aprovações
        // Busca nome do fornecedor para o resumo da tarefa
        const [forn] = await sql`
          SELECT nome FROM public.contatos WHERE id_contato = ${result.fornecedor_id} LIMIT 1
        `;
        const fornecedorNome = String(forn?.nome ?? "Não informado");

        const descricao = [
          `Compra de Metal #${result.numero}`,
          `Fornecedor: ${fornecedorNome}`,
          `Peso: ${Number(result.peso_gramas).toFixed(3)}g`,
          `Valor pago: R$ ${Number(result.valor_pago_grama).toFixed(2)}/g`,
          `Valor total: R$ ${Number(result.valor_total).toFixed(2)}`,
          `Teto: R$ ${Number(result.max_limit).toFixed(2)}/g (${Math.round(Number(result.valor_pago_grama) / Number(result.cotacao_ouro) * 100)}% da cotação)`,
        ].join("\n");

        const [tarefa] = await sql`
          INSERT INTO alissonerp.tarefas
            (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo)
          VALUES (
            ${`Aprovação Compra Metal ${result.numero}`},
            ${descricao},
            ${aprovadorId}::uuid,
            ${user.id}::uuid,
            'alta',
            'aguardando_aprovacao',
            ${sql.array(["aprovacao_compra_metal", `compra_metal:${result.id}`])},
            'compra_metal'
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
          VALUES (${tarefa.id}, ${user.id}::uuid, ${aprovadorId}::uuid, 'pendente')
        `;

        await sql`
          UPDATE alissonerp.compras_metal
          SET tarefa_aprovacao_id = ${tarefa.id}
          WHERE id = ${result.id}
        `;

        await criarNotificacao({
          usuarioId: aprovadorId,
          tipo: "aprovacao",
          titulo: `Compra de Metal ${result.numero} aguardando aprovação`,
          mensagem: `${Number(result.peso_gramas).toFixed(3)}g a R$ ${Number(result.valor_pago_grama).toFixed(2)}/g (acima do teto). Total: R$ ${Number(result.valor_total).toFixed(2)}`,
          remetenteId: user.id,
          link: `/tarefas?abrir=${tarefa.id}`,
        }).catch(() => {});
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/metal/compras]", err, (err as Error).message || "Erro ao registrar compra", 400);
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
      fornecedor_id: searchParams.get("fornecedor_id") ? Number(searchParams.get("fornecedor_id")) : undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    };

    const result = await listarCompras(filtros);
    return NextResponse.json(result);
  } catch (err) {
    return internalError("[GET /api/metal/compras]", err);
  }
}
