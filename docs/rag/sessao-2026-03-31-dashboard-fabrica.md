# RAG — Sessão 2026-03-31

**Sessão ID:** `3c734610-cb8b-490f-89f7-94eca9cf801f`
**Branch no início:** `checkpoint-testes`
**Duração:** ~16:43 UTC até esgotamento de cota de uso

---

## Resumo Geral

Esta sessão foi dedicada inteiramente a redesenhar e construir do zero o módulo de **Dashboard da Fábrica** (`/dashboard-fabrica`). O foco principal foi criar um sistema de widgets configurável, drag-and-drop, com drill-down macro→micro, substituindo o dashboard estático anterior.

O trabalho evoluiu em três grandes fases:

1. **Diagnóstico e correção inicial** — O campo "ordens atrasadas" no dashboard existente estava zerado; foi corrigido com uma query separada.
2. **Redesenho completo** — O dashboard foi primeiro reorganizado em macro/micro colapsável, depois completamente substituído por um sistema de widgets dinâmicos baseado em `react-grid-layout`, configurável por usuário com persistência no banco.
3. **Auditoria de dados e correções** — Vários indicadores apresentaram valores incorretos e foram corrigidos após análise profunda das queries e do modelo de dados do banco.

A sessão terminou com a implementação parcial do drill-down de 2 níveis (quebra por ordem → quebra por setor/operador), interrompida por esgotamento de cota de uso.

---

## Arquivos Modificados

### Novos arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/092_dashboard_widgets.sql` | Tabela `alissonerp.dashboard_widgets_config` para persistir configuração por usuário |
| `src/lib/widgets/registry.ts` | Catálogo de 22+ widgets, tipos, labels, ícones, tamanhos e `DEFAULT_LAYOUT` |
| `src/components/dashboard/WidgetGrid.tsx` | Componente `react-grid-layout` responsivo com breakpoints `lg/md/sm/xs` |
| `src/components/dashboard/WidgetShell.tsx` | Container individual de cada widget (título, ícone, dado, loading, erro, clicável) |
| `src/components/dashboard/WidgetRenderer.tsx` | Renderizador que decide entre KPI, gráfico ou outro tipo de widget |
| `src/components/dashboard/widgets/ChartWidget.tsx` | Widgets gráficos via Recharts (PieChart, BarChart, LineChart) |
| `src/components/dashboard/DrillDownDrawer.tsx` | Drawer lateral que abre ao clicar em KPI mostrando tabela detalhada + nível 2 |
| `src/app/api/dashboard/config/route.ts` | GET/PUT para carregar e salvar layout de widgets do usuário |
| `src/app/api/dashboard/widgets/data/route.ts` | API unificada que serve dados para todos os tipos de widget (22+ handlers) |
| `src/app/api/dashboard/widgets/drilldown/route.ts` | API de drill-down que retorna linhas detalhadas ao clicar em um KPI |

### Arquivos editados

| Arquivo | O que mudou |
|---------|-------------|
| `src/app/(dashboard)/dashboard-fabrica/page.tsx` | Reescrita completa: de dashboard estático para página com sistema de widgets |
| `src/app/api/dashboard/fabrica/route.ts` | Correção do bug das ordens atrasadas (query separada sem filtro `data_conclusao`) |

---

## Features Implementadas

### 1. Sistema de Widgets Drag-and-Drop
- Dashboard completamente configurável por usuário
- Widgets arrastáveis e redimensionáveis via `react-grid-layout`
- Layout persistido na tabela `dashboard_widgets_config` por `usuario_id`
- Botão "Editar Dashboard" liga/desliga modo edição
- Picker de widgets para adicionar novos ao layout
- Resetar ao layout padrão
- Breakpoints responsivos: `lg` (12 cols), `md` (8 cols), `sm` (4 cols), `xs` (2 cols)

### 2. Catálogo de 22+ Widgets

**KPIs de Ordens:**
- `kpi_ordens_concluidas` — Ordens concluídas no período
- `kpi_em_producao` — Ordens em andamento (só status "Em Andamento", não "Aguardando")
- `kpi_aguardando` — Ordens aguardando
- `kpi_canceladas` — Ordens canceladas
- `kpi_tempo_medio` — Tempo médio de produção em dias
- `kpi_atrasadas` — Ordens abertas com prazo vencido
- `kpi_com_atraso` — Concluídas com atraso
- `kpi_no_prazo` — Concluídas no prazo

**KPIs de Ouro/Estoque:**
- `kpi_saldo_anterior` — Saldo de ouro no início do período
- `kpi_entradas` — Total de entradas de ouro
- `kpi_saidas` — Total de saídas de ouro
- `kpi_saldo_atual` — Saldo atual de ouro

**KPIs de Quebra:**
- `kpi_quebra_g` — Quebra total em gramas (racional macro via marcadores de movimentação)
- `kpi_quebra_pct` — Percentual de quebra (sobre peso das peças, não total recebido)

**KPIs de Liberação:**
- `kpi_liberadas_atrasadas` — Ordens que chegaram na fábrica com prazo já vencido
- `kpi_media_dias_liberar` — Média de dias entre criação e entrada no PCP
- `kpi_pendentes_liberacao` — Ordens ainda sem PCP (aguardando liberação)

**KPIs de Cotação:**
- `kpi_cotacao_ouro` — Cotação atual do ouro (tabela `parametros`, coluna `ouro`)
- `kpi_cotacao_dolar` — Cotação do dólar (coluna `dollar`)

**Widgets Gráficos (Recharts):**
- `chart_ordens_status` — Pizza: distribuição de ordens por status
- `chart_entregas_prazo` — Pizza: no prazo vs com atraso vs abertas
- `chart_quebra_setor` — Barras: quebra por setor
- `chart_fluxo_ouro` — Linha: entradas vs saídas de ouro ao longo do tempo
- `chart_saldo_insumo` — Pizza: saldo de ouro por categoria/insumo

### 3. Drill-Down Macro → Micro
- Todos os KPIs são clicáveis
- Ao clicar, abre `DrillDownDrawer` (painel lateral fixo)
- Mostra tabela com todas as ordens/movimentações que compõem o indicador
- Colunas: Ordem, Cliente, Status, Tipo, Criação, Prazo, Conclusão, Dias Prod.
- Drill-down de 2º nível para "Quebra Geral": clica na ordem → expande quebra por setor/operador

### 4. Filtro de Período
- Botões rápidos: Hoje, Ontem, 3 dias, 7 dias, 15 dias, 30 dias
- Opção "Personalizado" com date picker

---

## Bugs Corrigidos

### Bug 1 — Ordens Atrasadas sempre zero
**Arquivo:** `src/app/api/dashboard/fabrica/route.ts`
**Causa:** A query de `em_aberto_atrasadas` estava dentro de uma consulta com `WHERE p.data_conclusao BETWEEN ...`. Ordens abertas não têm `data_conclusao`, logo nunca apareciam.
**Correção:** Query separada sem filtro de `data_conclusao`, contando ordens com prazo vencido e sem conclusão.

### Bug 2 — "Em Produção" incluía "Aguardando" (dupla contagem)
**Arquivo:** `src/app/api/dashboard/widgets/data/route.ts`
**Causa:** O handler contava ordens com status "Em Andamento" E "Aguardando".
**Correção:** Filtrar apenas `status = '2'` (Em Andamento), separado do card Aguardando.

### Bug 3 — Atrasadas (Abertas) com 1 ordem duplicada
**Causa:** Query sem `DISTINCT` na junção com PCP.
**Correção:** `SELECT DISTINCT ON (o.id)`.

### Bug 4 — Cotação Ouro com nome de coluna errado
**Causa:** Query usava `cotacao_ouro` mas a coluna real é `ouro`.
**Correção:** Usar `parametros.ouro` e `parametros.dollar`.

### Bug 5 — Quebra usando coluna inexistente `ouro_recebido`
**Causa:** Handler usava `ouro_recebido` que não existe; a coluna correta é `total_metal`.
**Correção:** Usar `total_metal` (ouro recebido) e `distribuicoes.deposito_id` prefixado com alias `d.` para evitar ambiguidade.

### Bug 6 — Percentual de quebra calculado sobre total recebido (errado)
**Causa:** Fórmula: `quebra / total_metal * 100`. Mas o racional correto é calcular sobre o peso das peças.
**Correção:** `quebra / ouro_pecas * 100` — conforme explicado pelo usuário: se recebe 10g, faz peça 3g, devolve 6.5g → quebra 0.5g → % = 0.5/3 = 16.67% (sobre a peça).

### Bug 7 — Quebra macro usando racional errado (distribuições vs. movimentações)
**Causa:** O widget usava dados das `distribuicao_ordens` que só captura uma parte da quebra. A quebra macro da fábrica é: Estoque inicial − Saídas em peças para loja − Estoque atual.
**Correção:** Usar marcadores de movimentação: `SM` (saída metal para loja) como base de peças, `QUEBRA_PCP` + `QUEBRA_LOTE` como valor de perda. Resultado: 37,91g / 26,03% (vs. 3,80% incorreto antes).

### Bug 8 — "Liberadas Já Atrasadas" infladas por importação batch legado
**Causa:** 53 de 55 ordens eram do sistema legado importadas em batch em 24/03/2026 com prazo em dez/2025.
**Correção:** Usar `pcp.created_at` (data real de entrada na fábrica) em vez de `created_at` da ordem; o valor correto é 39 ordens.

### Bug 9 — WidthProvider inexistente no react-grid-layout ESM
**Causa:** O componente `WidthProvider` não existe nos exports ESM do pacote.
**Correção:** Usar `ref` para medir largura do container com `ResizeObserver`.

---

## Mudanças no Banco de Dados

### Migration 092 — `dashboard_widgets_config`
**Arquivo:** `supabase/migrations/092_dashboard_widgets.sql`
**Schema:** `alissonerp`
**Executada em:** Sim (executada via `node -e` direto na sessão)

```sql
CREATE TABLE IF NOT EXISTS alissonerp.dashboard_widgets_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id)
);
```

A config JSONB armazena o layout completo por usuário (array de widgets com posição x/y/w/h).

### Queries importantes verificadas na sessão

**Colunas da tabela `parametros`:**
- `ouro` = cotação do ouro (não `cotacao_ouro`)
- `dollar` = cotação do dólar (não `cotacao_dolar`)

**Colunas da tabela `distribuicoes`:**
- `total_metal` = ouro recebido (não `ouro_recebido`)
- `ouro_pecas` = peso das peças entregues
- `retorno_metal` = metal devolvido sem virar peça
- `quebra` = coluna nativa (total_metal - ouro_pecas - retorno_metal)
- `ouro_entregue` = apenas parte do devolvido (NÃO usar para quebra)

**Marcadores de movimentação relevantes para quebra macro:**
- `SM` = Saída Metal para loja (base do cálculo de peças)
- `QUEBRA_PCP` = quebra registrada no PCP
- `QUEBRA_LOTE` = quebra registrada no fechamento do lote

**Tabela `distribuicao_ordens`:**
- Coluna `quebra` está **zerada** para todos os registros (não usar para quebra por ordem)
- A quebra por ordem deve ser calculada via `movimentacoes_estoque` com `ordem_id`

---

## Contexto Técnico

### Racional de Quebra (definido pelo usuário nesta sessão)
O percentual de quebra é sempre calculado **sobre o peso das peças**, não sobre o total de metal recebido.

Exemplo:
- Recebe: 10g de ouro
- Faz peça: 3g
- Devolve: 6.5g de retorno
- Quebra: 10 - 3 - 6.5 = **0.5g**
- Percentual: 0.5 / 3 = **16.67%** (sobre a peça)

Para a quebra macro da fábrica:
- Base: soma de `SM` (saídas de metal para loja) = peso total das peças
- Perda: soma de `QUEBRA_PCP` + `QUEBRA_LOTE` nas movimentações
- Percentual: perda / base_pecas * 100

### "Liberadas Já Atrasadas" — definição correta
São ordens onde `pcp.created_at > data_entrega` — ou seja, a fábrica recebeu a ordem (entrada no PCP) depois que o prazo de entrega ao cliente já havia vencido. Não tem relação com liberação financeira — é simplesmente o momento em que o PCP recebeu a ordem vs. o prazo prometido ao cliente.

### "Em Produção" vs "Aguardando" — distinção
- **Em Produção**: ordens com `status = '2'` (Em Andamento) no PCP — a fábrica já está trabalhando
- **Aguardando**: ordens com `status = '1'` — chegaram na fábrica mas ainda não foram iniciadas
- Esses dois campos **não devem se sobrepor**

### Cotação Ouro e Dólar — localização no banco
Tabela `alissonerp.parametros` (ou `public.parametros`), colunas `ouro` (NUMERIC) e `dollar` (NUMERIC). Não usar nomes como `cotacao_ouro` ou `valor_ouro`.

### Layout do react-grid-layout
- Biblioteca: `react-grid-layout` + `@types/react-grid-layout` (instalados nesta sessão)
- Breakpoints: `lg: 1200, md: 996, sm: 768, xs: 480`
- Colunas: `lg: 12, md: 8, sm: 4, xs: 2`
- No preview do Claude Code (~611px) sempre aparece no breakpoint `sm` → widgets empilhados é comportamento esperado
- Em produção (1200px+) ficará 4 KPIs por linha

### Drill-down de 2 níveis — implementação
- Nível 1: clica no KPI → drawer abre com tabela de ordens
- Nível 2 (apenas quebra): clica numa ordem na tabela → expande mostrando quebra por setor/operador daquela ordem
- API: `POST /api/dashboard/widgets/drilldown` com `{ widgetType, filters, level?, orderId? }`

---

## Mensagens Chave do Usuário

> "a dashboard esta muito poluida eu quero que ela mostre o dado macro e quando eu clico ela mostra o micro por exemplo em quebra ela vai me dizer a quebra de acordo com a data selecionada a quebra total ai depois me mostra por setor e operador quero fazer isso para as ordens"

> "vamos criar o sistema de dashbord uma sistema de widget super refinado onde mostra qualquer dado do sistema do macro ao micro eu posso simplesmente ter apenas 3 dados de forma macro como posso ter 100 dados refinados assim eu configuro a dashboard como quiser sem ter que ta mechendo em codigo"

> "quero saber quantidade de ordens que ja sao liberadas para a fabrica com a data atrasada por exemplo liberou dia 02/04 e a data da entrega e 28/03 monte esse dado pra mim"

> "ao clicar nesse campo quero que ele me mostre as ordens para que consiga ver os detalhes faça isso para todos os outros campos tbm"

> "vou te passar um exemplo do racional certo de quebra do ouro nao envolve pedras ou insumos somente ouro18k no peso peguei 10g de ouro fiz uma peca de 3g e voltou 6.5g de devolucao a quebra e calculada em cima da peca de 3g e nao sobre as 10g"

> "vou te passar o exemplo da quebra total da fabrica e o peso total de saida para a loja por exemplo eu tenho 300g no estoque da fabrica saiu 190g para a loja em ordens sem contar com pedras e outros insumos apenas ouro18k e eu tenho na fabrica apenas 50 gramas o restante no caso 60g foi quebra ai 60g de quebrar em relacao a 190g e nao 300 que e o total de metal"

> "quando clicar quebra geral eu quero ver a quebra por ordem uma a uma indicando o percentual de quebra ai se eu clicar na ordem destrincha a quebra por setor"

---

## Estado Final da Sessão

A sessão foi interrompida por esgotamento de cota de uso durante a implementação do `DrillDownDrawer` com suporte a 2 níveis (quebra por ordem → por setor). O componente `DrillDownDrawer.tsx` foi reescrito parcialmente mas a implementação do 2º nível pode estar incompleta.

**Valores dos KPIs no momento do último snapshot verificado:**
- Ordens Concluídas: 57
- Em Produção: 58 (corrigido)
- Aguardando: 43
- Canceladas: 0
- Tempo Médio: 28.2 dias
- Atrasadas (Abertas): 24 (corrigido)
- Liberadas Já Atrasadas: 39 (corrigido)
- Média Dias p/ Liberar: 18.5 dias
- Pendentes de Liberação: 44
- Quebra Geral: 37.91g / 26.03% (corrigido para racional macro)
- Cotação Ouro: R$ 790,44/g
- Cotação Dólar: R$ 5,16
