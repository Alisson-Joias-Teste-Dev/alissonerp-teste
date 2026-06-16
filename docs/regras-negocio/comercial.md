# Regras de Negócio — Comercial (Vendas, Vale-Troca, Comissão, Entregas)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo comercial, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/alissonerp-vendas.md` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.

Última atualização: 2026-06-16.

---

## 1. Vale-Troca

- **Uso único.** Cada vale é aplicado **uma vez só**. Ao aplicar numa venda, o vale original **sempre** vira `utilizado` (100%, `valor_disponivel=0`).
- **Troco vira vale novo.** Se o vale > valor a pagar, o sistema gera um **novo vale** com o troco, ligado ao original por `vale_origem_id` (rastreia a cadeia). Se o vale < valor a pagar, retorna `precisa_complemento`.
- **Numeração:** `VT-00001` via sequence `alissonerp.vale_troca_seq`.
- **Vale-troca NÃO comissiona** (ver §2).
- **NÃO existe "estornar vale-troca" no sistema.** Não há botão nem rota. A função `cancelarValeTroca()` em `src/lib/vale-troca.ts` é **código morto** (não é chamada por nada). Vale só é cancelado quando a devolução que o gerou ainda está em `rascunho`/`rejeitado` (antes de existir).
- **⚠️ Cancelar uma venda NÃO devolve o vale usado nela como pagamento.** `estornarVenda()` (`src/lib/vendas-aprovar.ts`) mexe em pagamento, situação e contas a receber, mas **não toca em `vale_troca`**. Cancelar uma venda paga com vale = **queima o crédito do cliente**. Por isso, nunca "cancelar + refazer com vale" pra resolver troca/substituição.

Arquivos: `src/lib/vale-troca.ts`, `src/app/api/vale-troca/`, migration `142_devolucoes_vale_troca.sql`.

---

## 2. Comissão

- **Base = pagamento confirmado**, não a entrega. A comissão elegível é calculada por `pagamentos_venda` com `status='confirmado'`, rateada pelo valor do pagamento sobre o total da venda.
- **Formas que NÃO comissionam:** `Vale-Troca` e `A Receber` (`forma NOT IN ('Vale-Troca','A Receber')` em `src/app/api/financeiro/comissoes/elegiveis/route.ts`). Logo: venda paga 100% com vale gera **R$0** de comissão; venda mista comissiona só a parte não-vale/não-receber.
- `vendas_erp.total_comissao` é o valor **teórico** (soma dos `valor_comissao` dos itens). O que de fato é **pago** sai do fechamento, só sobre as formas que comissionam.
- **Fechamento:** itens entram em `alissonerp.fechamento_comissao_itens` (com `status` ex. `liberado`); comissão é apurada **por período / fim do mês**. Um pagamento já fechado não some retroativamente se a venda for cancelada depois.
- Aprovação de crédito acima do saldo pelo diretor **zera** a comissão da consultora (`vendas-credito-aprovar.ts`).

Arquivos: `src/app/api/financeiro/comissoes/*`, `src/lib/types/financeiro-comissoes.ts`.

---

## 3. Estoque comercial, reserva e entrega

- **Item de venda CRIA RESERVA** ao ser inserido (quando `estoque_comercial_config.ativo=true` pro produto) — nunca saída direta. A reserva vira **saída** quando a venda é **entregue**.
- **Saldo comercial = `vw_saldo_estoque_comercial`**: `disponivel = saldo - reservado`. **SEMPRE conferir `reservado` antes de assumir que há peça livre** — pode haver saldo físico já reservado por outra venda (inclusive rascunho).
- **Baixa segue a EXISTÊNCIA da reserva**, não a flag `controla_estoque` (corrigido 12/06). Item com reserva ativa → baixa e divide; item sem reserva → pula sem erro.
- **`reservas_estoque_comercial` NÃO tem triggers** → dá pra ajustar direto (UPDATE/cancel) sem efeito colateral.
- **Entrega parcial:** venda fica `aprovado` enquanto houver saldo pendente; vira `entregue` só quando toda a quantidade confirmada cobre os itens (`marcarVendaEntregueSeCompleta`).
- **Trava "Na Entrega":** não marca `entregue` enquanto houver pagamento `forma='Na Entrega'` `status='pendente'` — tem que cobrar antes (`POST /api/vendas/[id]/cobrar-entrega`).
- **Reposição aberta BLOQUEIA a entrega do item** (não a venda inteira): ordem `reposicao_venda`/`reposicao_loja` não-concluída trava só aquele produto (`calcularBloqueioReposicao`). Reposição sem produto identificável → trava a venda inteira (seguro).
- Cancelar venda (`situacao='cancelado'`) → `fn_estoque_comercial_cancelamento_venda` cancela as reservas ativas e estorna saídas já efetivadas (entrada reversa).

Arquivos: `src/lib/entrega-venda.ts`, triggers `fn_estoque_comercial_*`, migration `285_*`.

---

## 4. Trocar item de uma venda APROVADA (item sem estoque → outra variação em estoque)

Quando o item vendido não pode ser entregue (reposição atrasou) e existe **outra variação do mesmo produto** em estoque (ex.: outro aro): **NÃO cancelar a venda nem usar vale-troca** (ver §1) — **trocar o item na própria venda**.

Não tem feature/endpoint (o PATCH de item só edita venda em `rascunho` e nem mexe em `produto_id`). É **SQL manual assinado** (`assinar_mudanca_banco`, etiqueta `claude-code-jonathan`), em PROD.

**Receita (transação única):**
1. **Cancelar a ordem de reposição** do item velho (replicar o app): `UPDATE alissonerp.ordens SET situacao='cancelado', status='concluido', cancelado_por, cancelado_em`. ANTES confirmar **0 apontamentos** (`apontamentos_pcp` via `pcp.ordem_id`) — com apontamento só **master** cancela. Dispara `trg_cancelar_pcp_ordem` (PCP → cancelado).
2. Se a consultora já criou venda **nova duplicada** (mesmo cliente/vendedora, rascunho) segurando a peça: **cancelar esse rascunho** (`situacao='cancelado', bloqueado=true`) → libera a reserva sozinha.
3. **Trocar o item**: `UPDATE itens_venda_erp SET produto_id=<novo>, sku=(...), nome_produto=(...) WHERE id=<item>`. **Manter quantidade e valores idênticos** (preço/total/comissão) — senão `fn_recalcular_totais_venda` mexe nos totais; qtd igual = `fn_estoque_comercial_update_qtd_item` é no-op.
4. **Reapontar a reserva**: `UPDATE reservas_estoque_comercial SET produto_id=<novo> WHERE id=<reserva>`.
5. **Entrega pelo front** baixa a peça real.

**Gotchas (verificados no caso da venda 15274 em 16/06):**
- Proteções `fn_proteger_itens_venda_fechada` e `fn_proteger_venda_fechada` só bloqueiam `confirmado/concluido/entregue` → `aprovado` passa.
- `fn_bloquear_venda` barra se `bloqueado=true` — conferir antes.
- Conferir `reservado` no `vw_saldo_estoque_comercial`: a peça "em estoque" pode já estar reservada por outra venda.
- Esses anéis não usam RFID (`joias_rfid` vazio) — se usar, a baixa também marca RFID por `venda_id`+`item_venda_id`.

---

## 5. Cancelamento de venda

- `POST /api/vendas/[id]/cancelar`: bloqueia se houver **pagamento confirmado** ("estorne antes"). Consultora só cancela venda própria e em `rascunho`. Venda `concluido` não cancela.
- Faz `UPDATE vendas_erp SET situacao='cancelado', bloqueado=true`; devolve crédito de gerente usado (se houver); cancela pedido no Tiny (best-effort).
- Triggers no cancelamento: libera reservas/estorna estoque comercial (§3) e cancela contas a receber pendentes.
