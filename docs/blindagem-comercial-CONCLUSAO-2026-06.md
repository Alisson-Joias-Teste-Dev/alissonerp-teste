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
| 1 | B8  | Tarefa 1  | Tirar filtro errado que voltou (main) | — | Pendente |
| 2 | B11 | Tarefa 2  | Texto: peça sai **na entrega**, não ao aprovar | — | ✅ Concluída (18/06) |
| 3 | B10 | Tarefa 3  | Aviso enganoso (não é bug) | — | Pendente |
| 4 | B5  | Tarefa 4  | Conferência mostrar ficha das peças novas | — | Pendente |
| 5 | B9  | Tarefa 5  | Impedir venda duplicada do mesmo orçamento | — | Pendente |
| 6 | B7  | Tarefa 6  | Ponteiro morto da ordem cancelada | **B** | Decisão pendente (B) |
| 7 | B1  | Tarefa 7  | Friso fantasma (anel liso indo com friso) | **E** | Decisão pendente (E) |
| 8 | B4  | Tarefa 8  | Soltar reservas presas (já vendidas) | — | Pendente |
| 9 | B2  | Tarefa 9  | Cancelar venda → cancelar ordem da fábrica | **C** | Decisão pendente (C) |
| 10| B3  | Tarefa 10 | Destravar fila do Tiny | **D** | Decisão pendente (D) |
| 11| B6  | Tarefa 11 | Cliente paga a mais (sobra sem destino) | **A** | Decisão pendente (A) |
| 12| Cartão | Tarefa 12 | Aprovação de cartão só quando for cartão | — | Pendente |

**Decisões do Alisson que destravam tasks:**
- **A** (sobra de pagamento) → B6
- **B** (qual ordem da V-15282 é a verdadeira) → B7
- **C** (cancelar venda com ouro: travar ou avisar?) → B2
- **D** (agendador da fila do Tiny: interno ou externo?) → B3
- **E** (criar gatilho na ficha técnica?) → B1

---

## Detalhe por task

> Template fixo — preencher os 4 campos da REGRA para poder marcar ✅.

---

### B8 — Tirar filtro errado que voltou (main) · Tarefa 1 · [Status: Pendente]

- **O que o chefe passou:** na versão principal (main) um trecho antigo voltou e pode prender peças
  "reservadas". Hoje não afeta (main não está em uso), mas é bomba pra desarmar antes que alguém use.
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

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

### B10 — Aviso enganoso (não é bug) · Tarefa 3 · [Status: Pendente]

- **O que o chefe passou:** acharam que apagar um item deixaria a reserva perdida, mas o sistema já
  resolve sozinho (cascata). O aviso errado pode levar alguém a quebrar uma proteção que funciona.
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

---

### B5 — Conferência mostrar ficha das peças novas · Tarefa 4 · [Status: Pendente]

- **O que o chefe passou:** a tela de auditoria/conferência não mostra a ficha (medidas, modelo,
  pedras) das ordens novas; 187 peças foram aprovadas sem ver a ficha. Aprovar sem ver deixa passar
  erro de produção.
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

---

### B9 — Impedir venda duplicada do mesmo orçamento · Tarefa 5 · [Status: Pendente]

- **O que o chefe passou:** dois cliques juntos podem criar duas vendas do mesmo orçamento. Não
  aconteceu ainda, mas nada impede — é blindagem.
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

---

### B7 — Ponteiro morto da ordem cancelada · Tarefa 6 · [Status: Decisão pendente (B)]

- **O que o chefe passou:** quando uma ordem é cancelada, o orçamento continua apontando pra ela e o
  sistema não cria ordem nova; a fábrica fica sem ordem (22 casos).
- **Decisão necessária (B):** qual ordem da V-15282 é a verdadeira. _(aguardando Alisson)_
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_
- **Obs.:** fazer **colado** com B2 (mesma família "cancelamento" — ver pente-fino).

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

### B4 — Soltar reservas presas · Tarefa 8 · [Status: Pendente]

- **O que o chefe passou:** 16 peças seguem marcadas como "reservadas" mesmo já vendidas; o sistema
  acha que estão reservadas e atrapalha vender/repor.
- **O que era de verdade:** _(a preencher na conclusão)_
- **Como foi corrigido:** _(a preencher na conclusão)_
- **Prova:** _(a preencher na conclusão)_
- **Referência:** _(commit · migration · assinatura banco · data)_

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
