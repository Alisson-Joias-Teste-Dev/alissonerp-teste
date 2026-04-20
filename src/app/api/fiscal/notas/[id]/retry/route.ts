import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { focusRequest } from "@/lib/fiscal/focus-client";

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid
  `;
  return row?.role ?? null;
}

const s = (v: unknown): string | null => (v == null ? null : String(v));

// ─── POST /api/fiscal/notas/[id]/retry ────────────────────────────────────────
//
// Sem body.
// Retenta emissão de nota rejeitada.
// O Focus armazena o payload original associado ao focus_ref — basta
// fazer POST novamente no mesmo endpoint com o mesmo ref.
//
// Fluxo:
//   1. Auth + role check
//   2. Buscar nota — deve ser status='rejeitada'
//   3. Buscar token emitente
//   4. UPDATE status='processando', limpar codigo/mensagem SEFAZ
//   5. Chamar Focus POST /v2/nfce/{ref} ou /v2/nfe/{ref} (sem body)
//   6. Tratar resposta:
//      - 202 aceito / processando: status fica 'processando'
//      - 200 autorizado: UPDATE status='autorizada'
//      - 4xx: reverter status='rejeitada' + atualizar mensagem
//   7. Retornar { status, mensagem_sefaz }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL))
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  // ── 2. Parse params ─────────────────────────────────────────────────────────
  const { id } = await params;
  const notaId = parseInt(id, 10);
  if (isNaN(notaId))
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });

  // ── 3. Buscar nota ──────────────────────────────────────────────────────────
  interface NotaRow {
    id: number;
    modelo: number;
    status: string;
    focus_ref: string | null;
    empresa_emitente_id: number;
    numero: number;
    serie: number;
  }

  const [nota] = await sql<NotaRow[]>`
    SELECT id, modelo, status, focus_ref, empresa_emitente_id, numero, serie
    FROM alissonerp.notas_fiscais
    WHERE id = ${notaId}
  `;

  if (!nota)
    return NextResponse.json({ error: "Nota nao encontrada" }, { status: 404 });

  if (nota.status !== "rejeitada") {
    return NextResponse.json(
      {
        error: `Retry nao permitido — nota com status '${nota.status}'. Apenas notas rejeitadas podem ser reenviadas.`,
      },
      { status: 409 },
    );
  }

  if (!nota.focus_ref) {
    return NextResponse.json(
      { error: "Nota sem focus_ref — nao e possivel fazer retry" },
      { status: 422 },
    );
  }

  // ── 4. Buscar token emitente ───────────────────────────────────────────────
  const [emitente] = await sql<{ focus_token_criptografado: string }[]>`
    SELECT focus_token_criptografado
    FROM alissonerp.empresas_emitentes
    WHERE id = ${nota.empresa_emitente_id}
  `;

  if (!emitente?.focus_token_criptografado) {
    return NextResponse.json(
      { error: "Emitente sem token Focus NFe configurado" },
      { status: 422 },
    );
  }

  // ── 5. Marcar como processando ─────────────────────────────────────────────
  await sql`
    UPDATE alissonerp.notas_fiscais
    SET status          = 'processando',
        codigo_sefaz    = NULL,
        mensagem_sefaz  = NULL,
        updated_at      = NOW()
    WHERE id = ${notaId}
  `;

  // ── 6. Chamar Focus ─────────────────────────────────────────────────────────
  const tipo = nota.modelo === 65 ? "nfce" : "nfe";
  const focusPath = `/v2/${tipo}/${encodeURIComponent(nota.focus_ref)}`;

  interface FocusRetryResp {
    status?: string;
    ref?: string;
    chave_nfe?: string;
    caminho_danfe?: string;
    mensagem_sefaz?: string;
    codigo?: string;
    erros?: Array<{ codigo: string; mensagem: string }>;
  }

  let focusResp;
  try {
    focusResp = await focusRequest<FocusRetryResp>(
      "POST",
      focusPath,
      emitente.focus_token_criptografado,
      // Focus reconhece o ref e retenta com o payload original em cache
      undefined,
    );
  } catch (err) {
    console.error("[retry] Erro ao chamar Focus NFe:", err);
    // Reverter status
    await sql`
      UPDATE alissonerp.notas_fiscais
      SET status = 'rejeitada',
          mensagem_sefaz = 'Erro de comunicacao com Focus NFe',
          updated_at = NOW()
      WHERE id = ${notaId}
    `;
    return NextResponse.json(
      { error: "Erro de comunicacao com Focus NFe" },
      { status: 500 },
    );
  }

  // ── 7. Tratar resposta ─────────────────────────────────────────────────────
  const fd = focusResp.data;

  if (focusResp.status === 200 && fd.status === "autorizado") {
    // Autorizado imediatamente
    const chave44 = s(fd.chave_nfe);
    const pdfDanfe = s(fd.caminho_danfe);
    await sql`
      UPDATE alissonerp.notas_fiscais
      SET status         = 'autorizada',
          chave_44       = ${chave44},
          pdf_danfe_url  = ${pdfDanfe},
          codigo_sefaz   = NULL,
          mensagem_sefaz = NULL,
          updated_at     = NOW()
      WHERE id = ${notaId}
    `;
    return NextResponse.json({ status: "autorizada", mensagem_sefaz: null });
  }

  if (focusResp.status === 202 || focusResp.status === 200) {
    // Aceito para processamento assíncrono — webhook vai atualizar
    return NextResponse.json({ status: "processando", mensagem_sefaz: null });
  }

  // Erro permanente — reverter para rejeitada
  const mensagemErro =
    fd.mensagem_sefaz ??
    (fd.erros ? fd.erros.map((e) => e.mensagem).join("; ") : null) ??
    `Erro Focus (HTTP ${focusResp.status})`;
  const codigoErro = s(fd.codigo);

  await sql`
    UPDATE alissonerp.notas_fiscais
    SET status         = 'rejeitada',
        codigo_sefaz   = ${codigoErro},
        mensagem_sefaz = ${mensagemErro},
        updated_at     = NOW()
    WHERE id = ${notaId}
  `;

  return NextResponse.json(
    { status: "rejeitada", mensagem_sefaz: mensagemErro },
    { status: 422 },
  );
}
