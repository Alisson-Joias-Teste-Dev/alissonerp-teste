# Fluxo de Teste — Conversão de SKU

## Pré-requisitos

- Migrations 253 e 254 aplicadas no banco
- `npm run dev` rodando (`http://localhost:3000`)
- Usuário logado com role `admin` (para aprovar) e `estoquista_loja` (para criar)
- Ter produtos com estoque disponível no local de origem

---

## FASE 1 — Solicitação + Aprovação

### 1.1 Criar Conversão SKU via Frontend

1. Acessar `http://localhost:3000/conversoes`
2. Clicar **"Nova Conversão"** → **"Conversão de SKU"**
3. No campo **"SKU Origem"**:
   - Digitar nome ou SKU de um produto (ex: "Anel")
   - Clicar no resultado para selecionar
   - Informar **Quantidade** (ex: 1), **Peso Total** (ex: 5.0), **Local Origem** (ex: Loja)
4. No campo **"SKU Destino"**:
   - Digitar nome do SKU que será produzido
   - Clicar no resultado
   - Informar **Quantidade Desejada** (ex: 1), **Local Destino** (ex: Loja)
5. Tirar foto da balança com o peso da peça
6. Clicar **"Solicitar Conversão SKU"**
7. A IA valida o peso da foto (tolerância ±0.1g)

**Resultado esperado:**
- Modal fecha com sucesso
- Ordem CS-XXXX aparece na lista com status **"Pendente"**
- Tarefa de aprovação criada para admin

### 1.2 Verificar no Banco

```sql
-- Ver ordem criada
SELECT id, numero_ordem, tipo_ordem::text, status::text
FROM alissonerp.ordens
WHERE tipo_ordem::text = 'conversao_sku'
ORDER BY id DESC LIMIT 3;

-- Ver conversao_sku
SELECT id, ordem_id, status_conversao, sku_origem_id, sku_destino_id
FROM alissonerp.conversoes_sku
ORDER BY id DESC LIMIT 3;

-- Ver reserva
SELECT id, produto_id, quantidade, status
FROM alissonerp.reservas_estoque_comercial
WHERE ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX')
  AND status = 'ativo';

-- Ver tarefa de aprovação
SELECT id, titulo, status::text, tipo
FROM alissonerp.tarefas
WHERE ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

### 1.3 Aprovar via Tarefas

1. Acessar `http://localhost:3000/tarefas`
2. Localizar tarefa "Aprovação de Conversão SKU — Ordem CS-XXXX"
3. Clicar para abrir o drawer
4. Clicar **"Aprovar"**

**Resultado:**
- Status da conversão muda para **"Aprovado"**
- Agora aparece em `vw_ordens_prontas_ida`

### 1.4 Verificar no Banco

```sql
-- Confirmar aprovação
SELECT status_conversao, aprovado_por, aprovado_em
FROM alissonerp.conversoes_sku
WHERE ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');

-- Ver se aparece para protocolo
SELECT * FROM alissonerp.vw_ordens_prontas_ida
WHERE id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

---

## FASE 2 — Protocolo Ida (Loja → Fábrica/Service)

### 2.1 Criar Protocolo Ida

1. Acessar `http://localhost:3000/protocolos`
2. Clicar **"Novo Protocolo"**
3. Selecionar:
   - **Direção:** Ida (Loja → Fábrica)
   - **Tipo:** Fábrica (ou Service)
   - **Ordens:** Selecionar CS-XXXX
4. Confirmar

**Resultado esperado:**
- Protocolo criado com status **"Pendente"**
- Movimento de SAÍDA do SKU origem do local de origem criado

### 2.2 Verificar no Banco

```sql
-- Ver protocolo
SELECT id, direcao::text, etapas::text, tipo_protocolo
FROM alissonerp.protocolos
ORDER BY id DESC LIMIT 3;

-- Ver movimento de saída
SELECT produto_id, tipo, quantidade, motivo, local_estoque_id, status
FROM alissonerp.movimentacoes_estoque_comercial
WHERE motivo = 'conversao_sku_ida'
  AND tipo = 'saida'
ORDER BY id DESC LIMIT 3;
```

### 2.3 Concluir Protocolo Ida

1. No detalhe do protocolo, clicar **"Concluir Protocolo"**
2. Tirar foto de confirmação
3. Confirmar

**Resultado esperado:**
- Protocolo concluído
- Trigger cria:
  - Movimento de ENTRADA do SKU origem na fábrica/service
  - Conversão atualiza para **"Na Fábrica"** (em_fabrica)
  - Ordem de serviço (servico_interno) criada automaticamente

### 2.4 Verificar no Banco

```sql
-- Ver entrada na fábrica
SELECT produto_id, tipo, quantidade, motivo, local_estoque_id
FROM alissonerp.movimentacoes_estoque_comercial
WHERE motivo = 'conversao_sku_ida'
  AND tipo = 'entrada'
ORDER BY id DESC LIMIT 3;

-- Ver status atualizado
SELECT id, ordem_id, status_conversao
FROM alissonerp.conversoes_sku
WHERE ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');

-- Ver OS criada
SELECT id, numero_ordem, tipo_ordem::text, status::text, rota::text
FROM alissonerp.ordens
WHERE id_ordem_relacionada = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

---

## FASE 3 — Execução (Operador na Fábrica)

### 3.1 Executar Conversão via Frontend

1. Acessar `http://localhost:3000/conversoes/ORDEM_ID`
2. Ver detalhes: SKU origem → SKU destino, status **"Na Fábrica"**
3. Clicar **"Executar Conversão SKU"** (visível para operador/admin)

### 3.2 Preencher Resultado

No modal **"Executar Conversão SKU"**:

| Campo | Exemplo | Descrição |
|-------|---------|-----------|
| Peso Final | 4.5 | Peso do SKU destino produzido |
| Qtd Produzida | 1 | Quantidade de SKU destino produzida |
| Foto da Balança | 📸 | Foto do SKU destino na balança |
| Peso da Sobra | 0.3 | (opcional) Restante que não virou SKU |
| Foto da Sobra | 📸 | (opcional) Foto do restante |

**Cálculos automáticos** (mostrados ao vivo no modal):
- **Sobra calculada** = Peso origem - Peso final
- **Sobra real** = digitado pelo operador
- **Quebra** = Sobra calculada - Sobra real

### 3.3 Exemplos de Cenários

| Cenário | Peso Origem | Peso Final | Sobra Calc | Sobra Real | Quebra |
|---------|------------|------------|------------|------------|--------|
| Sem sobra | 10.0g | 10.0g | 0g | — | 0 |
| Sobra exata | 10.0g | 9.5g | 0.5g | 0.5g | 0 |
| Sobra parcial | 10.0g | 9.5g | 0.5g | 0.3g | **0.2g** |
| Tudo quebra | 10.0g | 9.5g | 0.5g | 0 | **0.5g** |

### 3.4 Verificar no Banco

```sql
-- Ver movimentos de consumo e produção
SELECT produto_id, tipo, quantidade, motivo, local_estoque_id
FROM alissonerp.movimentacoes_estoque_comercial
WHERE motivo IN ('conversao_sku_consumo', 'conversao_sku_producao')
ORDER BY id DESC LIMIT 5;

-- Ver entrada de insumo (sobra)
SELECT entrada, insumo_id, local_estoque_id, obs
FROM alissonerp.movimentacoes_estoque
WHERE obs LIKE '%Sobra%'
ORDER BY id DESC LIMIT 3;

-- Ver resultado na conversão
SELECT id, status_conversao, peso_final, quantidade_produzida,
       peso_sobra_calculado, peso_sobra_real, quebra
FROM alissonerp.conversoes_sku
WHERE ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');

-- Ver OS concluída
SELECT id, numero_ordem, status::text, data_conclusao
FROM alissonerp.ordens
WHERE id_ordem_relacionada = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

---

## FASE 4 — Protocolo Volta (Fábrica → Loja)

### 4.1 Verificar Ordem Pronta para Volta

```sql
SELECT * FROM alissonerp.vw_ordens_prontas_volta
WHERE id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

**Resultado:** Ordem CS-XXXX deve aparecer na view.

### 4.2 Criar Protocolo Volta

1. Acessar `http://localhost:3000/protocolos`
2. Clicar **"Novo Protocolo"**
3. Selecionar:
   - **Direção:** Volta (Fábrica → Loja)
   - **Tipo:** (mesmo do ida)
   - **Ordens:** Selecionar CS-XXXX
4. Confirmar

**Resultado esperado:**
- Protocolo volta criado
- Movimento de SAÍDA do SKU destino da fábrica

### 4.3 Verificar no Banco

```sql
-- Ver saída do SKU destino
SELECT produto_id, tipo, quantidade, motivo, local_estoque_id
FROM alissonerp.movimentacoes_estoque_comercial
WHERE motivo = 'conversao_sku_volta'
  AND tipo = 'saida'
ORDER BY id DESC LIMIT 3;
```

### 4.4 Concluir Protocolo Volta

1. No detalhe do protocolo, clicar **"Concluir Protocolo"**
2. Tirar foto de confirmação
3. Confirmar

**Resultado esperado:**
- Movimento de ENTRADA do SKU destino no local destino final (ex: Loja)
- Status da conversão → **"Concluído"**
- Ordem CS-XXXX → **"Concluído"**

### 4.5 Verificar no Banco

```sql
-- Ver entrada no destino final
SELECT produto_id, tipo, quantidade, motivo, local_estoque_id
FROM alissonerp.movimentacoes_estoque_comercial
WHERE motivo = 'conversao_sku_volta'
  AND tipo = 'entrada'
ORDER BY id DESC LIMIT 3;

-- Ver conversão concluída
SELECT cs.status_conversao, o.status::text AS ordem_status, o.data_conclusao
FROM alissonerp.conversoes_sku cs
JOIN alissonerp.ordens o ON o.id = cs.ordem_id
WHERE cs.ordem_id = (SELECT id FROM alissonerp.ordens WHERE numero_ordem = 'CS-XXXX');
```

---

## Verificações Finais

### Stock Ledger (imutável)

```sql
-- Ver entradas no stock_ledger_entry
SELECT item_id, actual_qty, voucher_type, voucher_id, obs
FROM alissonerp.stock_ledger_entry
WHERE voucher_type IN ('transferencia', 'ordem_producao')
  AND obs LIKE '%SKU%'
ORDER BY id DESC LIMIT 10;
```

### Estoque do SKU Origem

```sql
-- Ver saldo atual do SKU origem (deve ter diminuído)
SELECT produto_id, local_estoque_id, saldo_fisico, reservado, disponivel
FROM alissonerp.vw_saldo_estoque_comercial_v2
WHERE produto_id = <SKU_ORIGEM_ID>;
```

### Estoque do SKU Destino

```sql
-- Ver saldo atual do SKU destino (deve ter aumentado no local_destino)
SELECT produto_id, local_estoque_id, saldo_fisico, reservado, disponivel
FROM alissonerp.vw_saldo_estoque_comercial_v2
WHERE produto_id = <SKU_DESTINO_ID>;
```

### Estoque de Insumo (Sobra)

```sql
-- Ver entrada do insumo da sobra
SELECT insumo_id, SUM(entrada) - SUM(saida) AS saldo_atual
FROM alissonerp.movimentacoes_estoque
WHERE insumo_id = 1 AND obs LIKE '%Sobra%'
GROUP BY insumo_id;
```

---

## Resumo do Fluxo

```
1. Cria conversão SKU          → pendente
2. Admin aprova                → aprovado
3. Protocolo ida criado        → saida SKU origem da loja
4. Protocolo ida concluído     → entrada SKU origem na fábrica + OS criada
5. Operador executa serviço    → consumo origem + produção destino + sobra insumo
6. Protocolo volta criado      → saida SKU destino da fábrica
7. Protocolo volta concluído   → entrada SKU destino na loja → CONCLUÍDO
```

**Total de movimentações de estoque esperadas** (por conversão):
1. Saída: `conversao_sku_ida` (protocolo ida)
2. Entrada: `conversao_sku_ida` (protocolo ida concluído)
3. Saída: `conversao_sku_consumo` (execução)
4. Entrada: `conversao_sku_producao` (execução)
5. Entrada (insumo): sobra (execução, se houver)
6. Saída: `conversao_sku_volta` (protocolo volta)
7. Entrada: `conversao_sku_volta` (protocolo volta concluído)
