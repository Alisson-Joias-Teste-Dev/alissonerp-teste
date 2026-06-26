/**
 * GET /api/storage/[bucket]/[...path]
 *
 * Proxy autenticado para arquivos do Supabase Storage. Permite manter buckets
 * privados (sem URL pública direta) e ainda servir imagens via <img src> normal,
 * pois esta rota valida JWT do user via cookie da sessão.
 *
 * Fluxo:
 *   1. Valida sessão (cookie sb-*-auth-token)
 *   2. Para buckets PRIVADOS sensíveis: exige usuário autenticado (qualquer role)
 *   3. Faz fetch interno usando service key (acesso bucket privado)
 *   4. Stream a resposta com cache curto (1h)
 *
 * Não usa createSignedUrl porque:
 *   - Signed URL tem TTL e exige rotação no cliente
 *   - Browser não envia auth automaticamente para storage.supabase
 *   - Esta rota encapsula tudo: JWT no cookie já existe, cliente só faz <img>
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Buckets fechados (privados). Apenas usuário autenticado consegue ler.
// Outros buckets (avatars, produto-fotos, etc) continuam públicos e nem chegam
// nessa rota — o cliente carrega direto via URL Supabase.
const BUCKETS_PRIVADOS = new Set([
  "ordem-fotos",
  "apontamento-fotos",
  "protocolo-fotos",
  "purificacao-fotos",
  "service-fotos",
  "pagamento-fotos",
  "ordem-videos",
  "vendas-videos",
  "insumo-fotos",
  "compras-comercial-fotos",
]);

// Buckets que exigem full access (admin/dev/diretor).
// ATUALMENTE VAZIO — 'pagamento-fotos' foi removido em 21/05/2026 para
// permitir que qualquer usuário autenticado veja fotos da balança de ouro.
// Ver AGENTS.md — Módulo Crediário, Regra de Ouro #4.
const BUCKETS_FULL_ACCESS = new Set<string>([

]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { bucket, path } = await params;
  if (!bucket || !path || path.length === 0) {
    return NextResponse.json({ error: "bucket e path obrigatórios" }, { status: 400 });
  }

  // Whitelist defensiva: só serve buckets conhecidos
  if (!BUCKETS_PRIVADOS.has(bucket)) {
    return NextResponse.json({ error: "bucket não suportado pelo proxy" }, { status: 400 });
  }

  if (BUCKETS_FULL_ACCESS.has(bucket) && !isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // ⚠️ Usamos ANON_KEY (não SUPABASE_SERVICE_ROLE_KEY).
  // A service key tem problema de assinatura JWT que causa 400 do Supabase.
  // A anon key funciona para leitura de objetos autenticados.
  // Ver AGENTS.md — Módulo Crediário, Regra de Ouro #4.
  const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Storage não configurado" }, { status: 500 });
  }

  // Reconstrói path completo (Next.js splita por /)
  const filePath = path.join("/");
  // Rota "authenticated" do Supabase Storage — exige header Authorization,
  // funciona em bucket público OU privado.
  const upstreamUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/authenticated/${bucket}/${filePath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (upstream.status === 404) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache curto no browser — usuário autenticado, mas a URL é estável
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return internalError(`[GET /api/storage/${bucket}/${filePath}]`, err, "Erro ao buscar arquivo");
  }
}
