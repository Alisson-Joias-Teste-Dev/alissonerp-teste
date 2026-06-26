# Refatoração Vendas/Entregas — Ponto de Retomada

> Atualizado: 13/06/2026 (Fortaleza) · Branch: **homolog**
> Versões desta leva: **v2.62.0 → v2.66.2** · Tudo no homolog, **NADA em produção** ainda.
> Plano original aprovado: conversa de 11/06 + `docs/analise-vendas-entregas-2026-06.md`

---

## ✅ RESOLVIDO (13/06) — Reposição agora dá entrada no estoque (v2.66.2, mig 302)

A peça entra no estoque quando o **protocolo de VOLTA** conclui (gatilho
`trg_reposicao_entrada_volta`) e também pelo **botão "Concluir pelo sistema"** do master
(rota `concluir-sistema`), ambos via `fn_reposicao_entrada_estoque` (idempotente). No
físico rotula como `producao_auto`. **"Pra trás"**: Jonathan destrava as ordens travadas
clicando o botão (sem acerto de banco). Testado (rollback): volta/botão dão entrada,
idempotência (2x→1), entrega destrava, controle sem-entrada ainda dá STOCK_NEGATIVE;
tsc limpo. **Pendente:** rebuild no painel + teste manual → depois produção (migs 295-302).

<details><summary>histórico do problema (resolvido) — clique para abrir</summary>

## 🔴 (resolvido) Reposição não dá entrada no estoque

**Problema (confirmado no banco):** quando uma ordem de **reposição** é concluída, ela
**não dá ENTRADA da peça no estoque comercial** → o físico fica zerado → na hora de
entregar a venda, a baixa da reserva falha com **`STOCK_NEGATIVE: Saldo insuficiente no
almoxarifado. Item=..., Warehouse=2`**.

**Caso real:** venda 15462 (id 30104), item Corrente Cartier (produto **90000764**).
Ordem de reposição **C-2372** (id 2375) está `status='concluido'`, itens_ordem produto
90000764 qtd 1 — mas o saldo físico em `stock_ledger_entry` (warehouse 2) = **0**.

**Mecânica confirmada:** dar uma `movimentacoes_estoque_comercial` tipo `'entrada'`
(warehouse 2) **já alimenta o físico** via gatilho `trg_mirror_movimento_to_sle`
(fn_mirror_movimento_to_sle). Logo, a peça que falta é essa entrada na conclusão.

**Plano proposto (NÃO aprovado/codado ainda — §0):**
- **Gatilho no banco em `alissonerp.ordens`**: quando uma ordem `reposicao_venda` /
  `reposicao_loja` muda para `status='concluido'`, cria a `movimentacoes_estoque_comercial`
  `'entrada'` (produto e quantidade de `itens_ordem`, `local_estoque_id=2`,
  `status='efetivado'`). Idempotente (uma entrada por ordem). Só reposição — não toca
  fabricação/alianças. CREATE OR REPLACE, sem DROP (Database Safety §2).
- Por que gatilho: a reposição é concluída por vários caminhos (PCP, `concluir-sistema`
  forçado do master, etc.) — o gatilho pega todos.

**4 decisões PENDENTES do Jonathan (perguntadas, aguardando resposta):**
1. Quantidade da entrada = `itens_ordem.quantidade` da reposição. Confirmar que é sempre
   o que a venda precisa.
2. Reposições **sem produto identificado** (~33 de 171, ver abaixo): não dá pra dar
   entrada. O que fazer? (ex.: nem deixar concluir sem produto.)
3. Reposições **já concluídas sem entrada** (como a C-2372): precisam de acerto pontual
   pra destravar. Jonathan pediu pra eu **investigar (contar quantas são)** — FALTA fazer.
4. **Risco de entrada dobrada:** confirmar que a conclusão do PCP **não** põe a peça em
   outro lugar (senão dá entrada 2x). Jonathan pediu pra eu **checar** — FALTA fazer.

**Investigação fechada (13/06):** 36 ordens travavam entrega; só 4 tinham volta concluída
(C-1659, C-2272, C-2297, C-2305); as outras 32 (incl. C-2372) não voltaram. Risco de
dobra: zero (nada criava entrada de reposição hoje). Resolvido pela v2.66.2 acima.

</details>

---

## ✅ O que já foi feito nesta leva (Etapas 2-4 + correções de teste)

Todas as migrations abaixo foram aplicadas **só no banco de TESTE/homolog**
(`cloud.alisson.api.br:5435/postgres-homolog`), **NUNCA em produção**.

| Versão | O que |
|---|---|
| v2.62.0 | Etapa 2 — novo fluxo de status (rascunho→aprovado→em_rota→entregue; concluido/enviado aposentados). Removida `concluirVenda()` + auto-conclusão de 16 pontos (MP/PagBank/crediário/solicitações). |
| v2.63.0 (mig 297) | Trava de status (tabela `vendas_transicoes` + gatilho); baixa-na-hora do pagamento; **ponte de volta public→erp DESLIGADA** (era ela que virava 'entregue' em 'concluido' sozinho). |
| v2.64.0 | Etapa 3 — celular obrigatório p/ aprovar (approveVenda); WhatsApp do desenvolvedor (fallback) + campo em Config›Integrações. |
| v2.65.0/.1 (sem mig) | Etapa 4 — forma "Na Entrega"; aprovação direta da consultora; rota `/cobrar-entrega` + botão; "não entrega sem pagar". |
| v2.65.2 | Bloqueio de reposição passou a rodar ao MONTAR a entrega (antes do código). |
| v2.65.3 (mig 299) | Conta a receber também baixa na APROVAÇÃO (cobre o PDV: paga em rascunho, aprova depois). |
| v2.65.4 (mig 300) | Conta a receber = **saldo em aberto** (venda mista não infla o "a receber"). |
| v2.65.6 (mig 301) | Bloqueio de reposição por **STATUS** da ordem (NOT IN concluido/cancelado) — pega 'em_andamento'. |
| v2.65.7/.8 | Tela da venda mostra entrega parcial: badge no cabeçalho + por item ("Entregue X/Y"). Rota `/saldo-pendente` (+`?todos=1`). |
| v2.65.9 | **Entrega parcial baixa o entregue e divide a reserva** (a baixa seguia `controla_estoque`, agora segue a existência da reserva). |
| v2.66.0 | **Trava de reposição POR ITEM** (não trava a venda toda; só o item em reposição). Vínculo pelo produto de `itens_ordem` (cobre 138/171 = 81%); sem produto → trava venda inteira. |
| v2.66.1 | Entrega "total" não exige o item da reposição (pula os bloqueados). `calcularSaldoPendente` retorna `produtoId`. |
| (sem versão) | Badge "Entregue" movido pra coluna Qtde (estava escondido pelo `truncate` do nome). Commit ba2ef276. |

**Migrations 298:** fix da trava de códigos que barrava retirada na loja.

**Migrations para PRODUÇÃO (quando o Jonathan aprovar tudo):** **295, 296, 297, 298,
299, 300, 301, 302**. Só aplicar em produção após o teste manual + aval explícito do
Jonathan.

---

## ⚙️ AMBIENTE — fatos críticos pra não esquecer

- **Gatilhos http DESLIGADOS no banco do homolog** (12/06, autorizado): o homolog não tem
  a função `http_post` (prod tem). 9 gatilhos de notificação externa (n8n/Tiny/webhooks
  supabase) quebravam toda mudança de status. Desligados via `ALTER TABLE … DISABLE
  TRIGGER` em: `trg_notificar_n8n`(vendas), `notify_n8n_solicitacao_vale_troca`, Webhook
  Contatos Tiny, `trg_webhook_novo_produto`, `on_product_update`, `trg_notifica_estoque`,
  `trigger_nova_ordem`(directus.ordens), `webhook_estoque_insert/update_seguro`.
  ⚠️ **NÃO replicar em produção.** Se o homolog for re-restaurado do dump, **REAPLICAR**.
- **Deploy:** mudança de **código** (front/backend) só vale na tela do homolog após
  **rebuild** no painel. Mudança de **banco** (migration/psql) vale na hora.
- **Banco de teste/homolog:** `.env.test.local` e `.env.homolog` (mesmo DB). Produção:
  `.env.production.local`. psql via WSL (ver memory `reference_psql_wsl`).
- **Teste E2E:** `docs/teste-e2e-vendas.sql` (22 asserções, todas PASS). Rodar antes de
  declarar pronto. **Sempre testar os fluxos no banco antes de entregar** (memory
  `feedback_testar_antes`).

## ⚠️ Pendências de limpeza antes de produção
- **~23 reservas órfãs**: 24 produtos têm `estoque_comercial_config.ativo=true` +
  `controla_estoque=false` → criaram reservas que a baixa antiga não resolvia. O código
  novo (v2.65.9) não gera mais órfãs, mas as antigas precisam de limpeza.
- **Suíte vitest:** ~105 falhas PRÉ-EXISTENTES no HEAD (rate-limit/mocks desatualizados),
  não relacionadas a esta leva.
- **Outra sessão/agente** mexe no mesmo repo homolog em paralelo (apareceu fix de compras
  v2.65.5 que não foi este trabalho). Fazer `git pull --rebase origin homolog` antes de
  push.

## Decisões do Jonathan já firmadas (NÃO re-perguntar)
- Status: rascunho → aprovado → em_rota → entregue (+cancelado). SEM concluido/enviado novos.
- Pagamento quitado NÃO muda status (só muda na entrega). Pago → conta a receber "pago" na hora.
- Venda mista: conta a receber = só o saldo em aberto.
- Celular obrigatório p/ aprovar. WhatsApp do cliente falhou → manda pro WhatsApp do dev.
- "Na Entrega": consultora aprova direto; não entrega sem cobrar; atendente registra a forma real.
- Reposição trava a entrega POR ITEM (item espera, prontos saem); critério = `ordens.status`.
- Entregue/concluido = ponto final (estorno não desfaz).
- Produção das migrations só após teste manual + aval explícito. Push na main pede autorização.
