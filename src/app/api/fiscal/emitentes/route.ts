import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_FISCAL } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const EmitentePostSchema = z.object({
  nome_fantasia: z.string().nullable().optional(),
  razao_social: z.string().min(1, "obrigatório"),
  cnpj: z.string().min(1, "obrigatório"),
  ie: z.string().nullable().optional(),
  im: z.string().nullable().optional(),
  regime_tributario: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  codigo_ibge_municipio: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  focus_token: z.string().nullable().optional(),
  ambiente: z.enum(["homologacao", "producao"]).optional(),
  serie_nfe: z.coerce.number().int().optional(),
  serie_nfce: z.coerce.number().int().optional(),
  proxima_nfe: z.coerce.number().int().optional(),
  proxima_nfce: z.coerce.number().int().optional(),
  local_estoque_id: z.coerce.number().int().nullable().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

type EmitenteBody = {
  nome_fantasia?: string | null;
  razao_social: string;
  cnpj: string;
  ie?: string | null;
  im?: string | null;
  regime_tributario?: 1 | 2 | 3;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  codigo_ibge_municipio?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  focus_token?: string | null;
  ambiente?: "homologacao" | "producao";
  serie_nfe?: number;
  serie_nfce?: number;
  proxima_nfe?: number;
  proxima_nfce?: number;
  local_estoque_id?: number | null;
};

// ─── GET /api/fiscal/emitentes ──────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  try {
    const rows = await sql`
      SELECT e.id, e.nome_fantasia, e.razao_social, e.cnpj, e.ie, e.im,
             e.regime_tributario, e.logradouro, e.numero, e.complemento,
             e.bairro, e.codigo_ibge_municipio, e.municipio, e.uf, e.cep,
             e.ambiente, e.serie_nfe, e.serie_nfce, e.proxima_nfe, e.proxima_nfce,
             e.local_estoque_id, l.nome AS local_estoque_nome,
             e.ativo, e.created_at, e.updated_at,
             (e.focus_token_criptografado IS NOT NULL AND e.focus_token_criptografado <> '') AS tem_token
      FROM alissonerp.empresas_emitentes e
      LEFT JOIN alissonerp.locais_estoque l ON l.id = e.local_estoque_id
      ORDER BY e.razao_social
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/fiscal/emitentes:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── POST /api/fiscal/emitentes ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_FISCAL)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = EmitentePostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ deve ter 14 digitos" }, { status: 400 });
  }
  if (body.regime_tributario && ![1, 2, 3].includes(body.regime_tributario)) {
    return NextResponse.json({ error: "regime_tributario invalido (1,2,3)" }, { status: 400 });
  }
  if (body.uf && body.uf.length !== 2) {
    return NextResponse.json({ error: "uf deve ter 2 caracteres" }, { status: 400 });
  }
  if (body.codigo_ibge_municipio) {
    const ibge = body.codigo_ibge_municipio.replace(/\D/g, "");
    if (ibge.length !== 7) {
      return NextResponse.json({ error: "codigo_ibge_municipio deve ter 7 digitos" }, { status: 400 });
    }
  }
  if (body.cep) {
    const cep = body.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      return NextResponse.json({ error: "CEP deve ter 8 digitos" }, { status: 400 });
    }
  }
  if (body.ambiente && !["homologacao", "producao"].includes(body.ambiente)) {
    return NextResponse.json({ error: "ambiente invalido" }, { status: 400 });
  }

  try {
    // TODO(Sprint 3): criptografar focus_token via pgp_sym_encrypt(key, $token) antes de gravar
    const [row] = await sql`
      INSERT INTO alissonerp.empresas_emitentes (
        nome_fantasia, razao_social, cnpj, ie, im, regime_tributario,
        logradouro, numero, complemento, bairro, codigo_ibge_municipio,
        municipio, uf, cep, focus_token_criptografado, ambiente,
        serie_nfe, serie_nfce, proxima_nfe, proxima_nfce, local_estoque_id
      ) VALUES (
        ${body.nome_fantasia ?? null},
        ${body.razao_social.trim()},
        ${cnpj},
        ${body.ie ?? null},
        ${body.im ?? null},
        ${body.regime_tributario ?? 1},
        ${body.logradouro ?? null},
        ${body.numero ?? null},
        ${body.complemento ?? null},
        ${body.bairro ?? null},
        ${body.codigo_ibge_municipio ?? null},
        ${body.municipio ?? null},
        ${body.uf?.toUpperCase() ?? null},
        ${body.cep?.replace(/\D/g, "") ?? null},
        ${body.focus_token ?? null},
        ${body.ambiente ?? "homologacao"},
        ${body.serie_nfe ?? 1},
        ${body.serie_nfce ?? 1},
        ${body.proxima_nfe ?? 1},
        ${body.proxima_nfce ?? 1},
        ${body.local_estoque_id ?? null}
      )
      RETURNING id
    `;
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("empresas_emitentes_cnpj_key") || msg.includes("unique")) {
      return NextResponse.json({ error: "CNPJ ja cadastrado" }, { status: 400 });
    }
    console.error("POST /api/fiscal/emitentes:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
