# Runbook: Rotação de Secrets e Credenciais

**Módulo:** Segurança / Infraestrutura  
**Severidade:** Alta (acesso comprometido)  
**Tempo estimado:** 20–40 min por secret

---

## Quando Usar

- Token/credencial comprometido ou vazado
- Rotação periódica de segurança (recomendado: a cada 90 dias)
- Após desligamento de colaborador com acesso
- Troca de conta ou plataforma

---

## Mapa de Secrets

| Secret | Onde Fica | Plataforma de Origem | Impacto se Expirar |
|--------|-----------|---------------------|-------------------|
| `DATABASE_URL` | `.env.local` + Vercel | PostgreSQL (servidor próprio) | Toda API para |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` + Vercel | Supabase Dashboard | Auth + Storage param |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + Vercel | Supabase Dashboard | Auth frontend param |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + Vercel | Supabase Dashboard | APIs server-side param |
| `tiny_bearer_token` | DB `alissonerp.configuracoes_sistema` | Tiny ERP (OAuth) | Sync Tiny param |
| `MERCADOPAGO_ACCESS_TOKEN` | `.env.local` + Vercel | Painel Mercado Pago | Pagamentos param |
| `MERCADOPAGO_PUBLIC_KEY` | `.env.local` + Vercel | Painel Mercado Pago | Checkout frontend param |
| `GEMINI_API_KEY` | `.env.local` + Vercel | Google AI Studio | IA (leitura balança) param |

---

## Procedimento Geral

Para qualquer secret, seguir sempre esta sequência:

1. Gerar novo secret na plataforma correspondente (sem revogar o atual ainda)
2. Atualizar `.env.local` local
3. Atualizar Vercel (Settings > Environment Variables)
4. Testar em homolog (preview Vercel usa as vars de Environment = Preview)
5. Verificar que homolog funciona normalmente
6. **Só então** revogar o secret antigo na plataforma

---

## Por Secret

### DATABASE_URL

**Formato:** `postgresql://postgres:{SENHA}@72.60.55.140:5543/postgres`

```bash
# 1. Conectar ao servidor e alterar senha do usuário postgres
psql -h 72.60.55.140 -p 5543 -U postgres -d postgres
```
```sql
ALTER USER postgres PASSWORD 'NovasenhaForte123!';
```
```bash
# 2. Testar nova conexão
psql "postgresql://postgres:NovasenhaForte123!@72.60.55.140:5543/postgres" -c "SELECT 1;"

# 3. Atualizar .env.local
# DATABASE_URL=postgresql://postgres:NovasenhaForte123!@72.60.55.140:5543/postgres

# 4. Atualizar Vercel (ver seção Vercel abaixo)
```

---

### Supabase Keys (ANON_KEY e SERVICE_ROLE_KEY)

1. Acessar [Supabase Dashboard](https://supabase.com) → projeto → **Settings > API**
2. Clicar em **Rotate** ou **Regenerate** na chave desejada
3. Copiar a nova chave
4. Atualizar `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=nova_anon_key_aqui
   SUPABASE_SERVICE_ROLE_KEY=nova_service_role_key_aqui
   ```
5. Atualizar Vercel (ver seção abaixo)
6. Testar login e upload de arquivo em homolog

---

### tiny_bearer_token

O token Tiny é gerenciado via OAuth e fica armazenado no banco:

```sql
-- Verificar onde o token está armazenado
SELECT chave, LEFT(valor::text, 20) AS valor_preview, updated_at
FROM alissonerp.configuracoes_sistema
WHERE chave LIKE '%tiny%';
```

**Reconexão via interface:**
1. Acessar ERP → **Configurações > Integrações > Tiny ERP**
2. Clicar em **Reconectar**
3. Completar o fluxo OAuth no Tiny
4. O novo token é salvo automaticamente no banco

---

### Mercado Pago

1. Acessar [Painel Mercado Pago](https://www.mercadopago.com.br/developers)
2. Ir em **Suas integrações > Credenciais de produção**
3. Gerar novo Access Token e Public Key
4. Atualizar `.env.local`:
   ```
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-novo-token-aqui
   MERCADOPAGO_PUBLIC_KEY=APP_USR-nova-public-key-aqui
   ```
5. Atualizar Vercel
6. Testar fluxo de pagamento em homolog (usar modo sandbox se disponível)

---

### GEMINI_API_KEY

1. Acessar [Google AI Studio](https://aistudio.google.com) → **Get API Key**
2. Criar nova chave → copiar
3. Atualizar `.env.local`:
   ```
   GEMINI_API_KEY=AIzaSy_nova_chave_aqui
   ```
4. Atualizar Vercel
5. Testar leitura de imagem de balança em homolog
6. Revogar chave antiga no Google AI Studio

---

## Atualizar Variável no Vercel

```bash
# Via CLI Vercel (se instalado)
vercel env rm NOME_DA_VARIAVEL production
vercel env add NOME_DA_VARIAVEL production
# (digitar o novo valor quando solicitado)

# Ou via Dashboard:
# Vercel → projeto fabricaAJ → Settings → Environment Variables
# Localizar a variável → Edit → colar novo valor → Save
```

Após atualizar no Vercel, fazer um **redeploy** para as variáveis surtirem efeito:
```bash
# Forçar redeploy sem push de código
vercel --prod
# Ou via Dashboard: Deployments → último deploy → Redeploy
```

---

## Verificação Pós-Rotação

```bash
# Testar conexão com banco (WSL)
psql "postgresql://postgres:NOVA_SENHA@72.60.55.140:5543/postgres" \
  -c "SELECT NOW(), current_user, current_database();"

# Testar API do ERP em homolog
curl -I https://preview-url.vercel.app/api/health
```

```sql
-- Verificar configurações do sistema (tokens salvos no banco)
SELECT chave, updated_at
FROM alissonerp.configuracoes_sistema
WHERE chave IN ('tiny_access_token', 'tiny_refresh_token')
ORDER BY updated_at DESC;
```

---

## Escalonamento

Acionar **Jonathan Araújo** se:
- Necessidade de revogar `DATABASE_URL` com urgência (acesso comprometido)
- Token do Tiny não consegue ser renovado via OAuth
- Qualquer rotação em produção que possa causar downtime
