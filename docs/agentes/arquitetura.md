# Arquitetura — Agente Gerente de Produção (v2)

> **Status:** aprovado por @analyst (Atlas) + @architect (Aria). Pronto pra implementação.
> **Princípio-mestre:** simples primeiro, valor desde semana 1, escrita sempre confirmada, memória só com aprovação humana.

---

## 1. Visão geral

### Problema
Conhecimento crítico de produção (etapas + tempos por produto, vocabulário interno, regras de priorização, critérios de qualidade) está concentrado no gerente de fábrica, sem documentação. Risco operacional alto se o gerente sair.

### Solução
Agente conversacional via Telegram + IA que:
- Captura conhecimento tácito conversando com o gerente
- Estrutura e armazena em memória persistente
- Consulta o ERP em tempo real para responder dúvidas operacionais
- Eventualmente escreve no ERP (apontamentos, conclusão de OPs) com confirmação humana
- Envia relatório diário às 23h pro dev com aprendizados, dúvidas, padrões e bugs detectados

### Padrão para futuros agentes
```
1 agente = 1 skill + 1 bot + 1 usuário + 1 prompt
Core compartilhado: LLM, memória, telegram, log, auth
Skill própria: prompt, tools, regras de negócio
```

---

## 2. ADRs (Architecture Decision Records)

### ADR-001: Monolito modular em `fabricaAJ`
Schema `agentes/` em `src/`. Migração pra apps separado **só se** houver ≥2 agentes em produção E deploy do agente bloquear ERP ≥2x/mês.

### ADR-002: Schema `agentes` (PG) + `produto_processo` em `alissonerp`
Backup junto, mesma política. Sem particionamento — usar índice BRIN em `criada_em`.

### ADR-003: LLM via Vercel AI SDK
**Provider primário:** DeepSeek (`@ai-sdk/deepseek`).
**Adapter Haiku 3.5 pronto desde Fase 1** (alternar com env var `LLM_PROVIDER`).
**Avaliar Groq Llama 3.3 70B** em Fase 2 (latência <300ms).

### ADR-004: Auth por random token (32 bytes hex)
Sem JWT. Coluna `session_token` UNIQUE + `session_expires_at` + `revoked_at`. Renova `expires_at = NOW() + 30d` a cada uso. Cross-device automático.

### ADR-005: Cron via `pg_cron` + `pg_net`
Job 23h chama endpoint com `X-Cron-Secret`. Job 5min expira `escritas_pendentes`. Job 24h anonimiza `conversas` >90d.

### ADR-006: Confirmação humana — 3 NÍVEIS
| Nível | Quando | Mecanismo |
|---|---|---|
| **0 — Anúncio** | Vocabulário simples, dúvida, bug detectado | Agente diz "anotei isso" — sem perguntar |
| **1 — Texto explícito** | Regra, preferência, processo parcial | Agente diz "vou salvar X. confirma?" → exige "sim/confirma/pode" |
| **2 — Botão inline** | Processo completo de produto + qualquer escrita ERP | `[✅ Confirmar] [❌ Cancelar]` com TTL 10min |

### ADR-007: Memória pendente → confirmação → memória oficial
Inegociável. Toda info nova passa por `aprendizados_pendentes` exceto Nível 0.

### ADR-008: Janela 20 msgs, sem sumarização no MVP
Custo estimado real: **$1.47/mês** com DeepSeek. Sumarização só se >$5/mês.

### ADR-009: LGPD — consentimento + retenção 90d + comando `*esquecer`
Filtro PII no prompt-builder (CPF/CNPJ/bancário nunca vão pro LLM).

### ADR-010: Versionamento de prompt em git + hash em runtime
Coluna `prompt_hash VARCHAR(64)` em `conversas`. Sem tabela `prompts_versao`.

### ADR-011: Tratamento de erro (LLM e tool)
- LLM falha → resposta hardcoded + alerta dev
- Tool timeout (8s) → reporta erro no chat, não trava conversa
- Loop tool >5 → para e pede reformular
- Tool inválido (alucinação) → loga em `tool_calls_log.erro`

### ADR-012: Rate limit duplo + token cap
- Burst: 10 msgs/min
- Sustentado: 100 msgs/h
- Token cap: 200k tokens/dia/usuário

### ADR-013: Mídia não-texto
Bot ignora foto/áudio/vídeo/sticker/contato/localização e responde:
> "Ainda só entendo texto. Pode digitar?"

### ADR-014: `produto_processo` com vigência (SCD type 2)
Sem `versao` numérica. Usa `valido_de TIMESTAMPTZ NOT NULL DEFAULT NOW()` + `valido_ate TIMESTAMPTZ NULL`. Atualizar = fechar registro antigo (`valido_ate=NOW()`) + criar novo.

### ADR-015: Modo playground (dev only)
Endpoint `/api/agentes/playground` autenticado por `DEV_PLAYGROUND_TOKEN` simula conversa sem afetar `usuarios_skill` real.

### ADR-016: Reset dev em deploy
Flag `AGENTES_DEV_RESET=true` no `.env.development` limpa conversas/aprendizados/escritas do `usuario_skill_id` do dev em cada deploy local. **Nunca** ativa em produção.

---

## 3. Estrutura de pastas

```
fabricaAJ/
├── src/
│   ├── app/api/agentes/
│   │   ├── telegram/webhook/[bot]/route.ts        # entrada Telegram
│   │   ├── cron/relatorio-diario/route.ts         # 23h
│   │   ├── playground/route.ts                    # ADR-015
│   │   └── admin/
│   │       ├── escritas-pendentes/route.ts
│   │       ├── aprendizados/route.ts
│   │       └── metricas/route.ts                  # consome view
│   │
│   ├── agentes/
│   │   ├── core/                                  # COMPARTILHADO
│   │   │   ├── llm/
│   │   │   │   ├── index.ts                       # generateText wrapper
│   │   │   │   ├── deepseek.ts
│   │   │   │   ├── anthropic.ts                   # Haiku 3.5 — pronto Fase 1
│   │   │   │   └── types.ts
│   │   │   ├── memory/
│   │   │   │   ├── conversas.ts
│   │   │   │   ├── aprendizados.ts
│   │   │   │   ├── vocabulario.ts
│   │   │   │   ├── regras.ts
│   │   │   │   └── retrieve.ts
│   │   │   ├── auth/
│   │   │   │   ├── login-telegram.ts              # senha → random token
│   │   │   │   ├── verify-token.ts
│   │   │   │   └── revoke.ts
│   │   │   ├── telegram/
│   │   │   │   ├── send.ts
│   │   │   │   ├── inline-buttons.ts
│   │   │   │   ├── parse.ts
│   │   │   │   ├── webhook-secret.ts
│   │   │   │   └── ignore-media.ts                # ADR-013
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts
│   │   │   │   ├── executor.ts                    # com timeout 8s
│   │   │   │   ├── audit.ts
│   │   │   │   ├── confirm.ts                     # 3 níveis (ADR-006)
│   │   │   │   └── error-handling.ts              # ADR-011
│   │   │   ├── prompt/
│   │   │   │   ├── builder.ts                     # com hash sha256
│   │   │   │   ├── filter-pii.ts
│   │   │   │   └── token-counter.ts
│   │   │   ├── rate-limit/
│   │   │   │   └── check.ts                       # ADR-012
│   │   │   ├── relatorio/
│   │   │   │   └── gerar.ts
│   │   │   ├── lgpd/
│   │   │   │   ├── consentimento.ts
│   │   │   │   ├── retencao.ts
│   │   │   │   └── esquecer.ts
│   │   │   ├── playground/
│   │   │   │   └── simular.ts                     # ADR-015
│   │   │   └── orchestrator.ts
│   │   │
│   │   ├── skills/
│   │   │   └── gerente-producao/
│   │   │       ├── prompt.md                      # versionado git
│   │   │       ├── onboarding.md                  # roteiro 1ª conversa
│   │   │       ├── orchestrate.ts
│   │   │       ├── tools/                         # leitura+memória (Fases 2-3)
│   │   │       │   ├── listar-ordens-pcp.ts
│   │   │       │   ├── detalhar-ordem.ts
│   │   │       │   ├── consultar-saldo-ouro.ts
│   │   │       │   ├── consultar-saldo-insumo.ts
│   │   │       │   ├── buscar-produto.ts
│   │   │       │   ├── buscar-processo-produto.ts
│   │   │       │   ├── propor-processo-produto.ts # nível 2
│   │   │       │   ├── propor-aprendizado.ts
│   │   │       │   ├── confirmar-aprendizado.ts
│   │   │       │   ├── registrar-vocabulario.ts   # nível 0
│   │   │       │   ├── registrar-regra.ts         # nível 1
│   │   │       │   ├── registrar-duvida.ts        # nível 0
│   │   │       │   ├── registrar-bug-erp.ts       # nível 0
│   │   │       │   └── sugerir-apontamento.ts     # ⭐ Fase 2 — valor cedo
│   │   │       ├── tools-escrita-erp/             # Fase 6 — ⚠️ alto risco
│   │   │       │   ├── criar-apontamento-pcp.ts
│   │   │       │   └── concluir-ordem.ts
│   │   │       └── relatorio-diario.ts
│   │   │
│   │   └── shared/
│   │       ├── tipos.ts
│   │       └── erros.ts
│   │
│   └── lib/                                       # já existe
│       ├── db.ts
│       ├── permissoes.ts
│       ├── audit.ts
│       └── parametros.ts
│
├── supabase/migrations/
│   ├── 230_schema_agentes_inicial.sql             # 5 tabelas + view métricas
│   ├── 231_alissonerp_produto_processo.sql        # SCD type 2
│   ├── 232_agentes_memoria_e_aprendizados.sql     # Fase 3
│   ├── 233_agentes_relatorio_e_deteccoes.sql      # Fase 4
│   └── 234_agentes_pg_cron_jobs.sql               # 23h + 5min + 24h
│
├── docs/
│   └── agentes/
│       ├── README.md
│       ├── arquitetura.md                         # este doc
│       ├── product-backlog.md
│       ├── sprint-1.md
│       ├── privacidade.md                         # LGPD público (a criar)
│       └── adrs/
│
└── .env adições
    ├── DEEPSEEK_API_KEY
    ├── ANTHROPIC_API_KEY                          # Haiku adapter
    ├── LLM_PROVIDER=deepseek                      # toggle
    ├── TELEGRAM_BOT_TOKEN_GERENTE
    ├── TELEGRAM_WEBHOOK_SECRET_GERENTE
    ├── TELEGRAM_DEV_CHAT_ID
    ├── AGENTES_CRON_SECRET
    ├── DEV_PLAYGROUND_TOKEN
    └── AGENTES_DEV_RESET=false                    # true só em dev
```

### Regras de import
- `skills/*` → pode importar de `core/*` e `lib/*`
- `skills/X` → NUNCA importa de `skills/Y`
- `core/*` → nunca importa de `skills/*`
- `core/*` → pode importar de `lib/*` (db, audit, permissoes)

---

## 4. Schema SQL final

> **Migrations livres a partir de `230`** (última do ERP é `200`).

### Migration 230 — schema agentes inicial

```sql
CREATE SCHEMA IF NOT EXISTS agentes;
COMMENT ON SCHEMA agentes IS 'Memória, conversas, logs e config dos agentes IA';

-- 1. Skills
CREATE TABLE agentes.skills (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(50) UNIQUE NOT NULL,
  nome            VARCHAR(100) NOT NULL,
  descricao       TEXT,
  bot_token_env   VARCHAR(100) NOT NULL,
  prompt_path     VARCHAR(255) NOT NULL,
  ativa           BOOLEAN NOT NULL DEFAULT true,
  llm_provider    VARCHAR(30) NOT NULL DEFAULT 'deepseek',
  llm_model       VARCHAR(50) NOT NULL DEFAULT 'deepseek-chat',
  max_tokens      INT NOT NULL DEFAULT 2000,
  max_tool_loops  INT NOT NULL DEFAULT 5,
  janela_msgs     INT NOT NULL DEFAULT 20,
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizada_em   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vínculo Telegram ↔ ERP user ↔ skill (sessão)
CREATE TABLE agentes.usuarios_skill (
  id                    SERIAL PRIMARY KEY,
  skill_id              INT NOT NULL REFERENCES agentes.skills(id),
  usuario_id            INT NOT NULL REFERENCES alissonerp.usuarios(id) ON DELETE CASCADE,
  telegram_chat_id      BIGINT NOT NULL,
  telegram_username     VARCHAR(100),
  -- ADR-004
  session_token         VARCHAR(64) UNIQUE,
  session_expires_at    TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  -- LGPD (ADR-009)
  consentimento_em      TIMESTAMPTZ,
  consentimento_versao  VARCHAR(20),
  esquecido_em          TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_skill_chat UNIQUE (skill_id, telegram_chat_id),
  CONSTRAINT uq_skill_usuario UNIQUE (skill_id, usuario_id)
);
CREATE INDEX idx_usk_chat_id ON agentes.usuarios_skill(telegram_chat_id) WHERE esquecido_em IS NULL;

-- 3. Conversas
CREATE TABLE agentes.conversas (
  id              BIGSERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  conteudo        TEXT NOT NULL,
  tool_name       VARCHAR(100),
  tool_args       JSONB,
  tool_result     JSONB,
  tokens_in       INT,
  tokens_out      INT,
  prompt_hash     VARCHAR(64),
  modelo          VARCHAR(50),
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  anonimizada_em  TIMESTAMPTZ
);
CREATE INDEX idx_conv_usk ON agentes.conversas(usuario_skill_id, criada_em DESC);
CREATE INDEX idx_conv_brin ON agentes.conversas USING BRIN (criada_em);

-- 4. Tool calls log
CREATE TABLE agentes.tool_calls_log (
  id              BIGSERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  conversa_id     BIGINT REFERENCES agentes.conversas(id),
  tool_name       VARCHAR(100) NOT NULL,
  args            JSONB NOT NULL,
  is_escrita      BOOLEAN NOT NULL,
  resultado       JSONB,
  erro            TEXT,
  duracao_ms      INT,
  executada_em    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tcl_usk ON agentes.tool_calls_log(usuario_skill_id, executada_em DESC);
CREATE INDEX idx_tcl_brin ON agentes.tool_calls_log USING BRIN (executada_em);

-- 5. Escritas pendentes
CREATE TABLE agentes.escritas_pendentes (
  id              SERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  conversa_id     BIGINT REFERENCES agentes.conversas(id),
  tool_name       VARCHAR(100) NOT NULL,
  args            JSONB NOT NULL,
  resumo_humano   TEXT NOT NULL,
  telegram_message_id BIGINT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','confirmada','cancelada','expirada')),
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  expira_em       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  resolvida_em    TIMESTAMPTZ,
  resultado       JSONB,
  erro            TEXT
);
CREATE INDEX idx_esc_pend_status ON agentes.escritas_pendentes(status, expira_em);

-- 6. View de métricas
CREATE VIEW agentes.vw_metricas_skill AS
SELECT
  s.slug,
  s.nome,
  COUNT(DISTINCT us.id) FILTER (WHERE us.esquecido_em IS NULL) AS usuarios_ativos,
  COUNT(DISTINCT c.id) FILTER (WHERE c.criada_em > NOW() - INTERVAL '7 days')                 AS msgs_7d,
  COUNT(DISTINCT c.id) FILTER (WHERE c.criada_em > NOW() - INTERVAL '30 days')                AS msgs_30d,
  COUNT(DISTINCT tcl.id) FILTER (WHERE tcl.executada_em > NOW() - INTERVAL '7 days')          AS tool_calls_7d,
  SUM(c.tokens_in + c.tokens_out) FILTER (WHERE c.criada_em > NOW() - INTERVAL '30 days')     AS tokens_30d
FROM agentes.skills s
LEFT JOIN agentes.usuarios_skill us ON us.skill_id = s.id
LEFT JOIN agentes.conversas c ON c.usuario_skill_id = us.id
LEFT JOIN agentes.tool_calls_log tcl ON tcl.usuario_skill_id = us.id
GROUP BY s.id, s.slug, s.nome;

-- Seed da skill gerente_producao
INSERT INTO agentes.skills (slug, nome, descricao, bot_token_env, prompt_path)
VALUES (
  'gerente_producao',
  'Gerente de Produção',
  'Assistente do gerente de fábrica — captura processos, vocabulário e regras; consulta ERP em tempo real',
  'TELEGRAM_BOT_TOKEN_GERENTE',
  'src/agentes/skills/gerente-producao/prompt.md'
);
```

### Migration 231 — `alissonerp.produto_processo` (SCD type 2)

```sql
CREATE TABLE alissonerp.produto_processo (
  id                  SERIAL PRIMARY KEY,
  produto_id          BIGINT NOT NULL REFERENCES public.produtos(id_produto) ON DELETE CASCADE,
  observacao_geral    TEXT,
  origem              VARCHAR(20) NOT NULL DEFAULT 'agente' CHECK (origem IN ('agente','manual','importado')),
  ensinado_por        INT REFERENCES alissonerp.usuarios(id),
  -- ADR-014 SCD type 2
  valido_de           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valido_ate          TIMESTAMPTZ,                    -- NULL = ativo
  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alissonerp.produto_processo_etapa (
  id                  SERIAL PRIMARY KEY,
  processo_id         INT NOT NULL REFERENCES alissonerp.produto_processo(id) ON DELETE CASCADE,
  ordem               INT NOT NULL,
  nome                VARCHAR(100) NOT NULL,
  descricao           TEXT,
  tempo_padrao_min    INT,
  responsavel_role    VARCHAR(50),
  observacao          TEXT,
  CONSTRAINT uq_proc_etapa_ordem UNIQUE (processo_id, ordem)
);

-- Apenas 1 processo ativo por produto
CREATE UNIQUE INDEX uq_processo_ativo ON alissonerp.produto_processo(produto_id) WHERE valido_ate IS NULL;
CREATE INDEX idx_proc_produto ON alissonerp.produto_processo(produto_id);

COMMENT ON TABLE alissonerp.produto_processo IS 'Processo de fabricação por produto. SCD type 2: valido_ate=NULL é a versão atual, registros antigos têm valido_ate preenchido.';
```

### Migration 232 — Memória + aprendizados (Fase 3)

```sql
-- 7. Vocabulário
CREATE TABLE agentes.memoria_vocabulario (
  id              SERIAL PRIMARY KEY,
  skill_id        INT NOT NULL REFERENCES agentes.skills(id),
  termo           VARCHAR(100) NOT NULL,
  significado     TEXT NOT NULL,
  ensinado_por    INT REFERENCES alissonerp.usuarios(id),
  ensinado_em     TIMESTAMPTZ DEFAULT NOW(),
  fonte_conversa_id BIGINT REFERENCES agentes.conversas(id),
  CONSTRAINT uq_voc_skill_termo UNIQUE (skill_id, termo)
);

-- 8. Regras
CREATE TABLE agentes.memoria_regras (
  id              SERIAL PRIMARY KEY,
  skill_id        INT NOT NULL REFERENCES agentes.skills(id),
  titulo          VARCHAR(200) NOT NULL,
  regra           TEXT NOT NULL,
  contexto        VARCHAR(50),
  ensinada_por    INT REFERENCES alissonerp.usuarios(id),
  ensinada_em     TIMESTAMPTZ DEFAULT NOW(),
  ativa           BOOLEAN NOT NULL DEFAULT true,
  fonte_conversa_id BIGINT REFERENCES agentes.conversas(id)
);

-- 9. Preferências por usuário
CREATE TABLE agentes.memoria_preferencias (
  id              SERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  chave           VARCHAR(100) NOT NULL,
  valor           TEXT NOT NULL,
  atualizada_em   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_pref_user_chave UNIQUE (usuario_skill_id, chave)
);

-- 10. Aprendizados pendentes (níveis 1 e 2)
CREATE TABLE agentes.aprendizados_pendentes (
  id              SERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL CHECK (tipo IN
                    ('vocabulario','regra','preferencia','processo_produto','outro')),
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','confirmado','rejeitado','expirado')),
  fonte_conversa_id BIGINT REFERENCES agentes.conversas(id),
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  resolvido_em    TIMESTAMPTZ,
  resolvido_por   INT REFERENCES alissonerp.usuarios(id)
);
CREATE INDEX idx_aprend_pend ON agentes.aprendizados_pendentes(status, criado_em);

-- 11. Dúvidas pendentes
CREATE TABLE agentes.duvidas_pendentes (
  id              SERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  pergunta        TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'aberta'
                    CHECK (status IN ('aberta','respondida','descartada')),
  resposta        TEXT,
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  respondida_em   TIMESTAMPTZ
);
```

### Migration 233 — Relatórios + detecções (Fase 4)

```sql
CREATE TABLE agentes.relatorios_diarios (
  id              SERIAL PRIMARY KEY,
  skill_id        INT NOT NULL REFERENCES agentes.skills(id),
  data            DATE NOT NULL,
  resumo          TEXT NOT NULL,
  aprendizados_qtd INT,
  duvidas_qtd     INT,
  bugs_detectados JSONB,
  padroes         JSONB,
  tokens_consumidos INT,
  custo_estimado_usd NUMERIC(8,4),
  enviado_em      TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_rel_skill_data UNIQUE (skill_id, data)
);

CREATE TABLE agentes.detecoes_sistema (
  id              SERIAL PRIMARY KEY,
  skill_id        INT NOT NULL REFERENCES agentes.skills(id),
  tipo            VARCHAR(30) NOT NULL CHECK (tipo IN ('bug','fragilidade','automacao','sugestao')),
  titulo          VARCHAR(200) NOT NULL,
  descricao       TEXT NOT NULL,
  evidencia       JSONB,
  severidade      VARCHAR(20) DEFAULT 'media' CHECK (severidade IN ('baixa','media','alta')),
  status          VARCHAR(20) DEFAULT 'aberta' CHECK (status IN ('aberta','vista','em_progresso','resolvida','descartada')),
  detectada_em    TIMESTAMPTZ DEFAULT NOW(),
  fonte_conversa_id BIGINT REFERENCES agentes.conversas(id)
);
```

### Migration 234 — pg_cron jobs (Fase 4)

```sql
-- 23h relatório
SELECT cron.schedule('agentes-relatorio-diario', '0 2 * * *', $$
  SELECT net.http_post(
    url := current_setting('app.base_url') || '/api/agentes/cron/relatorio-diario',
    headers := jsonb_build_object('X-Cron-Secret', current_setting('app.cron_secret')),
    body := '{}'::jsonb
  );
$$);

-- 5min expirar escritas
CREATE OR REPLACE FUNCTION agentes.fn_expirar_escritas_pendentes()
RETURNS void LANGUAGE sql AS $$
  UPDATE agentes.escritas_pendentes
     SET status='expirada', resolvida_em=NOW()
   WHERE status='pendente' AND expira_em < NOW();
$$;
SELECT cron.schedule('agentes-expirar-escritas', '*/5 * * * *',
  $$ SELECT agentes.fn_expirar_escritas_pendentes(); $$);

-- 24h anonimizar conversas >90d
CREATE OR REPLACE FUNCTION agentes.fn_anonimizar_conversas_antigas()
RETURNS void LANGUAGE sql AS $$
  UPDATE agentes.conversas
     SET conteudo = '[anonimizado]', tool_args = NULL, tool_result = NULL,
         anonimizada_em = NOW()
   WHERE criada_em < NOW() - INTERVAL '90 days' AND anonimizada_em IS NULL;
$$;
SELECT cron.schedule('agentes-anonimizar-90d', '0 3 * * *',
  $$ SELECT agentes.fn_anonimizar_conversas_antigas(); $$);
```

---

## 5. Catálogo de tools (final)

| Tool | Tipo | Confirmação | Fase |
|---|---|:-:|:-:|
| `listar_ordens_pcp` | leitura | — | 2 |
| `detalhar_ordem` | leitura | — | 2 |
| `consultar_saldo_ouro` | leitura | — | 2 |
| `consultar_saldo_insumo` | leitura | — | 2 |
| `buscar_produto` | leitura | — | 2 |
| `buscar_processo_produto` | leitura | — | 2 |
| `sugerir_apontamento` ⭐ | tarefa pro dev | — | 2 |
| `registrar_vocabulario` | memória | N0 anúncio | 3 |
| `registrar_duvida` | memória | N0 anúncio | 3 |
| `registrar_bug_erp` | observação | N0 anúncio | 3 |
| `propor_aprendizado` | memória | N1 texto | 3 |
| `confirmar_aprendizado` | memória | N1 texto | 3 |
| `registrar_regra` | memória | N1 texto | 3 |
| `propor_processo_produto` | escrita ERP | N2 botão | 3 |
| `criar_apontamento_pcp` | escrita ERP | N2 botão | 6 |
| `concluir_ordem` | escrita ERP | N2 botão | 6 |

---

## 6. Fluxo de mensagem

```
[Telegram] → POST /webhook/[bot]
   ↓
1. Valida X-Telegram-Bot-Api-Secret-Token
2. Resolve skill pelo bot slug
3. Parse: message ou callback_query
   ↓
─── callback_query? → confirma/cancela escrita_pendente → executa → edita msg
   ↓
─── message não-texto? (foto/áudio/etc) → ADR-013: "só entendo texto"
   ↓
─── message de texto:
     ↓
4. AUTH: busca usuario_skill por chat_id + valida session_token
     ├─ token válido → segue
     ├─ token expirado/sem token → "Mande sua senha"
     ├─ msg = senha → signInWithPassword → emite session_token
     └─ chat desconhecido → "Quem é você? Email + senha"
     ↓
5. RATE LIMIT (ADR-012): burst 10/min + sustentado 100/h + tokens 200k/dia
     ├─ ok → segue
     └─ excedido → "muito rápido, espera"
     ↓
6. PRIMEIRA CONVERSA? → roda onboarding.md: consentimento LGPD + intro
     ↓
7. ORCHESTRATOR:
   a. grava msg user em conversas
   b. carrega janela: últimas 20 msgs
   c. carrega memória relevante: vocab + regras + prefs (top-K por keywords)
   d. monta prompt: system + memória + janela + msg
   e. filter-pii (CPF/CNPJ/bancário)
   f. computa prompt_hash sha256
   g. chama llm.generateText({ messages, tools, model })
   h. loop tool_calls (max 5, timeout 8s cada):
        ├─ leitura → executa, log, devolve
        ├─ N0 → executa, anuncia "anotei isso"
        ├─ N1 → resposta do LLM contém pergunta de confirmação
        └─ N2 → cria escritas_pendentes + envia botão inline → SAI loop
   i. se erro LLM → resposta hardcoded + alerta dev
   j. resposta final
   k. grava em conversas (com prompt_hash, tokens, modelo)
   l. envia ao Telegram
```

---

## 7. Plano de fases

| Fase | Nome | Sprint | Goal |
|---|---|:-:|---|
| 0 | Infra | S1 | Migration + bot + .env + privacidade |
| 1 | Eco autenticado | S1-S2 | Bot loga e ecoa via LLM |
| 2 | Leitura ERP + valor cedo | S2-S3 | Tools de leitura + sugerir_apontamento |
| 3 | Memória 3 níveis | S3 | Aprende vocabulário/regras/processo |
| 4 | Relatório diário 23h | S4 | Cron + envio dev + métricas |
| 5 | Refinamento | contínuo | Polish baseado em uso real |
| 6 | Escrita ERP ⚠️ | S6 | Apontamentos + conclusão de OPs |
| 7 | Generalização | S7+ | 2º agente reusando core |

---

## 8. Critérios de sucesso (3 meses)

| Métrica | Meta MVP |
|---|---|
| Adoção do gerente | ≥ 5 interações/dia |
| Cobertura de processos por produto | ≥ 30% dos produtos com receita 12m |
| Aprendizados confirmados | ≥ 50 entradas |
| Bugs detectados / mês | ≥ 3 |
| Tempo médio de resposta | < 5s |
| Custo mensal LLM | < $10 |
| Taxa "respondi com tool" | > 90% |

---

## 9. Restrições inegociáveis

1. Toda escrita no ERP exige confirmação humana via botão inline Telegram
2. Toda tool_call é logada antes de executar (auditoria)
3. Nunca armazenar senha
4. Aprendizado novo só vira memória oficial após confirmação literal do usuário
5. Citar fonte ao usar memória ("conforme você me ensinou em DD/MM")
6. Nunca alterar funções no-touch do CLAUDE.md
7. Schemas `public` e `directus` permanecem READONLY
8. Schema `crm` não tocar (projeto futuro)
9. Consentimento LGPD explícito do gerente registrado na 1ª conversa
10. Retenção de conversas: 90 dias (depois anonimizar)
11. Comando `*esquecer` deve existir
12. Filtro no prompt-builder: nunca enviar CPF/CNPJ/dados bancários ao LLM
13. Página de privacidade simples publicada
