import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";

const ROLES_CONCLUIR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "pcp"] as const;

// ─── POST /api/ordens-fabricacao/[id]/concluir-estoque ───────────────────────
// Conclui uma ordem de fabricação MANDANDO DIRETO PRO ESTOQUE COMERCIAL,
// sem passar por protocolo de entrega loja. Só funciona pra ordens que:
//   1. tipo_ordem = 'fabricacao'
//   2. produto_reposicao_id IS NOT NULL (é reposição de estoque)
//   3. PCP em etapa 'concluido' (saída já foi registrada)
//   4. Ordem ainda não foi concluída
//
// Cria movimentação de ENTRADA em movimentacoes_estoque_comercial
// referenciando a ordem. Status default = 'ativo'.
// Marca a ordem como status='concluido' (data_conclusao=NOW).
//
// Esta é a Fase 4 da rota de fabricação — alternativa ao protocolo
// loja pra reposição automática/manual de estoque.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const canConcluir = isFullAccess(role) || ROLES_CONCLUIR.includes(role as typeof ROLES_CONCLUIR[number]);
  if (!canConcluir) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await ctx.params;
  const ordemId = Number(id);
  if (!Number.isFinite(ordemId) || ordemId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  // Valida estado da ordem
  const [ordem] = await sql`
    SELECT o.id, o.numero_ordem, o.tipo_ordem::text AS tipo_ordem,
           o.produto_reposicao_id, o.status::text AS status,
           p.id AS pcp_id, p.etapas::text AS pcp_etapas, p.quantidade
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.pcp p ON p.ordem_id = o.id
    WHERE o.id = ${ordemId}
    LIMIT 1
  `;
  if (!ordem) return NextResponse.json({ error: "Ordem nao encontrada" }, { status: 404 });

  if (ordem.tipo_ordem !== "fabricacao") {
    return NextResponse.json({ error: "Apenas ordens de fabricacao" }, { status: 400 });
  }
  if (!ordem.produto_reposicao_id) {
    return NextResponse.json(
      { error: "Ordem nao e reposicao (sem produto_reposicao_id). Use o protocolo de entrega normal." },
      { status: 400 }
    );
  }
  if (ordem.pcp_etapas !== "concluido") {
    return NextResponse.json(
      { error: `PCP em "${ordem.pcp_etapas}" — saida precisa estar concluida antes` },
      { status: 400 }
    );
  }
  if (ordem.status === "concluido") {
    return NextResponse.json({ error: "Ordem ja concluida" }, { status: 400 });
  }

  // Quantidade a entrar no estoque: pcp.quantidade (default 1 se zero)
  const qtd = Math.max(1, Math.floor(Number(ordem.quantidade ?? 1)));
  // Local de estoque comercial default (configuração via parametros_sistema)
  const localEstoqueId = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    // ENTRADA no estoque comercial
    // status='efetivado' (check constraint), tipo='entrada' (check constraint)
    const [mov] = await tx`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial (
        produto_id, tipo, quantidade, motivo, ordem_id,
        referencia_id, referencia_tipo, observacao, status,
        local_estoque_id, created_by
      ) VALUES (
        ${ordem.produto_reposicao_id},
        'entrada',
        ${qtd},
        'fabricacao_reposicao',
        ${ordemId},
        ${ordemId},
        'ordem_fabricacao',
        ${'Fabricacao concluida via ' + ordem.numero_ordem},
        'efetivado',
        ${localEstoqueId},
        ${user.id}::uuid
      )
      RETURNING id
    `;

    // Marca ordem como concluida
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'concluido'::alissonerp.enum_status_ordem,
          data_conclusao = NOW(),
          updated_at = NOW(),
          updated_by = ${user.id}::uuid
      WHERE id = ${ordemId}
    `;

    return { movimentacao_id: mov.id, quantidade: qtd };
  });

  return NextResponse.json({
    ok: true,
    ordem_id: ordemId,
    numero_ordem: ordem.numero_ordem,
    produto_id: Number(ordem.produto_reposicao_id),
    ...result,
  });
}
