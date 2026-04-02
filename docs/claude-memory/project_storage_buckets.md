---
name: Storage Buckets
description: Todos os buckets de storage e suas regras — verificado no banco 2026-03-17
type: project
updated: 2026-03-17
---

## Buckets (verificado SELECT FROM storage.buckets em 2026-03-17)

| Bucket | Público | Tamanho Máx | Tipos MIME |
|--------|---------|-------------|------------|
| avatars | **SIM** | 10MB | image/jpeg, image/jpg, image/png, image/webp |
| imagens | **SIM** | sem limite | sem restrição |
| protocolo-fotos | NÃO | 10MB | image/jpeg, image/png, image/webp |
| apontamento-fotos | NÃO | 10MB | image/jpeg, image/png, image/webp |
| ordem-fotos | NÃO | 10MB | image/jpeg, image/png, image/webp, image/heic |

---

## Detalhes por bucket

### avatars
- **Uso:** Foto de perfil dos usuários
- **Caminho:** `{user_id}.{ext}` (ex: `abc123-uuid.jpg`)
- **URL:** `{SUPABASE_URL}/storage/v1/object/public/avatars/{path}?t={timestamp}`
- **Anti-cache:** `?t={Date.now()}` adicionado na URL salva no banco
- **Upload:** PUT com `x-upsert: "true"` (sobrescreve se já existe)
- **Salvo em:** `public.user_profiles.avatar_url`
- **API:** `POST /api/user/avatar` (FormData: file, user_id?)
- **Permissão:** Qualquer autenticado pode fazer upload para seu próprio avatar; admin/desenvolvedor podem alterar o de outros

### imagens
- **Uso:** Legado PDV — fotos das ordens vindas do sistema PDV
- **Campo:** `directus.ordens.arquivos_path` (array de paths)
- **URL:** URL pública direta (bucket público)
- **ATENÇÃO:** NÃO usar este bucket para novas funcionalidades do ERP

### protocolo-fotos
- **Uso:** Fotos de criação e conclusão de protocolo
- **Campos:** `alissonerp.protocolos.foto_criacao`, `alissonerp.protocolos.foto_conclusao`
- **Acesso:** Signed URLs via Supabase (bucket privado)
- **Componentes:** `NovaProtocoloModal.tsx`, `ConcluirProtocoloModal.tsx`

### apontamento-fotos
- **Uso:** Foto da balança nos apontamentos PCP e distribuição
- **Campos:** `apontamentos_pcp.foto_balanca`, `apontamentos_distribuicao.foto_balanca`
- **Acesso:** Signed URLs via Supabase (bucket privado)
- **Componentes:** `ApontamentoPCPModal.tsx`, `ApontamentoDistModal.tsx`

### ordem-fotos (migration 071 — adicionado em 2026-03)
- **Uso duplo:**
  1. Galeria de fotos da ordem: `alissonerp.ordens.fotos_paths TEXT[]`
  2. Foto em comentário: `alissonerp.comentarios_ordem.foto_path TEXT`
- **Caminhos:**
  - Ordens: `ordens/{ordemId}/{timestamp}-{userId8}.{ext}`
  - Comentários: `comentarios/{ordemId}/{timestamp}-{userId8}.{ext}`
- **Acesso:** Signed URLs (1h TTL) via `supabase.storage.from("ordem-fotos").createSignedUrl(path, 3600)`
- **APIs:**
  - `GET /api/ordens/[id]/fotos` → retorna fotos PDV (públicas) + ERP (signed)
  - `POST /api/ordens/[id]/fotos` → body: `{ path }` — adiciona ao array
  - `DELETE /api/ordens/[id]/fotos` → body: `{ path }` — remove (admin only, remove storage também)
- **Upload:** Feito client-side via `supabase.storage.from("ordem-fotos").upload(path, file)`, depois registra via API
- **RLS:** upload/select/delete para qualquer autenticado (controle de permissão feito na API)

---

## Avisos Importantes

```
⚠️ storage.policies NÃO existe como tabela — RLS fica em storage.objects (via pg_policies)
⚠️ Para listar buckets: SELECT id, name, public, file_size_limit FROM storage.buckets
⚠️ bucket 'imagens' é legado PDV — NÃO criar novos uploads nele
⚠️ Signed URLs expiram em 1h — não armazenar URLs, sempre gerar fresh
⚠️ avatars é público mas sempre salva URL com ?t={timestamp} para forçar reload no browser
```
