import { createClient } from '@supabase/supabase-js';

// Usa service_role key se disponível (bypassa RLS), senão usa anon key
// Segurança garantida pelas API routes autenticadas — NÃO expor este client no frontend
const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  storageKey
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * Upload de arquivo para Supabase Storage (server-side)
 * Recebe base64, converte pra Buffer, faz upload
 * Retorna a URL pública do arquivo
 */
export async function uploadFile(
  bucket: string,
  path: string,
  base64Data: string,
  contentType: string = 'image/jpeg'
): Promise<{ url: string; path: string } | { error: string }> {
  try {
    // Remover prefixo data:image/xxx;base64, se existir
    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,  // Sobrescreve se já existir
      });

    if (error) {
      console.error(`[storage] Upload error (${bucket}/${path}):`, error);
      return { error: error.message };
    }

    // URL pública direta (bucket é público)
    const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${data.path}`;

    return { url, path: data.path };
  } catch (err) {
    console.error(`[storage] Upload exception (${bucket}/${path}):`, err);
    return { error: String(err) };
  }
}

/**
 * Deletar arquivo do Storage
 */
export async function deleteFile(
  bucket: string,
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error(`[storage] Delete error (${bucket}/${path}):`, error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Cria o bucket se não existir (ignora erro de "already exists").
 * Chamar antes do primeiro uploadFile em buckets dinâmicos.
 */
export async function ensureBucket(bucket: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.createBucket(bucket, { public: true });
  if (error && !error.message?.toLowerCase().includes('already exists')) {
    console.warn(`[storage] ensureBucket(${bucket}):`, error.message);
  }
}

/**
 * Gerar URL pública de um arquivo
 * (não precisa de signed URL — bucket é público)
 */
export function getPublicUrl(bucket: string, path: string): string {
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
