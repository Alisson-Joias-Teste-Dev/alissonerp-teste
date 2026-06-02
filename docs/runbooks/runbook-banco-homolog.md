# Runbook: Banco de Homologação

## Objetivo

Configurar e usar o banco de homologação (teste) sem risco de afetar produção e sem expor credenciais no repositório.

---

## Configuração Inicial (uma vez por máquina)

```bash
# 1. Criar .env.homolog a partir do template
bash scripts/setup-homolog-env.sh

# 2. Editar o arquivo com a senha real
nano .env.homolog

# 3. Substituir <SENHA_HOMOLOG> pela senha do banco de homologação
#    Ex: DATABASE_URL=postgresql://postgres:minha_senha@cloud.alisson.api.br:5435/postgres-homolog?sslmode=disable
```

---

## Alternar Entre Ambientes

### Usar banco de homologação (teste)

```bash
npm run db:homolog
rm -rf .next
npm run dev
```

O badge **"HOMOLOG - BANCO DE TESTE"** aparece no canto superior direito.

### Voltar para banco de produção

```bash
npm run db:producao
rm -rf .next
npm run dev
```

O badge desaparece.

---

## Como Confirmar o Ambiente Atual

1. Olhe o canto superior direito da tela:
   - Se aparecer **"HOMOLOG - BANCO DE TESTE"** = homologação
   - Se não aparecer nada = produção

2. Ou verifique a variável no terminal:
   ```bash
   grep DATABASE_URL .env.local | head -1
   ```
   - `cloud.alisson.api.br:5435/postgres-homolog` = homologação
   - `72.60.55.140:5543/postgres` = produção

---

## O Que NUNCA Fazer

- ❌ Commitar `.env.homolog` com senha real
- ❌ Commitar `.env.local` com qualquer senha
- ❌ Commitar `.env.production.local`
- ❌ Rodar migration no banco de produção sem aprovação
- ❌ Usar `SUPABASE_SERVICE_ROLE_KEY` de produção no homolog
- ❌ Compartilhar a senha do banco em chat, issue ou commit

---

## Checklist Antes de Testar no Homolog

- [ ] Badge "HOMOLOG - BANCO DE TESTE" visível no topo
- [ ] `DATABASE_URL` aponta para `cloud.alisson.api.br:5435`
- [ ] Banco `postgres-homolog` (não `postgres`)
- [ ] Se for rodar migration: aplicou primeiro no homolog, validou, depois produção
- [ ] Se for testar venda/baixa: usar cliente fictício, não real

---

## Arquivos Envolvidos

| Arquivo | Propósito | Versionado? | Tem senha? |
|---------|-----------|-------------|------------|
| `env/.env.homolog.example` | Template base | ✅ Sim | ❌ Não |
| `.env.homolog` | Config real do homolog | ❌ Não (.gitignore) | ⚠️ Sim |
| `.env.local` | Config ativa do ambiente | ❌ Não (.gitignore) | ⚠️ Sim |
| `.env.production.local` | Config de produção | ❌ Não (.gitignore) | ⚠️ Sim |
| `scripts/setup-homolog-env.sh` | Bootstrap inicial | ✅ Sim | ❌ Não |
| `scripts/switch-to-homolog.sh` | Alterna para homolog | ✅ Sim | ❌ Não |
| `scripts/switch-to-producao.sh` | Alterna para produção | ✅ Sim | ❌ Não |

---

## Recuperação de Desastre

Se perder o `.env.homolog` ou `.env.local`:

```bash
# Recriar .env.homolog
bash scripts/setup-homolog-env.sh
nano .env.homolog  # colocar senha

# Recriar .env.local de produção (se tiver backup)
cp .env.production.local .env.local

# Ou recriar .env.local de homolog
npm run db:homolog
```
