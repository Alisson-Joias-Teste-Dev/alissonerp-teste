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

## Duas tabelas de produto — qual é a verdade (21/08/2026)

- **Verdade = `alissonerp.erp_produtos`.** É onde o ERP **grava** (ficha, edição em massa, aplicar
  curva) e **cria** (produto novo, pedras em massa, peça avulsa, personalizado), e é de onde
  `vw_produto_preco` **calcula** o preço oficial.
- **`public.produtos` é cópia.** O gatilho `trg_espelhar_erp_para_public` é `AFTER INSERT` +
  `ON CONFLICT DO NOTHING`: copia só no cadastro, **nunca na edição**. Nenhuma rota do ERP escreve
  nela (só `sync-erp-to-public`, que insere linha faltante).
- **Leitura:** todo campo de produto se lê como `COALESCE(ep.<col>, p.<col>)` com
  `LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto`. O fallback existe porque
  **532 produtos legados** só existem na cópia (105 ativos) — trocar o `FROM` para `produtos_compat`
  os faria desaparecer da tela.
- **EXCEÇÃO 1 — `nome`:** continua vindo da cópia. Uma automação externa (n8n/Tiny, fora do nosso
  código) escreve na cópia ~80 ms depois de cada gravação do ERP e mantém lá a convenção de catálogo
  com prefixo de código (`"BR008 - Brinco Pérola 3mm"`). 107 produtos têm nome diferente nas duas.
- **EXCEÇÃO 2 — `situacao`:** continua vindo da cópia. `erp_produtos.situacao` tem **6.369 linhas**
  `'I'`/`'E'` de um backfill de 12/03/2026 que **contradizem o `ativo = true` da própria linha**, e
  **613 delas já foram vendidas**. Ler do ERP tiraria ~6.370 produtos da busca de venda e do site.
- **`nome` e `situacao` gravam nas DUAS tabelas** — se gravassem só no ERP a edição sumiria da tela;
  só na cópia, iria velha pro Tiny (o `produto-tiny-sync` lê `produtos_compat`). Todo o resto grava
  só em `erp_produtos`.
- **`sku`:** vem do ERP. A cópia tem SKU arquivado pelo Tiny (`_arch_<id>_<sku>`) em 107 produtos.
- **Gerar SKU novo:** olhar as **duas** tabelas (`UNION ALL`) — senão o `_arch_` esconde o maior SKU
  e o sistema repete código.
- **Divergências medidas (16.865 produtos, 21/08/2026):** `situacao` 6.372 (backfill — ver exceção)
  · `preco_total_sync` 1.129 · `id_api_produto` 732 · `peso_precificado` 628 · `tipo_de_pedra` 164 ·
  `sku` 107 · `nome` 107 · `categoria` 6 · `preco_pedras` 2 ·
  `tipo_metal`/`preco_sync`/`diferenca_percentual` 1. `fator` e `markup` foram zerados pelo reparo de
  719 produtos do v2.85.17.
- **Ainda lendo a cópia (pendente):** venda/estoque (~22 arquivos) e integrações (~19: site, API v1,
  WooCommerce, RFID, gestão de estoque).
- **`fator`:** multiplicador por SKU dentro do preço (`peso × cotação × markup × fator`). Não confundir
  com o `% custo ouro` da curva (`curva_config.gold_cost_percentage`), que só existe no simulador e na
  prévia do "Aplicar em Produtos" — a view oficial **não** usa esse campo.

## Gotchas
- `produtos.id_produto` (PK), não `id`. SKU de variação = `<base>-<n>` (ex.: `1829-8`).
- Lista esconde produto sem estoque por padrão ("Somente com estoque").
- ⚠️ Não salvar o ProdutoDrawer em produção só pra "testar" — o save itera as variações e pode zerar pedras (ver memória [[nao-salvar-no-front-em-producao]]).
