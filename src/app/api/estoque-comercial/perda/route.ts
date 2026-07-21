import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isMasterAdmin } from "@/lib/master-admin";
import { logAudit } from "@/lib/audit";
import { MOTIVO_PERDA, CONFIRMACAO_PERDA } from "@/lib/perda-extravio";
import { zodError } from "@/lib/schemas/common";

/**
 * PERDA / EXTRAVIO DE PECA — baixa de estoque comercial.
 *
 * REGRA DE NEGOCIO (decidida pelo Jonathan em 21/07/2026):
 *   - Peca que sumiu (nao localizada, quebrada, extraviada) precisa sair do estoque,
 *     senao o saldo do sistema fica mentindo para sempre e a peca reaparece em
 *     relatorio, em venda e no proximo inventario.
 *   - Essa e a UNICA baixa manual que existe no ERP e e EXCLUSIVA do master admin
 *     (o dono — parametros_sistema.MASTER_ADMIN_USER_ID, hoje o Alisson).
 *     NAO e permissao por cargo: admin, desenvolvedor, gerente — ninguem mais faz.
 *     Por isso o gate usa isMasterAdmin(user.id) e NAO uma lista de roles.
 *
 * POR QUE UM ENDPOINT SEPARADO (e nao reabrir /estoque-comercial/movimentos):
 *   a trava da v2.81.3 ("baixa manual nao existe para ninguem") continua valendo
 *   naquele endpoint. Perda e uma excecao explicita, nomeada, com dono unico e
 *   auditada — nao um buraco na trava generica.
 *
 * IMPACTO SE ALTERADO/REMOVIDO: se o gate virar checagem por role, qualquer um dos
 * 7 admins passa a poder sumir com peca de ouro pelo sistema, sem aprovacao.
 */

const PerdaPostSchema = z.object({
  produto_id:       z.coerce.number().int().positive(),
  local_estoque_id: z.coerce.number().int().positive(),
  quantidade:       z.coerce.number().int().positive(),
  // Motivo é OPCIONAL (decisão do Jonathan, 21/07/2026). O freio que segura a
  // baixa acidental é a palavra PERDA digitada; o rastro de quem/quando/quanto
  // fica gravado de qualquer jeito no movimento e no audit_log.
  motivo:           z.string().trim().optional(),
  confirmacao:      z.string(),
});

// GET /api/estoque-comercial/perda?produto_id=123
// Responde se o usuario logado pode registrar perda e, se sim, o historico de
// faltas desta peca em inventarios — a "prova" que o dono ve antes de dar baixa.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const produtoId = Number(new URL(req.url).searchParams.get("produto_id"));
  if (!produtoId) return NextResponse.json({ error: "produto_id obrigatorio" }, { status: 400 });

  const podeRegistrar = await isMasterAdmin(user.id);

  // Historico de faltas: todo inventario NAO cancelado em que a peca foi contada
  // e deu diferenca negativa (contou menos do que o sistema dizia).
  // POR QUE: a decisao de dar baixa por perda se apoia em quantas vezes a peca
  // sumiu na contagem. Sem isso o dono baixaria no escuro.
  const faltas = await sql<{
    inventario_id: number;
    data: string;
    local_nome: string | null;
    faltou: number;
    desfecho: string | null;
  }[]>`
    SELECT
      inv.id                                              AS inventario_id,
      COALESCE(inv.data_conclusao, inv.data_abertura)     AS data,
      le.nome                                             AS local_nome,
      (-i.diferenca)::int                                 AS faltou,
      i.pendencia_desfecho_tipo                           AS desfecho
    FROM alissonerp.itens_inventario_comercial i
    JOIN alissonerp.inventarios_comercial inv ON inv.id = i.inventario_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = inv.local_estoque_id
    WHERE i.produto_id = ${produtoId}
      AND i.quantidade_contada IS NOT NULL
      AND i.diferenca < 0
      AND inv.status <> 'cancelado'
    ORDER BY COALESCE(inv.data_conclusao, inv.data_abertura) DESC
    LIMIT 20
  `;

  return NextResponse.json({ podeRegistrar, faltas });
}

// POST /api/estoque-comercial/perda
// Registra a baixa por perda/extravio. Exclusivo do master admin.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  // Gate por IDENTIDADE, nao por cargo (ver cabecalho do arquivo).
  if (!(await isMasterAdmin(user.id))) {
    return NextResponse.json(
      { error: "Somente o administrador master pode registrar perda/extravio" },
      { status: 403 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = PerdaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { produto_id, local_estoque_id, quantidade, confirmacao } = parsed.data;
  // Sem motivo escrito grava NULL (nao string vazia), pra tela nao renderizar
  // uma observacao em branco embaixo da linha do extrato.
  const observacao = parsed.data.motivo?.trim() || null;

  if (confirmacao.trim().toUpperCase() !== CONFIRMACAO_PERDA) {
    return NextResponse.json(
      { error: `Digite ${CONFIRMACAO_PERDA} para confirmar a baixa` },
      { status: 400 },
    );
  }

  // Trava de saldo: baixa limitada ao DISPONIVEL (fisico - reservado), nunca ao fisico.
  // POR QUE: o reservado ja esta prometido a uma venda/ordem. Baixar em cima da
  // reserva faria a peca sumir de um pedido aprovado e a entrega quebraria depois.
  const [saldo] = await sql<{ disponivel: number; saldo_fisico: number }[]>`
    SELECT
      COALESCE(SUM(disponivel), 0)::int   AS disponivel,
      COALESCE(SUM(saldo_fisico), 0)::int AS saldo_fisico
    FROM alissonerp.vw_saldo_estoque_comercial_v2
    WHERE produto_id = ${produto_id} AND local_estoque_id = ${local_estoque_id}
  `;
  const disponivel = Number(saldo?.disponivel ?? 0);
  if (quantidade > disponivel) {
    return NextResponse.json(
      { error: `Disponivel neste local: ${disponivel}. Nao da para baixar ${quantidade}.` },
      { status: 409 },
    );
  }

  // tx tipado como any segue o padrao do projeto: TransactionSql conflita com Sql
  // na assinatura de logAudit e nas tagged templates genericas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const movimento = await sql.begin(async (tx: any) => {
    const [mov] = await tx`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by)
      VALUES
        (${produto_id}, 'saida', ${quantidade}, ${MOTIVO_PERDA},
         ${local_estoque_id}, 'efetivado', ${observacao}, ${user.id})
      RETURNING id, created_at
    `;

    await logAudit(tx, {
      tabela: "movimentacoes_estoque_comercial",
      operacao: "INSERT",
      registro_id: mov.id,
      usuario_id: user.id,
      dados_depois: { motivo: MOTIVO_PERDA, produto_id, local_estoque_id, quantidade, observacao },
    });

    return [mov];
  });

  const mov = (movimento as { id: number; created_at: string }[])[0];

  return NextResponse.json(
    { id: mov.id, created_at: mov.created_at },
    { status: 201 },
  );
}
