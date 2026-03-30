import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile, deleteFile } from "@/lib/storage";

// POST /api/ordens/upload-arquivo
// Body: { bucket, path, base64, contentType }
// Retorna: { url, path }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { bucket, path, base64, contentType } = body;

  if (!bucket || !path || !base64) {
    return NextResponse.json({ error: "bucket, path e base64 são obrigatórios" }, { status: 400 });
  }

  const result = await uploadFile(bucket, path, base64, contentType ?? "application/octet-stream");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url, path: result.path });
}

// DELETE /api/ordens/upload-arquivo
// Body: { bucket, path }
// Best-effort cleanup
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { bucket, path } = body;
  if (!bucket || !path) {
    return NextResponse.json({ error: "bucket e path são obrigatórios" }, { status: 400 });
  }

  await deleteFile(bucket, path).catch(() => {});
  return NextResponse.json({ success: true });
}
