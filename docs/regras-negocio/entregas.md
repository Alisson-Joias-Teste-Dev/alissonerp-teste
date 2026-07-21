# Regras de Negócio — Entregas (Módulo de Entrega de Venda + Frete Avulso)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo de entregas, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.
> ⚠️ Existe uma nota mais antiga e parcial sobre frete avulso registrado pelo motoboy em `docs/regras-negocio/comercial.md` §8 (PR#75). Este arquivo é o documento completo do módulo — considerar migrar/mesclar aquele trecho para cá numa limpeza futura.

Última atualização: 2026-07-21 (RELATÓRIO DE PAGAMENTO DO MOTOBOY — AJUSTE: a classificação Pagar/Revisar/Não pagar virou SUGESTÃO editável, não decisão travada. Duplicidade deixou de ser "Não pagar" automático — vira "Revisar" (suspeita, não certeza); "Não pagar" fica só para venda cancelada. Cada linha do relatório ganhou um toggle Pagar/Não pagar que o financeiro ajusta; o total do rodapé reflete o ajuste, não a sugestão crua. "Confirmar pagamento" reusa a rota JÁ EXISTENTE `POST /api/entregas-venda/motoboy/pagar` (mesmo mecanismo do `PagamentoMotoboyPainel.tsx`) — nenhuma persistência nova, o ajuste é efêmero até esse clique. Ver §12.6).
Atualização anterior: 2026-07-21 (RELATÓRIO DE PAGAMENTO DO MOTOBOY — nova rota `GET /api/entregas-venda/motoboy/relatorio-pagamento` + subcomponente `RelatorioPagamentoMotoboy.tsx` dentro da aba "Pagamento do motoboy": seleciona entregador+período, traz TODAS as corridas confirmadas dele (avulsas e de pedido) já classificadas em Pagar/Revisar/Não pagar, com fotos por link e total a pagar. Ver §12).
Atualização anterior: 2026-07-21 (MULTIFOTO na confirmação — migration 357, arquivo criado, NÃO executada: motoboy pode anexar VÁRIAS fotos, sempre OPCIONAL, ao finalizar QUALQUER corrida dele — avulsa (`confirmar-avulso`) e entrega de pedido (`confirmar`, código A/B). Tabela filha `entregas_venda_fotos` (mesmo padrão de `solicitacao_peca_fotos`, migration 349); `foto_entrega_path` (migration 287) fica CONGELADA; helper único `buscarFotosEntrega` unifica leitura antiga+nova. ⚠️ ORDEM INVIOLÁVEL: o código A/B de `confirmarEntrega` é validado ANTES de qualquer foto — fotos nunca condicionam, antecipam ou substituem essa checagem; upload é best-effort (nunca bloqueia a finalização). Ver §11).
Atualização anterior: 2026-07-21 (VERBA DE FRETE GRÁTIS — Blocos 0-3, fundação: formulário ENXUTO órfão removido de `FreteAvulsoModal.tsx`; gerente do saldo passa a ser configurável (`gerente_frete_gratis`, com fallback ao comportamento antigo); migration 356 reaproveita `fechamentos_frete` (nunca usada) para o fechamento mensal — positivo ZERA, negativo vira conta a pagar (não mais desconto em folha); `src/lib/frete-verba.ts` calcula o faturamento-base a partir da MESMA consulta da dashboard comercial. Ver §10. Migration não executada). Blocos anteriores do módulo de frete avulso (mesma branch `feat/frete-avulso-solicitacao`): BLOCO 6 — reforma visual da tela `/entregas-venda`: 3 abas, filtros em select, paginação de 10, componentização, e o botão "Frete Avulso" da tela passa a usar o formulário COMPLETO — endereço/quem paga/comprovante — continuando a criar DIRETO; BLOCO 5 — estoque acompanha TODAS as entregas avulsas; quem solicita enxerga o próprio pedido, inclusive recusado; link de notificação para de ser morto; BLOCO 4 — drawer da entrega mostra o endereço CONFIRMADO na solicitação (não o da venda), aprovador vê o valor do frete antes de decidir (aviso acima de R$ 200); BLOCO 3 — validações viram INVARIANTES independentes do modo, cargos alinhados ao banco e fonte única de permissão; BLOCO 2 — autorização não-manipulável: sem auto-aprovação, pool decidido pelo dado "quem paga" e não pela tag.

---

## 1. Estados da entrega (`enum_entrega_situacao`)

Ciclo de vida: **solicitada → pendente → em_rota → confirmada** (+ **cancelada**, que pode acontecer a partir de `solicitada` ou `pendente`).

| Estado | O que significa | Quem transiciona |
|---|---|---|
| `solicitada` | Frete avulso pedido pela consultora **de dentro da venda**, aguardando decisão do pool de aprovadores. Não lançou saldo, não tem dono. **Só existe para avulso** — entrega normal (vinculada a itens de venda) nunca passa por aqui, nasce direto `pendente`. | Consultora cria (`POST /api/entregas-venda/frete-avulso`, `modoSolicitacao=true`). |
| `pendente` | Entrega normal recém-criada (itens prontos para saída) OU avulso já liberado/criado direto, aguardando saída física (aceite de um motoboy do pool, ou já com dono). | Sistema (entrega normal), ou aprovador do pool ao liberar / criação direta (avulso). |
| `em_rota` | Motoboy retirou/aceitou e está a caminho. | Motoboy (retirada normal ou aceite de pool — `aceitarFreteAvulso`). |
| `confirmada` | Entregue/confirmado. Entra no acerto financeiro do motoboy (pagamento em lote). | Motoboy ou admin/gerente (código de verificação para entrega normal; botão simples, sem código, para avulso — `confirmarFreteAvulso`). |
| `cancelada` | Cancelada (entrega normal pendente) ou recusada pelo pool (avulso solicitado). Não é apagada — fica para auditoria. | Quem tem permissão de cancelar, ou o pool ao recusar (`recusarFreteAvulso`). |

Ordem do enum: `solicitada` foi inserida **antes** de `pendente` (migration 353, `ALTER TYPE ... ADD VALUE ... BEFORE 'pendente'`).

---

## 2. Fluxo de solicitar frete avulso (de dentro da venda ou por Tarefas)

Frete avulso = corrida de motoboy **sem itens vinculados** (`entregas_venda.is_avulso=true`), mas que **pode referenciar uma venda** (`venda_id`) só para herdar cliente/endereço quando é uma solicitação — `venda_id` é **opcional** (fix 21/07, "levar material à loja"/"buscar peça" não partem de venda nenhuma).

1. **Quem pode solicitar / criar direto**: fonte única em `src/lib/permissoes/frete-avulso.ts` (`ROLES_SOLICITAR_FRETE_AVULSO`/`ROLES_CRIAR_FRETE_AVULSO_DIRETO` + predicados `podeSolicitarFreteAvulso`/`podeCriarFreteAvulsoDireto`) — backend (`route.ts`) e os dois pontos de entrada do front (`VendaDetalheClient.tsx` botão "Solicitar frete avulso"; `EntregasVendaClient.tsx` botão "Frete Avulso" direto) importam a MESMA constante. **Solicita**: desenvolvedor, admin, diretor, gerente_loja, consultora, estoquista_loja. **Cria direto**: os mesmos MENOS diretor (decisão Jonathan — diretor autoriza, não libera o próprio custo sozinho). Ver §3.3 (BLOCO 3) para o porquê da centralização.
   - **Botão "Solicitar frete avulso" em `VendaDetalheClient.tsx`** — além do cargo acima, só aparece quando a venda está na **janela da entrega**: `situacao IN ('aprovado', 'em_rota', 'entregue')`.
     - `'aprovado'`: antes de sair para entrega.
     - `'em_rota'`: entrega já a caminho (corrida complementar).
     - `'entregue'`: corrida **complementar pós-entrega** (caso real: levar a aliança que ficou para ajuste) — cortar em `em_rota` mataria esse cenário.
     - Fora da janela de propósito: `rascunho` (venda ainda não fechada), `cancelado`/`virou_credito` (não há mais entrega a fazer).
     - Decisão do Jonathan (commit `291b029a`). **BLOCO 3 (21/07):** a janela (e o ownership da venda) viraram **INVARIANTES no servidor** — valem sempre que `vendaId` vier no body, **independente do modo** (`solicitar=true` ou criação direta). Antes só rodavam dentro de `modoSolicitacao=true`; a criação direta conseguia gravar `venda_id` de QUALQUER venda (inclusive de outra consultora, inclusive rascunho/cancelada) sem nenhuma checagem — ver §3.3.
2. **Modal** (`FreteAvulsoModal.tsx`): quem solicita escolhe **endereço de entrega** (pré-preenchido a partir do cliente/venda quando há `vendaId`, texto livre editável — grava **na entrega**, não altera o cadastro do cliente), **região**, **valor cobrado do cliente**, **valor do motoboy**, **quem paga** e **observação**. **Não escolhe motoboy nem responsável.**
3. **Guard de duplicata**:
   - **Com venda**: barra uma 2ª solicitação para a mesma venda enquanto a 1ª ainda está `solicitada` (`WHERE is_avulso AND venda_id=X AND situacao='solicitada'`) — desde o BLOCO 3, roda **independente do modo** (fecha o desvio de criar um avulso DIRETO por cima de uma solicitação pendente pra mesma venda).
   - **Sem venda (BLOCO 3, novo):** não existia guard nenhum — duplo clique/reenvio sem venda (o caso comum hoje) criava 2 corridas + 2 tarefas, ou 2 lançamentos de saldo no modo direto. Critério: mesmo `created_by` + mesma `descricao_avulso` (campo obrigatório) + `situacao IN ('solicitada','pendente')` + criada nos últimos **5 minutos**. Vale para os dois modos, inclusive o auto-registro do entregador.
4. A entrega nasce **`solicitada`** (modo solicitação, sem lançar saldo) ou **`pendente`** (modo direto, já libera saldo — ver §5), e no modo solicitação a **mesma transação** cria uma **tarefa** de aprovação (ver §3). `entregas_venda.tarefa_aprovacao_id` guarda o vínculo.

---

## 3. Pool de aprovadores — solicitação vira TAREFA

Modelo **TAREFA/POOL** (migration 353, consolidado nas fases V1-V3): não existe mais um "liberador designado" nem tabela própria de liberadores — a solicitação é uma tarefa comum do módulo Tarefas, tipo `frete_avulso`, e **qualquer usuário da lista configurada decide**.

- **Fonte da lista**: chave de configuração **MULTI** `aprovadores_frete_avulso` (`alissonerp.configuracoes_sistema`, vários UUIDs separados por vírgula), editável em **Configurações › Aprovadores** (`TabAprovadores.tsx` + `GET/PATCH /api/configuracoes/aprovadores`). Mesmo padrão de `aprovadores_devolver_peca`.
- **Fonte única de leitura**: `listarAprovadoresFreteAvulso()` (`src/lib/entrega-venda.ts`) — usada por `criarFreteAvulso` (quem é notificado), `GET /api/tarefas`, `GET /api/tarefas/[id]` e `PATCH /api/tarefas/[id]/aprovacao` (quem decide). Antes essa mesma query estava duplicada em 4 lugares; centralizar evita divergência entre "quem vê" e "quem pode decidir".
- **Criação da tarefa** (dentro da mesma transação de `criarFreteAvulso`): `INSERT tarefas` (tipo `frete_avulso`, status `aguardando_aprovacao`, `responsavel_id` = 1º da lista **só para preencher a coluna não-nula** — não é responsável exclusivo) → `INSERT aprovacoes_tarefa` (`aprovador_id` = mesmo 1º) → `UPDATE entregas_venda SET tarefa_aprovacao_id`.
- **Notificação**: TODOS os UUIDs da lista são notificados (não só o `responsavel_id` gravado), fora da transação (best-effort).
- **4 pontos aditivos** (nenhum outro tipo de tarefa muda de comportamento — cada um só ativa quando `tipo === 'frete_avulso'`):
  1. `GET /api/tarefas` — quem está no pool também enxerga as tarefas de frete avulso na visão "minhas"/"aguardando", além de `responsavel_id`/`criado_por` (`src/app/api/tarefas/route.ts:~63-96`).
  2. `GET /api/tarefas/[id]` — membro do pool também pode ABRIR a tarefa (ver comentários), não só dono/criador (`src/app/api/tarefas/[id]/route.ts:~60-70`).
  3. `PATCH /api/tarefas/[id]/aprovacao` — membro do pool também pode DECIDIR a mesma `aprovacao_tarefa` (reatribui `aprovador_id` para quem decidiu), não só o `aprovador_id` fixo gravado na criação (`src/app/api/tarefas/[id]/aprovacao/route.ts:~330-353`).
  4. `TarefaDrawer.tsx` — flag `pode_decidir_pool` (calculado no servidor em `GET /api/tarefas`, nunca no client) libera os botões Aprovar/Rejeitar para quem não é o `responsavel_id`, só quando `tarefa.tipo === 'frete_avulso'`.
- **Decisão** (`PATCH /api/tarefas/[id]/aprovacao`, bloco dedicado `tipo === 'frete_avulso'`): localiza a entrega por `tarefa_aprovacao_id` e delega para as libs abaixo — a lógica de saldo/estado mora só ali, o dispatcher nunca duplica.
  - **Aprovar** → `liberarFreteAvulso`: `solicitada → pendente`, lança o saldo (ver §5). `FOR UPDATE` evita lançamento em dobro em cliques concorrentes.
  - **Rejeitar** → `recusarFreteAvulso`: `solicitada → cancelada`, exige **motivo** (obrigatório), **nunca** lança saldo.
  - A consultora que solicitou é notificada do resultado (liberado ou recusado + motivo).
  - **Atomicidade (jul/2026):** a decisão da tarefa (`aprovacoes_tarefa` + `tarefas`) e a ação de domínio (liberar/recusar) rodam agora dentro da **MESMA transação** no dispatcher — variantes `liberarFreteAvulsoNoTx`/`recusarFreteAvulsoNoTx` (recebem o `tx` de fora) fazem o trabalho de verdade; `liberarFreteAvulso`/`recusarFreteAvulso` viraram cascas finas que abrem a própria transação só para quem chamar fora de uma tx existente. Se a ação de domínio falhar, a transação inteira reverte — a tarefa **continua** `aguardando_aprovacao` (nunca fica "aprovada" com a entrega ainda `solicitada`). Escopo restrito a `frete_avulso`/`frete_avulso_loja`; os demais ~11 tipos de aprovação continuam com a ação de domínio fora da transação, sem mudança.
  - **Guard de idempotência:** o `UPDATE aprovacoes_tarefa` do dispatcher exige `status = 'pendente'`; se 0 linhas forem afetadas (aprovação já decidida por outra requisição/aprovador concorrente), a rota devolve **409** e não reprocessa nada. O front (`TarefaDrawer.tsx`) mostra esse erro (e qualquer outro) via `useErrorStore` — o `catch` deixou de ser silencioso.

### 3.1. "Quem paga" — dois pools (migration 354, 21/07)

A solicitação passou a exigir `pagante` (`'cliente'` ou `'loja'`), gravado em `entregas_venda.pagante`:

- **`pagante='cliente'`** (padrão/legado, comprovante de pagamento **obrigatório**, anexado pela consultora na solicitação): evento `frete_avulso`, chave `aprovadores_frete_avulso` — esta lista **acompanha** a corrida (o dinheiro já está com a loja).
- **`pagante='loja'`** (sem comprovante): evento `frete_avulso_loja`, chave **nova e separada** `aprovadores_frete_avulso_loja` — esta lista **autoriza o custo** que a loja assume.
- Continua sendo **UMA etapa só de aprovação** nos dois casos — muda exclusivamente **quem decide**. A escolha do evento é feita em `eventoDaTarefa` (`src/lib/aprovacoes/evento-da-tarefa.ts`) e espelhada em `multiAprovadorCond` (`src/app/api/tarefas/route.ts`, join com `entregas_venda`) — ver §3.2 sobre a fonte de verdade usada por essa escolha.

### 3.2. BLOCO 2 (jul/2026) — autorização não-manipulável

Dois problemas de segregação de função encontrados e corrigidos no dispatcher `PATCH /api/tarefas/[id]/aprovacao`:

- **P1 — sem auto-aprovação.** `criarFreteAvulso` grava `aprovacoes_tarefa.aprovador_id` = 1º UUID do pool configurado no momento da criação — se quem está **solicitando** também está nesse pool (o Jonathan decidiu que isso é permitido: "quem está no pool PODE solicitar"), esse UUID pode coincidir com o próprio solicitante. Sem correção, isso dava bypass total: `ehAprovadorGravado` autorizava direto, sem nem consultar a config. Fix: o portão e a pré-checagem de `frete_avulso`/`frete_avulso_loja` agora passam `ctx.solicitanteId` para `podeDecidir` (`src/lib/aprovacoes/autoridade.ts`, `resolverAprovadores` já excluía o solicitante da lista quando recebia esse ctx — só não estava sendo passado aqui), e `ehAprovadorGravado` deixa de valer quando o gravado é quem está solicitando. **Escopo: só `frete_avulso`** — o portão genérico serve outros ~11 tipos de aprovação já em produção; generalizar a exclusão do solicitante para todos eles é candidato a PR próprio (risco não avaliado caso a caso).
  - **Mensagem clara quando o pool fica sem ninguém:** se o único configurado era quem está solicitando, `podeDecidir` devolve motivo `aprovador_e_o_proprio_solicitante` (distinto do genérico `aprovador_nao_configurado`) e a rota traduz isso para uma mensagem explicando a segregação de função e pedindo para configurar mais um aprovador — não um "Sem permissão" mudo.
- **P2 — pool decidido pelo dado, não pela tag.** `eventoDaTarefa` escolhia entre `frete_avulso`/`frete_avulso_loja` pela tag `frete_pagante:loja` em `tarefas.tags` — um array livre que o **próprio solicitante** podia editar via `PATCH /api/tarefas/[id]` (`isOwner` inclui `criado_por`, sem nenhuma validação de campo), trocando qual pool decidia (inclusive mandando um frete pago pela loja para o pool do cliente, ou zerando os dois). Fix: `eventoDaTarefa` agora decide por `tarefaInfo.frete_pagante` — o valor de `entregas_venda.pagante` (join por `tarefa_aprovacao_id`, carregado pelo caller em `aprovacao/route.ts` e já existente em `tarefas/[id]/route.ts` GET), gravado uma única vez na criação e nunca reexposto como editável. `multiAprovadorCond` (`src/app/api/tarefas/route.ts`) foi ajustado pro MESMO critério (join com `entregas_venda`), mantendo `matriz-sql-ts-aprovadores.test.ts` verde (SQL e TS concordam sobre quem vê o botão).
  - **Defesa em profundidade:** como o campo `tarefas.tipo` ainda decide **se existe evento nenhum** (trocar `tipo='frete_avulso'` por outra coisa faz a exclusão do P1 não se aplicar mais), `PATCH /api/tarefas/[id]` passou a recusar (409) tentativas de alterar `tags` **ou** `tipo` enquanto a tarefa é `frete_avulso` **e** tem uma `aprovacoes_tarefa` pendente. Escopo: só `frete_avulso`, mesmo raciocínio de não mexer nos outros tipos sem avaliar caso a caso.

### 3.3. BLOCO 3 (21/07) — validações viram invariantes, cargos alinhados, fonte única

Três problemas de "validação presa ao modo" em `POST /api/entregas-venda/frete-avulso` e `criarFreteAvulso` (`src/lib/entrega-venda.ts`), todos com a mesma causa raiz: o INSERT grava `venda_id` nos DOIS modos (solicitação e criação direta), mas as regras que dependem da venda só rodavam num dos dois.

- **P1 — IDOR real no modo direto.** `requireVendaOwnership` (dono da venda), a janela de situações (`aprovado`/`em_rota`/`entregue`) e o guard de duplicata por venda estavam todos dentro de `if (ehSolicitacao)` / `if (params.modoSolicitacao)`. No modo DIRETO dava pra mandar `vendaId` de venda de **outra consultora**, em **qualquer situação** (rascunho, cancelada, virou_credito), sem limite de duplicatas. Fix: as três passam a rodar **sempre que `vendaId` vier**, independente do modo — ownership em `route.ts` (fora do bloco `ehSolicitacao`), janela e duplicata-por-venda em `criarFreteAvulso` (fora do bloco `modoSolicitacao`).
- **P2 — sem guard de duplicata quando NÃO há venda.** O guard antigo só funcionava com `venda_id` preenchido. Sem venda (o caso comum desde a "venda deixa de ser obrigatória", 21/07), duplo clique/reenvio criava 2 corridas + 2 tarefas (ou 2 lançamentos de saldo no modo direto). Fix: novo guard em `criarFreteAvulso` — mesmo `created_by` + mesma `descricao_avulso` + `situacao IN ('solicitada','pendente')` + criada nos últimos 5 minutos.
- **P3/P4 — cargos alinhados ao banco real.** `ROLES_LOJA` (backend) não tinha `diretor` (o front de `VendaDetalheClient.tsx` já liberava — 403 mudo pra quem clicava) e tinha `estoquista` (role que **não existe** em `alissonerp.usuarios` — confirmado via `SELECT DISTINCT role`, 21/07/2026, homolog: os papéis reais são `estoquista_fabrica`/`estoquista_loja`). Fix: diretor entra em `ROLES_SOLICITAR_FRETE_AVULSO` (decisão Jonathan: só solicita, não cria direto); `estoquista` vira `estoquista_loja` (frete avulso é despacho da LOJA — `estoquista_fabrica` fica de fora).
- **P5 — fonte única de permissão.** Nova `src/lib/permissoes/frete-avulso.ts`: `ROLES_SOLICITAR_FRETE_AVULSO`, `ROLES_CRIAR_FRETE_AVULSO_DIRETO`, `ROLES_FRETE_AVULSO` (união) + predicados `podeSolicitarFreteAvulso`/`podeCriarFreteAvulsoDireto`/`podeAcessarFreteAvulso`. `route.ts` importa e faz **enforcement por modo** (403 dedicado se o papel não pode o modo escolhido — é o que de fato impede diretor de criar direto via chamada de API direta, não só a ausência do botão no front); `VendaDetalheClient.tsx` e `EntregasVendaClient.tsx` importam os mesmos predicados para mostrar/esconder os botões. Teste de matriz papel×capacidade em `src/lib/permissoes/__tests__/frete-avulso.test.ts` (os 15 papéis reais do banco) + verificação estática de que os 3 consumidores importam do módulo (não reescrevem lista).
- **Testes anti-volta**: `src/__tests__/frete-avulso-invariantes-route.test.ts` (ownership sempre, enforcement por modo) e `src/__tests__/frete-avulso-invariantes-lib.test.ts` (janela/duplicata com e sem venda).

### 3.4. BLOCO 4 (jul/2026) — drawer mostra o endereço confirmado; aprovador vê o valor

Dois bugs de VISIBILIDADE (nenhum dos dois é sobre autorização — quem pode fazer o quê não mudou neste bloco), ambos do tipo "o dado certo já estava gravado no banco, mas a tela mostrava outro":

- **P1 — drawer de entrega mostrava o endereço da VENDA, não o da solicitação.** A migration 355 acrescentou a `entregas_venda` colunas homônimas às de `vendas_erp` (`endereco_entrega`/`_numero`/`_complemento`/`_bairro`/`_cidade`/`_cep`/`_uf`) — o endereço **estruturado que a consultora CONFIRMA** na solicitação de frete avulso (`FreteAvulsoModal.tsx`, ver §3 e a migration). Mas `GET /api/entregas-venda/[id]` (a rota do drawer, `EntregaDetalheDrawer.tsx`) só selecionava `ve.endereco_entrega*` (join com a venda) — nunca lia as colunas novas da própria entrega. Resultado: o drawer sempre mostrava o endereço cadastrado na VENDA (que pode ter mudado, ou ser de outra pessoa que recebe no lugar do titular), e um avulso **sem venda vinculada** (permitido desde "venda deixa de ser obrigatória", 21/07) aparecia como `"Endereço não informado na venda"` mesmo com o endereço da entrega gravado — a informação que a loja/motoboy precisavam nunca aparecia.
  - **Fix**: `resolverEnderecoEntrega` (`src/lib/entrega-venda.ts`) — recebe os dois conjuntos (endereço da entrega, aliasado `ev.endereco_entrega* AS entrega_endereco_entrega*` na query; endereço da venda, `ve.endereco_entrega*`) e devolve **o conjunto INTEIRO** de um dos dois, nunca misturado campo a campo. **Regra**: se a entrega tem QUALQUER campo próprio preenchido, usa o dela inteiro (mesmo que incompleto); só cai para o da venda quando a entrega não tem NENHUM campo. Motivo de ser "tudo ou nada" e não `COALESCE` campo a campo: rua e bairro têm que vir do MESMO endereço — misturar geraria endereço Frankenstein (rua da entrega + bairro da venda) sempre que um dos dois lados tivesse só parte preenchida.
  - **Entrega NORMAL (não-avulsa) não muda**: ela nunca grava endereço próprio (as colunas da migration 355 ficam todas `NULL`), então `resolverEnderecoEntrega` sempre cai no fallback da venda para ela — comportamento idêntico ao de antes do BLOCO 4.
  - O front (`EntregaDetalheDrawer.tsx`) não precisou de campo novo — a rota devolve o conjunto já resolvido nos MESMOS nomes de campo que o componente já consumia (`endereco_entrega`, `endereco_entrega_bairro` etc.); só a mensagem de "endereço não informado" foi generalizada (deixou de dizer "na venda", já que agora pode faltar em qualquer uma das duas fontes, ou nem haver venda).
  - **Testes anti-volta**: `src/__tests__/entrega-detalhe-endereco-resolvido.test.ts` — função pura (`resolverEnderecoEntrega`) e a rota `GET /api/entregas-venda/[id]` fim a fim (avulso com endereço próprio com/sem venda → usa o da entrega; normal → usa o da venda; nenhum dos dois → tudo `null`).

### 3.5. BLOCO 5 (jul/2026) — estoque acompanha; quem solicita enxerga o próprio pedido

Contexto: a mesma classe de bug ("a permissão existe, mas a porta não") já tinha aparecido 3 vezes antes neste módulo (consultora não achava a tela; 2º aprovador não via o botão; achado do BLOCO 3 registrado no §8 antigo — `estoquista_loja` tinha permissão de criar direto mas não alcançava a tela). Este bloco fecha a 4ª ocorrência (estoquista sem caminho) e uma nova (quem solicita não acompanha), mais dois bugs de notificação.

- **P1 — `estoquista_loja` passa a ver TODAS as entregas.** Pedido do Jonathan: *"o usuário do estoque tenha acesso às entregas avulsas por mais que ela não aprove, que toda entrega chegue pra ele acompanhar"*. `estoquista_loja` entrou nos DOIS portões que faltavam — `ROLES_PERMITIDOS` em `entregas-venda/page.tsx` (SSR) e `ROLES_ENTREGAS` em `api/entregas-venda/route.ts` (a rota que a paginação/filtro do client bate depois) — e no menu (`ROLES_ENTREGAS_VENDA` em `Sidebar.tsx` + fallback hardcoded `ROLE_MENUS.estoquista_loja` em `src/lib/auth/permissions.ts`, pra cobrir tanto o caminho via `role_permissoes` do banco quanto o fallback sem nenhuma linha configurada).
  - **DECISÃO (tomada sem resposta a tempo do Jonathan — mais simples e reversível, revisar se ele quiser recorte mais estrito):** como não existe filtro por tipo/ownership pra este papel na query (só `isConsultora` filtra por `vendedor_id` — ver §1 do arquivo, ambos os SELECTs), `estoquista_loja` passa a ver TODAS as entregas (avulsas **e** normais), não só as avulsas. Não há hoje um filtro "só avulsas" pronto pra reusar sem construir um novo — candidato a refinamento futuro se o volume de entregas normais poluir demais a visão do estoque.
  - **Confirmado em homolog (21/07/2026):** `estoquista_loja` tem 24 linhas em `alissonerp.role_permissoes`, nenhuma pro módulo `entregas_venda` — a injeção client-side (`Sidebar.tsx`, via `ROLES_ENTREGAS_VENDA`) resolve o menu sem precisar de migration, mas o SQL abaixo é o que fixa a permissão **no banco** (fonte de verdade), pra alinhar com os outros módulos que o papel já tem (`pode_ler=true` em `estoque`/`estoque_comercial`/`editor_ia`/`promocoes`/`tarefas`):
    ```sql
    INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever, ativo)
    VALUES ('estoquista_loja', 'entregas_venda', true, false, true)
    ON CONFLICT (role, modulo) DO UPDATE SET pode_ler = true, ativo = true, atualizado_em = now();
    ```
    `pode_escrever = false` porque este bloco só resolve VISUALIZAÇÃO — a criação de frete avulso direto (BLOCO 3) já é liberada por `podeCriarFreteAvulsoDireto` (fonte própria, não por este módulo). Decisão do Jonathan se `pode_escrever` deveria virar `true` pra outras ações da tela (cancelar, confirmar) fica em aberto.
  - **Testes anti-volta**: `src/__tests__/entregas-venda-estoquista-acesso.test.ts` — `GET /api/entregas-venda` com role `estoquista_loja` responde 200 (não 403) e não aplica filtro `vendedor_id` (vê tudo); `consultora` continua restrita (comportamento antigo intacto); papel sem permissão nenhuma continua barrado.

- **P2 — quem solicita agora tem uma visão própria: "Minhas solicitações".** A tarefa nasce com `responsavel_id` = 1º aprovador e `criado_por` = solicitante (ver §3). Nenhuma visão do módulo Tarefas olhava `criado_por` de forma visível no celular: "minhas" é só `responsavel_id`; "aguardando" idem; "concluidas" só aceita status `IN ('concluida','aprovada')` — uma solicitação **recusada** desaparecia de vez; o Kanban (que teria `criado_por` via `!isAdmin`) é `hidden md:inline-flex`, inexistente no mobile (onde a consultora está).
  - **Fix**: nova visão `visao=solicitadas` em `GET /api/tarefas` (`src/app/api/tarefas/route.ts`) — filtra só `t.criado_por = userId`, em **qualquer status**, inclusive `rejeitada`. Nova aba "Minhas solicitações" em `VIEW_OPTIONS` (`TarefasClient.tsx`), dentro do painel "Filtros" — **não** é `hidden md:`, funciona no celular (diferente do Kanban).
  - **DECISÃO: visão NOVA e escopada, NÃO estender "minhas".** "minhas" é `responsavel_id`-based e é a fila de trabalho de QUALQUER usuário (inclusive quem aprova, gerencia PCP, etc. — não é exclusiva de frete avulso). Misturar `criado_por` ali faria qualquer usuário que já criou uma tarefa pra outra pessoa (ex.: gerente delegando, admin abrindo uma aprovação pra alguém) ver essas tarefas para sempre na própria fila — poluição de um fluxo genérico usado por TODOS os ~19 tipos de tarefa do catálogo, não só frete avulso. Uma visão própria evita esse efeito colateral por completo.
  - **Bônus (mesma sessão):** a lista genérica (`tarefasFiltradas.map`, usada por "minhas"/"solicitadas"/"time"/"concluidas"/"vencidas") ganhou um selo "Rejeitada" pontual — `STATUS_COLS` (que também monta as colunas do Kanban) não tem essa entrada de propósito, pra não abrir uma coluna "Rejeitada" no board inteiro sem avaliar o impacto geral; o fallback fica só nesta lista.
  - **Testes anti-volta**: `src/__tests__/tarefas-solicitadas-visao.test.ts` — `visao=solicitadas` constrói o fragmento SQL isolado de `criado_por` (200, sem quebrar); `visao=minhas`/`aguardando`/default **não** constroem esse fragmento (prova de que o escopo não vazou pras visões existentes).

- **P3(a) — link de notificação deixa de ser morto.** ~15 pontos de criação de tarefa (frete avulso, entrega sem pagamento, garantia fora do prazo, metal, compra comercial, devolução, crédito-loja etc. — ver grep por `` `/tarefas?abrir=` ``) mandam `link: /tarefas?abrir=<id>`, mas `TarefasClient.tsx` nunca lia `searchParams` — o clique caía em `/tarefas` puro e nada abria. Fix: `useSearchParams` lê `abrir`, busca a tarefa direto por `GET /api/tarefas/[id]` (já libera dono/criador/aprovador, independe da visão/filtro ativos) e abre o mesmo `TarefaDrawer` usado ao clicar num card; limpa o parâmetro da URL depois (`router.replace`). Beneficia TODOS os ~15 pontos de criação, não só frete avulso.

- **P3(b) — notificação de desfecho para de oferecer "Aprovar" fantasma.** Todas as notificações de tarefa (pedido de decisão E o desfecho — "Frete avulso liberado/recusado", "Cartão de crédito liberado!/não aprovado" etc.) são gravadas com o MESMO `tipo: 'aprovacao'` (ver `src/app/api/tarefas/[id]/aprovacao/route.ts`). `NotificacoesDrawer.tsx` mostrava "Aprovar →" pra QUALQUER notificação desse tipo com link `?abrir=`, sem checar se ainda havia algo pendente — a consultora via "Aprovar →" na notificação do PRÓPRIO desfecho e, se clicasse, tomava 403 (ou 409, dependendo do caminho). `AprovacaoBottomSheet.tsx` também mostrava os botões sem checar `aprovacao.status` (fazia fallback pra "a mais recente", mesmo já decidida).
  - **Fix**: `NotificacoesDrawer.tsx` ganhou `tarefaAindaDecidivel()` (função pura, exportada e testada isoladamente) — busca `GET /api/tarefas/[id]` (1x por tarefa, cache local) e só mostra "Aprovar →" quando `status === 'aguardando_aprovacao'` **e** `pode_decidir === true` pra este usuário (mesma autoridade já calculada no servidor, nunca recalculada no client). `AprovacaoBottomSheet.tsx` só mostra os botões Aprovar/Rejeitar quando `aprovacao.status === 'pendente'` (antes: bastava existir alguma aprovação, decidida ou não) — com um aviso curto ("Esta aprovação já foi respondida...") quando não há mais nada a decidir.
  - **Testes anti-volta**: `src/__tests__/notificacoes-drawer-decidivel.test.ts` — cobre pendente+autorizado (mostra), desfecho aprovada/rejeitada (não mostra mesmo com `pode_decidir=true` vindo da config), solicitante sem autoridade (não mostra), estado ainda não carregado (conservador, não mostra).

**Débito técnico do §8 antigo, resolvido**: a linha *"`estoquista_loja` tem permissão no BLOCO 3 mas ainda não tem CAMINHO até o botão"* foi FECHADA por este bloco (P1 acima) — removida do §8.

- **P2 — aprovador decidia o frete avulso sem ver o VALOR.** O bloco de aprovação do `TarefaDrawer.tsx` (aba Aprovação) já mostrava quem paga e o comprovante (21/07, ver §3.1), mas não o valor — uma solicitação de R$ 20 e uma de R$ 300 chegavam visualmente idênticas.
  - **Fix**: `GET /api/tarefas/[id]` passou a expor `frete_cobrado`/`frete_motoboy` da entrega vinculada (mesmo JOIN por `tarefa_aprovacao_id` já usado para `frete_pagante`/comprovante — nenhuma query nova), convertidos para `number` (NUMERIC do postgres.js vem como string). `TarefaDrawer.tsx` renderiza os dois valores no bloco de aprovação do frete avulso, ANTES dos botões Aprovar/Rejeitar.
  - **Decisão do Jonathan: SEM teto de valor** — a aprovação nunca é bloqueada por valor alto, só existe um AVISO visual (card vermelho + ícone) quando o valor do MOTOBOY (não o cobrado do cliente) passa de `LIMITE_ALERTA_FRETE_MOTOBOY` = **R$ 200**. O aprovador decide; a diferença é só que ele não decide mais "às cegas".
  - A constante e o predicado (`precisaAlertaFreteMotoboy`) ficam em `src/lib/frete-avulso-alerta.ts` — extraído do componente pra ser (a) uma constante nomeada e comentada, não um número solto no JSX, e (b) testável sem precisar renderizar React.
  - **Testes anti-volta**: `src/__tests__/tarefas-frete-avulso-valor.test.ts` (rota expõe os dois campos como number, inclusive `null` quando não há entrega vinculada) e `src/__tests__/frete-avulso-alerta-limite.test.ts` (predicado: `> 200` alerta, `<= 200` não, `null`/`undefined` não).

---

## 4. Pool de motoboy + claim atômico (inalterado, validado)

Corrida **liberada** (seja por liberação de solicitação, seja por criação direta sem motoboy escolhido) fica **sem dono** (`motoboy_id IS NULL`) e aparece para **todos os entregadores ativos**:

- **Aceite** (`POST /[id]/aceitar-avulso` → `aceitarFreteAvulso`): `pendente → em_rota`. O **claim é atômico** — um único `UPDATE ... WHERE situacao='pendente' AND (motoboy_id IS NULL OR motoboy_id = <ele>)` carimba `motoboy_id`, `data_saida`, `confirmado_por_motoboy_retirada` no mesmo comando. Se `res.count === 0`, outro motoboy já venceu a corrida entre o SELECT de guarda e o UPDATE.
- **Finaliza** (`POST /[id]/confirmar-avulso` → `confirmarFreteAvulso`): `em_rota → confirmada`, sem código de verificação (avulso não usa código A/B).
- Corrida **auto-registrada** pelo próprio entregador (ver §6) já nasce com dono — não passa pelo aceite, vai direto para confirmação pela loja.

---

## 5. Criação direta (estoquista_loja/admin/gerente_loja/dev/consultora)

Estes papéis continuam criando o avulso **já liberado** — não passam pela solicitação/tarefa (lista exata: `ROLES_CRIAR_FRETE_AVULSO_DIRETO` em `src/lib/permissoes/frete-avulso.ts` — NÃO inclui diretor, ver §3.3):

- Nasce **`pendente`** direto (não `solicitada`), sem tarefa.
- Lança saldo **na criação** (`lancarSaldoFreteAvulsoNoTx` chamado dentro de `criarFreteAvulso` quando `modoSolicitacao` é falso).
- **Com motoboy escolhido** → a corrida já nasce com dono. **Sem motoboy** → cai no pool sem dono (mesmo mecanismo do §4), qualquer entregador aceita.

### 5.1. BLOCO 6 (21/07) — formulário COMPLETO no modo direto (reforma da tela Entregas)

Decisão do Jonathan: o botão "Frete Avulso" da tela `/entregas-venda` passa a abrir o **MESMO formulário de 2 colunas** da solicitação (venda opcional com busca, endereço estruturado com CEP, quem paga + comprovante, valor cobrado do cliente com a regra "loja não pede valor", região, observação) — **continuando a criar DIRETO** (sem `solicitar`, nasce `pendente`, sem tarefa/pool). Antes o botão só abria o formulário ENXUTO (motoboy + região + cliente opcional + observação, sem endereço/pagante/comprovante).

- **Front (`FreteAvulsoModal.tsx`)**: nova prop `formularioCompleto` decide o LAYOUT (`mostrarFormularioCompleto = modoSolicitacao || formularioCompleto`) — independente de `ehSolicitacao` (= `modoSolicitacao`), que continua decidindo só o MODO DE ENVIO (`solicitar: true` ou omitido) e os textos ("Solicitar..."/"Corrida registrada!"). Isso viabiliza o par (formulário completo, criação direta) que não existia antes — só existiam (enxuto, direto) e (completo, solicitação). `EntregasVendaClient.tsx` abre o modal com `formularioCompleto` (sem `modoSolicitacao`).
- **Backend**: antes, `pagante`/`comprovanteBase64` eram **descartados** (forçados a `undefined`) sempre que `!ehSolicitacao` — tanto na rota (`POST /api/entregas-venda/frete-avulso`) quanto no INSERT de `criarFreteAvulso` (`pagante` só era gravado quando `modoSolicitacao`). Isso perderia silenciosamente os dois campos no novo modo direto-completo. Fix: `usaFormularioCompleto` (= `modoSolicitacao === true || pagante !== undefined` — calculado nos dois lugares, rota e lib) passou a controlar a VALIDAÇÃO (endereço mínimo, quem paga obrigatório, comprovante se cliente) e a GRAVAÇÃO (`pagante`, `comprovante_pagante_path`) — independente de `modoSolicitacao`, que continua controlando SÓ `situacaoInicial` (`pendente` vs `solicitada`) e a criação (ou não) da tarefa/pool. Formulário enxuto/legado (auto-registro do entregador, chamadas antigas) nunca manda `pagante` — `usaFormularioCompleto` fica `false` para eles, comportamento 100% preservado (cobrado pelos testes anti-volta já existentes, `frete-avulso-invariantes-{lib,route}.test.ts` — nenhum foi alterado, todos continuam verdes).
- **Endereço estruturado**: já era gravado nos DOIS modos antes deste bloco (não precisou de fix) — só `pagante`/comprovante estavam presos a `modoSolicitacao`.
- **IMPACTO SE REVERTIDO**: o botão "Frete Avulso" da tela voltaria a mostrar o formulário enxuto (sem endereço/pagante/comprovante), ou — se só o front voltasse mas o backend não — o front mandaria pagante/comprovante e o backend os descartaria silenciosamente (pior caso: perda de dado sem erro visível).
- **Testes**: nenhum teste precisou mudar — a suíte anti-volta de frete avulso (lib + route) cobre exatamente os casos que este bloco preserva (direto sem `pagante` continua funcionando idêntico).

### 5.2. BLOCO 6 (21/07) — reforma da tela `/entregas-venda`: 3 abas, filtros em select, paginação de 10, componentização

Mockup aprovado pelo Jonathan. A lista única (chips de situação misturando retirada e motoboy na mesma tabela, paginação de 50, arquivo de 1081 linhas) virou:

- **3 abas** (`AbaEntrega` em `page.tsx`, estado na URL via `?aba=`): **"Retirada em loja"** (`forma_entrega='retirada'` — oculta colunas Motoboy/Frete e o card de Saldo Frete Grátis, que não se aplicam), **"Entregas motoboy"** (`forma_entrega='motoboy'`, colunas completas) e **"Pagamento do motoboy"** (não lista entregas — é o relatório/acerto, ver abaixo). `correios` **não é uma forma_entrega própria** — é uma REGIÃO (`entregas_venda.regiao='correios'`); uma corrida por Correios já é `forma_entrega='motoboy'`, então cai naturalmente na aba "Entregas motoboy" — nenhum registro fica sem aba.
- **Filtros em SELECT**: situação e período (antes chips + botões + dropdown de mês separados) viraram 2 `<select>` + busca, lado a lado num grid responsivo (`FiltrosEntrega.tsx`). Os VALORES continuam os mesmos (situação: `""`/`pendente`/`em_rota`/`confirmada`; período: `hoje`/`ontem`/`7dias`/`mes`/`mes_0..11`/`personalizado`) — só a UI mudou, nenhuma regra de filtro foi alterada.
- **Paginação de 10** (era 50) — `limit = 10` em `page.tsx`, propagado a `EntregasVendaClient` (`pageSize`) e ao `recarregar()` client-side. Reusa o componente `@/components/ui/Paginacao` **já existente** no projeto (rodapé "Mostrando X–Y de Z" + navegação) — não foi criado um componente de paginação novo.
- **Componentização** — `EntregasVendaClient.tsx` caiu de ~1081 para ~540 linhas. Novos arquivos em `src/components/entregas/lista/`: `formatters.tsx` (fmtBRL/fmtData/statusBadge/renderDataColuna — puro, sem estado), `AbasEntrega.tsx`, `FiltrosEntrega.tsx`, `CardsResumo.tsx`, `TabelaEntregas.tsx`. **`TabelaEntregas` é UM componente com colunas parametrizadas** (`mostrarMotoboy`/`mostrarFrete` booleanos) — não dois componentes quase-idênticos para Retirada/Motoboy (pedido explícito: "quero tudo componentizado evitando duplicações"). `EntregasVendaClient.tsx` ficou como ORQUESTRADOR: mantém estado (aba/filtros/paginação na URL, comportamento inalterado) e decide o que renderizar.
- **Aba "Pagamento do motoboy" sem duplicar lógica**: a lógica já existia inteira dentro do modal `PagarMotoboyModal.tsx` (aberto pelo drawer de Motoboys). Extraída para `src/components/entregas/PagamentoMotoboyPainel.tsx` (estado, fetch de motoboys/entregas não pagas, seleção, submissão) — `PagarMotoboyModal.tsx` virou uma casca fina (só overlay + header + X) em volta do painel, e a aba renderiza o MESMO painel direto, sem moldura de modal. Os dois pontos de entrada (botão "Pagar" do drawer de Motoboys, e a aba) chamam o mesmo código — uma correção futura vale para os dois.
- **Estado na URL preservado**: aba, situação, busca, datas e página continuam todos na URL (compartilhável, botão voltar funciona) — trocar de aba preserva os filtros ativos (`handleAbaChange`); trocar filtro preserva a aba atual. `GET /api/entregas-venda` ganhou um filtro opcional `forma_entrega` (só aceita `'retirada'`/`'motoboy'`, ignorado se outro valor) para o `recarregar()` client-side (pós-drawer) manter a aba certa — mesma proteção contra SQL livre do resto da rota.
- **IMPACTO SE REVERTIDO**: a tela volta a misturar retirada+motoboy numa lista só, com chips e paginação de 50; o arquivo principal volta a crescer se novas colunas/ações forem adicionadas sem os componentes de `lista/`.
- **Não alterado**: nenhuma regra de negócio, permissão (`ROLES_PERMITIDOS`/`ROLES_ENTREGAS` intactos) ou visibilidade por papel — é reorganização de tela + reuso.
- **Débito registrado**: `docs/../treinamentos/frete-avulso/FreteAvulsoTreino.tsx` (player passo a passo da tela antiga) ficou DESATUALIZADO com esta reforma — não foi tocado nesta sessão (fora do escopo combinado); atualizar o treino é tarefa separada.

## 6. Auto-registro do entregador (PR#75)

O próprio motoboy registra a própria corrida pelo app (`MotoboyAppClient` → "Nova corrida"):

- Só escolhe **descrição + região** (Fortaleza/Fora de Fortaleza); valor é **fixo pela tabela** (`calcularValorMotoboy`), não digitado.
- `motoboy_id` forçado como ele mesmo; `frete_cobrado = frete_motoboy` (não cobra do cliente → **não mexe** no saldo da gerente).
- Nasce **`pendente`** com dono (ele mesmo) — não é pool.
- **Anti-fraude:** ele **não confirma o próprio lançamento**. A rota `POST /[id]/confirmar-avulso` barra explicitamente quando `created_by === motoboy_id` E quem chama é o próprio motoboy (`isMotoboy` + `String(entrega.created_by) === user.id` → 403 "aguarda confirmação da loja") — só admin/gerente/dev confirmam essa corrida. Corrida atribuída pela loja a ele (`created_by != motoboy_id`) ele confirma normalmente. A lib `confirmarFreteAvulso` permite a transição a partir de `pendente` apenas quando `autoRegistrada` (senão exige `em_rota`, ou seja, aceite prévio) — é o que possibilita a loja confirmar direto sem a corrida passar por aceite. `GET /motoboy/minhas` expõe a corrida como aguardando confirmação da loja, sem botão de confirmar para o próprio autor.
- Corrida atribuída pela loja (ou liberada de uma solicitação da consultora) exige que o motoboy **aceite primeiro** (`aceitarFreteAvulso`: `pendente → em_rota`) antes de poder ser confirmada — só o caso auto-registrado pula essa etapa.

---

## 7. Constraints

- **`chk_entrega_origem`** (recriada na migration 353): entrega normal (`is_avulso=false`) continua exigindo `venda_id IS NOT NULL`; avulso (`is_avulso=true`) aceita `venda_id` preenchido (solicitação, para herdar cliente/endereço) **ou** nulo (avulso sem venda).
- **`chk_codigos_obrigatorios`** (migration 294, ajustada na 298): avulso dispensa `codigo_cliente`/`codigo_motoboy` (não usa o fluxo de dois códigos da entrega normal).
- **Saldo lançado UMA vez, nunca duas**: `lancarSaldoFreteAvulsoNoTx` é a **única** função que grava em `saldo_frete_gratis` para avulso — chamada em exatamente um dos dois pontos por corrida: criação direta (`criarFreteAvulso` quando `!modoSolicitacao`) **ou** liberação (`liberarFreteAvulso`), nunca os dois para a mesma entrega (mutuamente exclusivos pela própria lógica: solicitação nasce sem lançar, criação direta lança na hora).
- **Listas operacionais nunca mostram `solicitada`/`cancelada` por padrão**: `/entregas-venda` (SSR e `GET /api/entregas-venda`), o app do motoboy (`GET /motoboy/minhas`, 3 queries) e o pagamento em lote (`motoboy/pagar`, exige `situacao='confirmada'`) filtram por padrão `situacao NOT IN ('cancelada','solicitada')` ou `= 'confirmada'`. As views `vw_entregas_pendentes`/`vw_motoboy_entregas` (migration 285) já eram hardcoded para `situacao='confirmada'`, não precisaram mudar.

---

## 8. Débitos técnicos conhecidos (registrados, não bloqueiam)

- **Pool sem gating de região/loja** (decisão explícita do Jonathan, não é bug) — qualquer aprovador da chave `aprovadores_frete_avulso` decide qualquer solicitação, de qualquer região/loja; qualquer entregador ativo aceita qualquer corrida liberada, independente de região.
- **Card "Pendentes" da tela de entregas não conta separadamente o pool** — o subcontador `pendente` conta qualquer `situacao='pendente'`, incluindo avulso em pool sem dono; não há um contador dedicado "aguardando aceite de motoboy".
- **Cancelar um avulso liberado NÃO estorna o saldo lançado** — `cancelarEntrega()` (genérica, usada também para entrega normal) só exige `situacao='pendente'` e atualiza `situacao='cancelada'`; não toca `saldo_frete_gratis`. Se um avulso foi liberado (saldo já lançado) e depois cancelado antes do aceite, o crédito/débito no saldo da gerente **permanece**, mesmo a corrida não tendo acontecido.
- **Entregador aceita/registra corrida sem exigir cadastro prévio em `alissonerp.motoboys`** — `aceitarFreteAvulso`/auto-registro carimbam `motoboy_id` a partir do usuário autenticado (`role in ('entregador','motoboy')`), sem checar se existe linha correspondente em `motoboys`. Isso pode deixar `vw_motoboy_entregas`/pagamento sem o `JOIN` de nome resolvido (nome nulo) se o usuário nunca foi cadastrado como motoboy. Baixo risco — só registrado.
- **Diretor/aprovador fora da lista de config não decide a tarefa** — limitação **pré-existente de todos os tipos** de aprovação no dispatcher (`PATCH /api/tarefas/[id]/aprovacao`), não é específica de frete avulso: só decide quem está gravado como `aprovador_id` da linha, é admin/dev, ou (só para `frete_avulso`) está na chave de config. Um diretor que não esteja em nenhuma das duas listas não decide nenhum tipo de aprovação, não só frete avulso.
- **Exclusão do solicitante (BLOCO 2) é escopada a `frete_avulso`** — os outros ~11 tipos de aprovação do portão genérico (`PATCH /api/tarefas/[id]/aprovacao`) continuam sem checar se `aprovacao.aprovador_id`/config coincide com quem solicitou. Não avaliado caso a caso se algum desses fluxos depende hoje (ainda que por acidente) do solicitante poder decidir o próprio pedido — candidato a auditoria + PR próprio antes de generalizar.
- **Trava de `tags`/`tipo` (BLOCO 2) também é escopada a `frete_avulso`** — qualquer outro tipo de tarefa com aprovação pendente continua deixando o dono (`responsavel_id`/`criado_por`) editar `tags`/`tipo` livremente pelo `PATCH /api/tarefas/[id]`. Mesmo raciocínio de não generalizar sem avaliar os outros fluxos.
- **Estoque vê TODAS as entregas, não só as avulsas (BLOCO 5, decisão explícita — ver §3.5 P1)** — não existe filtro "só avulsas" pronto; `estoquista_loja` enxerga a listagem inteira de `/entregas-venda`. Candidato a recorte mais estrito se o volume de entregas normais poluir a visão do estoque no dia a dia.
- **`role_permissoes` do banco ainda não tem a linha `entregas_venda`/`estoquista_loja` (BLOCO 5)** — o menu funciona por injeção client-side (`Sidebar.tsx`) sem depender da migration, mas o SQL de alinhamento (ver §3.5 P1) ainda não rodou em nenhum ambiente — reportado ao Jonathan pra rodar assinado.

---

## 9. Referência

- Migration base do módulo: `285_modulo_entrega.sql` (tabelas `entregas_venda`, `entregas_venda_itens`, `saldo_frete_gratis`, `fechamentos_frete`, `motoboys`; views `vw_entregas_pendentes` e `vw_motoboy_entregas`, ambas hardcoded para `situacao='confirmada'`). `fechamentos_frete` ficou sem nenhum código usá-la até ser reaproveitada pela migration 356 (ver §10.2).
- Migration do frete avulso original: `293_frete_avulso.sql` (+ `294`/`295`/`298` para nullable de códigos e blindagem).
- Migration da solicitação/pool: **`353_frete_avulso_solicitacao.sql`** — enum `solicitada` (inserido antes de `pendente`), colunas `endereco_entrega`/`liberada_por`/`liberada_em`/`motivo_recusa`/`tarefa_aprovacao_id`, constraint `chk_entrega_origem` recriada. **Já aplicada em homolog; produção pendente.**
- Migration "quem paga": **`354_frete_avulso_pagante.sql`** — colunas `pagante` (`'loja'`|`'cliente'`, `chk_entrega_frete_avulso_pagante`) e `comprovante_pagante_path` em `entregas_venda`. Só arquivo criado nesta branch — **banco (local/homolog/produção) ainda não rodou esta migration.**
- Migration do endereço estruturado (BLOCO 4): **`355_frete_avulso_endereco_estruturado.sql`** — colunas `endereco_entrega_numero`/`_complemento`/`_bairro`/`_cidade`/`_cep`/`_uf` em `entregas_venda` (a `endereco_entrega` TEXT já existia desde a 353, reaproveitada como "logradouro"). Espelha os nomes de `vendas_erp`. Só arquivo criado nesta branch — **banco ainda não rodou esta migration.**
- Lib principal: `src/lib/entrega-venda.ts` (`criarFreteAvulso`, `liberarFreteAvulso`/`liberarFreteAvulsoNoTx`, `recusarFreteAvulso`/`recusarFreteAvulsoNoTx`, `aceitarFreteAvulso`, `confirmarFreteAvulso`, `listarAprovadoresFreteAvulso`, `lancarSaldoFreteAvulsoNoTx`, `formatarEnderecoEntregaAvulso`, `resolverEnderecoEntrega` — BLOCO 4, ver §3.4).
- **Permissão (BLOCO 3, 21/07):** `src/lib/permissoes/frete-avulso.ts` — fonte única de quem solicita/cria direto (ver §3.3).
- **Aviso de valor alto (BLOCO 4):** `src/lib/frete-avulso-alerta.ts` — `LIMITE_ALERTA_FRETE_MOTOBOY` e `precisaAlertaFreteMotoboy` (ver §3.4).
- Rotas: `src/app/api/entregas-venda/frete-avulso/route.ts` (criação/solicitação), `[id]/aceitar-avulso`, `[id]/confirmar-avulso`, `src/app/api/entregas-venda/[id]/route.ts` (detalhe/drawer — endereço resolvido, BLOCO 4), `src/app/api/configuracoes/aprovadores/route.ts` (chave `aprovadores_frete_avulso`), `src/app/api/tarefas/route.ts` + `[id]/route.ts` + `[id]/aprovacao/route.ts` (pool aditivo, ver §3; `[id]/route.ts` GET expõe valor do frete, BLOCO 4).
- Tela: `src/app/(dashboard)/entregas-venda/page.tsx` (SSR, 3 abas via `?aba=` desde o BLOCO 6 — ver §5.2 — sem aba própria de solicitações, decisão acontece em `/tarefas`; `ROLES_PERMITIDOS` inclui `estoquista_loja` desde o BLOCO 5, ver §3.5), `EntregasVendaClient.tsx` (orquestrador, BLOCO 6), `src/components/entregas/lista/` (`AbasEntrega.tsx`, `FiltrosEntrega.tsx`, `CardsResumo.tsx`, `TabelaEntregas.tsx`, `formatters.tsx` — componentização do BLOCO 6), `src/components/entregas/PagamentoMotoboyPainel.tsx` (painel de acerto de motoboy, reusado por `PagarMotoboyModal.tsx` e pela aba "Pagamento do motoboy", BLOCO 6), `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx` (botão "Solicitar frete avulso"), `src/components/entregas/FreteAvulsoModal.tsx` (criação/solicitação; `formularioCompleto` no modo direto desde o BLOCO 6, ver §5.1), `src/components/entregas/EntregaDetalheDrawer.tsx` (drawer de detalhe — endereço resolvido, BLOCO 4), `MotoboyAppClient.tsx` (app do entregador), `src/app/(dashboard)/tarefas/TarefaDrawer.tsx` (decisão da tarefa pelo pool; valor do frete, BLOCO 4).
- **Acompanhamento (BLOCO 5, 21/07):** `src/components/Sidebar.tsx` (`ROLES_ENTREGAS_VENDA` + injeção de módulo client-side), `src/lib/auth/permissions.ts` (`ROLE_MENUS.estoquista_loja` — fallback hardcoded), `src/app/api/tarefas/route.ts` (`visao=solicitadas`), `src/app/(dashboard)/tarefas/TarefasClient.tsx` (aba "Minhas solicitações", deep link `?abrir=`), `src/components/NotificacoesDrawer.tsx` (`tarefaAindaDecidivel`), `src/components/AprovacaoBottomSheet.tsx` (gate por `aprovacao.status === 'pendente'`). Ver §3.5.
- Testes (BLOCO 3): `src/__tests__/frete-avulso-invariantes-route.test.ts`, `src/__tests__/frete-avulso-invariantes-lib.test.ts`, `src/lib/permissoes/__tests__/frete-avulso.test.ts`.
- Testes (BLOCO 4): `src/__tests__/entrega-detalhe-endereco-resolvido.test.ts`, `src/__tests__/tarefas-frete-avulso-valor.test.ts`, `src/__tests__/frete-avulso-alerta-limite.test.ts`.
- Testes (BLOCO 5): `src/__tests__/entregas-venda-estoquista-acesso.test.ts`, `src/__tests__/tarefas-solicitadas-visao.test.ts`, `src/__tests__/notificacoes-drawer-decidivel.test.ts`.

---

## 10. Verba de Frete Grátis — fundação (Blocos 0-3, 21/07)

Regra de negócio **definida pelo Jonathan** (não reabrir): a loja recebe todo mês uma verba para **dar frete grátis de cortesia** (o normal é o cliente pagar). Verba = **0,1% do faturamento do mês anterior**. Dia 01, automático: fecha o mês, saldo **positivo ZERA** (não é cumulativo); **negativo** gera **TAREFA de aprovação** → se aprovada, vira **conta a pagar da gerente** com vencimento no dia 10; se rejeitada, não lança (motivo obrigatório). A verba do mês novo entra **SEMPRE**, independente da tarefa. Esta sessão (Blocos 0-3) é só a **fundação** — o fechamento automático do dia 01 (cron) e a config de "quem aprova o negativo" ficam para um bloco futuro.

### 10.0. BLOCO 0 — limpeza: formulário ENXUTO órfão removido

`src/components/entregas/FreteAvulsoModal.tsx` tinha um 3º modo — o formulário ENXUTO (motoboy escolhido na hora + busca de cliente avulso, sem endereço/pagante/comprovante) — alcançado só quando o modal era aberto SEM `modoSolicitacao` **e** SEM `formularioCompleto`. Desde o BLOCO 6 (commit `ab4ee47a`), os 3 pontos de entrada reais (`EntregasVendaClient.tsx` → `formularioCompleto`; `VendaDetalheClient.tsx` → `modoSolicitacao` + `vendaId`; `TarefasClient.tsx` → `modoSolicitacao`) sempre passam um dos dois — confirmado via grep, **zero chamadores** para o modo enxuto.

- **Removido**: `interface Motoboy`/`Contato`, estados `motoboys`/`motoboyId`/`buscaContato`/`contatos`/`contatoSelecionado`/`buscandoContato`, os `useEffect` que carregavam motoboys/buscavam contato, o branch `else` de `handleSubmit` (POST com `motoboyId`/`contatoId`), `disabledPadrao`, e o branch JSX do formulário enxuto (select de motoboy + busca de cliente). Import não usado (`User` do lucide-react) removido junto.
- **Mantido**: os dois modos atuais — solicitação (`modoSolicitacao`) e criação direta com formulário completo (`formularioCompleto`) continuam idênticos, sem alteração de comportamento.
- **Se precisar reintroduzir um modo "enxuto" no futuro**: não existe mais fallback — qualquer novo caller sem `modoSolicitacao`/`formularioCompleto` cai no formulário completo (única opção que resta).

### 10.1. BLOCO 1 — gerente do saldo de frete grátis, configurável

Antes, "a gerente" do saldo de frete grátis (avulso) era escolhida por `SELECT ... WHERE role='gerente_loja' AND ativo=true ORDER BY created_at LIMIT 1` — arbitrário (o primeiro gerente_loja cadastrado), duplicado em 2 lugares: `lancarSaldoFreteAvulsoNoTx` (`src/lib/entrega-venda.ts`) e `GET /api/entregas-venda/saldo-frete` (`route.ts`).

- **Fix**: chave de config **`gerente_frete_gratis`** (UUID único, não é MULTI) em **Config › Aprovadores** — mesmo padrão de `aprovador_limpeza`/`metal_aprovador_id` (CHAVES + GET + PUT em `src/app/api/configuracoes/aprovadores/route.ts`, entrada em `ListaAprovadores.tsx` com `usuariosKey: "gerentes"` sem `multi`, estado em `TabAprovadores.tsx`).
- **Fonte única de leitura**: `resolverGerenteFreteGratisId(db, fallbackUserId)` (`src/lib/entrega-venda.ts`) — usada pelos 2 lugares acima. Recebe `db` como parâmetro (funciona tanto com `sql` direto quanto com `tx` de uma transação).
- **⚠️ Fallback obrigatório**: chave vazia → mantém EXATAMENTE o comportamento antigo (`ORDER BY created_at LIMIT 1`, fallback final = usuário logado/autor da ação) — zero impacto em produção até o Jonathan configurar a chave.
- **NÃO cobre `criarEntrega`** (entrega normal, não-avulso) — esse fluxo tem sua PRÓPRIA busca arbitrária de `gerente_loja` (mesmo padrão antigo, `src/lib/entrega-venda.ts` ~linha 878) para o saldo de frete grátis das entregas normais (sobra/falta de frete cobrado vs motoboy). **Reportado ao Jonathan, não alterado** — fora do escopo combinado (só os 2 lugares do frete AVULSO). Se um dia for unificado, usar a mesma `resolverGerenteFreteGratisId`.
- **Teste anti-volta**: `src/__tests__/frete-gerente-configuravel.test.ts` — chave preenchida usa o UUID configurado (sem nem consultar o fallback); chave vazia/em branco cai no fallback antigo; sem config e sem gerente_loja ativo usa o `fallbackUserId`.

### 10.2. BLOCO 2 — migration 356 (arquivo criado, NÃO executada)

`supabase/migrations/356_verba_frete_gratis_fechamento.sql` reaproveita `alissonerp.fechamentos_frete` (criada na migration 285, **nunca usada por nenhum código** até esta sessão — 0 linhas em produção). Já tinha `UNIQUE(gerente_id, mes_referencia)` (idempotência) e `saldo_frete_gratis.fechamento_id` já era FK pra ela.

- **Colunas novas** (`ADD COLUMN IF NOT EXISTS`): `verba_creditada NUMERIC(12,2)`, `faturamento_base NUMERIC(14,2)`, `percentual_verba NUMERIC(6,4)` (auditoria do cálculo — ver §10.3), `tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id)`, `conta_pagar_id INTEGER REFERENCES alissonerp.contas_pagar(id)` (tabela/PK confirmadas em `024_financeiro.sql` — `contas_pagar.id SERIAL`).
- **`valor_descontado_folha` NÃO removida** (regra do repo: nunca remover coluna) — marcada LEGADO via `COMMENT ON COLUMN`: pertencia à regra ANTIGA (nunca implementada — positivo carregava, negativo descontava em folha). A regra ATUAL usa `conta_pagar_id`.
- **Domínio de `status` redefinido** (tabela nunca usada, sem linha para violar constraint nova): `CHECK (status IN ('fechado', 'aguardando_aprovacao', 'pago', 'recusado'))`. `'fechado'` = positivo/zero, sem aprovação (também virou o novo `DEFAULT`, no lugar do antigo `'aberto'`, que não pertence ao domínio novo). `'aguardando_aprovacao'` = negativo, tarefa criada. `'pago'` = negativo aprovado, `conta_pagar_id` preenchido. `'recusado'` = negativo recusado.
- **COMMENTs reescritos**: `COMMENT ON TABLE alissonerp.fechamentos_frete` (nunca tinha — migration 285 não incluiu) e `COMMENT ON TABLE alissonerp.saldo_frete_gratis` (tinha um comment descrevendo a regra ANTIGA — corrigido, mesmo assunto).
- **⚠️ Config de "quem aprova o negativo"** (chave própria, "um usuário configurado") **não foi criada nesta sessão** — só a fundação (Blocos 0-3). Fica para o bloco que implementa o fechamento automático do dia 01.

### 10.3. BLOCO 3 — cálculo da verba, fonte única (`src/lib/frete-verba.ts`)

`calcularFaturamentoMes(inicio, fim)` usa **EXATAMENTE** a mesma consulta da dashboard comercial (`src/app/api/dashboard-comercial/vendas-dashboard/route.ts`, campo `visaoGeral.alcancado_bruto`): `FROM alissonerp.vw_dash_vendas_todas WHERE data_venda BETWEEN ... AND status IS NOT NULL AND status != 4`, somando `total_venda` (soma BRUTA, sem descontar vale-troca — mesmo número que a tela do Jonathan já mostra e confere).

- **`obterPercentualVerbaFrete()`**: lê `percentual_verba_frete` em `alissonerp.configuracoes_sistema` (valor "0.1" = 0,1%), default `0.1` se a chave não existir — mesmo padrão de leitura direta (sem cache) de `desconto_fallback_sem_cadastro_pct`/`limite_desconto_cartao_pct`. Percentual NÃO fica hardcoded no meio do código.
- **`calcularVerbaFreteGratis(mesReferencia)`**: compõe faturamento do MÊS ANTERIOR + percentual → `{ verba, faturamentoBase, percentual, inicioMesAnterior, fimMesAnterior }` — os 3 primeiros campos alimentam `fechamentos_frete.verba_creditada`/`faturamento_base`/`percentual_verba` (migration 356) quando o fechamento automático for implementado.
- **🔒 Teste anti-volta**: `src/__tests__/frete-verba-equivalente-dashboard.test.ts`. O setup de teste do projeto roda com vitest `environment:"node"`, **sem banco disponível** — não dá para rodar as duas consultas de verdade e comparar o RESULTADO. Em vez disso, o teste lê o **texto-fonte** dos dois arquivos (`frete-verba.ts` e `vendas-dashboard/route.ts`), extrai por regex o filtro WHERE (view + condição de data + condição de status) de cada um, normaliza (remove aliases de tabela como `v.`, troca nomes de variável interpolados por um token fixo) e afirma que os dois filtros são **idênticos** — se alguém mudar o filtro só de um lado (`!= 4` por outro valor, remover o `IS NOT NULL`, trocar a view), a extração captura textos diferentes e o teste quebra apontando qual lado mudou. **Limitação reconhecida**: não pega uma condição NOVA adicionada depois do trecho capturado em só um dos lados (ex.: um `AND` extra no fim) — não é uma prova de equivalência em runtime, é a garantia possível neste setup de teste (mesma string de filtro nos dois arquivos).
- **Percentual esperado (conferido pelo Jonathan em homolog, jul/26)**: 17 vendas, R$ 217.867,00 de faturamento — bate com a tela do dashboard comercial.

### 10.4. Referência (Blocos 0-3)

- Migration: `supabase/migrations/356_verba_frete_gratis_fechamento.sql` (arquivo criado, **NÃO executada** em nenhum ambiente).
- Lib: `src/lib/frete-verba.ts` (`calcularFaturamentoMes`, `obterPercentualVerbaFrete`, `calcularVerbaFreteGratis`); `resolverGerenteFreteGratisId` em `src/lib/entrega-venda.ts` (junto de `lancarSaldoFreteAvulsoNoTx`/`obterSaldoFreteGerenteNoTx`, §9 acima).
- Rotas: `src/app/api/entregas-venda/saldo-frete/route.ts` (usa `resolverGerenteFreteGratisId`), `src/app/api/configuracoes/aprovadores/route.ts` (chave `gerente_frete_gratis`).
- Front: `src/components/configuracoes/aprovadores/ListaAprovadores.tsx` (card "Gerente do saldo de frete grátis"), `src/components/configuracoes/TabAprovadores.tsx`.
- Componente limpo (BLOCO 0): `src/components/entregas/FreteAvulsoModal.tsx` (formulário enxuto removido — ver comentário "LIMPEZA" no topo do arquivo).
- Testes: `src/__tests__/frete-gerente-configuravel.test.ts` (BLOCO 1), `src/__tests__/frete-verba-equivalente-dashboard.test.ts` (BLOCO 3).
- **Fora do escopo desta sessão (fundação apenas)**: fechamento automático do dia 01 (cron), config de "quem aprova o negativo", geração da tarefa/conta a pagar em si, e a busca arbitrária de `gerente_loja` ainda existente em `criarEntrega` (entrega normal — ver §10.1).

---

## 11. MULTIFOTO na confirmação de entrega (migration 357, 21/07)

Decisão do Jonathan: *"sempre que o motoboy tiver uma corrida ele pode anexar fotos antes de finalizar — não é obrigatório"*. Vale para **toda entrega dele** — corrida avulsa (`POST /[id]/confirmar-avulso`) **e** entrega de pedido (`POST /[id]/confirmar`, código A/B). Objetivo: alimentar o relatório de pagamento do entregador (o financeiro confere a comprovação).

### 11.1. Modelagem — tabela filha (mesmo padrão do projeto)

A coluna existente `entregas_venda.foto_entrega_path` (migration 287) só guarda **um** caminho. Em vez de inventar um jeito novo de guardar fotos, este bloco **reusa exatamente** o padrão já validado em produção pelo módulo Movimentação Interna / Solicitação de Peça (`alissonerp.solicitacao_peca_fotos`, migration 349): tabela normalizada, **uma linha por foto**.

- **Tabela nova**: `alissonerp.entregas_venda_fotos` (`id`, `entrega_id` FK → `entregas_venda` `ON DELETE CASCADE`, `foto_path`, `criado_por_id`, `criado_em`). **Sem coluna `etapa`** (diferença vs. `solicitacao_peca_fotos`): lá existem 3 momentos físicos por solicitação (entrega/recebimento/devolução); aqui existe **um único momento** por entrega (a confirmação) — coluna `etapa` seria sempre a mesma constante, sem benefício.
- **`foto_entrega_path` fica CONGELADA** (não removida — Database Safety; não é mais escrita pelo código novo) — continua válida pra ler os registros ANTIGOS (confirmados antes desta migration).
- **Sem cópia de dados históricos** (diferença vs. migration 349, que copiou os `foto_*` antigos pra tabela filha): o pagamento do motoboy foi acertado até 19/07 e recomeça do zero (decisão Jonathan) — não há necessidade de migrar fotos antigas pra tabela nova pra efeito de acerto financeiro. O fallback de LEITURA (abaixo) já cobre exibir fotos antigas sem duplicar o dado fisicamente.
- **Migration criada como ARQUIVO, NÃO executada** — `supabase/migrations/357_entregas_venda_fotos.sql`. Confirmado número livre contra `main` (que tinha até `354_perda_extravio_stock_ledger.sql` — **conteúdo diferente** do `354_frete_avulso_pagante.sql` desta branch; ver §11.5 "atenção" abaixo) e contra este branch (`353`–`356` já usados aqui).

### 11.2. Leitura unificada — helper único (`buscarFotosEntrega`)

`buscarFotosEntrega(entregaId)` (`src/lib/entrega-venda.ts`) é o **único** ponto de leitura de fotos de uma entrega — mesmo espírito do COALESCE com fallback já usado em `src/app/(dashboard)/movimentacao-interna/page.tsx`:

- Se existir **qualquer** linha em `entregas_venda_fotos` para a entrega, ela manda (ordem cronológica, mais antiga → mais nova).
- Senão, cai no fallback de `entregas_venda.foto_entrega_path` (uma foto, ou array vazio se nunca teve foto nenhuma).
- `GET /api/entregas-venda/[id]` chama este helper e expõe `fotos_entrega: string[]` na resposta (mantendo `foto_entrega_path` no payload, sem quebrar nenhum consumidor antigo do campo).
- **IMPACTO SE CADA TELA REIMPLEMENTAR O FALLBACK POR CONTA PRÓPRIA**: fotos de entregas confirmadas ANTES da migration 357 (só na coluna antiga) ficariam invisíveis em qualquer tela que só olhasse a tabela nova.

### 11.3. Upload — best-effort, NUNCA fail-fast (diferença deliberada vs. o comprovante do frete avulso)

`uploadFotosEntrega` (`src/lib/entrega-venda.ts`) faz upload de N fotos (base64) pro bucket **`pagamento-fotos`** (mesmo de `foto_entrega_path` e do comprovante do frete avulso), via `src/lib/storage.ts` (`uploadFile`) — server-side, nunca upload direto do client.

- **Limite de quantidade**: `MAX_FOTOS_ENTREGA = 5` (exportado de `src/lib/entrega-venda.ts`) — mesmo valor já usado no padrão existente (`solicitacao_peca_fotos`, migration 349), sem inventar um número novo.
- **Limite de tamanho por foto**: `LIMITS.IMAGE_BASE64_MAX` (`src/lib/payload-limits.ts`, ~3.75MB binário) — checado via `zod` no schema da rota **e** em profundidade via `checkArrayLength`/`checkBase64Length` (mesmo padrão de `src/app/api/produtos/[id]/imagens/route.ts`).
- **Best-effort, NÃO fail-fast**: cada foto que falhar no upload é descartada (logada, sem lançar) — o `criarFreteAvulso` faz upload do comprovante **fail-fast** (lança se o Storage falhar) porque ali o comprovante é OBRIGATÓRIO quando `pagante='cliente'`; aqui a foto é **sempre opcional** (decisão Jonathan) — fail-fast trocaria uma instabilidade do Storage por uma finalização de corrida bloqueada à toa, o que violaria a própria regra de negócio ("nunca bloquear a finalização por falta de foto"). Esta é uma decisão deliberada, registrada aqui para não ser "corrigida" de volta ao padrão fail-fast numa limpeza futura sem reler este parágrafo.

### 11.4. Ordem inviolável em `confirmarEntrega` (entrega de PEDIDO — código A/B)

⚠️ Alerta explícito do Jonathan: a validação do código de verificação (`codigo_cliente`/`codigo_motoboy`, contador `tentativas_codigo`, migration 285/295) é o controle que garante que a peça foi entregue à pessoa certa — **NUNCA** pode ser alterada, antecipada ou substituída pela foto.

- Em `confirmarEntrega`, TODOS os guards de código (entrega existe, não cancelada/já confirmada, não bloqueada por tentativas, código bate contra `codigo_cliente`/`codigo_motoboy`, senão incrementa `tentativas_codigo` e rejeita) rodam **antes** de `sql.begin` — ou seja, antes de qualquer processamento de foto. Um código inválido rejeita exatamente como sempre rejeitou (mesma mensagem, mesmo contador) e a função retorna **sem sequer tentar** nenhum upload.
- Só depois do código aprovado (já dentro da transação) é que `fotosBase64` é processado — best-effort, nunca lança, nunca condiciona a confirmação.
- **Teste anti-volta que prova a ordem**: `src/__tests__/entrega-fotos-multiplas.test.ts` — código inválido + fotos fornecidas → rejeita como sempre, `uploadFile` **nunca** chamado e `sql.begin` **nunca** aberto.

### 11.5. Front — pergunta opcional ao finalizar (nunca trava)

- **`ConfirmarEntregaModal.tsx`** (confirmação COM código — entrega de pedido): o botão "Anexar foto" (já existia, uma foto só) virou multi-seleção (`input[multiple]`, até `MAX_FOTOS`), com preview em grade e remoção individual. A ordem de validação do código no front **não mudou** — só o corpo enviado passou de `foto_base64` (string) para `fotos_base64` (array).
- **`FinalizarAvulsoModal.tsx`** (NOVO — confirmação SEM código, corrida avulsa): antes, o botão "Finalizar entrega" chamava `POST /confirmar-avulso` direto, sem nenhuma pergunta. Agora abre este modal perguntando *"Quer anexar um comprovante (foto)? É opcional"* — pular é **1 clique** (o botão principal funciona igual com ou sem foto anexada) e o clique fica desabilitado durante o envio (trava duplo clique). Reusado nos dois pontos onde existia o botão direto: `MotoboyAppClient.tsx` (lista de corridas do app) e `EntregaDetalheDrawer.tsx` ("Confirmar Corrida Avulsa").
- **`src/lib/fotos-base64.ts`** (NOVO, client-safe): `lerArquivosComoBase64` — extraído pra não duplicar a leitura de múltiplos arquivos (FileReader + Promise.all) entre os dois modais acima.
- **Exibição**: `EntregaDetalheDrawer.tsx` mostra a galeria de `fotos_entrega` (grade de miniaturas, clique abre em nova aba) via `getPublicUrl("pagamento-fotos", path)` (`src/lib/storage-url.ts`) — proxy autenticado, sem gerar signed URL nova.
- **⚠️ Atenção separada (não é sobre fotos)**: ao pesquisar o número livre da migration, esta branch (`353`–`356`) diverge de `main` a partir da 354 — `main` tem `354_perda_extravio_stock_ledger.sql` (conteúdo diferente do `354_frete_avulso_pagante.sql` local). É uma colisão de numeração PRÉ-EXISTENTE nesta branch (não introduzida por este bloco) que precisa de renumeração/rebase antes do merge para `main` — reportado ao Jonathan, não resolvido aqui (fora do escopo combinado desta tarefa).

### 11.6. Referência (§11)

- Migration: `supabase/migrations/357_entregas_venda_fotos.sql` (arquivo criado, **NÃO executada**).
- Lib: `src/lib/entrega-venda.ts` (`MAX_FOTOS_ENTREGA`, `buscarFotosEntrega`, `uploadFotosEntrega`, `inserirFotosEntrega` — privada; `confirmarEntrega`/`confirmarFreteAvulso` estendidos com `fotosBase64?: string[]`).
- Util front: `src/lib/fotos-base64.ts` (`lerArquivosComoBase64`).
- Rotas: `src/app/api/entregas-venda/[id]/confirmar/route.ts` (`fotos_base64` no body, código intocado), `src/app/api/entregas-venda/[id]/confirmar-avulso/route.ts` (passou a ler o body — antes ignorava), `src/app/api/entregas-venda/[id]/route.ts` (expõe `fotos_entrega`).
- Front: `src/components/entregas/ConfirmarEntregaModal.tsx` (multifoto), `src/components/entregas/FinalizarAvulsoModal.tsx` (NOVO), `src/app/(dashboard)/entregas-venda/motoboy/MotoboyAppClient.tsx`, `src/components/entregas/EntregaDetalheDrawer.tsx` (galeria + modal de finalizar avulso).
- Testes: `src/__tests__/entrega-fotos-multiplas.test.ts` (sem foto / N fotos / ordem código-antes-de-foto / helper de leitura); `src/__tests__/entrega-detalhe-endereco-resolvido.test.ts` ajustado (nova query de fotos no mock do GET, sem mudança de comportamento testado).

---

## 12. Relatório de pagamento do motoboy por entregador + período (21/07/2026)

Decisão do Jonathan (ver memória `reference_relatorio_corridas_motoboy.md`): a aba "Pagamento do motoboy" ganha, além do painel de pagamento em LOTE já existente (`PagamentoMotoboyPainel.tsx`, §5.2), um **RELATÓRIO** que substitui o processo manual — hoje o Jonathan gera um PDF (script Python, reportlab) com a tabela de corridas + foto de cada uma e manda ao financeiro pagar o entregador (Kaio Nikollas).

### 12.1. Fonte: SÓ o módulo novo, com marco de corte

**Decisão explícita do Jonathan**: a fonte é **exclusivamente** `alissonerp.entregas_venda` (`forma_entrega='motoboy'`, `situacao='confirmada'`) — **NUNCA** a tabela legada `public.controle_entregas` (usada pelo script Python antigo). Isso só é seguro porque **o pagamento manual cobriu tudo até 19/07/2026** — "começando do zero" a partir do módulo novo.

- **`MARCO_RELATORIO_PAGAMENTO_MOTOBOY = '2026-07-20'`** (`src/lib/relatorio-pagamento-motoboy.ts`) — o período do relatório NÃO pode começar antes desta data. Violar isso arrisca pagar 2x a mesma corrida (uma vez no PDF manual antigo, outra vez neste relatório).
- **Defesa em profundidade, dois níveis**: o campo "Início" do front tem `min={MARCO}` (não deixa nem escolher no seletor de data); a rota faz a MESMA checagem no servidor (`periodoAntesDoMarco`) e devolve **400** se for violada — o front nunca é a única barreira.
- **Aviso permanente e visível** na tela (não condicional a nada): *"Corridas anteriores a 20/07/2026 já foram pagas e não entram neste relatório."*

### 12.2. Classificação Pagar / Revisar / Não pagar — SUGESTÃO, não decisão travada

**Mudança 21/07/2026 (decisão do Jonathan: "o usuário pode revisar e ajustar os pagamentos no relatório")**: a classificação computada é uma **SUGESTÃO** do sistema — o financeiro revê e AJUSTA a decisão de cada corrida antes de fechar o pagamento (ver §12.6). "Não pagar" automático foi restrito ao ÚNICO caso onde não há dúvida nenhuma (venda cancelada); duplicidade virou **suspeita** (Revisar), porque o motoboy pode ter feito 2 viagens reais para a mesma venda — não é certeza de que ele não trabalhou.

Fonte única da sugestão: `classificarCorridaMotoboy` (`src/lib/relatorio-pagamento-motoboy.ts`) — função PURA, chamada pela rota depois de uma única consulta SQL (nunca recalculada no front). Ordem de prioridade (a primeira regra que bater decide):

1. **Não pagar** (única certeza automática) — venda vinculada com `vendas_erp.situacao = 'cancelado'`.
2. **Revisar** — corrida **duplicada** (suspeita): mais de uma corrida confirmada para a MESMA venda dentro do período (a partir da 2ª, calculado via `ROW_NUMBER() OVER (PARTITION BY venda_id ORDER BY data_entrega_realizada, id)` na própria consulta SQL).
3. **Revisar** — entrega de **pedido** (`is_avulso=false`) cuja venda ainda **não está fechada/entregue no ERP** (`vendas_erp.situacao NOT IN ('entregue', 'concluido')`) — confirmado em `marcarVendaEntregueSeCompleta` (`src/lib/entrega-venda.ts`): a venda só vira `'entregue'` quando TODOS os itens foram confirmados E não há pagamento "Na Entrega" pendente.
4. **Revisar** — corrida **avulsa** sem `venda_id` e sem `descricao_avulso` preenchida (não dá pra saber o que o motoboy foi fazer). Avulsa **com** `venda_id` (corrida complementar solicitada de dentro de uma venda, ver §2) **não** precisa da venda estar fechada — a janela normal do frete avulso (`aprovado`/`em_rota`/`entregue`) já vale.
5. **Revisar** — `motoboy_id` sem linha correspondente em `alissonerp.motoboys` (débito técnico §8: é possível aceitar/registrar corrida sem cadastro formal).
6. **Pagar** — o resto.

⚠️ **Ponto reportado ao Jonathan, ainda não resolvido**: a regra "no máximo 1 corrida por venda é custeada pelo cliente; a 2ª/avulsas/garantia é frete da loja" (memória do Jonathan) fala sobre **quem paga o frete** (cliente vs. loja), não necessariamente sobre se o **motoboy** deve ou não receber pela 2ª corrida que ele de fato fez. Como a classificação agora é só sugestão (o financeiro decide de verdade — §12.6), esse ponto ficou menos crítico do que na primeira versão (onde "Não pagar" travava a decisão), mas a nomenclatura/fluxo financeiro por trás da 2ª corrida ("quem cobre o custo" vs. "o motoboy recebe ou não") ainda não foi esclarecido — **fora do escopo combinado desta sessão**.

### 12.3. Fotos — link, nunca embutida; sem N+1

`buscarFotosEntregaEmLote(entregaIds)` (NOVO, `src/lib/entrega-venda.ts`) — mesma unificação de `buscarFotosEntrega` (tabela `entregas_venda_fotos` + fallback `foto_entrega_path`), mas em **UMA única consulta** (`WHERE ev.id = ANY(...)`) para todas as corridas do relatório, evitando 1 query por linha. As fotos voltam como **link** via `getPublicUrl("pagamento-fotos", path)` (proxy autenticado `/api/storage/pagamento-fotos/...`) — a imagem NUNCA é embutida (base64) na resposta, para o relatório não ficar pesado.

### 12.4. Acesso

Mesma lista de papéis que já paga o motoboy hoje (`motoboy/pagar`, `motoboy/pagamentos`): `desenvolvedor`, `admin`, `gerente_loja`. Quem confirma o pagamento em lote é quem também confere o relatório que justifica o valor — lista idêntica, não duplicada em um lugar novo.

### 12.6. Decisão editável e conexão com o pagamento em lote existente (21/07/2026)

**Investigado ANTES de criar qualquer persistência nova**: o pagamento do motoboy JÁ TEM um mecanismo de "marcar como pago em lote" — `POST /api/entregas-venda/motoboy/pagar` (usado por `PagamentoMotoboyPainel.tsx`), que recebe `motoboy_id` + `entrega_ids[]`, valida que cada entrega é `confirmada`, pertence ao motoboy e **ainda não foi paga** (`NOT EXISTS ... pagamentos_motoboy_itens`), e grava em `pagamentos_motoboy` + `pagamentos_motoboy_itens` (mais a conta a pagar correspondente) — a UNIQUE de fato existente impede pagar a mesma entrega 2x.

Decisão: **o relatório NÃO ganhou persistência nova**. Ele é a etapa de CONFERÊNCIA antes do lote:

- Cada corrida do relatório tem uma **decisão FINAL editável** (toggle "Pagar"/"Não pagar" por linha, em `RelatorioPagamentoMotoboy.tsx`), inicializada pela sugestão (`decisaoInicialFinanceiro` — só "pagar" começa marcado "pagar"; "revisar" e "nao_pagar" começam "não pagar", postura conservadora que exige ação ativa do financeiro para incluir algo suspeito).
- Esse ajuste é **EFÊMERO** — vive só no estado React do componente (`decisoes`), não é gravado em nenhuma tabela/coluna nova. Se a página for recarregada antes de confirmar, o ajuste se perde e o financeiro reveria do zero.
- O "Total a pagar" do rodapé reflete a decisão FINAL ajustada (`calcularTotalAjustado`), não a sugestão bruta (`calcularTotalPagar`, que a rota ainda expõe em `total_pagar` só como referência informativa).
- **Persistência de verdade**: o botão "Confirmar pagamento de N corrida(s)" chama a MESMA rota `POST /api/entregas-venda/motoboy/pagar` já existente, mandando `entrega_ids` = as corridas com decisão final "pagar" e ainda não pagas (`foi_pago=false`). É essa chamada — não um mecanismo novo — que grava o pagamento. Depois do sucesso, o relatório é RE-BUSCADO (não atualizado otimisticamente) para refletir `foi_pago=true` vindo do banco (fonte da verdade).
- `foi_pago` (novo campo por corrida, mesmo critério EXISTS já usado em `motoboy/minhas`) marca corridas já liquidadas num lote anterior — elas aparecem no relatório para auditoria (histórico completo do período), mas SEM toggle editável (badge "Já paga") e excluídas de qualquer soma de "falta pagar".
- **Por que não criar uma tabela/coluna de "decisão do financeiro por corrida"**: duplicaria o que `pagamentos_motoboy_itens` já resolve (pago ou não pago). Uma decisão "vou pagar essa" que ainda não virou pagamento não é um fato que precise sobreviver a um reload — o financeiro que fechar o relatório em uma sessão só e confirmar no final.

⚠️ **Se o Jonathan preferir persistir o rascunho de decisão** (ex.: financeiro reviu 40 corridas ao longo do dia, quer continuar depois sem perder o que já decidiu) isso exigiria uma tabela nova (ex.: `relatorio_pagamento_motoboy_decisoes`) — **não implementado nesta sessão**, decisão explicitamente reservada ao Jonathan.

### 12.7. Referência (§12)

- Lib de regra pura: `src/lib/relatorio-pagamento-motoboy.ts` (`MARCO_RELATORIO_PAGAMENTO_MOTOBOY`, `periodoAntesDoMarco`, `classificarCorridaMotoboy`, `decisaoInicialFinanceiro`, `calcularTotalPagar`, `calcularTotalAjustado`).
- Lib de fotos em lote: `src/lib/entrega-venda.ts` (`buscarFotosEntregaEmLote`, novo, ao lado de `buscarFotosEntrega`).
- Rota do relatório: `src/app/api/entregas-venda/motoboy/relatorio-pagamento/route.ts` (`GET`, query `entregadorId`/`inicio`/`fim`, expõe `foi_pago` por corrida).
- Rota de pagamento (JÁ EXISTIA, reusada sem alteração): `src/app/api/entregas-venda/motoboy/pagar/route.ts` (`POST`).
- Front: `src/components/entregas/RelatorioPagamentoMotoboy.tsx` (NOVO — subcomponente próprio, não inchou `PagamentoMotoboyPainel.tsx`; toggle por linha + botão "Confirmar pagamento"), renderizado dentro da aba "Pagamento do motoboy" em `EntregasVendaClient.tsx`, logo abaixo do painel de pagamento em lote.
- Testes: `src/__tests__/relatorio-pagamento-motoboy.test.ts` (classificação pura — Pagar/Revisar/Não pagar com duplicidade como Revisar, `decisaoInicialFinanceiro`, `calcularTotalPagar` excluindo já pagas, `calcularTotalAjustado`); `src/__tests__/motoboy-relatorio-pagamento-route.test.ts` (gate de papel, marco 20/07 bloqueando 400, lista vazia não quebra, classificação fim-a-fim com SQL mockado incluindo `foi_pago`, prova de que fotos é 1 única query em lote).
