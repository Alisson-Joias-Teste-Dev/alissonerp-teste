# Levantamento de Arquitetura — Módulo de Produtos (ERP Alisson Joias)

> **Data:** 20/05/2026  
> **Autor:** Agente 🏛️ Architect  
> **Estado:** PLAN (análise completa, sem modificações)  
> **Escopo:** Todas as rotas `/api/produtos/*`, libs de negócio, views de estoque, triggers, schema legado vs novo

---

## Sumário

1. [Diagnóstico da Situação Atual](#1-diagnóstico-da-situação-atual)
   - [1.1 Fontes de Dados do Produto](#11-fontes-de-dados-do-produto)
   - [1.2 Matriz Campo × Origem × Destino](#12-matriz-campo--origem--destino)
   - [1.3 Duplicações de Schema](#13-duplicações-de-schema)
   - [1.4 As 5 Fontes de Preço](#14-as-5-fontes-de-preço)
   - [1.5 Cálculo de Saldo de Estoque](#15-cálculo-de-saldo-de-estoque)
2. [Análise de Inconsistências](#2-análise-de-inconsistências)
   - [2.1 Por que o Saldo Não Bate](#21-por-que-o-saldo-não-bate)
   - [2.2 Por que o Preço Difere Entre Telas](#22-por-que-o-preço-difere-entre-telas)
   - [2.3 Pontos de Falha Críticos](#23-pontos-de-falha-críticos)
3. [Proposta de Arquitetura Alvo](#3-proposta-de-arquitetura-alvo)
   - [3.1 Centralização do Produto (Schema Único)](#31-centralização-do-produto-schema-único)
   - [3.2 Estratégia para Eliminar public.produtos como Escrita](#32-estratégia-para-eliminar-publicprodutos-como-escrita)
   - [3.3 Unificação do Preço](#33-unificação-do-preço)
   - [3.4 Saldo de Estoque Consistente](#34-saldo-de-estoque-consistente)
   - [3.5 Separação Dados do Produto vs Dados de Estoque](#35-separação-dados-do-produto-vs-dados-de-estoque)
4. [Roteiro de Refatoração](#4-roteiro-de-refatoração)
   - [4.1 Curto Prazo (Bugs Críticos)](#41-curto-prazo-bugs-críticos)
   - [4.2 Médio Prazo (Refatoração Estrutural)](#42-médio-prazo-refatoração-estrutural)
   - [4.3 Longo Prazo (Migração Completa)](#43-longo-prazo-migração-completa)
5. [Riscos](#5-riscos)
   - [5.1 Regras de Negócio que Podem Quebrar](#51-regras-de-negócio-que-podem-quebrar)
   - [5.2 Dependências com Outros Módulos](#52-dependências-com-outros-módulos)
   - [5.3 Impacto em Integrações](#53-impacto-em-integrações)

---

## 1. Diagnóstico da Situação Atual

### 1.1 Fontes de Dados do Produto

O módulo de produtos **NÃO tem uma única fonte da verdade**. Os dados estão espalhados entre dois schemas ( `public` e `alissonerp` ), cada um com múltiplas tabelas:

#### Schema `public` (legado, read-only no conceito, mas escrito pelo código)

| Tabela | Função | Dono |
|--------|--------|------|
| `public.produtos` | Tabela **principal** do produto. Contém ~40+ colunas: SKU, nome, peso, preços (preco_sync, preco_tiny, preco_pedras, preco_total_sync), markup, fator, categoria, tipo_metal, situacao, etc. | Directus (legado) + Tiny ERP + nosso código |
| `public.parametros` | Cotação do ouro (`ouro`), dólar (`dollar`), prata (`prata_manual`) — usada em TODOS os cálculos de preço | Manual |
| `public.estoque` | Saldo de estoque legado por SKU (colunas: `saldo`, `estoque_loja`). **SEM UNIQUE** em sku. | Directus legado |
| `public.categoria_precificacao` | (provavelmente) Categorias de preço legadas | Directus |

#### Schema `alissonerp` (novo, fonte de verdade para dados ERP)

| Tabela | Função |
|--------|--------|
| `alissonerp.erp_produtos` | **Tabela complementar** do produto. Relação pai/variação, medidas (largura_aro, altura_aro, base), observacao_erp, fornecedor. Relaciona 1:1 com `public.produtos.produto_id`. |
| `alissonerp.produto_composicao` | BOM (Bill of Materials) — insumos/pedras que compõem cada produto |
| `alissonerp.produto_pedra_extras` | Dados extras de pedra: `peso_ct`, `preco_compra_usd`, `quantidade` |
| `alissonerp.produto_tipo_item` | Classificação do produto: `joia` ou `insumo` |
| `alissonerp.produto_curva_aplicada` | Markup, comissão e max_desconto calculados pela curva dinâmica |
| `alissonerp.produto_personalizacao` | Config de personalização (preço/peso por letra) |
| `alissonerp.produto_personalizacao_campos` | Multi-campos de personalização |
| `alissonerp.produto_imagens` | Galeria de imagens + ficha técnica |
| `alissonerp.fichas_tecnicas_produto` | Ficha técnica com medidas vindas da IA |
| `alissonerp.promocao_itens` | Preços promocionais por produto |
| `alissonerp.movimentacoes_estoque_comercial` | **Fonte de verdade** do estoque comercial (movimentações por produto_id) |
| `alissonerp.estoque_comercial_config` | Config de estoque mínimo por produto |
| `alissonerp.produto_rota` | Rota de fabricação (etapas por produto) |
| `alissonerp.tiny_sync_produtos` | Fila de sincronização com Tiny ERP |
| `alissonerp.vw_produto_preco_vigente` | View que retorna preço vigente (considerando promoções ativas) |
| `alissonerp.vw_produto_capa` | View da foto de capa |
| `alissonerp.vw_produto_imagens` | View agregada de imagens (JSON) |
| `alissonerp.vw_saldo_estoque_comercial_v2` | View de saldo por local (físico, reservado, disponível) |
| `alissonerp.vw_estoque_directus_saldo` | View de saldo legado Directus (insumos) |

### 1.2 Matriz Campo × Origem × Destino

| Campo | Onde é Lido (SELECT) | Onde é Escrito (INSERT/UPDATE) | Fonte Primária |
|-------|-------------------|-------------------------------|----------------|
| `id_produto` | public.produtos | `nextval('alissonerp.seq_produto_id')` | Sequência alissonerp |
| `sku` | public.produtos | POST /api/produtos → public.produtos + alissonerp.erp_produtos | **Duplicado** em ambas |
| `nome` | public.produtos | POST/PATCH → public.produtos (+ erp_produtos) | **Duplicado** |
| `tipo_metal` | public.produtos | PATCH → public.produtos | public.produtos |
| `peso_precificado` | public.produtos | PATCH → public.produtos | public.produtos |
| `markup` | public.produtos | Curva → public.produtos (via trigger) | public.produtos |
| `fator` | public.produtos | PATCH → public.produtos | public.produtos |
| `categoria` (categoria_geral) | public.produtos | PATCH → public.produtos | public.produtos |
| `categoria_precificacao` | public.produtos | PATCH → public.produtos | public.produtos |
| `situacao` | public.produtos | PATCH → public.produtos | public.produtos |
| `tem_pedra_preciosa` | public.produtos | PATCH → public.produtos | public.produtos |
| `preco_tiny` | public.produtos | PATCH → public.produtos (ou trigger pedra) | Tiny ERP / manual |
| `preco_sync` | public.produtos | **Trigger** `atualizar_preco_produto_v2()` (BEFORE INSERT/UPDATE) | Trigger (peso × cotação × markup × fator) |
| `preco_pedras` | public.produtos | `recalcularPrecoPedras()` → UPDATE | Soma BOM (USD × dólar × markup faixa) |
| `preco_total_sync` | public.produtos | `recalcularPrecoPedras()` → UPDATE | preco_sync + preco_pedras |
| `diferenca_percentual` | public.produtos | Trigger `z_trigger_atualiza_diferenca_percentual` | (preco_tiny - preco_sync) / preco_sync |
| `cor_metal` | alissonerp.erp_produtos | POST → erp_produtos | **Só** em erp_produtos |
| `largura_aro, altura_aro, base` | alissonerp.erp_produtos | PATCH → erp_produtos upsert | **Só** em erp_produtos |
| `observacao_erp` | alissonerp.erp_produtos | PATCH → erp_produtos upsert | **Só** em erp_produtos |
| `fornecedor` | alissonerp.erp_produtos | PATCH → erp_produtos upsert | **Só** em erp_produtos |
| `parent_sku, parent_id, eh_pai, eh_variacao` | alissonerp.erp_produtos | POST → erp_produtos | **Só** em erp_produtos |
| `numeracao, comprimento` | alissonerp.erp_produtos | POST → erp_produtos | **Só** em erp_produtos |
| `tipo_item` | alissonerp.produto_tipo_item | PATCH → upsert em produto_tipo_item | **Só** em produto_tipo_item |
| `comissao_pct, max_desconto_pct, markup_aplicado` | alissonerp.produto_curva_aplicada | `aplicarCurvaProduto()` → upsert | **Só** em curva_aplicada |
| `preco_compra_usd, peso_ct, quantidade` (pedra) | alissonerp.produto_pedra_extras | PATCH → pedra_extras upsert | **Só** em pedra_extras |
| `saldo_estoque` | **Calculado em runtime** na query do GET /api/produtos | `movimentacoes_estoque_comercial` + `vw_estoque_directus_saldo` + SOMA filhos | **Nenhuma** — é derived |
| `preco_curva` | **Calculado em runtime** na query | N/A (derived: peso × ouro × markup × fator / 10) | **Nenhuma** — é derived |
| `preco_vigente` | View `vw_produto_preco_vigente` | Promoções em `promocao_itens` | Derived de preco_tiny + promoção |

### 1.3 Duplicações de Schema

A maior duplicação é entre **`public.produtos`** e **`alissonerp.erp_produtos`**:

| Coluna | public.produtos | alissonerp.erp_produtos | Problema |
|--------|----------------|------------------------|----------|
| `id_produto` / `produto_id` | ✅ (id_produto) | ✅ (produto_id FK) | Mesmo dado, nomes diferentes |
| `sku` | ✅ (sku) | ✅ (sku, UNIQUE) | **Duplicado** — mantido em sync manual via triggers e rotas de sync |
| `nome` | ✅ (nome) | ✅ (nome) | **Duplicado** — deve ser mantido igual, mas sem trigger de sync direto |
| `categoria` | ✅ (categoria) | ❌ | Só em public |
| `peso_precificado` | ✅ | ❌ | Só em public |
| `situacao` | ✅ | ❌ (usam ativo) | **Inconsistente** — situacao = 'A'/'I' vs ativo = true/false |
| `tipo_metal` | ✅ | ❌ | Só em public |

**A sincronização bidirecional** é feita por:
- **Trigger** `trg_sync_erp_to_public_produto`: quando `erp_produtos` recebe INSERT/UPDATE, cria/atualiza `public.produtos` (migration 250)
- **Endpoint** `POST /api/produtos/sync-public-to-erp`: backfill manual de `public.produtos → erp_produtos`
- **Endpoint** `POST /api/produtos/sync-erp-to-public`: backfill manual de `erp_produtos → public.produtos`

**Isso significa que:** um produto pode existir em uma tabela e não na outra, dependendo de qual endpoint criou, qual migration rodou, ou se o trigger falhou. O `POST /api/produtos` (principal) escreve em **ambas** dentro de uma transação, mas nem todo path de criação passa por ele (ex: pedras-bulk escreve em ambas também, mas o export do Tiny cria só em `public`).

### 1.4 As 5 Fontes de Preço

Este é o ponto mais crítico. Um produto pode ter **5 campos de preço diferentes** em `public.produtos`, mais 1 calculado em runtime, mais 1 view:

| Campo | Origem | Fórmula | Quando é Usado |
|-------|--------|---------|----------------|
| **`preco_sync`** | Trigger `atualizar_preco_produto_v2()` | `(cotacao_metal × fator) × peso_precificado × markup`, arredondado à dezena | Preço calculado pelo ouro. É a base do `preco_total_sync`. |
| **`preco_tiny`** | Manual/PATCH/importação Tiny | Preço fixo (R$) cadastrado manualmente ou vindo do Tiny ERP | Preço de venda vindo do Tiny. Usado como `preco_lista` na view de promoções. |
| **`preco_pedras`** | `recalcularPrecoPedras()` | `Σ(preco_compra_usd × cotação_dólar × markup_faixa × quantidade)` | Custo total das pedras no produto |
| **`preco_total_sync`** | `recalcularPrecoPedras()` | `preco_sync + preco_pedras` | Preço total (ouro + pedras) |
| **`preco_curva`** | **Calculado em runtime** na query SQL | `peso × (SELECT ouro FROM parametros) × COALESCE(markup_aplicado, markup) × fator / 10`, arredondado à dezena | Exibido como "preço da curva" na listagem. **Nunca persistido.** |
| **`preco_vigente`** | View `vw_produto_preco_vigente` | `COALESCE(preco_promo, preco_tiny)` | Preço efetivo de venda (considera promoções ativas) |
| **`diferenca_percentual`** | Trigger | `(preco_tiny - preco_sync) / preco_sync × 100` | Indicador de quanto o preço Tiny difere do calculado |

**Problema central:** Um produto tem `preco_tiny` (preço de venda real) e `preco_sync`/`preco_total_sync` (preço calculado). Eles DEVEM ser próximos (idealmente iguais), e a `diferenca_percentual` serve justamente para alertar quando estão divergentes. Mas na prática:

- `preco_curva` (calculado em runtime) usa **outra fórmula** ligeiramente diferente do `preco_sync` (trigger). Ambos usam peso × cotação × markup × fator, mas o `preco_curva` divide por 10 e o trigger não divide explicitamente — ele usa `cotacao * fator * peso` e depois `custo * markup`.
- `preco_pedras` é calculado **fora do trigger** (chamado explicitamente pela lib), e atualiza `preco_pedras` e `preco_total_sync` diretamente, sem passar pelo trigger.
- Se o trigger roda DEPOIS de `recalcularPrecoPedras`, ele pode sobrescrever `preco_total_sync` com NULL (se o metal for NULL, como em pedras).

### 1.5 Cálculo de Saldo de Estoque

#### No GET /api/produtos (listagem)

```sql
GREATEST(
  -- Fonte 1: movimentações do próprio produto (estoque comercial alissonerp)
  COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) 
    FROM alissonerp.movimentacoes_estoque_comercial m 
    WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'), 0)::int,
  -- Fonte 2: saldo legado Directus
  COALESCE((SELECT SUM(v.saldo) FROM alissonerp.vw_estoque_directus_saldo v 
    WHERE v.insumo_sku = p.sku), 0)::int,
  -- Fonte 3: soma das movimentações das variações filhas (se for produto pai)
  COALESCE((SELECT SUM(CASE WHEN m_f.tipo = 'entrada' THEN m_f.quantidade ELSE -m_f.quantidade END)::int
    FROM alissonerp.erp_produtos pai_e
    INNER JOIN alissonerp.erp_produtos filho_e ON filho_e.parent_id = pai_e.id
    INNER JOIN alissonerp.movimentacoes_estoque_comercial m_f ON m_f.produto_id = filho_e.produto_id
    WHERE pai_e.produto_id = p.id_produto AND m_f.status = 'efetivado'), 0)
) AS saldo_estoque
```

#### No GET /api/estoque-comercial (via view `vw_saldo_estoque_comercial_v2`)

```sql
WITH mov_agg AS (
  SELECT produto_id, local_estoque_id,
    SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE 0 END) 
    - SUM(CASE WHEN tipo='saida' THEN quantidade ELSE 0 END) AS saldo_fisico
  FROM movimentacoes_estoque_comercial
  WHERE status = 'efetivado'
  GROUP BY produto_id, local_estoque_id
)
SELECT produto_id, saldo_fisico, 
  (saldo_fisico - COALESCE(reservado, 0)) AS disponivel
FROM mov_agg
LEFT JOIN reservas...
```

## 2. Análise de Inconsistências

### 2.1 Por que o Saldo Não Bate Entre Módulos

Há **3 diferenças fundamentais** entre o saldo mostrado na listagem de produtos e no módulo de Estoque Comercial:

#### Diferença 1: GREATEST vs soma real
- **Lista de produtos** usa `GREATEST(3 fontes)`. Isso significa que se o produto tem saldo 2 em movimentações e saldo 5 no Directus legado, o GREATEST retorna **5**.
- **Estoque Comercial** usa a view `vw_saldo_estoque_comercial_v2`, que só considera `movimentacoes_estoque_comercial` (fonte 1). Ela **NÃO considera** o Directus legado nem a soma dos filhos.
- **Resultado:** Um produto com saldo Directus = 5, movimentações = 2 aparece como "saldo_estoque = 5" na listagem, mas "disponível = 2" no estoque.

#### Diferença 2: Produtos pai com variações
- **Lista de produtos** usa `GREATEST(..., saldo_dos_filhos)` — então um pai sem movimentação própria mas com filho que tem 3 unidades aparece com saldo 3.
- **Estoque Comercial** mostra saldo **por produto_id**. O pai não tem movimentações próprias (só os filhos), então aparece com saldo 0 ou simplesmente não aparece (se não tem `estoque_comercial_config` ativa).
- **Resultado:** O pai mostra "estoque = 3" na listagem, mas "disponível = 0" no estoque.

#### Diferença 3: Filtro de local
- **Busca de produtos** (`busca/route.ts` com `com_estoque=true`) usa `vw_saldo_estoque_comercial_v2` com filtro `local_estoque_id = ${localId}`. Essa view já considera reservas.
- **Lista de produtos** (`GET /api/produtos`) usa a query manual com GREATEST, que **NÃO considera reservas** (só soma movimentações).
- **Resultado:** Se um produto tem 5 em estoque mas 3 reservados, a busca mostra "disponível = 2" mas a listagem mostra "saldo_estoque = 5".

### 2.2 Por que o Preço Pode Ser Diferente Entre Telas

#### Cenário 1: preco_curva vs preco_tiny vs preco_sync
Na listagem de produtos, o frontend pode mostrar:
- `preco_curva` (calculado em runtime na query SQL)
- `preco_tiny` (preço fixo do Tiny)
- `preco_vigente` (da view de promoções)

Cada um pode ser diferente. Se `preco_curva ≠ preco_tiny`, o usuário vê dois valores possíveis dependendo de qual coluna a UI escolhe exibir.

#### Cenário 2: Promoções
- A view `vw_produto_preco_vigente` pode retornar `preco_vigente` diferente de `preco_tiny` se houver promoção ativa.
- A listagem de produtos inclui `vpv.preco_vigente` e `vpv.em_promocao` na mesma query.
- Mas **outros endpoints** (como lookup, busca, export) retornam só `preco_tiny`.

#### Cenário 3: preco_sync vs preco_curva
Ambos calculam "preço do ouro", mas:
- **trigger** usa: `((cotacao * fator) * peso) * markup`, arredondado: `floor(novo_preco_cotacao / 10) * 10 + (resto < 5 ? 0 : 10)`
- **preco_curva** (runtime): `peso * cotacao * markup * fator / 10`, depois `ROUND(...)::int * 10`

As fórmulas **não são idênticas** — o trigger calcula `custo = cotacao * fator * peso` e depois `preco = custo * markup`, enquanto o preco_curva faz `peso * cotacao * markup * fator / 10`. A diferença está em quando o arredondamento acontece e na ordem das operações.

### 2.3 Pontos de Falha Críticos

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | **Trigger pode NULLificar preco_sync** se tipo_metal não contiver 'ouro' ou 'prata' | 🔴 Alto | Produtos sem metal (ex: pedras) perdem preço calculado |
| 2 | **preco_pedras é atualizado fora do trigger** — pode ser sobrescrito | 🔴 Alto | preco_total_sync inconsistente entre trigger e lib |
| 3 | **GREATEST esconde saldo real** — máscara inconsistências | 🔴 Alto | UI mostra saldo 5 mas não pode vender 5 (só 2 disponíveis) |
| 4 | **Sem transação no PATCH** — cada campo é um UPDATE separado | 🟡 Médio | Se um UPDATE falha, uns campos mudam e outros não (inconsistência parcial) |
| 5 | **preco_tiny vs preco_sync sem barreira de segurança** | 🟡 Médio | Diferenca_percentual pode ser 2000% sem alerta de bloqueio |
| 6 | **public.estoque sem UNIQUE em sku** | 🟡 Médio | Múltiplas linhas para o mesmo SKU = saldo duplicado |
| 7 | **5 campos de preço** que podem divergir | 🟡 Médio | Cada tela mostra um valor |
| 8 | **Cálculo de pedras depende de cotação dólar** — se falhar, preco_pedras fica 0 | 🟡 Médio | Produto com pedras aparece sem preço de pedras |
| 9 | **PATCH propaga para filhos sem transação** | 🟡 Médio | Se a propagação falha no meio, alguns filhos atualizam e outros não |
| 10 | **Fallback de tabela (migration 063)** — toda query tem branch para `erpDisponivel` | 🟢 Baixo | Duas versões da mesma query = risco de divergência |

## 3. Proposta de Arquitetura Alvo

### 3.1 Centralização do Produto (Schema Único)

#### Princípio
**`alissonerp.produtos`** como a **única fonte da verdade** para todos os dados de produto. `public.produtos` vira **read-only** (legado), alimentado por um trigger unidirecional de `alissonerp → public`.

#### Estrutura alvo

```
alissonerp.produtos (NOVA)
├── id_produto (PK, BIGINT, serial)
├── sku (UNIQUE)
├── nome
├── tipo_metal (NULL para pedras)
├── cor_metal
├── peso_precificado
├── markup
├── fator (default 1)
├── categoria (categoria_geral)
├── categoria_precificacao
├── situacao ('A' | 'I')
├── tem_pedra_preciosa
├── fornecedor
├── medidas: JSONB { largura_aro, altura_aro, base }
├── observacao_erp
├── tipo_item ('joia' | 'insumo' | NULL)  — diretamente na tabela, sem JOIN
│
├── Relacionamento pai/variação (auto-referencial):
│   ├── parent_id (FK → alissonerp.produtos.id)
│   ├── eh_pai (BOOLEAN)
│   ├── eh_variacao (BOOLEAN)
│   ├── parent_sku (para compatibilidade)
│   ├── sufixo_variacao
│   ├── numeracao (tamanho do aro)
│   └── comprimento (cm)
│
├── Preços (UNIFICADOS):
│   ├── preco_base      = calculado pelo trigger (peso × cotação × markup × fator) → substitui preco_sync
│   ├── preco_tiny      = preço fixo do Tiny (pode ser NULL)
│   ├── preco_pedras    = Σ custo pedras (recalculado pela lib)
│   ├── preco_total     = COALESCE(preco_tiny, preco_base + preco_pedras) → GENERATED ou trigger
│   └── preco_curva     = coluna persistida (não mais calculada em runtime)
│
├── Pedras:
│   ├── preco_compra_usd
│   ├── peso_ct
│   └── quantidade_pedra
│
├── Controle:
│   ├── created_at
│   └── updated_at
```

#### Tabelas auxiliares que permanecem

- `alissonerp.produto_composicao` — BOM (perfeito, não precisa mudar)
- `alissonerp.produto_imagens` — Galeria (perfeito)
- `alissonerp.fichas_tecnicas_produto` — Ficha técnica (perfeito)
- `alissonerp.produto_curva_aplicada` — Curva aplicada (perfeito)
- `alissonerp.produto_personalizacao` — Personalização (perfeito)
- `alissonerp.produto_rota` — Rota de fabricação (perfeito)
- `alissonerp.promocao_itens` — Promoções (perfeito)
- `alissonerp.movimentacoes_estoque_comercial` — Estoque (perfeito)

### 3.2 Estratégia para Eliminar public.produtos como Escrita

#### Fase 1: Espelhar escritas
- Toda operação de escrita (POST/PATCH) escreve em **`alissonerp.produtos`** (nova) + **`public.produtos`** (legado, para compatibilidade)
- Trigger `alissonerp → public.produtos` similar ao já existente `trg_sync_erp_to_public_produto`

#### Fase 2: Migrar leituras
- Views/materialized views que unificam `alissonerp.produtos` + tabelas auxiliares
- Substituir gradualmente os SELECTs que usam `public.produtos` pelo novo schema

#### Fase 3: public.produtos read-only
- Remover permissões de INSERT/UPDATE/DELETE de `public.produtos`
- Manter apenas o trigger de sync unidirecional
- `public.produtos` vira uma **view materializada** ou **tabela espelho**

### 3.3 Unificação do Preço

#### Modelo de Preço Alvo

O produto tem **UM preço de venda**, calculado por prioridade:

```
preco_venda = 
  COALESCE(preco_promocional, preco_tiny, preco_base + preco_pedras)
```

Onde:
- **`preco_promocional`** — da tabela `promocao_itens` (se houver promoção ativa)
- **`preco_tiny`** — preço fixo vindo do Tiny ERP (se o usuário definiu)
- **`preco_base`** — calculado pelo trigger (peso × cotação_ouro × markup × fator), persistido
- **`preco_pedras`** — Σ custo pedras (recalculado sempre que o BOM muda)

**Regra de consistência:** Se `preco_tiny` está preenchido, ele É o preço de venda. Se não, usa o calculado. A `diferenca_percentual` vira um alerta: se `|preco_tiny - (preco_base + preco_pedras)| / (preco_base + preco_pedras) > 10%`, o produto fica marcado como "preço divergente" e não pode ser vendido sem revisão.

#### Eliminar preco_curva calculado em runtime
- Persistir o valor da curva em `alissonerp.produtos.preco_curva`
- Atualizar sempre que peso, markup, fator, ou cotação mudarem (trigger + background job)
- A UI lê o campo persistido, não calcula mais em runtime

### 3.4 Saldo de Estoque Consistente

#### Solução: VIEW UNIFICADA + fim do GREATEST

Criar uma view `alissonerp.vw_saldo_consolidado_produto`:

```sql
CREATE VIEW alissonerp.vw_saldo_consolidado_produto AS
-- Para produtos simples
SELECT 
  p.id_produto,
  COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::int 
    - COALESCE(r.total_reservado, 0)::int AS disponivel_total,
  COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::int AS fisico_total
FROM alissonerp.produtos p
LEFT JOIN alissonerp.movimentacoes_estoque_comercial m 
  ON m.produto_id = p.id_produto AND m.status = 'efetivado'
LEFT JOIN (
  SELECT produto_id, SUM(quantidade) AS total_reservado
  FROM alissonerp.reservas_estoque_comercial
  WHERE status = 'ativo'
  GROUP BY produto_id
) r ON r.produto_id = p.id_produto
WHERE p.eh_variacao = false OR p.eh_variacao IS NULL
GROUP BY p.id_produto

UNION ALL

-- Para produtos pai: soma dos filhos
SELECT 
  pai.id_produto,
  SUM(filho_saldo.disponivel_total) AS disponivel_total,
  SUM(filho_saldo.fisico_total) AS fisico_total
FROM alissonerp.produtos pai
JOIN alissonerp.produtos filho ON filho.parent_id = pai.id
JOIN vw_saldo_por_produto filho_saldo ON filho_saldo.id_produto = filho.id_produto
GROUP BY pai.id_produto;
```

**Regras:**
1. **GREATEST é removido** — o saldo é SEMPRE a soma real de movimentações - reservas
2. **Directus legado** (`vw_estoque_directus_saldo`) é incorporado como fallback apenas para insumos que não migraram — e exibido separadamente com label "Saldo legado"
3. **A listagem de produtos e o estoque comercial usam a MESMA view**
4. **Reservas são consideradas** em ambos os lugares

### 3.5 Separação Dados do Produto vs Dados de Estoque

```
┌─────────────────────────────────┐     ┌──────────────────────────────┐
│      DADOS DO PRODUTO           │     │      DADOS DE ESTOQUE        │
│                                 │     │                              │
│  alissonerp.produtos            │     │  alissonerp.movimentacoes_   │
│  ├── sku, nome, peso, markup    │     │    estoque_comercial         │
│  ├── preco_base (trigger)       │     │  ├── produto_id → FK         │
│  ├── preco_tiny (manual)        │     │  ├── tipo (entrada/saida)    │
│  ├── preco_pedras (BOM)         │     │  ├── quantidade              │
│  ├── preco_total (generated)    │     │  ├── local_estoque_id        │
│  └── categoria, metal, etc.     │     │  └── status                  │
│                                 │     │                              │
│  alissonerp.produto_composicao  │     │  alissonerp.reservas_        │
│  alissonerp.produto_imagens     │     │    estoque_comercial         │
│  alissonerp.produto_rota        │     │  alissonerp.estoque_         │
│  alissonerp.produto_curva_      │     │    comercial_config          │
│    aplicada                     │     │                              │
│  alissonerp.promocao_itens      │     │  alissonerp.vw_saldo_        │
│  alissonerp.produto_            │     │    estoque_comercial_v2      │
│    personalizacao               │     │                              │
│                                 │     │  (NÃO mexer — já está        │
│  (NÃO mexe no estoque)          │     │   bem isolado)               │
└─────────────────────────────────┘     └──────────────────────────────┘
```

## 4. Roteiro de Refatoração

### 4.1 Curto Prazo (Bugs Críticos) — 1-2 semanas

#### 🔴 Crítico: Saldo de listagem usando GREATEST

**O que fazer:** Substituir `GREATEST(3 fontes)` por uma subquery que usa a MESMA view do estoque comercial (`vw_saldo_estoque_comercial_v2`), consolidada por produto.

**Arquivos que mudam:**
- `src/app/api/produtos/route.ts` (linhas 306-316) — substituir a coluna `saldo_estoque`
- `src/lib/produtos-filtros.ts` (linhas 74-91) — substituir o fragmento `wEstoque`

**Teste:** Para qualquer produto, o `saldo_estoque` da listagem deve bater com `disponivel` (somado todos os locais) do estoque comercial.

#### 🔴 Crítico: Trigger pode NULLificar preco_sync

**O que fazer:** Revisar a trigger `atualizar_preco_produto_v2()` para que, quando `tipo_metal` não for ouro nem prata:
- Se `preco_tiny` estiver preenchido, **não tocar** em `preco_sync`
- Se `preco_pedras > 0`, manter `preco_total_sync = preco_pedras`

**Arquivos que mudam:**
- Migration SQL da função `alissonerp.atualizar_preco_produto_v2()`

#### 🔴 Crítico: PATCH sem transação

**O que fazer:** Envolver TODO o corpo do PATCH `/api/produtos/[id]` em `sql.begin()` — atualmente cada UPDATE é uma query separada sem rollback.

**Arquivos que mudam:**
- `src/app/api/produtos/[id]/route.ts` (função PATCH, linhas 444-838)

### 4.2 Médio Prazo (Refatoração Estrutural) — 2-4 semanas

#### 🟡 Unificar erp_produtos + public.produtos em alissonerp.produtos

**O que fazer:**
1. Criar migration com `CREATE TABLE alissonerp.produtos` que una TODOS os campos de `public.produtos` + `alissonerp.erp_produtos` + `alissonerp.produto_tipo_item`
2. Trigger de sync bidirecional temporário
3. Migrar as queries uma a uma para usar `alissonerp.produtos`
4. Remover gradualmente as branches `erpDisponivel`

**Arquivos que mudam:**
- Nova migration SQL
- `src/app/api/produtos/route.ts` — remover branch `erpDisponivel`
- `src/app/api/produtos/[id]/route.ts` — remover branch `erpDisponivel`
- Todas as outras rotas que usam `public.produtos` diretamente

#### 🟡 Persistir preco_curva

**O que fazer:**
1. Adicionar coluna `preco_curva` em `alissonerp.produtos`
2. Criar trigger/BEFORE UPDATE que calcula o preço da curva e persiste
3. Remover o cálculo em runtime das queries SQL
4. Atualizar sempre que peso, markup, fator, ou cotação mudarem

**Arquivos que mudam:**
- Todas as queries de GET que calculam `preco_curva` em runtime

#### 🟡 Unificar preço: eliminar preco_sync e preco_total_sync

**O que fazer:**
1. Criar `preco_base` (calculado) + `preco_total` (GENERATED ou trigger)
2. Remover `preco_sync`, `preco_total_sync`, `preco_curva` (runtime)
3. Toda UI que mostra preço do produto usa um único campo lógico: `preco_venda = COALESCE(preco_promocional, preco_tiny, preco_base + preco_pedras)`

### 4.3 Longo Prazo (Migração Completa) — 1-2 meses

#### 🔵 Migrar public.produtos para read-only

1. Remover TODOS os INSERT/UPDATE/DELETE em `public.produtos` do código
2. Manter apenas trigger de sync `alissonerp → public`
3. Substituir todas as leituras de `public.produtos` por `alissonerp.produtos`
4. `public.produtos` vira view materializada ou é descomissionado

#### 🔵 Sync de preço entre curvas: background job

1. Criar job (pg_cron ou trigger) que recalcula `preco_curva` de todos os produtos ativos quando `parametros.ouro` mudar
2. Notificar usuário se `|preco_tiny - preco_total| > 10%` após recálculo

#### 🔵 Eliminar public.estoque

1. Migrar todo saldo legado de `public.estoque` para `movimentacoes_estoque_comercial`
2. Remover a segunda fonte (`vw_estoque_directus_saldo`) do GREATEST
3. Remover coluna `qtd_estoque` de `public.produtos`

## 5. Riscos

### 5.1 Regras de Negócio que Podem Quebrar

| Regra | Risco | Mitigação |
|-------|-------|-----------|
| **Peso é arredondado para cima** pelo trigger `public.arredondar_peso_para_cima()` | Se migrarmos a tabela, precisamos recriar o trigger | Copiar trigger para `alissonerp.produtos` |
| **preco_sync não pode ser sobrescrito se preco_tiny > 0** (trigger migration 157, linhas 80-84) | Se unificarmos o trigger, podemos perder essa proteção | Garantir que a nova trigger preserva a regra: `preco_tiny > 0 → preco_sync NÃO muda` |
| **diferenca_percentual** = (preco_tiny - preco_sync) / preco_sync | Se renomearmos os campos, quebramos o trigger existente | Recriar trigger com os novos nomes |
| **Produtos personalizados** (PZxxxx) têm preço/peso calculados por letra | Se preco_curva for persistido, pode conflitar com o cálculo runtime | Preco_curva = NULL para personalizados |
| **Pedras** são produtos com categoria='Pedras' mas NÃO seguem curva de ouro | A lógica `CASE WHEN p.categoria ILIKE 'Pedras%' THEN NULL` está espalhada em 4+ lugares | Centralizar a regra "Pedras não têm preco_curva" |

### 5.2 Dependências com Outros Módulos

| Módulo | Dependência | Impacto |
|--------|-------------|---------|
| **Vendas** | Lê `public.produtos.preco_tiny` e `preco_sync` nos itens de venda | Se renomearmos campos, vendas quebra |
| **Orçamento** | Usa `public.produtos.peso_precificado`, `markup`, `categoria_precificacao` | Precisa de compatibilidade |
| **PCP (Ordens de Produção)** | Usa `public.produtos.id_produto`, `sku`, `nome`, `peso_precificado` | FK para `pcp.produto_id` |
| **Estoque Comercial** | Usa `public.produtos.id_produto` como FK | Se mudar PK, quebra tudo |
| **Financeiro** | Lê `preco_tiny` para cálculo de comissão | Impacto indireto |
| **Tiny ERP** | Sincroniza via `public.produtos.id_api_produto` e `preco_tiny` | Precisa manter compatibilidade |
| **WooCommerce / Site** | Webhooks disparam com `produto_id` | Contrato precisa ser mantido |
| **Directus** (legado) | Lê/Escreve `public.produtos` diretamente | Se desligarmos escrita, Directus quebra |

### 5.3 Impacto em Integrações

#### Tiny ERP
- O sync usa `public.produtos.id_api_produto` e lê `preco_tiny`, `sku`, `nome`
- **Se mudarmos a tabela,** o sync precisa ser atualizado para ler da nova fonte
- A fila `tiny_sync_produtos` usa `produto_id` — inalterado

#### Webhooks
- `dispararWebhookBackground("produto_criado_site", { produto_id, ... })` — o contrato do webhook inclui `produto_id` (que não muda) e `nome`/`situacao` (que vêm de `public.produtos`)
- **Precisa manter compatibilidade** até o site ser atualizado

#### n8n / Automações
- Vários triggers e funções no banco referenciam `public.produtos` diretamente (ex: `public.disparar_atualizacao_produtos()`)
- **Cada um precisa ser identificado e atualizado**

#### Supabase Realtime
- Se houver subscriptions em `public.produtos`, trocar para `alissonerp.produtos`

---

## Apêndice: Fluxo de Dados Atual (Diagrama Simplificado)

```
                    ┌─────────────┐
                    │   Usuário   │
                    │  (Frontend) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  API Routes │
                    │ /api/produtos│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐ ┌────▼────────┐
       │  public.   │ │alisson.│ │alissonerp.  │
       │  produtos  │ │erp_prod│ │mov_estoque_ │
       │ (40+ cols) │ │(15 col)│ │  comercial  │
       └──────┬─────┘ └───┬────┘ └────┬────────┘
              │            │           │
              │     ┌──────▼────┐      │
              │     │ Trigger   │      │
              │     │ sync_erp_ │      │
              │     │ to_public │      │
              │     └───────────┘      │
              │                        │
    ┌─────────▼───────────────────────▼──────────┐
    │         VIEWS DE CONSULTA                  │
    │  vw_produto_preco_vigente                  │
    │  vw_saldo_estoque_comercial_v2             │
    │  vw_produto_capa / vw_produto_imagens      │
    └────────────────────────────────────────────┘
```

---

*Documento gerado em modo PLAN — nenhuma modificação foi feita no código ou banco.*
