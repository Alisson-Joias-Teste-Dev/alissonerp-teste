# Regras de Negócio — Comercial (Vendas, Vale-Troca, Comissão, Entregas)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo comercial, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/alissonerp-vendas.md` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.

Última atualização: 2026-06-18.

---

## 1. Vale-Troca

- **Uso único.** Cada vale é aplicado **uma vez só**. Ao aplicar numa venda, o vale original **sempre** vira `utilizado` (100%, `valor_disponivel=0`).
- **Troco vira vale novo.** Se o vale > valor a pagar, o sistema gera um **novo vale** com o troco, ligado ao original por `vale_origem_id` (rastreia a cadeia). Se o vale < valor a pagar, retorna `precisa_complemento`.
- **Numeração:** `VT-00001` via sequence `alissonerp.vale_troca_seq`.
- **Valor do vale (devolução) = proporcional ao PAGO** *(v2.68.1)*. `recomputarTotais` calcula `crédito_item = valor_item × (pago_confirmado ÷ total_venda)` — o vale **nunca passa do que o cliente pagou** (caso entrega com pagamento parcial). Venda **sem pagamento rastreado** (legado, `pagamentos_venda` vazio) → fração 1 (valor cheio). Frete entra como não-reembolsável; retenção % aplicada sobre a base proporcional.
- **Vale-troca NÃO comissiona** (ver §2).
- **Aplicar vale exige 2ª confirmação do dono (WhatsApp)** *(v2.68.0, brecha #1)*. Vale COM `cliente_id` só é aplicado depois que o **dono** informa um código de 6 dígitos enviado ao WhatsApp dele (`vale_troca_codigo`, 5 tentativas erradas → bloqueia; expira em 15 min). Vale SEM dono (promoção) aplica direto. Se o WhatsApp falhar ou o cliente não tiver celular, um responsável (`ROLES_DEVOLUCAO` ou o `aprovador_vale_troca_excecao` das Configurações) libera via **exceção**, sempre auditada. Endpoint: `POST /api/vale-troca/solicitar-codigo`; aplicação valida em `vendas/[id]/pagamentos`.
- **Estorno DEVOLVE o vale** *(v2.68.0, #2/#6)*. `estornarVenda()` reativa o vale com o **valor aplicado** e **preserva o troco-filho** (cadeia conservada: devolvido + troco = original). ⚠️ O estorno manual pelo painel (`PATCH .../pagamentos/[pagId]` `status=estornado`) **não pode pré-setar o status** — quem faz o estorno é o `estornarVenda` (senão o guard de idempotência pula a reversão do vale e o cancelamento de CR/venda). `reverterAplicacaoVale()` é idempotente.
- **Overpayment travado + atômico** *(#3/#5)*. O hook de Vale-Troca usa `FOR UPDATE` na venda (igual ao Ouro) e nunca aplica acima do saldo restante; o excedente vira troco. Aplicar/estornar/cancelar/gerar vale registram em `audit_log`.
- **Devolução → vale passa pela aprovação do estoque** *(v2.68.0, B3)*. "Concluir" não gera mais o vale direto: cria tarefa pro `aprovador_devolucao_estoque` (status `aguardando_aprovacao_estoque`); o vale/reembolso só nasce quando o estoque aprova. A devolução tem **comentários** (igual ordens) e o **histórico completo da cadeia de vale** (Y→troco→…).

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
- **Aprovar a venda NÃO baixa estoque** — a baixa de ESTOQUE (reserva → saída) é só na **entrega** (confirmação do recebimento / retirada). Não confundir com a baixa da **conta a receber** (financeiro), que essa sim ocorre na **aprovação** (mig 299). São duas "baixas" diferentes — peça ≠ dinheiro.
- **Saldo comercial = `vw_saldo_estoque_comercial`**: `disponivel = saldo - reservado`. **SEMPRE conferir `reservado` antes de assumir que há peça livre** — pode haver saldo físico já reservado por outra venda (inclusive rascunho).
- **Baixa segue a EXISTÊNCIA da reserva**, não a flag `controla_estoque` (corrigido 12/06). Item com reserva ativa → baixa e divide; item sem reserva → pula sem erro.
- **`reservas_estoque_comercial` NÃO tem triggers PRÓPRIOS** (na tabela) → dá pra ajustar a linha direto (UPDATE/cancel) sem efeito colateral. ⚠️ Isso NÃO vale para apagar o ITEM da venda (ver bullet abaixo) — o item tem gatilho + FK que mexem na reserva.
- **Apagar item de venda (só em rascunho) NÃO deixa reserva órfã** *(B10, conferido em prod 18/06/2026)*. Remover um item (`DELETE /api/vendas/[id]/itens/[itemId]`, permitido **só** com `situacao='rascunho'`) limpa a reserva **sozinho**, por DOIS mecanismos redundantes: (1) FK `item_venda_id → itens_venda_erp(id) ON DELETE CASCADE` (mig 140, **validada** em prod) apaga a linha da reserva junto; (2) gatilho `trg_estoque_comercial_reversao_item` (AFTER DELETE em `itens_venda_erp`, mig 141) marca `cancelado` / estorna o movimento se já efetivado. **NÃO criar "limpeza manual" da reserva ao apagar item — a proteção já existe e funciona** (prova: 0 reservas órfãs com item apagado em prod). Impacto se duplicar a limpeza: dupla baixa/estorno.
- **Reserva pode ser de ITEM DE VENDA ou de ORDEM.** As colunas `item_venda_id`/`venda_id`/`ordem_id` são **nullable** (a tabela foi estendida depois da mig 140). Reserva ligada a uma ordem tem `item_venda_id` nulo — é normal, não é órfã. Ao caçar órfãs por `item_venda_id`, filtrar `item_venda_id IS NOT NULL` (senão as de ordem aparecem como falso-positivo).
- **Status de venda válidos: `rascunho` · `aprovado` · `em_rota` · `entregue` · `cancelado`.** **NÃO existe `concluido`** — era uma falha, **corrigida em 13/06/2026**. Ainda restam vendas antigas com `situacao='concluido'` no banco (resíduo, todas de antes de 13/06) — não criar lógica nova em cima desse status.
- **Reserva "presa" (B4, conferido em prod 18/06/2026):** a reserva fica `status='ativo'` para sempre quando a venda chegou a `entregue`/`concluido` **sem registro de entrega** (`entregas_venda`) — caminho antigo (pré-13/06) que pulava o módulo de entrega, então `baixarEstoqueDaEntrega` nunca rodou (sem entrega, não há o que baixar). Resultado: `reservado` inflado e `disponivel` errado (chega a negativo). São 16 casos antigos; **não nasce reserva presa nova depois de 13/06**. Limpeza = auditoria humana do pedido → **baixa** (peça real: gera saída + efetiva a reserva) ou **cancelar** (serviço/atípico), sempre em script **assinado**. Reserva de venda **viva** (rascunho/aprovado ainda não entregue) NÃO é presa — segura a peça de propósito.
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

## 6. Aprovação de desconto (rascunho → aprovado)

- Numa venda em `rascunho`, item com `pct_desconto` acima do limite da vendedora (`usuarios.mx_desconto_permitido`, default 15%) **pode ser salvo**, mas a venda **não aprova** enquanto `desconto_aprovado_por` estiver vazio (gate em `vendas-aprovar.ts → approveVenda`). Na tela aparece o botão **"Solicitar Aprovação de Desconto"** → cria tarefa (`tipo=desconto`, tag `aprov_desconto_acima`) → admin/diretor aprova → `tarefas/[id]/aprovacao` grava `desconto_aprovado_por`/`_em` e libera a aprovação da venda.
- **Reeditar/adicionar item acima do limite INVALIDA a aprovação anterior** (o valor mudou, precisa reaprovar). Ao invalidar, as rotas de itens (`POST` e `PATCH /api/vendas/[id]/itens`) zeram **`desconto_aprovado_por`, `desconto_aprovado_em` E `aprovacao_desconto_tarefa_id`**, e cancelam a tarefa vinculada **só se ainda estava pendente** (`aguardando_aprovacao`) — tarefa já aprovada é histórico, não se reescreve.
- ⚠️ **Por que limpar `aprovacao_desconto_tarefa_id` é obrigatório:** o front só mostra o botão de solicitar quando esse campo é NULL (`precisaSolicitarDesconto`). Se ficar apontando para uma tarefa já `aprovada`, somem TANTO o botão de solicitar QUANTO o banner de "aguardando" → a venda trava em rascunho sem como reaprovar. Bug corrigido em jun/2026 (venda 15628; outras 4 ficaram presas: 15300, 15312, 15399, 15562).
