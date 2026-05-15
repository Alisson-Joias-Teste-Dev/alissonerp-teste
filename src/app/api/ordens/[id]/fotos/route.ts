import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicUrl, deleteFile } from "@/lib/storage";

const STORAGE_PUBLIC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

type FotoItem = { path: string; url: string; origem: "pdv" | "erp" };

// GET /api/ordens/[id]/fotos
// Retorna fotos das duas fontes:
//   PDV  — directus.ordens.arquivos_path  (bucket imagens, público, URL direta)
//   ERP  — alissonerp.ordens.fotos_paths  (bucket ordem-fotos, público, URL direta)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: ordemId } = await params;

  // Buscar as duas fontes em paralelo
  const [ordemErp, ordemDirectus] = await Promise.all([
    sql`
      SELECT fotos_paths, directus_ordem_id
      FROM alissonerp.ordens
      WHERE id = ${parseInt(ordemId)}
    `.then((rows) => rows[0] ?? null),

    sql`
      SELECT a.arquivos_path
      FROM alissonerp.ordens o
      JOIN directus.ordens a ON a.id = o.directus_ordem_id
      WHERE o.id = ${parseInt(ordemId)}
        AND a.arquivos_path IS NOT NULL
    `.then((rows) => rows[0] ?? null),
  ]);

  if (!ordemErp) {
    return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  }

  const fotos: FotoItem[] = [];

  // 1. Fotos do PDV — URL pública direta (path já inclui "imagens/ordens/...")
  const pdvPaths: string[] = ordemDirectus?.arquivos_path ?? [];
  for (const path of pdvPaths) {
    fotos.push({ path, url: `${STORAGE_PUBLIC_URL}/${path}`, origem: "pdv" });
  }

  // 2. Fotos do ERP — URL pública direta (bucket público após migração)
  const erpPaths: string[] = ordemErp.fotos_paths ?? [];
  for (const path of erpPaths) {
    fotos.push({ path, url: getPublicUrl("ordem-fotos", path), origem: "erp" });
  }

  return NextResponse.json({ fotos });
}

// POST /api/ordens/[id]/fotos
// Adiciona um novo path ao array fotos_paths
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // TODO: Validar ownership — verificar se o usuário tem permissão para esta ordem específica.
  // Por ora, qualquer usuário autenticado pode adicionar fotos (colaboração esperada neste sistema).

  const { id: ordemId } = await params;
  const { path } = await req.json();

  if (!path?.trim()) {
    return NextResponse.json({ error: "Path obrigatório" }, { status: 400 });
  }

  await sql`
    UPDATE alissonerp.ordens
    SET fotos_paths = array_append(COALESCE(fotos_paths, '{}'), ${path})
    WHERE id = ${parseInt(ordemId)}
  `;

  return NextResponse.json({ success: true });
}

// DELETE /api/ordens/[id]/fotos
// Remove um path do array fotos_paths
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: ordemId } = await params;
  const { path } = await req.json();

  if (!path?.trim()) {
    return NextResponse.json({ error: "Path obrigatório" }, { status: 400 });
  }

  // Verificar permissão — apenas admin/desenvolvedor pode remover fotos
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const isAdmin = ["admin", "desenvolvedor"].includes(usuario?.role);
  if (!isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await sql`
    UPDATE alissonerp.ordens
    SET fotos_paths = array_remove(COALESCE(fotos_paths, '{}'), ${path})
    WHERE id = ${parseInt(ordemId)}
  `;

  // Remover do storage também
  await deleteFile("ordem-fotos", path);

  return NextResponse.json({ success: true });
}
