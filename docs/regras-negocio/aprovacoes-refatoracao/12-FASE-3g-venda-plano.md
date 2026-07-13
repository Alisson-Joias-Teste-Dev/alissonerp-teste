# FASE 3g — VENDA: mapa dos 6 eventos + plano de fatiamento

> Arquiteto: Opus. **Não é um pacote de execução** — é o PLANO da Fase 3g (a última e mais crítica da
> migração). As sub-fases (3g.1, 3g.2, 3g.3) têm seus próprios pacotes. Leia `05-divergencias` e o dossiê.

## Os 6 eventos de aprovação da venda

| Evento | Onde DECIDE hoje | Como resolve o aprovador hoje | Chave de config | `aprovacoes_tarefa`? |
|---|---|---|---|---|
| `entrega_sem_pagamento` | despachante `tarefas/[id]/aprovacao` L384 | config `aprovador_entrega_sem_pagamento` — **já config-only** (409 se vazio, sem fallback) | existe | sim |
| `alteracao_venda` | PATCH direto `solicitacoes-alteracao/[id]` L49 (`ROLES_FINANCEIRO` inline) | cargo fixo `[admin,dev,diretor]` | **NOVA** `aprovador_alteracao_venda` (criar) | **não** (PATCH direto) |
| `credito_gerente` | despachante `isCreditoReal` L562 | `submeterVendaParaAprovacaoCredito` config `aprovadora_credito_gerente` + **fallback cargo** | existe | sim |
| `credito_diretor` | despachante `isCreditoReal` L562 | idem, config `aprovador_credito_diretor` + **fallback cargo** | existe | sim |
| `desconto` | despachante handler `desconto_acima` L477 | `aprovacao-regras.ts` `encontrarAprovador` (por regra/cargo — chave **decorativa**) | `aprovador_desconto_padrao` (existe, decorativa) | sim |
| `cartao_desconto` | despachante handler `cartao_desconto` L427 | idem | `aprovador_cartao_desconto_padrao` (decorativa) | sim |

`approveVenda` (`vendas-aprovar.ts:507`) é o EFEITO final (rascunho→aprovado) — **NÃO é evento de aprovação,
NÃO plugar**. Ele já tem a trava R3 (bloqueia se `tem_desconto_alto && !desconto_aprovado_por`), que é a
rede de segurança final e continua valendo. Guard genérico do despachante (L342) fica **intocado**.

## Decisões do Jonathan (12/07)

1. **Crédito: MANTÉM 2 aprovadores** (`credito_gerente` + `credito_diretor`). A regra de saldo
   (`getSaldoDisponivel`, `submeterVendaParaAprovacaoCredito:101`) continua só **roteando** qual tarefa
   criar (cabe no saldo → gerente; estoura → diretor). A **autoridade** de cada vira 100% config (sem o
   fallback por cargo). O zeramento de comissão do diretor (guard `2026-07-01`) é outro efeito — **continua**.
   No despachante, mapear o evento pela coluna `venda.aprovacao_credito_tipo`: `'diretor' → credito_diretor`,
   senão `credito_gerente`.
2. **Alteração de venda:** vira config-first com chave nova `aprovador_alteracao_venda`. Antes de plugar,
   **criar a chave + preencher** (com os diretores atuais), senão o financeiro para de aprovar em produção.
3. **Desconto:** na 3g migra **só a PORTA OFICIAL** (via tarefa — a única que já grava o campo canônico
   `vendas_erp.desconto_aprovado_por` e recalcula comissão por `faixas_comissao`). Os 2 atalhos e a
   unificação de comissão/campo são **Fase 4** (ver fronteira).

## Fatiamento (3 sub-fases, do menor pro maior risco)

- **3g.1 — Entrega + Alteração** (pacote `13`): entrega já é config-only (só o gate `podeDecidir` no
  despachante); alteração troca `ROLES_FINANCEIRO` por `podeDecidir('alteracao_venda')` no PATCH direto +
  chave nova `aprovador_alteracao_venda` (criar + expor na config). Isoladas, não mexem em comissão.
- **3g.2 — Crédito** (gerente + diretor): migrar **submissão E decisão juntas** (senão a tarefa é atribuída
  por cargo mas o gate estrito recusa). Submissão (`vendas-credito-aprovar.ts`): trocar os 2 fallbacks por
  `resolverAprovadores('credito_gerente'|'credito_diretor')` conforme o `tipo` já calculado por saldo;
  `nao_configurado` → 409. Decisão (despachante L562): `podeDecidir` mapeando o evento por `aprovacao_credito_tipo`.
- **3g.3 — Desconto + Cartão** (o mais crítico): plugar `podeDecidir('desconto')` no handler `desconto_acima`
  (L477) e `podeDecidir('cartao_desconto')` no handler `cartao_desconto` (L427); e `resolverAprovadores` na
  criação (`solicitar-aprovacao` tipo=desconto/cartao_desconto) pra escolher o `aprovador_id` da tarefa via
  config em vez de `encontrarAprovador`. **NÃO** tocar comissão nem as portas (b)/(c). Preencher
  `aprovador_desconto_padrao`/`aprovador_cartao_desconto_padrao` (hoje decorativas) antes de ligar.

## Fronteira 3g / Fase 4 / Fase 5

- **3g (autorização):** ligar "quem aprova = config" nos 6 eventos (porta oficial de cada). Contrato idêntico.
- **Fase 4 (atalhos/brechas):** aposentar a porta (b) `aprovar-desconto` (role fixo) e a (c)
  `solicitacoes-desconto` (role fixo + zera comissão + grava campo NÃO-canônico `itens_venda_erp.desconto_autorizado_por`
  que nada lê como gate); unificar a comissão do desconto (hoje: porta a recalcula, b não mexe, c zera);
  unificar no campo canônico `vendas_erp.desconto_aprovado_por`; fechar o backdoor do `tarefas/[id]` PATCH.
- **Fase 5 (limites):** unificar as ~4 cópias do threshold de desconto (`mx_desconto_permitido` por vendedora,
  default por cargo 15/30/50, `tarefas_regras_aprovacao.condicao_json.percentual`, `maxDesconto` do front,
  `20%` do cartão). Núcleo: `getDescontoThreshold` + `avaliarRegras`.

## Pontos de atenção (valem pra todas as sub-fases)
- **Preencher a chave ANTES de plugar** cada sub-fase (senão config-first estrito trava → todos 403/409).
- **Migrar submissão + decisão juntas** onde há resolução de aprovador na criação (crédito, desconto/cartão).
- `approveVenda` e a coluna `aprovacao_credito_tipo` (também usada como flag de "fluxo de crédito ativo"
  no front e em `solicitacoes-alteracao`) — **não** tocar/renomear.
- Guard genérico do despachante (L342) intocado; o gate config-first é adicional, dentro de cada handler.
