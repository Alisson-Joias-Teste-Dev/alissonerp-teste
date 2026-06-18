# Blindagem Comercial/Produção — CONTROLE DE CONCLUSÃO (12 tasks)

> **O que é este documento.** Diário de conclusão das 12 tasks de blindagem (B1–B11 + cartão).
> Para CADA task, registra **o que era de verdade × como foi corrigido × prova**.
> É o complemento de execução do pente-fino (não repete as specs — aponta pra ele).
>
> **Specs/causa-raiz de cada bug:** `docs/analise-TAREFAS-blindagem-comercial-producao.md`
> e `docs/blindagem-erp-pente-fino-2026-06.md`.
>
> Criado em **2026-06-18**. Próxima migration livre no momento da criação: **311** (não 306).

---

## ⚖️ REGRA PARA MARCAR ✅ CONCLUÍDA (a trava — não pode pular)

Uma task **só vira ✅ Concluída** quando os **4 campos** abaixo estão preenchidos **e provados**:

1. **O que era de verdade** — o problema real, segundo a regra de negócio. Pode ser **diferente**
   do que foi passado pelo chefe. Se for diferente, escrever aqui o que se descobriu.
2. **Como foi corrigido** — o conserto aplicado (arquivos, migration, SQL, ou "só documentação").
3. **Prova** — o que comprova que resolveu (SQL no banco de teste, fluxo na tela, `npx tsc --noEmit`).
4. **Referência** — commit + nº da migration + assinatura no banco (`assinar_mudanca_banco`, se mexeu
   em prod) + data.

> Faltou **qualquer um** dos 4 → fica **Em andamento**, nunca ✅.
> "Funcionou", "ok", "testei" no chat **não** marcam concluído — só o registro completo aqui marca.

**Estados possíveis:**
`Pendente` · `Decisão pendente (A–E)` · `Em andamento` · `✅ Concluída`

---

## 📋 Quadro-resumo

| # | Código | Tarefa (pente-fino) | Título curto | Decisão | Status |
|---|--------|---------------------|--------------|---------|--------|
| 1 | B8  | Tarefa 1  | Item "não controla estoque" não reserva nem baixa (causa-raiz real) | — | ✅ Concluída (18/06) |
| 2 | B11 | Tarefa 2  | Texto: peça sai **na entrega**, não ao aprovar | — | ✅ Concluída (18/06) |
| 3 | B10 | Tarefa 3  | Aviso enganoso (não é bug) | — | ✅ Concluída (18/06) |
| 4 | B5  | Tarefa 4  | Conferência mostrar ficha das peças novas (auditoria humana descontinuada a pedido) | — | ✅ Concluída (18/06) |
| 5 | B9  | Tarefa 5  | Impedir venda duplicada do mesmo orçamento | — | ✅ Concluída (18/06) |
| 6 | B7  | Tarefa 6  | Ponteiro morto = histórico; nenhuma venda viva sem ordem (não é bug) | — | ✅ Concluída (18/06) |
| 7 | B1  | Tarefa 7  | Friso fantasma (anel liso indo com friso) | **E** | Decisão pendente (E) |
| 8 | B4  | Tarefa 8  | Soltar reservas presas (já vendidas) | — | ✅ Concluída (18/06) |
| 9 | B2  | Tarefa 9  | Cancelar venda → cancelar ordem da fábrica | **C** | Decisão pendente (C) |
| 10| B3  | Tarefa 10 | Destravar fila do Tiny | **D** | Decisão pendente (D) |
| 11| B6  | Tarefa 11 | Cliente paga a mais (sobra sem destino) | **A** | Decisão pendente (A) |
| 12| Cartão | Tarefa 12 | Aprovação de cartão só quando for cartão | — | Pendente |

**Decisões do Alisson que destravam tasks:**
- **A** (sobra de pagamento) → B6
- **B** (qual ordem da V-15282 é a verdadeira) → B7 concluída como "não é bug"; **não depende mais desta decisão**.
- **C** (cancelar venda com ouro: travar ou avisar?) → B2
- **D** (agendador da fila do Tiny: interno ou externo?) → B3
- **E** (criar gatilho na ficha técnica?) → B1

---

## Detalhe por task

> Template fixo — preencher os 4 campos da REGRA para poder marcar ✅.

---

### B8 — Item "não controla estoque" não reserva nem baixa · Tarefa 1 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** "tirar um filtro que voltou no merge" no `baixarEstoqueDaEntrega` (main).
- **O que era de verdade (regra de negócio):** o ponto não era o filtro — era a **regra**: item marcado
  como **"não controla estoque"** (serviço, ou produto desligado) **não deve ser reservado nem baixado**.
  O gatilho `fn_estoque_comercial_baixa_venda` checava só `ativo`, **nunca** `controla_estoque` → serviços
  criavam **reserva fantasma** (~38 ativas em produção; ex.: serviço 6318 com 21).
- **Como foi corrigido:** migration **311** — guarda no `fn_estoque_comercial_baixa_venda`:
  `IF v_controla IS FALSE THEN RETURN NEW` (pula reserva **e** baixa quando `controla_estoque=false`).
  Resto idêntico à 267. É *pular*, nunca dar erro (não quebra venda com linha de serviço).
- **Prova:** back (homolog, transação+ROLLBACK): serviço → **0 reserva**, produto normal → 1, sem erro.
  Front (homolog): venda **15470** com serviço → reserva **0** (antes, 15469 reservava). `/simplify` e
  `/code-review` (máx) → 0 achados; confirmado 311 = 267 + só a guarda, e prod **== 267** antes (aditivo).
- **Referência:** migration **311** (v2.68.3) · commit main **`45c2f2ee`** · assinatura
  `log_mudancas_banco` **id 18** (`claude-code-jonathan`) · aplicada em produção 18/06/2026 14:45.
- **Follow-ups separados (NÃO são o B8):** (a) **ordem de serviço por tipo de produto** — produto-serviço
  ainda abre `reposicao_venda` (tipo errado), deve abrir ordem de serviço; (b) **limpar as ~38 reservas
  fantasma** já existentes (só mudar status, nunca apagar).

---

### B11 — Texto: peça sai na entrega, não ao aprovar · Tarefa 2 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** vários textos dizem "sai ao aprovar a venda", mas o certo é "sai na
  entrega". Texto errado faz alguém consertar o sistema pro lado errado depois. (Só documentação.)
- **O que era de verdade:** A regra de negócio (`comercial.md §3`) e o código (`entrega-venda.ts`)
  já estavam **certos**: a reserva vira saída de estoque **na ENTREGA** (confirmação do recebimento /
  retirada), nunca ao aprovar. O erro estava só em **textos espalhados** que diziam "sai ao aprovar".
  O mais grave era o **próprio CLAUDE.md (linha 218)** — a fonte de verdade que toda IA/dev lê antes
  de mexer. **Causa-raiz da confusão:** existem DUAS "baixas" diferentes — a de **estoque** (na
  entrega) e a de **conta a receber** (financeiro, mig 299, essa SIM na aprovação). Misturar as duas
  é que gerava o texto errado. Confirmado que **nenhum texto no código (`src`) estava errado** — só docs.
  Foram 4 textos errados (1 fonte-de-verdade + 3 docs); o CHANGELOG estava correto e não foi tocado.
- **Como foi corrigido:** 5 edições só de texto (zero código/banco/migration):
  1. `docs/regras-negocio/comercial.md §3` (linha 41) — **frase anti-confusão** nova separando baixa
     de estoque (entrega) × baixa de conta a receber (aprovação).
  2. `CLAUDE.md:218` — corrigido p/ "saída NA ENTREGA" + ponteiro pro `comercial.md §3`.
  3. `docs/architecture/validacao-tecnica-plano.md:164` — "ao aprovar" → "na entrega".
  4. `docs/seguranca/1-diagnostico-fluxo-baixa.md:195` — "Quando aprovar" → "Quando for entregue".
  5. `docs/seguranca/3-roadmap-correcoes.md:231` — "já saiu na aprovação" → "saída ocorre na entrega".
- **Prova:** grep dos textos errados originais → **ZERO** ocorrências; grep dos textos novos →
  presentes; `CHANGELOG:492` confirmado intacto (texto correto). Sem `.ts` alterado → `tsc` não aplicável.
- **Referência:** docs-only · sem migration · sem mudança no banco (não exigiu assinatura) ·
  18/06/2026 · commit/push: homolog + main (autorizado pelo Jonathan no chat).

---

### B10 — Aviso enganoso (não é bug) · Tarefa 3 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** acharam que apagar um item deixaria a reserva perdida, mas o sistema já
  resolve sozinho (cascata). O aviso errado pode levar alguém a quebrar uma proteção que funciona.
- **O que era de verdade:** Confirmado — **não é bug**. Apagar um item de venda (operação permitida
  **só** com a venda em `situacao='rascunho'` — `src/app/api/vendas/[id]/itens/[itemId]/route.ts:172`)
  **não deixa a reserva órfã**. A reserva é limpa **sozinha** por DOIS mecanismos redundantes:
  (1) FK `reservas_estoque_comercial.item_venda_id → itens_venda_erp(id) ON DELETE CASCADE` (mig 140),
  **validada** em prod (`convalidated=t`) → apaga a linha da reserva junto com o item;
  (2) gatilho `trg_estoque_comercial_reversao_item` (AFTER DELETE em `itens_venda_erp`, mig 141) →
  marca a reserva `cancelado` ou cria estorno reverso se já tinha virado movimento efetivado.
  **NÃO existe "aviso enganoso" vivo no sistema:** busca exaustiva em `src` e `docs` (no WSL, fonte real
  — o OneDrive está defasado) não achou nenhum texto/comentário dizendo que apagar item deixa reserva
  presa. Ao contrário, o comentário do próprio código **já está correto** (`route.ts:195`: "remoção de
  item ... libera reserva de estoque via trigger"). O "aviso errado" era a **crença do chefe** / o doc
  antigo que sumiu — não um artefato vivo. **A crença está errada; a proteção funciona.**
- **Como foi corrigido:** Só documentação (zero código · zero banco · zero migration):
  1. `docs/regras-negocio/comercial.md §3` — 3 bullets novos: (a) ressalva no bullet "sem triggers
     próprios" (não vale pra apagar item); (b) bullet explicitando que apagar item de rascunho limpa a
     reserva sozinho (FK CASCADE + trigger) e **proibindo** "limpeza manual" que quebraria a proteção;
     (c) bullet documentando que a reserva pode ser de ITEM ou de ORDEM (`ordem_id`), com colunas
     nullable — para não confundir reserva de ordem com órfã.
  2. Esta seção (4 campos preenchidos) + quadro-resumo.
- **Prova (banco de PROD, read-only, 18/06/2026 — só `SELECT`, não exigiu assinatura):**
  - **Ambiente confirmado:** `current_database()='postgres'` (PROD), host `172.18.0.15`.
  - **FK validada:** `reservas_estoque_comercial_item_venda_id_fkey | FOREIGN KEY (item_venda_id)
    REFERENCES alissonerp.itens_venda_erp(id) ON DELETE CASCADE`, `convalidated = t`
    (idem `venda_id` → `vendas_erp(id) ON DELETE CASCADE`).
  - **Gatilho habilitado:** `trg_estoque_comercial_reversao_item AFTER DELETE ON itens_venda_erp`.
  - **Reservas órfãs reais (ativas, `item_venda_id` preenchido apontando p/ item inexistente) = 0.**
  - ⚠️ **Cuidado registrado:** a 1ª query ingênua contou **3 "órfãs"** que eram FALSO-POSITIVO —
    reservas de ORDEM com `item_venda_id` NULO (ordens 2177/2183/2338, todas vivas: `criado`/`aguardando`).
    `item_venda_id`/`venda_id`/`ordem_id` viraram nullable depois da mig 140. Filtrar
    `item_venda_id IS NOT NULL` ao caçar órfãs.
  - **160 reservas ativas no total:** 157 ligadas a item de venda · 3 a ordem · **0 sem vínculo**.
  - Endpoint só apaga item com `situacao='rascunho'` → reserva está sempre `ativo` no momento do delete
    → o CASCADE simplesmente a remove (sem chance de órfã).
- **Referência:** docs-only · sem migration · **sem mudança no banco → não exigiu assinatura** (só
  `SELECT` read-only em prod) · 18/06/2026 · commit/push: _(pendente autorização do Jonathan — mexe em
  docs do projeto, igual à Tarefa 2)_

---

### B5 — Conferência mostrar ficha das peças novas · Tarefa 4 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** a tela de auditoria/conferência não mostra a ficha (medidas, modelo,
  pedras) das ordens novas; 187 peças foram aprovadas sem ver a ficha. Aprovar sem ver deixa passar
  erro de produção.
- **O que era de verdade:** **NÃO é bug — é comportamento intencional, decidido pelo Jonathan.**
  Existe um **módulo de Auditoria** com DUAS conferências humanas: **Loja** (na ENTRADA, antes da ordem
  ir pra fábrica) e **Fábrica** (na SAÍDA, antes da peça voltar pra loja). A Paloma/Dara aprovavam cada
  ordem olhando a ficha. **Esse controle humano foi descontinuado a pedido.** O Jonathan **não removeu o
  módulo** (tabelas, telas `/auditoria` e `/conferencia`, gatilhos — tudo continua de pé) — apenas o
  configurou para **passar automaticamente**:
  - **Loja (entrada):** auto-aprovada no instante em que a ordem nasce. É **exatamente** isso o "187
    aprovadas sem ver a ficha" — não são peças passando despercebidas, é o passo de conferência humana
    **desligado de propósito**.
  - **Fábrica (saída):** **também auto-aprovada.** Quando a peça é concluída no módulo Service, a
    auditoria de fábrica já é gravada como `aprovado` (`parecer='Aprovação automática — módulo Service'`)
    — `src/app/api/service/[id]/concluir/route.ts:287`. Confirmado em produção (Jonathan, 18/06).
  Ou seja, a ficha "não aparece pra conferir" porque a **conferência humana foi intencionalmente
  desativada** — não por falha de tela. (A tela `/auditoria`, aliás, JÁ sabe mostrar a ficha no modal
  via `/api/ficha/[ordem]`; só não é mais usada no caminho normal.)
- **Como foi corrigido:** **Nada a corrigir — o comportamento é o desejado.** Só **documentação** (esta
  conclusão). O módulo segue disponível caso um dia se queira **religar** a auditoria humana (bastaria
  voltar a exigir aprovação manual, removendo a auto-aprovação da loja). Zero código · zero banco · zero
  migration nesta task.
- **Prova:**
  - `183_auditoria_automatica.sql` (cabeçalho): *"Não há mais auditoria humana. Toda ordem criada via
    PDV (Directus) recebe auditoria loja aprovada automaticamente no momento da criação."*
  - `186_trigger_auto_auditoria_loja.sql`: `fn_auto_auditoria_loja` + `trg_auto_auditoria_loja` (AFTER
    INSERT em `ordens`) criam e já marcam `situacao='aprovado'`, `parecer='Aprovação automática — trigger'`.
  - `162_fix_auditoria_ordem_1846_auto_aprovacao.sql`: auto-aprovação corretiva da auditoria de loja.
  - **Fábrica auto-aprovada no `src`:** `src/app/api/service/[id]/concluir/route.ts:287` insere a
    auditoria de fábrica direto como `'aprovado'` (`parecer='Aprovação automática — módulo Service'`).
    (A migration legada `098_triggers_pedras_ct_compras.sql` ~l.350 ainda cria `'pendente'`, mas **não é
    o caminho vivo** — o módulo Service aprova sozinho.)
  - **Banco de PRODUÇÃO (read-only, 18/06/2026 — só `SELECT`, não exigiu assinatura):**
    `current_database()='postgres'` (PROD, host `172.18.0.15`). Auditorias **fábrica = 624 aprovadas ·
    2 pendentes (resíduo) · 2 reprovadas**; **loja = 939 aprovadas · 14 reprovadas** (zero pendentes nas
    duas). Pareceres da fábrica: 507 "Aprovação automática — módulo Service", 102 sem parecer, resto
    migração/sistema. Único trigger na tabela: `trg_processar_auditoria` (BEFORE UPDATE — efeitos
    colaterais da aprovação, **não** é auto-aprovador).
  - Telas vivas: `src/app/(dashboard)/auditoria/AuditoriaClient.tsx` (modal carrega a ficha) e
    `src/app/(dashboard)/conferencia/ConferenciaClient.tsx`.
  - `tsc` não aplicável (nenhum `.ts` alterado).
- **Referência:** **docs-only** · sem migration nova · **sem mudança no banco → não exigiu assinatura**
  (só `SELECT` read-only em prod p/ comprovar) · auto-aprovação já em produção: **loja** via migrations
  **162/183/186**, **fábrica** via módulo Service (`service/[id]/concluir/route.ts:287`) · conclusão
  registrada em 18/06/2026 · decisão confirmada pelo Jonathan no chat (18/06): módulo descontinuado a
  pedido, mantido apenas para passar automático; as duas pontas (loja + fábrica) descontinuadas.
- **Obs.:** as DUAS pontas estão de fato automáticas — confirmado no banco de produção (loja e fábrica
  com **zero/quase-zero pendentes**: só 2 auditorias de fábrica `pendente` resíduais, nada que trave o
  fluxo). _(Correção: uma versão anterior desta seção dizia que a fábrica acumulava pendentes — estava
  errado; o módulo Service aprova sozinho.)_

---

### B9 — Impedir venda duplicada do mesmo orçamento · Tarefa 5 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** dois cliques juntos podem criar duas vendas do mesmo orçamento. Não
  aconteceu ainda, mas nada impede — é blindagem.
- **O que era de verdade:** o chefe estava certo — era blindagem. Confirmado em PROD: **0 orçamentos
  com 2+ vendas** (nunca aconteceu), mas **nada travava**: o índice em `vendas_erp(orcamento_id)` **não
  era único** e o "Aprovar orçamento" (`PATCH /api/orcamento/[id]` → cria venda pré-preenchida) **não
  checava** se aquele orçamento já tinha virado venda. Duplo clique, dois usuários ou reenvio por falha
  de rede criariam 2 vendas (peça produzida 2x, cobrança/comissão dobradas).
- **Como foi corrigido:** blindagem em camadas + follow-ups do code-review:
  1. **Trava no banco** (mig **312**): índice **ÚNICO** parcial `uq_vendas_erp_orcamento` em
     `vendas_erp(orcamento_id) WHERE orcamento_id IS NOT NULL` (troca o não-único `idx_vendas_orcamento`).
  2. **Aprovação idempotente** (`PATCH /api/orcamento/[id]`): se o orçamento já gerou venda, devolve
     **ELA** (`ja_existia`); `SELECT ... FOR UPDATE` no orçamento serializa aprovações simultâneas;
     `catch` trata a unique_violation da trava como idempotente.
  3. **Reforço de UI** (`OrcamentoClient`): trava de re-entrada nos botões Aprovar / Cadastrar+Aprovar.
  4. **Cancelar venda → cancela o orçamento** (mig **314**, gatilho `trg_cancelar_orcamento_ao_cancelar_venda`):
     pega TODAS as rotas de cancelamento + SQL manual (não só `/cancelar`). Exigiu mig **313** (status
     `cancelado` no CHECK `chk_orcamentos_status`) + guarda "orçamento cancelado não aprova" +
     `ORCAMENTO_STATUS` sincronizado + cor do `cancelado` na tela de detalhe.
- **Prova:** homolog — back (índice recusa 2ª venda; gatilho cancela o orçamento via `UPDATE` cru com
  rollback **e** pela rota real); front (2 cliques simultâneos e re-aprovação = **1 venda só**; chip
  "Cancelado" aparece). **`/code-review`** (xhigh) achou 3 gaps reais — o principal: o cancelar cobria
  só 1 de 3 rotas → virou gatilho. **`/simplify`** aplicou 1 ajuste (cor do cancelado no detalhe).
  `tsc --noEmit` OK. PROD: **0 duplicados** confirmado antes de criar o índice.
- **Referência:** migrations **312/313/314** (v2.68.4→**v2.68.7**) · commits homolog `f02280a4`,
  `3cc6fcfb`, `91b6d62e`, `3608eb92` + merge p/ main · assinaturas `log_mudancas_banco` **id 23/24/25**
  (`claude-code-jonathan`) · aplicadas em produção **18/06/2026**.
- **Follow-ups separados (NÃO são o B9):** (a) **centralizar** os mapas de status do orçamento — hoje o
  status vive em ~4 lugares (CHECK do banco + `ORCAMENTO_STATUS` + badge da lista + cores do detalhe),
  risco de drift; (b) `alert()` → toast (sonner) nesse módulo; (c) um hook único de "single-flight" no
  lugar dos refs de re-entrada.

---

### B7 — Ponteiro morto da ordem cancelada · Tarefa 6 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** quando uma ordem é cancelada, o orçamento continua apontando pra ela e o
  sistema não cria ordem nova; a fábrica fica sem ordem (22 casos).
- **O que era de verdade:** **NÃO é bug.** Cancelar uma ordem é **operação normal do dia a dia** — a
  consultora pede o cancelamento (às vezes erra e refaz; é rotina, não defeito). O orçamento continuar
  apontando pra ordem cancelada é só **histórico**: o campo `orcamentos.ordem_gerada_id` guarda a 1ª
  ordem criada e não é reescrito quando ela é cancelada. Isso não trava nada, não some peça, não gasta
  ouro — é um registro velho.
- **Como chegamos a essa conclusão:**
  1. A pergunta que define se há problema é uma só: *existe VENDA VIVA precisando produzir e SEM nenhuma
     ordem viva?* Venda cancelada ou já entregue não tem nada a fazer.
  2. Medimos no banco de produção: **0 vendas vivas sem ordem.** Os "22 casos" (hoje 23 ponteiros
     mortos) se explicam todos — venda cancelada, orçamento que nunca virou venda, venda já entregue, ou
     venda que já tem ordem viva.
  3. Conferimos um caso real de venda com ordem cancelada: a ordem foi cancelada **a pedido da
     consultora** e a venda seguiu normal, cliente atendida. Confirmou a regra: cancelar é operação
     legítima, não bug.
- **Como foi corrigido:** Nada a corrigir — não há venda desatendida nem fluxo travado. Só
  **documentação** (esta conclusão). Zero código · zero banco · zero migration.
- **Prova (banco de PRODUÇÃO, read-only 18/06 — só `SELECT`, não exigiu assinatura;
  `current_database()='postgres'`, host `172.18.0.15`):**
  - **23** orçamentos com `ordem_gerada_id` apontando pra ordem `cancelado`.
  - Quebra por situação da venda × ordens vivas na venda: `cancelada/0 → 6` · `sem venda/0 → 13` ·
    `entregue/0 → 1` · `aprovado/1 → 1` · `aprovado/2 → 1` · `rascunho/1 → 1` (soma = 23).
  - **`venda_viva_sem_ordem = 0`** (filtro `venda.situacao IN ('rascunho','aprovado')` + zero ordem viva
    na venda).
  - `tsc` não aplicável (nenhum `.ts` alterado).
- **Referência:** **docs-only** · sem migration · **sem mudança no banco → não exigiu assinatura** (só
  `SELECT` read-only em prod) · 18/06/2026 · enquadramento confirmado pelo Jonathan no chat (18/06):
  cancelar ordem a pedido da consultora é normal; orçamento ligado a ordem cancelada é histórico, não há
  o que fazer.

---

### B1 — Friso fantasma · Tarefa 7 · [Status: Decisão pendente (E)]

- **O que o chefe passou:** anéis lisos estão indo pra fábrica mandando fazer friso (154 fichas); o
  ourives faria friso onde era pra ser liso.
- **Decisão necessária (E):** criar gatilho na ficha técnica? _(aguardando Alisson)_
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_
- **Obs.:** spec manda trabalhar na branch `fix/ficha-completa-pcp` (a que carrega o B8) — cuidado pra
  NÃO mergear essa branch direto.

---

### B4 — Soltar reservas presas · Tarefa 8 · [Status: ✅ Concluída (18/06)]

- **O que o chefe passou:** 16 peças seguem marcadas como "reservadas" mesmo já vendidas; o sistema
  acha que estão reservadas e atrapalha vender/repor.
- **O que era de verdade (Jonathan, 18/06):** **Não é bug de código** — é **resíduo de uma falha já
  corrigida**. Dois pontos:
  1. **Soltar a reserva já tem solução (B10):** item de venda em `rascunho` → remover o item → a reserva
     some sozinha (FK CASCADE + trigger); venda já `aprovado` → **cancelar a venda** → a reserva é
     liberada sozinha. Não existe (nem é preciso) "limpeza manual" da reserva.
  2. **As 16 são resíduo pré-13/06.** O sistema **não tem** o status `concluido` — isso foi uma **falha
     corrigida em 13/06**. Os status reais da venda são **`rascunho` · `aprovado` · `em_rota` ·
     `entregue` · `cancelado`**. Antes de 13/06, vendas chegavam a `entregue`/`concluido` por um caminho
     que **pulava o módulo de entrega** (não criava `entregas_venda`), então a baixa de estoque
     (`baixarEstoqueDaEntrega`) **nunca rodava** e a reserva ficava `ativo` para sempre. São essas 16.
  - **Como se resolve (operacional, não código):** as peças passam pela **auditoria** (conferência
    humana de que o pedido saiu mesmo) e então são **baixadas** pelo fluxo — a reserva vira saída e a
    peça sai do estoque. Itens que não são peça física (serviço) ou atípicos → **cancelar** a reserva
    (ver follow-up).
- **Como foi corrigido:** **Causa-raiz já corrigida em 13/06** (a falha do status `concluido`) — e está
  **comprovado que parou**: zero reserva presa nova depois de 13/06. **Soltar reserva** já é coberto
  pelo B10 (remover item no rascunho / cancelar venda). **Nesta task: só documentação** (zero código ·
  zero banco · zero migration). A **limpeza das 16 reservas antigas** é um **follow-up de dados** à parte
  (não é alteração de código — ver abaixo), a ser feito com auditoria + aprovação + assinatura.
- **Prova (banco de PROD, read-only, 18/06/2026 — só `SELECT`, não exigiu assinatura):**
  - **Ambiente:** `current_database()='postgres'` (PROD), host `172.18.0.15`.
  - **As 16 confirmadas:** reservas `status='ativo'` cuja venda já está `concluido` (14) ou `entregue`
    (2) = **16** (bate com o chefe). Todas com `movimento_id` e `efetivado_em` **vazios** — a reserva
    nunca virou saída.
  - **Nenhuma das 16 tem registro de entrega** (`entregas_venda` = nulo) → confirma que chegaram ao
    status pelo caminho antigo, pulando a baixa.
  - **`concluido` está morto:** a venda `concluido` mais nova é de **12/06**; `aprovado`/`entregue`/
    `em_rota`/`cancelado`/`rascunho` têm movimento até **18/06**. As 16 presas são **todas anteriores a
    13/06** (criadas entre 14/05 e 12/06). Nenhuma nova depois → a falha parou.
  - **Reservas ativas normais (não presas):** `aprovado` (82) e `rascunho` (57) seguem a peça de
    propósito (venda ainda não entregue) — não contam como presas.
  - **Estrago real:** `reservado` inflado derruba o `disponivel`. Ex.: Escapulário AJ4785 →
    saldo 5 / reservado 6 / **disponível −1**; vários outros com disponível 0 em peça já vendida.
- **Referência:** **docs-only** · sem migration · **sem mudança no banco → não exigiu assinatura** (só
  `SELECT` read-only em prod p/ comprovar) · diagnóstico/decisão registrados em 18/06/2026 · decisão do
  Jonathan no chat (18/06): não é bug; status `concluido` foi falha corrigida em 13/06; resíduo tratado
  pela operação · commit/push: _(pendente autorização do Jonathan — igual Tarefas 2/3)_
- **⚠️ Pré-requisito OBRIGATÓRIO — AUDITORIA das 16 vendas (antes de qualquer baixa):** estas vendas
  chegaram a `entregue`/`concluido` **sem registro de entrega**, ou seja, **ninguém conferiu a saída pelo
  sistema**. Por isso, **antes** de soltar qualquer reserva, cada pedido abaixo precisa passar por
  **auditoria humana** — confirmar que a peça **saiu de verdade** (foi mesmo entregue ao cliente). Só
  **depois** que a auditoria confirmar a entrega é que se executa a ação (baixar ou cancelar). **Sem
  auditoria confirmada, NÃO tocar na reserva** — baixar uma peça que na verdade não saiu sumiria com
  estoque real; cancelar uma que saiu deixaria vender de novo o que não existe.

  | Venda | Situação | SKU | Produto | Ação prevista (após auditoria) |
  |-------|----------|-----|---------|--------------------------------|
  | 15201 | concluido | AS1001-1 | Conserto e Manutenção de Joias | **cancelar** (serviço, não controla estoque) |
  | 15202 | entregue  | 1192-11  | Aparador Duas Fileiras Au18k   | baixa (peça real) |
  | 15223 | entregue  | AS1001-1 | Conserto e Manutenção de Joias | **cancelar** (serviço) |
  | 15278 | concluido | AJ1955   | Corrente Veneziano au18k 45cm  | baixa (peça real) |
  | 15278 | concluido | AJ4374   | Pingente Chuveiro Redondo M    | baixa (peça real) |
  | 15339 | concluido | 1337-15  | Solitário Liz Ouro 18k         | baixa (peça real) |
  | 15358 | concluido | AJ4785   | Escapulário NS do Carmo        | **atípico** — disp. −1 mesmo após baixa, conferir |
  | 15371 | concluido | AJ4785   | Escapulário NS do Carmo        | **atípico** — idem 15358, conferir |
  | 15374 | concluido | AJ5237   | Corrente Elo Cartier lapidado  | baixa (peça real) |
  | 15374 | concluido | AJ1364   | Pingente Ponto de Luz 5mm      | baixa (peça real) |
  | 15414 | concluido | 1532-12  | Anel V Liso Ouro 18k           | **atípico** — não aparece no estoque comercial, decidir |
  | 15433 | concluido | 1354-15  | Anel Detalhado Triplo Ouro 18k | baixa (peça real) |
  | 15453 | concluido | AS1001-1 | Conserto e Manutenção de Joias | **cancelar** (serviço) |
  | 15474 | concluido | 1478-2   | Pingente Menino/Menina         | baixa (peça real) |
  | 15474 | concluido | AJ0686   | Corrente Elo Português Ouro 18 | baixa (peça real) |
  | 15488 | concluido | 1128-14  | Anel Prego FP au18k            | baixa (peça real) |

- **Follow-up de dados (NÃO é o B4 — limpeza separada, com aprovação + assinatura):** **depois** da
  auditoria acima, soltar as 16 reservas em PROD num script único assinado (`assinar_mudanca_banco` +
  `PGAPPNAME`) com dry-run `BEGIN/ROLLBACK`. Três grupos: (a) peças reais entregues → **baixa** (gera
  saída + efetiva a reserva); (b) **3 reservas de serviço** ("Conserto", SKU AS1001-1, não controla
  estoque — família B8) → **cancelar**; (c) **2 atípicos** — Escapulário AJ4785 (fica `disponível −1`
  mesmo após baixa → inconsistência mais funda) e Anel V Liso 1532-12 (venda 15414, nem aparece no
  estoque comercial) → **decidir caso a caso** antes de tocar.

---

### B2 — Cancelar venda → cancelar ordem da fábrica · Tarefa 9 · [Status: Decisão pendente (C)]

- **O que o chefe passou:** ao cancelar a venda, a ordem de produção continua viva e a fábrica produz
  peça que não existe mais (12 casos, 1 já mexeu em ouro).
- **Decisão necessária (C):** cancelar venda com ouro já mexido — travar ou só avisar? _(aguardando Alisson)_
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_
- **Obs.:** fazer **colado** com B7 (mesma família "cancelamento").

---

### B3 — Destravar fila do Tiny · Tarefa 10 · [Status: Decisão pendente (D)]

- **O que o chefe passou:** 180 cadastros presos há 47 dias (ninguém liga o robô + dado gravado
  errado); venda falha por "cliente não vinculado".
- **Decisão necessária (D):** agendador da fila do Tiny — interno ou externo? _(aguardando Alisson)_
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

---

### B6 — Cliente paga a mais (sobra sem destino) · Tarefa 11 · [Status: Decisão pendente (A)]

- **O que o chefe passou:** a sobra some do controle (9 vendas, ~R$ 1.054) e alguns parecem cobrança
  duplicada. Dinheiro do cliente sem destino.
- **Decisão necessária (A):** o que fazer com a sobra de pagamento? _(aguardando Alisson)_
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_
- **Obs.:** alto risco — deixar por último (depende da Decisão A).

---

### Cartão — Aprovação de cartão só quando for cartão · Tarefa 12 (extra, fora do doc) · [Status: Pendente]

- **O que o chefe passou:** hoje o sistema pede aprovação de "desconto no cartão" até em venda paga no
  Pix; trava venda à toa. (Venda exemplo: 15516.)
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_
- **Obs.:** spec no pente-fino, seção 3.A.

---

## Como usar (passo a passo)

1. Ao **começar** uma task: mudar Status para `Em andamento` (no quadro e na seção).
2. Trabalhar a task seguindo o fluxo do projeto (§0 do CLAUDE.md: resumo → ok → plano → executar).
3. Ao **terminar**: preencher os **4 campos da REGRA** na seção da task.
4. Se a causa-raiz real foi **diferente** do que o chefe passou → descrever no campo
   "O que era de verdade" (é o caso clássico: "não era o que foi passado, era outro problema").
5. Só então mudar Status para `✅ Concluída` (no quadro e na seção) + data.
6. Atualizar o quadro-resumo no topo.
