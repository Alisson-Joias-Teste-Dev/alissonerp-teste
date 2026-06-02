# Cofre de Ouro — Entrada Universal (Opção B)

## Problema Atual (v1)

Cada origem de ouro que entra no cofre depende de tabelas, views e código específicos:

| Origem | Tabela fonte | Como entra | Onde aparece |
|--------|-------------|------------|--------------|
| Venda em ouro | `pagamentos_venda` | Trigger `fn_rastreio_pagamento_ouro` | `vw_cofre_ouro_disponivel` (CTE `vendas_ouro`) |
| Compra de metal | `compras_metal` | Trigger `fn_rastreio_compra_metal` | `vw_cofre_ouro_disponivel` (CTE `compras_metal`) |
| Recebimento de metal | `recebimentos_metal` | Trigger `fn_rastreio_recebimento_metal` | `vw_cofre_ouro_disponivel` (CTE `recebimentos_metal`) |
| Conversão de joias | `conversoes_estoque` | API `aprovar/route.ts` | `vw_cofre_ouro_disponivel` (CTE `conversoes`) |

Para adicionar uma **nova origem** de ouro, é necessário alterar:

- Nova CTE na view `vw_cofre_ouro_disponivel`
- Nova interface TypeScript no `FinanceiroClient.tsx`
- Novo tipo em `OuroMov[]`
- Novo badge na tabela
- Novo `z.enum` no schema da API de baixa
- Novo CHECK constraint em `cofre_ouro_baixa_itens.origem_tipo`
- Novo filtro no cálculo de gramas dos KPIs
- Nova condição no filtro de pendentes

Isso não escala. A cada novo processo (sobra de produção, devolução, ajuste manual, etc.), o custo de manutenção cresce linearmente.

## Solução Proposta (v2)

Criar uma **tabela universal de entradas do cofre**:

### `alissonerp.cofre_ouro_entradas`

```sql
CREATE TABLE alissonerp.cofre_ouro_entradas (
  id            SERIAL PRIMARY KEY,
  origem_tipo   VARCHAR(30) NOT NULL,       -- venda_ouro, compra_metal, conversao, etc.
  origem_id     INTEGER NOT NULL,           -- ID na tabela de origem
  referencia    TEXT NOT NULL,              -- #1234, C-0042, CP-001, etc.
  pessoa_nome   TEXT,                       -- Nome da consultora, fornecedor, aprovador
  data_origem   TIMESTAMPTZ,                -- Data da transação original
  gramas        NUMERIC(10,3) NOT NULL CHECK (gramas > 0),
  valor_brl     NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao    TEXT,
  metadata      JSONB,                      -- Dados extras da origem (flexível)
  status        VARCHAR(20) NOT NULL DEFAULT 'ativo',  -- ativo, baixado, cancelado
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem_tipo, origem_id)           -- Anti-duplicação
);

CREATE INDEX idx_cofre_ouro_entradas_status ON alissonerp.cofre_ouro_entradas (status);
CREATE INDEX idx_cofre_ouro_entradas_origem ON alissonerp.cofre_ouro_entradas (origem_tipo, origem_id);
```

### Helper central: `registrarEntradaCofreOuro()`

```typescript
// src/lib/cofre-ouro-entrada.ts
interface EntradaCofreOuroParams {
  origemTipo: string;
  origemId: number;
  referencia: string;
  pessoaNome?: string;
  dataOrigem?: string;
  gramas: number;
  valorBrl?: number;
  observacao?: string;
  metadata?: Record<string, unknown>;
}

export async function registrarEntradaCofreOuro(params: EntradaCofreOuroParams) {
  await sql`
    INSERT INTO alissonerp.cofre_ouro_entradas
      (origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl, observacao, metadata)
    VALUES (${params.origemTipo}, ${params.origemId}, ${params.referencia},
            ${params.pessoaNome ?? null}, ${params.dataOrigem ?? null}::timestamptz,
            ${params.gramas}, ${params.valorBrl ?? 0},
            ${params.observacao ?? null}, ${params.metadata ? JSON.stringify(params.metadata) : null}::jsonb)
    ON CONFLICT (origem_tipo, origem_id) DO NOTHING
    RETURNING id
  `;
  // Disparar push de notificação (conforme regra de que toda notificação gera push)
  await criarNotificacao({ ... }).catch(() => {});
}
```

### Nova view `vw_cofre_ouro_disponivel`

```sql
WITH entradas AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(gramas), 0)::numeric AS gramas,
    COALESCE(SUM(valor_brl), 0)::numeric AS valor_brl
  FROM alissonerp.cofre_ouro_entradas
  WHERE status = 'ativo'
), baixas AS (
  SELECT COALESCE(SUM(cb.gramas), 0)::numeric AS baixado_gramas
  FROM alissonerp.cofre_ouro_baixas cb
  WHERE cb.status IN ('pendente', 'em_trafego', 'concluido')
)
SELECT
  e.transacoes AS total_transacoes,
  e.gramas AS total_gramas,
  (e.gramas - b.baixado_gramas)::numeric AS disponivel_gramas,
  e.valor_brl AS total_valor_brl
FROM entradas e
CROSS JOIN baixas b;
```

### Baixa usa `entrada_id`

`cofre_ouro_baixa_itens` ganha coluna opcional:

```sql
ALTER TABLE alissonerp.cofre_ouro_baixa_itens
  ADD COLUMN entrada_id INTEGER REFERENCES alissonerp.cofre_ouro_entradas(id);
```

Na baixa, o front seleciona entradas pelo `id` da tabela universal.

### Front unificado

O `FinanceiroClient.tsx` passa a consumir um único endpoint:

```
GET /api/financeiro/cofre-ouro/entradas?status=ativo
```

Retorna todas as entradas (venda, compra, recebimento, conversão, etc.) com formato padronizado.

O tipo `OuroMov` fica simplificado:

```typescript
interface OuroMov {
  id: string;
  origem: string;          // Label de exibição
  origem_tipo: string;      // Código interno
  origem_id: number;
  referencia: string;
  pessoa: string;
  data: string | null;
  ouro_gramas: number;
  valor: number;
}
```

### Benefício

Quando criar um novo processo de ouro no futuro, você só faz:

```typescript
await registrarEntradaCofreOuro({
  origemTipo: "sobra_producao",
  origemId: ordemProducao.id,
  referencia: `OP-${ordemProducao.id}`,
  pessoaNome: operadorNome,
  dataOrigem: new Date().toISOString(),
  gramas: 5.2,
  valorBrl: 0,
});
```

E PRONTO. A entrada aparece automaticamente em:

- Saldo disponível
- Pendentes de baixa
- Histórico
- Filtro de período
- KPIs

Sem mexer em view, front, API, CHECK constraint, ou tipo TypeScript.

---

## Estratégia de Migração Segura

### Fase 1 — Criar sem afetar nada

1. Criar `cofre_ouro_entradas` como tabela paralela.
2. Nenhuma tabela/view/código existente é alterado.
3. O saldo continua vindo da view antiga.

### Fase 2 — Backfill (espelhar dados existentes)

```sql
-- Vendas em ouro confirmadas
INSERT INTO alissonerp.cofre_ouro_entradas
  (origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl)
SELECT 'venda_ouro', pv.id, '#' || v.numero_venda, u.nome, pv.created_at,
       COALESCE(pv.ouro_peso, pv.ouro_gramas), pv.valor
FROM alissonerp.pagamentos_venda pv
JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
LEFT JOIN alissonerp.usuarios u ON u.id = pv.created_by
WHERE pv.forma = 'Ouro' AND pv.status = 'confirmado'
ON CONFLICT (origem_tipo, origem_id) DO NOTHING;

-- Compras de metal confirmadas
INSERT INTO alissonerp.cofre_ouro_entradas
  (origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl)
SELECT 'compra_metal', cm.id, cm.numero, ct.nome, cm.created_at,
       cm.peso_gramas, cm.valor_total
FROM alissonerp.compras_metal cm
LEFT JOIN public.contatos ct ON ct.id_contato = cm.fornecedor_id
WHERE cm.status = 'confirmado' AND cm.cofre_registrado = true
ON CONFLICT (origem_tipo, origem_id) DO NOTHING;

-- Recebimentos de metal ativos
INSERT INTO alissonerp.cofre_ouro_entradas
  (origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl)
SELECT 'recebimento_metal', rm.id, 'RM-' || rm.id, ct.nome, rm.created_at,
       rm.peso_gramas, rm.valor_total
FROM alissonerp.recebimentos_metal rm
LEFT JOIN public.contatos ct ON ct.id_contato = rm.cliente_id
WHERE rm.status = 'ativo' AND rm.cofre_registrado = true
ON CONFLICT (origem_tipo, origem_id) DO NOTHING;

-- Conversões que entraram no cofre
INSERT INTO alissonerp.cofre_ouro_entradas
  (origem_tipo, origem_id, referencia, pessoa_nome, data_origem,
   gramas, valor_brl, observacao)
SELECT 'conversao', ce.id, o.numero_ordem,
       COALESCE(u_aprov.nome, u_criador.nome),
       COALESCE(ce.aprovado_em, ce.created_at),
       ce.peso_total, 0,
       'Conversão de estoque para metal'
FROM alissonerp.conversoes_estoque ce
JOIN alissonerp.ordens o ON o.id = ce.ordem_id
LEFT JOIN alissonerp.usuarios u_aprov ON u_aprov.id = ce.aprovado_por
LEFT JOIN alissonerp.usuarios u_criador ON u_criador.id = ce.created_by
WHERE ce.cofre_registrado = true AND ce.status_conversao = 'concluido'
ON CONFLICT (origem_tipo, origem_id) DO NOTHING;
```

**Chave:** `ON CONFLICT DO NOTHING` impede duplicar entradas. O backfill pode ser reexecutado sem risco.

### Fase 3 — Comparar saldos

```sql
-- Saldo atual (view antiga)
SELECT disponivel_gramas FROM alissonerp.vw_cofre_ouro_disponivel;

-- Saldo novo (tabela universal)
SELECT
  COALESCE(SUM(gramas), 0) -
  COALESCE((SELECT SUM(gramas) FROM alissonerp.cofre_ouro_baixas WHERE status IN ('pendente','em_trafego','concluido')), 0)
  AS disponivel_gramas
FROM alissonerp.cofre_ouro_entradas WHERE status = 'ativo';
```

**Critério de virada:** se a diferença entre os dois for > 0.001g, NÃO virar a chave. Investigar divergência primeiro.

### Fase 4 — Virar listagem (front)

1. Criar endpoint `GET /api/financeiro/cofre-ouro/entradas`.
2. Alterar `FinanceiroClient.tsx` para consumir esse endpoint.
3. O saldo ainda vem da view antiga (segurança).
4. Validar visualmente por alguns dias.

### Fase 5 — Virar baixa

1. Adicionar `entrada_id` em `cofre_ouro_baixa_itens`.
2. Alterar API de baixa para aceitar `entrada_id`.
3. Manter `origem_tipo` e `origem_id` como legado (não remover).

### Fase 6 — Virar saldo

1. Alterar `vw_cofre_ouro_disponivel` para usar `cofre_ouro_entradas`.
2. Rodar comparação final.
3. Se OK, manter. Se divergência, reverter para view antiga.

### Fase 7 — Limpeza (opcional, após estabilização)

1. Remover CTEs individuais da view (vendas_ouro, compras_metal, etc.).
2. Remover colunas legadas de `cofre_ouro_baixa_itens` se não usadas.
3. Depreciar triggers antigas de rastreio.

---

## Riscos e Proteções

| Risco | Proteção |
|-------|----------|
| Perder dados | Nenhum DELETE ou DROP nas fases 1-6. Apenas INSERT e SELECT. |
| Saldo divergente | Fase 3 compara saldo antigo vs novo. Se > 0.001g, não vira. |
| Duplicar entradas | `UNIQUE (origem_tipo, origem_id)` + `ON CONFLICT DO NOTHING`. |
| Quebrar baixa | `entrada_id` é coluna nova opcional. Campos antigos mantidos. |
| Rollback complexo | Cada fase é independente. Rollback = reverter 1 arquivo/view. |

---

## Ordem de Implementação (quando tiver tempo)

1. Criar `cofre_ouro_entradas` + índices (migration nova).
2. Criar helper `registrarEntradaCofreOuro()` em `src/lib/`.
3. Rodar backfill com `ON CONFLICT DO NOTHING`.
4. Comparar saldos (fase 3).
5. Criar endpoint `GET /api/financeiro/cofre-ouro/entradas`.
6. Alterar front para consumir endpoint unificado.
7. Alterar baixa para usar `entrada_id`.
8. Alterar `vw_cofre_ouro_disponivel`.
9. Refatorar conversão para usar o helper.
10. Refatorar compras/recebimentos/vendas para usar o helper.
