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

**`podeDecidir` real conferido (sem mock) contra homolog:**
- `credito_gerente` → **Germana Valentim** (`aprovadora_credito_gerente`) pode; Rafael QA não.
- `credito_diretor` → **Rafael QA tester** (`aprovador_credito_diretor`) pode; Germana não.

**Vendas reais com fluxo de crédito ativo** (pra você abrir e ver o estado real na tela):
| venda_id | numero | situação | tipo |
|---|---|---|---|
| 30166 | 15491 | aprovado | diretor |
| 30162 | 15487 | aprovado | gerente |
| 30158 | 15483 | aprovado | gerente (tarefa 268) |

- [ ] Venda com "A Receber" dentro do saldo → cria tarefa `credito_gerente`; só a Germana decide (409
  pra qualquer outro, mesmo admin).
- [ ] Acima do saldo → `credito_diretor`; só o Rafael decide.

### Entrega sem pagamento + Alteração de venda (Fase 3g.1)

**`podeDecidir` real conferido:** `entrega_sem_pagamento` → **Alisson Ranyel** pode; Jonathan (dev) não.
`alteracao_venda` → **Alisson Ranyel** pode (chave criada agora); Jonathan (dev) não.

**Exceção pendente real** na tabela `vendas_entrega_excecoes_pagamento`: **venda 29859**, status
`pendente`, solicitada pela Germana, valor em aberto R$100 — dá pra abrir e testar aprovar/rejeitar
direto (aprovador configurado = Alisson).

- [ ] Entrega sem pagamento → só o Alisson decide.
- [ ] Solicitar alteração de venda → só o Alisson decide (antes era cargo fixo `[admin,dev,diretor]`).
  **ACHADO (15/07, corrigido):** a chave `aprovador_alteracao_venda` estava VAZIA em homolog — a Fase
  3g.1 criou ela só pra testar e não deixou preenchida, ia te dar 409 de cara. Já criei com o mesmo
  aprovador dos outros fluxos (Alisson) — pode testar direto agora.

### Devolução (Fase 3e)

**`podeDecidir` real conferido:** `devolucao` → **Alisson Ranyel** pode; Jonathan (dev) não.
`devolucao_estoque` → **Jonathan Araújo** (você mesmo) pode; Alisson não.

**Sem devolução pendente em homolog** (as 31 existentes estão todas `concluido`) — pra testar esse
fluxo você precisa **criar uma devolução nova** a partir de uma venda entregue, pra ver as 2 etapas
de aprovação ao vivo.

- [ ] Etapa 1 (devolução) → só Alisson decide. Etapa 2 (estoque) → só você (Jonathan) decide.

### Metal / Conversão / Precificação / Limpeza / Compra comercial (Fases 3a-3f)
- [ ] Cada um já foi testado end-to-end nas fases individuais (ver `00-README.md`) — só reconfirmar
  que nada quebrou depois da Fase 5 (nenhum desses toca em desconto).

### Brechas fechadas (Fase 4)
- [ ] `PATCH /api/tarefas/[id]` com `status:"aprovada"` numa tarefa formal → 409 (backdoor fechado).
- [ ] `aprovar-desconto` (rota antiga) → 404 (arquivo apagado).
- [ ] Compra comercial com chegada prévia → aprovar → não duplica `contas_pagar` nem estoque.

### Conversão Reversa (feature independente, PR#94 — alinhada ao padrão nesta sessão, 16/07)

Essa feature nasceu numa branch separada (`feat/conversao-reversa`) e já foi mergeada em `main`
ontem, SEM usar a camada `src/lib/aprovacoes/` — tinha um fallback próprio pra admin/desenvolvedor
quando a config estava vazia, violando a política config-first. Corrigido nesta branch (commit
`dfce3331`) trazendo o `main` atualizado pra dentro de `feat/centralizar-aprovacoes` (merge, 4
conflitos resolvidos — todos união de listas, nada perdido) e plugando `aprovar`/`recusar`/criação
no `podeDecidir`/`resolverAprovadores`.

- [ ] Abrir uma conversão reversa nova (ouro do cofre → joia) → confirma que ainda abre normal.
- [ ] Aprovar como Alisson (configurado em homolog) → passa.
- [ ] Tentar aprovar como você (admin/dev, NÃO configurado) → agora dá 403 (antes passava pelo
  fallback — **esse é o comportamento NOVO, intencional**, alinhado aos outros ~15 fluxos).
- [ ] `npx vitest run src/lib/aprovacoes` → 122/122 (era 121 — o evento novo soma 1 teste).

🔴 **Antes de mergear esta branch pra `main`**: a chave `aprovadores_conversao_reversa` está **VAZIA
em produção** (conferido 16/07, read-only). Como a conversão reversa já está ATIVA em prod com o
fallback antigo, preencher essa chave em prod é pré-requisito ABSOLUTO — sem isso, o merge quebra a
aprovação da conversão reversa em produção pra todo mundo (nem admin passa). Ver seção "Depois de
validar tudo" abaixo.

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
   - **`aprovadores_conversao_reversa` — 🔴 CRÍTICO, checado agora (16/07): está VAZIA EM PROD.**
     A Conversão Reversa (PR#94) está rodando em produção AGORA com o fallback antigo (admin/dev
     aprova mesmo sem config). Esta branch REMOVE esse fallback (alinhamento ao padrão config-first —
     ver commit `dfce3331`). **Se mergear sem preencher essa chave em prod ANTES, ninguém — nem
     admin — vai conseguir aprovar conversão reversa em produção.** Preencher é pré-requisito
     ABSOLUTO deste merge, não só recomendação.
3. Sem essas chaves em prod, os fluxos correspondentes trocam de "aprova pelo cargo" para
   `409`/403 "não configurado" — ninguém aprova nada até eu criar as chaves. **Não fazer merge pra
   main sem esse passo — em especial a de conversão reversa, que já está ativa em produção.**

## O que eu já validei sozinho (não precisa reconferir)

- `npx tsc --noEmit` → 0 erros (Fase 5, todas as fases).
- `npx vitest run src/lib/aprovacoes` → 121/121 (camada de autoridade intocada desde a Fase 1b).
- `getDescontoThreshold` chamado DIRETO (sem mock) contra 4 vendas reais de homolog (tabela acima) →
  todos os valores bateram com o cadastro esperado, confirma que a query nova funciona no schema vivo.
- `buscarLimiteDescontoCartao()` → 20 (lê a chave nova). `buscarFallbackDescontoSemCadastro()` → 0
  (lê a chave nova). Ambos chamados direto, sem mock.
- As 2 chaves de config da Fase 5 já existem em homolog (`0` e `20`).
- Linha corrompida de `desconto_acima` desativada em homolog.
- **Conferi as 15 chaves de aprovador em homolog** — 14 preenchidas, 1 vazia (`aprovador_alteracao_venda`,
  achado e corrigido nesta sessão — ver seção "Entrega sem pagamento + Alteração de venda" acima).
  Todas as outras (crédito gerente/diretor, desconto, cartão, entrega, devolução×2, compra comercial,
  conversão, precificação, limpeza, metal) já têm aprovador configurado em homolog.
- `podeDecidir` chamado DIRETO (sem mock) contra homolog pra 6 cenários: `credito_gerente` (Germana
  sim/Rafael não), `credito_diretor` (Rafael sim/Germana não), `entrega_sem_pagamento` (Alisson
  sim/Jonathan não), `alteracao_venda` (Alisson sim/Jonathan não — já com a chave corrigida acima),
  `devolucao` (Alisson sim/Jonathan não), `devolucao_estoque` (Jonathan sim/Alisson não). Todos
  bateram com o aprovador configurado — confirma que a autoridade config-first está 100% funcional
  pra esses 5 eventos, sem precisar de login real.
- Achei exemplos REAIS pra você testar direto: vendas de crédito 30166/30162/30158 (diretor/gerente),
  exceção de entrega pendente na venda 29859 (status `pendente`, real, pronta pra aprovar/rejeitar).
  Devolução não tem pendente real em homolog (as 31 estão `concluido`) — precisa criar uma nova.
- Front carrega sem erro de compilação/console (`/`, `/orcamento`) — validação visual completa fica
  pra você, pelos motivos explicados no topo.
