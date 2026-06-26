# Blindagem do ERP — Pente Fino das 4 Tasks (ancorado na regra de negócio)

> **O que é este doc.** O chefe mandou 4 tasks de blindagem do ERP e referenciou um arquivo
> `docs/TAREFAS-blindagem-comercial-producao.md` que **não existe** (conferido: não está na main,
> nem em branch, nem em PR, nem local). Este documento **substitui e amplia** aquele: faz o pente
> fino das 4 tasks, cada item ancorado na **regra de negócio** do projeto (`docs/regras-negocio/`)
> e no **CLAUDE.md**, com a **prova no código** (arquivo:linha) do que foi verificado.
>
> **Como foi feito.** Verificado no repo `jonathanaraujo-489/alissonerp`, branch `homolog`, em 2026-06-17.
> Tudo que diz ✅ foi lido no código/migração. Tudo que depende de **dado de produção** (saldos
> negativos de ouro, contagens dos bugs como "187 casos") está marcado **(reconferir em prod)** —
> não foi consultado o banco vivo neste documento.
>
> **Legenda:** ✅ verificado · ⚠️ impreciso/incompleto na task original · 🔴 furo/risco · 🟡 decisão do Alisson pendente · ⬜ regra de negócio NÃO documentada

---

## 0. Achados que valem para as 4 tasks (cross-cutting)

### 0.1 🔴 A "regra de ferro" do próprio projeto bloqueia metade das tasks
`docs/regras-negocio/README.md` define: *"vou mexer num módulo → leio a regra dele primeiro. Se o
módulo **NÃO tem regra documentada → PARO**, capturo a regra com o Jonathan, gravo, e só então
implemento."* Status atual dos módulos:

| Task | Módulos que toca | Regra documentada? |
|------|------------------|--------------------|
| TASK 1 (ouro/estoque/patrimônio) | Metal/Ouro, Estoque, PCP | ❌ os 3 estão "a capturar" (só "Ouro=Dinheiro" no CLAUDE.md §2) |
| TASK 3 (comercial→produção) | Comercial ✅ — mas também PCP, Ordens, Devolução, Financeiro | ⚠️ misto |
| TASK 4 (auditoria) | Metal, Financeiro, Fiscal, Admin | ❌ quase tudo "a capturar" |
| TASK 2 (deploy) | infra (não é módulo de negócio) | n/a |

**Consequência:** pela regra do próprio sistema, **TASK 1 e TASK 4 não viram código** enquanto
`metal.md`, `estoque.md`, `pcp.md` (e os que TASK 4 toca) não forem escritos e confirmados pelo
Jonathan. Capturar essas regras é **pré-requisito**, não etapa opcional. *(Munição: a IA do chefe
não tem como brigar com a regra que o próprio projeto impõe.)*

### 0.2 🟠 Todo item que escreve no banco tem 3 obrigações antes de prod
Para qualquer trava/trigger/migration desta blindagem (CLAUDE.md §2):
1. **Homolog antes de produção** (banco de teste `cloud.alisson.api.br` já existe).
2. **Assinar:** `alissonerp.assinar_mudanca_banco(autor, agente, descricao, sql)` + `PGAPPNAME='claude-code-jonathan'` — o token de prod é **compartilhado com a IA do chefe**; mudança sem assinatura no `log_mudancas_banco` = não foi o Jonathan.
3. **Backup antes de ALTER/DELETE/TRUNCATE**, `CREATE OR REPLACE` (nunca DROP), `ADD COLUMN IF NOT EXISTS` (nunca remover).

> Isso deveria estar no "critério de pronto" de TODA task que mexe no banco. As tasks originais não citam.

### 0.3 ✅ Reusar, não duplicar (CLAUDE.md §0)
A infra de auditoria **já existe**: `fn_audit_log()` + tabela `audit_log` (mig `011`), e o livro
append-only de mudanças manuais `log_mudancas_banco` (mig `303`). A "auditoria do razão do ouro"
(TASK 1) deve **estender o trigger existente**, não criar livro novo.

### 0.4 ⚠️ B6 sumiu
A TASK 3 fala em "11 tarefas", mas só nomeia 10 (B1, B2, B3, B4, B5, B7, B8, B9, B10, B11). **B6
não aparece.** Confirmar com o chefe o que é o B6 (ou se são 10 mesmo).

---

## TASK 1 — Patrimônio (ouro / estoque / joia)
> Status global: **bloqueada por 0.1** (regra de Metal/Ouro/Estoque/PCP não documentada). Abaixo, o
> que dá pra blindar e a ordem por risco↓/valor↑.

### 1.1 Auth (401 + cargo) e `created_by` da sessão
- **Regra:** quem mexe em ouro tem que estar logado e o "quem fez" tem que ser inforjável (CLAUDE.md "Ouro=Dinheiro: rastrear 100%").
- **Hoje (✅ verificado por rota):**

| Rota | `created_by` | Veredito |
|------|--------------|----------|
| `pcp/apontamentos/route.ts` | **body** (linhas 19 + 175) | 🔴 **forjável de verdade** |
| `pcp/saida/route.ts` | `user.id` da sessão (227) | ✅ já corrigido |
| `pcp/transferir-service/receber/route.ts` | `user.id` (130) | ✅ já corrigido |
| `distribuicao/[id]/saida/route.ts` | `user.id` (117, 218) | ✅ já corrigido |
| `distribuicao/[id]/concluir/route.ts` | — | ⚠️ não move ouro (CLAUDE.md: "conclusão de lote é administrativa, ZERO movimentações") |

- **Furo real:** só o **`pcp/apontamentos`**. As demais já usam a sessão.
- **Conserto:** trocar `created_by` do body por `user.id` em `pcp/apontamentos`; padronizar 401+cargo via `defineRoute`/`requireRoles` (CLAUDE.md §8). **Não "consertar" as rotas que já estão certas** (retrabalho + risco de regressão).
- ⚠️ Todas chamam `supabase.auth.getUser()`, mas não confirmei se **retornam 401 limpo** quando não há usuário (em `apontamentos`, se `user` for nulo, o `SELECT ... WHERE id = user.id` quebra com 500, não 401, e o cargo não é barreira). Padronizar isso.

### 1.2 ✅ Auditoria do razão do ouro (INSERT + UPDATE + DELETE)
- **Hoje:** `011_audit_triggers_funcoes.sql:37` → `trg_audit_mov_estoque AFTER **INSERT**` (só insert). As irmãs (`ordens`, `pcp`, `protocolos`, `distribuicoes`) têm `INSERT OR UPDATE OR DELETE`. **O chefe está exato.**
- **Conserto (baixo risco):** `CREATE OR REPLACE` do trigger para `AFTER INSERT OR UPDATE OR DELETE` usando o `fn_audit_log()` que já existe.

### 1.3 ✅ Append-only no razão do ouro
- **Risco verificado como BAIXO:** procurei `UPDATE`/`DELETE` em `movimentacoes_estoque` no código e migrations → **zero ocorrências**. Ninguém edita/apaga o razão hoje. Travar com trigger `BEFORE UPDATE OR DELETE → RAISE` **não quebra fluxo existente** e casa com a regra "estorno = movimentação reversa, nunca deletar".
- *(Correção honesta: minha 1ª análise disse "append-only pode quebrar prod" — verifiquei e não procede.)*

### 1.4 🟡 Trava de saldo negativo no ouro — precisa mapeamento + decisão
- **Hoje:** a transferência de ouro (`019`, no-touch) só dá `RAISE` de "PCP não encontrado" — **sem** guarda de saldo. A guarda `STOCK_NEGATIVE: Saldo insuficiente` existe em `202_stock_ledger_entry.sql:136`, `249`, `261`, **mas** há a migration `261_allow_negative_inventory_adjustment` — ou seja, **existe caminho que permite negativo de propósito**.
- **Antes de codar:** mapear **no banco vivo** quais inserts no razão do ouro estão guardados e quais não (DB é fonte de verdade — migration ≠ o que está rodando).
- **🟡 Decisão do Alisson:** tolerância zero ou alguma exceção? Lembrar: **pote (depósito ID=1) não registra quebra**, e há ajuste de inventário que hoje permite negativo — qual fica e qual trava?

### 1.5 🔴 "Transferência atômica num passo só" fere zona No-Touch
- **Regra:** CLAUDE.md §2 lista `fn_processar_transferencia` (019) e `fn_processar_apontamento_pcp` (018) como **No-Touch**, e §0 manda *"adicionar features, NUNCA refatorar código que funciona"*.
- **Furo:** "dupla-entrada num passo só" = **reescrever** a 019. Isso é refatoração de função no-touch.
- **Conserto:** validação de saldo entra como **camada aditiva** (trigger/guard antes da escrita), **sem** reescrever a 019 — OU o chefe autoriza explicitamente levantar o no-touch (e aí entra com backup + assinatura + homolog).

### 1.6 ⚠️ Fechar a porta REST (REVOKE anon/authenticated) — verificar se já não está fechada
- **Nuance importante:** o app conecta como **dono do schema**, que **bypassa RLS**. Então `REVOKE`/policy de leitura **não protege contra o próprio app** — só fecha a porta do PostgREST (anon/authenticated). Quem protege contra o app são os **triggers** (1.2/1.3/1.4) e rebaixar a senha (1.7).
- **Antes de codar:** conferir os GRANTs atuais — CLAUDE.md já trata `public.*` e `directus.*` como READONLY pro app; se anon/authenticated já não escreve, o REVOKE é trabalho à toa.

### 1.7 Rebaixar a senha de conexão do app (sem poder de dono)
- **É a raiz real** ("o app conecta como dono"). Fora de código — precisa acesso ao servidor (Coolify/Hetzner) e criar um role sem ownership/bypass. Alto impacto, fazer com cuidado e teste em homolog primeiro (risco de derrubar o app se faltar permissão).

### 1.8 ⬜ Quebra: base ≤ 0 → "REVISAR"; quebra negativa → alerta
- Anexa à regra "Ouro=Dinheiro" (CLAUDE.md §2: "quebra só quando total_metal > 0"). Conserto em `registrar-quebra.ts` (`buscarOuroRecebido`). **Precisa `metal.md` documentado** para fechar o comportamento esperado.

### 1.9 Idempotência (estorno-lote, pcp/saida) — verificar
- `FOR UPDATE` + 409 / índice único parcial contra clique-duplo. Conferir o estado atual de `distribuicao/[id]/estorno-lote` e `pcp/saida` antes de assumir que falta.

### 1.10 ⬜ Lançamento avulso com justificativa + vínculo + auditoria
- Precisa de regra documentada (o que é avulso, o que exige vínculo). Capturar antes.

### 1.11 Inventário físico (operacional, NÃO-código)
- Contar os depósitos negativos e conciliar. Os valores citados (Carlos Eduardo −56,79g, Gilmar −28,12g, Robson −26,11g, Neneka rosé −8,74g, Mauricio 24k −4,17g) **(reconferir em prod)** — usar `vw_saldo_estoque` agregando `SUM(saldo)` por depósito×insumo (nunca `LIMIT 1`).

### 🟡 Decisões do Alisson — TASK 1
1. Tolerância de saldo negativo no ouro (1.4) — zero, ou exceções (ajuste de inventário, pote)?
2. Levantar ou não o no-touch da 019 para a transferência atômica (1.5)?

### ✅ Critério de pronto — TASK 1 (revisado)
Itens originais **+**: regras de Metal/Ouro/Estoque/PCP capturadas (0.1); cada trava aplicada em homolog antes de prod e **assinada** (0.2); saldos negativos conferidos por **contagem física**.

---

## TASK 2 — Rede de segurança de deploy
> Sem regra de negócio (é infra). Diagnóstico do chefe **✅ confirmado no repo**.

- **✅ Estado real confirmado:** `.husky/pre-push` está com `exit 0` e comentário *"testes pulados: mock `sql.begin` com falha"* → o freio está desligado. A **única** GitHub Action é `build-apk.yml` (monta o APK do celular) — **não há build-gate nem proteção de main automática**. Tudo como a task diz.

- **2.1 Build-gate (GitHub Actions):** em todo push/PR → `install → tsc --noEmit → eslint → next build`; marcar como **checks obrigatórios** na main. Começar por `tsc + eslint` (barato, pega a maioria); `next build` precisa dos secrets do `output: standalone`.
- **2.2 Proteção da main:** proibir push direto; exigir PR aprovado + checks verdes.
- **2.3 Site de teste permanente (Coolify)** alimentado pela branch `homolog` + banco homolog.
- **2.4 Revisor de IA no PR (Qodo PR-Agent)** com a chave Anthropic. Registrar: o diff é enviado pra **API da Anthropic** (aceitável, já usam Claude; não é SaaS novo).
- **2.5 Backup automático offsite:** definir o **destino fora do servidor** (S3/Backblaze) — Hetzner/Coolify self-hosted não dá isso de graça. `pg_dump` + retenção + **uma restauração testada**. Migration sempre no homolog antes da prod.
- **2.6 ⚠️ Religar os testes — cuidado com 2 hooks:** existem **dois** `pre-push`: `.husky/pre-push` (o `exit 0`, o freio dos testes) e `.githooks/pre-push` (faz `git merge origin/main --ff-only`). **Confirmar qual está ativo** (`core.hooksPath`) antes de mexer, senão você liga/conserta o hook errado. Causa-raiz: consertar o mock `sql.begin` (lembrar: o parâmetro do callback é `tx`, não `sql` — CLAUDE.md pitfall).

- **✅ Critério de pronto:** PR quebrado → merge bloqueado; PR sem aprovação não entra na main; site de teste reflete o real; backup testado com 1 restauração.

---

## TASK 3 — Comercial → Produção (orçamento → venda → fábrica → entrega)

### 3.A ✅ Bug do cartão fantasma (o "12º") — SPEC COMPLETA
- **Regra (documentada):**
  - `comercial.md §2`: comissão e gates olham **forma de pagamento** — `Vale-Troca` e `A Receber` nem comissionam. Pagamento define o tratamento.
  - `promocoes.md` (decisão Jonathan 16/06): **item em promoção é ISENTO do gate de aprovação de desconto, "inclusive do gate de cartão"**. ⚠️ O conserto **tem que preservar essa isenção**.
- **Hoje (✅ verificado):** `src/lib/aprovacao-regras.ts:53-54` — a regra `cartao_desconto` dispara só por `percentual_desconto > 20` (default 20), **sem olhar a forma de pagamento**. Então venda paga **no Pix** com desconto >20% **abre aprovação de cartão** indevidamente (caso da venda 15516).
- **Furo:** o gate de cartão não condiciona à forma de pagamento real.
- **Conserto:**
  1. Em `solicitar-aprovacao/route.ts`: só avaliar `cartao_desconto` quando a venda **tem pagamento em cartão** (checar `pagamentos_venda`). 
  2. Manter a **isenção de item promo** (`promocoes.md`).
  3. Front (`VendaDetalheClient.tsx`): não exibir/disparar o gate de cartão fora de cartão.
  4. **+ pedidos do chefe:** somar auditoria na tabela de pagamentos; teto de edição **depois de pago**.
- **Como conferir:** venda paga 100% Pix com desconto 25% **não** abre tarefa de aprovação de cartão; venda no cartão com 25% **abre**; item promo 44% **não** abre (isenção).

### 3.B 🔴 Os 11 bugs (B1–B11) — detalhe a reconstruir
> **O detalhe técnico (causa-raiz, conserto, limpeza de dados) estava no doc que sumiu.** O chefe só
> passou apelido + contagem. **Não vou inventar** o conserto — abaixo, a âncora de regra que já temos
> e o método pra reconstruir cada um. As contagens **(reconferir em prod)**.

| Bug | Apelido (chefe) | Âncora de regra | Como reconstruir |
|-----|-----------------|-----------------|------------------|
| **B2** | cancelar venda não cancela ordem (12) | `comercial.md §5` (cancelamento) + §4 cita `trg_cancelar_pcp_ordem` | rastrear `POST /api/vendas/[id]/cancelar` → o que dispara (ou não) na ordem/PCP |
| **B4** | reservas presas (16) | `comercial.md §3` (reserva vira saída na entrega; `fn_estoque_comercial_*`) | achar reservas `ativa` sem venda viva; ver `fn_estoque_comercial_cancelamento_venda` |
| **B10** | doc da reserva | `comercial.md §3` | conferir documento/rastro gerado ao criar reserva |
| **B11** | docs da baixa | `comercial.md §3` (baixa segue existência da reserva) | conferir documento gerado na saída/baixa |
| **B5** | auditoria não enxerga a ficha (187) | ⬜ PCP/Ordens (não documentado) | rastrear auditoria de loja × ficha PCP (mig `186`/`183`) |
| **B7** | ponteiro de ordem morto (22) | ⬜ Ordens | achar FK/ponteiro órfão ordem↔venda/pcp |
| **B1** | friso fantasma (154 fichas) | ⬜ Produtos/Pedras (`ehPedraSolta`, CLAUDE.md) | reproduzir o "friso" indevido na ficha |
| **B3** | fila do Tiny travada (180) | ⬜ Fiscal/Sync (`fila_sync_externo`, CLAUDE.md) | ver itens presos em `fila_sync_externo` + agendador |
| **B9** | trava de venda duplicada | `comercial.md §5` + `docs/stories/3.5.guard-duplicacao-*` | conferir guard de duplicação no fechamento |
| **B8** | filtro que voltou no merge | regressão de merge | `git log`/`blame` do filtro que reverteu |
| **B6** | (não nomeado — ver 0.4) | — | confirmar com o chefe |

### 🟡 Decisões do Alisson — TASK 3 (bloqueiam código)
1. Política de **sobra de pagamento** (overpayment fora do vale-troca).
2. Ordem canônica da **V-15282**.
3. Política de **cancelar ordem com ouro** já apontado.
4. **Agendador** da fila do Tiny (B3).
5. Regra exata **desconto × forma de pagamento**: 21–30% Pix/dinheiro = automático? >30% = quem aprova? *(amarra com 3.A e com `getDescontoThreshold` em `aprovacao-regras.ts:227` — hoje 15/30/50 por role.)*

### ⬜ Pré-requisito
Os bugs que tocam PCP, Ordens, Devolução e Financeiro precisam dessas regras **documentadas** antes do código (regra de ferro, 0.1).

---

## TASK 4 — Terminar a auditoria do ERP
> Read-only, risco zero. A própria task é diagnóstico.

- **Escopo:** purificação/refino; **cofre de ouro paralelo** (`cofre_ouro_rastreios`); metal/compras; entradas avulsas (EA/Sangria/Liga); + interior do PCP (quebra/PMC/dupla-entrada), financeiro, fiscal/sync (Tiny), acesso/permissões.
- **🔴 Prioridade dentro da TASK 4:** o *"segundo livro de ouro sem rastro"* (`cofre_ouro_rastreios`). Se há **dois razões de ouro** fora do principal, isso é **fonte-dupla-de-verdade** — risco patrimonial maior que vários itens da TASK 1. Auditar **primeiro** e bater contra o razão principal (`movimentacoes_estoque`).
- **Método:** rastrear cada loop ponta-a-ponta; separar bug de regra de negócio; verificação adversarial dupla; **cada módulo termina capturando a regra dele** em `docs/regras-negocio/` (fecha o 0.1) + relatório frio + % de confiança + lista de tasks no formato deste backlog.

---

## Próximos passos sugeridos
1. **Capturar com o Jonathan** as regras de Metal/Ouro, Estoque, PCP (e as que a TASK 4 abrir) — destrava TASK 1 e parte da TASK 3.
2. **Reconfirmar em prod (read-only, assinado):** saldos negativos de ouro; contagens dos bugs (187, 154, 22, 16, 12, 180); estado real das travas de saldo (1.4) e dos GRANTs REST (1.6).
3. **Reconstruir os 11 bugs** (3.B) — uma rodada de investigação por bug, virando spec acionável.
4. Confirmar com o chefe **o que é o B6** (0.4).

> **Ordem geral recomendada por risco↓/valor↑:** TASK 2 (build-gate — barato, protege tudo) → TASK 1.2/1.3 (auditoria + append-only do ouro — seguro) → TASK 3.A (cartão) → captura de regras → demais.
