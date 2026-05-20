# Plano de Análise — Relacionamento Produto × Estoque × Vendas

**ERP Alisson Joias**
**Analista:** 🔍 Atlas (@analyst)
**Versão:** 1.0
**Data:** 20/05/2026

---

## 1. Introdução e Objetivo

### 1.1 Por que esta análise?

O **produto** é a entidade central do ERP Alisson Joias. Ele nasce no cadastro, vive no estoque, é vendido, devolvido, convertido em peso, personalizado, e rastreado por RFID. Cada módulo — Produtos, Estoque Comercial, Vendas — toca no produto de um jeito diferente. O problema é que **cada módulo pode ver uma versão diferente do mesmo produto**.

Já existem indícios de problemas:
- O relatório de auditoria de estoque de 11/05/2026 aponta divergências entre movimentações, vendas e saldos.
- A baixa de estoque na venda é automática via trigger, mas o vendedor **não vê o saldo disponível na hora de adicionar o produto** à venda (a busca de produtos na venda não retorna estoque).
- Existe reserva de estoque, mas não está claro quando é criada vs. quando é dada baixa definitiva.
- A conversão de SKU (produto → peso/metal) é um fluxo novo que precisa ser validado.
- Fluxo de devolução e vale-troca pode ou não devolver o produto ao estoque.

### 1.2 Objetivo Geral

Mapear **todas as interações onde o produto aparece** nos módulos de Produtos, Estoque Comercial e Vendas, e responder:

> **"O produto está íntegro, consistente e rastreável do cadastro à venda?"**

### 1.3 Objetivos Específicos

1. Documentar o "passeio" completo de um produto pelo sistema (cadastro → estoque → venda → devolução → baixa/conversão)
2. Identificar campos que se perdem, duplicam ou divergem entre telas
3. Verificar se o saldo de estoque mostrado em cada tela é o mesmo
4. Validar se a baixa de estoque na venda acontece no momento correto
5. Verificar o fluxo de devolução: produto volta ao estoque físico?
6. Identificar gaps de informação para o vendedor na hora da venda
7. Verificar a consistência dos preços entre cadastro, estoque e venda

---

## 2. Escopo

### 2.1 Módulos

| Módulo | Abrangência |
|--------|-------------|
| **Produtos** | Lista de produtos, Drawer de detalhes, Cadastro de produto (wizard), Cadastro de peça avulsa, Edição em lote, Gerenciar pedras, Galeria de imagens, Editor de campos personalizáveis, Chat IA de personalização |
| **Estoque Comercial** | Lista de saldos, Detalhe por produto (histórico de mov., saldo por local), Inventário físico, Inventário RFID, Transferências entre locais, Conversão de SKU, Gestão de estoque (dashboard) |
| **Vendas** | Lista de vendas, Nova venda (wizard), Detalhe da venda, Devoluções (lista/criação/aprovação), Vale-troca, Autorizações de desconto, Metas, Ranking, Comissões |

### 2.2 Fluxos de Negócio

1. **Cadastro de produto → disponibilização no estoque**
2. **Venda de produto → baixa no estoque**
3. **Devolução de produto → retorno ao estoque**
4. **Vale-troca → impacto no estoque**
5. **Conversão de SKU (produto → peso)**
6. **Transferência entre locais de estoque**
7. **Reserva de produto para venda**
8. **Venda sem estoque (venda de mostruário / produto a fazer)**
9. **Personalização de produto (nome gravado, etc.)**
10. **Promoção de produto → impacto no preço e na comissão**

### 2.3 Papéis de Usuário

| Papel | O que faz |
|-------|-----------|
| **Consultora (vendedora)** | Faz vendas, consulta produtos, busca cliente, aplica descontos, vê comissão |
| **Gerente de loja** | Supervisiona vendas, aprova descontos maiores, gerencia estoque da loja, vê saldo de crédito |
| **Estoquista** | Faz inventário, transferências, entrada por scanner, conversão de SKU |
| **Administradora** | Cadastra produtos, gerencia preços, categorias, pedras |
| **Ourives (PCP)** | Produz, recebe insumos, aponta produção |
| **Financeiro** | Vê relatórios de venda, comissão, resultado |
| **Desenvolvedor** | Acesso total ao sistema |

### 2.4 Fora do Escopo

- Módulo financeiro (contas a pagar/receber) — exceto quando impactar estoque ou venda
- Módulo PCP (produção) — exceto quando produto acabado entra no estoque comercial
- Módulo fiscal (NFC-e) — exceto quando a emissão depende de dados do produto
- Módulo de compras/insumos
- RFID como tecnologia — vamos analisar o dado, não o hardware

---

## 3. Roteiro de Análise

O roteiro está organizado em **4 grandes blocos**, que devem ser executados nesta ordem. Cada bloco contém passos acionáveis.

---

### BLOCO A — ANÁLISE DE NEGÓCIO (O que o usuário vê e faz)

#### A.1 Mapeamento de Telas — Produtos

**A.1.1. Lista de Produtos**
- Acessar a tela de lista de produtos
- Anotar: quais colunas aparecem? (SKU, Nome, Metal, Peso, Situação, Estoque, Preço)
- Anotar: quais filtros existem? (busca, categoria, metal, pedra, situação, estoque, pendências)
- Anotar: o que significa "Saldo Estoque" nesta tela? É saldo total de todos os locais?
- **Verificar:** O filtro "Somente com estoque" funciona corretamente?
- **Verificar:** O campo "preço" na lista vem de qual fonte? (curva de precificação, Tiny, sync?)
- **Verificar:** Produtos pais com variações são exibidos corretamente? Expandir variações funciona?

**A.1.2. Drawer de Detalhes do Produto**
- Abrir o drawer de detalhes para um produto (clicar na linha)
- Anotar: quais abas existem? (Informações, Variações, BOM/Composição, Estoque, Imagens, Personalização)
- Para cada aba, anotar:
  - **Informações:** Nome, SKU, metal, peso, preço, descrição, referência, categoria, markup, fator, situação, tipo de item (joia/insumo). Verificar se o preço mostrado é o mesmo da lista.
  - **Variações:** Lista de SKUs filhos com sufixo, numeração, peso, preço. Verificar se o total de variações no pai corresponde.
  - **BOM/Composição:** Lista de insumos (metal, pedras, outros), quantidades, se é obrigatório. Verificar se a BOM impacta o estoque de insumos.
  - **Estoque:** Saldo por local, movimentações, alertas. Verificar se este saldo é o mesmo da tela de Estoque Comercial.
  - **Imagens:** Fotos, galeria 3D.
  - **Personalização:** Campos personalizáveis, regras de preço por letra.
- **Verificar:** O drawer puxa dados de qual origem? (API `/api/produtos/[id]`?)
- **Verificar:** Ao salvar uma edição no drawer, o dado reflete na lista imediatamente?

**A.1.3. Cadastro de Produto (Wizard)**
- Acessar modal de novo produto
- Anotar as etapas do wizard
- Anotar campos obrigatórios vs. opcionais
- **Verificar:** Após cadastrar, o produto aparece no estoque automaticamente? Precisa de configuração adicional?
- **Pergunta:** Existe "estoque_comercial_config" ativo para o novo produto? A tela cria esse registro? (A baixa automática de venda só funciona se `estoque_comercial_config.ativo = true`)

**A.1.4. Cadastro de Peça Avulsa e Edição em Lote**
- Entender o que é "peça avulsa" vs. produto normal
- Edição em lote: quais campos podem ser alterados em massa?

---

#### A.2 Mapeamento de Telas — Estoque Comercial

**A.2.1. Lista de Saldos**
- Acessar tela de Estoque Comercial
- Anotar: colunas (Produto, SKU, Físico, Reservado, Disponível, Mínimo, Status/alerta)
- Anotar: indicadores (total produtos, disponível, reservado, zerados, abaixo do mínimo)
- **Verificar:** O campo "Reservado" — ele existe, mas vendedora vê isso?
- **Verificar:** "Disponível" = "Físico" - "Reservado"? A fórmula é consistente?
- **Verificar:** Os alertas (OK, No mínimo, Abaixo mínimo, Zerado, Negativo) estão corretos?
- **Verificar:** A busca por nome/SKU retorna o mesmo produto que na lista de Produtos?
- **Pergunta:** Quantos produtos estão com saldo negativo? Isso deveria ser possível?

**A.2.2. Detalhe do Produto no Estoque**
- Clicar em um produto na lista de estoque
- Anotar: seções (Consolidado, Saldo por Local, Movimentações, Reservas, Transferências, Itens RFID)
- **Verificar:** O consolidado (físico, reservado, disponível) é o mesmo da lista de estoque?
- **Verificar:** O histórico de movimentações mostra origem (venda, devolução, ajuste, transferência)?
- **Verificar:** As reservas ativas estão vinculadas a vendas abertas?
- **Verificar:** O saldo por local é a soma dos saldos individuais? Bate com o total?

**A.2.3. Inventário Físico e RFID**
- Acessar tela de inventário
- Anotar: fluxo de criação de inventário, contagem, conclusão
- **Verificar:** O que acontece quando a contagem difere do saldo esperado? Gera ajuste automático?
- **Verificar:** Após conclusão de inventário, o saldo é atualizado em tempo real?
- **Verificar:** Inventário RFID vs. manual → os resultados são os mesmos?

**A.2.4. Transferências entre Locais**
- Anotar: fluxo de transferência (origem → destino)
- **Verificar:** Durante a transferência, o produto fica "em trânsito"? Ou sai do estoque de origem antes de chegar no destino?
- **Verificar:** Existe dupla-entrada manual (origem dá saída, destino dá entrada)?

**A.2.5. Conversão de SKU (Produto → Peso)**
- Acessar conversão de estoque
- **Verificar:** O que acontece com o produto no estoque comercial quando é convertido?
- **Verificar:** A conversão gera entrada de metal/insumo no estoque de insumos?
- **Verificar:** O produto some do estoque comercial? Ou fica com saldo zero e histórico?
- **Verificar:** Fluxo de aprovação (Alisson aprova antes de converter)?

---

#### A.3 Mapeamento de Telas — Vendas

**A.3.1. Lista de Vendas**
- Acessar tela de vendas
- Anotar: colunas (Nº Venda, Data, Cliente, Vendedor, Itens, Total, Recebido, Situação)
- Anotar: filtros (período, situação, vendedor)
- **Verificar:** O campo "Itens" (qtd_itens) conta produtos ou linhas? Inclui serviços?
- **Verificar:** O total da venda no ERP é o mesmo do PDV/Tiny?

**A.3.2. Nova Venda (Wizard)**
- **A.3.2.1. Produto na Venda — Como é buscado?**
  - Abrir modal "Adicionar produto"
  - Digitar nome/SKU no autocomplete
  - **Verificar:** A busca retorna estoque? Olhe atentamente: a interface do tipo `Produto` na venda tem `id, sku, nome, preco_venda, peso_precificado, unidade, sufixo_variacao, numeracao, preco_promo, em_promocao, promocao_nome`. **Não tem saldo_estoque, nem disponivel, nem reservado.**
  - **Conclusão:** O vendedor **NÃO VÊ** o saldo de estoque ao adicionar o produto na venda.

- **A.3.2.2. Itens na Venda**
  - Anotar: colunas da tabela (Nº, Descrição, SKU, Qtde, UN, Preço lista, % Desc, R$ Desc, Preço un, Preço total)
  - **Verificar:** O SKU na venda é o mesmo do cadastro?
  - **Verificar:** O nome do produto na venda é o mesmo do cadastro? Pode ter sido alterado depois?
  - **Verificar:** O preço_curva (cotação atual) é usado ou preco_tiny (preço fixo)?

- **A.3.2.3. Promoções na Venda**
  - **Verificar:** Produto em promoção mostra preço promocional? O badge de promo aparece?
  - **Verificar:** Vendedora não-full-access não consegue dar desconto adicional abaixo do preço promocional?

- **A.3.2.4. Vale-Troca na Venda**
  - **Verificar:** Como o vale-troca é aplicado? Qual o impacto no estoque?
  - **Pergunta:** O produto trocado por vale-troca volta ao estoque? (Não deveria, pois é uma troca.)

**A.3.3. Detalhe da Venda**
- Acessar detalhe de uma venda concluída
- **Verificar:** Os itens da venda têm o mesmo nome/SKU/preço do momento da venda?
- **Verificar:** O estoque foi baixado para todos os itens? Existe rastro da movimentação?
- **Verificar:** Se a venda for cancelada, o estoque estornou?

**A.3.4. Devoluções**
- Acessar tela de devoluções
- Anotar: status possíveis (rascunho, aguardando_aprovacao, aprovado, rejeitado, concluido, cancelado)
- Anotar: tipos (parcial, total), tipos de compensação (vale_troca, reembolso_mp, reembolso_manual)
- **A.3.4.1. Criar Devolução**
  - **Verificar:** Quando uma devolução é criada e aprovada, o produto volta ao estoque comercial?
  - **Verificar:** Volta ao mesmo local de estoque? Ou para um local de "devolvidos"?
  - **Verificar:** O valor da devolução considera descontos e retenção?
- **A.3.4.2. Vale-Troca (Devolução com compensação)**
  - **Verificar:** O vale-troca gerado pode ser usado em outra venda
  - **Verificar:** O produto devolvido com vale-troca volta ao estoque? (Se gera vale, deveria sim)
  - **Pergunta:** E se o vale-troca expirar? O que acontece com o produto?

---

### BLOCO B — ANÁLISE DE DADOS (O que está no banco vs. o que aparece na tela)

Este bloco usa consultas de negócio para comparar o que está registrado vs. o que a tela mostra.

#### B.1 Consultas de Negócio

Para cada consulta, gerar um relatório com os resultados e comparar com o que a interface mostra.

| # | Consulta | O que verifica | Como usar |
|---|----------|----------------|-----------|
| B.1.1 | Listar todos os produtos que estão no cadastro mas **não** têm `estoque_comercial_config` ativo | Produtos cadastrados que não têm estoque comercial habilitado → não dão baixa automática na venda | Exportar lista e comparar com a tela de Produtos (filtro "somente com estoque") |
| B.1.2 | Listar produtos com saldo físico negativo | Estoque inconsistente | Verificar na tela de Estoque Comercial se aparecem como "Negativo" |
| B.1.3 | Listar produtos com saldo reservado ≠ 0 e venda vinculada já cancelada | Reservas presas (que nunca serão liberadas) | Verificar no detalhe de estoque se reservas órfãs existem |
| B.1.4 | Listar itens de venda cujo `produto_id` não existe mais em `produtos` | Vendas órfãs (produto foi deletado) | Verificar se a tela de detalhe da venda consegue exibir esses itens |
| B.1.5 | Listar vendas com itens onde `sku` na venda difere do `sku` atual do produto | SKU desatualizado no histórico de venda | Verificar se a venda ainda mostra o SKU correto |
| B.1.6 | Listar produtos com preço diferente entre `produtos.preco_curva` (cotação) e `produtos.preco_tiny` (preço fixo) | Divergência de preço entre fontes | Verificar qual preço aparece na lista de produtos vs. na venda |
| B.1.7 | Listar movimentações de estoque do tipo "venda" sem venda correspondente | Baixas de estoque órfãs | Verificar consistência: estoque baixou, mas venda não existe mais |
| B.1.8 | Listar devoluções concluídas que **não** geraram movimentação de entrada no estoque | Devolução que não devolveu o produto ao estoque | Verificar se o saldo foi ajustado corretamente |
| B.1.9 | Listar vale-trocas ativos com valor disponível > 0 mas sem venda de origem (ou devolução órfã) | Vale-troca sem lastro | Verificar integridade do vale-troca |
| B.1.10 | Comparar o nome do produto na lista de produtos vs. na venda (itens_venda) para o mesmo produto | Nome divergente entre telas | Verificar se o nome é copiado no momento da venda ou referenciado ao vivo |
| B.1.11 | Listar produtos que foram vendidos sem ter saldo disponível no momento da venda | Venda sem estoque | Cruza data da venda com movimentações de estoque para ver se havia saldo |
| B.1.12 | Listar transferências entre locais com status "pendente" há mais de 30 dias | Transferência perdida/abandonada | Produto sumiu do estoque? |

#### B.2 Matriz de Campos do Produto

Criar uma matriz que mostra, para cada campo do produto, **em quais telas ele aparece** e **qual o valor na tela vs. no banco**.

| Campo | Cadastro Produto | Lista Produtos | Drawer Detalhe | Estoque Comercial | Venda (busca) | Venda (item) | Devolução | Observação |
|-------|:----------------:|:--------------:|:---------------:|:-----------------:|:-------------:|:------------:|:----------:|------------|
| ID Produto | ❌ | Sim | Sim | Sim | Sim | Sim | ? | |
| Nome | Sim | Sim | Sim | Sim | Sim | Sim | Sim | É o mesmo em todos? |
| SKU | Sim | Sim | Sim | Sim | Sim | Sim | Sim | É o mesmo? |
| Preço | Sim | Sim (curva/tiny) | Sim | ❌ | Sim (venda) | Sim | Sim | Origem consistente? |
| Peso | Sim | Sim | Sim | ❌ | Sim | ❌ | ❌ | |
| Metal | Sim | Sim | Sim | ❌ | ❌ | ❌ | ❌ | |
| Categoria | Sim | Sim (filtro) | Sim | Sim | ❌ | ❌ | ❌ | |
| Situação (ativo/inativo) | Sim | Sim | Sim | ❌ | ❌ | ❌ | ❌ | |
| Saldo Estoque | ❌ | Sim (total) | Sim (por local) | Sim (físico/reservado/disponível) | ❌ | ❌ | ❌ | **GAP: vendedora não vê saldo** |
| Qtd Reservada | ❌ | ❌ | ❌ | Sim | ❌ | ❌ | ❌ | |
| Descrição | Sim | ❌ | Sim | ❌ | ❌ | ❌ | ❌ | |
| Referência | Sim | ❌ | Sim | ❌ | ❌ | ❌ | ❌ | |
| Fornecedor | ? | ❌ | Sim | ❌ | ❌ | ❌ | ❌ | |
| BOM/Composição | Sim | ❌ | Sim (aba) | ❌ | ❌ | ❌ | ❌ | |
| Imagens | Sim | Sim (foto_grid) | Sim (galeria) | ❌ | ❌ | ❌ | ❌ | |
| Pedras | Sim | Sim (ícone + ct) | Sim (detalhe) | ❌ | ❌ | ❌ | ❌ | |
| Promoção | ❌ | Sim (badge) | ❌ | ❌ | Sim (preco_promo) | Sim (badge) | ❌ | |
| Personalização | Sim | ❌ | Sim (aba) | ❌ | ❌ | ❌ | ❌ | |
| Variações (pai/filho) | Sim | Sim (expansão) | Sim (aba) | ❌ | Sim (sufixo) | Sim | ❌ | |

**GAP identificado:**
- **Saldo de Estoque não aparece na venda** — a vendedora não sabe se o produto está disponível ao adicioná-lo.
- **Nome do produto na venda é COPIADO no momento da venda** (não é referência ao vivo). Se o nome do produto mudar depois, a venda histórica mantém o nome antigo. Isso é desejável (histórico) mas precisa ser confirmado.
- **Preço na venda é calculado no frontend** (preco_lista * (1-pct_desconto)), não vem do banco já calculado.

---

### BLOCO C — ANÁLISE DE CONSISTÊNCIA (Os números batem?)

#### C.1 Saldo de Estoque

**C.1.1. Auditoria de Saldo Total**
- Para uma amostra de 50 produtos (sortear: 10 com saldo > 0, 10 com saldo zero, 10 com reserva, 10 com negativos, 10 com movimentação recente):
  1. Pegar o saldo mostrado na **Lista de Produtos** (coluna Estoque)
  2. Pegar o saldo mostrado no **Estoque Comercial** (coluna Disponível)
  3. Pegar o saldo calculado pela soma de movimentações
  - **Verificar:** Os 3 valores são iguais? Se não, qual está errado?

**C.1.2. Auditoria Reserva vs. Venda**
- Para cada produto com reservado > 0:
  - Verificar se existe uma venda em aberto (rascunho/aprovado/enviado) para aquele produto
  - **Verificar:** A reserva é liberada quando a venda é concluída? Quando a venda é cancelada?
  - **Verificar:** Existe reserva sem venda vinculada? (reserva órfã)

**C.1.3. Auditoria Venda → Baixa de Estoque**
- Para uma amostra de 30 vendas concluídas no mês:
  1. Selecionar a venda com seus itens
  2. Buscar a movimentação de saída correspondente no estoque
  3. Comparar quantidade, produto, data
  - **Verificar:** Toda venda concluída gerou movimentação de saída? (exceto produtos sem config ativo)
  - **Verificar:** A quantidade baixada é a mesma da venda?
  - **Verificar:** A data da baixa é a mesma da venda?

**C.1.4. Auditoria Devolução → Entrada no Estoque**
- Para uma amostra de 15 devoluções concluídas:
  1. Selecionar a devolução com seus itens
  2. Buscar a movimentação de entrada correspondente
  - **Verificar:** Toda devolução concluída gerou entrada?
  - **Verificar:** A quantidade devolvida é a mesma da entrada?
  - **Verificar:** O produto voltou ao mesmo local de estoque?

#### C.2 Preço do Produto

**C.2.1. Preço na Lista de Produtos vs. Preço na Venda**
- Para 30 produtos, comparar:
  - Preço na lista de produtos (coluna Preço Venda)
  - Preço na venda (preco_lista do item, sem desconto)
  - Preço no banco (preco_curva, preco_tiny, preco_sync)
- **Verificar:** O preço que o vendedor vê na venda é o mesmo da lista de produtos?

**C.2.2. Cálculo de Desconto e Comissão**
- Para 20 itens de venda:
  - Calcular manualmente: preco_lista, pct_desconto, preco_unitario, total_item, pct_comissao, valor_comissao
  - Comparar com o que foi salvo no banco
- **Verificar:** O cálculo do front-end é consistente com o que persiste?

#### C.3 Quantidade de Itens

- **Verificar:** A coluna "Itens" na lista de vendas conta itens ou produtos? Se uma venda tem 3 produtos, cada com quantidade 2, mostra 3 ou 6?

---

### BLOCO D — ANÁLISE DE GAPS (O que falta, o que está quebrado, o que está duplicado)

#### D.1 Gaps de Informação Funcional

| # | Gap | Onde | Impacto |
|---|-----|------|---------|
| D.1.1 | Vendedora não vê saldo de estoque ao adicionar produto na venda | Nova Venda (busca de produto) | Vendedora pode vender um produto sem estoque e gerar expectativa no cliente |
| D.1.2 | Vendedora não vê se há reserva para o produto no momento da venda | Nova Venda (busca de produto) | Pode adicionar produto que já está reservado para outra cliente |
| D.1.3 | Não há alerta de estoque baixo na venda | Nova Venda (tabela de itens) | Vendedora só descobre que não tem estoque depois da venda |
| D.1.4 | O drawer de produtos no estoque e no cadastro mostram abas diferentes de "Estoque" | ProdutoDrawer vs. EstoqueComercialDetalhe | Experiência inconsistente |
| D.1.5 | Não há informação clara sobre se o produto é "joia" ou "insumo" na venda | Nova Venda | Vendedora pode não saber o que está vendendo |
| D.1.6 | Produto pai vs. variação: na venda, aparece a variação individual (SKU filho), mas a vendedora pode querer ver o pai | Nova Venda (busca) | Depende da UX — confirmar se é intencional |
| D.1.7 | A tela de devolução não mostra o estoque atual do produto | Devoluções / Nova Devolução | O operador não sabe se o produto já foi devolvido antes |

#### D.2 Gaps de Consistência (Potenciais)

| # | Risco | Por quê | Gravidade |
|---|-------|---------|-----------|
| D.2.1 | Estoque baixado na venda sem que o produto tenha `estoque_comercial_config.ativo = true` | A trigger verifica a config; se ela não existir ou for false, a venda NÃO baixa estoque | **Alta**: vende sem baixar → estoque fictício |
| D.2.2 | Reserva nunca liberada se a venda for cancelada e o estorno falhar | A trigger de estorno de cancelamento existe (migration 111), mas e se a venda for deletada diretamente? | **Alta**: produto fica "preso" |
| D.2.3 | Preço do produto muda depois da venda e o histórico fica com preço desatualizado | O nome e SKU são copiados, mas o preco_lista no item da venda pode ficar diferente do preço atual | **Média**: relatórios históricos OK, mas confunde consulta |
| D.2.4 | Produto personalizado tem prefixo "PZ" no SKU — mas o fluxo de estoque é o mesmo? | Personalizados podem ser vendidos sem passar pelo estoque? | **Média**: confirmar fluxo |
| D.2.5 | Conversão de SKU retira do estoque comercial, mas o metal gerado pode não bater com o peso real | A conversão usa peso_individual informado manualmente; se houver erro, o metal gerado não corresponde | **Alta**: erro de ouro |
| D.2.6 | Produto com variações: o saldo mostrado na lista (produto pai) é a soma dos saldos dos filhos? | A lista expande variações, mas o pai em si não tem estoque físico — o saldo mostrado é o total dos filhos? | **Média**: verificar consistência |

#### D.3 Gaps de Processo

| # | Gap | Descrição |
|---|------|-----------|
| D.3.1 | Falta política clara de "venda sem estoque" | Atualmente a venda pode ser feita mesmo sem saldo (a trigger só baixa ou não, mas não impede). Precisa de regra: pode vender sem estoque? Quem pode? |
| D.3.2 | Fluxo de reserva não é explícito para o usuário | A reserva existe (trigger na inserção do item da venda), mas a vendedora não vê que uma reserva foi criada. Não há tela de "Minhas Reservas" |
| D.3.3 | Devolução com vale-troca: o produto volta para o estoque? | Se a cliente devolveu e gerou vale, o produto deveria voltar. Mas e se o vale não for usado? O fica no estoque? |
| D.3.4 | Conversão: produto some do estoque mas não há aviso ao vendedor | Uma vendedora pode tentar vender um produto que já foi convertido (peso). O saldo vai a zero, mas não há notificação |

---

## 4. Perguntas de Negócio

Estas são as perguntas específicas que a análise deve responder, organizadas por tema:

### 4.1 Cadastro → Estoque

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.1 | Quando cadastro um produto novo, ele já aparece no estoque comercial? | Verificar se o ato de cadastrar cria `estoque_comercial_config.ativo = true`. Se não, não aparece e não dá baixa |
| P.2 | Preciso fazer alguma configuração extra para o produto ter estoque? | Verificar se há step no wizard de cadastro para configurar estoque mínimo, local, etc. |
| P.3 | Produtos inativos (situação = "I") aparecem no estoque? | Verificar se a lista de estoque filtra por situacao |
| P.4 | Produto do tipo "insumo" aparece no estoque comercial? | Verificar se insumos são filtrados na tela de estoque comercial e se dão baixa automática |

### 4.2 Venda → Estoque

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.5 | Quando uma venda é criada (rascunho), o estoque já é baixado? | A trigger de inserção de item nas vendas_erp cria movimentação de saída. Testar: criar rascunho, verificar estoque |
| P.6 | Ou a baixa acontece só quando a venda é aprovada? | Verificar o gatilho da trigger: se ela olha a situacao da venda ou se executa sempre |
| P.7 | Se a venda fica em rascunho por dias, o produto fica "fora do estoque"? | Isso pode gerar "reserva eterna" se a venda nunca for concluída ou cancelada |
| P.8 | Quem faz a baixa manualmente, se necessário? Existe tela para ajuste manual? | Verificar se há funcionalidade de "ajuste manual de estoque" e quem pode acessar |
| P.9 | O que acontece quando uma venda é feita sem estoque (produto sem config ativo)? | A venda é criada normalmente, mas não gera movimentação de estoque. O produto não é reservado nem baixado |
| P.10 | Como a vendedora sabe que o produto que ela vendeu precisa ser produzido/comprado? | Não há alerta ou notificação de "venda sem estoque" |

### 4.3 Estoque na Venda

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.11 | Na hora de fazer uma venda, a vendedora vê o saldo disponível do produto? | **Evidência no código:** O tipo `Produto` na busca de vendas (`NovaVendaClient.tsx` linha 33-40) não tem campo de saldo. **Resposta: NÃO** |
| P.12 | Esse saldo, se existisse, seria confiável? | Depende da auditoria de consistência (Bloco C) |
| P.13 | Na tela de nova venda, é possível adicionar um produto com estoque zero? | Sim, o autocomplete não valida saldo. Venda pode ser criada sem estoque |
| P.14 | Existe diferença entre o saldo mostrado no Estoque Comercial e o saldo mostrado no Drawer do Produto? | Verificar endpoint de cada tela e comparar |

### 4.4 Devolução → Estoque

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.15 | Quando uma devolução é concluída, o estoque volta automaticamente? | Verificar se a trigger de devolução cria movimentação de entrada |
| P.16 | Se a devolução for rejeitada, o que acontece? | Produto não volta |
| P.17 | E se for vale-troca? O estoque volta? | Deveria voltar (a loja recebe o produto de volta e dá vale em troca). Confirmar na trigger |
| P.18 | A devolução parcial (devolve só 1 item de uma venda com 3) funciona? | Verificar fluxo de devolução parcial |
| P.19 | O produto devolvido retorna ao mesmo local de estoque? | Sim, ou vai para um local especial de "devolvidos" |
| P.20 | Qual a retenção aplicada na devolução? Percentual fixo? Configurável? | Verificar campo `percentual_retencao` na devolução |

### 4.5 Reserva

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.21 | Existe reserva de produto no sistema? | Sim, o campo `reservado` no estoque comercial |
| P.22 | Quando a reserva é criada? | Pela trigger na inserção de item da venda (`fn_estoque_comercial_baixa_venda`). A migration 111 diz "Estoque comercial: inserir item de venda CRIA RESERVA" (stories 2.3) |
| P.23 | Quando a reserva é liberada? | Quando a venda é cancelada (estorno) ou... quando a venda é concluída (aí vira baixa definitiva)? |
| P.24 | A reserva expira? | Não parece haver TTL para reserva. Venda em rascunho por 30 dias mantém reserva |
| P.25 | A vendedora vê que existe uma reserva no produto? | **Evidência:** não há campo de saldo ou reservado na busca de produtos da venda. **Resposta: NÃO** |

### 4.6 Variações (Produto Pai → Filhos)

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.26 | Produto pai tem estoque próprio? | Não, estoque é só das variações. O pai mostra a soma na lista de produtos |
| P.27 | Na venda, a vendedora vende a variação individual (SKU filho) ou o pai? | Pela busca, retorna produtos individuais (filhos) com seus preços individuais |
| P.28 | Se a vendedora buscar o SKU do pai, encontra? | Verificar se a API de busca retorna o pai junto com os filhos |
| P.29 | O preço do pai é a média/soma dos preços dos filhos? Ou tem preço próprio? | O pai pode ter `preco_filhos_min` (preço mínimo dos filhos), mas não tem preço de venda próprio |
| P.30 | Se o pai é inativado, os filhos também são? | Verificar regra de negócio |

### 4.7 Composição (BOM)

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.31 | A BOM do produto (metais, pedras) impacta o estoque de insumos? | Se a BOM é só informacional ou se ao vender o produto os insumos são baixados do estoque de produção |
| P.32 | Ao cadastrar um produto, a BOM é obrigatória? | Verificar wizard de cadastro |
| P.33 | A BOM é usada para calcular o custo do produto? | Verificar se há cálculo de custo baseado na BOM |

### 4.8 Dados Consistentes

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.34 | O nome do produto é o mesmo em todas as telas? | Comparar: lista de produtos, drawer, estoque comercial, venda |
| P.35 | O SKU é único e consistente? | Verificar se há SKUs duplicados |
| P.36 | O preço mostrado na lista de produtos é o mesmo da venda? | Comparar coluna Preço Venda na lista vs. preco_lista na venda |
| P.37 | A situação (ativo/inativo) é respeitada em todas as telas? | Produto inativo pode ser vendido? Pode aparecer no estoque? |

### 4.9 Personalização

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.38 | Produto personalizado tem fluxo diferente no estoque? | Personalizados têm prefixo PZ no SKU. Verificar se entram no estoque comercial |
| P.39 | Como o preço do personalizado é calculado? | Preço base + preço por letra (regra definida na personalização) |
| P.40 | Personalizado é vendido como "produto a fazer" (sem estoque) ou precisa estar em estoque? | Provavelmente é feito sob encomenda, então não deveria ter estoque |

### 4.10 Conversão SKU

| # | Pergunta | Como verificar |
|---|----------|----------------|
| P.41 | O que acontece quando um produto vira "peso"? | A conversão de SKU retira o produto do estoque comercial e gera entrada de metal no estoque de insumos |
| P.42 | Como fica o histórico do produto no estoque? | O produto fica com saldo zero e movimentação de saída por conversão |
| P.43 | Quem pode fazer a conversão? | Estoquista com aprovação de Alisson |
| P.44 | O peso aceito pode ser diferente do peso informado? | Sim, tem campo `peso_aceito` na tabela de conversão |

---

## 5. Entregáveis

### 5.1 Relatório de Análise de Negócio
- Documento detalhado com screenshots de cada tela
- Matriz de campos do produto (preenchida com valores reais)
- Fluxograma do "passeio do produto" pelo sistema
- Gaps identificados com nível de severidade

### 5.2 Relatório de Auditoria de Dados
- Resultado das consultas de negócio (B.1.1 a B.1.12)
- Produtos órfãos, vendas órfãs, estoques negativos, etc.
- Recomendações de correção para cada inconsistência

### 5.3 Relatório de Consistência
- Resultado da auditoria de saldo (C.1.1 a C.1.4)
- Resultado da auditoria de preço (C.2.1 a C.2.2)
- Resultado da auditoria de venda vs. baixa (C.1.3)
- Percentual de acerto para cada categoria

### 5.4 Matriz de Gaps
- Todos os gaps identificados (funcionais, de consistência, de processo)
- Priorização: Crítico / Alto / Médio / Baixo
- Sugestão de solução para cada gap

### 5.5 Recomendações Finais
- Top 5 recomendações de melhoria
- Roadmap sugerido para correção dos gaps
- Estimativa de esforço por melhoria

### 5.6 Atas das Sessões (se houver)
- Se forem realizadas entrevistas com usuários ou sessões de brainstorming, atas serão anexadas

---

## 6. Cronograma Estimado

| Fase | Atividade | Duração | Responsável |
|------|-----------|---------|-------------|
| **FASE 1** | Preparação | 1 dia | @analyst |
| 1.1 | Alinhamento com stakeholders (objetivos, expectativas) | 2h | @analyst + PM |
| 1.2 | Setup de acesso (telas, dados, permissões) | 2h | @analyst |
| 1.3 | Revisão da documentação existente (migrations, stories, audits) | 4h | @analyst |
| **FASE 2** | Análise de Negócio (Bloco A) | 3 dias | @analyst |
| 2.1 | Mapeamento de telas — Produtos | 1 dia | @analyst |
| 2.2 | Mapeamento de telas — Estoque Comercial | 1 dia | @analyst |
| 2.3 | Mapeamento de telas — Vendas | 1 dia | @analyst |
| **FASE 3** | Análise de Dados e Consistência (Blocos B e C) | 3 dias | @analyst + @dba |
| 3.1 | Execução das consultas de negócio | 1 dia | @dba-alisson |
| 3.2 | Auditoria de saldo de estoque (amostra) | 1 dia | @analyst |
| 3.3 | Auditoria de venda vs. baixa (amostra) | 1 dia | @analyst |
| **FASE 4** | Análise de Gaps (Bloco D) | 2 dias | @analyst |
| 4.1 | Compilação de gaps identificados | 1 dia | @analyst |
| 4.2 | Priorização e sugestão de soluções | 1 dia | @analyst |
| **FASE 5** | Consolidação e Entregáveis | 2 dias | @analyst |
| 5.1 | Elaboração dos relatórios | 1 dia | @analyst |
| 5.2 | Apresentação dos resultados | 1 dia | @analyst + PM |
| **Total** | | **11 dias úteis** | |

### Marcos (Milestones)

| Marco | Data Prevista | Entregável |
|-------|---------------|------------|
| M1 — Fim da Preparação | D+1 | Briefing aprovado |
| M2 — Fim da Análise de Negócio | D+4 | Relatório parcial (telas) |
| M3 — Fim da Auditoria de Dados | D+7 | Relatório de auditoria |
| M4 — Fim da Análise de Gaps | D+9 | Matriz de gaps |
| M5 — Fechamento | D+11 | Relatório final + Recomendações |

---

## 7. Riscos e Premissas

### Premissas
1. Acesso total ao sistema (todas as telas e funcionalidades) durante a análise
2. Acesso ao banco de dados para execução das consultas de negócio (via @dba-alisson)
3. Disponibilidade dos usuários-chave para entrevistas rápidas se necessário
4. A base de dados de produção reflete a realidade do negócio
5. As migrações SQL foram aplicadas e estão em vigor (versão atual do banco)

### Riscos
| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Dados inconsistentes na base podem levar a conclusões erradas | Média | Alto | Validar amostras em pelo menos 2 fontes |
| Mudanças no sistema durante a análise | Baixa | Alto | Congelar escopo e versão; anotar mudanças |
| Usuários não disponíveis para validação | Média | Médio | Usar evidências de tela (screenshots) como fallback |
| Volume grande de dados (50k+ produtos) | Alta | Médio | Trabalhar com amostras estatisticamente significativas |

---

## 8. Próximos Passos

1. ✅ **Você está aqui:** Plano de análise aprovado
2. ⬜ Validar cronograma com o solicitante
3. ⬜ Executar FASE 1 — Preparação
4. ⬜ Executar FASE 2 — Análise de Negócio
5. ⬜ Executar FASE 3 — Análise de Dados
6. ⬜ Executar FASE 4 — Análise de Gaps
7. ⬜ Executar FASE 5 — Entregáveis

---

## Apêndice A — Glossário

| Termo | Significado |
|-------|-------------|
| SKU | Stock Keeping Unit — código único do produto |
| BOM | Bill of Materials — lista de insumos (metais, pedras) que compõem o produto |
| Drawer | Painel lateral que abre ao clicar em um produto na lista |
| Wizard | Fluxo de cadastro em múltiplas etapas |
| Curva de Precificação | Fórmula que calcula o preço de venda com base no peso do metal + cotação |
| Vale-Troca | Crédito gerado em uma devolução, que pode ser usado em outra compra |
| Conversão de SKU | Processo de transformar um produto acabado em metal/peso (para fundição) |
| Estoque Comercial | Estoque de produtos acabados disponíveis para venda |
| Reserva | Quantidade de produto comprometida com uma venda em andamento |
| Disponivel | Saldo físico - reservado = o que pode ser vendido |
| Trigger | Regra automática no banco que executa uma ação quando algo acontece (ex: inserir item na venda → baixar estoque) |

---

## Apêndice B — Checklist de Preparação

Antes de iniciar a análise, garantir:

- [ ] Acesso ao ERP como usuário com permissão total (desenvolvedor/admin)
- [ ] Acesso ao banco de dados (via @dba-alisson)
- [ ] Conta de teste com dados reais de produção (ou clone de homologação atualizado)
- [ ] Lista de produtos com variações, personalizados, promoções
- [ ] Lista de vendas em rascunho, aprovadas, concluídas e canceladas
- [ ] Lista de devoluções e vale-trocas ativos
- [ ] Contato dos usuários-chave para validação
- [ ] Versão atual do sistema registrada (hash do git)
