import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_CREDIARIO = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// GET /api/crediario/[id]
// [id] = conta_receber_id
// Retorna detalhes completos + histórico de comunicações
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_CREDIARIO.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [conta, comunicacoes] = await Promise.all([
    sql`
      SELECT
        conta_receber_id, descricao, valor, data_vencimento, data_recebimento,
        situacao, status_aging, dias_atraso, obs, created_at,
        venda_id, numero_venda, total_venda, venda_situacao, venda_bloqueada,
        credito_gerente_usado, venda_created_at,
        cliente_id, cliente_nome, cliente_telefone, cliente_email,
        vendedor_id, vendedor_nome,
        consultora_uuid, consultora_nome
      FROM alissonerp.vw_crediario
      WHERE conta_receber_id = ${contaId}
      LIMIT 1
    `,
    sql`
      SELECT cc.id, cc.tipo, cc.mensagem, cc.created_at,
        u.nome AS usuario_nome
      FROM alissonerp.comunicacoes_crediario cc
      LEFT JOIN alissonerp.usuarios u ON u.id = cc.usuario_id
      WHERE cc.conta_receber_id = ${contaId}
      ORDER BY cc.created_at ASC
    `,
  ]);

  if (!conta[0]) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // Consultora só vê suas próprias contas
  if (usuario.role === "consultora" && usuario.vendedor_id != null) {
    if (conta[0].vendedor_id !== usuario.vendedor_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  const c = conta[0];
  return NextResponse.json({
    ...c,
    valor:               Number(c.valor),
    total_venda:         c.total_venda ? Number(c.total_venda) : null,
    credito_gerente_usado: c.credito_gerente_usado ? Number(c.credito_gerente_usado) : null,
    dias_atraso:         Number(c.dias_atraso ?? 0),
    comunicacoes:        comunicacoes.map(cc => ({ ...cc })),
  });
}
