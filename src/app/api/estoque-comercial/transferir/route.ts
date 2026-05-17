import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// GET /api/estoque-comercial/transferir — lista transferências
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // pendente, concluido, cancelado

  const rows = await sql`
    SELECT
      t.id, t.produto_id, t.quantidade, t.status, t.obs, t.ordem_solicitacao,
      t.local_origem_id, lo.nome AS local_origem_nome,
      t.local_destino_id, ld.nome AS local_destino_nome,
      p.nome AS nome_produto, p.sku,
      t.created_at, t.recebido_em, t.cancelado_em,
      ue.email AS enviado_por_email,
      ur.email AS recebido_por_email
    FROM alissonerp.transferencias_estoque_comercial t
    LEFT JOIN alissonerp.locais_estoque lo ON lo.id = t.local_origem_id
    LEFT JOIN alissonerp.locais_estoque ld ON ld.id = t.local_destino_id
    LEFT JOIN public.produtos p ON p.id_produto = t.produto_id
    LEFT JOIN auth.users ue ON ue.id = t.enviado_por
    LEFT JOIN auth.users ur ON ur.id = t.recebido_por
    WHERE (${status}::text IS NULL OR t.status = ${status})
    ORDER BY
      CASE t.status WHEN 'pendente' THEN 0 ELSE 1 END,
      t.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json(rows);
}

// POST /api/estoque-comercial/transferir — criar nova transferência
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json() as {
      produto_id: number;
      quantidade: number;
      local_origem_id: number;
      local_destino_id: number;
      ordem_solicitacao: string;
      obs?: string;
    };

    const { produto_id, quantidade, local_origem_id, local_destino_id, ordem_solicitacao, obs } = body;

    if (!produto_id || !quantidade || !local_origem_id || !local_destino_id) {
      return NextResponse.json({ error: "Campos obrigatórios: produto_id, quantidade, local_origem_id, local_destino_id" }, { status: 400 });
    }
    if (!ordem_solicitacao || ordem_solicitacao.trim() === "") {
      return NextResponse.json({ error: "Ordem de solicitação é obrigatória" }, { status: 400 });
    }
    if (quantidade <= 0) {
      return NextResponse.json({ error: "quantidade deve ser > 0" }, { status: 400 });
    }
    if (local_origem_id === local_destino_id) {
      return NextResponse.json({ error: "Origem e destino devem ser diferentes" }, { status: 400 });
    }

    // Verificar saldo disponível no local de origem
    const [saldo] = await sql`
      SELECT COALESCE(SUM(disponivel), 0) AS disponivel
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${produto_id} AND local_estoque_id = ${local_origem_id}
    `;
    if (!saldo || Number(saldo.disponivel) < quantidade) {
      return NextResponse.json(
        { error: `Saldo disponível insuficiente na origem. Disponível: ${saldo?.disponivel ?? 0}` },
        { status: 409 }
      );
    }

    // INSERT com status='pendente' → trigger fn_transferencia_ec_envio cria saída
    const [transf] = await sql`
      INSERT INTO alissonerp.transferencias_estoque_comercial
        (produto_id, quantidade, local_origem_id, local_destino_id, ordem_solicitacao, obs, created_by)
      VALUES
        (${produto_id}, ${quantidade}, ${local_origem_id}, ${local_destino_id}, ${ordem_solicitacao.trim()}, ${obs ?? null}, ${user.id})
      RETURNING id, created_at, movimento_saida_id
    `;

    return NextResponse.json({ id: transf.id, created_at: transf.created_at }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/estoque-comercial/transferir]", err);
  }
}
