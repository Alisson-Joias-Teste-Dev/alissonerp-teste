# Mapa system-wide do DESCONTO — rumo a uma fonte única

> Data: 2026-06-23 · Origem: varredura multi-agente (read-only, código + banco), 6 frentes + síntese.
> Gatilho: bug da aliança (pedra mostrada cheia na tela mas descontada na venda; ouro indo a "-3").
> 117 pontos mapeados · ~7 fórmulas distintas · NADA corrigido — aguarda decisão do Jonathan.

## A classe do problema (uma frase)
Não existe **uma** regra de desconto. Cada módulo (orçamento aliança, orçamento peça, venda POS, detalhe da venda, fiscal, comissão, dashboard, banco) **recalcula o desconto do seu jeito**, com teto, arredondamento, distribuição ouro/pedra e comissão **diferentes** — então o mesmo desconto produz números diferentes dependendo da tela/fluxo.

## As ~7 fórmulas distintas de desconto encontradas
1. **Núcleo aliança** (`constants.ts:296`): markup→promo→desconto→arredonda com regra `resto<5`. *O resultado é descartado* (o total real é recalculado fora).
2. **Total aliança exibido/salvo** (`OrcamentoClient.tsx:1575`): desconto sobre ouro+pedras, arredonda com `Math.round(x/10)*10` (regra DIFERENTE da #1).
3. **Pills da tela** (`OrcamentoClient.tsx:3890`): no caso **unidade** desconta a pedra; no caso **par** mostra a pedra CHEIA e joga tudo no ouro (→ ouro negativo, o "-3").
4. **Save/snapshot** (`OrcamentoClient.tsx:1755`): desconta ouro E pedra proporcional. **Diverge da tela (par)**.
5. **Peça personalizada** (`OrcamentoClient.tsx:1993`): desconto linear, sem arredondar a 10, teto de outra fonte (curva). Ainda tem um 2º mecanismo morto (`:2010`).
6. **Venda/POS** (`NovaVendaClientV2.tsx:1045`, `route.ts:760`): `preco_unitario = preco_lista*(1-pct)`, servidor **confia no valor do cliente** (não revalida). Ródio/upgrade ignoram o desconto.
7. **Banco (trigger)** (`fn_recalcular_totais_venda`): `total_desconto = Σ(preco_lista − preco_unitario)*qtd` — derivado, sem trava garantindo coerência.

## Divergências concretas (as que doem)
- **Pedra cheia na tela vs pedra descontada na venda** — o bug-âncora da aliança (par). Tela mostra a pedra inteira; o que é salvo/vendido desconta a pedra. Ouro vai a negativo ("-3").
- **4 fontes de teto de desconto diferentes**: por **usuário** (`mx_desconto_permitido`), por **produto** (`produto_curva_aplicada.max_desconto_pct`), por **campanha** (`desconto_promocao`), e o backend do orçamento valida contra o pessoal. O slider pode liberar X e o backend rejeitar (403) o mesmo X.
- **Rascunho escapa da trava**: criar venda como rascunho pula a validação de teto; PATCH de item não bloqueia desconto alto.
- **Teto da Config (50%) vs slider (teto da campanha)**: editar pela aba Config burla o teto da promoção.
- **Threshold: vendedora da venda vs usuário logado**; e fallback **15 no backend vs 30 no front**. Admin sem `mx_desconto` cai em 15 no backend (não 100).
- **Limite cartão 20% hardcoded** em ≥4 lugares (não vem de constante única).
- **Comissão calculada de 2 jeitos**: tela Nova Venda é promo-aware; o Detalhe da Venda usa fórmula simples → editar item em promoção pelo detalhe gera **comissão errada**.
- **Aprovar desconto tem 3 efeitos diferentes na comissão**: uma rota zera (0), outra fixa 0,5%, o diretor zera tudo.
- **Comissão "perdida" com baseline 4% hardcoded** (`analise-comissoes:62`) vs tabela de faixas (dashboard). Dois números incompatíveis.
- **Desconto exibido usa `preco_lista` (já promocional)**, não o preço cheio → "desconto" mostrado ignora a parte promocional e pode não bater com o trigger.
- **total_desconto: trigger vs sync**: `fn_recalcular_totais_venda` usa `total_produtos+frete`; `fn_sync_*_from_public` usa `public.vendas.total_venda`. Mesma venda, duas regras.
- **Proteção de venda fechada burlável**: o sync (`app.sync_ativo='true'`) altera `total_desconto` de venda concluída por uma porta lateral.
- **Peça tem código morto de desconto** (`:2010`) com semântica diferente — risco se alguém religar.
- **NFC-e recalcula o desconto por item** (`pct sobre preco_unitario`) enquanto o cabeçalho usa `total_desconto` (preco_lista−preco_unitario) — duas fontes do mesmo número.

## Proposta — UMA fonte única de desconto
**Um "cérebro de desconto" só** — `src/lib/desconto/precificar-item.ts` — que TODAS as telas/rotas/triggers chamam:

`calcularItemComDesconto({ precoListaCheio, pctDesconto, pedrasRS, gravacaoRS, quantidade, arredondamento, tetos:{porUsuario,porProduto,porCampanha}, role })`
→ `{ pctEfetivo, tetoAplicado, estourouTeto, precoUnitario, totalItem, valorDescontoRS, valorOuroRS, valorPedrasRS, precoListaReconstruido, comissaoPct, valorComissaoRS, precisaAprovacao }`

Regras que ele encapsula (uma vez, valendo pra todo o sistema):
1. **Fórmula única**: `precoUnitario = arredondar(precoListaCheio*(1−pctEfetivo/100))`; nunca confiar em valor vindo do cliente.
2. **Teto único**: `pctEfetivo = min(pctSolicitado, menor teto entre usuário/produto/campanha)`; full-access = 100; acima do teto → precisa aprovação. **Mesma porta** pra venda e orçamento.
3. **Arredondamento único**: uma só função (definir oficialmente `múltiplo de 10` de UM jeito) usada no orçamento e na peça.
4. **Distribuição ouro/pedra única**: o mesmo fator aplicado a ouro E pedra em TODOS os casos (tela, save, venda) → a tela passa a mostrar exatamente o que será cobrado; acaba o "-3".
5. **Comissão única promo-aware**: uma função sobre a tabela `faixas_comissao` (pct>30 → 0,5%) pra nova venda, detalhe, dashboard e análise. Fim do 4% hardcoded e do getComissao simples.
6. **Reconstrução de `preco_lista`** pela mesma função em venda e orçamento.
7. **Base de preço única = curva** (`preco_venda`); `preco_tiny` só informativo.
8. **Item sem desconto real** (ródio/upgrade): modo que força pct=0 em vez de gravar desconto decorativo.
9. **Espelhar a MESMA fórmula no banco** (`fn_recalcular_totais_venda` + funções de sync) pra o `total_desconto` nunca divergir.

## Decisões tomadas (Jonathan, 23/06)
- **Arredondamento**: ✅ "arredonda os centavos pra mais" — preço final sobe pro real cheio (ceil ao real). *Exemplo a confirmar com o Jonathan antes de codar.* NÃO é `round/10*10` nem `resto<5`.
- **Teto**: ✅ prevalece **SEMPRE o CADASTRO DO USUÁRIO** (`usuarios.mx_desconto_permitido`). Teto de produto (`max_desconto_pct`) e qualquer outra fonte = **IGNORADO** (Jonathan 23/06: "o que prevalece sempre é o cadastro do usuário"). Cadastro vazio/0 = **0%** (sem cadastro, NADA de desconto sem aprovação — Jonathan 23/06); admin/dev = 100%.
- **Limite de cartão**: ✅ vira **constante configurável** (parametros_sistema), não mais hardcoded em 4 lugares.
- **Aprovar desconto acima do teto**: ✅ comissão **fica em 0,5%** (não zera).
- **Pedra leva desconto**: ✅ sim, proporcional — 23/06. Tela passa a mostrar o que é cobrado (acaba o "-3").
- **Desconto promocional = PRÉ-APROVADO**: ✅ promoção criada no módulo de promoções já está aprovada pelo chefe → o vendedor vende no preço da promo SEM pedir aprovação, mesmo acima do teto. O teto/aprovação só vale pro desconto MANUAL que o vendedor digita. Comissão da promo segue a faixa (>30% = 0,5%). Calculadora: campo `pctPreAprovado` (% da promoção). **Pode SOLICITAR mais, não empilhar sozinho** (Jonathan 23/06): o limite SEM aprovação do item = o **MAIOR** entre o teto do cadastro e o % da promoção (NÃO soma os dois); acima disso o vendedor SOLICITA aprovação (não aplica por conta própria). Enforçar no wiring da venda (Fase 2).

## Limpeza do teto-fantasma de PRODUTO (Jonathan 23/06: só o cadastro do usuário vale)
Verificado no banco: `produto_curva_aplicada.max_desconto_pct` está **30,00 em TODOS os 9.585 produtos**. Hoje esse teto de produto é GRAVADO pela curva e ENFORÇADO no servidor. Pontos a tratar:
- **ENFORÇA (servidor):** `src/lib/validar-desconto.ts` → chamado SÓ em `src/app/api/vendas/route.ts:359`. Trocar para validar contra o teto do **cadastro do usuário**, não o do produto (ou remover e validar pelo cadastro).
- **GRAVA o 30:** `src/lib/aplicar-curva-produto.ts` (UPSERT) e `src/app/api/precificacao/curva/aplicar/route.ts` — parar de escrever `max_desconto_pct` (ou gravar NULL).
- **LÊ só p/ exibir:** `src/app/api/produtos/route.ts`, `src/app/api/gestao-estoque/produtos/route.ts` (joins) — inócuo depois.
- **DB:** zerar/NULLar os 9.585 `max_desconto_pct` (write → exige aprovação + assinatura + backup). Baixa urgência: depois que o código ignora, o valor fica inerte.
- **NÃO confundir:** `desconto_promocao` (orçamento) NÃO é teto — é desconto promocional real por categoria. Fica como está.

## Status de execução (branch `feat/fonte-unica-desconto`)
- ✅ **Fase 0 CONCLUÍDA** — `src/lib/desconto/precificar-item.ts` (a calculadora) criada, encapsulando as 4 decisões + distribuição proporcional ouro/pedra. Testes em `src/__tests__/desconto-precificar-item.test.ts` (22/22 passando). `tsc` limpo (erros restantes são só `.next/dev/types`, gerados). NÃO está ligada em nenhuma tela ainda — risco zero.
- ⚠️ **ATENÇÃO p/ Fase 2 (venda):** o fallback de teto = 15% MUDA o comportamento atual. Hoje a tela de venda dá **30%** para consultora/gerente_loja sem `mx_desconto` cadastrado (`getMaxDesconto` retorna 30); com a decisão, cai para **15%**. É mais seguro, mas é uma mudança real — validar com o Jonathan antes de ligar a venda.
- ⏳ Fases 1–4: pendentes.

## Risco e ordem sugerida
Refator grande e sensível (dinheiro). Fazer por FASES, homolog primeiro, com "ANTES vs DEPOIS" de cada venda/orçamento de teste:
1. Criar o helper + testes (sem ligar em ninguém).
2. Ligar o **orçamento de aliança** (resolve o "-3" e a pedra) — menor risco, é o caso visível.
3. Ligar **venda/POS** (teto + comissão única).
4. Ligar **fiscal + dashboard + análise**.
5. Espelhar no **banco** (trigger/sync) e travar a proteção de venda fechada.
Relaciona com [[project_audit_busca_primeiro_match]] e [[project_fonte_unica_preco_pedras]].
