import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { parseOFX } from "@/lib/ofx-parser";
import { internalError } from "@/lib/api-error";

// ─── POST /api/financeiro/upload-ofx ──────────────────────────────────────────
// Recebe arquivo OFX, parseia e insere transações com deduplicação por fitid
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const PODE_UPLOAD = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || (!PODE_UPLOAD.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("arquivo") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo OFX obrigatório" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 10MB)" }, { status: 400 });
  }

  const text = await file.text();

  // try/catch no parser: erros conhecidos (arquivo > 10MB, OFX malformado)
  // viravam 500 genérico antes. Agora retornam 422 com mensagem útil.
  let result;
  try {
    result = parseOFX(text);
  } catch (e) {
    return internalError("[POST /api/financeiro/upload-ofx] parseOFX", e, "Falha ao processar arquivo OFX", 422);
  }

  if (result.transacoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo OFX" }, { status: 400 });
  }

  // Atômico: extrato + todos os lançamentos numa transação só.
  // Antes, falha no INSERT de um lançamento deixava extrato órfão + parte dos
  // lançamentos no banco. Agora se algo falhar no meio, rollback total.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result_db = await (sql as any).begin(async (tx: typeof sql) => {
    const [extrato] = await tx`
      INSERT INTO alissonerp.fin_extratos_bancarios
        (banco, agencia, conta, data_inicio, data_fim, arquivo_nome, processado, created_by)
      VALUES (
        ${result.banco}, ${result.agencia}, ${result.conta},
        ${result.data_inicio || null}, ${result.data_fim || null},
        ${file.name}, true, ${user.id}::uuid
      )
      RETURNING id
    `;

    let inseridos = 0;
    let duplicados = 0;
    for (const t of result.transacoes) {
      const r = await tx`
        INSERT INTO alissonerp.fin_lancamentos_bancarios
          (extrato_id, fitid, tipo, valor, data_transacao, descricao, conciliado)
        VALUES (
          ${extrato.id}, ${t.fitid}, ${t.tipo}, ${t.valor},
          ${t.data_transacao || null}, ${t.descricao}, false
        )
        ON CONFLICT (fitid) DO NOTHING
        RETURNING id
      `;
      if (r.length > 0) inseridos++;
      else duplicados++;
    }

    return { extrato_id: extrato.id, inseridos, duplicados };
  });

  return NextResponse.json({
    ok: true,
    extrato_id: result_db.extrato_id,
    total_transacoes: result.transacoes.length,
    inseridos: result_db.inseridos,
    duplicados: result_db.duplicados,
    banco: result.banco,
    conta: result.conta,
    periodo: `${result.data_inicio} a ${result.data_fim}`,
  }, { status: 201 });
}
