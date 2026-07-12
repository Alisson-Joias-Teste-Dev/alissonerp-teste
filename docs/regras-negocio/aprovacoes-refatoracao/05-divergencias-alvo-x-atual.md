# Mapa de divergências — política ALVO (config-first estrita) × comportamento ATUAL

> **Fase 2, entregável 3.** Fonte: `01-dossie-dependencias.md` e `02-mapa-esbarros.md` (citações
> `arquivo:linha`), mais 4 verificações pontuais no código (marcadas abaixo) onde o dossiê não
> detalhava o mecanismo de resolução do aprovador. **Este documento só documenta — nenhuma
> divergência foi corrigida nesta fase.** Quem aprova cada mudança de comportamento é o Jonathan.
>
> Veredito: 🟢 **IGUAL** (camada replica o atual) · 🔵 **FIX INTENCIONAL** (muda de propósito,
> documentado) · 🔴 **REGRESSÃO** (mudança indesejada — nenhuma identificada pelo Sonnet; ver nota
> de atenção em `conferencia_consultora`).

## Tabela — 18 eventos

| Evento | Quem decide **HOJE** | Quem decide no **ALVO** (config-first) | Veredito |
|---|---|---|---|
| **desconto** | 3 portas com resultado diferente: (a) tarefa `tarefas/[id]/aprovacao` handler desconto — aprovador da tarefa (resolvido via `tarefas_regras_aprovacao`, não lê `aprovador_desconto_padrao`) **OU** admin/desenvolvedor por bypass (`route.ts:329`); aprova → comissão 0,5% (mapa §D, `tarefas/[id]/aprovacao:476`); (b) atalho `POST vendas/[id]/aprovar-desconto` — fixo `[admin,desenvolvedor]` (`route.ts:24`), **ignora** `aprovador_desconto_padrao` (mapa §B:33); comissão não mexe; (c) `PATCH vendas/solicitacoes-desconto/[id]` — `FULL_ROLES=[dev,admin]` (`route.ts:7,44`); comissão zera. A chave `aprovador_desconto_padrao` existe na tela Configurações (`configuracoes/aprovadores/route.ts:26`) mas **nenhuma das 3 portas a lê** — decorativa. | Só quem estiver em `aprovador_desconto_padrao`. Sem config → trava. | 🔵 FIX INTENCIONAL |
| **cartao_desconto** | Despachante de tarefas, handler cartao_desconto (`tarefas/[id]/aprovacao route.ts` ~424-434) — aprovador da tarefa **OU** admin/desenvolvedor por bypass (`:329`). ⚠️ conferir: não achei no código onde `aprovador_cartao_desconto_padrao` é lido na resolução do aprovador (a chave só aparece na tela de Configurações, `configuracoes/aprovadores/route.ts:27`) — mesmo padrão decorativo do desconto, a confirmar na Fase 3. | Só quem estiver em `aprovador_cartao_desconto_padrao`. | 🔵 FIX INTENCIONAL |
| **credito_gerente** | Config `aprovadora_credito_gerente` **COM fallback**: vazia/inativo → qualquer `gerente_loja` ativo (`vendas-credito-aprovar.ts:83-96`, verificado nesta fase). Decisão final passa pelo despachante genérico com bypass admin/dev (`tarefas/[id]/aprovacao:329`). | Só quem estiver em `aprovadora_credito_gerente`. Sem fallback por cargo, sem bypass. | 🔵 FIX INTENCIONAL |
| **credito_diretor** | Config `aprovador_credito_diretor` **COM fallback** ordenado diretor→admin→desenvolvedor (`vendas-credito-aprovar.ts:127-140`, verificado nesta fase). Mesmo bypass do despachante (`:329`). | Só quem estiver em `aprovador_credito_diretor`. | 🔵 FIX INTENCIONAL |
| **entrega_sem_pagamento** | Já exige `aprovador_entrega_sem_pagamento` configurado — 409 "Nenhum aprovador configurado" se ausente, **sem** fallback por cargo (dossiê Fluxo D, `solicitar-aprovacao-entrega/route.ts:59`). Única diferença: decisão passa pelo despachante genérico com bypass admin/dev (`tarefas/[id]/aprovacao:329`). | Idêntico na exigência de config. Bypass admin/dev desaparece. | 🟢 IGUAL *(exemplo citado no pacote 04)* |
| **devolucao** | Config-first (`aprovadora_credito_gerente` dentro do prazo / `aprovador_devolucao_fora_prazo` fora do prazo) **COM fallback** ordenado gerente_loja→diretor→admin→desenvolvedor se vazia (`devolucoes.ts:280-310`). | Só a config (chave conforme `ctx.foraPrazo`), sem fallback. | 🔵 FIX INTENCIONAL |
| **devolucao_estoque** | Config `aprovador_devolucao_estoque` **COM fallback** ordenado gerente_fabrica→estoquista_fabrica→admin (`devolucoes.ts:475-499`). | Só a config, sem fallback. | 🔵 FIX INTENCIONAL |
| **compra_comercial** | Config `aprovador_compra_comercial`, **já sem fallback** — 409 "Nenhum aprovador configurado" se ausente (dossiê Fluxo L, front trata em `L860`). Decisão passa pelo despachante genérico com bypass admin/dev (`:329`). | Idêntico na exigência de config. Bypass admin/dev desaparece. ⚠️ **Fora de escopo**: o endpoint `compras-comercial/[id]/concluir` (finalizar após receber) tem **zero** checagem (`void user`, `route.ts:20`, mapa §C) e não corresponde a nenhum dos 18 eventos — continua brecha aberta, não coberta por esta centralização. | 🔵 FIX INTENCIONAL |
| **compra_metal** | Decisão **ignora** `metal_aprovador_id` — só checa cargo, `ROLES_METAL_APROVACOES = [desenvolvedor,admin,gerente_fabrica,gerente_loja,consultora]` (`metal/aprovacoes/[id]/aprovar:19`; mapa §B: "qualquer consultora/gerente aprova"). | Só quem estiver em `metal_aprovador_id`. | 🔵 FIX INTENCIONAL (grande) |
| **recebimento_metal** | Idêntico ao compra_metal — mesmos 5 cargos, ignora a config (`metal/aprovacoes/[id]/aprovar·rejeitar`, mapa linha). | Só `metal_aprovador_id`. | 🔵 FIX INTENCIONAL (grande) |
| **conversao** | Fixo `[admin,desenvolvedor]` (`conversao/aprovar` `route.ts:29`, `conversao/recusar route.ts:27`). **Sem** chave de config hoje. | `aprovador_conversao` — **chave NOVA**, ainda não existe → trava até o `/dba` criar e o Jonathan preencher. | 🔵 FIX INTENCIONAL |
| **conversao_sku** | Fixo `[admin,desenvolvedor]` (`conversao-sku/aprovar route.ts:22`, `recusar route.ts:24`). Sem config hoje. | `aprovador_conversao_sku` — **chave NOVA**, trava até criar. | 🔵 FIX INTENCIONAL |
| **precificacao** | `isFullAccess` = admin/desenvolvedor/diretor (`precificacao/aprovar·rejeitar`, mapa linha). Sem config hoje. | `aprovador_precificacao` — **chave NOVA**, trava até criar. | 🔵 FIX INTENCIONAL |
| **limpeza_ouro** | Já config-only: só o UUID de `aprovador_limpeza`, sem fallback, sem override (`limpeza-ouro-aprovacao.ts:39`, dossiê Fluxo J). | Idêntico — é o modelo que a política nova generaliza pros outros 17 eventos. | 🟢 IGUAL *(exemplo citado no pacote 04)* |
| **devolver_peca** | Config `aprovadores_devolver_peca` (multi) — mas **mesmo com config preenchida**, `isFullAccess` sempre pode decidir por cima (bypass permanente); se a config estiver vazia, cai pra `isFullAccess` OU cargo de estoque (`ROLES_ESTOQUE`) (`devolver-peca/route.ts:41-45`). | Só quem estiver na lista `aprovadores_devolver_peca`. Sem bypass de admin, sem fallback por cargo. | 🔵 FIX INTENCIONAL |
| **auditoria** | **Zero checagem** — `void user`, qualquer autenticado decide (`auditoria/[auditoriaId]/route.ts:19`; mapa §C). A maior brecha do mapa. | `aprovador_auditoria` — **chave NOVA**, trava até criar. Vira o evento mais rígido, era o mais aberto. | 🔵 FIX INTENCIONAL (crítico — fecha brecha) |
| **conferencia_consultora** | A própria consultora aprova a dela (`vendedor_id` bate) **OU** `podeAprovarTodas` = `isFullAccess` (admin/desenvolvedor/diretor) **OU** `gerente_loja`/`gerente_fabrica` — qualquer um desses aprova a conferência de **qualquer** consultora (`aprovacao/[aprovacaoId]/route.ts:33-42`). | **Só** a consultora dona (`vendedor_id === consultora_id`). Gerência e admin perdem a capacidade de aprovar/revisar a conferência de outra pessoa — não há mais nenhum caminho alternativo. | 🔵 FIX INTENCIONAL — ⚠️ **a mudança mais sensível do mapa, confirmar com o Jonathan** (ver nota abaixo) |
| **alteracao_venda** | Fixo `ROLES_FINANCEIRO` inline = admin/desenvolvedor/diretor (`solicitacoes-alteracao/[id]/route.ts:26`; mapa §A). Sem config hoje. | `aprovador_alteracao_venda` — **chave NOVA**, trava até criar. | 🔵 FIX INTENCIONAL |

## R3 — nota específica sobre `desconto`

Hoje a porta `PATCH vendas/solicitacoes-desconto/[id]` **nunca grava** `vendas_erp.desconto_aprovado_por`
— grava `itens_venda_erp.desconto_autorizado_por` (dossiê Fluxo A, linha 38). O portão do crédito
(`vendas-aprovar.ts:653` e `baixa-credito.ts:338`) lê exatamente `vendas_erp.desconto_aprovado_por` —
então um desconto aprovado só por essa porta **continua travando a venda** hoje, mesmo "aprovado". A
Fase 3, ao migrar `desconto` pra esta camada, precisa gravar o campo canônico (`camposLock` do evento
`desconto` já documenta isso no catálogo). Não é uma divergência da política de autoridade em si — é
um bug de campo errado que a centralização corrige de brinde.

## 🔴 Regressões a resolver

Nenhuma identificada pelo Sonnet nesta caracterização. **Atenção do Jonathan pedida** no evento
`conferencia_consultora`: a política ALVO tira de gerência (`gerente_loja`/`gerente_fabrica`) e de
admin/desenvolvedor/diretor a capacidade de aprovar a conferência de qualquer consultora — só a própria
consultora decide a dela, sempre. Se gerência hoje usa esse caminho pra revisar/destravar conferências
(ex.: consultora afastada, erro dela mesma), a Fase 3 desse fluxo específico precisa de uma decisão
explícita (virar 🔴 e manter um caminho de gerência, ou confirmar que 🔵 está correto).

## Chaves de config que precisam existir antes de ligar (checklist pra Fase 3)

Todas as chaves usadas pelo catálogo, na ordem dos 18 eventos. **5 são NOVAS** (destacadas) — não
existem em `alissonerp.configuracoes_sistema` ainda; sem elas o evento correspondente sempre resolve
`nao_configurado` e o fluxo trava assim que for plugado.

| Evento | Chave(s) de config | Status |
|---|---|---|
| desconto | `aprovador_desconto_padrao` | já existe (hoje decorativa) |
| cartao_desconto | `aprovador_cartao_desconto_padrao` | já existe (hoje decorativa, ⚠️ conferir) |
| credito_gerente | `aprovadora_credito_gerente` | já existe e já é lida hoje |
| credito_diretor | `aprovador_credito_diretor` | já existe e já é lida hoje |
| entrega_sem_pagamento | `aprovador_entrega_sem_pagamento` | já existe, já obrigatória hoje |
| devolucao | `aprovadora_credito_gerente`, `aprovador_devolucao_fora_prazo` | já existem e já são lidas hoje |
| devolucao_estoque | `aprovador_devolucao_estoque` | já existe e já é lida hoje |
| compra_comercial | `aprovador_compra_comercial` | já existe, já obrigatória hoje |
| compra_metal | `metal_aprovador_id` | já existe (hoje ignorada na decisão) |
| recebimento_metal | `metal_aprovador_id` | já existe (hoje ignorada na decisão) |
| **conversao** | **`aprovador_conversao`** | 🆕 **NOVA — criar via `/dba` + campo na tela na Fase 3** |
| **conversao_sku** | **`aprovador_conversao_sku`** | 🆕 **NOVA** |
| **precificacao** | **`aprovador_precificacao`** | 🆕 **NOVA** |
| limpeza_ouro | `aprovador_limpeza` | já existe e já é lida hoje (rígido) |
| devolver_peca | `aprovadores_devolver_peca` | já existe (hoje com bypass de admin) |
| **auditoria** | **`aprovador_auditoria`** | 🆕 **NOVA** |
| conferencia_consultora | *(nenhuma — exceção)* | não se aplica |
| **alteracao_venda** | **`aprovador_alteracao_venda`** | 🆕 **NOVA** |

**Ordem sugerida pra Fase 3** (do dossiê §Plano): metal → conversão → preço → limpeza → devolução →
compra → **venda por último**. As 5 chaves novas caem nos 4 primeiros grupos (conversão, precificação,
auditoria — auditoria é avulso) — o Jonathan precisa preencher cada uma em Configurações › Aprovadores
**antes** de ligar o fluxo correspondente, senão ele trava em produção assim que for plugado.
