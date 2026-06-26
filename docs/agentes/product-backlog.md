# Product Backlog — Agente Gerente de Produção

> **Owner:** @po (Pax) | **Validado por:** @analyst (Atlas) + @architect (Aria)
> **Total:** 8 epics, 58 stories, 127 SP, 7 sprints

---

## Vision Statement

Capturar, estruturar e democratizar o conhecimento tácito de produção da Alisson Joias, hoje concentrado no gerente de fábrica, transformando-o em ativo durável e consultável da empresa por meio de um agente conversacional Telegram + IA.

## MVP Goal (3 meses)

Bot do gerente em produção, 5+ interações/dia, 30%+ dos produtos com processo documentado, relatório diário 23h funcionando, 50+ aprendizados confirmados, custo < $10/mês.

---

## Definition of Ready (DoR)

Story só entra na Sprint se:
- [ ] Acceptance criteria escrito (Given/When/Then)
- [ ] Dependências mapeadas e desbloqueadas
- [ ] Story point estimado
- [ ] Tabelas/colunas/buckets do ERP confirmados (regra CLAUDE.md)
- [ ] Mockup ou exemplo de I/O quando aplicável
- [ ] Sem ambiguidade — o dev sabe exatamente o que fazer

## Definition of Done (DoD)

Story só fecha quando:
- [ ] Código implementado e em `homolog`
- [ ] `npx tsc --noEmit` zero erros
- [ ] Acceptance criteria validados via playground (ADR-015)
- [ ] Logs/auditoria funcionando (`tool_calls_log`)
- [ ] Erros tratados (ADR-011)
- [ ] Atualizou docs afetadas (CLAUDE.md seção 9)
- [ ] @qa aprovou
- [ ] Jonathan testou (se feature)

---

## Roadmap de Sprints

| Sprint | Duração | Epic(s) | Goal |
|---|---|---|---|
| **S1** | 1 sem | E0 + E1.1-E1.5 | Bot autenticado eco no Telegram |
| **S2** | 1 sem | E1.6-E1.10 + E2.1-E2.4 | Bot lê ERP e sugere apontamentos |
| **S3** | 1 sem | E2.5 + E3.1-E3.5 | Memória 3-níveis + processo de produto |
| **S4** | 1 sem | E3.6 + E4 | Relatório diário 23h + métricas |
| **S5** | 1 sem | E5 (refinamento) | Polish + estabilização (opcional) |
| **S6** | 1 sem | E6 | Escrita ERP (apontamento, conclusão) |
| **S7** | 1 sem | E7 | 2º agente piloto (vendedor) |

**Capacidade dev solo:** ~15 story points/sprint (Fibonacci 1-2-3-5-8).

---

## EPIC 0 — Infraestrutura (Sprint 1, 8 SP)

| ID | Story | MoSCoW | SP |
|---|---|:-:|:-:|
| E0.1 | Pre-flight: confirmar número de migration livre | 🔴 | 1 |
| E0.2 | Migration `230` schema agentes inicial (5 tabelas + view métricas) | 🔴 | 3 |
| E0.3 | Migration `231` `alissonerp.produto_processo` (SCD type 2) | 🔴 | 2 |
| E0.4 | Criar bot Telegram via BotFather + setWebhook | 🔴 | 1 |
| E0.5 | Configurar `.env` com 9 variáveis novas no EasyPanel | 🔴 | 1 |
| E0.6 | Publicar página `/agentes/privacidade` (LGPD) | 🟠 | 1 |

### E0.2 detalhada
**Como** dev, **quero** o schema `agentes` criado com 5 tabelas + view de métricas, **para que** o agente tenha onde gravar conversas, sessões, escritas pendentes e logs.

**Acceptance criteria:**
- **Given** o banco em estado atual, **when** rodar a migration `230`, **then**:
  - Schema `agentes` existe
  - Tabelas `skills`, `usuarios_skill`, `conversas`, `tool_calls_log`, `escritas_pendentes` criadas
  - View `agentes.vw_metricas_skill` retorna 0 linhas
  - Seed em `agentes.skills` com slug='gerente_producao' inserido
  - Índices BRIN em `criada_em` (conversas) e `executada_em` (tool_calls_log)

---

## EPIC 1 — Autenticação + Eco (Sprints 1-2, 24 SP)

| ID | Story | MoSCoW | SP | Dep |
|---|---|:-:|:-:|:-:|
| E1.1 | Endpoint webhook Telegram com validação de secret_token | 🔴 | 2 | E0 |
| E1.2 | Parser de updates Telegram (message vs callback_query vs mídia) | 🔴 | 2 | E1.1 |
| E1.3 | `core/auth/login-telegram.ts` — chat_id + senha → random token 32 bytes | 🔴 | 3 | E0.2 |
| E1.4 | `core/auth/verify-token.ts` — valida + renova expiração | 🔴 | 2 | E1.3 |
| E1.5 | `core/auth/revoke.ts` + comando `*sair` | 🟠 | 1 | E1.4 |
| E1.6 | `core/llm/index.ts` + adapter DeepSeek (Vercel AI SDK) | 🔴 | 3 | — |
| E1.7 | `core/llm/anthropic.ts` adapter Haiku 3.5 (não usado, pronto pra trocar) | 🟠 | 2 | E1.6 |
| E1.8 | `core/memory/conversas.ts` — insert + janela últimas 20 | 🔴 | 2 | E0.2 |
| E1.9 | `core/prompt/{builder, filter-pii}.ts` | 🔴 | 3 | E1.8 |
| E1.10 | `core/rate-limit/check.ts` — burst 10/min + sustentado 100/h + tokens 200k/d | 🟠 | 2 | E1.8 |
| E1.11 | `core/telegram/{send, ignore-media}.ts` (ADR-013 mídia) | 🔴 | 2 | E1.2 |
| E1.12 | Endpoint `/api/agentes/playground` (modo dev — gap analyst) | 🟠 | 2 | E1.6 |
| E1.13 | Flag `AGENTES_DEV_RESET` (limpa dados do dev em deploy) | 🟡 | 1 | E1.8 |
| E1.14 | Roteiro `onboarding.md` + 1ª conversa com consentimento LGPD | 🔴 | 2 | E1.9 |

### E1.3 detalhada
**Como** gerente, **quero** mandar minha senha pro bot na 1ª vez, **para que** seja autenticado e não precise mandar senha de novo nos próximos 30 dias.

**Acceptance criteria:**
- Chat_id desconhecido → bot pede "Quem é você? Mande seu email do ERP"
- Email válido → bot pede "Mande sua senha"
- Senha errada → bot diz "tenta de novo" (max 5 tentativas/15min)
- Senha correta → gera token 32 bytes, INSERT em `usuarios_skill`, expira 30d, apaga msg da senha, saúda
- Próximas msgs não pedem senha enquanto token válido

---

## EPIC 2 — Leitura ERP + Valor Cedo (Sprint 2-3, 16 SP)

| ID | Story | MoSCoW | SP | Dep |
|---|---|:-:|:-:|:-:|
| E2.1 | `core/tools/{registry, executor, audit}.ts` (timeout 8s, log) | 🔴 | 3 | E1 |
| E2.2 | Tool `listar_ordens_pcp` (ordens em aberto + processo se existe) | 🔴 | 2 | E2.1, E0.3 |
| E2.3 | Tool `detalhar_ordem` (1 ordem + apontamentos recentes) | 🔴 | 2 | E2.1 |
| E2.4 | Tool `consultar_saldo_ouro` (vw_saldo_estoque, deposito=1) | 🔴 | 1 | E2.1 |
| E2.5 | Tool `consultar_saldo_insumo` (qualquer insumo) | 🟠 | 1 | E2.1 |
| E2.6 | Tool `buscar_produto` (nome ou ref) | 🔴 | 1 | E2.1 |
| E2.7 | Tool `buscar_processo_produto` (lê `produto_processo` ativo) | 🔴 | 1 | E2.1, E0.3 |
| E2.8 | ⭐ Tool `sugerir_apontamento` (gap analyst — valor cedo) | 🔴 | 2 | E2.1 |
| E2.9 | Prompt v1 da skill gerente_producao (`prompt.md` + hash runtime) | 🔴 | 3 | E2.2-E2.8 |

### E2.8 detalhada (a tool ⭐ valor-cedo)
**Como** gerente, **quero** que o agente sugira apontamento quando vejo OP travada, **para que** eu não precise abrir o ERP — basta confirmar/rejeitar a sugestão depois.

**Acceptance criteria:**
- Mando "tô apontando 5g de ouro nessa OP 1234" → agente cria registro em `agentes.detecoes_sistema` tipo='sugestao'
- Agente responde "Anotei a sugestão. Você ainda precisa registrar no ERP. Posso fazer isso por você quando a Fase 6 for liberada"
- Registro fica visível em `/api/agentes/admin/sugestoes`

---

## EPIC 3 — Memória 3-Níveis (Sprint 3, 17 SP)

| ID | Story | MoSCoW | SP | Dep |
|---|---|:-:|:-:|:-:|
| E3.1 | Migration `232` (vocabulário, regras, preferências, aprendizados, dúvidas) | 🔴 | 2 | E0.2 |
| E3.2 | `core/memory/{aprendizados, vocabulario, regras, retrieve}.ts` | 🔴 | 3 | E3.1 |
| E3.3 | `core/tools/confirm.ts` — 3 níveis (anúncio, texto, botão) | 🔴 | 5 | E3.1 |
| E3.4 | Botão inline Telegram + callback_handler | 🔴 | 3 | E3.3 |
| E3.5 | Tools nível 0: `registrar_vocabulario`, `registrar_duvida`, `registrar_bug_erp` | 🔴 | 1 | E3.3 |
| E3.6 | Tools nível 1: `propor_aprendizado`, `confirmar_aprendizado`, `registrar_regra` | 🔴 | 2 | E3.3 |
| E3.7 | Tool nível 2: `propor_processo_produto` (escreve em `produto_processo`) | 🔴 | 3 | E3.3, E0.3 |
| E3.8 | Comando `*esquecer` (LGPD direito de exclusão) | 🟠 | 2 | E3.1 |
| E3.9 | Citação de fonte ao usar memória ("conforme você me ensinou em DD/MM") | 🔴 | 1 | E3.2 |

### E3.7 detalhada (a tool mais complexa)
**Como** gerente, **quero** ensinar o processo completo de um produto ao agente, **para que** ele saiba responder "como faz o anel X" quando alguém perguntar.

**Acceptance criteria:**
- Digo "vou te ensinar como faz a aliança AL-001: cera 30min, fundição 2h, lima 45min, polimento 1h"
- Agente extrai estruturadamente as 4 etapas via tool args
- Cria `escritas_pendentes` nível 2 com botão `[✅ Confirmar] [❌ Cancelar]`
- Clico ✅ → INSERT em `produto_processo` (SCD type 2: fecha antigo se existir, cria novo) + 4 etapas → edita msg "✅ Salvei o processo da AL-001 com 4 etapas"
- Clico ❌ → marca cancelada, edita msg "❌ Não salvei"
- Não clico em 10min → job de expiração marca expirada, edita msg "⏱️ Expirado"

---

## EPIC 4 — Relatório Diário + Métricas (Sprint 4, 12 SP)

| ID | Story | MoSCoW | SP | Dep |
|---|---|:-:|:-:|:-:|
| E4.1 | Migration `233` (relatorios_diarios, detecoes_sistema) | 🔴 | 1 | E0.2 |
| E4.2 | Migration `234` (pg_cron jobs: 23h, expirar 5min, anonimizar 24h) | 🔴 | 2 | E4.1 |
| E4.3 | `core/relatorio/gerar.ts` (agrega 24h + LLM resume) | 🔴 | 5 | E4.1 |
| E4.4 | Endpoint `/api/agentes/cron/relatorio-diario` com X-Cron-Secret | 🔴 | 2 | E4.3 |
| E4.5 | Bot dev separado (TELEGRAM_DEV_CHAT_ID) p/ envio do relatório | 🔴 | 1 | E4.4 |
| E4.6 | Endpoint `/api/agentes/admin/metricas` (consome `vw_metricas_skill`) | 🟠 | 1 | E0.2 |

---

## EPIC 5 — Refinamento contínuo (sem sprint próprio, 15 SP)

| ID | Story | MoSCoW | SP |
|---|---|:-:|:-:|
| E5.1 | Avaliar Groq Llama 3.3 70B (latência <300ms) se DeepSeek lento | 🟡 | 2 |
| E5.2 | Sumarização periódica `conversas_resumo` (apenas se LLM > $5/mês) | ⚪ | 5 |
| E5.3 | Prompt v2 baseado em padrões reais observados | 🟠 | 3 |
| E5.4 | Otimização de retrieval de memória (top-K → embeddings se necessário) | 🟡 | 5 |

---

## EPIC 6 — Escrita no ERP (Sprint 5-6, 18 SP) ⚠️ ALTO RISCO

| ID | Story | MoSCoW | SP | Dep |
|---|---|:-:|:-:|:-:|
| E6.1 | Tool `criar_apontamento_pcp` (com nível 2 confirma + `temPermissao`) | 🟠 | 5 | E3 |
| E6.2 | Tool `concluir_ordem` (com nível 2 confirma + `temPermissao`) | 🟠 | 5 | E3 |
| E6.3 | Idempotência: hash dos args bloqueia duplicata em <5min | 🔴 | 3 | E6.1 |
| E6.4 | Modo dry-run (mostra o que faria sem executar) — 1 semana de uso | 🔴 | 2 | E6.1 |
| E6.5 | Validação extra `temPermissao()` antes de toda escrita ERP | 🔴 | 1 | E6.1 |
| E6.6 | Auditoria via `src/lib/audit.ts` ANTES de qualquer escrita | 🔴 | 2 | E6.1 |

---

## EPIC 7 — Generalização (Sprint 7+, 17 SP)

| ID | Story | MoSCoW | SP |
|---|---|:-:|:-:|
| E7.1 | Refactor: extrair contrato `Skill` (TS interface) | 🟠 | 2 |
| E7.2 | Documentar processo "como criar uma nova skill" | 🟠 | 2 |
| E7.3 | 2º agente piloto (vendedor) — só leitura | 🟡 | 8 |
| E7.4 | Avaliar split em `apps/agente` (turborepo) — só se ADR-001 sinalizar | ⚪ | 5 |

---

## Sumário do Backlog

| Epic | Stories | SP Total | Sprint(s) | Prioridade |
|---|:-:|:-:|:-:|:-:|
| E0 — Infra | 6 | 8 | S1 | 🔴 |
| E1 — Auth + Eco | 14 | 24 | S1-S2 | 🔴 |
| E2 — Leitura | 9 | 16 | S2-S3 | 🔴 |
| E3 — Memória | 9 | 17 | S3 | 🔴 |
| E4 — Relatório | 6 | 12 | S4 | 🔴 |
| E5 — Refinamento | 4 | 15 | contínuo | 🟡 |
| E6 — Escrita ERP | 6 | 18 | S6 | 🟠 |
| E7 — 2º agente | 4 | 17 | S7+ | 🟡 |
| **TOTAL MVP (E0-E4)** | **44** | **77** | **4 sprints** | — |
| **TOTAL completo** | **58** | **127** | **7 sprints** | — |

---

## Análise de risco

| Risco | Impacto | Mitigação |
|---|---|---|
| Permissão Telegram pra apagar msg de senha | Médio | Confirmar no BotFather na E0.4 |
| LLM não estruturar tool args corretamente | Alto | Prompt v1 com exemplos few-shot na E2.9 |
| Gerente não usar o bot | Crítico | Onboarding atrativo (E1.14) + valor cedo (E2.8) |
| Custo LLM estourar | Baixo | Rate limit (E1.10) + monitor diário (E4.3) |
| Escrita ERP errada | Crítico | Dry-run obrigatório 1 semana (E6.4) |
| Gerente quer áudio | Médio | Limitação clara (ADR-013); avaliar Whisper em E5 |

### Caminho crítico
```
E0.1 → E0.2 → E0.3 → E1.3/E1.8 → E1.6 → E1.9 → E2.1 → E2.9 → E3.3 → E3.7 → E4.3 → E6.1
```
