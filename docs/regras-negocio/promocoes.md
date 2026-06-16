# Regras de Negócio — Promoções (campanhas de desconto)

> Mantido à mão. Tela: `/comercial/promocoes`. Faz parte do comercial, mas tem módulo/regra próprios.
> Última atualização: 2026-06-16.

## O que é
Campanhas de **desconto por janela de tempo**, com **reversão automática** ao fim do período. Cada campanha tem uma lista de produtos com preço promocional.

## Estrutura
- `alissonerp.promocoes_produtos` — a campanha: `nome_campanha`, `data_inicio`, `data_fim`, `situacao_manual`, `max_parcelas_cartao`, `observacao`, `criado_por`.
- `alissonerp.promocao_itens` — produto na campanha: `produto_id`, `preco_original` (snapshot do preço de lista no momento de criar), `preco_promo`.
- `alissonerp.vw_produto_preco_vigente` — view que resolve o preço vigente do produto: `preco_lista`, `preco_vigente` (= promo se ativa, senão lista), `em_promocao`, `promocao_id/nome/datas`, `max_parcelas_cartao`.
- Código: `src/lib/promocoes-helpers.ts`, `src/app/api/promocoes/*`, `src/app/(dashboard)/comercial/promocoes/*`, `src/components/promocoes/NovaPromocaoModal.tsx`.

## Regras
- **Estados** (`situacao_manual` + `situacao_efetiva` derivada na `GET /api/promocoes`):
  - `agendada` + hoje < início → **agendada**
  - `agendada` + hoje na janela → **ativa**
  - `agendada` + hoje > fim → **encerrada** (automático pela data)
  - `encerrada_manual` → **encerrada** (botão Encerrar)
  - `cancelada` → **cancelada**
- **Reversão automática = sem cron.** A view só aplica a promo quando `situacao_manual='agendada'` E `CURRENT_DATE` entre início e fim. Passou a `data_fim`, a view deixa de aplicar e o preço volta ao de lista. Encerrar/cancelar muda `situacao_manual` e tira a promo na hora.
- **Produto pai/filho** (`erp_produtos.eh_pai`/`parent_id`): aplica o **mesmo % de desconto** do pai em todas as variações filhas (`preco_promo_filho = preco_lista_filho * (1 - pct)`). Pai sem `preco_tiny>0` → erro (não dá pra calcular o pct).
- **`preco_original`** = snapshot do **preço de VENDA real (curva, `vw_produtos_geral_preco.preco_venda`)** no momento de criar a campanha — NÃO o `preco_tiny` (campo legado do Tiny, divergente). Corrigido 16/06/2026 (v2.67.4); campanhas criadas ANTES disso têm `preco_original` na base antiga (preco_tiny) e ficam como estão. Snapshot estável (não recalcula se o ouro oscilar depois).
- **Conflito:** 1 produto não pode estar em duas promos `agendada` com janelas sobrepostas (`checarConflitoPromocoes` → 409).
- **`max_parcelas_cartao`:** a campanha pode limitar o nº de parcelas no cartão (1–12) pros itens em promo.
- **Permissão:** só full-access (admin/desenvolvedor/diretor) cria/edita/encerra/cancela; qualquer autenticado lê.

## Como entra na VENDA
A busca de produto (`GET /api/vendas/produtos/busca`) retorna, quando `em_promocao=true`:
- `preco_venda` = **preço PROMO** (vigente)
- `preco_lista_original` = preço **cheio** (curva)
- `preco_promo`, `em_promocao`, `promocao_nome`, `max_parcelas_promo`

## ✅ Comissão de item promocional — CORRIGIDO (v2.67.3, 16/06/2026)
Antes: no `calcItem` (`NovaVendaClientV2.tsx`) a comissão saía de `getComissao(pct_desconto)` com `pct_desconto=0` → **taxa cheia** (4%) em item promo.
Solução (helper `comissaoPct`): a comissão sai do desconto vs o **preço ORIGINAL da promoção** — `preco_promo_original` (snapshot que a campanha fixou em `promocao_itens.preco_original`), exposto pela `busca/route.ts` a partir de `vw_produto_preco_vigente`.
- **⚠️ Achado no teste de front (16/06):** NÃO usar a **curva atual** como base — ela oscila com o ouro e dá desconto/comissão errados. Ex.: AJ5237 vendido a R$1.446; original da promo = R$1.980 → **27% → 0,85%** (certo). A curva atual (R$1.840) daria 21% → 1,55% (errado). Por isso a base é o snapshot da promo, não a curva.
- `preco_lista`/`pct_desconto` do item ficam **inalterados** (preço promo / desconto manual) → a promo segue **isenta do gate de aprovação**, e o desconto manual EXTRA abaixo do preço da promo ainda pede aprovação. Sem migration, sem mexer no backend de gate.
- `getComissao(pct)`: faixas por % de desconto; `>30% → 0,5%`.

## Decisões (Jonathan — 16/06/2026)
1. **Comissão do item promo = `getComissao(desconto real da promo)`, regra NORMAL** — incluindo a trava `>30% → 0,5%`. A promo é tratada igual a um desconto manual para fins de comissão (ex.: promo de 44% paga 0,5% à consultora).
2. **Item promo é ISENTO do gate de aprovação de desconto**, mesmo acima do limite (o desconto é da loja, não da consultora). Vale também pro gate de cartão.
3. **Retroatividade: corrigir só JUNHO** (ainda não pago, R$376,21). **Maio (já pago, R$214,90) NÃO é tocado** — fica como decisão à parte.
