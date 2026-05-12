import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_FABRICACAO = ["desenvolvedor", "admin", "gerente_fabrica", "pcp", "gerente_loja"] as const;

// ─── POST /api/ordens-fabricacao ─────────────────────────────────────────────
// Cria uma ordem manual de FABRICAÇÃO (tipo_ordem='fabricacao', rota='pcp').
// O fluxo é totalmente automático após o INSERT:
//   1. trg_auto_auditoria_loja cria auditoria 'loja' situacao='pendente'
//   2. Mesmo trigger marca como 'aprovado' imediatamente
//   3. fn_processar_auditoria (rota='pcp') cria a entrada em alissonerp.pcp
//      com etapas='novas_ordens', rota_etapa_atual=1 (defaults da tabela)
//   4. Movimentações de ouro só acontecem quando o operador aponta peso
//
// Body:
//   produto_id            (number) — produto a fabricar (public.produtos.id_produto)
//   quantidade            (number, default 1)
//   peso_metal_negociado  (number, required) — estimativa em gramas
//   data_entrega          (string YYYY-MM-DD, opcional)
//   detalhes              (string, opcional)
//   deposito_id           (number, opcional) — atribui operador inicial
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const canCreate = isFullAccess(role) || ROLES_FABRICACAO.includes(role as typeof ROLES_FABRICACAO[number]);
  if (!canCreate) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const body = await req.json() as {
    produto_id?: number;
    quantidade?: number;
    peso_metal_negociado?: number;
    data_entrega?: string | null;
    detalhes?: string | null;
    deposito_id?: number | null;
  };

  const produto_id = Number(body.produto_id);
  const quantidade = Math.max(1, Number(body.quantidade ?? 1));
  const peso = Number(body.peso_metal_negociado);
  const data_entrega = body.data_entrega || null;
  const detalhes = body.detalhes?.trim() || null;
  const deposito_id = body.deposito_id != null ? Number(body.deposito_id) : null;

  if (!Number.isFinite(produto_id) || produto_id <= 0) {
    return NextResponse.json({ error: "produto_id obrigatorio" }, { status: 400 });
  }
  if (!Number.isFinite(peso) || peso <= 0) {
    return NextResponse.json({ error: "peso_metal_negociado deve ser > 0" }, { status: 400 });
  }
  // Defesa em profundidade: Almoxarifado Central (ID=1) nunca pode ser operador
  // (mesma regra de /api/pcp/[id]/atribuir-operador). UI já filtra, mas chamadas
  // diretas à API precisam ser bloqueadas aqui.
  if (deposito_id != null && deposito_id === 1) {
    return NextResponse.json(
      { error: "Almoxarifado Central nao pode ser operador" },
      { status: 400 }
    );
  }

  // Confirma que produto existe
  const [prod] = await sql`SELECT id_produto, nome, sku FROM public.produtos WHERE id_produto = ${produto_id} LIMIT 1`;
  if (!prod) return NextResponse.json({ error: "Produto nao encontrado" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    // INSERT em ordens — numero_ordem = 'C-' || id usando CTE com nextval
    // para evitar UPDATE pós-insert (trigger auditoria já dispara no INSERT).
    const [ordem] = await tx`
      WITH nx AS (SELECT nextval('alissonerp.ordens_id_seq') AS id)
      INSERT INTO alissonerp.ordens (
        id, numero_ordem, tipo_ordem, rota, origem,
        produto_reposicao_id, peso_metal_negociado, data_entrega,
        detalhes_ordem, created_by, situacao, status
      )
      SELECT
        nx.id,
        'C-' || nx.id,
        'fabricacao'::alissonerp.enum_tipo_ordem,
        'pcp'::alissonerp.enum_rota_ordem,
        'erp',
        ${produto_id},
        ${peso},
        ${data_entrega}::date,
        ${detalhes},
        ${user.id}::uuid,
        'criado'::alissonerp.enum_situacao_ordem,
        'aguardando'::alissonerp.enum_status_ordem
      FROM nx
      RETURNING id, numero_ordem
    `;

    // Triggers já criaram a auditoria + aprovaram + criaram PCP.
    // Pega o pcp recém-criado pra retornar id e (opcionalmente) atribuir operador.
    const [pcp] = await tx`
      SELECT id FROM alissonerp.pcp WHERE ordem_id = ${ordem.id} LIMIT 1
    `;

    // Atribui operador: atualiza pcp.deposito_id E ordens.local_atual
    // (source of truth da view vw_pcp_erp é ordens.local_atual — mesmo padrão
    // do endpoint /api/pcp/[id]/atribuir-operador).
    if (deposito_id != null && pcp?.id) {
      await tx`
        UPDATE alissonerp.pcp SET deposito_id = ${deposito_id}, updated_at = NOW()
        WHERE id = ${pcp.id}
      `;
      await tx`
        UPDATE alissonerp.ordens SET local_atual = ${deposito_id}, updated_at = NOW()
        WHERE id = ${ordem.id}
      `;
    }

    // Se quantidade > 1, persiste no campo `quantidade` do pcp (default é 0)
    if (quantidade > 1 && pcp?.id) {
      await tx`
        UPDATE alissonerp.pcp SET quantidade = ${quantidade}, updated_at = NOW()
        WHERE id = ${pcp.id}
      `;
    }

    return { ordem_id: ordem.id, numero_ordem: ordem.numero_ordem, pcp_id: pcp?.id ?? null };
  });

  return NextResponse.json({ ok: true, ...result, produto: { id: prod.id_produto, nome: prod.nome, sku: prod.sku } });
}
