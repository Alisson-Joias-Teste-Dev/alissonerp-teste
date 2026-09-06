# Regras de Negócio — Comercial (Vendas, Vale-Troca, Comissão, Entregas)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo comercial, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/alissonerp-vendas.md` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.

Última atualização: 2026-08-24 (§9 conversão reversa: duplicata, como desfazer e a config que faz a peça aparecer).

---

## 1. Vale-Troca

- **Uso único.** Cada vale é aplicado **uma vez só**. Ao aplicar numa venda, o vale original **sempre** vira `utilizado` (100%, `valor_disponivel=0`).
- **Troco vira vale novo.** Se o vale > valor a pagar, o sistema gera um **novo vale** com o troco, ligado ao original por `vale_origem_id` (rastreia a cadeia). Se o vale < valor a pagar, retorna `precisa_complemento`.
- **Numeração:** `VT-00001` via sequence `alissonerp.vale_troca_seq`.
- **Valor do vale (devolução) = proporcional ao PAGO** *(v2.68.1)*. `recomputarTotais` calcula `crédito_item = valor_item × (pago_confirmado ÷ total_venda)` — o vale **nunca passa do que o cliente pagou** (caso entrega com pagamento parcial). Venda **sem pagamento rastreado** (legado, `pagamentos_venda` vazio) → fração 1 (valor cheio). Frete entra como não-reembolsável; retenção % aplicada sobre a base proporcional.
- **Vale-troca NÃO comissiona** (ver §2).
- **Aplicar vale exige 2ª confirmação do dono (WhatsApp)** *(v2.68.0, brecha #1)*. Vale COM `cliente_id` só é aplicado depois que o **dono** informa um código de 6 dígitos enviado ao WhatsApp dele (`vale_troca_codigo`, 5 tentativas erradas → bloqueia; expira em 15 min). Vale SEM dono (promoção) aplica direto. Se o WhatsApp falhar ou o cliente não tiver celular, um responsável (`ROLES_DEVOLUCAO` ou o `aprovador_vale_troca_excecao` das Configurações) libera via **exceção**, sempre auditada. Endpoint: `POST /api/vale-troca/solicitar-codigo`; aplicação valida em `vendas/[id]/pagamentos`.
- **Estorno DEVOLVE o vale** *(v2.68.0, #2/#6)*. `estornarVenda()` reativa o vale com o **valor aplicado** e **preserva o troco-filho** (cadeia conservada: devolvido + troco = original). ⚠️ O estorno manual pelo painel (`PATCH .../pagamentos/[pagId]` `status=estornado`) **não pode pré-setar o status** — quem faz o estorno é o `estornarVenda` (senão o guard de idempotência pula a reversão do vale e o cancelamento de CR/venda). `reverterAplicacaoVale()` é idempotente.
- **Overpayment travado + atômico** *(#3/#5)*. O hook de Vale-Troca usa `FOR UPDATE` na venda (igual ao Ouro) e nunca aplica acima do saldo restante; o excedente vira troco. Aplicar/estornar/cancelar/gerar vale registram em `audit_log`.
- **Devolução → vale passa pela aprovação do estoque** *(v2.68.0, B3)*. "Concluir" não gera mais o vale direto: cria tarefa pro `aprovador_devolucao_estoque` (status `aguardando_aprovacao_estoque`); o vale/reembolso só nasce quando o estoque aprova. A devolução tem **comentários** (igual ordens) e o **histórico completo da cadeia de vale** (Y→troco→…).

Arquivos: `src/lib/vale-troca.ts`, `src/app/api/vale-troca/`, migration `142_devolucoes_vale_troca.sql`.

---

## 2. Comissão

- **Base = pagamento confirmado**, não a entrega. A comissão elegível é calculada por `pagamentos_venda` com `status='confirmado'`, rateada pelo valor do pagamento sobre o total da venda.
- **A comissão segue o DINHEIRO recebido.** Comissionam todas as formas **já recebidas** (Pix, Cartão, Dinheiro, Mercado Pago) e o **crediário (`A Receber`) JÁ PAGO** (`status='confirmado'`). O crediário quitado é recebimento real — desde 27/06/2026 ele comissiona (antes era excluído mesmo pago, e a consultora perdia a comissão; ex. venda 15346 paga via MP ficava com R$0).
- **Fonte única de "é dinheiro novo?" = `pagamentos_venda.comissionavel` (bool, migration 341, 06/07/2026).** NÃO usar `forma <> 'Vale-Troca'` — essa string-match é a causa raiz do bug abaixo.
- **Pagamento não-comissionável ENTRA no fechamento com comissão R$0 (migration 342, 08/07/2026)** — não é mais filtrado pra fora da consulta. Fica visível na tela do fechamento com a etiqueta "não comissionável (Vale-Troca/Permuta/Ajuste Consultora)" (`tipo_item='nao_comissionavel'`), em vez de sumir silenciosamente. Motivo: um item cancelado (bug antigo já corrigido) apareceu na tela sem nenhuma marca de status, gerando confusão — a resposta foi tornar todo pagamento auditável na tela, comissionável ou não, com etiqueta clara em vez de omitir.
- **NÃO comissionam** (`comissionavel=false`): `Vale-Troca`, `Permuta` e `Ajuste Consultora` (não são dinheiro novo) e `A Receber` **PENDENTE** (ainda não entrou — vira comissão quando a parcela for paga, com `comissionavel` herdado de como for confirmada). Venda 100% em vale = **R$0**; crediário só comissiona a parte efetivamente quitada em dinheiro.
- `vendas_erp.total_comissao` é o valor **teórico** (soma dos `valor_comissao` dos itens). O que de fato é **pago** sai do fechamento, sobre o que foi recebido.
- **Fechamento:** itens entram em `alissonerp.fechamento_comissao_itens` (com `status` ex. `liberado`); comissão é apurada **por período / fim do mês**. Um pagamento já fechado não some retroativamente se a venda for cancelada depois.
- **Aprovação de crédito NÃO afeta a comissão (decisão Jonathan, 03/08/2026).** Nem gerente nem diretor mexem na comissão da consultora — a comissão **segue o dinheiro recebido**, apurada no fechamento (parte à vista comissiona já; crediário/A Receber só quando a parcela é paga). ANTES (27/06→02/08): a aprovação do **diretor** (crédito acima do saldo) **zerava** a comissão inteira na aprovação (só a partir de jul/2026), inclusive a parte já paga em dinheiro — era injusto e gerava esteira de correção manual (22 vendas de jul/2026 restauradas 1 a 1). O zeramento foi REMOVIDO de `vendas-credito-aprovar.ts`; a aprovação do diretor agora só LIBERA a venda acima do limite, sem penalizar comissão.
- **Fechamento é por CONSULTORA + PERÍODO, com rateio por pagamento** (`POST /api/financeiro/comissoes/fechamentos`): pega todo `pv.data_confirmacao` dentro do período, calcula `total_comissao * pv.valor / total_venda` por pagamento. Venda de mês anterior paga no período → entra no período do pagamento (não no mês da venda). Pagamento dividido entre dois meses → cada mês recebe sua fração (soma dos rateios = 100% quando a venda está quitada). Validado em prod (06/07/2026) nas 3 consultoras.
- **Bug corrigido (06/07/2026, 1ª rodada):** a regra "A Receber confirmado comissiona" (27/06) só tinha sido aplicada na tela de prévia (`elegiveis/route.ts`). Os endpoints que de fato geram o fechamento (`fechamentos/route.ts`, `gerar-maio/route.ts`) e o card de resumo (`resumo/route.ts`) ainda excluíam `A Receber` inteiro. Corrigido via SQL assinado (id 123) nos 3 fechamentos rascunho de junho/2026 já gerados (+R$877,22: Cristiane +465,87, Debora +122,11, Germana +289,24).
- **Bug GRAVE corrigido (06/07/2026, 2ª rodada — causa raiz):** `registrar-pagamento` (baixa do crediário) tinha `forma_recebimento` **opcional**. Quando confirmada sem escolher a forma, `pagamentos_venda.forma` ficava `'A Receber'` para sempre — indistinguível de dinheiro real mesmo quando na prática era **Vale-Troca, permuta ou desconto tirado da própria consultora**. Isso gerou comissão indevida em 3 itens do fix da 1ª rodada (venda 15323/Vale-Troca VT-00047, 15231/permuta, 15270/desconto da consultora — R$179,06, revertido). **Correção definitiva (migration 341, branch `fix/comissao-fechamento-a-receber`):**
  1. `forma_recebimento` agora é **obrigatório** em `registrar-pagamento` — não dá mais pra confirmar uma baixa sem dizer como foi.
  2. Nova coluna `pagamentos_venda.comissionavel`, gravada pela própria baixa: `false` para `Vale-Troca`/`Permuta`/`Ajuste Consultora`, `true` pro resto. Vira a fonte única de verdade pro motor de comissão (item acima).
  3. `Permuta` e `Ajuste Consultora` viraram opções explícitas no seletor de forma do crediário (antes só davam pra registrar via comentário livre, sem rastro estruturado).
  4. **Rede de segurança:** `POST .../fechamentos/[id]/fechar` agora **bloqueia** (409) fechar um fechamento com item `comissionavel=false` OU com comentário batendo palavra-chave suspeita ("vale-troca"/"permuta"/"descontad"), mesmo que `comissionavel` esteja certo — cobre forma nova que ainda não entrou na lista. Exige `{forcar:true}` pra passar por cima (fica auditado).
- **Bug corrigido (06/07/2026, 3ª rodada — crédito-diretor sem data + rateio sem teto + bug de data do último dia):** pente-fino item a item de todas as vendas do fechamento de junho (branch `fix/comissao-diretor-data-e-rateio`) achou 3 problemas adicionais:
  1. `vendas-credito-aprovar.ts` zerava a comissão em QUALQUER aprovação tipo `diretor`, sem checar a data da venda — a decisão "só zera a partir de julho/2026" (27/06) só tinha sido aplicada via SQL manual. Corrigido: só zera se `data_venda >= 2026-07-01`.
  2. Rateio por pagamento podia passar de 100% quando o `total_venda` era reduzido DEPOIS de um pagamento já confirmado (desconto/ajuste tardio sem estorno) — `LEAST(...,1)` trava em 100% em `elegiveis`/`fechamentos`/`gerar-maio`/`resumo`.
  3. **Grave:** `pv.data_confirmacao <= periodoFim::date` compara um `timestamptz` contra a meia-noite do último dia — qualquer pagamento confirmado durante o PRÓPRIO último dia do período (não só à noite) ficava de fora. Achou 7 pagamentos de 30/06/2026 (R$194,34 de comissão) que nunca entraram no fechamento de jun/2026. Corrigido: `< periodoFim::date + interval '1 day'` em `elegiveis`/`fechamentos`/`gerar-maio` (2x).
- **Bug GRAVE corrigido (06/08/2026 — crediário PARCELADO comissionava a venda inteira na 1ª parcela):** um crediário de N parcelas tem N linhas em `contas_receber` mas **UMA só** linha `'A Receber'` em `pagamentos_venda` (mig 317). A baixa de UMA parcela (`registrar-pagamento` e `verificar-mp`) perguntava *"o cliente pagou a parcela inteira?"* e, como pagou, confirmava o `'A Receber'` **INTEIRO** — a venda ficava 100% paga com parcelas em aberto e a comissão (regime de caixa) saía sobre o total. Caso real: **venda 15678** (Germana, 30/06/2026) — R$ 45.000, Pix R$ 9.000 + A Receber R$ 36.000 em 4×; baixaram a parcela 1/4 em 29/07 e lançou **R$ 279,00** de comissão em vez de **R$ 111,60** (R$ 167,40 a mais). Dado corrigido em prod 04/08/2026 (log 399); **código corrigido em 06/08/2026**. A pergunta certa é *"sobra 'A Receber' depois deste recebimento?"* — se sobra, o pagamento é **dividido** (confirma o que entrou, abre um `'A Receber'` pendente com o resto), que é o que a rota da **cascata** (`receber-cascata`) já fazia certo. Efeitos colaterais do mesmo defeito, também corrigidos: a 2ª parcela quebrava com **500 PAGAMENTO_EXCEDE_TOTAL** (sem `'A Receber'` pendente, a rota criava linha nova por cima do total) e um pagamento parcial DE UMA PARCELA sumia com o resto do crediário da soma da venda. Crediário de 1 parcela (584 de 608 vendas dos últimos 4 meses) **não muda de comportamento**. Invariante que prova o split: `SUM(pagamentos_venda.valor) = vendas_erp.total_venda`.
- **Itens de PROMOÇÃO não seguem a tabela de desconto normal.** Ex.: campanha 7 ("Storys aprovado pelo Alisson", 29/05–24/06/2026) — AJ5237 (desconto real 26,97%) comissiona 0,85% fixo, AJ1364 (53,05%) comissiona 0,50% fixo, **enquanto a venda não tiver desconto adicional além do preço promocional**. Se tiver desconto extra em cima da promoção, cai pro piso de 0,50% (regra confirmada pelo Jonathan, 06/07/2026). 3 itens achados fora dessa regra (comissão contaminada em 1,20%, sem explicação aparente) corrigidos em prod.

### 2.1 A comissão é um EXTRATO (livro-razão) — migration 363, 03/08/2026

**A regra-mãe:** **cada real recebido gera comissão exatamente UMA vez.** Tudo abaixo deriva disso.

A comissão deixou de ser só um retrato por fechamento e passou a funcionar como **extrato bancário**: cada fato vira uma **linha datada** no mês em que aconteceu, e o **saldo rola** para o mês seguinte (podendo ficar **negativo**). Mês fechado **nunca** é reaberto — o acerto entra como lançamento novo.

| Fato | Entra no extrato | Sinal |
|---|---|---|
| Cliente pagou (à vista, cartão, pix, parcela de crediário) | mês do **pagamento** | **+** |
| Peça devolvida volta ao estoque | mês da **volta** | **−** |
| Cliente usa o vale numa compra nova | mês do **uso** | **+** (para quem fez a venda nova) |
| Empresa paga a consultora | mês do **pagamento** | **−** (baixa) |

**Débito da devolução** (`src/lib/comissao-lancamentos.ts`, chamado por `concluirDevolucao`):
- **Gatilho:** confirmação FÍSICA da peça no estoque (`condicao='aprovado_retorno'`). `reprovado_descarte` e `garantia` **não mexem em comissão** — por construção, nem passam pelo `if`.
- **Valor:** `valor_comissao do item × (recebido comissionável ÷ total da venda)`. Debita só o que de fato virou comissão — venda meio paga debita metade.
- **Uma linha por devolução** (soma dos itens), com `fechamento_id` NULO. O índice único `uq_fech_com_itens_devolucao` impede debitar duas vezes.
- Vale para **os dois tipos** de devolução: vale-troca e estorno (reembolso MP ou manual). O que muda é o lado da cliente; o lado da consultora é idêntico.

**Crédito do vale** (`vale_troca.comissiona_no_uso`): o `comissionavel=false` cravado no pagamento de Vale-Troca virou espelho dessa coluna.
- Vale nascido de **devolução** → `true` (acabou de levar o débito; se o débito deu R$0 é porque aquele dinheiro nunca comissionou).
- Vale de **troco** herda do vale pai (é o mesmo dinheiro).
- Vale `VC-` de **venda não paga** → `false`. `virou_credito` está em `SITUACOES_VENDA_ATIVAS`, ou seja, a consultora original **mantém** a comissão sobre o que foi pago — comissionar o vale de novo pagaria duas vezes.
- **Vales anteriores a 07/2026 ficam `false`**: nunca tiveram débito.
- O crédito é **da cliente**, não da consultora: quem leva a comissão da venda nova é quem vendeu, mesmo sendo outra pessoa.

**Crediário no extrato:** parcela não paga aparece em "Comissões a receber", com data prevista e separando **a vencer** de **atrasado** — mas **FORA do saldo**. O que firma a comissão é o pagamento: antecipou, entra antes; atrasou, entra depois.

### 2.1.1 O extrato é a TELA ÚNICA (03/08/2026)

A aba **Fechamentos** foi removida. Tudo — ver, pagar, estornar e lançar acerto — acontece dentro do extrato. O *registro* de fechamento continua existindo por baixo (é dele que sai a linha de baixa, na competência); o que sumiu foi a tela.

**Quem vê o quê** (`src/lib/comissao-permissao.ts` — decidido no SERVIDOR):

| Quem | Vê | Pode pagar |
|---|---|---|
| Papel com `role_permissoes.financeiro.pode_ler` (admin, administrativo, desenvolvedor, diretor, financeiro, gerente_loja) | todas as consultoras | sim, se `pode_escrever` |
| Vendedora com `public.vendedores.user_id` ligado | **só o próprio extrato**, via `/minha-comissao` | não |

⚠️ **A permissão saiu da lista cravada e passou a vir de `role_permissoes`.** As rotas repetiam `["desenvolvedor","admin","gerente_fabrica","gerente_loja"]`, que DIVERGIA do cadastro: `gerente_fabrica` via comissão sem autorização e `administrativo`/`diretor` estavam autorizados e não entravam. O papel `financeiro` não tinha linha nenhuma — foi criada (log 347).

⚠️ **O `consultoraId` da URL é um PEDIDO, não uma ordem.** Quem não vê todas recebe sempre o próprio id (`resolverConsultoraAlvo`), em vez de 403 — assim trocar o número na barra não vaza nem revela quais ids existem. Esconder botão no front nunca foi a permissão.

**As ações** (menu "mais ações", só para quem pode pagar):
- **Realizar pagamento** (`POST .../extrato/[id]/pagar`): num clique cria o fechamento da competência, gera os itens dos pagamentos do período, adota os lançamentos soltos e marca **pago** na data informada. O valor vem do saldo mas é **editável** — grava o que o Pix pagou, não a teoria. **NÃO gera conta a pagar**: em produção nunca existiu uma (0 registros) e o registro é feito com o dinheiro já pago. Pagar duas vezes a mesma competência dá 409.
- **Estornar pagamento** (`DELETE` na mesma rota, motivo obrigatório): volta para rascunho e limpa `paid_at`. Nenhum lançamento é apagado.
- **Incluir lançamento** (`ajustes/route.ts`): agora exige **competência** — o lançamento é datado no último dia do mês a que se refere, e nasce SOLTO (o pagamento daquele mês adota). Antes carimbava `hoje` e criava fechamento por conta própria: foi assim que o acerto de R$199,17 da venda 15323 (de maio) foi parar dentro do fechamento de junho.

**As DUAS telas** (`src/lib/comissao-extrato.ts` + `api/financeiro/comissoes/extrato[/[consultoraId]]`), no formato do extrato do Tiny/Olist:

- **Tela 1 — lista:** uma linha por vendedora no mês. Colunas: `Saldo ant.` · `(+) Comis. mês` · `(−) Déb. devoluções` · `(+) Out. créditos` · `(−) Out. débitos` · `(−) Pgtos` · `Comis. pend.` · `(=) Saldo`.
- **Tela 2 — detalhe:** as linhas de cada balde (comissões do mês com valor pago/base/comissão, débitos de devolução, outros créditos, outros débitos, pagamentos) + o Resumo que fecha o saldo. Clicar na vendedora abre.

**Os baldes:** vale-troca usado e ajuste positivo caem em **outros créditos** (mesmo lugar do Tiny); ajuste negativo em outros débitos; item `nao_comissionavel` fica visível em comissões do mês com R$ 0.

⚠️ **O saldo anterior só baixa quando o fechamento é marcado `pago`.** Em 03/08/2026 **nenhum** fechamento tinha status `pago` (6 em rascunho de mai/jun, R$23.980,57) — e ainda havia pagamentos anteriores a julho que nunca entraram em fechamento nenhum (Germana 1.881,78 · Cristiane 1.279,21 · Debora 892,15). Resultado: o saldo anterior de julho abre em Germana 12.232,22 · Debora 8.987,59 · Cristiane 6.614,73 · Loja 0,04. Até alguém marcar os fechamentos pagos, a coluna Saldo mostra como devido o que já foi pago por fora.

⚠️ **O extrato agrupa por DATA, não pela competência do fechamento.** Um `ajuste_positivo` de R$199,17 (venda 15323) está dentro do fechamento de **junho** mas tem `data_recebimento` 08/07 — logo aparece em **julho** na tela. É o comportamento certo para um livro-razão, mas explica divergência contra o fechamento.

**Fechamento vira o PAGAMENTO, não o cálculo.** Ao gerar o fechamento do mês, ele **adota** os lançamentos soltos do período (`adotarLancamentosSoltos`) e soma ao total. Um mês só de devolução pode fechar com saldo negativo.

⚠️ **Armadilha do PostgreSQL: `LEAST` IGNORA NULL** — `LEAST(NULL, 1)` devolve **1**, não NULL. Um `COALESCE(LEAST(recebido/total, 1), 0)` lê venda **sem pagamento nenhum** como "100% recebida" e debita a comissão cheia de quem nunca recebeu nada. Usar `CASE WHEN total > 0 THEN LEAST(...) ELSE 0 END`. Achado no ensaio do acerto de julho (inflava o débito de R$640,60 para R$666,96).

**Acerto de julho/2026 aplicado em prod** (log 331, 03/08/2026): 15 débitos de devolução (**−R$640,60** — Debora 423,58 / Loja Alisson 127,20 / Germana 85,82 / Cristiane 4,00), 14 vales marcados, 11 pagamentos de vale liberados (R$22.755,50) e o fechamento parcial da Germana (01–15/07, R$125,20) substituído por lançamento solto para julho fechar num extrato só.

**Não é tocado:** a **dashboard comercial e a meta**. Ela usa `forma` e `valor_vale_troca`, nunca `comissionavel`. ⚠️ Já a tela `dashboard-comercial/analise-comissoes` tem regra própria ("Vale-Troca não gera nova comissão") e passa a **divergir** do fechamento — alinhar é tarefa separada.

Arquivos: `src/app/api/financeiro/comissoes/*` (inclusive `extrato/route.ts`), `src/lib/comissao-lancamentos.ts`, `src/lib/vale-troca.ts`, `src/lib/devolucoes.ts`, `src/lib/types/financeiro-comissoes.ts`.

### 2.1.2 A comissão sai do PREÇO CHEIO, e quem calcula é o SERVIDOR (migration 366, 03/08/2026)

**A regra:** a faixa de comissão de um item vem do desconto medido contra o **preço cheio** — `itens_venda_erp.preco_lista_cheio`. Para item em promoção, é o `preco_original` que a campanha fixou; para os demais, o próprio `preco_lista`.

🔴 **Este é o desconto da COMISSÃO. NÃO é o desconto de ALÇADA.** São dois números diferentes e misturá-los quebra a operação:

| | Base | Promoção conta? | Serve para |
|---|---|---|---|
| Desconto de **alçada** | `preco_lista` (o promocional) | **não** — é pré-aprovada | decidir se precisa de aprovação |
| Desconto de **comissão** | `preco_lista_cheio` | **sim** | achar a faixa |

Um item com 32,89% de promoção **vende sem aprovação nenhuma** — só passa a pagar 0,50% em vez de 4,00%. Usar o preço cheio na alçada faria toda venda promocional pedir aprovação (decisão do Jonathan, 03/08/2026).

**O que estava errado:** o preço cheio não existia no banco. Para item em promoção `preco_lista` guarda o preço **promocional**, e o preço da campanha vivia só como `preco_lista_original` no estado React de `NovaVendaClientV2` — sumia quando a venda era reaberta. `comissaoPct()` caía no fallback `getComissao(pctManual)`, media o desconto contra o preço já promocional, enxergava ~0% e pagava a **faixa cheia de 4%** onde a tabela mandava 0,50%. A tela de detalhe da venda era pior: não conhecia promoção nenhuma. **Qualquer edição depois da venda criada derrubava a comissão pra faixa cheia** — por isso o erro parecia intermitente (venda criada e paga sem reabrir saía certa).

Somava a isso que as rotas gravavam `${body.pct_comissao}` **cru**: a comissão vinha pronta do navegador, sem recálculo nem conferência contra `faixas_comissao`.

**Custo medido:** R$ 575,61 em 8 itens de julho/2026, corrigidos em produção no log 357 (fechamentos de julho ainda em rascunho na hora).

**A fronteira — o que o servidor NÃO recalcula** (`src/lib/comissao-item.ts`):

1. **Item sem `produto_id`.** Aliança e peça personalizada nunca têm — 117 itens desde 01/05/2026, só desses dois tipos. A comissão deles vem do **módulo de orçamento, que calcula pelo PESO**. Decisão do Jonathan (03/08/2026): *"não é bug, é do módulo de orçamento de alianças, ele vê o peso"*.
2. **Venda fora do rascunho.** O que congela a comissão é a **venda aprovada** (Jonathan, 03/08/2026). Em rascunho tudo recalcula; aprovou, fica como está.

⚠️ O `preco_lista_cheio` é gravado **sempre**, mesmo quando a comissão não se mexe — é um fato do item (qual era o preço cheio na hora), não um recálculo. Sem isso a auditoria não teria contra o que medir.

⚠️ **Nunca fazer JOIN direto em `promocao_itens`.** Um produto pode estar em **duas campanhas sobrepostas** na mesma data (AJ4895 em 31/07/2026) e o join direto **duplica a linha do item**, inflando qualquer agregado. Usar subconsulta escalar / `LEFT JOIN LATERAL` com `LIMIT 1`, desempate `ORDER BY data_inicio DESC, id DESC` (o mesmo de `vw_produto_preco_vigente`).

⚠️ **Gravação nova e backfill usam regras diferentes, de propósito.** A gravação lê `vw_produto_preco_vigente` (que exige `situacao_manual='agendada'`) para o preço cheio ser exatamente o que a vendedora viu na tela. O backfill olha **só a janela de datas**: campanha encerrada na mão vira `encerrada_manual` e some da view, mas a rota de encerrar já faz `data_fim = LEAST(data_fim, CURRENT_DATE)` — exigir `agendada` faria as vendas feitas enquanto a campanha estava no ar perderem o preço cheio (10 campanhas nessa situação).

**Também corrigido:** o recálculo de `tarefas/[id]/aprovacao/route.ts` varria **todos** os itens da venda usando `pct_desconto`, sem filtrar aliança — aprovar um desconto numa venda com aliança substituía a comissão da aliança pela faixa. Agora respeita a mesma fronteira e mede pelos preços.

**A tela precisa MOSTRAR a promoção, senão o número certo vira chamado.** Com a comissão corrigida e a tela intacta, a aba Produtos exibia `preço lista 599,00 · % Desc — · comissão 0,50%`: sem desconto nenhum à vista e comissão de piso. A consultora abre chamado — e tem razão, porque pela tela não existe desconto. Item em campanha passa a mostrar três apoios: o selo `promoção · <campanha>` no nome, `cheio R$ 890,00` riscado sob o preço lista, `promo 32,70%` sob o "—" da coluna % Desc e `faixa de 32,70%` sob a comissão. Item sem campanha fica idêntico ao de antes. Vale para a aba Produtos do detalhe da venda **e** para a tela de nova venda.

⚠️ A coluna **% Desc continua "—"** de propósito: ali é o desconto de **alçada**, e ele é zero mesmo. A promoção aparece embaixo, separada, porque é outra conta.

⚠️ A prévia de comissão do detalhe da venda usava `getComissao(pct_desconto)` ao editar — mostrava 4,00% e virava 0,50% depois de salvar. Agora a prévia usa a mesma base do servidor.

🔴 **A migration 366 é PRÉ-REQUISITO DURO do deploy.** `GET /api/vendas/[id]` seleciona `ive.preco_lista_cheio` direto: subir o código sem a coluna derruba o detalhe da venda inteiro (500).

**Fica de fora (vai para o ERP novo, decisão do Jonathan em 03/08/2026):** o `Math.min(maxDesconto, ...)` de `NovaVendaClientV2` não limita desconto nenhum — limita só **o número gravado**. Digitando o preço final em vez do percentual, a peça sai com 23,39% de desconto e o registro diz 20% (o teto da vendedora), sem aprovação de ninguém; o servidor não pega porque confere o número já maquiado. É contorno de **alçada**, não de comissão (casos 15275 e 15751). Não mexer neste sistema.

Arquivos: `src/lib/comissao-item.ts`, `supabase/migrations/366_comissao_preco_lista_cheio.sql`, `src/app/api/vendas/route.ts`, `src/app/api/vendas/[id]/itens/{route,[itemId]/route}.ts`, `src/app/api/vendas/solicitacoes-desconto/[id]/route.ts`, `src/app/api/tarefas/[id]/aprovacao/route.ts`.

---

### 2.2 A comissão DEPENDE DA META — migration 376, 05/09/2026

**A regra-mãe:** a comissão das vendas de um mês vale o quanto a consultora fez da meta daquele mês.

| Vigência | Fator |
|---|---|
| até julho/2026 | **100%** — a regra não é retroativa |
| **agosto/2026** | **50%** para quem não bateu a meta prata; 100% para quem bateu. Mês pago, congelado |
| **setembro/2026 em diante** | o **percentual exato atingido**, **teto 100%**, **sem piso** — fez 70%, recebe 70%; fez 101,3%, recebe 100% |

- **A meta que vale é a PRATA.** ⚠️ **A FONTE DE VERDADE É `public.metas_mensais.valor_prata`** (a tela que a equipe usa de fato), com `alissonerp.metas_vendedoras.meta_valor` só como rede: `COALESCE(mm.valor_prata, m.meta_valor)`. Existem DUAS telas de meta e a do ERP (`POST /api/vendas/metas`) grava na tabela ERRADA — em 01/09/2026 as metas de setembro foram cadastradas em `metas_vendedoras` por engano e depois DELETADAS de lá (log_mudancas_banco 474→476: *"a tela real usa public.metas_mensais"*). Ler só o ERP fazia setembro/2026 aparecer **sem meta** — e sem meta o fator vira 1, ou seja, a regra da comissão proporcional não valeria. Jul e ago/2026 estão nas duas tabelas com os mesmos valores. Ouro e diamante estão cadastradas e **não entram no cálculo** (decisão 05/09/2026). **CORRIGIR NO V2:** uma tabela de meta só.
- **O realizado é o mesmo da tela Análise de Resultado:** vendas do mês (fora `rascunho`/`cancelado`) MENOS vale-troca usado. Se as duas contas divergirem, a consultora vê um percentual na tela de meta e outro no extrato — e nenhuma das duas ganha a discussão.
- **O percentual é EXATO, não arredondado** (88,9421% e não 88,9%). O fator vale sobre o total do mês: em ago/2026 arredondar linha a linha dava R$ 733,88 contra R$ 733,82 do total — 6 centavos, mas a regra tem que ser uma só.
- **O fator segue a VENDA, não o pagamento.** Uma parcela de crediário de uma venda de setembro que só cair em março chega com o fator de setembro — o mérito é do mês em que a venda foi feita. É por isso que `comissao_resultado_mensal` **congela** no fechamento (`POST .../fechamentos/[id]/fechar`): sem congelar, uma venda cancelada em novembro mudaria o realizado de setembro e, com ele, a comissão de um mês **já pago**.
- **DEVOLUÇÃO DEVOLVE SÓ O QUE FOI PAGO:** o débito usa o fator da venda devolvida, não o do mês em que a peça voltou. ⚠️ Foi o erro pego a tempo em 05/09/2026: três devoluções da Débora (DV-00067, DV-00080, DV-00082) eram de vendas de agosto, mês em que a comissão saiu pela metade, e estavam sendo debitadas pelo valor inteiro — R$ 53,71 a menos para ela.
- **Consultora SEM meta cadastrada recebe fator 1** (integral), não zero. Esquecer de cadastrar a meta é falha administrativa e não pode virar desconto na consultora. Quem realmente não recebe está em `COMISSAO_VENDEDORES_EXCLUIDOS` — hoje só a **Loja Alisson (134)**, que não é consultora e tinha R$ 1.795,20 (ago) + R$ 519,64 (jul) parados no extrato.
- **Sem meta batida, sem bônus.** O prêmio da empresa (`config_premiacao`) é **texto livre**, ninguém calcula nem paga pelo sistema — entra como crédito manual em "outros créditos". Por isso a trava está no lançamento: `natureza='bonus'` é bloqueado (409) para quem fechou abaixo de 100%; `natureza='acerto'` **nunca** é bloqueado, senão corrigir erro nosso ficaria impossível.
- **A consultora vê ao vivo:** o extrato mostra meta, realizado, percentual, quanto falta e a que percentual a comissão está saindo hoje. Bater a meta devolve o valor cheio de todo o mês, não só das vendas novas. A previsão de crediário ("comissões a receber") também já sai com o fator.
- **VALE-TROCA VIROU VENDA NORMAL (05/09/2026):** pagamento em vale saiu de "outros créditos" e entra em **comissões do mês**, com etiqueta. Os totais não mudam (o saldo é a soma dos baldes) — o que muda é a venda em vale deixar de ficar escondida num canto e passar a contar visivelmente na leitura do mês. "Outros créditos" fica só para ajuste manual.
- **PONTO ÚNICO DE VERDADE: `src/lib/comissao-fator.ts`.** A fórmula **NUNCA** é copiada — é chamada. Os cinco lugares que calculam comissão (`comissao-extrato.ts`, `fechamentos`, `elegiveis`, `resumo`, `comissao-lancamentos`) passam por lá. ⚠️ Foi exatamente uma fórmula copiada que fez a regra do "A Receber" ficar certa na prévia e errada em quatro arquivos, em julho/2026.
- **RITMO DA META NO EXTRATO (05/09/2026):** além de meta/realizado/percentual, o extrato mostra **onde a consultora deveria estar hoje**, quanto falta **por dia e por hora** e **quanto de comissão está em jogo** (comissão cheia − comissão com o fator). Aparece para a consultora E para o financeiro (decisão do Jonathan), e **só no mês corrente** — em mês encerrado "faltam X por dia" seria conselho para corrida terminada.
  ⚠️ O ritmo vem de **`public.metas_por_hora`** (`tipo_meta='Prata'`), gerada pelo trigger `trigger_gerar_metas_por_hora` no cadastro da meta, já respeitando jornada, horário de início e dias não trabalhados. **NUNCA dividir a meta por 30 aqui:** daria um número diferente do combinado com a equipe e criaria duas verdades de meta na mesma tela. Mês sem `metas_por_hora` gerada não mostra ritmo — a tela esconde o bloco em vez de inventar número.
  Exemplo real (05/09/2026, mês em curso): a Débora tinha feito R$ 29.787 dos R$ 41.923 que o mês já pedia (R$ 12.136 atrás do ritmo), precisando de R$ 8.962/dia nos **21 dias úteis** restantes (252 horas), com **R$ 293,28 de comissão em jogo**. ⚠️ São 21 dias e não 25: as 48 horas de folga do mês têm `valor_meta = 0` e o filtro `valor_meta > 0` as tira da conta — sem ele o ritmo pedido sairia menor do que o real.
- ⚠️ **A data que define o mês da venda ainda é `data_venda` (a do RASCUNHO), não a da aprovação.** Rascunho aberto em 31/08 e aprovado em 02/09 conta em agosto. Em ago/2026 isso valeu R$ 24,14 em três pedidos. **CORRIGIR NO V2:** guardar a data de aprovação como competência e manter a do rascunho só para medir o tempo que a consultora leva para fechar a venda.

## 3. Estoque comercial, reserva e entrega

- **Item de venda CRIA RESERVA** ao ser inserido (quando `estoque_comercial_config.ativo=true` pro produto) — nunca saída direta. A reserva vira **saída** quando a venda é **entregue**.
- **Aprovar a venda NÃO baixa estoque** — a baixa de ESTOQUE (reserva → saída) é só na **entrega** (confirmação do recebimento / retirada). Não confundir com a baixa da **conta a receber** (financeiro), que essa sim ocorre na **aprovação** (mig 299). São duas "baixas" diferentes — peça ≠ dinheiro.
- **Saldo comercial = `vw_saldo_estoque_comercial`**: `disponivel = saldo - reservado`. **SEMPRE conferir `reservado` antes de assumir que há peça livre** — pode haver saldo físico já reservado por outra venda (inclusive rascunho).
- **Baixa segue a EXISTÊNCIA da reserva**, não a flag `controla_estoque` (corrigido 12/06). Item com reserva ativa → baixa e divide; item sem reserva → pula sem erro.
- **`reservas_estoque_comercial` NÃO tem triggers PRÓPRIOS** (na tabela) → dá pra ajustar a linha direto (UPDATE/cancel) sem efeito colateral. ⚠️ Isso NÃO vale para apagar o ITEM da venda (ver bullet abaixo) — o item tem gatilho + FK que mexem na reserva.
- **Apagar item de venda (só em rascunho) NÃO deixa reserva órfã** *(B10, conferido em prod 18/06/2026)*. Remover um item (`DELETE /api/vendas/[id]/itens/[itemId]`, permitido **só** com `situacao='rascunho'`) limpa a reserva **sozinho**, por DOIS mecanismos redundantes: (1) FK `item_venda_id → itens_venda_erp(id) ON DELETE CASCADE` (mig 140, **validada** em prod) apaga a linha da reserva junto; (2) gatilho `trg_estoque_comercial_reversao_item` (AFTER DELETE em `itens_venda_erp`, mig 141) marca `cancelado` / estorna o movimento se já efetivado. **NÃO criar "limpeza manual" da reserva ao apagar item — a proteção já existe e funciona** (prova: 0 reservas órfãs com item apagado em prod). Impacto se duplicar a limpeza: dupla baixa/estorno.
- **Reserva pode ser de ITEM DE VENDA ou de ORDEM.** As colunas `item_venda_id`/`venda_id`/`ordem_id` são **nullable** (a tabela foi estendida depois da mig 140). Reserva ligada a uma ordem tem `item_venda_id` nulo — é normal, não é órfã. Ao caçar órfãs por `item_venda_id`, filtrar `item_venda_id IS NOT NULL` (senão as de ordem aparecem como falso-positivo).
- **Status de venda válidos: `rascunho` · `aprovado` · `em_rota` · `entregue` · `cancelado`.** **NÃO existe `concluido`** — era uma falha, **corrigida em 13/06/2026**. Ainda restam vendas antigas com `situacao='concluido'` no banco (resíduo, todas de antes de 13/06) — não criar lógica nova em cima desse status.
- **Reserva "presa" (B4, conferido em prod 18/06/2026):** a reserva fica `status='ativo'` para sempre quando a venda chegou a `entregue`/`concluido` **sem registro de entrega** (`entregas_venda`) — caminho antigo (pré-13/06) que pulava o módulo de entrega, então `baixarEstoqueDaEntrega` nunca rodou (sem entrega, não há o que baixar). Resultado: `reservado` inflado e `disponivel` errado (chega a negativo). São 16 casos antigos; **não nasce reserva presa nova depois de 13/06**. Limpeza = auditoria humana do pedido → **baixa** (peça real: gera saída + efetiva a reserva) ou **cancelar** (serviço/atípico), sempre em script **assinado**. Reserva de venda **viva** (rascunho/aprovado ainda não entregue) NÃO é presa — segura a peça de propósito.
- **Entrega parcial:** venda fica `aprovado` enquanto houver saldo pendente; vira `entregue` só quando toda a quantidade confirmada cobre os itens (`marcarVendaEntregueSeCompleta`).
- **Trava "Na Entrega":** não marca `entregue` enquanto houver pagamento `forma='Na Entrega'` `status='pendente'` — tem que cobrar antes (`POST /api/vendas/[id]/cobrar-entrega`).
- **Reposição aberta BLOQUEIA a entrega do item** (não a venda inteira): ordem `reposicao_venda`/`reposicao_loja` não-concluída trava só aquele produto (`calcularBloqueioReposicao`). Reposição sem produto identificável → trava a venda inteira (seguro).
- Cancelar venda (`situacao='cancelado'`) → `fn_estoque_comercial_cancelamento_venda` cancela as reservas ativas e estorna saídas já efetivadas (entrada reversa).

Arquivos: `src/lib/entrega-venda.ts`, triggers `fn_estoque_comercial_*`, migration `285_*`.

---

## 4. Trocar item de uma venda APROVADA (item sem estoque → outra variação em estoque)

Quando o item vendido não pode ser entregue (reposição atrasou) e existe **outra variação do mesmo produto** em estoque (ex.: outro aro): **NÃO cancelar a venda nem usar vale-troca** (ver §1) — **trocar o item na própria venda**.

Não tem feature/endpoint (o PATCH de item só edita venda em `rascunho` e nem mexe em `produto_id`). É **SQL manual assinado** (`assinar_mudanca_banco`, etiqueta `claude-code-jonathan`), em PROD.

**Receita (transação única):**
1. **Cancelar a ordem de reposição** do item velho (replicar o app): `UPDATE alissonerp.ordens SET situacao='cancelado', status='concluido', cancelado_por, cancelado_em`. ANTES confirmar **0 apontamentos** (`apontamentos_pcp` via `pcp.ordem_id`) — com apontamento só **master** cancela. Dispara `trg_cancelar_pcp_ordem` (PCP → cancelado).
2. Se a consultora já criou venda **nova duplicada** (mesmo cliente/vendedora, rascunho) segurando a peça: **cancelar esse rascunho** (`situacao='cancelado', bloqueado=true`) → libera a reserva sozinha.
3. **Trocar o item**: `UPDATE itens_venda_erp SET produto_id=<novo>, sku=(...), nome_produto=(...) WHERE id=<item>`. **Manter quantidade e valores idênticos** (preço/total/comissão) — senão `fn_recalcular_totais_venda` mexe nos totais; qtd igual = `fn_estoque_comercial_update_qtd_item` é no-op.
4. **Reapontar a reserva**: `UPDATE reservas_estoque_comercial SET produto_id=<novo> WHERE id=<reserva>`.
5. **Entrega pelo front** baixa a peça real.

**Gotchas (verificados no caso da venda 15274 em 16/06):**
- Proteções `fn_proteger_itens_venda_fechada` e `fn_proteger_venda_fechada` só bloqueiam `confirmado/concluido/entregue` → `aprovado` passa.
- `fn_bloquear_venda` barra se `bloqueado=true` — conferir antes.
- Conferir `reservado` no `vw_saldo_estoque_comercial`: a peça "em estoque" pode já estar reservada por outra venda.
- Esses anéis não usam RFID (`joias_rfid` vazio) — se usar, a baixa também marca RFID por `venda_id`+`item_venda_id`.

---

## 5. Cancelamento de venda

- `POST /api/vendas/[id]/cancelar`: bloqueia se houver **pagamento confirmado** ("estorne antes"). Consultora só cancela venda própria e em `rascunho`. Venda `concluido` não cancela.
- Faz `UPDATE vendas_erp SET situacao='cancelado', bloqueado=true`; devolve crédito de gerente usado (se houver); cancela pedido no Tiny (best-effort).
- Triggers no cancelamento: libera reservas/estorna estoque comercial (§3) e cancela contas a receber pendentes.

## 6. Aprovação de desconto (rascunho → aprovado)

- Numa venda em `rascunho`, item com `pct_desconto` acima do limite da vendedora (`usuarios.mx_desconto_permitido`, default 15%) **pode ser salvo**, mas a venda **não aprova** enquanto `desconto_aprovado_por` estiver vazio (gate em `vendas-aprovar.ts → approveVenda`). Na tela aparece o botão **"Solicitar Aprovação de Desconto"** → cria tarefa (`tipo=desconto`, tag `aprov_desconto_acima`) → admin/diretor aprova → `tarefas/[id]/aprovacao` grava `desconto_aprovado_por`/`_em` e libera a aprovação da venda.
- **Reeditar/adicionar item acima do limite INVALIDA a aprovação anterior** (o valor mudou, precisa reaprovar). Ao invalidar, as rotas de itens (`POST` e `PATCH /api/vendas/[id]/itens`) zeram **`desconto_aprovado_por`, `desconto_aprovado_em` E `aprovacao_desconto_tarefa_id`**, e cancelam a tarefa vinculada **só se ainda estava pendente** (`aguardando_aprovacao`) — tarefa já aprovada é histórico, não se reescreve.
- ⚠️ **Por que limpar `aprovacao_desconto_tarefa_id` é obrigatório:** o front só mostra o botão de solicitar quando esse campo é NULL (`precisaSolicitarDesconto`). Se ficar apontando para uma tarefa já `aprovada`, somem TANTO o botão de solicitar QUANTO o banner de "aguardando" → a venda trava em rascunho sem como reaprovar. Bug corrigido em jun/2026 (venda 15628; outras 4 ficaram presas: 15300, 15312, 15399, 15562).

## 6.1 Não se aprova venda com saldo SEM forma de pagamento declarada (06/08/2026)

**A regra.** Ao passar de `rascunho` para `aprovado`, a soma de **todos os pagamentos lançados** (`pagamentos_venda` com `status IN ('confirmado','pendente')`, qualquer forma) tem que fechar o `total_venda`. Sobrando saldo, a aprovação é recusada: *"Falta R$ X sem forma de pagamento. Lance o valor que falta (ou declare como 'A Receber') antes de aprovar a venda."* Tolerância de R$ 0,01, **sem piso**.

**Por que existe.** A venda 15861 (28/07/2026) foi aprovada com R$ 2.000 de Pix num total de R$ 20.524. O saldo não tinha plano nenhum, e o gatilho `fn_venda_gerar_conta_receber` caiu no `ELSE` genérico e **inventou** um crediário vencendo na `data_entrega`. Ninguém decidiu esse prazo.

**Onde está.** Fonte única em `verificarSaldoDeclarado()` (`src/lib/vendas-aprovar.ts`), usada por `approveVenda()` (a trava real, vale para os **8 caminhos** que aprovam venda) e por `POST /api/vendas/[id]/solicitar-aprovacao` (só para o 409 com mensagem — o `catch` de lá usa `internalError`, que mascararia tudo em "Erro ao aprovar venda"). Essa rota é **a porta que a loja de fato usa** e era a que aprovava direto sem olhar saldo.

**O que a regra NÃO exige (medido em produção):**
- ❌ Pagamento **confirmado**. O fluxo normal aprova com o Pix/cartão do MP ainda `pendente` — o webhook confirma segundos depois. Exigir confirmado barraria ~429 vendas boas por trimestre.
- ❌ `credi_tipo` no "A Receber". 4 em cada 10 são lançados sem prazo (20 só em julho/2026).
- ✅ `estornado`/`cancelado` **não contam** — deixaram de ser pagamento.

**O `ELSE` do gatilho CONTINUA existindo**, de propósito: é ele que atende o fluxo normal (~429 vendas / R$ 1,55 mi entre 05 e 08/2026), em que a conta nasce na aprovação e o webhook a quita segundos depois. Remover quebraria a loja.

### 🔴 Blindagem — leia antes de mexer nesta trava

A 1ª versão (PR #142, mergeada e revertida em 06/08/2026) **derrubou produção**. O sistema entrou em loop de reinício com `UNDEFINED_VALUE` e erro dentro do handler de socket do driver. **A causa nunca foi provada** — não houve como recuperar o log, e a falha não reproduziu em build de produção local. O que mudou na versão atual:

1. **A trava SÓ LÊ.** A 1ª versão gravava em `webhook_log` copiando o formato do guard de desconto logo acima — e aquele INSERT tem `'texto >${var}%'` com interpolação **dentro de aspas**: o driver manda 2 parâmetros para uma query que só usa 1, o que é recusado no meio do protocolo e pode deixar a conexão do pool inutilizável. Nenhuma escrita no caminho da aprovação.
2. **Uma query, um parâmetro, validado como inteiro finito antes de encostar no driver** — `undefined`/NaN nunca chegam ao postgres.js (`UNDEFINED_VALUE` aborta a query no meio da escrita).
3. **Falha aberta.** Qualquer erro inesperado dentro da trava → a venda **aprova** e o erro vai pro log. Conferência que derruba a loja é pior que a falha que ela previne.
4. **Chave de desligar sem deploy:** `configuracoes_sistema.chave = 'trava_saldo_nao_declarado'` com valor `false`/`0`/`off`. Ausente = ligada.

Regra de ferro daqui pra frente: **testar com build de produção** (`npm run build` + `node .next/standalone/server.js`), não só com `npm run dev`. Os erros da queda eram todos de `.next/server/chunks` — ambiente que o dev não exercita.

**Backtest** (179 aprovações reais, 18/03 a 05/08/2026): barraria de 11 a 16 — cerca de 1 venda a cada 12 dias. Caso limítrofe conhecido: venda 15895, faltavam R$ 20 (provável frete) — para, e é o comportamento escolhido.

## 6.2 "Ação Marketing" (cortesia) — aprovação do Alisson via tarefa (19/08/2026)

**A regra.** "Ação Marketing" é uma forma de pagamento normal no formulário (`PagamentoForm.tsx`,
texto livre em `pagamentos_venda.forma`, sem CHECK) — qualquer vendedora escolhe, igual
Pix/Dinheiro/A Receber, e nasce `status='pendente'`. Ao pedir aprovação da venda, se sobrar
pagamento "Ação Marketing" pendente, o sistema cria automaticamente uma **tarefa pro master admin
(Alisson)** — mesma arquitetura já usada por desconto acima do limite (§6) e por "A Receber"/
crédito (`vendas-credito-aprovar.ts`): coluna própria em `vendas_erp.aprovacao_marketing_tarefa_id`
(migration 373), pra não bloquear/colidir com as outras aprovações pendentes na mesma venda.

**Diferença do crédito.** Lá o aprovador é resolvido pela config (`resolverAprovadores`, gerente ou
diretor conforme saldo disponível). Aqui o aprovador é **sempre** o master admin
(`getMasterAdminId()`, `src/lib/master-admin.ts`) — fixo, sem tier, sem CATÁLOGO config-first. É
decisão de negócio (só o dono decide brinde/cortesia), não uma regra configurável.

**Como aprova.** Alisson abre a tarefa pela tela normal (`/tarefas/[id]`) e decide como qualquer
outra. No dispatcher (`PATCH /api/tarefas/[id]/aprovacao`), o bloco `tipo === "acao_marketing"`
**confirma o pagamento** (`status='confirmado'`) **antes** de chamar `approveVenda()` — como o
saldo já está coberto, a trigger `fn_venda_gerar_conta_receber` não cria conta a receber real.

**Por que não precisa de `podeDecidir`.** `eventoDaTarefa()` (`src/lib/aprovacoes/evento-da-tarefa.ts`)
devolve `null` pra `tipo === "acao_marketing"` de propósito — mesmo padrão de
`inventario_solicitacao`, não é evento do CATÁLOGO. O portão genérico do PATCH, sem evento, só
libera quem está gravado como `aprovador_id` (o Alisson) — ninguém mais decide essa tarefa.

**Guard em `approveVenda()`.** Bloqueia a aprovação direta (fora da tarefa) enquanto sobrar
pagamento "Ação Marketing" `pendente` — mesmo estilo dos guards de desconto/cartão que já existem
ali. Fecha a brecha de alguém aprovar a venda direto (PATCH `/api/vendas/[id]`) sem passar pelo
Alisson. Esse guard nunca pega o caminho legítimo: a tarefa CONFIRMA o pagamento antes de chamar
`approveVenda`.

**O que NÃO faz.** Não recria o botão "aprovar direto" da primeira tentativa (v2.85.12, revertida)
— a decisão do Alisson agora é sempre pela tela de tarefas, igual às outras aprovações.

**🔴 Bug corrigido (19/08/2026, mesmo dia): confirmação manual do PAGAMENTO bypassava tudo.** O
guard acima só protege a APROVAÇÃO DA VENDA — mas existem 3 portas separadas que confirmam um
PAGAMENTO individual sem passar pela venda: botão "Confirmar" na tela da venda (chama `PATCH
/api/vendas/[id]/pagamentos/[pagId]`), a rota `POST .../pagamentos/[pagId]/confirmar` (idem padrão
de bloqueio do "A Receber"), e a aprovação de "solicitação de alteração" tipo `pagamento_status`
(`solicitacoes-alteracao/[id]/route.ts`, aprovador config-first genérico, não necessariamente o
Alisson). Testado ao vivo na venda 30612: o botão "Confirmar" confirmou o pagamento na hora, sem
nenhuma tarefa nascer. Corrigido nas 3 portas (guard idêntico ao de "A Receber" em `confirmar/
route.ts`) + o botão "Confirmar" do front agora exclui `forma === "Ação Marketing"` (mostra
"Solicitar Aprovação" em vez, como o "A Receber"). **Lição:** ao adicionar aprovação obrigatória
pra uma forma de pagamento nova, mapear TODOS os caminhos que fazem `UPDATE pagamentos_venda SET
status='confirmado'`, não só o de aprovar a venda.

## 7. Inventário do estoque comercial (v2.80.0)

- **Inventário é auditoria, NÃO ajusta estoque.** Concluir congela a contagem; `ajustes_gerados` é sempre 0. Divergências são tratadas manualmente item a item depois de investigar. (O helper `gerarAjustesDivergencias` existe em `src/lib/inventario-helpers.ts` mas está desligado de propósito.)
- **`diferenca` é coluna GERADA pelo banco** (`quantidade_contada - quantidade_sistema`, migration 140). NUNCA escrever nela via UPDATE — a migration 336 tem blindagem que reconverte se estiver dessincronizada.
- **Pendências por item (migration 336):** item divergente (faltando/excedente) ou sem contagem recebe `pendencia_obs` (o que aconteceu) via `PATCH /api/estoque-comercial/inventario/[id]/pendencia`. Depois a gerência responde **"foi resolvida?"** (`pendencia_resolvida` true/false + `pendencia_resolucao_obs`). NULL = sem resposta. Quem registrou/respondeu e quando ficam gravados. Resolução é permitida **até depois de concluído** (só `cancelado` trava tudo).
- **Quem faz o quê** (constantes em `src/lib/roles.ts`): `ROLES_INVENTARIO_VER`/`_CONTAR` = gerência + estoquistas (ver e contar); `ROLES_INVENTARIO_GERENTES` = abrir, concluir, cancelar e **responder pendência** (estoquista descreve, só gerência resolve).
- **Conferido ≠ contado.** Marcar `conferido` NUNCA grava contagem — item sem contagem exige digitar a quantidade real (era o bug que transformava pendente em OK falso). `/contar` aceita `quantidade_contada` e/ou `conferido` separados.
- **Concluir "sujo" exige forçar.** Se houver item sem contagem ou pendência sem resposta, `/concluir` devolve 409 (`requer_confirmacao`) — só conclui reenviando `{forcar:true}`, e o forçamento fica no `audit_log`.
- **Cancelar exige motivo** (mín. 5 chars) e grava `cancelado_por` + `motivo_cancelamento`. Inventário cancelado não pode ser "finalizado" pelo app RFID.
- **Auditoria total:** abrir, contar, concluir, cancelar, finalizar (app) e pendências gravam em `alissonerp.audit_log` via `logAudit` dentro da transação.
- **App RFID (Bearer):** `/finalizar` e `/inventario/app` validam role + usuário `ativo` (token de demitido não opera).
- **Operador de inventário (v2.83.0):** role `operador_inventario` (Ytalo/Geovana) vê tudo do estoque e conta via RFID, mas NÃO edita direto: abrir/concluir/cancelar inventário criam registro em `solicitacoes_inventario` + tarefa `inventario_solicitacao` para o aprovador (`configuracoes_sistema.aprovador_inventario`). Aprovou → executa via `src/lib/inventario-acoes.ts` (mesmo código da rota direta); rejeitou → nada muda. Conclusão aprovada usa forcar=true (a aprovação É a confirmação).
- **Detetive em lote (v2.82.0):** `GET /inventario/[id]/investigar-lote` roda o Detetive para todos os itens divergentes numa chamada só (badge direto na linha da lista); o detalhe completo por item (reservas/transferências/devoluções) continua em `GET /investigar?produto_id=`. UI: filtro por categoria e por status (cartões clicáveis) combinam entre si e com o filtro de pendência; paginação de 50 por seção; "Conferidos OK" recolhido por padrão.
- **Os dois cartões de divergência somam TUDO (v2.83.6):** `Faltando` = peças contadas a menos + peças de item NUNCA contado; `Excesso` = peças contadas a mais + peças **"fora do inventário"** (etiqueta lida pelo app RFID de produto que nem estava na lista). Os chips "Sem contagem" e "Fora do invent." continuam existindo como **recorte** de cada cartão, não como categoria paralela. Clicar em `Excesso` traz as duas listas na tela (bloco roxo "Chips fora do inventário" + seção "Excedentes"). **Se voltarem a ser contagens separadas, o placar do topo volta a subestimar a sobra** — foi o caso do inventário #83 (07/08/2026): dizia "1 peça a mais" com 4 chips fora da lista na loja.
- **Inventário é de PEÇA PRONTA (v2.81.4):** pedra solta (3 critérios de `ehPedraSolta()` em SQL) e personalizada sob encomenda (`produto_personalizacao.ativo=true`) não entram em contagem de estoque na auditoria — assim como produto de TESTE (sku/nome "teste%"), OURO-insumo (nome "ouro%"), prefixos de SKU IS/PD/AS/PZ (insumo/pedra/serviço/personalização) e categoria "Serviços" (v2.81.5). O filtro é NA LEITURA (`condPecaPronta()` de `src/lib/inventario-peca-pronta.ts`, aplicado em GET/concluir/contar/app RFID) — vale até para inventário aberto ANTES da regra, sem apagar nem baixar nada. O snapshot de abertura também já nasce filtrado.
- **Detetive (investigação da falta, 100% leitura):** `GET /inventario/[id]/investigar?produto_id=` cruza reservas ativas (venda sem entrega confirmada → nº da venda + vendedora), transferências pendentes e movimentos pós-abertura. Só AFIRMA a causa quando a soma bate exatamente com a falta e não há outra explicação; senão são "pistas". Nunca acusa sem nº de venda.
- **Desfecho blindado (migration 338):** fechar pendência como resolvida EXIGE `desfecho_tipo`: `venda_sem_baixa` (exige nº da venda; valida existência/situação/produto; gera SAÍDA vinculada à venda e EFETIVA a reserva ativa — evita queda dupla do disponível), `perda` (dupla confirmação; bloqueia se deixar saldo < reservado), `localizada` (zera a falta: contada=sistema, decisão gerencial auditada), `excedente_confirmado` (gera ENTRADA), `outro` (só registro, obs obrigatória). **Baixa manual NÃO existe para ninguém (v2.81.3): movimento só por CONCILIAÇÃO — falta↔venda sem baixa (valida venda) e sobra↔devolução sem entrada (valida `devolucoes_itens` aprovado_retorno − entradas com `devolucao_id`); exclusivas de `ROLES_BAIXA_MANUAL` (admin/dev) com dupla confirmação. `perda` é SÓ registro (sem baixa). Mecanismo TEMPORÁRIO até organizar o sistema.** O Detetive roda automático ao abrir o painel de item faltando, e o nº da venda é link para `/vendas/[id]`. Quantidade SEMPRE derivada no servidor (|diferenca|). Desfecho que gerou movimento NÃO se desfaz pelo "desfazer resposta" (409) — exige estorno (movimento reverso).

## 8. Frete avulso registrado pelo motoboy (app)

- **Corrida avulsa = frete sem venda vinculada** (`entregas_venda.is_avulso=true`, `venda_id=NULL`). Criada pela lib `criarFreteAvulso` (gera `codigo_entrega`, audita). Loja cria pelo painel (`FreteAvulsoModal`); o **entregador cria a própria pelo app** (`MotoboyAppClient` → botão "Nova corrida").
- **Quem cria:** `POST /api/entregas-venda/frete-avulso` aceita roles da loja (`desenvolvedor/admin/gerente_loja/consultora`) **e** `entregador`. Quando quem chama é `entregador`, o servidor **força**: `motoboy_id = ele mesmo`, valor **fixo pela tabela** da região (`calcularValorMotoboy`: Fortaleza R$20 / Fora R$50 — o motoboy só escolhe descrição + região, **não digita valor**), `frete_cobrado = frete_motoboy` (sem cobrança de cliente → **não** mexe no `saldo_frete_gratis` da gerente), nasce `pendente`. Longe/Correios (valor 0) não são oferecidos ao motoboy.
- **Anti-fraude — quem confirma:** corrida que o **próprio motoboy registrou fica pendente de confirmação da LOJA** — ele não confirma o próprio lançamento. `POST /confirmar-avulso` bloqueia (403) quando `created_by == user.id` para role motoboy/entregador. Avulso **criado pela loja** e atribuído a ele **continua confirmável por ele** no app (`created_by != motoboy`). Admin/gerente confirma qualquer um.
- **Como o app sabe:** `GET /motoboy/minhas` devolve `auto_criado = (created_by = motoboy_id)`. No card, `auto_criado=true` + `pendente` → mostra "Aguardando confirmação da loja" (sem botão de confirmar); os demais pendentes mostram o botão.

## 9. Conversão Reversa — ouro do cofre vira joia no estoque (v2.8x, 15/07/2026)

- **O que é:** qualquer ouro **pendente de baixa no Caixa de Ouro** (venda em ouro, upgrade, compra de metal ou conversão de estoque) pode "virar joia": o peso sai do cofre e **uma peça já cadastrada e ativa** (`public.produtos.situacao='A'`) entra no **estoque comercial da Loja (local 2)**. Nunca cria produto novo. **Zero lançamento financeiro** — o custo já foi pago na origem. Sem protocolo/fábrica: a ordem (`tipo_ordem='conversao_reversa'`, número `CR-xxxx`) conclui na aprovação.
- **Peso restante (fórmula central):** `restante = peso_da_origem − SUM(cofre_ouro_baixa_itens.gramas de baixas 'pendente'|'em_trafego'|'concluido' da mesma origem)`. Saída **parcial** é permitida; o que sobra continua pendente de sangria e a aba Ouro mostra "Xg restantes (de Yg)". A sangria normal também passou a enviar o **restante** (não o peso cheio). Peso da origem: `conversoes_estoque.peso_total` / `compras_metal.peso_gramas` / `pagamentos_venda.ouro_peso` (⚠️ não é `ouro_gramas`) / `itens_venda_upgrade.peso_gramas`.
- **Fluxo:** estoquista/gerente/admin abre pela aba Ouro (botão "Virou joia") com **foto do peso OBRIGATÓRIA** → tarefa `conversao_reversa` p/ aprovação → aprovador aprova → numa transação: baixa do cofre (`destino='estoque'`, `status='concluido'`, sem transporte), item de baixa apontando a **origem original**, entrada em `movimentacoes_estoque_comercial` (motivo `entrada_conversao_reversa`), ordem concluída. Recusa não toca cofre/estoque.
- **Aprovadores (Configurações → Aprovadores → "Conversão Reversa", chave `aprovadores_conversao_reversa`, multi):** SÓ quem está na lista aprova/recusa — **nem admin fora da lista**; basta 1 aprovar. A tarefa só é visível pros listados. **Sem aprovador configurado, a abertura é bloqueada** com erro pedindo pra configurar (endpoints de aprovar/recusar mantêm fallback admin/dev só se a lista esvaziar com solicitação já aberta).
- **Blindagens:** duplicata pendente da mesma origem → 409; peso revalidado DENTRO da transação de aprovação (sangria entre abrir e aprovar); trava atômica (`UPDATE ... WHERE status_conversao='pendente' RETURNING`) contra aprovação/recusa dupla concorrente → 409. Rastreabilidade: `conversoes_reversas.baixa_id` + `movimento_entrada_id`; o Histórico de Baixas (destino `estoque`) detalha produto, solicitante, aprovador e a foto (`GET /api/conversao-reversa/detalhe-baixa`).

- **⚠️ A trava de duplicata NÃO segura repetição (caso real 17–18/08/2026, desfeito em 24/08).** O bloqueio de 409 só existe para reversa **pendente** da mesma origem. Com a primeira já **concluída** e peso sobrando na origem, a mesma peça pode ser lançada de novo — e cada lançamento **baixa ouro do cofre e cria peça no estoque**. Foi o que houve com a compra de metal #56 (95,420 g, ouro da Alderice): o Ytalo lançou as 5 peças em 17/08 (60,220 g) **aprovando as próprias solicitações** (é admin e está na lista de aprovadores) e, em 18/08, a Geovana repetiu duas delas — CR-2968 (anel 1893-18, 13,570 g) e CR-2972 (corrente AJ5301, 17,440 g), aprovadas pelo Alisson. Resultado: **2 peças fantasma na Loja e 31,010 g (R$ 12.404,00) baixados do cofre sem peça**, mais 2 etiquetas RFID extras gravadas em 20/08. O sinal de que é a mesma peça: **peso idêntico ao miligrama** e mesma origem. Enquanto o v2 não fecha isso (checar origem **+ produto**), **conferir o histórico da origem antes de aprovar toda reversa**.
- **Como DESFAZER uma reversa (não existe botão — é SQL assinado).** O botão "Estornar" da tela de estoque **só mexe no estoque: NÃO devolve o ouro ao cofre** — e ainda tira 2 do saldo em vez de 1 (ver `docs/arqueologia/CATALOGO-CODIGO.md` RN-CD-147). A baixa `concluido` também não tem transição para `cancelado` (`src/lib/cofre-ouro-status.ts`). O caminho correto, usado na CR-2699 (jul/2026) e nas CR-2968/CR-2972 (24/08/2026, livro de mudanças #457), tem 4 partes numa transação: (1) `movimentacoes_estoque_comercial`: INSERT de **saída** motivo `estorno` com `estorno_de_id` = a entrada errada, e na entrada original preencher **só** `estornado_por_id` — **deixando `status='efetivado'`**, porque a view de saldo soma apenas movimentos efetivados e marcar o original derrubaria o saldo a zero; (2) `cofre_ouro_baixas` da reversa → `status='cancelado'` (é isso que devolve o ouro: o disponível e o peso restante por origem só somam `pendente|em_trafego|concluido`) + rastreio `baixa_cancelada`; (3) a ordem `CR-xxxx` → `situacao`/`status` = `cancelado`; (4) as etiquetas RFID extras → `status='cancelado'`, **mas só depois de o leitor dizer qual EPC está grudado na peça real** (não existe rota para cancelar etiqueta ativa — `/api/rfid/reverter` só aceita `pendente_impressao`). A conversão em si fica `concluido` com a baixa cancelada — mesmo padrão da CR-2699.
- **A peça só APARECE se o produto tiver configuração de estoque comercial (v2.85.21).** Todas as telas de estoque leem `vw_saldo_estoque_comercial_v2`, que faz **JOIN obrigatório** com `alissonerp.estoque_comercial_config` (`ativo = true`). Produto sem essa linha **não aparece**, mesmo com o movimento de entrada gravado e efetivado — é **estoque fantasma**: o ouro saiu do cofre, a peça existe no razão e ninguém a vê na tela. Produto criado como **variação não nasce com config** (24/08/2026: 1.084 criados desde 20/08, 18 com config), então a aprovação da reversa passou a fazer o upsert da config **dentro da transação**, como a devolução já fazia. Ocorrências reais: peças de 17/08 (configs criadas à mão em 19/08) e as 3 de 24/08 — 1920-19, 1921-20 e 1922-17, os 35,200 g devolvidos ao cofre (destravadas por dado, livro #459). **Se aparecer peça "que entrou e não apareceu", olhar `estoque_comercial_config` ANTES de suspeitar do movimento.**

## 10. Movimentação Interna — peça circulando dentro da loja (EM PROD desde 11/07/2026)

- **O que é:** registra **quem está com cada peça DENTRO da loja** — consultora pede a peça pro estoque, mostra pro cliente, e resolve (o cliente leva ou a peça volta). Tela `/movimentacao-interna` (menu Logística). **Não é o Protocolo** (que é transporte Loja↔Fábrica com motoboy).
- **⚠️ NÃO MOVIMENTA ESTOQUE.** Este módulo é registro de posse, não de saldo. Nenhum passo dele gera `movimentacoes_estoque_comercial`, reserva ou baixa. A saída de estoque de verdade continua acontecendo só na **entrega da venda** (ver §3). Quem mexer aqui achando que ajusta saldo vai quebrar essa separação.
- **Sem role própria:** qualquer usuário autenticado opera qualquer passo. O sistema não bloqueia — ele **grava quem fez cada passo, quando, e a foto**. A prova é o histórico, não a permissão.
- **Ciclo:** `solicitado → entregue → recebido → [volta_solicitada →] finalizado`. Foto **obrigatória** nos passos físicos (entrega, recebimento, confirmação da devolução) — a peça trocou de mão, a foto é a prova. "Cliente levou" encerra em 1 clique sem foto. A volta ao estoque é **handshake de 2 passos** (solicitante pede → estoque confirma com foto), na mesma solicitação.
- **Múltiplas fotos + observação (mig 349, v2.87.0):** cada passo físico (entrega, recebimento, devolução) aceita **até 5 fotos** — não mais uma só. As fotos vivem na tabela filha `solicitacao_peca_fotos` (uma linha por foto, com `etapa`); as colunas antigas `foto_entrega/recebimento/devolucao` ficaram **congeladas** (não são mais escritas) e já foram copiadas pra tabela nova — a fonte de verdade das fotos passou a ser a tabela filha. Na **confirmação da devolução** há um campo **observação opcional** (`obs_devolucao`) pro estoque anotar o estado da peça na volta ("voltou com risco"). Continua sem mexer em estoque.
- **Cancelamento (mig 347, v2.86.0):** `solicitado → cancelado`, quando a consultora desiste antes de a peça sair do estoque.
  - **Só sai de `solicitado`** — a partir de `entregue` a peça já saiu fisicamente do estoque, e o desfecho honesto é a **devolução** (com foto) ou "cliente levou". Cancelar depois disso apagaria o rastro de que alguém está com a peça. A API devolve **409** e manda usar a devolução.
  - **Motivo é obrigatório** (API 400 + CHECK `chk_solic_peca_cancelado_motivo` no banco). É o que dá visibilidade de **por que** as consultoras desistem; sem ele o cancelamento vira buraco no histórico.
  - **Cancelada NÃO é "em aberto"** — o propósito da feature é justamente tirar do filtro "Em aberto" o que ninguém vai resolver. Chip próprio "Canceladas". Se o filtro voltar a ser `status != finalizado`, a feature perde o sentido.
  - Nada é estornado (coerente com o "não movimenta estoque" acima): a peça nunca saiu, a solicitação só encerra.
- **Origem v0:** a primeira versão reaproveitava `protocolos` tipo `interno`; os 23 registros reais foram copiados (mig 344) e `origem_protocolo_id` guarda a proveniência. O Protocolo filtra `tipo_protocolo != interno` pros antigos não vazarem na aba Ida.

## 11. Perda / extravio de peça — a única baixa manual do ERP (21/07/2026)

- **O que é:** peça que sumiu (não localizada, quebrada, extraviada) **sai do estoque de verdade**. Botão "Perda / extravio" no detalhe do produto em `/estoque-comercial/[produtoId]`. Grava `movimentacoes_estoque_comercial` com `tipo='saida'` e `motivo='perda_extravio'`.
- **Por quê:** sem a baixa o saldo mente para sempre — a peça reaparece em relatório, pode ser vendida e volta a divergir no inventário seguinte. Estoque errado também é problema.
- **🔴 Exclusiva do MASTER ADMIN (o dono).** O gate é por **identidade**, não por cargo: `isMasterAdmin(user.id)` contra `parametros_sistema.MASTER_ADMIN_USER_ID` (`src/lib/master-admin.ts`, imutável via trigger `fn_proteger_master_admin`). Nem admin, nem desenvolvedor, nem gerente — **ninguém mais**. Havia 7 admins e 3 desenvolvedores na base quando a regra foi criada; permissão por role teria dado a chave para 10 pessoas. **Se alguém trocar o gate por lista de roles, a feature perde todo o sentido.**
- **Endpoint separado de propósito:** `POST /api/estoque-comercial/perda`. A trava da v2.81.3 em `/api/estoque-comercial/movimentos` ("baixa manual não existe para ninguém", 403 em qualquer saída) **continua intacta** — perda é exceção nomeada e auditada, não buraco na trava genérica.
- **Dois freios antes de gravar:** (1) o modal mostra o **histórico de faltas em inventário** da peça (`GET /api/estoque-comercial/perda?produto_id=` — data, local, quanto faltou); (2) a palavra `PERDA` digitada. Constantes em `src/lib/perda-extravio.ts`. O **motivo escrito é opcional** (decisão do Jonathan, 21/07/2026) — quem/quando/quanto já ficam gravados no movimento e no `audit_log`; sem texto grava `NULL`, não string vazia.
- **Baixa limitada ao DISPONÍVEL** (físico − reservado), nunca ao físico: o reservado já está prometido a uma venda/ordem, e baixar em cima da reserva faria a peça sumir de um pedido aprovado (409 se exceder).
- **Estorno também é só do master** (`/api/estoque-comercial/estornar/[movimentoId]`): estornar perda devolve a peça, é a mesma decisão ao contrário. Se ficasse no padrão admin/dev, a trava vazaria pelo outro lado. Os demais estornos seguem admin/dev como antes.
- **Aparece marcada no fluxo de estoque:** a linha do extrato do produto ganha badge vermelho "Perda / extravio" com motivo, autor e data. Não existe (ainda) tela consolidada de perdas — decisão explícita do Jonathan em 21/07/2026.
- **Espelho no livro físico (migration 354):** o trigger `fn_mirror_movimento_to_sle` traduz `perda_extravio` → `voucher_type='perda'` em `stock_ledger_entry`, e `chk_voucher_type_valid` passou a aceitar esse tipo. Sem isso o motivo caía no `ELSE 'manual'` e `chk_voucher_for_outgoing` **rejeitava a baixa no banco** (toda saída precisa de documento ≠ manual). Tipo próprio em vez de `ajuste_saida` para a perda não se esconder no meio dos ajustes.
- **Botão "Baixa Manual" removido da tela (21/07/2026):** existia no detalhe do produto para admin/dev, mas a API responde **403 para qualquer saída manual desde a v2.81.3** — era botão morto que só dava erro. Ficou só a **Entrada Manual** (que a API aceita). Se voltar, volta a induzir a operação a achar que dá para "acertar" o estoque na mão.
- **Não confundir com o desfecho `perda` do inventário (§7):** aquele continua **só registro, SEM baixa**, e não foi alterado. São caminhos diferentes: inventário audita, a baixa por perda é decisão do dono na tela de estoque.

## 12. Ordem de aliança só nasce com o ARO CONFIRMADO (27/07/2026)

- **O que é:** a ordem de fabricação de **orçamento de aliança** **não é mais criada automaticamente** na aprovação da venda. A venda aprova normal (Tiny, financeiro, reserva de estoque — tudo igual) e **fica sem ordem**. Alguém precisa abrir a ordem à mão, no botão "Confirmar aro e abrir ordem" do detalhe da venda, informando o aro de **cada** aliança.
- **Por quê:** a numeração do aro é obrigatória no orçamento, mas na hora de fechar a venda o cliente muitas vezes **ainda não sabe o tamanho do dedo**. A consultora digitava qualquer número só para conseguir passar a venda — e, como a ordem nascia dentro da própria aprovação, **esse número chutado chegava na fábrica no mesmo segundo** e a peça saía no tamanho errado (relato do Jonathan, 27/07/2026).
- **Porta única:** `POST /api/vendas/[id]/abrir-ordem`. A trava vive em `criarOrdemDoOrcamento` (`src/lib/vendas-aprovar.ts`): `tipo='alianca'` só cria ordem com `opts.aroConfirmado = true`, e **só este endpoint passa a flag**. `approveVenda` chama sem a flag — a aliança sai de lá sem ordem, de propósito. **Se a flag for ignorada, o bug do tamanho errado volta.**
- **Vale só para aliança.** Orçamento de **peça personalizada** (`tipo != 'alianca'`) continua abrindo ordem automática na aprovação — não tem aro para confirmar (decisão do Jonathan).
- **Quem abre:** a **consultora dona da venda** (é ela que fala com o cliente e descobre o tamanho) e as roles de acesso pleno a vendas. Mesmo `requireVendaOwnership` do resto do módulo.
- **A tela é desenhada para fazer acertar, não para deixar errar:** um **cartão por aliança**, com a **gravação em destaque** (o nome gravado por dentro é o que identifica qual aliança é de quem), mais perfil, medidas e pedras. Nada vem pré-confirmado: cada aliança exige uma ação explícita — "Manter 18" ou escolher outro aro na lista. No par, o endpoint **recusa** (400) se o corpo não trouxer as duas fichas. **Juntar as duas num formulário só, ou pré-confirmar o aro do orçamento, reabre exatamente o erro que a tela existe para impedir.**
- **Aro é lista fechada (1–36),** nunca texto livre: `RING_SIZES` de `orcamento/constants.ts`, validado no servidor por `aroValido()`. Número inventado não vira ordem.
- **Trocar o aro muda o PESO, não o preço.** O aro define o diâmetro e o diâmetro entra no volume de metal (`computeWeight`). Ao confirmar, a ficha do orçamento é regravada com `aro_numeracao`, `diametro` e `peso_estimado` novos, e `ordens.peso_metal_negociado` passa a ser a **soma das fichas** — a fábrica recebe a grama do aro real. **`orcamentos.peso` e `orcamentos.valor` não são tocados**: são a base do valor negociado com o cliente (snapshot travado). Decisão do Jonathan: "a fábrica recebe o peso real; o valor que o cliente pagou não muda".
- **Como o peso é recalculado:** por **delta** (`src/lib/orcamento-aro-peso.ts`), não do zero — `peso_novo = peso_gravado + (raw(aro novo) − raw(aro antigo))`. Assim, **aro igual ⇒ peso idêntico ao orçado**, independentemente de mudanças de calibração/config desde o orçamento. Recalcular do zero faria o peso divergir do orçamento mesmo sem trocar o aro.
- **A troca fica registrada:** o `detalhes_ordem` recebe "Aro confirmado na abertura — Aliança 1: aro 9→14 (8.5g→9g)" e o `audit_log` guarda quem confirmou o quê. `orcamentos.aro_confirmado_por` / `aro_confirmado_em` (migration 362) registram a assinatura.
- **Ficha 2 só conta quando `quantidade = 2`:** existe orçamento com quantidade 1 e `ficha_tecnica_2_id` preenchida (resíduo de par que voltou a ser unidade, ex. ORC-0000144). Considerá-la faria a tela pedir dois aros para uma aliança só.
- **O risco novo tem antídoto:** venda de aliança fechada e sem ordem apareceria esquecida. Por isso a tela da venda mostra a faixa "Aliança sem ordem na fábrica" (e um cartão em "Ordens Vinculadas"), e a lista `/vendas` tem o filtro **"Aliança sem ordem"** (`?alianca_sem_ordem=1`). **Sem esses avisos, tirar o automático troca um bug por outro.**

## 13. Vendedora "Loja Alisson" fora de todos os cálculos da dashboard comercial (21/08/2026)

- **O que é:** a vendedora **"Loja Alisson"** (`id_vendedor` **134**) não entra em nenhum número da dashboard comercial. Ela sai dos cartões, das tabelas, do pódio, do ranking e das listagens das 5 abas: **Geral, Performance, Frete, Comissões e Ranking**. Não é "mostrar zerada" nem "mostrar marcada": é **desaparecer**.
- **Por quê:** "Loja Alisson" **não é consultora** — é o vendedor genérico usado para lançar venda de balcão/institucional que não pertence a ninguém da equipe. Não tem meta cadastrada nem lead, mas o faturamento dela somava junto com o das consultoras. Resultado: faturamento e ticket médio inflados, entrada indevida no cálculo de comissão e desconto médio, e a **Loja disputando o pódio** (3º lugar em ago/2026 com R$ 71.560). Nos últimos 12 meses: 139 vendas / R$ 667.660,71 (≈4,3% do faturamento). Decisão do Jonathan em 21/08/2026.
- **Onde a regra mora:** parâmetro **`DASHBOARD_VENDEDORES_EXCLUIDOS`** (`alissonerp.parametros_sistema`, tipo `json`, valor `[134]`, migration **374**), lido por **`src/lib/dashboard-comercial/vendedores-excluidos.ts`** — ponto único de verdade. Incluir ou tirar vendedor da dashboard é **cadastro no banco, sem deploy**. Nunca hardcodar o 134 numa rota: quem faz isso cria um segundo lugar para a regra morar e o próximo ajuste sai pela metade.
- **A forma canônica do filtro** (nos 7 endpoints de `/api/dashboard-comercial/*` — `premiacao` não calcula nada):

  ```sql
  AND COALESCE(<coluna_vendedor>, -1) <> ALL(${excluidos}::bigint[])
  ```

- **O COALESCE não é enfeite.** Existem **14 vendas legadas SEM vendedor** (`vendedor_id IS NULL`, R$ 33.564,50) que contam nos totais de hoje. Em SQL, `NULL = ANY(lista)` é NULL e `NOT NULL` **não é verdadeiro** — a forma ingênua `NOT (vendedor_id = ANY(...))` descarta essas 14 linhas **em silêncio**. Medido em 21/08/2026: 2.555 linhas sem filtro → **2.416 com COALESCE** (as 14 preservadas) → 2.402 sem COALESCE (as 14 perdidas). **Trocar por `NOT IN` ou tirar o COALESCE muda o faturamento das telas sem ninguém perceber.**
- **Lista vazia é seguro:** `<> ALL('{}')` é verdadeiro para todos. Apagar ou zerar o parâmetro faz a dashboard voltar ao comportamento antigo sozinha, sem erro.
- **No comparativo anual o filtro entra nas DUAS pontas:** ano atual (`vw_dash_vendas_todas.vendedor_id`) e ano anterior (legado, `public.pedidos_parcelas_detalhado.id_vendedor`). Filtrar só uma ponta compararia bases diferentes. Filtrar no nível da parcela é seguro porque **nenhum pedido legado tem mais de um vendedor** (conferido em 21/08/2026), então excluir as parcelas remove o pedido inteiro, nunca um pedaço dele.
- **Na aba Frete sai dos dois lados do saldo:** frete recebido do cliente (`vw_dash_vendas_todas`) **e** frete pago ao entregador (`vw_dash_controle_entregas.vendedor_responsavel_id`). **Filtrar só um lado desequilibra o saldo** e a aba passa a mostrar lucro/prejuízo de frete que não existe.
- **As metas não mudam** — a Loja não tem meta cadastrada. O que muda é o **% de atingimento**, que cai (em ago/2026, de ~87,0% para ~72,6% da Prata). Não é bug: é o número sem a venda que não é de ninguém.
- **A view `alissonerp.vw_dash_vendas_todas` NÃO foi tocada de propósito.** Ela também alimenta o financeiro (verba de frete grátis, `src/lib/frete-verba.ts`) e a gestão de estoque. Botar o filtro na view mudaria número de outro módulo sem ninguém pedir. **O filtro vive nos endpoints da dashboard comercial, e só lá.**

## 14. UPGRADE — cliente traz o próprio ouro (1º caso real: 21/08/2026)

- **O que é:** o cliente entrega ouro dele (aliança antiga, joia quebrada) e a empresa cobra **só a mão de obra** sobre essa parte — o metal não é cobrado, porque o ouro é do cliente. O produto que carrega o preço do serviço é o **PZ0003 "Upgrade — Mão de Obra por Grama"** (id 90000690, `alissonerp.produto_upgrade_config`: **R$ 250/g**, **quebra 10%**).
- **Como o dinheiro se divide** (venda 16001, o caso real): parte da **empresa** = as gramas que ela vende, precificadas pelo motor normal do orçamento (2 g → R$ 3.050 de lista, R$ 2.425,00 com o desconto da consultora); parte do **upgrade** = `gramas × R$ 250` (4,7 g → R$ 1.175,00). Total R$ 3.600,00. **O desconto incide SÓ na parte da empresa** — o serviço do upgrade vai cheio (`preco_lista = preco_unitario`). Isso não é validado por código: é disciplina de quem lança. Se alguém der desconto na linha do upgrade, a empresa paga mão de obra do próprio bolso.
- **O ouro vai pro Caixa de Ouro pelo peso BRUTO,** na aprovação da venda: `itens_venda_upgrade` guarda `peso_gramas` (bruto), `peso_liquido` (bruto × (1 − quebra%)), `valor_por_grama`, `quebra_percentual` e a **foto da balança** (obrigatória). A **quebra é perda de fabricação: reduz o peso que entra na peça, NÃO reduz o cofre**. Fica pendente de sangria até alguém dar destino (fábrica ou "virou joia" — §9).
- **O buraco que a operação tem de contornar:** o **orçamento não sabe fazer upgrade**. `alissonerp.orcamentos` **não tem** `upgrade_gramas` em produção — a camada de upgrade no orçamento (branch `feat/upgrade-orcamento`, `docs/regras-negocio/upgrade-orcamento.md` + `336_orcamento_upgrade.sql`, 26/06/2026) **nunca subiu**. Consequência prática: a peça final **não cabe num orçamento só**.
- **Procedimento (o que foi feito e o que fazer no próximo):**
  1. Orçamento da **parte da empresa** (só as gramas vendidas) → aprova → vira a venda.
  2. Na venda, adiciona o **item de upgrade** (gramas do cliente + foto da balança). Dinheiro fechado aqui.
  3. Cria um **segundo orçamento** com a **peça de verdade** (modelo, aro e peso finais). Ele fica valendo o preço cheio da peça inteira — **é esperado que não bata com o pedido**, porque o cliente não paga o ouro que ele mesmo trouxe.
  4. **Religa o pedido nesse segundo orçamento** (ajuste de dado, com assinatura no livro): `vendas_erp.orcamento_id` → novo; o novo vira `convertido` com `venda_gerada_id` = pedido; **o orçamento antigo SOLTA o pedido** (`venda_gerada_id = NULL`) e vira `cancelado`.
  5. Só então abrir a ordem pelo botão **"Confirmar aro e abrir ordem"** (§12) — a fábrica recebe o peso e o modelo do orçamento novo.
- **Por que o passo "soltar o antigo" não é opcional:** dois orçamentos apontando para o mesmo pedido fazem a tela da venda listar **duas alianças**, o PDF e o 3D pegarem a errada (`WHERE venda_gerada_id = <venda>`) e o aviso **"aliança sem ordem" nunca sair da lista** — nem depois da ordem aberta, porque o orçamento órfão nunca ganha `ordem_gerada_id`.
- **O peso da linha da aliança fica na parte da EMPRESA (2,000 g), não no peso final.** As gramas do cliente já estão na linha do upgrade; pôr o peso final ali contaria o ouro **duas vezes** (2 g + 4,7 g + 6,5 g) e `itens_venda_erp.peso_estimado` alimenta o peso dos itens de ordem. **A fábrica pega as 6,50 g pela ficha do orçamento, nunca por esse campo.**
- **O Tiny não se corrige sozinho:** o pedido já foi enviado com o nome antigo do modelo e **nenhum gatilho reenvia** — acertar o texto lá é manual.
- **2º caso real (01/09/2026): venda 16092** (id 30718, Gleidson) — mesmo procedimento executado no dado: ORC-0000262 (Anatomica 3,5 g, só a parte da empresa) cancelado e solto; venda religada no ORC-0000263 (par Reta + Friso Centro, 7,5 g, qtd 2, R$ 10.260 — não bate com a venda de R$ 4.250, esperado). Upgrade de 3,0 g × R$ 250 já no cofre com foto. Scripts: `docs/seguranca/APLICADO-venda-16092-religa-orcamento-2026-09-01.sql` (+ ROLLBACK), assinatura nº 477 no livro.
- **⚠️ CORRIGIR NO V2:** upgrade tem de **nascer dentro do orçamento** (o desenho já está escrito na branch acima). Enquanto não nascer, todo upgrade exige dois orçamentos e uma religação à mão — com risco real de a fábrica produzir a peça errada se alguém esquecer. Ver `docs/arqueologia/CATALOGO-CODIGO.md` RN-CD-092 (`V2-NOTA`).

## 15. Duas tabelas de metas de vendedoras — só UMA alimenta a dashboard (01/09/2026)

- **O que é:** existem **DOIS sistemas paralelos de meta** no banco, sem relação entre si:
  1. `alissonerp.metas_vendedoras` — tabela nova (migration 104/139), com tela própria `/vendas/metas` (`MetasClient.tsx`) e API `src/app/api/vendas/metas/route.ts` (`GET`/`POST`). Colunas: `meta_prata/meta_ouro/meta_diamante` (patamares crescentes de faturamento total, tipo selo/badge — não são metas separadas por categoria de produto).
  2. `public.metas_mensais` + `public.metas_por_hora` — schema `public`, é a que **realmente alimenta** a tela **`/dashboard-comercial/analise-resultado`** (as 4 abas Horário/Diário/Mensal/Projeção), via `alissonerp.vw_dash_metas_por_hora` → `src/app/api/dashboard-comercial/analise-performance/route.ts`. É alimentada por fora do Next.js (nenhuma rota do app grava nela); último cadastro antes de 01/09/2026 tinha sido em agosto/2026.
- **Por que isso é perigoso:** as duas têm exatamente as mesmas colunas de sentido (`meta_prata/meta_ouro/meta_diamante` vs `valor_prata/valor_ouro/valor_diamante`, por vendedor/mês/ano), então é fácil cadastrar meta na tabela errada e a tela real continuar vazia **sem erro nenhum** — foi o que aconteceu em 01/09/2026 ao cadastrar metas de setembro/2026 para Germana/Débora/Cristiane: inseri em `metas_vendedoras`, a tela `analise-resultado` continuou sem nada, e só o Jonathan validando visualmente pegou o erro.
- **`public.metas_mensais` tem um TRIGGER que gera o detalhe por hora sozinho:** `trigger_gerar_metas_por_hora` (AFTER INSERT OR UPDATE, função `gerar_metas_por_hora_final()`) explode cada linha mensal em ~1.080 linhas de `metas_por_hora` (uma por hora útil do mês, respeitando `horas_dia`, `hora_inicio`, `dias_nao_trabalhados`). **Nunca inserir manualmente em `metas_por_hora`** — só em `metas_mensais`, o trigger cuida do resto.
- **Colunas de `public.metas_mensais`:** `id, created_at, mes_ano (timestamp, dia 1 do mês), horas_dia (int, padrão 12), hora_inicio (int, padrão 9), dias_trabalhados (int), valor_ouro, valor_prata, valor_diamante (numeric), consultora (bigint = vendedor_id), dias_nao_trabalhados (text, dias do mês separados por vírgula — os domingos/folgas)`.
- **`public.*` é READONLY por regra geral do projeto (CLAUDE.md §1/§2)** — cadastrar meta aqui é uma **exceção pontual autorizada pelo Jonathan**, não abre precedente para escrever em `public.*` por conta própria. Sempre assinar a mudança (`alissonerp.assinar_mudanca_banco`) antes.
- **Antes de cadastrar/alterar meta de vendedora, perguntar qual tela o Jonathan está olhando** (ou checar direto) para saber em qual das duas tabelas gravar — hoje a que importa de verdade é `public.metas_mensais`. `alissonerp.metas_vendedoras` parece legado/pouco usado, mas não foi confirmado como morto — não apagar a tabela nem a tela sem o Jonathan confirmar.
- **⚠️ CORRIGIR NO V2:** unificar num sistema de meta só. Ter duas tabelas de meta com o mesmo formato e proposta, uma delas em schema READONLY alimentada por fora do app, é a receita pronta pra alguém (humano ou IA) cadastrar no lugar errado de novo.
