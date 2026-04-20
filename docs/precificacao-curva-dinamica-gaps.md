# Relatório de Implementação — Curva Dinâmica de Precificação

> **Fonte:** App AI Studio ("Remix: Copy of ALISSON Gestão") — ID `4cd81e21-2d18-4a6d-aaf0-89ea2df61f74`
> **Data:** 2026-04-16
> **Status atual:** Migration 144 aplicada, lógica base funcionando. Este documento descreve os **gaps visuais e funcionais** entre o que foi entregue e o design de referência.

---

## 1. O que já está implementado (v1, merge atual)

- Migration `144_precificacao_curva_dinamica.sql` aplicada no banco
  - `alissonerp.curva_config` (singleton): start_mkp, start_commission, gold_cost_percentage, sucata_min/max_pct, arredondamento
  - `alissonerp.curva_categorias`: 9 faixas seed reproduzindo curva atual (5.0× → 2.4×)
  - `alissonerp.produto_curva_aplicada`: comissao_pct, max_desconto_pct, markup_aplicado por produto
- Lib `src/lib/curva-precificacao.ts` com `prepareCategories`, `getPricingFactors`, `simularLucratividade`, `gerarPontosCurva`
- Lib `src/lib/validar-desconto.ts` bloqueia vendedor comum em orçamento/venda acima do max_desconto
- APIs `src/app/api/precificacao/curva/*`: config, categorias, simular-produto, preview-aplicar, aplicar
- UI `TabCurvaDinamica` substitui `TabMarkupOuro` em `PrecificacaoClient.tsx`
- Integração em `src/app/api/vendas/route.ts` chamando `validarDescontos`

---

## 2. Gaps visuais identificados no design de referência

### 2.1 Tabela de Categorias — **estrutura diferente**

**Atual:** 7 colunas com inputs grandes (Ativo, Nome, Peso Máx, Variação MKP, Variação Comissão, Max Desconto, sem accordion)

**Design:** 7 colunas compactas em **grid-cols-12** com expandidade inline
- **Ativo** (col-span-1) — checkbox
- **Categoria** (col-span-3) — nome editável + sublegenda `0.1g → 0.5g`
- **Faixa (g)** (col-span-2) — input centralizado do `maxWeight`; abaixo aparece `– R$ 1.481` (preço limite calculado)
- **Red. MKP** (col-span-2) — input com prefixo `-` em vermelho; feedback `= 3.500×` em pílula dourada
- **Red. Com.** (col-span-2) — input com prefixo `-` em azul e sufixo `%`; feedback `= 3.00%` em pílula azul
- **Pontos / Max Desc** (col-span-1) — **IMPORTANTE**: o label diz "Pontos" no header mas o campo editado é `cat.maxDiscount` (input integer). Valores 30/20 no screenshot = 30%/20% de desconto máximo
- **Ações** (col-span-1) — botão lixeira vermelha

**Header** tem fundo `#1A3C34` (verde musgo) com texto branco; **corpo** é branco com bordas suaves.

**Header inclui:**
- Título `Categorias de Variação` (esquerda)
- Botão `+ Nova Categoria` (direita) em estilo bege

### 2.2 Accordion (expandir categoria)

**Atual:** accordion expande mostrando uma tabela com colunas (peso/mkp/com/custo/venda/lucro/margem)

**Design:** accordion mostra **chips compactos em grid-cols-12** (um chip por ponto da curva):
```
┌─────────┐
│ 0.1g    │  ← peso (bold, dark)
│ 5.000x  │  ← MKP (dourado, font-mono)
│ R$ 423  │  ← preço calculado (verde esmeralda)
└─────────┘
```

**Header do accordion:**
- Esquerda: `CURVA: LEVES 1 (PASSO DINÂMICO: 0.1G / >30G: 1.0G)` — texto uppercase pequeno
- Direita: `MKP Alvo: 3.500× | Com: 3.00%` — valores finais da faixa

**Passo dinâmico (regra):**
- Padrão: **0.1g**
- A partir de **30g** (≥ 29.95g): **1.0g**

Código de referência:
```typescript
while (w < category.maxWeight && count < 1000) {
  let step = 0.1;
  if (w >= 29.95) step = 1.0;
  w += step;
  if (step >= 1.0) w = Math.round(w * 10) / 10;
  else w = Math.round(w * 100) / 100;
  if (w > category.maxWeight + 0.001) break;
  const factors = getPricingFactors(w, startMkp, startCommission, categories);
  const price = Math.round(w * gPrice * factors.mkp);
  points.push({ weight: w, mkp: factors.mkp, comm: factors.commission, price });
}
```

### 2.3 Simulador de Lucro — **dropdown de categoria + comparação 2 linhas**

**Atual:** simulador mostra peso e calcula auto vs manual, tabela com 6 colunas.

**Design:** simulador mostra **peso + dropdown de tabela** e tem **2 linhas de comparação**:

**Header do simulador** (fundo escuro `#1A3C34`):
- Esquerda: input `Peso (g)` + dropdown `Tabela: Automático / Leves 1 / Leves 2 / ...`
- Direita: `Custo Base ({goldCostPercentage}%)` = `R$ 508`

**Dropdown de categoria (`simCategoryIdx`):**
- `""` (vazio) = Automático → usa `getPricingFactors(weight, config, categories)`
- `"0"`, `"1"`... = categoria específica → usa `calculatedCats[idx].targetMkp` (o MKP alvo fixo da faixa, não interpolado)

**Tabela de 2 linhas:**
| Cenário | MKP | Venda | Lucro | Margem |
|---------|-----|-------|-------|--------|
| Sugerido (Auto) | 3.000x | R$ 2.538 | R$ 2.030 | 80.0% |
| Simulado (input) | [0.00] | — | — | — |

**Fórmulas usadas:**
```typescript
const costPrice = (goldPrice * goldCostPercentage/100) * weight;
const autoSalePrice = Math.round(w * gPrice * autoMkp);
const autoProfit = autoSalePrice - costPrice;
const autoMargin = autoSalePrice > 0 ? (autoProfit / autoSalePrice) * 100 : 0;
// manual mesma coisa com simMkp
```

### 2.4 "Faixa (g)" mostra preço limite da faixa

Abaixo do input do `maxWeight`, aparece em verde:
```
0,5
– R$ 1.481
```

Isso é `Math.round(maxWeight * goldPrice * mkpInterpolado(maxWeight))`. Código:
```typescript
const getLimitPrice = (weight: number) => {
  const factors = getPricingFactors(weight, startMkp, startCommission, categories);
  return Math.round(weight * gPrice * factors.mkp);
};
```

### 2.5 Sublegenda do nome da categoria

No design, embaixo do input do nome:
```
Leves 1
0.1g → 0.5g
```
Mostra a faixa (peso inicial → peso máximo) com seta.

---

## 3. Ajustes funcionais necessários

### 3.1 `maxDiscount` valores padrão diferentes

**Atual (seed migration 144):** 15, 15, 15, 12, 12, 10, 10, 8, 5
**Design (screenshot):** 30, 20 (pelo menos Leves 1 = 30%, Leves 2 = 20%)

Valores finais a definir com o Jonathan. Provavelmente a curva dele é mais generosa no topo.

### 3.2 `getCategoryCurvePoints` — passo dinâmico não implementado

Minha implementação atual em `src/lib/curva-precificacao.ts` tem `gerarPontosCurva(rangeStart, rangeEnd, step, ...)` com step fixo. Precisa ser substituída por lógica com passo dinâmico (0.1g default, 1.0g após 30g).

### 3.3 Simulador sem dropdown de categoria

Minha implementação só aceita peso. Precisa adicionar:
- Estado `simCategoryIdx: string`
- `<select>` com `Automático` + todas as categorias
- Lógica: se vazio → getPricingFactors; se index → usa targetMkp fixo

### 3.4 Botão "+ Nova Categoria" ausente

Minha UI atual não tem o botão. Existe rota POST `/api/precificacao/curva/categorias` pronta, falta só o botão + prompt de novo nome/maxWeight.

### 3.5 Coluna "Pontos" no header

O label do header diz "Pontos" (30, 20) mas o campo editado é `maxDiscount`. Isso é consistente com o código do AI Studio — o design chama a coluna de "Pontos" mesmo que o campo seja desconto. **Manter "Pontos" no header** para bater com o design, mesmo que o valor seja `maxDiscount` (já está assim no banco).

### 3.6 Feedback visual nos inputs de variação

Abaixo de cada input `Red. MKP` e `Red. Com.`, mostrar pílula com valor acumulado:
- Pílula dourada: `= 3.500×` (targetMkp da faixa)
- Pílula azul: `= 3.00%` (targetComm da faixa)

Minha implementação já tem algo similar mas com texto simples cinza. Ajustar estilo.

---

## 4. Estrutura visual aprovada (sem cores escuras)

Conforme combinado: **manter o tema claro atual** (cinzas, brancos, emerald/rose pra lucro/redução). A estrutura muda, as cores não.

**Paleta a usar** (já existente em `PrecificacaoClient`):
- Base: `#111827` (text), `#6b7280` (sage), `#9ca3af` (muted), `#e5e7eb` (border)
- Lucro/positivo: `#059669` (emerald-600)
- Alerta/redução: `#dc2626` (rose-600)
- Azul (comissão): `#2563eb`
- Amber (pontos): `#d97706`

**Substituições visuais** (do verde musgo escuro do AI Studio → paleta clara):
- `bg-[#1A3C34]` → `bg-gray-100` + `text-gray-700` (headers de tabela)
- `text-[#C59B6D]` (dourado) → `text-amber-600`
- `bg-[#F2E8D5]/20` (bege accordion) → `bg-gray-50`
- Pílulas coloridas: mantém lógica (dourada/azul), muda cores pra amber-100/blue-100

---

## 5. Arquivos a modificar na v2

### Lib
- [src/lib/curva-precificacao.ts](src/lib/curva-precificacao.ts)
  - Refatorar `gerarPontosCurva` para passo dinâmico (0.1g / 1.0g ≥ 30g)
  - Adicionar `getLimitPrice(weight, cotacao, config, cats)` helper
  - Expor `calculatedCats` (com `targetMkp` e `targetComm` prontos)

### APIs
- [src/app/api/precificacao/curva/categorias/route.ts](src/app/api/precificacao/curva/categorias/route.ts)
  - **OK** — já tem POST

### UI
- [src/app/(dashboard)/precificacao/PrecificacaoClient.tsx](src/app/(dashboard)/precificacao/PrecificacaoClient.tsx)
  - Reescrever o render do `TabCurvaDinamica`:
    - Grid 12 colunas na tabela de categorias
    - Sublegenda com seta no nome da categoria
    - Preço limite abaixo do peso máximo
    - Pílulas douradas/azuis nos feedbacks
    - Botão "+ Nova Categoria" no topo da seção
  - Reescrever simulador:
    - Dropdown de categoria ao lado do peso
    - Header com custo base à direita
    - 2 linhas: Sugerido (Auto) | Simulado
  - Reescrever accordion:
    - Chips em grid (grid-cols-5/8/10/12 responsivo)
    - Header do accordion com "MKP Alvo / Com" à direita
    - Passo dinâmico mostrado no texto

### Migration (opcional — v2.1)
Se `maxDiscount` precisa de valores diferentes no seed, uma migration 145 pode fazer UPDATE direto.

---

## 6. Código de referência extraído

### 6.1 `prepareCategories` (AI Studio)

```typescript
const prepareCategories = (categories: Category[], startMkp: number, startComm: number) => {
  let currentMkp = startMkp;
  let currentComm = startComm;
  return categories
    .sort((a, b) => a.maxWeight - b.maxWeight)
    .map(cat => {
      currentMkp = Math.max(1, currentMkp - cat.variation);
      currentComm = Math.max(0, currentComm - cat.commVariation);
      return { ...cat, targetMkp: currentMkp, targetComm: currentComm };
    });
};
```

**Observação:** assinatura diferente da minha (`prepareCategories(config, categorias)`). Ambas são equivalentes mas a do AI Studio passa `startMkp/startComm` avulsos.

### 6.2 `getPricingFactors` (AI Studio)

```typescript
const getPricingFactors = (weight: number, startMkp: number, startComm: number, categories: Category[]) => {
  const cats = prepareCategories(categories, startMkp, startComm);
  let prevW = 0.1, prevMkp = startMkp, prevComm = startComm;
  for (const cat of cats) {
    if (weight <= cat.maxWeight) {
      const progress = (weight - prevW) / (cat.maxWeight - prevW);
      return {
        mkp: prevMkp - ((prevMkp - cat.targetMkp) * progress),
        commission: prevComm - ((prevComm - cat.targetComm) * progress)
      };
    }
    prevW = cat.maxWeight;
    prevMkp = cat.targetMkp;
    prevComm = cat.targetComm;
  }
  return { mkp: cats[cats.length-1].targetMkp, commission: cats[cats.length-1].targetComm };
};
```

**Minha implementação atual** está correta em lógica, só a assinatura recebe o `config` object. Não precisa mudar.

### 6.3 `getCategoryCurvePoints` (passo dinâmico — NOVO)

```typescript
const getCategoryCurvePoints = (category: Category, startMkp, startComm, categories, gPrice) => {
  const sorted = [...categories].sort((a, b) => a.maxWeight - b.maxWeight);
  const currentIndex = sorted.findIndex(c => c.id === category.id);
  let startWeight = currentIndex > 0 ? sorted[currentIndex - 1].maxWeight : 0;

  const points = [];
  let w = startWeight;
  let count = 0;

  while (w < category.maxWeight && count < 1000) {
    let step = 0.1;
    if (w >= 29.95) step = 1.0;  // passo dinâmico
    w += step;
    w = step >= 1.0 ? Math.round(w * 10) / 10 : Math.round(w * 100) / 100;
    if (w > category.maxWeight + 0.001) break;

    const factors = getPricingFactors(w, startMkp, startComm, categories);
    const price = Math.round(w * gPrice * factors.mkp);
    points.push({ weight: w, mkp: factors.mkp, comm: factors.commission, price });
    count++;
  }
  return points;
};
```

### 6.4 Simulador (lógica — NOVO)

```typescript
const simulation = useMemo(() => {
  const gPrice = parseFloat(goldPrice) || 0;
  const w = parseFloat(simWeight) || 0;
  const costPrice = (gPrice * (goldCostPercentage / 100)) * w;

  if (w <= 0 || gPrice === 0) return { costPrice: 0, auto: {...}, manual: {...} };

  // 1. Auto: se simCategoryIdx vazio → interpolação; se não → targetMkp fixo da categoria
  let autoMkp = 0;
  if (simCategoryIdx !== '') {
    const catIndex = parseInt(simCategoryIdx);
    if (!isNaN(catIndex) && calculatedCats[catIndex]) {
      autoMkp = calculatedCats[catIndex].targetMkp;
    }
  } else {
    const factors = getPricingFactors(w, startMkp, startCommission, categories);
    autoMkp = factors.mkp;
  }
  const autoSalePrice = Math.round(w * gPrice * autoMkp);
  const autoProfit = autoSalePrice - costPrice;
  const autoMargin = autoSalePrice > 0 ? (autoProfit / autoSalePrice) * 100 : 0;

  // 2. Manual
  const manualMkpVal = parseFloat(simMkp);
  const isManualValid = !isNaN(manualMkpVal) && manualMkpVal > 0;
  let manualSalePrice = 0, manualProfit = 0, manualMargin = 0;
  if (isManualValid) {
    manualSalePrice = Math.round(w * gPrice * manualMkpVal);
    manualProfit = manualSalePrice - costPrice;
    manualMargin = manualSalePrice > 0 ? (manualProfit / manualSalePrice) * 100 : 0;
  }

  return {
    costPrice,
    auto: { mkp: autoMkp, salePrice: autoSalePrice, profit: autoProfit, margin: autoMargin },
    manual: { mkp: manualMkpVal, salePrice: manualSalePrice, profit: manualProfit, margin: manualMargin, isValid: isManualValid }
  };
}, [goldPrice, goldCostPercentage, startMkp, startCommission, categories, simWeight, simMkp, simCategoryIdx, calculatedCats]);
```

---

## 7. Estimativa

Trabalho concentrado em 1 arquivo de UI (`PrecificacaoClient.tsx`) + ajuste leve em 1 lib. Nada estrutural no banco muda.

- Lib: ajustar `gerarPontosCurva` → **passo dinâmico** (10 min)
- UI: reescrever TabCurvaDinamica com o novo layout (1–2h)
- Testes visuais no preview + validação (30 min)

Total estimado: meio dia.

---

## 8. Questões em aberto (pra confirmar com Jonathan)

1. A coluna é chamada "Pontos" no header mas o campo é `maxDiscount` (30%, 20%, etc). Manter assim ou renomear o header pra "Max Desc %"?
2. Os valores de `maxDiscount` atuais no seed (15/12/10/8/5) batem com o que você quer? Ou usar os 30/20 do screenshot?
3. O passo dinâmico (0.1g → 1.0g ≥ 30g) faz sentido pra joalheria? Ou ajustar pra outro threshold?
4. Adicionar o botão "+ Nova Categoria" é prioridade ou fica pra v3?
