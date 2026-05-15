# Runbook: Onboarding de Novo Desenvolvedor

**Módulo:** Onboarding / Setup  
**Severidade:** Informativo  
**Tempo estimado:** 1–2 horas (setup completo)

---

## Pré-requisitos

- Acesso ao repositório GitHub (pedir ao Jonathan)
- Credenciais de variáveis de ambiente (pedir ao Jonathan)
- Node.js 18+ instalado
- Git configurado (`git config --global user.name` e `user.email`)
- WSL instalado (Windows) — necessário para alguns scripts de banco

---

## Passo 1: Clonar o Repositório

```bash
git clone https://github.com/jonathanaraujo-489/alissonerp.git
cd alissonerp
```

Verificar branch atual:
```bash
git branch --show-current
# Deve ser: main
```

Criar branch local de desenvolvimento:
```bash
git checkout -b homolog origin/homolog
```

---

## Passo 2: Instalar Dependências

```bash
npm install
```

Verificar que não há erros críticos. Warnings são normais; erros de peer dependency devem ser investigados.

---

## Passo 3: Configurar Variáveis de Ambiente

Criar o arquivo `.env.local` na raiz do projeto:

```bash
# Solicitar ao Jonathan os valores reais de cada variável
touch .env.local
```

Variáveis obrigatórias (pedir valores ao Jonathan):

```env
# Banco de dados
DATABASE_URL=postgresql://postgres:SENHA@72.60.55.140:5543/postgres

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Mercado Pago (módulo crediário/pagamentos)
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...

# IA (leitura de balança)
GEMINI_API_KEY=AIzaSy...
```

**NUNCA** commitar `.env.local`. Ele já está no `.gitignore`.

---

## Passo 4: Verificar Conexão com o Banco

```bash
# Testar conexão (WSL)
psql "postgresql://postgres:SENHA@72.60.55.140:5543/postgres" \
  -c "SELECT current_database(), current_user, NOW();"
```

Resultado esperado:
```
 current_database | current_user |              now
------------------+--------------+--------------------------------
 postgres         | postgres     | 2026-04-29 ...
```

---

## Passo 5: Rodar o Projeto

```bash
npm run dev
```

Abrir http://localhost:3000 — deve carregar a tela de login.

---

## Passo 6: Login com Usuário de Teste

Pedir ao Jonathan o usuário e senha de teste.

Usuários disponíveis têm roles diferentes (ver `CLAUDE.md` seção 6):
- `desenvolvedor` — acesso total
- `admin` — acesso total
- `gerente_fabrica`, `gerente_loja`, `ourives`, etc. — acesso parcial

---

## Passo 7: Leitura Obrigatória

Antes de fazer qualquer alteração de código:

- [ ] **`CLAUDE.md`** (raiz do projeto) — regras invioláveis, arquitetura, pitfalls
- [ ] **`docs/arquitetura.md`** seções 1–4 — schema DB, fluxos principais, permissões
- [ ] **`.claude/rules/`** — regras de agentes e workflow

Pontos críticos para internalizar:
1. **Nunca usar `supabase.from()`** para o schema `alissonerp` (bug PostgREST)
2. **Schemas `public.*` e `directus.*` são READONLY** — nunca INSERT/UPDATE/DELETE
3. **Ouro = dinheiro** — toda movimentação precisa de dupla entrada
4. **Branch sempre `homolog`** — nunca commitar direto em `main`

---

## Passo 8: Verificar TypeScript

```bash
npx tsc --noEmit
```

Deve retornar **zero erros**. Se houver erros, investigar antes de prosseguir.

---

## Passo 9: Entender a Estrutura do Projeto

```
src/
├── app/
│   ├── (dashboard)/    # Telas do ERP (Frontend — não tocar com código backend)
│   └── api/            # API Routes Next.js (270+ endpoints)
├── components/         # Componentes React reutilizáveis
├── hooks/              # React hooks customizados
├── lib/                # Utilitários server-side (db.ts, storage.ts, etc.)
└── stores/             # Zustand stores

supabase/
└── migrations/         # Migrations SQL (APENAS backend pode tocar)

docs/
├── arquitetura.md      # Documentação técnica completa
├── stories/            # Stories de desenvolvimento ativas
└── runbooks/           # Este diretório — guias operacionais
```

---

## Passo 10: Workflow de Desenvolvimento

```
1. Criar branch de feature a partir de homolog:
   git checkout homolog
   git checkout -b feat/nome-da-feature

2. Desenvolver e commitar:
   git add arquivo-especifico.ts
   git commit -m "feat: descricao da mudanca (vX.Y.Z)"

3. Push para homolog (depois de merge):
   git checkout homolog
   git merge feat/nome-da-feature
   git push origin homolog

4. Aguardar review/teste

5. Jonathan faz merge para main quando aprovado
```

---

## Regras para o Novo Dev

| Regra | Detalhe |
|-------|---------|
| Nunca commitar em `main` | Sempre via `homolog` → PR/merge |
| Rodar `tsc` antes de cada commit | Zero erros obrigatório |
| Nunca adivinhar colunas | Sempre confirmar no banco antes de codar |
| Não alterar zonas proibidas | Ver CLAUDE.md seção 2 |
| Documentação em sincronia | Alterou código → atualizar docs afetados |
| Commits com versão | Formato: `feat: descricao (vX.Y.Z)` |

---

## Recursos Úteis

| Recurso | Onde Encontrar |
|---------|---------------|
| Arquitetura completa | `docs/arquitetura.md` |
| Mapa de API Routes | `~/.claude/projects/.../memory/project_api_routes.md` |
| Módulo Service/Protocolo | `~/.claude/projects/.../memory/project_modulo_service.md` |
| Storage Buckets | `~/.claude/projects/.../memory/project_storage_buckets.md` |
| Usuários de teste | `docs/claude-memory/MEMORY.md` seção 17 |
| Changelog | `docs/CHANGELOG.md` |

---

## Dúvidas e Suporte

Qualquer dúvida sobre regras de negócio, banco ou arquitetura:
- **Jonathan Araújo** — jonathan@alissonjoias.com.br
- Consultar `CLAUDE.md` e `docs/arquitetura.md` antes de perguntar
