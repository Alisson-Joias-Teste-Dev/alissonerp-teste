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

// ─── POST /api/fiscal/notas/[id]/cce ──────────────────────────────────────────
//
// Body: { descricao_correcao: string }  (mínimo 15 chars)
// CC-e (Carta de Correção Eletrônica) — somente NF-e modelo 55.
//
// Fluxo:
//   1. Auth + role check
//   2. Buscar nota — deve ser modelo=55 e status='autorizada'
//   3. Buscar token emitente
//   4. Chamar Focus POST /v2/nfe/{ref}/carta_correcao
//   5. Se ok: INSERT em notas_fiscais_eventos
//   6. Retornar { ok, protocolo_sefaz, mensagem }

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

  // ── 2. Parse params + body ──────────────────────────────────────────────────
  const { id } = await params;
  const notaId = parseInt(id, 10);
  if (isNaN(notaId))
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });

  let body: { descricao_correcao?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { descricao_correcao } = body;

  if (!descricao_correcao || descricao_correcao.trim().length < 15) {
    return NextResponse.json(
      { error: "descricao_correcao deve ter no minimo 15 caracteres" },
      { status: 400 },
    );
  }

  // ── 3. Buscar nota ──────────────────────────────────────────────────────────
  interface NotaRow {
    id: number;
    modelo: number;
    status: string;
    focus_ref: string | null;
    empresa_emitente_id: number;
  }

  const [nota] = await sql<NotaRow[]>`
    SELECT id, modelo, status, focus_ref, empresa_emitente_id
    FROM alissonerp.notas_fiscais
    WHERE id = ${notaId}
  `;

  if (!nota)
    return NextResponse.json({ error: "Nota nao encontrada" }, { status: 404 });

  if (nota.modelo === 65) {
    return NextResponse.json(
      { error: "CC-e nao e permitida para NFC-e (modelo 65). Apenas NF-e modelo 55." },
      { status: 422 },
    );
  }

  if (nota.status !== "autorizada") {
    return NextResponse.json(
      {
        error: `CC-e nao permitida — nota com status '${nota.status}'. Apenas notas autorizadas aceitam carta de correcao.`,
      },
      { status: 409 },
    );
  }

  if (!nota.focus_ref) {
    return NextResponse.json(
      { error: "Nota sem focus_ref — nao e possivel emitir CC-e" },
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

  // ── 5. Buscar sequencia atual de CC-e ──────────────────────────────────────
  const [seqRow] = await sql<{ max_seq: number }[]>`
    SELECT COALESCE(MAX(sequencia), 0) AS max_seq
    FROM alissonerp.notas_fiscais_eventos
    WHERE nota_fiscal_id = ${notaId} AND tipo = 'cce'
  `;
  const proximaSeq = (Number(seqRow?.max_seq ?? 0)) + 1;

  // ── 6. Chamar Focus ─────────────────────────────────────────────────────────
  const focusPath = `/v2/nfe/${encodeURIComponent(nota.focus_ref)}/carta_correcao`;

  interface FocusCceResp {
    status?: string;
    mensagem?: string;
    protocolo?: string;
    numero_protocolo?: string;
    erros?: Array<{ codigo: string; mensagem: string }>;
  }

  let focusResp;
  try {
    focusResp = await focusRequest<FocusCceResp>(
      "POST",
      focusPath,
      emitente.focus_token_criptografado,
      { descricao_correcao: descricao_correcao.trim() },
    );
  } catch (err) {
    console.error("[cce] Erro ao chamar Focus NFe:", err);
    return NextResponse.json(
      { error: "Erro de comunicacao com Focus NFe" },
      { status: 500 },
    );
  }

  if (!focusResp.ok) {
    const fd = focusResp.data;
    const msg =
      fd.mensagem ??
      (fd.erros ? fd.erros.map((e) => e.mensagem).join("; ") : null) ??
      `Erro Focus (HTTP ${focusResp.status})`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const fd = focusResp.data;
  const protocoloSefaz = s(fd.protocolo ?? fd.numero_protocolo ?? null);

  // ── 7. Registrar evento ────────────────────────────────────────────────────
  try {
    await sql`
      INSERT INTO alissonerp.notas_fiscais_eventos
        (nota_fiscal_id, tipo, sequencia, justificativa, status, codigo_sefaz, criado_por_user_id)
      VALUES
        (${notaId}, 'cce', ${proximaSeq}, ${descricao_correcao.trim()}, 'registrado',
         ${protocoloSefaz}, ${user.id}::uuid)
    `;
  } catch (err) {
    console.error("[cce] Erro ao registrar evento:", err);
    // Nao retornar erro — CC-e foi registrada no Focus, apenas log
  }

  return NextResponse.json({
    ok: true,
    protocolo_sefaz: protocoloSefaz,
    mensagem: fd.mensagem ?? "Carta de Correcao enviada com sucesso",
    sequencia: proximaSeq,
  });
}
