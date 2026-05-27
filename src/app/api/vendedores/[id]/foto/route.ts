import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile } from "@/lib/storage";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/payload-limits";
import { authOr401 } from "@/lib/auth-server";

/**
 * GET /api/vendedores/[id]/foto
 *
 * Retorna a foto atual do vendedor (para exibir no frontend antes de trocar).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const vendedorId = parseInt(id, 10);
  if (!vendedorId || isNaN(vendedorId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [vendedor] = await sql<Array<{ id_vendedor: number; nome: string; foto: string | null }>>`
    SELECT id_vendedor, nome, foto FROM public.vendedores WHERE id_vendedor = ${vendedorId}
  `;
  if (!vendedor) {
    return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ foto_url: vendedor.foto ?? null, nome: vendedor.nome });
}

/**
 * POST /api/vendedores/[id]/foto
 *
 * Faz upload de foto da consultora para o bucket pagamento-fotos
 * e atualiza public.vendedores.foto com a URL pública (proxy).
 *
 * Body: FormData { file: File }
 * Permissão: admin, desenvolvedor ou o próprio vendedor (via user.vendedor_id)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const vendedorId = parseInt(id, 10);
  if (!vendedorId || isNaN(vendedorId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Verifica se o vendedor existe
  const [vendedor] = await sql<Array<{ id_vendedor: number; nome: string }>>`
    SELECT id_vendedor, nome FROM public.vendedores WHERE id_vendedor = ${vendedorId}
  `;
  if (!vendedor) {
    return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 404 });
  }

  // Permissão: admin/desenvolvedor podem alterar qualquer um;
  // consultora/gerente_loja só podem alterar a própria foto (via user.vendedor_id)
  const isAdmin = user.role === "admin" || user.role === "desenvolvedor";
  if (!isAdmin) {
    // Busca o vendedor_id vinculado ao usuário logado
    const [userRow] = await sql<Array<{ vendedor_id: number | null }>>`
      SELECT vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
    `;
    if (userRow?.vendedor_id !== vendedorId) {
      return NextResponse.json({ error: "Sem permissão para alterar foto de outro vendedor" }, { status: 403 });
    }
  }

  // Rate limit
  try {
    rateLimit(`vendedor-foto-upload:${vendedorId}`, 5, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  // Suporte a atualizar via URL colada (sem upload de arquivo)
  const fotUrlString = formData.get("foto_url") as string | null;
  if (fotUrlString && fotUrlString.trim()) {
    const urlLimpa = fotUrlString.trim();
    if (!urlLimpa.startsWith("http") && !urlLimpa.startsWith("/")) {
      return NextResponse.json({ error: "URL inválida — deve começar com http:// ou /" }, { status: 400 });
    }
    await sql`
      UPDATE public.vendedores SET foto = ${urlLimpa} WHERE id_vendedor = ${vendedorId}
    `;
    return NextResponse.json({ foto_url: urlLimpa, vendedor_id: vendedorId, nome: vendedor.nome });
  }

  if (!file) {
    return NextResponse.json({ error: "Arquivo ou foto_url obrigatório" }, { status: 400 });
  }

  // Limite de tamanho
  const fotoMaxBytes = Math.floor(LIMITS.IMAGE_BASE64_MAX * 0.75);
  if (file.size > fotoMaxBytes) {
    return NextResponse.json(
      { error: `Foto excede limite (${file.size} > ${fotoMaxBytes} bytes)` },
      { status: 413 },
    );
  }

  // Upload para bucket pagamento-fotos com path consultoras/{vendedor_id}.jpg
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `consultoras/${vendedorId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");

  const uploadResult = await uploadFile("pagamento-fotos", path, base64Data, file.type || "image/jpeg");

  if ("error" in uploadResult) {
    return NextResponse.json({ error: `Upload falhou: ${uploadResult.error}` }, { status: 500 });
  }

  // URL pública com cache-bust
  const publicUrl = `${uploadResult.url}?t=${Date.now()}`;

  // Atualiza public.vendedores.foto
  await sql`
    UPDATE public.vendedores
    SET foto = ${publicUrl}
    WHERE id_vendedor = ${vendedorId}
  `;

  return NextResponse.json({ foto_url: publicUrl, vendedor_id: vendedorId, nome: vendedor.nome });
}
