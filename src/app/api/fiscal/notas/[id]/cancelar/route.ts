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

// ─── POST /api/fiscal/notas/[id]/cancelar ─────────────────────────────────────
//
// Body: { justificativa: string }  (mínimo 15 chars)
//
// Fluxo:
//   1. Auth + role check
//   2. Buscar nota — deve ser status='autorizada'
//   3. Verificar janela: NFC-e 30min | NF-e 24h após created_at
//   4. Buscar token do emitente
//   5. Chamar Focus DELETE /v2/nfce/{ref} ou /v2/nfe/{ref}
//   6. Se ok: UPDATE notas_fiscais + INSERT evento + desvincular origem
//   7. Se erro: retornar 422 com mensagem Focus

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

  let body: { justificativa?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { justificativa } = body;

  if (!justificativa || justificativa.trim().length < 15) {
    return NextResponse.json(
      { error: "justificativa deve ter no minimo 15 caracteres" },
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
    origem_tabela: string;
    origem_id: number;
    created_at: Date;
  }

  const [nota] = await sql<NotaRow[]>`
    SELECT id, modelo, status, focus_ref, empresa_emitente_id,
           origem_tabela, origem_id, created_at
    FROM alissonerp.notas_fiscais
    WHERE id = ${notaId}
  `;

  if (!nota)
    return NextResponse.json({ error: "Nota nao encontrada" }, { status: 404 });

  if (nota.status !== "autorizada") {
    return NextResponse.json(
      {
        error: `Cancelamento nao permitido — nota com status '${nota.status}'. Apenas notas autorizadas podem ser canceladas.`,
      },
      { status: 409 },
    );
  }

  if (!nota.focus_ref) {
    return NextResponse.json(
      { error: "Nota sem focus_ref — nao e possivel cancelar" },
      { status: 422 },
    );
  }

  // ── 4. Verificar janela de cancelamento ────────────────────────────────────
  const agora = new Date();
  const emitidaEm = new Date(nota.created_at);
  const diffMs = agora.getTime() - emitidaEm.getTime();
  const diffMinutos = diffMs / (1000 * 60);

  if (nota.modelo === 65 && diffMinutos > 30) {
    return NextResponse.json(
      {
        error:
          "Prazo de cancelamento de NFC-e expirado (maximo 30 minutos apos emissao).",
      },
      { status: 422 },
    );
  }

  if (nota.modelo === 55 && diffMinutos > 60 * 24) {
    return NextResponse.json(
      {
        error:
          "Prazo de cancelamento de NF-e expirado (maximo 24 horas apos emissao).",
      },
      { status: 422 },
    );
  }

  // ── 5. Buscar token emitente ───────────────────────────────────────────────
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

  // ── 6. Chamar Focus ─────────────────────────────────────────────────────────
  const tipo = nota.modelo === 65 ? "nfce" : "nfe";
  const focusPath = `/v2/${tipo}/${encodeURIComponent(nota.focus_ref)}`;

  interface FocusCancelResp {
    status?: string;
    mensagem?: string;
    erros?: Array<{ codigo: string; mensagem: string }>;
  }

  let focusResp;
  try {
    focusResp = await focusRequest<FocusCancelResp>(
      "DELETE",
      focusPath,
      emitente.focus_token_criptografado,
      { justificativa: justificativa.trim() },
    );
  } catch (err) {
    console.error("[cancelar] Erro ao chamar Focus NFe:", err);
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

  // ── 7. Persistir cancelamento em transação ─────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      // a. Atualizar status da nota
      await tx`
        UPDATE alissonerp.notas_fiscais
        SET status = 'cancelada', updated_at = NOW()
        WHERE id = ${notaId}
      `;

      // b. Registrar evento
      await tx`
        INSERT INTO alissonerp.notas_fiscais_eventos
          (nota_fiscal_id, tipo, justificativa, status, criado_por_user_id)
        VALUES
          (${notaId}, 'cancelamento', ${justificativa.trim()}, 'registrado', ${user.id}::uuid)
      `;

      // c. Desvincular origem
      if (nota.origem_tabela === "vendas_erp") {
        await tx`
          UPDATE alissonerp.vendas_erp
          SET nota_fiscal_id   = NULL,
              nfce_numero      = NULL,
              nfce_chave_44    = NULL,
              nfce_emitida_em  = NULL
          WHERE id = ${nota.origem_id}
        `;
      } else if (nota.origem_tabela === "devolucoes_venda") {
        await tx`
          UPDATE alissonerp.devolucoes_venda
          SET nota_fiscal_devolucao_id = NULL,
              nfe_numero               = NULL,
              nfe_chave_44             = NULL,
              nfe_emitida_em           = NULL
          WHERE id = ${nota.origem_id}
        `;
      }
    });
  } catch (err) {
    console.error("[cancelar] Erro ao persistir cancelamento:", err);
    return NextResponse.json(
      { error: "Nota cancelada no Focus mas erro ao atualizar banco. Verifique manualmente." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "cancelada" });
}
