# Dashboard Comercial — Vendas Duplicadas (Diagnóstico, Causa-Raiz e Correção)

> **Data:** 15/06/2026 · **Ambiente:** produção (host `172.18.0.15`, db `postgres`)
> **Status:** ✅ **CORRIGIDO E APLICADO EM PRODUÇÃO** (migration 304, assinada no livro — registro nº 2).
> **Autor da investigação:** sessão de manutenção (Claude Code, autorizado por Jonathan).

---

## 0. Resumo executivo (sem jargão)

A Dashboard Comercial estava mostrando **vendas em dobro** — cada venda nova aparecia **duas vezes**:
uma vinda do **sistema novo** (onde a venda é realmente feita hoje) e outra de uma **cópia** numa
**tabela antiga**.

- **Impacto (junho/2026):** **44 vendas duplicadas = R$ 166.648** a mais.
  Faturamento aparecia **R$ 638.571,99**; o correto é **R$ 471.923,99**.
- **Causa:** o banco cria automaticamente uma **cópia** de cada venda numa tabela antiga
  (`public.vendas`), e a Dashboard não reconhecia essa cópia como a mesma venda — então contava as duas.
- **Por que voltava todo mês:** a Dashboard reconhecia "é a mesma venda" pelo **código do Tiny /
  número do pedido**, que **mudou** durante a refatoração. Toda mudança quebrava o reconhecimento de
  um jeito novo → remendo atrás de remendo (migrations 182, 246, 290…).
- **Correção definitiva (aplicada):** reconhecer pelo **vínculo fixo interno** (`public_venda_id`),
  que **não muda**. Esconde a cópia **só quando a venda gêmea do ERP é recente** (do presente) —
  então as **vendas antigas pré-ERP continuam aparecendo** (preserva a comparação ano a ano).
- **Fonte única de verdade:** `alissonerp.vendas_erp` + `alissonerp.pagamentos_venda` (pagamentos) +
  `alissonerp.itens_venda_erp` (itens). `public.vendas`/`public.itens_venda` são **legado/espelho**.

---

## 1. O problema (com evidência)

A Dashboard lê de uma view única: **`alissonerp.vw_dash_vendas_todas`**, um `UNION ALL` de:

| Origem (`fonte`) | Tabela | O que é |
|---|---|---|
| `erp` | `alissonerp.vendas_erp` | **Sistema novo** — fonte de verdade. |
| `legado` | `public.vendas` | **Tabela antiga** — espelho/legado (Evolury/Tiny + cópia automática do banco). |

**Prova (produção, antes × depois da correção):**

| Período | Antes | Depois (corrigido) |
|---|---|---|
| jun/2026 (presente) | 145 vendas · R$ 638.571,99 | **101 vendas · R$ 471.923,99** |
| jun/2025 (ano passado — "pra trás") | 254 vendas | **254 vendas** (preservado) |
| Duplicatas residuais (2026) | — | **0** |

**Exemplo concreto** (cliente Caio César, consultora Debora Eduarda, R$ 6.450, 12/06/2026):

| | Tabela | id | número | id_api_tiny | itens |
|---|---|---|---|---|---|
| Venda real (ERP) | `alissonerp.vendas_erp` | 30023 | 15471 | 757669230 | 2 |
| Cópia fantasma | `public.vendas` | 102145 | 15496 | *(vazio)* | 0 |

A cópia tem número diferente, tiny vazio e zero itens — e é exatamente a linha apontada por
`vendas_erp.public_venda_id = 102145`.

---

## 2. Causa-raiz

### 2.1. Quem cria as cópias
A trigger **`alissonerp.fn_sync_venda_to_public`** (`AFTER INSERT ON alissonerp.vendas_erp`) espelha
cada venda nova para `public.vendas`. Como a venda nasce **sem `tiny_pedido_id`** (rascunho, antes do
Tiny), a função insere uma linha em `public.vendas` com `id_api_tiny = NULL`, `numero_pedido` novo
(diferente do ERP), **só cabeçalho (zero itens)**, e grava o vínculo em `vendas_erp.public_venda_id`.

### 2.2. Por que contava em dobro (e por que voltava todo mês)
A deduplicação da view casava **apenas** por `id_api_tiny` ou `numero_pedido`. A cópia tem tiny vazio
e número diferente → não casava → aparecia junto da venda real. Esses identificadores **mudaram**
durante a refatoração, então cada correção anterior (por tiny/número) quebrava de novo. **A view
ignorava o único vínculo estável: `vendas_erp.public_venda_id → public.vendas.id`.**

### 2.3. Os dois alimentadores de `public.vendas`
1. **Trigger `fn_sync_venda_to_public`** — cópia só do cabeçalho, sem itens, tiny vazio. **Causa da
   duplicação.**
2. **Fluxo n8n (Tiny → `public.vendas` + `public.itens_venda`)** — trazia vendas feitas direto no
   Tiny, completas (com itens), já deduplicadas pela view. **Não era a causa.**
   → **Desativado por Jonathan em 15/06/2026.**

---

## 3. A fonte correta de verdade (para a IA revisora)

> **Métricas comerciais devem se basear em `alissonerp.vendas_erp` e nas suas tabelas reais.**

| Conceito | Tabela CORRETA (usar) | Tabela LEGADA (não usar como base) |
|---|---|---|
| Venda (cabeçalho) | `alissonerp.vendas_erp` | `public.vendas` |
| Itens da venda | `alissonerp.itens_venda_erp` | `public.itens_venda` |
| Pagamentos | `alissonerp.pagamentos_venda` | `public.parcelas` / `public.parcelas_pedidos` |

### Regra fina — casing do Vale-Troca (NÃO unificar)
O `valor_vale_troca` da view é somado com **casing diferente por tabela**:
- ERP (`alissonerp.pagamentos_venda`): `forma = 'Vale-Troca'` (**T maiúsculo**).
- Legado (`public.parcelas_pedidos`): `forma_pagamento = 'Vale-troca'` (**t minúsculo**).

Unificar (deixar os dois iguais) **zera** o vale-troca de um dos lados. O card mede vale-troca
**USADO como pagamento**, não vale-troca **gerado** (são métricas diferentes).

---

## 4. A correção aplicada (migration 304)

No ramo `legado` da view, além da deduplicação antiga (mantida), foi adicionado o critério **estável**
pelo vínculo fixo:

```sql
-- Esconde a cópia legado SOMENTE quando a gêmea do ERP é recente e aparece no presente.
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve4
  WHERE ve4.public_venda_id = v.id
    AND ve4.situacao IN ('aprovado','em_rota','enviado','entregue','concluido')
    AND ve4.data_venda >= '2026-04-23'
)
```

**Por que com o filtro `data_venda >= '2026-04-23'` (cutoff do ERP):** quase TODA venda antiga também
tem `public_venda_id` (foram migradas). Excluir por `public_venda_id` **puro** apagaria o histórico
(testado: removeria 254 vendas de jun/2025 e 14.512 pré-ERP). O filtro de data garante que só a
**cópia de venda recente** (a duplicata real) é escondida; a venda antiga, cuja gêmea é pré-cutoff,
**continua aparecendo**.

**Validação em produção (antes de aplicar, somente leitura):**
- jun/2026: 145 → 101 vendas · R$ 638.571,99 → R$ 471.923,99
- jun/2025: 254 → **254** (histórico preservado)
- duplicatas residuais: **0**

**Natureza:** mudança de **exibição** (view). Não apaga dados. **Reversível** — snapshot da definição
anterior salvo em `docs/rollback-vw_dash_vendas_todas-pre304.sql`. Aplicada direto em produção (decisão
do Jonathan: só exibição, sem refatoração de risco) e **assinada** no livro de mudanças (ver §6).

**Bônus:** a migration 304 também **captura no código** a definição real da view (que estava **editada
manualmente direto no banco** — divergência banco × git). A partir de agora a view existe em migration.

---

## 5. Itens conhecidos e DECISÃO de não tratar agora (transparência)

Identificados nesta investigação e **conscientemente adiados** (não é descuido):

1. ~~**Telas de "mais vendidos" / análise de estoque** leem só `public.vendas` +
   `public.itens_venda`~~ — **QUITADO em 18/08/2026 (v2.83.9):** as 3 rotas
   (`gestao-estoque/produtos`, `oportunidades-fabricacao`, `vendas-semanais`) agora
   unem legado + `vendas_erp`/`itens_venda_erp` com dedup de espelhos, via fonte
   única `src/lib/gestao-estoque/vendas-sql.ts` (mesmo critério da
   `vw_dash_vendas_todas`).
2. **Join quebrado em Orçamento:** `api/orcamento` faz `LEFT JOIN public.vendas ON
   v.id = o.venda_gerada_id`, mas `venda_gerada_id` guarda **id de `vendas_erp`** (77/77 batem no ERP,
   0 no `public.vendas`). Bug latente, sem impacto crítico; documentado para correção futura.
3. **Cleanup opcional:** desativar a trigger `fn_sync_venda_to_public` para parar de **criar** novas
   cópias. **Não é necessário** para a Dashboard ficar correta (a correção da §4 já esconde as cópias,
   existindo elas ou não), por isso foi deixado como opcional.

---

## 6. Rastreabilidade — Livro de Mudanças no Banco (migration 303)

O token de acesso ao banco de produção é **compartilhado** (IA do Jonathan + IA do chefe). Para
atribuição, foi criado o livro append-only **`alissonerp.log_mudancas_banco`** (migration 303) + a
função `alissonerp.assinar_mudanca_banco(...)`. **Protocolo (CLAUDE.md):** assinar ANTES de qualquer
mudança; setar `application_name`. As duas mudanças desta sessão estão assinadas:

| nº | autor | agente | o que | IP |
|---|---|---|---|---|
| 1 | jonathan | claude-code | migration 303 (cria o livro) | 45.174.191.94 |
| 2 | jonathan | claude-code | migration 304 (fix dashboard duplicadas) | 45.174.191.94 |

**Regra de defesa:** mudança que aparece no banco e **não** está no livro = não foi o Jonathan.

---

## 7. Divergência Banco × Git (resolvida)

A view em produção estava **editada manualmente no banco**, sem corresponder a nenhuma migration
(combinava o formato da migration 268 + `em_rota` da 290 — combinação inexistente em arquivo). A
migration 304 captura a definição real **com o fix**, encerrando a divergência. *Forense:* todos os
commits de migration envolvidos são do próprio Jonathan; a duplicação **emergiu da refatoração** (o
ERP virou origem das vendas novas, criadas sem Tiny) sem o ajuste correspondente na deduplicação —
não há terceiro autor.
