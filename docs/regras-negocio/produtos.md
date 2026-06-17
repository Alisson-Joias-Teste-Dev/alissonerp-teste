# Regras de Negócio — Produtos (precificação, pedras, pai/variações)

> Mantido à mão. Tela: `/produtos` (lista) + `ProdutoDrawer` (editar). Última atualização: 2026-06-16.

## Preço de venda (curva)
O preço de venda do produto é **calculado** (curva dinâmica) — não é o `preco_tiny` (legado). Fonte: `vw_produtos_geral_preco` / `vw_produto_preco` (`preco_venda`). Componentes: **ouro** (peso × cotação × markup, via trigger `trigger_atualizar_preco_produto` → `preco_sync`) **+ pedras** (`preco_pedras`).

## Preço das PEDRAS (ponto que confundiu — fixar bem)
- O preço das pedras de uma joia vem de **`alissonerp.produto_pedras_componente`** (pedras precificadas pela `vw_pedras_preco`, snapshot em `preco_unitario_snapshot`). O campo `produtos.preco_pedras` = **Σ (quantidade × preço)** dessas pedras-componente.
- **NÃO confundir com `alissonerp.produto_composicao` (BOM):** o BOM tem as pedras estruturalmente (com `tipo='pedra'`), mas **sem `preco_compra_usd`** na maioria — então o `recalcularPrecoPedras` (que soma BOM com USD) dá **0**. O preço de verdade está na **pedras-componente**, não no BOM.
- **`PUT /api/produtos/[id]/pedras-componente` SINCRONIZA o `preco_pedras`** (corrigido 16/06, v2.67.8): grava as pedras E atualiza `preco_pedras`/`preco_total_sync`. Antes só gravava as pedras → `preco_pedras` ficava defasado/zerado.
- **Blindagem `recalcularPrecoPedras`:** nunca zera `preco_pedras` quando há pedra no BOM mas sem USD (preserva o valor) — antes qualquer save do pai zerava as variações.

## Pai / Variações
- Variação = mesmo produto, **tamanho/aro diferente** (`erp_produtos.eh_pai`/`parent_id`, `sufixo_variacao`, `numeracao`). Identidade da variação (SKU, numeração, sufixo, "nº X" do nome) **nunca** é copiada do pai.
- **Pedras:** variação **herda as pedras do pai** (mesmo modelo, mesmas pedras, só muda o aro). Se a variação não tem a pedras-componente, fica com `preco_pedras=0` (bug recorrente — foi o caso 1471/1506/1547/1829).
- **Salvar o pai (`ProdutoDrawer` → `PATCH /api/produtos/[id]` com `replicarFilhos`)** (decisão Jonathan 16/06, v2.67.7/8): pergunta "replicar nas variações?" e, se sim, **replica TODOS os campos alterados** (o body já vem só com o que mudou) + **propaga as pedras-componente do pai** pras variações + sincroniza `preco_pedras`. Peso replica (ouro recalcula via trigger).
- **Corrigir variações zeradas em massa:** basear no pai — propagar `produto_pedras_componente` do pai pras variações + `preco_pedras = Σ`. Varredura do problema (read-only): pai com pedra cujas variações têm `preco_pedras=0`.

## Gotchas
- `produtos.id_produto` (PK), não `id`. SKU de variação = `<base>-<n>` (ex.: `1829-8`).
- Lista esconde produto sem estoque por padrão ("Somente com estoque").
- ⚠️ Não salvar o ProdutoDrawer em produção só pra "testar" — o save itera as variações e pode zerar pedras (ver memória [[nao-salvar-no-front-em-producao]]).
