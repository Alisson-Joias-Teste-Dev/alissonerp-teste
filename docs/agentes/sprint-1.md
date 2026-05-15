# Sprint 1 — Planning + Handoff pro Dev

> **Owner:** @sm (River) | **Goal date:** 5 dias úteis
> **Capacidade:** 15 SP | **Carga:** 15 SP

---

## ⚠️ Bloqueadores antes de começar

Estes itens devem estar resolvidos ANTES do dev começar a Sprint 1:

- [ ] **Conta DeepSeek criada + API key gerada** (bloqueia D4-D5)
- [ ] **Domínio HTTPS confirmado** do `fabricaAJ` no EasyPanel (pro setWebhook)
- [ ] **Você (Jonathan) tem o Telegram** instalado e está logado no celular E desktop

---

## 1. Sprint Goal

> **"Bot Telegram do gerente recebe mensagem, valida secret, autentica via senha e ecoa resposta gerada pelo LLM. Infra completa, sem tools nem memória ativa ainda."**

**Demo do final da Sprint:** mandar mensagem no Telegram pro bot, ele pede senha, autentica, e responde algo coerente gerado pelo DeepSeek. Conversa fica gravada em `agentes.conversas`.

---

## 2. Sprint Backlog (15 SP)

| ID | Story | SP | Dia |
|---|---|:-:|:-:|
| E0.1 | Pre-flight: confirmar número de migration livre | 1 | D1 manhã |
| E0.2 | Migration `230` schema agentes inicial | 3 | D1 |
| E0.4 | BotFather + setWebhook | 1 | D1 |
| E0.5 | `.env` com 9 variáveis no EasyPanel | 1 | D1-D2 |
| E1.1 | Endpoint webhook + secret_token validation | 2 | D2 |
| E1.2 | Parser updates Telegram | 2 | D2-D3 |
| E1.3 | Login chat_id + senha → random token | 3 | D3-D4 |
| E1.6 | LLM camada DeepSeek (Vercel AI SDK) | 3 | D4-D5 |

> **Nota:** E0.6 (página privacidade) **adiada pra S2** — Should-have, não bloqueia goal.

---

## 3. Quebra técnica (51 tasks)

### Story E0.1 — Pre-flight migration (1 SP)
**Branch:** `feat/agentes-pre-flight`

| # | Task | Estim |
|---|---|:-:|
| 1.1 | Listar migrations existentes na faixa 230-239 (`Glob`) | 5min |
| 1.2 | Confirmar `230, 231, 232, 233, 234` livres | 5min |
| 1.3 | Documentar números congelados em `docs/agentes/sprint-1.md` | 10min |
| 1.4 | Atualizar `docs/agentes/arquitetura.md` se houver conflito | 10min |

**DoD:** lista de números das 5 migrations futuras congelada no doc.

---

### Story E0.2 — Migration schema agentes (3 SP)
**Branch:** `feat/agentes-migration-schema`
**Owner:** `@backend`

| # | Task | Estim |
|---|---|:-:|
| 2.1 | Criar `supabase/migrations/230_schema_agentes_inicial.sql` | 15min |
| 2.2 | DDL: `CREATE SCHEMA agentes` + comentário | 5min |
| 2.3 | DDL: tabela `agentes.skills` | 20min |
| 2.4 | DDL: tabela `agentes.usuarios_skill` (com session_token, revoked_at, LGPD) | 30min |
| 2.5 | DDL: tabela `agentes.conversas` + índice BRIN | 25min |
| 2.6 | DDL: tabela `agentes.tool_calls_log` + índice BRIN | 20min |
| 2.7 | DDL: tabela `agentes.escritas_pendentes` | 25min |
| 2.8 | DDL: view `agentes.vw_metricas_skill` | 25min |
| 2.9 | Seed: INSERT `skills` linha `gerente_producao` | 10min |
| 2.10 | Aplicar migration no banco (Jonathan executa) | 10min |
| 2.11 | Validar via `SELECT * FROM information_schema.tables WHERE table_schema='agentes'` | 5min |

**DoD:** schema criado, 5 tabelas + 1 view, seed da skill, migration commitada em `homolog`.

**Referência:** ver DDL completo em `docs/agentes/arquitetura.md` seção 4 (Migration 230).

---

### Story E0.4 — BotFather + setWebhook (1 SP)
**Sem branch de código.** Tarefa de config feita pelo Jonathan.

| # | Task | Estim |
|---|---|:-:|
| 4.1 | Abrir @BotFather no Telegram, criar bot `AlissonGerenteBot` (ou nome escolhido) | 5min |
| 4.2 | Configurar nome, username, descrição curta | 5min |
| 4.3 | `/setprivacy` → Disable (lê todas as msgs no privado) | 2min |
| 4.4 | `/setjoingroups` → Disable (privado, 1 user) | 2min |
| 4.5 | Guardar `BOT_TOKEN` retornado | 1min |
| 4.6 | Gerar `WEBHOOK_SECRET` aleatório (32 chars) | 2min |
| 4.7 | `curl -X POST` no setWebhook com URL EasyPanel + secret (após E1.1) | 5min |
| 4.8 | Confirmar via `getWebhookInfo` que webhook está setado | 3min |

**DoD:** `getWebhookInfo` retorna URL correta + `pending_update_count = 0`.
**Bloqueio:** task 4.7 só rola depois de E1.1 deployada.

---

### Story E0.5 — `.env` no EasyPanel (1 SP)

| # | Task | Estim |
|---|---|:-:|
| 5.1 | Criar/atualizar `.env.example` com 9 vars novas (sem valores) | 10min |
| 5.2 | Atualizar `.env.local` com valores de dev | 10min |
| 5.3 | EasyPanel UI: adicionar 9 env vars no app `fabricaAJ` | 15min |
| 5.4 | Restart do app pra carregar | 2min |
| 5.5 | Validar via endpoint debug `/api/health/agentes-env` (criado temporariamente) | 10min |

**Vars:**
```
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=deepseek
TELEGRAM_BOT_TOKEN_GERENTE=123:ABC...
TELEGRAM_WEBHOOK_SECRET_GERENTE=<32 chars random>
TELEGRAM_DEV_CHAT_ID=<chat_id do Jonathan>
AGENTES_CRON_SECRET=<32 chars random>
DEV_PLAYGROUND_TOKEN=<32 chars random>
AGENTES_DEV_RESET=false
```

**DoD:** todas vars acessíveis em `process.env.*` em runtime EasyPanel.

---

### Story E1.1 — Webhook endpoint + secret (2 SP)
**Branch:** `feat/agentes-webhook-endpoint`
**Owner:** `@backend`

| # | Task | Estim |
|---|---|:-:|
| 11.1 | Criar `src/app/api/agentes/telegram/webhook/[bot]/route.ts` | 10min |
| 11.2 | Implementar POST handler com `defineRoute` (CLAUDE.md seção 11) | 20min |
| 11.3 | Criar `src/agentes/core/telegram/webhook-secret.ts` valida `X-Telegram-Bot-Api-Secret-Token` | 20min |
| 11.4 | Resolver skill por slug do path param `[bot]` (query `agentes.skills`) | 20min |
| 11.5 | Retornar 200 com body vazio (Telegram exige) | 5min |
| 11.6 | Retornar 401 se secret inválido | 10min |
| 11.7 | Logar update bruto em `console.log` (debug temporário) | 5min |
| 11.8 | Deploy + validar via curl simulando Telegram | 30min |
| 11.9 | Concluir setWebhook (task 4.7 da E0.4) | — |

**DoD:** curl com header secret correto retorna 200, com header errado retorna 401, sem header retorna 401.

---

### Story E1.2 — Parser de updates (2 SP)
**Branch:** `feat/agentes-parser-updates`
**Owner:** `@backend`

| # | Task | Estim |
|---|---|:-:|
| 12.1 | Criar `src/agentes/core/telegram/parse.ts` com tipo `TelegramUpdate` | 20min |
| 12.2 | Função `parseUpdate(body)` retorna `{kind, chat_id, content?, ...}` | 30min |
| 12.3 | Detectar mídia (photo, voice, video, sticker, contact, location) | 20min |
| 12.4 | Criar `src/agentes/core/telegram/ignore-media.ts` — responde "só entendo texto" | 20min |
| 12.5 | Integrar parser no webhook route | 15min |
| 12.6 | Testes manuais via curl | 30min |

**DoD:** webhook diferencia 4 tipos de update (message texto, callback_query, mídia, unknown), mídia recebe resposta automática.

---

### Story E1.3 — Login chat_id + senha (3 SP)
**Branch:** `feat/agentes-auth-login`
**Owner:** `@backend`

| # | Task | Estim |
|---|---|:-:|
| 13.1 | Criar `src/agentes/core/telegram/send.ts` (sendMessage API) | 25min |
| 13.2 | Criar `src/agentes/core/auth/login-telegram.ts` com state machine: ASK_EMAIL → ASK_PASSWORD → AUTHENTICATED | 60min |
| 13.3 | Validar email contra `alissonerp.usuarios.email` via `db.ts` | 20min |
| 13.4 | Validar senha via `supabase.auth.signInWithPassword()` | 30min |
| 13.5 | Gerar `crypto.randomBytes(32).toString('hex')` como session_token | 10min |
| 13.6 | INSERT/UPDATE em `agentes.usuarios_skill` com token + expires_at = NOW()+30d | 25min |
| 13.7 | Apagar mensagem da senha (Telegram `deleteMessage`) | 25min |
| 13.8 | Criar `src/agentes/core/auth/verify-token.ts` valida + renova expiração | 30min |
| 13.9 | Rate limit primitivo: max 5 tentativas senha/15min/chat_id | 30min |
| 13.10 | Integrar no webhook: se sem token → fluxo login; se com token → eco | 30min |

**DoD:**
- Chat_id desconhecido → bot pede email
- Email válido → bot pede senha
- Senha errada (5x) → bot bloqueia 15min
- Senha correta → bot saúda + token salvo
- Próxima msg do mesmo chat → bot responde sem pedir senha

---

### Story E1.6 — LLM camada DeepSeek (3 SP)
**Branch:** `feat/agentes-llm-deepseek`
**Owner:** `@backend`

| # | Task | Estim |
|---|---|:-:|
| 16.1 | Instalar deps: `npm i ai @ai-sdk/deepseek @ai-sdk/anthropic` | 5min |
| 16.2 | Criar `src/agentes/core/llm/types.ts` (interface `LLMProvider`, `LLMResult`) | 20min |
| 16.3 | Criar `src/agentes/core/llm/deepseek.ts` adapter | 30min |
| 16.4 | Criar `src/agentes/core/llm/anthropic.ts` adapter Haiku 3.5 (não usado, pronto) | 20min |
| 16.5 | Criar `src/agentes/core/llm/index.ts` factory que escolhe por `process.env.LLM_PROVIDER` | 25min |
| 16.6 | Função `chat({ messages, model, max_tokens })` retorna `{content, tokens_in, tokens_out}` | 40min |
| 16.7 | Tratamento de erro: 500/429/timeout → fallback "tive problema técnico" | 30min |
| 16.8 | Integrar no webhook: usuário autenticado → grava em conversas → chama LLM → ecoa resposta | 40min |
| 16.9 | Janela 20 últimas msgs em `core/memory/conversas.ts` (insert + getJanela) | 40min |

**DoD:** gerente manda "oi", bot responde algo coerente gerado pelo DeepSeek, conversa gravada em `agentes.conversas` com tokens contabilizados.

---

## 4. Cronograma da Sprint (5 dias)

```
D1 (Seg) — Setup
  Manhã: E0.1 (pre-flight) → começar E0.2 (migration)
  Tarde: terminar E0.2 + E0.4 (BotFather)
  Fim do dia: schema no banco, bot criado.

D2 (Ter) — .env + Webhook
  Manhã: E0.5 (.env)
  Tarde: E1.1 (webhook endpoint) + começar E1.2 (parser)
  Fim do dia: webhook recebe e devolve 200.

D3 (Qua) — Parser + Login parte 1
  Manhã: terminar E1.2
  Tarde: começar E1.3 (state machine login)
  Fim do dia: bot pede email, valida, pede senha.

D4 (Qui) — Login parte 2 + LLM parte 1
  Manhã: terminar E1.3 (token, deleteMessage)
  Tarde: começar E1.6 (adapters DeepSeek + Anthropic)
  Fim do dia: login completo funcionando, factory LLM montada.

D5 (Sex) — LLM parte 2 + Sprint Review
  Manhã: terminar E1.6 (chat, tratamento erro, integração)
  Tarde 14h-15h: Sprint Review (demo) + Retrospective
  Fim da sprint: bot ecoa via DeepSeek, conversas gravadas.
```

---

## 5. Cerimônias Scrum

| Cerimônia | Quando | Duração | Formato |
|---|---|:-:|---|
| **Sprint Planning** | ✅ Feito | 30min | este doc |
| **Daily Standup** | Todo dia 9h | 5min | mensagem auto: "ontem fiz X, hoje vou Y, blocker Z" |
| **Backlog Refinement** | Quarta 16h | 20min | revisar Sprint 2 com `@po` |
| **Sprint Review** | Sexta 14h | 30min | demo pro Jonathan + `@qa` valida |
| **Retrospective** | Sexta 15h | 30min | conversar com `@sm` sobre o que melhorar |

---

## 6. Branch strategy

Todas as branches saem de `homolog`. Convenção:
```
feat/agentes-<slug-da-story>
```

**Regra Git CLAUDE.md aplicada:** Sprint 1 são todas FEATURES. Logo: cada story = commit homolog → aguardar Jonathan testar → depois confirma main.

---

## 7. Riscos identificados

| Risco | Severidade | Mitigação |
|---|:-:|---|
| Telegram não permitir bot apagar msg da senha | 🟠 média | Testar cedo (D3); fallback: aviso "apaga sua senha do chat" |
| `setWebhook` falhar por SSL do EasyPanel | 🟠 média | Confirmar HTTPS válido antes de D1 |
| DeepSeek API key não emitida a tempo | 🔴 alta | Resolver pré-sprint |
| Parsear updates do Telegram com tipos imprevisíveis | 🟡 baixa | Schema Zod permissivo + log do raw body |
| 15 SP serem pesados pra 1 semana | 🟠 média | E1.6 pode escorregar pra início S2 |

---

## 8. Definition of Sprint Success

Sprint 1 é considerada **bem-sucedida** se ao final de D5:

- [ ] Schema `agentes` no banco com 5 tabelas + 1 view + seed da skill
- [ ] Bot Telegram criado e webhook funcionando (HTTPS + secret válido)
- [ ] Gerente manda "oi" no Telegram, bot pede email, depois senha, autentica
- [ ] Mensagem subsequente do gerente recebe resposta coerente do DeepSeek
- [ ] Conversas gravadas em `agentes.conversas` com tokens, modelo, prompt_hash
- [ ] Mídia (foto/áudio/etc.) é ignorada com aviso "só texto"
- [ ] `npx tsc --noEmit` zero erros
- [ ] @qa aprovou
- [ ] Jonathan testou e validou no próprio Telegram

---

## 9. Handoff pro Dev

### Como começar (instruções pro `@dev` / `@backend`)

1. **Ler em ordem:**
   - `docs/agentes/README.md` (5min)
   - `docs/agentes/arquitetura.md` (15min — focar seção 2 ADRs e seção 4 SQL)
   - `docs/agentes/product-backlog.md` (5min — só pra contexto, foco no que está em S1)
   - `docs/agentes/sprint-1.md` (este doc — 10min)
   - `CLAUDE.md` raiz (regras de Git, schema, padrões — se ainda não leu)

2. **Confirmar pré-requisitos:**
   - DeepSeek API key disponível
   - HTTPS do EasyPanel funcionando
   - Bot do Telegram criado (E0.4 task 4.1-4.6 podem ser feitas pelo Jonathan em paralelo a D1 do dev)

3. **Executar Sprint 1 story-por-story na ordem do cronograma (seção 4):**
   - Começar pela E0.1
   - Reportar SP por SP no chat com Jonathan
   - Cada story tem suas tasks granulares na seção 3

4. **Convenções:**
   - Branch: `feat/agentes-<slug>` (1 por story)
   - Commit: `feat: <descricao> (sprint-1, story E0.X)` por subtask significativa
   - Push direto pra `homolog` ao final de cada story
   - **Nunca pra `main`** sem aprovação Jonathan
   - `npx tsc --noEmit` antes de cada commit
   - Atualizar este doc com checkmarks `[x]` conforme avança

5. **Quando travar:**
   - Story bloqueada por dependência → pular pra próxima e voltar
   - Dúvida técnica → consultar `docs/agentes/arquitetura.md` antes de perguntar
   - Ambiguidade na story → reportar pra `@sm` ou Jonathan
   - Erro do banco/ambiente → STOP, não tentar workarounds que violem CLAUDE.md

6. **Ao terminar uma story:**
   - Marcar `[x]` no Sprint Backlog (seção 2)
   - Subir branch + commit em `homolog`
   - Atualizar `docs/CHANGELOG.md` se feature relevante
   - Aguardar feedback do Jonathan antes de S1.next

7. **Ao terminar a Sprint (D5):**
   - Demo gravada/screenshot pro Jonathan
   - Self-review: todos itens da seção 8 (Definition of Sprint Success) marcados
   - Retrospective com `@sm`: o que ficou bom, o que melhorar pra Sprint 2

### Modo de execução

Conforme CLAUDE.md seção 10 (Orquestração Automática):
- Fase de execução roda em **Sonnet** (`/model sonnet`)
- Após terminar implementação, troca pra Opus pra `@qa` revisar

### Output esperado de cada story

Pro reporting fluir, depois de cada story o dev deve responder:

```
✅ Story E0.X concluída

Branch: feat/agentes-<slug>
Tasks completadas: X.1, X.2, ...
Commits: <list>
Arquivos criados/modificados: <list>
Testes manuais executados: <list>
Pendências: <vazio ou lista>

Pronto pra próxima: E0.Y / aguardando teste do Jonathan
```

---

## 10. Referência rápida

- **Arquitetura completa:** `docs/agentes/arquitetura.md`
- **Backlog completo:** `docs/agentes/product-backlog.md`
- **Padrão API route:** `CLAUDE.md` seção 11 + `src/lib/api-handler.ts`
- **DB access:** `src/lib/db.ts` (postgres.js direto, NUNCA `supabase.from()` em alissonerp)
- **Auth helpers:** `src/lib/permissoes.ts`, `src/lib/audit.ts`
- **Mapeamento DB completo:** `docs/db-mapping/`
