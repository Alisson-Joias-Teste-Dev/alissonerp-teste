# FASE 6 — Checklist de validação final (você testa, eu já validei o resto)

> Este é o roteiro pra você clicar antes do merge `feat/centralizar-aprovacoes` → `homolog` → `main`.
> Tudo abaixo já foi testado por mim (Opus) via SQL direto/miolo real contra o banco de homolog, sem
> mock — mas nenhum clique de tela real aconteceu, porque os únicos logins de teste disponíveis
> (`gerente@alisson.com`, `ourives1@alisson.com`, `pcp@alisson.com`) não são o público desses fluxos
> (consultora/gerente_loja/admin). Por isso a validação de UI é sua.

## Antes de testar

1. `cd` na worktree `alissonerp-wt-centralizar-aprovacoes` (branch `feat/centralizar-aprovacoes`, já
   tem tudo commitado — Fases 1 a 5 fechadas).
2. `.env.local` apontando pro banco de **HOMOLOG** (confirme antes — nunca teste contra prod).
3. `npm run dev` (se dev der erro por causa do Turbopack + node_modules symlinkado, rode
   `rm node_modules && cp -al ../alissonerp/node_modules node_modules` primeiro).

## O que testar — por fluxo (Fases 3-5, tudo que mudou)

### Desconto (o mais crítico — Fase 3g.3 + Fase 4 + Fase 5)

**Vendas REAIS já conferidas por mim (`getDescontoThreshold` chamado direto, sem mock, contra homolog
— use estas pra não precisar adivinhar o número esperado):**

| venda_id | vendedora | cargo | cadastro | threshold confirmado | situação |
|---|---|---|---|---|---|
| 29913 | Cristiane Bezerra | consultora | 20% | **20** | rascunho |
| 29846 | Cristiane Bezerra | consultora | 20% | **20** | rascunho |
| 30144 | Germana Valentim | gerente_loja | 30% | **30** | rascunho |
| 30183 | Germana Valentim | gerente_loja | 30% | **30** | aprovado |

- [ ] Abrir a venda **29913** ou **29846** (Cristiane, 20%) → aplicar desconto ≤20% → NÃO deve pedir
  aprovação. Aplicar >20% → botão "Solicitar Aprovação de Desconto" deve aparecer.
- [ ] Ao solicitar, cria a tarefa (chave `aprovador_desconto_padrao` = Alisson em homolog).
- [ ] Login como **Alisson** (o aprovador configurado) → aprova a tarefa → checar que
  `desconto_aprovado_por` grava e a comissão bate com a tabela de faixas (ou 0,5% se >30%).
- [ ] Login como **admin/dev** (Jonathan) → tentar aprovar a MESMA tarefa → deve dar 403 (só o
  configurado decide, nem admin passa).
- [ ] **Teste específico da Fase 5 (fallback=0)**: não achei nenhuma venda REAL de consultora sem
  cadastro no homolog (as únicas 3 sem `mx_desconto_permitido` não têm vendas vinculadas) — pra ver
  isso ao vivo, crie uma venda nova com uma consultora sem cadastro (ou zere o cadastro de uma de
  teste temporariamente) e confirme: o slider já nasce em 0% (antes mostrava 15/30/50 pelo cargo), e
  qualquer desconto > 0% pede aprovação.
- [ ] **Teste do bug corrigido**: se você (admin/dev) for a "vendedora" de uma venda de teste, o slider
  deve ir a 100% E a aprovação não deve travar em desconto alto (antes travava em 15% por bug —
  confirmado por código, não achei venda real com vendedora admin/dev pra provar ao vivo).

### Cartão (Fase 5 — limite virou config)
- [ ] Item com desconto > 20% (o valor seedado da chave `limite_desconto_cartao_pct`), forma de
  pagamento "Cartão de Crédito" → deve bloquear (409) até aprovar via `aprovador_cartao_desconto_padrao`.
- [ ] Opcional: mudar `limite_desconto_cartao_pct` pra outro valor (ex. 25) em homolog e confirmar que
  o bloqueio passa a respeitar o novo número (prova que saiu do hardcoded).

### Orçamento (Fase 5 — bug do slider travado em 0% pro admin)
- [ ] Login como admin/dev, abrir "Novo Orçamento" (aliança ou peça) → o slider de desconto deve ir até
  100% (antes desta fase, travava em 0% porque a tela não tinha exceção de cargo nenhuma).
- [ ] Login como consultora com cadastro → slider limitado ao valor do cadastro dela, igual ao de venda.

### Crédito (Fase 3g.2 — 2 aprovadores)
- [ ] Venda com "A Receber" dentro do saldo → cria tarefa `credito_gerente`; só a `aprovadora_credito_gerente`
  configurada decide (outros, 403).
- [ ] Acima do saldo → `credito_diretor`; só o `aprovador_credito_diretor` configurado decide.

### Entrega sem pagamento + Alteração de venda (Fase 3g.1)
- [ ] Entrega sem pagamento → só o `aprovador_entrega_sem_pagamento` configurado decide.
- [ ] Solicitar alteração de venda → só o `aprovador_alteracao_venda` configurado decide (antes era
  cargo fixo `[admin,dev,diretor]`).

### Devolução (Fase 3e)
- [ ] Etapa 1 (devolução) → só `aprovador_devolucao` decide. Etapa 2 (estoque) → só
  `aprovador_devolucao_estoque` decide.

### Metal / Conversão / Precificação / Limpeza / Compra comercial (Fases 3a-3f)
- [ ] Cada um já foi testado end-to-end nas fases individuais (ver `00-README.md`) — só reconfirmar
  que nada quebrou depois da Fase 5 (nenhum desses toca em desconto).

### Brechas fechadas (Fase 4)
- [ ] `PATCH /api/tarefas/[id]` com `status:"aprovada"` numa tarefa formal → 409 (backdoor fechado).
- [ ] `aprovar-desconto` (rota antiga) → 404 (arquivo apagado).
- [ ] Compra comercial com chegada prévia → aprovar → não duplica `contas_pagar` nem estoque.

## Depois de validar tudo

Se estiver tudo certo, os próximos passos são (na ordem):
1. **Merge da branch pra `homolog`** (fica lá rodando um tempo antes de ir pra main — decisão sua de
   quanto tempo).
2. **Antes do merge pra `main`/deploy em produção**: eu preciso criar em PROD (via `/dba`, assinado)
   as chaves que só existem em homolog hoje:
   - `aprovador_conversao`, `aprovador_precificacao` (Fase 3b/3c)
   - `aprovador_devolucao` (Fase 3e — `aprovador_devolucao_estoque` já existe)
   - `aprovador_alteracao_venda` (Fase 3g.1)
   - `desconto_fallback_sem_cadastro_pct`, `limite_desconto_cartao_pct` (Fase 5)
   - Desativar em PROD a mesma linha corrompida de `desconto_acima` em `tarefas_regras_aprovacao`
     que já desativei em homolog.
   - `aprovador_desconto_padrao`/`aprovador_cartao_desconto_padrao` já existem em prod mas confirmar
     que têm valor preenchido (eram decorativas antes da 3g.3, agora são lidas de verdade).
3. Sem essas chaves em prod, os fluxos correspondentes trocam de "aprova pelo cargo" para
   `409 nao_configurado` — ninguém aprova nada até eu criar as chaves. **Não fazer merge pra main sem
   esse passo.**

## O que eu já validei sozinho (não precisa reconferir)

- `npx tsc --noEmit` → 0 erros (Fase 5, todas as fases).
- `npx vitest run src/lib/aprovacoes` → 121/121 (camada de autoridade intocada desde a Fase 1b).
- `getDescontoThreshold` chamado DIRETO (sem mock) contra 4 vendas reais de homolog (tabela acima) →
  todos os valores bateram com o cadastro esperado, confirma que a query nova funciona no schema vivo.
- `buscarLimiteDescontoCartao()` → 20 (lê a chave nova). `buscarFallbackDescontoSemCadastro()` → 0
  (lê a chave nova). Ambos chamados direto, sem mock.
- As 2 chaves de config da Fase 5 já existem em homolog (`0` e `20`).
- Linha corrompida de `desconto_acima` desativada em homolog.
- Front carrega sem erro de compilação/console (`/`, `/orcamento`) — validação visual completa fica
  pra você, pelos motivos explicados no topo.
