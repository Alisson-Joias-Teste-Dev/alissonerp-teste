/**
 * Funções puras de URL de storage — seguras pra usar em client components.
 *
 * Separado de `@/lib/storage` porque aquele importa supabase-js (`createClient`)
 * e bloating o bundle do client. Aqui só temos string manipulation.
 */

// ─── Buckets privados — passam pelo proxy autenticado /api/storage/[bucket]/[...path] ──
// Mantenha sincronizado com BUCKETS_PRIVADOS em src/app/api/storage/[bucket]/[...path]/route.ts
const BUCKETS_PRIVADOS = new Set([
  'ordem-fotos',
  'apontamento-fotos',
  'protocolo-fotos',
  'purificacao-fotos',
  'service-fotos',
  'pagamento-fotos',
  'ordem-videos',
  'vendas-videos',
  'insumo-fotos',
]);

export function isPrivateBucket(bucket: string): boolean {
  return BUCKETS_PRIVADOS.has(bucket);
}

/**
 * Gerar URL acessível de um arquivo.
 *  - Bucket privado → proxy autenticado `/api/storage/[bucket]/[...path]`
 *  - Bucket público → URL Supabase direta
 *
 * Aceita path relativo OU URL completa (compatibilidade com URLs já salvas no DB).
 */
export function getPublicUrl(bucket: string, path: string): string {
  if (path.startsWith('http') || path.startsWith('/api/storage/')) {
    return normalizeImageUrl(path);
  }
  if (isPrivateBucket(bucket)) {
    return `/api/storage/${bucket}/${path}`;
  }
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Normaliza URL salva no DB para o formato atual.
 *
 * Buckets que viraram privados (ordem-fotos, etc) podem ter URLs antigas no
 * banco apontando pra `https://api.alisson.api.br/storage/v1/object/public/ordem-fotos/X`
 * — essas URLs retornam 401 quando o bucket é fechado. Esta função detecta
 * URLs assim e reescreve para a rota proxy `/api/storage/ordem-fotos/X` que
 * valida JWT da sessão e streama o arquivo.
 *
 * URLs de buckets públicos (avatars, produto-fotos) passam intactas.
 * URLs nulas/vazias retornam string vazia.
 *
 * IMPORTANTE: use esta função em TODO render `<img src={url}>` de fotos vindas
 * do banco. Sem isso, fotos antigas quebram quando o bucket é fechado.
 */
export function normalizeImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (!url.startsWith('http')) return url;

  // /storage/v1/object/{public|authenticated}/{bucket}/{path}
  const match = url.match(/\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/);
  if (!match) return url;

  const [, bucket, path] = match;
  if (isPrivateBucket(bucket)) {
    return `/api/storage/${bucket}/${path}`;
  }
  return url;
}
