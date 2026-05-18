import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const KommoPostSchema = z.object({
  contato_id: z.coerce.number().int().positive(),
  nome: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
}).passthrough();

// ─── POST /api/integracoes/kommo ──────────────────────────────────────────────
// Sincroniza contato/lead do fabricaAJ → Kommo CRM
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = KommoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Buscar credenciais Kommo
  let kommoUrl = "", kommoToken = "";
  try {
    const secrets = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_secrets
      WHERE chave IN ('kommo_url', 'kommo_token')
    `;
    for (const s of secrets) {
      const val = String(s.valor).replace(/"/g, "");
      if (s.chave === "kommo_url") kommoUrl = val;
      if (s.chave === "kommo_token") kommoToken = val;
    }
  } catch { /* sem config */ }

  if (!kommoUrl || !kommoToken) {
    return NextResponse.json(
      { error: "Credenciais Kommo não configuradas. Adicione em Configurações." },
      { status: 400 }
    );
  }

  // Buscar contato no banco
  const [contato] = await sql`
    SELECT id_contato, nome, email, telefone, id_api_contato
    FROM public.contatos WHERE id_contato = ${body.contato_id}
  `;
  if (!contato) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  // Montar payload Kommo
  const kommoPayload = {
    name: body.nome || contato.nome,
    custom_fields_values: [
      ...(body.email || contato.email ? [{
        field_code: "EMAIL",
        values: [{ value: body.email || contato.email, enum_code: "WORK" }],
      }] : []),
      ...(body.telefone || contato.telefone ? [{
        field_code: "PHONE",
        values: [{ value: body.telefone || contato.telefone, enum_code: "WORK" }],
      }] : []),
    ],
  };

  // Se já tem id_api_contato (id_api_kommo) → PATCH, senão → POST
  const kommoId = contato.id_api_contato;
  const method = kommoId ? "PATCH" : "POST";
  const url = kommoId
    ? `${kommoUrl}/api/v4/contacts/${kommoId}`
    : `${kommoUrl}/api/v4/contacts`;

  const payload = kommoId ? kommoPayload : [kommoPayload];

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${kommoToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Kommo ${res.status}: ${err}` }, { status: 502 });
  }

  const result = await res.json();
  const newId = kommoId || result?._embedded?.contacts?.[0]?.id;

  // Salvar id_api_contato se criou novo
  if (!kommoId && newId) {
    await sql`
      UPDATE public.contatos SET id_api_contato = ${newId} WHERE id_contato = ${body.contato_id}
    `.catch(() => { /* public é readonly — ignorar se falhar */ });
  }

  return NextResponse.json({
    ok: true,
    kommo_id: newId,
    action: kommoId ? "updated" : "created",
  });
}
