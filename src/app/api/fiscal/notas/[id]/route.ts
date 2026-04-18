import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

// ─── GET /api/fiscal/notas/[id] ───────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL))
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { id } = await params;
  const notaId = parseInt(id, 10);

  if (isNaN(notaId))
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });

  try {
    // Nota principal
    const [nota] = await sql`
      SELECT
        nf.id,
        nf.modelo,
        nf.serie,
        nf.numero,
        nf.chave_44,
        nf.empresa_emitente_id,
        e.razao_social AS emitente_nome,
        e.cnpj AS emitente_cnpj,
        nf.tipo_operacao,
        nf.origem_tabela,
        nf.origem_id,
        nf.cliente_contato_id,
        nf.natureza_operacao,
        nf.cfop,
        nf.valor_produtos,
        nf.valor_desconto,
        nf.valor_frete,
        nf.valor_total,
        nf.status,
        nf.focus_ref,
        nf.xml_assinado,
        nf.xml_protocolo,
        nf.pdf_danfe_url,
        nf.codigo_sefaz,
        nf.mensagem_sefaz,
        nf.emitida_por_user_id,
        nf.ambiente,
        nf.created_at,
        nf.updated_at
      FROM alissonerp.notas_fiscais nf
      LEFT JOIN alissonerp.empresas_emitentes e ON e.id = nf.empresa_emitente_id
      WHERE nf.id = ${notaId}
    `;

    if (!nota)
      return NextResponse.json({ error: "Nota nao encontrada" }, { status: 404 });

    // Itens
    const itens = await sql`
      SELECT
        id, numero_item, produto_id, codigo_produto, descricao, ncm, cest,
        cfop, unidade, ean, origem, quantidade, valor_unitario,
        valor_desconto, valor_total,
        csosn, cst_icms,
        vbc_icms, aliq_icms, valor_icms,
        vbc_icms_st, valor_icms_st,
        valor_aprox_tributos
      FROM alissonerp.notas_fiscais_itens
      WHERE nota_fiscal_id = ${notaId}
      ORDER BY numero_item
    `;

    // Eventos (se a tabela existir)
    let eventos: object[] = [];
    try {
      const evRows = await sql`
        SELECT id, tipo, sequencia, status, justificativa, codigo_sefaz, mensagem_sefaz, created_at
        FROM alissonerp.notas_fiscais_eventos
        WHERE nota_fiscal_id = ${notaId}
        ORDER BY created_at DESC
      `;
      eventos = [...evRows];
    } catch {
      // Tabela pode não existir ainda
      eventos = [];
    }

    return NextResponse.json({ ...nota, itens, eventos });
  } catch (err) {
    console.error("[GET /api/fiscal/notas/[id]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
