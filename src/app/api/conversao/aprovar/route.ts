import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ConversaoAprovarSchema = z.object({
  tarefa_id: z.coerce.number().int().positive(),
  conversao_id: z.coerce.number().int().positive().optional(),
}).passthrough();

// POST /api/conversao/aprovar
// Body: { tarefa_id: number, conversao_id: number }
// Conversão 2.0: Alisson aprova → conversão concluída, joias entram no Caixa de Ouro
// REGRA DE NEGÓCIO:
//   - Baixa o estoque comercial imediatamente (efetiva reserva + movimento 'virou_peso')
//   - Insere registro no cofre_ouro_rastreios (evento='entrada_conversao')
//   - A view vw_cofre_ouro_disponivel soma o peso ao saldo do Caixa de Ouro
//   - Quando o ouro for derretido futuramente, usa o fluxo normal de baixa do cofre
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verificar se usuário é admin/desenvolvedor (Alisson)
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !["admin", "desenvolvedor"].includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas administradores podem aprovar conversões" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConversaoAprovarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tarefa_id, conversao_id } = parsed.data;

  // Verificar se tarefa existe e está 'aguardando_aprovacao'
  const [tarefa] = await sql`
    SELECT id, status::text as status, ordem_id
    FROM alissonerp.tarefas WHERE id = ${tarefa_id} AND ordem_id IS NOT NULL
    LIMIT 1
  `;
  if (!tarefa) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }
  if (tarefa.status !== "aguardando_aprovacao") {
    return NextResponse.json({ error: `Tarefa já foi ${tarefa.status}` }, { status: 409 });
  }

  // Buscar conversao pelo ordem_id da tarefa (ou pelo conversao_id enviado)
  // Busca ampliada: inclui peso_total, numero_ordem e insumo_destino para o rastreio do cofre
  const [conversao] = conversao_id
    ? await sql`
        SELECT ce.id, ce.status_conversao, ce.ordem_id, ce.peso_total, o.numero_ordem, ce.insumo_destino
        FROM alissonerp.conversoes_estoque ce
        JOIN alissonerp.ordens o ON o.id = ce.ordem_id
        WHERE ce.id = ${conversao_id}
        LIMIT 1
      `
    : await sql`
        SELECT ce.id, ce.status_conversao, ce.ordem_id, ce.peso_total, o.numero_ordem, ce.insumo_destino
        FROM alissonerp.conversoes_estoque ce
        JOIN alissonerp.ordens o ON o.id = ce.ordem_id
        WHERE ce.ordem_id = ${tarefa.ordem_id}
        LIMIT 1
      `;
  if (!conversao) {
    return NextResponse.json({ error: "Conversão não encontrada" }, { status: 404 });
  }
  if (conversao.status_conversao !== "pendente") {
    return NextResponse.json({ error: `Conversão já está "${conversao.status_conversao}"` }, { status: 409 });
  }

  // Buscar itens da conversão com reserva_id para baixa no estoque
  const itens = await sql`
    SELECT ci.id, ci.produto_id, ci.quantidade, ci.peso_individual, ci.reserva_id, p.nome AS produto_nome
    FROM alissonerp.conversao_itens ci
    JOIN public.produtos p ON p.id_produto = ci.produto_id
    WHERE ci.conversao_id = ${conversao.id}
  `;

  // Montar descrição dos produtos para o rastreio do cofre
  const descricaoItens = itens
    .map((i: any) => `${i.produto_nome} (${Number(i.peso_individual)}g x${i.quantidade})`)
    .join("; ");

  // Aprovação — tudo dentro de transação
  await sql.begin(async (tx: any) => {
    // Atualizar tarefa para 'aprovada'
    await tx`
      UPDATE alissonerp.tarefas
      SET status = 'aprovada', concluida_em = NOW(), updated_at = NOW()
      WHERE id = ${tarefa_id}
    `;

    // Conversão 2.0: status_conversao = 'concluido' + cofre_registrado = true
    // A conversão entra no Caixa de Ouro automaticamente — não vai mais para protocolo
    await tx`
      UPDATE alissonerp.conversoes_estoque
      SET status_conversao = 'concluido',
          cofre_registrado = true,
          aprovado_por = ${user.id}::uuid,
          aprovado_em = NOW(),
          updated_at = NOW()
      WHERE id = ${conversao.id}
    `;

    // Para cada item: efetivar reserva + criar movimento de saída (virou_peso)
    // O estoque comercial é baixado no local_estoque_id = 2 (loja)
    for (const item of itens) {
      if (item.reserva_id) {
        await tx`
          UPDATE alissonerp.reservas_estoque_comercial
          SET status = 'efetivado', efetivado_em = NOW()
          WHERE id = ${item.reserva_id} AND status = 'ativo'
        `;

        const [mov] = await tx`
          INSERT INTO alissonerp.movimentacoes_estoque_comercial
            (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, referencia_id, observacao, created_by)
          VALUES
            (${item.produto_id}, 'saida', ${item.quantidade}, 'virou_peso', 2, 'efetivado',
             ${conversao.ordem_id}, ${conversao.ordem_id},
             ${'Conversao de estoque — virou peso (Ordem ' + conversao.numero_ordem + ')'},
             ${user.id}::uuid)
          RETURNING id
        `;

        // Vincular movimento de baixa ao item da conversão
        await tx`
          UPDATE alissonerp.conversao_itens
          SET movimento_baixa_id = ${mov.id}
          WHERE id = ${item.id}
        `;
      }
    }

    // Inserir rastreio no Caixa de Ouro (entrada_conversao)
    // REGRA DE OURO #1 (Crediário): não se aplica aqui — é uma entrada nova no cofre
    await tx`
      INSERT INTO alissonerp.cofre_ouro_rastreios
        (evento, gramas, origem_nome, observacao, created_at)
      VALUES
        ('entrada_conversao', ${conversao.peso_total},
         ${'Conversao ' + conversao.numero_ordem},
         ${descricaoItens},
         NOW())
    `;

    // Concluir a ordem (não vai para protocolo)
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
      WHERE id = ${conversao.ordem_id}
    `;

    // Registrar no histórico da tarefa
    await tx`
      INSERT INTO alissonerp.tarefas_historico
        (tarefa_id, usuario_id, acao, created_at)
      VALUES (${tarefa_id}, ${user.id}::uuid, 'aprovada', NOW())
    `.catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    message: `Conversão aprovada! ${Number(conversao.peso_total)}g entraram no Caixa de Ouro.`,
  });
}
