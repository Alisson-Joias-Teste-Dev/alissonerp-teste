# Diagnóstico — Fluxo de Baixa de Produto

> **Para quem:** Dev (principalmente) + Dono.
> **Objetivo:** Documentar EXATAMENTE como o sistema dá baixa no estoque hoje, identificar pontos de risco e marcar o que ainda precisa ser confirmado.

---

## 1. Diagrama do fluxo (como é hoje)

```
┌─────────────────────────────────────────────────────────────────┐
│ CICLO DE VIDA DA VENDA — IMPACTO NO ESTOQUE                     │
└─────────────────────────────────────────────────────────────────┘

  POST /api/vendas
     │
     ▼
  ┌─────────────────────┐
  │ vendas_erp.situacao │ ── nada acontece com estoque ──→
  │   = 'rascunho'      │
  └─────────────────────┘
     │
     │ POST /api/vendas/[id]/itens
     ▼
  ┌─────────────────────────────────┐
  │ itens_venda_erp INSERT          │
  │   trg_baixa_venda dispara →     │
  │   reservas_estoque_comercial    │── BLOQUEIA disponível, não deduz físico
  │     status='ativo'              │   (saldo físico continua igual,
  │                                 │    "disponível" cai)
  └─────────────────────────────────┘
     │
     │ PATCH /api/vendas/[id] { situacao: 'aprovado' }
     ▼
  ┌─────────────────────────────────────────┐
  │ vendas_erp UPDATE                       │
  │   trg_aprovar_venda dispara →           │
  │   ┌───────────────────────────────────┐ │
  │   │ Para cada reserva ativa:          │ │
  │   │   1) INSERT mov_estoque_comercial │ │── DEDUZ FÍSICO
  │   │      (tipo='saida', status=ok)    │ │   pela 1ª vez
  │   │   2) reserva.status='efetivado'   │ │
  │   │      reserva.movimento_id=novo_id │ │
  │   └───────────────────────────────────┘ │
  └─────────────────────────────────────────┘
     │
     ▼
  ┌─────────────────────┐
  │ vendas_erp.situacao │
  │   = 'aprovado'      │
  └─────────────────────┘

CAMINHOS REVERSOS:

  POST /api/vendas/[id]/cancelar
     │
     ▼
  ┌─────────────────────────────────────────┐
  │ vendas_erp UPDATE situacao='cancelado'  │
  │   trg_cancelamento_venda dispara →      │
  │   ┌─────────────────────────────────┐  │
  │   │ Reservas ativas: cancela        │  │
  │   │ Movimentos saída efetivados:    │  │── ESTORNO via reverso
  │   │   cria entrada com              │  │   (NÃO DELETA original)
  │   │   estorno_de_id apontando p/    │  │
  │   │   o original                    │  │
  │   │ Original: status='estornado',   │  │
  │   │   estornado_por_id=<reverso>    │  │
  │   └─────────────────────────────────┘  │
  └─────────────────────────────────────────┘

  DELETE /api/vendas/[id]/itens/[itemId]
     │
     ▼
  trg_reversao_item:
    Se reserva ativa: cancela (sem mexer físico)
    Se já efetivada (venda aprovada): cria estorno

  PATCH /api/vendas/[id]/itens/[itemId] { quantidade: novaQtd }
     │
     ▼
  trg_update_qtd_item:
    Se rascunho: ajusta reserva
    Se aprovado: cria movimento delta (+ ou −)
```

---

## 2. Tabelas envolvidas

### `vendas_erp` — cabeçalho da venda

Colunas críticas:
- `id` (PK), `numero_venda` (sequencial)
- `situacao`: `'rascunho' | 'aprovado' | 'enviado' | 'cancelado' | 'concluido'`
- `bloqueado` (BOOLEAN) — quando true, não pode mais editar
- `cliente_id`, `vendedor_id`, `data_venda`, `data_entrega`
- `total_produtos`, `total_desconto`, `total_frete`, `total_venda`
- `created_by` (UUID), `created_at`, `updated_at`

### `itens_venda_erp` — linhas da venda

- `id` (PK), `venda_id` (FK)
- `produto_id` (BIGINT — FK `public.produtos.id_produto`)
- `nome_produto` (snapshot)
- `quantidade`, `preco_lista`, `pct_desconto`, `preco_unitario`, `total_item`
- `personalizacao` (JSON), `observacao`, `peso_estimado`

### `movimentacoes_estoque_comercial` — onde se deduz/adiciona estoque

- `id` (PK), `produto_id`, `tipo`: `'entrada' | 'saida'`, `quantidade`
- `motivo`: `'venda' | 'producao' | 'transferencia_saida' | 'transferencia_entrada' | 'cancelamento' | 'estorno' | 'ajuste' | 'devolucao'`
- `local_estoque_id` (FK → `locais_estoque`: 1=Fábrica, 2=Loja, 3=Vitrine, 4=Cofre)
- **`status`**: `'efetivado' | 'estornado'` ← chave para integridade
- `estorno_de_id` (auto-ref), `estornado_por_id` (auto-ref)
- `referencia_id`, `referencia_tipo` (`vendas_erp`, `ordens`, `transferencias_ec`)
- `ordem_id`, `protocolo_id`
- `created_by`, `created_at`

### `reservas_estoque_comercial` — bloqueio antes da efetivação

- `id` (PK), `produto_id`, `venda_id`, `item_venda_id`
- `quantidade`, `local_estoque_id` (default=2 "Loja")
- **`status`**: `'ativo' | 'efetivado' | 'cancelado'`
- `efetivado_em`, `cancelado_em`, `movimento_id` (FK → movimento de saída quando efetivada)

### `transferencias_estoque_comercial` — entre locais

- `id` (PK), `produto_id`, `quantidade`
- `local_origem_id`, `local_destino_id`
- **`status`**: `'pendente' | 'concluido' | 'cancelado'`
- `movimento_saida_id` (criado no INSERT), `movimento_entrada_id` (criado ao concluir)
- `enviado_por`, `recebido_por`, `recebido_em`, `cancelado_em`

### View `vw_saldo_estoque_comercial_v2` — fonte da verdade do saldo

Calcula por produto + local:
```
saldo_fisico   = SUM(entrada) - SUM(saida)  WHERE status='efetivado'
total_reservado = SUM(qtd) WHERE reserva.status='ativo'
em_transito    = SUM(qtd) WHERE transferencia.status='pendente'

DISPONÍVEL = saldo_fisico - total_reservado
```

---

## 3. Triggers e funções

| # | Trigger | Tabela | Evento | Função | O que faz |
|---|---|---|---|---|---|
| 1 | `trg_estoque_comercial_baixa_venda` | `itens_venda_erp` | AFTER INSERT | `fn_estoque_comercial_baixa_venda()` | rascunho → cria reserva; aprovada → cria saída direta |
| 2 | `trg_estoque_comercial_aprovar_venda` | `vendas_erp` | BEFORE UPDATE | `fn_estoque_comercial_aprovar_venda()` | Converte cada reserva ativa em movimento saída efetivado |
| 3 | `trg_estoque_comercial_reversao_item` | `itens_venda_erp` | AFTER DELETE | `fn_estoque_comercial_reversao_item()` | Cancela reserva ou cria estorno |
| 4 | `trg_estoque_comercial_cancelamento_venda` | `vendas_erp` | BEFORE UPDATE | `fn_estoque_comercial_cancelamento_venda()` | Cancela reservas + cria estornos |
| 5 | `trg_estoque_comercial_update_qtd_item` | `itens_venda_erp` | AFTER UPDATE | `fn_estoque_comercial_update_qtd_item()` | Recalcula reserva ou cria delta |
| 6 | `trg_estoque_comercial_entrada_producao` | `protocolos` | BEFORE UPDATE | `fn_estoque_comercial_entrada_producao()` | Entrada automática quando protocolo concluído (volta) |
| 7 | `trg_transferencia_ec_envio` | `transferencias_estoque_comercial` | BEFORE INSERT | `fn_transferencia_ec_envio()` | Cria saída imediata, set `movimento_saida_id` |
| 8 | `trg_transferencia_ec_recebimento` | `transferencias_estoque_comercial` | BEFORE UPDATE | `fn_transferencia_ec_recebimento()` | Concluído → entrada; cancelado → estorno |

**Arquivos de origem:**
- `supabase/migrations/107_estoque_comercial.sql` (schema base v1)
- `supabase/migrations/140_estoque_comercial_v2.sql` (v2: reservas + transferências + status)
- `supabase/migrations/141_triggers_estoque_comercial_v2.sql` (8 triggers acima)

---

## 4. Pontos fortes do design (não esquecer ao discutir)

- ✅ `created_by` sempre vem do `getUser()` (server-side), nunca do body do request
- ✅ Estorno SEMPRE cria movimento reverso, NUNCA deleta original — rastreabilidade total
- ✅ `estorno_de_id` ↔ `estornado_por_id` formam par bidirecional (auditável)
- ✅ View consolidada calcula `disponível = físico − reservado` corretamente
- ✅ Transferência em 2 etapas (saída na hora, entrada só ao concluir) — peça em trânsito é visível
- ✅ Bloqueio de cancelar venda com pagamento confirmado (`/api/vendas/[id]/cancelar`)
- ✅ Aprovação valida desconto via `validarDescontos()` server-side com `mx_desconto_permitido`
- ✅ Trigger `proteger_campos_pdv` impede editar campos críticos da ordem após criar
- ✅ `vendas_erp` em transação atômica na criação (ver `/api/vendas/route.ts:110`)

---

## 5. Pontos de risco identificados

> Cada item está classificado: 🔴 ALTO / 🟡 MÉDIO / 🟢 BAIXO + se é **CONFIRMADO** ou **A INVESTIGAR**.

### R1 🔴 CONFIRMADO — Criação de venda NÃO valida saldo disponível

**Onde:** `src/app/api/vendas/route.ts` (POST criar) e `src/app/api/vendas/[id]/itens/route.ts:57` (POST item)

**O que acontece:** ao adicionar item à venda em rascunho, trigger `fn_estoque_comercial_baixa_venda()` cria reserva **sem validar se há saldo disponível**. É possível reservar 100 unidades de um produto que tem saldo físico 5.

**Por que importa:**
- Saldo `disponível` (na view) fica negativo silenciosamente
- Próximas vendas continuam reservando — overbooking
- Quando a venda for **entregue**, vira saída efetivada → saldo físico negativo (sintoma claro de bug)
- Operador descobre no balcão que peça não existe

**Onde a validação JÁ acontece (e devia se replicar):**
- `/api/estoque-comercial/movimentos:53-84` (POST saída manual)
- `/api/estoque-comercial/transferir:72-83` (POST transferência)

**Correção sugerida:** trigger BEFORE INSERT em `itens_venda_erp` valida `disponivel >= quantidade` ou um helper `validarSaldoDisponivel(produto_id, qtd, local_id)` chamado no endpoint.

### R2 🔴 A INVESTIGAR — Devolução do cliente não tem fluxo automático

**Onde:** `devolucoes_venda` existe como tabela, mas Explore não achou trigger que crie `movimentacoes_estoque_comercial` (tipo='entrada', motivo='devolucao') automaticamente.

**Por que importa:**
- Cliente devolve peça → operador precisa criar entrada manual
- Manual = pode esquecer = peça volta pra cofre mas sistema não sabe → divergência no inventário
- Pode também duplicar a entrada → saldo físico inflado

**O que perguntar pro dev:** "como hoje o operador registra devolução de venda? Existe rota dedicada? Vai por `lancamentos_avulso` ou direto em `movimentacoes_estoque_comercial`?"

### R3 🟡 CONFIRMADO — Ordem de reposição automática FORA da transação da venda

**Onde:** `src/app/api/vendas/route.ts:401-468`

**O que acontece:** quando uma venda é criada e o produto precisa ser reposto (não tem na vitrine, precisa vir da fábrica), uma "ordem de reposição" é criada. Mas essa criação acontece **fora da transação** da venda — está documentado em comentário no código.

**Por que importa:** se a venda é criada com sucesso mas a ordem falha (timeout, erro de DB), a venda fica órfã sem ordem associada. Operador acha que pediu reposição mas não pediu.

**Correção sugerida:** mover criação da ordem para dentro da transação (`sql.begin`) ou criar fila de retry idempotente.

### R4 🟡 CONFIRMADO — Validação de desconto só roda na aprovação

**Onde:** `src/app/api/vendas/route.ts:150-168` chama `validarDescontos()` apenas se `situacao !== 'rascunho'`.

**O que acontece:** vendedor pode editar `pct_desconto` em item ainda em rascunho. Se desconto > `mx_desconto_permitido` do vendedor, ele descobre só ao aprovar. Pode burlar editando em rascunho e mandando aprovação rápida (race condition).

**Correção sugerida:** chamar `validarDescontos()` em todo PATCH de item, independente do status da venda.

### R5 🟡 A INVESTIGAR — Race condition em aprovação simultânea

**Hipótese:** dois operadores aprovam vendas diferentes do **mesmo SKU** ao mesmo tempo. Cada trigger `fn_estoque_comercial_aprovar_venda()` lê reservas ativas e cria movimento. Se não há lock, ambos passam → saldo físico vai abaixo de zero.

**Sinal histórico:** commit `4eab92f` (2026-04-30) "Fix false-positive version conflict when approving venda" — sugere que havia (e talvez ainda tenha) issue de versionamento.

**O que perguntar pro dev:** "as funções de aprovação usam advisory lock, SELECT FOR UPDATE, ou versão otimista (`updated_at`)? Como protegemos a aprovação simultânea de 2 vendas pegando o mesmo SKU?"

### R6 🟡 A INVESTIGAR — Status `enviado` e `concluido` da venda

**Hipótese:** `situacao` da venda pode ser `'enviado'` e `'concluido'`, mas Explore não achou triggers que façam algo com estoque nessas transições.

**O que perguntar pro dev:** "quando uma venda passa de aprovado → enviado → concluído, alguma coisa muda no estoque? Ou são só etapas de fulfillment / nota fiscal?"

### R7 🟢 CONFIRMADO — Personalização de produto não impacta estoque diferente

**Onde:** `personalizacao` (JSON) em `itens_venda_erp` — pode mudar peso, gravação, tamanho. Hoje, peças personalizadas dão baixa exatamente como peças padrão.

**Por que importa pouco:** desde que a peça **exista no estoque** com o SKU base, está ok. Mas se uma personalização vira peça "única" (peso muito diferente, ouro de outra liga), pode confundir o inventário físico com o sistema.

**A confirmar:** se há SKU separado por personalização, ou se uma única SKU cobre todas as variações.

### R8 🟢 BAIXO — `parseInt(id)` sem validação em algumas rotas

Padrão menor: várias rotas fazem `parseInt(id)` sem checar `isNaN`. NaN vira null no postgres.js, normalmente cai em `WHERE id = NULL` (não atinge nada). Mas é bandeira amarela pra IDOR futuro.

---

## 6. O que NÃO foi investigado (lacunas honestas)

- Comportamento de **vale-troca** ao criar venda paga com vale (`vale_origem_id`)
- Reserva quando **um item é movido entre vendas** (existe esse fluxo?)
- O que acontece se o **produto for desativado** (`produtos.ativo=false`) enquanto há reservas ativas
- Performance dos triggers em vendas com 50+ itens (algum trigger pode estar fazendo N+1)
- Comportamento das views `vw_saldo_estoque_comercial_*` quando há transferência pendente entre 2 locais

Esses ficam como segunda passada, depois que as queries de auditoria revelarem onde realmente há divergência.

---

## 7. Resumo em 1 parágrafo (para apresentar pro dev)

> "O fluxo de baixa de produto está bem desenhado: 8 triggers cobrem criação, edição, remoção, aprovação, cancelamento e transferência. Modelo de reserva (`reservas_estoque_comercial`) bloqueia disponível antes da efetivação, e estornos sempre criam reverso (nunca delete). View `vw_saldo_estoque_comercial_v2` calcula `disponível = físico − reservado`. Pontos de risco identificados: (R1) criação de venda não valida saldo disponível antes de reservar — pode reservar mais do que existe; (R2) fluxo de devolução do cliente parece ser manual, sem trigger automático; (R3) ordem de reposição fora da transação da venda; (R4) validação de desconto só na aprovação. Risco a investigar: race condition em aprovação simultânea de mesmo SKU. As 10 queries em `2-auditoria-sql.md` revelam se algum desses riscos já causou divergência real no banco — execução é prioridade pra decidir o que entra primeiro no roadmap."
