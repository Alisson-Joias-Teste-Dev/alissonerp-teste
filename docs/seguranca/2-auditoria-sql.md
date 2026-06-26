# Auditoria SQL — Validar Integridade da Baixa

> **Para quem:** Dono executa no SQL Editor do Supabase. Dev valida resultado se necessário.
> **Tipo:** TODAS as queries são **read-only** (SELECT). ZERO risco de alterar dados.
> **Tempo estimado:** 15-30 minutos pra rodar todas + interpretar resultado.

---

## Como usar este documento

1. Abre o SQL Editor do Supabase (`alissonjoiass.supabase.co` → SQL Editor → New query)
2. Roda **uma query por vez** (Q1 → Q2 → ... → Q10)
3. Cola o resultado na conversa, ou registra na seção **"Resultados encontrados"** no fim deste arquivo
4. No fim, classifica cada divergência em: **operacional / bug / suspeito** (ver `README.md` decisão #3)

> **Importante:** se uma query der erro de "tabela não existe" ou "coluna inexistente", me avisa que ajusto. O nome das colunas vem do mapeamento do `1-diagnostico-fluxo-baixa.md` mas pode ter variação.

---

## Q1 — Vendas APROVADAS sem movimento de saída correspondente

**O que descobre:** vendas que foram aprovadas (e teriam que ter virado saída de estoque) mas **não há movimento na `movimentacoes_estoque_comercial`** referenciando elas.

**Sintoma de:** trigger `fn_estoque_comercial_aprovar_venda` falhou silenciosamente, ou venda foi aprovada antes do trigger existir.

```sql
SELECT
  v.id              AS venda_id,
  v.numero_venda,
  v.situacao,
  v.data_venda,
  v.created_at,
  v.created_by,
  COUNT(iv.id)      AS qtd_itens,
  SUM(iv.quantidade) AS qtd_total
FROM alissonerp.vendas_erp v
INNER JOIN alissonerp.itens_venda_erp iv ON iv.venda_id = v.id
WHERE v.situacao IN ('aprovado', 'enviado', 'concluido')
  AND v.bloqueado = true
  AND NOT EXISTS (
    SELECT 1
    FROM alissonerp.movimentacoes_estoque_comercial mec
    WHERE mec.referencia_tipo = 'vendas_erp'
      AND mec.referencia_id   = v.id
      AND mec.motivo          = 'venda'
      AND mec.tipo            = 'saida'
  )
  AND v.created_at >= '2026-04-22'  -- desde a migração Tiny
GROUP BY v.id, v.numero_venda, v.situacao, v.data_venda, v.created_at, v.created_by
ORDER BY v.data_venda DESC;
```

**Resultado esperado em sistema saudável:** 0 linhas.

**Se aparecer:** lista das vendas que estão "no papel" como aprovadas mas não tiraram do estoque.

---

## Q2 — Movimentos de SAÍDA (motivo='venda') sem venda origem

**O que descobre:** movimentos de saída marcados como motivo='venda' mas que **não conseguimos achar a venda original**.

**Sintoma de:** referência quebrada (referencia_id apontando pra ID inexistente), ou venda deletada (não devia acontecer).

```sql
SELECT
  mec.id              AS movimento_id,
  mec.produto_id,
  mec.quantidade,
  mec.local_estoque_id,
  mec.referencia_id   AS venda_id_referenciada,
  mec.created_at,
  mec.created_by,
  mec.status
FROM alissonerp.movimentacoes_estoque_comercial mec
WHERE mec.motivo         = 'venda'
  AND mec.tipo           = 'saida'
  AND mec.referencia_tipo = 'vendas_erp'
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.vendas_erp v WHERE v.id = mec.referencia_id
  )
  AND mec.created_at >= '2026-04-22'
ORDER BY mec.created_at DESC;
```

**Resultado esperado:** 0 linhas.

---

## Q3 — Reservas órfãs (venda cancelada/concluída mas reserva ainda 'ativo')

**O que descobre:** reservas marcadas como `status='ativo'` cuja venda já foi cancelada ou já passou pra concluído. Estão bloqueando saldo "disponível" sem motivo.

**Sintoma de:** trigger de cancelamento ou aprovação não atualizou a reserva — saldo disponível fica menor que o real.

```sql
SELECT
  r.id            AS reserva_id,
  r.produto_id,
  r.quantidade,
  r.local_estoque_id,
  r.status        AS reserva_status,
  r.created_at    AS reserva_criada,
  v.id            AS venda_id,
  v.numero_venda,
  v.situacao      AS venda_situacao,
  v.created_at    AS venda_criada
FROM alissonerp.reservas_estoque_comercial r
INNER JOIN alissonerp.vendas_erp v ON v.id = r.venda_id
WHERE r.status = 'ativo'
  AND v.situacao IN ('cancelado', 'concluido')
ORDER BY r.created_at DESC;
```

**Resultado esperado:** 0 linhas.

**Correção operacional rápida (se aparecer):** rodar UPDATE manual marcando reserva como `'cancelado'` (com `cancelado_em=now()`). Mas confirmar com dev antes — pode haver razão.

---

## Q4 — Saldos NEGATIVOS por produto + local

**O que descobre:** combinações produto + local onde `saldo_fisico` está abaixo de zero. Isso é **fisicamente impossível** — sintoma claro de baixa duplicada ou erro de fluxo.

```sql
SELECT
  v.local_nome,
  v.produto_id,
  v.sku,
  v.nome_produto,
  v.saldo_fisico,
  v.reservado,
  v.disponivel
FROM alissonerp.vw_saldo_estoque_comercial_v2 v
WHERE v.saldo_fisico < 0
   OR v.disponivel   < 0
ORDER BY v.saldo_fisico ASC;
```

**Resultado esperado:** 0 linhas (saldo nunca pode ser negativo).

**Se aparecer:** crítico. Cada linha é uma divergência — peça que o sistema acha que tem em quantidade negativa. Investigar via Q1, Q2, Q7 e audit_log.

---

## Q5 — Vendas com `total_produtos` diferente da soma dos itens

**O que descobre:** integridade dos totais. `vendas_erp.total_produtos` deveria = SOMA dos `itens_venda_erp.total_item`.

**Sintoma de:** desconto/edição de item não recalculou o total da venda. Pode ser sintoma de fraude (editar valor depois de aprovar) ou só bug de cálculo.

```sql
SELECT
  v.id            AS venda_id,
  v.numero_venda,
  v.situacao,
  v.total_produtos,
  COALESCE(SUM(iv.total_item), 0) AS soma_itens,
  v.total_produtos - COALESCE(SUM(iv.total_item), 0) AS diferenca,
  v.created_at,
  v.updated_at
FROM alissonerp.vendas_erp v
LEFT JOIN alissonerp.itens_venda_erp iv ON iv.venda_id = v.id
WHERE v.created_at >= '2026-04-22'
GROUP BY v.id, v.numero_venda, v.situacao, v.total_produtos, v.created_at, v.updated_at
HAVING ABS(v.total_produtos - COALESCE(SUM(iv.total_item), 0)) > 0.01
ORDER BY ABS(v.total_produtos - COALESCE(SUM(iv.total_item), 0)) DESC;
```

**Resultado esperado:** 0 linhas (ou só vendas em rascunho com itens em edição).

---

## Q6 — Reservas SEM item de venda correspondente

**O que descobre:** reservas órfãs no sentido inverso — `item_venda_id` aponta pra item que não existe mais.

```sql
SELECT
  r.id            AS reserva_id,
  r.venda_id,
  r.item_venda_id AS item_referenciado,
  r.produto_id,
  r.quantidade,
  r.status,
  r.created_at
FROM alissonerp.reservas_estoque_comercial r
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.itens_venda_erp iv WHERE iv.id = r.item_venda_id
)
ORDER BY r.created_at DESC;
```

**Resultado esperado:** 0 linhas. (Se um item foi deletado, sua reserva deve ter sido cancelada.)

---

## Q7 — Estornos sem original ou par bidirecional quebrado

**O que descobre:** movimentos com `estorno_de_id` apontando pra ID que não existe, ou movimentos marcados como `'estornado'` sem ninguém apontando pra eles.

```sql
-- Caso A: estorno aponta pra original que não existe
SELECT 'orfao_aponta_p_inexistente' AS tipo, mec.id AS movimento_id, mec.estorno_de_id AS aponta_para_id, mec.created_at
FROM alissonerp.movimentacoes_estoque_comercial mec
WHERE mec.estorno_de_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial orig
    WHERE orig.id = mec.estorno_de_id
  )

UNION ALL

-- Caso B: marcado como estornado mas ninguém aponta pra ele
SELECT 'estornado_sem_reverso', mec.id, mec.estornado_por_id, mec.created_at
FROM alissonerp.movimentacoes_estoque_comercial mec
WHERE mec.status = 'estornado'
  AND (mec.estornado_por_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial rev
    WHERE rev.id = mec.estornado_por_id
  ))

ORDER BY created_at DESC;
```

**Resultado esperado:** 0 linhas.

---

## Q8 — Vendas APROVADAS sem ter passado por rascunho (fluxo direto)

**O que descobre:** vendas que foram criadas já com `situacao='aprovado'` (pulando o estado intermediário). Não é necessariamente errado, mas merece um olhar — pode ser entrada via API direta sem passar pelo fluxo normal.

```sql
SELECT
  v.id,
  v.numero_venda,
  v.situacao,
  v.created_at,
  v.updated_at,
  v.created_by,
  EXTRACT(EPOCH FROM (v.updated_at - v.created_at)) AS segundos_entre_criar_e_atualizar
FROM alissonerp.vendas_erp v
WHERE v.situacao IN ('aprovado', 'enviado', 'concluido')
  AND v.created_at >= '2026-04-22'
  AND v.created_at = v.updated_at  -- nunca foi atualizado depois
ORDER BY v.created_at DESC;
```

**Interpretação:** se aparecer, anotar quem é o `created_by`. Pode ser legítimo (script de import, integração Tiny) ou suspeito.

---

## Q9 — Resumo geral: vendas e movimentos no período

**O que descobre:** dashboard simples — quantas vendas aprovadas/canceladas e quantos movimentos por dia desde a migração. Olho rápido pra ver se tem dia anômalo.

```sql
SELECT
  DATE(v.data_venda) AS dia,
  v.situacao,
  COUNT(*)           AS qtd_vendas,
  SUM(v.total_venda) AS faturamento,
  COUNT(DISTINCT v.created_by) AS vendedores_distintos
FROM alissonerp.vendas_erp v
WHERE v.created_at >= '2026-04-22'
GROUP BY DATE(v.data_venda), v.situacao
ORDER BY dia DESC, v.situacao;
```

E em paralelo (rodar separado):

```sql
SELECT
  DATE(mec.created_at)        AS dia,
  mec.motivo,
  mec.tipo,
  mec.status,
  COUNT(*)                    AS qtd_movimentos,
  SUM(mec.quantidade)         AS qtd_pecas
FROM alissonerp.movimentacoes_estoque_comercial mec
WHERE mec.created_at >= '2026-04-22'
GROUP BY DATE(mec.created_at), mec.motivo, mec.tipo, mec.status
ORDER BY dia DESC, mec.motivo;
```

**Para que serve:** dia com cancelamento muito acima da média, dia com 100 movimentos manuais (`motivo='ajuste'`), dia com volume estranho — bandeira pra investigar.

---

## Q10 — Produtos com mais reservas ATIVAS que saldo físico

**O que descobre:** combinações produto+local onde `total_reservado > saldo_fisico`. Significa que o sistema **prometeu mais peças do que tem**. Próxima venda aprovada vai estourar o saldo.

```sql
SELECT
  v.local_nome,
  v.produto_id,
  v.sku,
  v.nome_produto,
  v.saldo_fisico,
  v.reservado,
  v.disponivel,
  (v.reservado - v.saldo_fisico) AS overbooking
FROM alissonerp.vw_saldo_estoque_comercial_v2 v
WHERE v.reservado > v.saldo_fisico
  AND v.saldo_fisico >= 0  -- excluir os já negativos (vão na Q4)
ORDER BY (v.reservado - v.saldo_fisico) DESC;
```

**Resultado esperado:** 0 linhas (sintoma direto de R1 — criação de venda sem validar saldo).

---

## Q11 (BÔNUS) — Devoluções registradas sem trigger automático

**O que descobre:** se a tabela `devolucoes_venda` existe e tem registros, ver se cada devolução gerou um movimento de entrada (`motivo='devolucao'`). Se não gerou, alguém precisa ter feito ajuste manual ou a peça sumiu do sistema.

```sql
SELECT
  d.id            AS devolucao_id,
  d.venda_id,
  d.produto_id,
  d.quantidade,
  d.created_at,
  d.created_by,
  EXISTS (
    SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial mec
    WHERE mec.motivo         = 'devolucao'
      AND mec.referencia_tipo = 'devolucoes_venda'
      AND mec.referencia_id   = d.id
      AND mec.tipo            = 'entrada'
  ) AS gerou_entrada
FROM alissonerp.devolucoes_venda d
WHERE d.created_at >= '2026-04-22'
ORDER BY d.created_at DESC;
```

**Atenção:** essa query pode dar erro se a tabela não se chama `devolucoes_venda` ou se a coluna `motivo` não tem valor `'devolucao'`. Se der erro, me avisa que confirmo o schema.

---

## Resultados encontrados

> Preencher conforme rodar cada query. Anotar data/hora + interpretação.

### Data: ___________

| Query | Linhas retornadas | Interpretação |
|---|---|---|
| Q1 — Vendas aprovadas sem saída | __ | __ |
| Q2 — Saídas sem venda origem | __ | __ |
| Q3 — Reservas órfãs | __ | __ |
| Q4 — Saldos negativos | __ | __ |
| Q5 — Total venda ≠ soma itens | __ | __ |
| Q6 — Reservas sem item | __ | __ |
| Q7 — Estornos sem par | __ | __ |
| Q8 — Vendas direto-aprovadas | __ | __ |
| Q9 — Resumo geral | __ | __ |
| Q10 — Overbooking de reservas | __ | __ |
| Q11 — Devoluções sem entrada | __ | __ |

---

## Próximo passo após rodar

1. **Se TODAS as queries retornaram 0** (exceto Q9 que é só resumo): boa notícia — o fluxo está intacto até onde a auditoria SQL alcança. Roadmap em `3-roadmap-correcoes.md` vira preventivo.
2. **Se alguma query retornou linhas**: cada linha precisa ser classificada (operacional / bug / suspeito). O que for **bug** vira issue prioritária no `3-roadmap-correcoes.md`. O que for **suspeito** entra em investigação separada (audit_log + entrevista com operador).
3. **Em qualquer caso**: levar o resultado pro dev junto com o `1-diagnostico-fluxo-baixa.md` e o `3-roadmap-correcoes.md`. Conversa de 30 min decide o que entra primeiro.
