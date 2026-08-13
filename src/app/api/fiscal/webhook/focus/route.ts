import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

// Webhook externo Focus NFe — payload variável, usa passthrough.
const FocusWebhookSchema = z.object({
  ref: z.string().optional(),
  status: z.string().optional(),
  chave_nfe: z.string().optional(),
  caminho_xml_nota_fiscal: z.string().optional(),
  caminho_danfe: z.string().optional(),
  mensagem_sefaz: z.string().optional(),
  codigo: z.string().optional(),
  numero: z.union([z.number(), z.string()]).optional(),
}).passthrough();

// ─── Mapeamento de status Focus → interno ─────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  autorizado: "autorizada",
  erro_autorizacao: "rejeitada",
  denegado: "denegada",
  cancelado: "cancelada",
};

// ─── POST /api/fiscal/webhook/focus ──────────────────────────────────────────

interface FocusWebhookPayload {
  ref?: string;
  status?: string;
  chave_nfe?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  mensagem_sefaz?: string;
  codigo?: string;
  numero?: number | string;
}

/**
 * Valida secret do webhook Focus NFe.
 *
 * Focus NFe não oferece HMAC nativo, mas permite secret compartilhado
 * via header `Authorization: Bearer <token>` ou query string `?token=...`.
 *
 * Comportamento:
 *   - Se FOCUS_WEBHOOK_SECRET está setado em env → exige match exato
 *   - Se não está setado → loga warn e aceita (modo legado, INSEGURO)
 *
 * Para fechar o webhook em prod: defina `FOCUS_WEBHOOK_SECRET` em .env.local
 * e configure o mesmo valor no painel Focus (Dashboard > Webhooks > Secret).
 */
function validarFocusSecret(req: NextRequest): { ok: boolean; modo: "validated" | "insecure" } {
  const expected = process.env.FOCUS_WEBHOOK_SECRET?.trim();
  if (!expected) {
    console.warn("[webhook/focus] FOCUS_WEBHOOK_SECRET nao configurado — webhook ACEITANDO sem validacao. Configure em .env.local para fechar.");
    return { ok: true, modo: "insecure" };
  }
  const url = new URL(req.url);
  const tokenQuery = url.searchParams.get("token")?.trim() ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const tokenHeader = authHeader.replace(/^Bearer\s+/i, "").trim();
  const provided = tokenHeader || tokenQuery;
  if (!provided || provided !== expected) {
    return { ok: false, modo: "validated" };
  }
  return { ok: true, modo: "validated" };
}

export async function POST(req: NextRequest) {
  const valid = validarFocusSecret(req);
  if (!valid.ok) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  const parsed = FocusWebhookSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as FocusWebhookPayload;

  const { ref, status: focusStatus, chave_nfe, caminho_danfe, mensagem_sefaz, codigo, numero } = body;

  if (!ref) {
    return NextResponse.json({ error: "ref ausente" }, { status: 400 });
  }

  // Verificar se a ref existe no banco antes de processar
  interface NotaRow {
    id: number;
    status: string;
    origem_tabela: string | null;
    origem_id: number | null;
    serie: number;
  }

  const [nota] = await sql<NotaRow[]>`
    SELECT id, status, origem_tabela, origem_id, serie
    FROM alissonerp.notas_fiscais
    WHERE focus_ref = ${ref}
    LIMIT 1
  `;

  if (!nota) {
    // Ref desconhecida — retornar 200 para não forçar reenvio desnecessário
    return NextResponse.json({ ok: true, message: "ref desconhecida" });
  }

  const statusInterno = STATUS_MAP[focusStatus ?? ""] ?? null;

  if (!statusInterno) {
    // Status não mapeado — apenas ack
    return NextResponse.json({ ok: true, message: "status ignorado" });
  }

  try {
    // Atualizar nota fiscal
    await sql`
      UPDATE alissonerp.notas_fiscais
      SET
        status = ${statusInterno},
        chave_44 = COALESCE(${chave_nfe ?? null}, chave_44),
        pdf_danfe_url = COALESCE(${caminho_danfe ?? null}, pdf_danfe_url),
        mensagem_sefaz = COALESCE(${mensagem_sefaz ?? null}, mensagem_sefaz),
        codigo_sefaz = COALESCE(${codigo ?? null}, codigo_sefaz),
        updated_at = now()
      WHERE id = ${nota.id}
    `;

    // Se autorizada e veio de vendas_erp → atualizar vendas_erp (NFC-e)
    if (statusInterno === "autorizada" && nota.origem_tabela === "vendas_erp" && nota.origem_id) {
      const numNota = numero != null ? Number(numero) : null;

      await sql`
        UPDATE alissonerp.vendas_erp
        SET
          nfce_numero = COALESCE(${numNota}, nfce_numero),
          nfce_chave_44 = COALESCE(${chave_nfe ?? null}, nfce_chave_44),
          nfce_emitida_em = COALESCE(nfce_emitida_em, now())
        WHERE id = ${nota.origem_id}
      `;
    }

    // Se autorizada e veio de devolucoes_venda → atualizar devolucoes_venda (NF-e 55)
    if (statusInterno === "autorizada" && nota.origem_tabela === "devolucoes_venda" && nota.origem_id) {
      const numNota = numero != null ? Number(numero) : null;

      await sql`
        UPDATE alissonerp.devolucoes_venda
        SET
          nota_fiscal_devolucao_id = COALESCE(nota_fiscal_devolucao_id, ${nota.id}),
          nfe_numero = COALESCE(${numNota}, nfe_numero),
          nfe_chave_44 = COALESCE(${chave_nfe ?? null}, nfe_chave_44),
          nfe_emitida_em = COALESCE(nfe_emitida_em, now())
        WHERE id = ${nota.origem_id}
          AND nota_fiscal_devolucao_id IS NULL
      `;
    }

    return NextResponse.json({ ok: true, status: statusInterno });
  } catch (err) {
    console.error("[webhook/focus] Erro ao processar webhook:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
