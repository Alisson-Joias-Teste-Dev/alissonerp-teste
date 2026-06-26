# Mapa de Impacto — #1 Pagamento na Entrega + #7 Permuta / Ação Marketing

> **Data:** 15/06/2026 · Mapeamento line-by-line ANTES de qualquer alteração (pedido do Jonathan).
> **Regra:** nada é tocado sem este mapa completo + aprovação. Aplicação será em produção.

---

## #1 — Pagamento na Entrega → JÁ EXISTE (só VERIFICAR)

A página "Nova Venda" renderiza `NovaVendaClientV2` ([nova/page.tsx:65](src/app/(dashboard)/vendas/nova/page.tsx#L65)),
e ele **já tem "Na Entrega"** em `FORMAS_FIXAS` ([NovaVendaClientV2.tsx:274](src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx#L274)).
O backend (cobrar-entrega, aprovação direta, CR) já existe. **Ação: testar ponta a ponta, não construir.**
- Furo conhecido (decidir): a tela de **editar** venda usa `PagamentoForm`, cujo `FORMAS_PAGAMENTO_BASE`
  ([PagamentoForm.tsx:172](src/components/vendas/PagamentoForm.tsx#L172)) **NÃO** tem "Na Entrega". Só importa se
  Jonathan quiser adicionar "Na Entrega" também ao editar uma venda já criada.

---

## #7 — Permuta e Ação Marketing (CONSTRUIR)

Comportamento decidido: **não entram no caixa, não geram comissão, não geram conta a receber, podem ser
estornadas, e dá pra ver o total dado em cada uma. Comissão zera só a parte dessas formas. Um aprovador para as
duas. Relatório no financeiro. A venda não vai para 'aprovado' sem a aprovação dessa forma.**

### A) Frontend — listas de formas (adicionar as 2 formas)
| Arquivo | Linha | Vivo? | Ação |
|---|---|---|---|
| `NovaVendaClientV2.tsx` | [274](src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx#L274) `FORMAS_FIXAS` | **SIM (criar venda)** | add "Permuta", "Ação Marketing" |
| `PagamentoForm.tsx` | [172](src/components/vendas/PagamentoForm.tsx#L172) `FORMAS_PAGAMENTO_BASE` | SIM (editar venda) | add as 2 |
| `VendaDetalheClient.tsx` | [170](src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx#L170) | SIM (detalhe) | add as 2 |
| `NovaVendaClient.tsx` / `NovaVendaClientLegado.tsx` | 60 / 57 | **CONFIRMAR se mortos** | só mexer se vivos |

**UI por forma:** Permuta/Ação Marketing comportam como "Dinheiro" — só um campo de **valor**, sem gateway/cartão.
Replicar o bloco de Dinheiro (ex.: `PagamentoForm.tsx:296`) e o tratamento simples no V2.

### B) Salvar pagamento = CONFIRMADO na hora (liquida a venda)
Hoje só "Dinheiro" nasce confirmado:
- `POST /api/vendas` [route.ts:812,822](src/app/api/vendas/route.ts#L812) — `isDinheiro` → 'confirmado'.
- `POST /api/vendas/[id]/pagamentos` [route.ts:230,271](src/app/api/vendas/[id]/pagamentos/route.ts#L230).

**Ação:** trocar `isDinheiro` por um conjunto `FORMAS_LIQUIDA_NA_HORA = ['Dinheiro','Permuta','Ação Marketing']`
nos 2 lugares, para que Permuta/Ação nasçam **confirmadas** (settle a venda). O wizard manda `status:"pendente"`
([NovaVendaClientV2.tsx:1407,1415](src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx#L1407)) — o backend
sobrescreve para confirmado nessas formas.

### C) Comissão — zerar só a parte dessas formas (estender a lista de exclusão)
O cálculo **já é proporcional por pagamento** e já exclui `('Vale-Troca','A Receber')`. Adicionar as 2 formas em:
| Arquivo | Linha |
|---|---|
| `financeiro/comissoes/elegiveis/route.ts` | [56](src/app/api/financeiro/comissoes/elegiveis/route.ts#L56) |
| `financeiro/comissoes/resumo/route.ts` | [31, 40](src/app/api/financeiro/comissoes/resumo/route.ts#L31) |
| `financeiro/comissoes/fechamentos/route.ts` | [113](src/app/api/financeiro/comissoes/fechamentos/route.ts#L113) |
| `dashboard-comercial/analise-comissoes/route.ts` | [130](src/app/api/dashboard-comercial/analise-comissoes/route.ts#L130) |
| `(dashboard)/financeiro/_data.ts` | [89](src/app/(dashboard)/financeiro/_data.ts#L89) |
| `financeiro/comissoes/gerar-maio/route.ts` | 47,104 (one-off de maio — provavelmente ignorar) |

> Recomendação: criar UMA constante compartilhada `FORMAS_SEM_COMISSAO` em `src/lib/` e usar nos 6 lugares,
> pra não esquecer nenhum no futuro (evita o retrabalho).

### D) Financeiro — não gerar conta a receber pela parte dessas formas (BANCO / migration)
`fn_venda_criar_cr_quitada` cria a CR 'pago' pelo **total_venda** quando a venda é quitada.
**Ação (migration):** a CR deve ser criada pelo valor = **SUM(pagamentos confirmados EXCETO Permuta/Ação)**.
Venda 100% Permuta → CR = 0 (nenhuma). Venda mista → CR só da parte em dinheiro real.
A checagem "está quitada?" continua somando TODOS os confirmados (a venda fica quitada normal).

### E) Caixa — NENHUMA mudança
Caixa só considera `forma = 'Dinheiro'` ([caixa/baixa:46](src/app/api/financeiro/caixa/baixa/route.ts#L46)).
Permuta/Ação nunca entram. ✅

### F) Estorno — NENHUMA mudança
`estornarVenda` é genérico por id de pagamento ([vendas-aprovar.ts:804](src/lib/vendas-aprovar.ts#L804)). ✅

### G) Travar aprovação da venda (a venda não vai pra 'aprovado' sem aprovação da forma)
Espelhar o padrão do desconto em `approveVenda` ([vendas-aprovar.ts:648](src/lib/vendas-aprovar.ts#L648)):
- **Migration:** `ADD COLUMN IF NOT EXISTS forma_especial_aprovado_por uuid` em `vendas_erp` (espelho de
  `desconto_aprovado_por`).
- **approveVenda:** se a venda tem pagamento Permuta/Ação E `forma_especial_aprovado_por IS NULL` → bloqueia
  (mesmo formato do bloqueio de desconto).
- **Solicitação:** ao tentar aprovar sem aprovação, criar a solicitação para o aprovador configurado, espelhando
  `solicitar-aprovacao/route.ts` + `aprovacao-regras.ts` (cria tarefa + `aprovacoes_tarefa`). Ao aprovar a
  tarefa, gravar `forma_especial_aprovado_por` e liberar a aprovação da venda.

### H) Aba "Aprovadores" (Configurações) — +1 linha (tudo código, sem migration)
`configuracoes_sistema` é chave-valor. Nova chave `aprovador_permuta_acao`:
- `TabAprovadores.tsx`: +item em `CONFIG_ITENS` ([:60](src/components/configuracoes/TabAprovadores.tsx#L60)),
  +campo na interface ([:25](src/components/configuracoes/TabAprovadores.tsx#L25)) e no state ([:141](src/components/configuracoes/TabAprovadores.tsx#L141)).
- `configuracoes/aprovadores/route.ts`: +chave em `CHAVES` ([:24](src/app/api/configuracoes/aprovadores/route.ts#L24)),
  +retorno no GET ([:101](src/app/api/configuracoes/aprovadores/route.ts#L101)), +handler no PUT ([:134](src/app/api/configuracoes/aprovadores/route.ts#L134)),
  +lista de usuários elegíveis (qual role pode aprovar — CONFIRMAR com Jonathan).

### I) Cobrança na entrega — proibir essas formas
`cobrar-entrega` tem `FORMAS_INVALIDAS` ([:32](src/app/api/vendas/[id]/cobrar-entrega/route.ts#L32)).
Adicionar 'Permuta','Ação Marketing' (não são dinheiro recebido na entrega).

### J) Relatório no financeiro — total dado em Permuta/Ação no período
Novo: somatório de `pagamentos_venda` (confirmado, forma IN ('Permuta','Ação Marketing')) por período, exibido
no módulo financeiro. (Front + rota de leitura — sem migration.)

### K) Dashboard / Faturamento (DECIDIDO 15/06 — Jonathan)
A venda **existe** no sistema, mas **o faturamento da dashboard comercial NÃO inclui a parte em Permuta/Ação**.
- Venda 100% Permuta/Ação → **não soma no faturamento** (contribuição = 0).
- Venda mista → soma **só a parte das outras formas** (total_venda − parte Permuta/Ação).
**Implicação:** a #7 TOCA o cálculo do faturamento da dashboard (`vw_dash_vendas_todas` / rotas dashboard-comercial,
que hoje somam `total_venda`). Mapear o ponto exato e excluir a parte dessas formas, com o MESMO cuidado da correção
de duplicatas (migration 304). Provável reflexo em ranking/metas (que usam faturamento) — manter consistente.
**A CONFIRMAR:** venda 100% Permuta ainda APARECE na lista "Vendas do Período" (só não soma), ou some da lista?

---

## Migrations necessárias (#7)
1. `ADD COLUMN IF NOT EXISTS alissonerp.vendas_erp.forma_especial_aprovado_por uuid` (trava de aprovação).
2. `CREATE OR REPLACE FUNCTION fn_venda_criar_cr_quitada` — CR pela soma confirmada EXCETO Permuta/Ação.
   (Assinar no log_mudancas_banco — migration 303.)

## DECISÕES em aberto (perguntar ao Jonathan antes de codar)
1. **Recebido (CR):** confirmar que a parte em Permuta/Ação **não** vira "recebido" (venda mista recebe só a
   parte em dinheiro; venda 100% Permuta = recebido 0).
2. **Faturamento:** confirmar que a venda **conta como venda** (quanto vendeu) pelo total, mesmo sendo Permuta.
3. **Aprovação:** confirmar — 1 aprovação por venda destrava (não por item); a aprovação só LIBERA a venda a ser
   aprovada (a consultora aprova depois), espelhando o desconto.
4. **Quem pode ser aprovador** dessas formas (qual role entra na lista — admin/diretor? gerente?).
5. **Listas mortas:** confirmar se `NovaVendaClient.tsx` / `NovaVendaClientLegado.tsx` ainda são usados.

## Plano de teste (homolog OU produção com venda de teste a apagar)
Caso feliz + mista (cartão+Permuta) + 100% Permuta: criar venda → tentar aprovar (deve travar) → aprovar a forma →
aprovar venda → conferir comissão proporcional, CR só da parte em dinheiro, caixa intacto, relatório financeiro,
estorno. Tudo antes de declarar pronto.
