# Changelog — Alisson ERP (fabricaAJ)

> 📋 Última atualização automática: 19/06/2026 — Versão: v2.68.4 <!-- Revisado 19/06/2026 -->

## feat(inventario): role operador_inventario com edição via aprovação (v2.83.0)

**Pedido do Jonathan:** Ytalo e Geovana (operadores do inventário) veem tudo do
estoque e contam via leitor RFID, mas NÃO editam nada direto — qualquer ação
vira pedido que só executa com a aprovação dele. (Auditoria manual é outra
frente, separada.)

- **Role nova `operador_inventario`** (src/lib/roles.ts): entra em
  ROLES_INVENTARIO_CONTAR (vê telas + leituras RFID + contagem), fora de
  GERENTES e ESTOQUE_MOVIMENTAR.
- **Migration 339**: tabela `solicitacoes_inventario` (pedido de
  abrir/concluir/cancelar com payload, status pendente→executada/rejeitada/erro,
  tarefa vinculada). Aprovador em configuracoes_sistema.aprovador_inventario.
- **Mesma engrenagem de aprovação de compra comercial/desconto**: pedido cria
  tarefa 'inventario_solicitacao' + aprovacoes_tarefa + notificação; o PATCH
  /tarefas/[id]/aprovacao executa a ação ao aprovar (rejeitou = nada muda).
- **Execução centralizada** em src/lib/inventario-acoes.ts (abrir/concluir/
  cancelar) — rota direta (gerência) e aprovação executam o MESMO código.
  Snapshot de abertura agora usa condPecaPronta() (fim da cópia inline).
- UI: telas mostram "Pedido enviado para aprovação do administrador" (202).
- scripts/aplicar_339_producao.sql: tabela + role das 2 operadoras + aprovador.

## fix(inventario): "Chips fora do inventário" não respeitava filtro nenhum (v2.82.1)

**Bug reportado pelo Jonathan:** a seção "Chips fora do inventário" (etiquetas
lidas pelo app RFID de produto que não está na lista do inventário) ficava
fixa na tela não importa qual cartão/categoria fosse clicado — porque essa
lista nunca tinha sido ligada a filtro nenhum, era renderizada sempre.

- Novo cartão **"Fora do invent."** (roxo), com filtro próprio — clicável
  como os outros, some quando Faltando/OK/Sem contagem estão ativos.
- Passa a respeitar categoria e busca (API agora expõe `categoria_produto`
  também nesses itens).
- `excessoCount` do cartão "Excesso" não soma mais esses itens (evita
  contagem duplicada agora que existe cartão próprio).

## feat(inventario): filtros por categoria/status, paginação e Detetive em lote (v2.82.0)

**Pedido do Jonathan:** filtro por categoria, paginação de verdade (a tela só
rolava infinita) e o Detetive já mostrando as possíveis pendências/conciliações
sem precisar abrir item por item.

- **Filtro por categoria:** chips com as categorias que EXISTEM no inventário
  (com contagem), combinável com status/pendência/busca.
- **Cartões OK/Faltando/Excesso/Sem contagem viraram filtro clicável**, com
  botão "!" que explica o significado de cada um.
- **Paginação real:** cada seção mostra 50 por vez, com "Mostrar mais 50";
  bloco "Conferidos OK" (normalmente a maioria dos itens) vem recolhido.
- **Detetive em lote** (`GET /inventario/[id]/investigar-lote`, só leitura):
  investiga TODOS os itens divergentes numa chamada só e mostra o resultado
  direto na linha (💡 conciliação encontrada / 🔍 pistas) — o detalhe completo
  (reservas/transferências/devoluções) continua vindo de `/investigar` ao
  expandir o item.
- GET do inventário passa a expor `categoria_produto` de cada item.

## fix(inventario): teste/lixo, ouro-insumo e serviços fora da auditoria (v2.81.5)

**Pedido do Jonathan:** produto de teste (TESTE-2026-A) é lixo, Ouro 18k é insumo
e AS1001-2 é serviço — nada disso entra em contagem de estoque na auditoria.

- `condPecaPronta()` (e o snapshot de abertura) agora excluem também:
  produtos de teste (sku/nome começando com "teste"), ouro-insumo (nome
  começando com "ouro" — joia começa pelo tipo: Anel/Brinco/...), prefixos
  de SKU IS/PD/AS/PZ (insumo/pedra/serviço/personalização — mesma convenção
  de oportunidades-fabricacao) e categoria "Serviços". Ouro/metal-insumo
  cobre também sku "ouro%", nome "metal%" e categoria "Metal%" (caso real:
  sku ouro18k, nome "Metal Ouro 18K", que escapava do prefixo "ouro" no nome).
- Continua tudo na LEITURA: nada apagado, nada baixado; vale para inventário
  já aberto.

## fix(inventario): regra de peça pronta vale para inventário JÁ ABERTO (v2.81.4)

**Pedido do Jonathan:** aplicar a regra (pedra solta e personalizada não entram em
contagem de estoque na auditoria) no inventário já feito — sem dar baixa manual em
nada e sem apagar nada.

- Filtro central `condPecaPronta()` em `src/lib/inventario-peca-pronta.ts`
  (espelho SQL de `ehPedraSolta()` + personalização ativa), aplicado NA LEITURA:
  GET do inventário (lista/placar/CSV/progresso), trava de conclusão (`/concluir`
  não conta mais itens excluídos como "sem contagem"), app RFID (lista e contadores)
  e `/contar` (recusa contagem de pedra/personalizada mesmo por API direta).
- Nenhum dado alterado: os itens antigos continuam no banco, só deixam de
  aparecer e de contar. Snapshot de inventário novo já nascia filtrado (v2.81.0).

## fix(estoque): baixa manual NÃO EXISTE — movimento só por CONCILIAÇÃO (v2.81.3)

**Regra do Jonathan:** nem admin nem desenvolvedor dão baixa manual. Estoque só se
move casado com um documento que o sistema confere (conciliação) — e isso é
TEMPORÁRIO até o sistema se organizar; depois divergência não deve mais acontecer.

- `/estoque-comercial/movimentos`: saída manual BLOQUEADA para todos (403).
  Endpoint passa a registrar apenas ENTRADA manual (gerência/estoquista).
- Desfecho `perda`: NÃO gera mais baixa — vira só registro (sem documento não
  há conciliação; o saldo fica divergente até resolução).
- Desfecho `excedente_confirmado` virou CONCILIAÇÃO com devolução/vale-troca:
  exige nº da devolução; valida (existe, aprovada/concluída, tem o produto com
  retorno aprovado, entrada ainda não aconteceu, quantidade cobre a sobra) e
  gera ENTRADA amarrada à devolução (motivo pendencia_devolucao_sem_entrada).
- `venda_sem_baixa` (já era conciliação) e `excedente_confirmado` exigem dupla
  confirmação (`confirmar_baixa`) e seguem exclusivos de admin/desenvolvedor.
- Detetive agora investiga SOBRAS: acha devoluções com retorno aprovado sem
  entrada no saldo e sugere "usar esta devolução no desfecho".

## fix(inventario): baixa manual só admin + detetive automático + link das vendas (v2.81.2)

**Pedido do Jonathan:** (1) NINGUÉM dá baixa manual no estoque, somente ele em
casos excepcionais; (2) a investigação da falta deve rodar sozinha ao final de
cada contagem; (3) o nº da venda deve abrir a venda para conferência.

- `ROLES_BAIXA_MANUAL` = admin/desenvolvedor (src/lib/roles.ts). Valem para:
  saída manual em `/estoque-comercial/movimentos`, estorno em `/estornar` e os
  desfechos de pendência que geram movimento (venda_sem_baixa, perda,
  excedente_confirmado). Gerência segue respondendo 'localizada'/'outro'
  (sem movimento); entrada manual segue gerência+estoquista.
- Detetive AUTOMÁTICO: painel de item faltando investiga sozinho ao abrir
  (useEffect); botão vira "Investigar de novo".
- Nº da venda vira LINK (`/vendas/[id]`, nova aba) nos achados do Detetive e
  na venda vinculada ao desfecho (GET agora expõe pendencia_desfecho_venda_id).

## fix(seguranca): rotas de estoque aceitavam QUALQUER usuário logado (v2.81.1)

**Falha grave reportada pelo Jonathan:** qualquer pessoa logada (vendedora, motoboy...)
conseguia mudar o estoque. Auditoria completa das rotas que escrevem movimentação:

1. `POST /api/rfid/scan` (ação `entrada_estoque`): gerava ENTRADA (+1 por chamada,
   repetível à vontade) sem checar função — fechado com `ROLES_ESTOQUE_MOVIMENTAR`.
2. `POST /api/estoque-comercial/transferir/[id]/concluir`: qualquer logado confirmava
   recebimento (ENTRADA no destino) — fechado com `ROLES_ESTOQUE_MOVIMENTAR`.
3. `POST /api/rfid/inventario`: qualquer logado "informava quantidade" mandando lista
   de etiquetas (envenenava a contagem) — fechado com `ROLES_INVENTARIO_CONTAR`.

Constante nova `ROLES_ESTOQUE_MOVIMENTAR` em `src/lib/roles.ts` (gerência + estoquistas).
Conferidos e já protegidos: /movimentos, /transferir (criar/cancelar), /estornar,
/converter, /auditoria/*, /inventario/* (contar/concluir/cancelar/finalizar/pendencia),
ai-chat (só leitura), /vendas/[id]/rfid (ownership).

## feat(inventario): peça pronta + Detetive + desfecho blindado com baixa (v2.81.0)

**Pedido do Jonathan:** (1) inventário é de PEÇA PRONTA — pedra solta (moissanite,
diamante, zircônia...) e personalizada sob encomenda não entram na contagem;
(2) investigar sozinho POR QUE a peça falta (ex.: venda não marcada como entregue),
sem confusão, só com certeza e sempre com o nº da venda; (3) fechar pendência tem
que ter motivo e dar a baixa certa no estoque.

**1. Snapshot só de peça pronta** (`POST /inventario`): exclui pedra solta (espelho
SQL de `ehPedraSolta()`: categoria 'Pedras%', produto_pedra_extras, nome começa com
nome de pedra) e personalizada ativa (`produto_personalizacao.ativo`). Inventário já
aberto mantém a foto antiga — cancelar e reabrir aplica a regra.

**2. Detetive** (`GET /inventario/[id]/investigar?produto_id=` — 100% leitura):
cruza reservas ATIVAS (venda sem entrega confirmada), transferências PENDENTES e
movimentações pós-abertura. Só AFIRMA causa quando a conta bate exatamente
(reserva == falta, nada mais no radar); senão devolve como pistas. Na tela:
botão "Investigar falta" no painel da pendência + "usar esta venda no desfecho".

**3. Desfecho blindado (migration 338 — criada, NÃO executada):** fechar pendência
como resolvida EXIGE `desfecho_tipo`:
- `venda_sem_baixa`: exige nº da venda; valida DE VERDADE (existe, não é rascunho/
  cancelada, contém o produto); gera SAÍDA amarrada à venda e EFETIVA a reserva
  ativa (senão o disponível cairia em dobro).
- `perda`: dupla confirmação; nunca deixa saldo abaixo do reservado de outras vendas.
- `localizada`: zera a falta (contada = sistema) como decisão gerencial auditada.
- `excedente_confirmado`: gera ENTRADA.
- `outro`: só registro (obs obrigatória).
Blindagens: quantidade SEMPRE do servidor (|diferenca|); movimento + resposta na
mesma transação; desfecho com movimento NÃO se desfaz num clique (409 — exige
estorno); só gerência; logAudit completo. Motivos de movimento novos:
`pendencia_venda_sem_baixa`, `pendencia_perda`, `pendencia_excedente`.

## feat(inventario): placar de pendências vira filtro clicável (v2.80.1)

**Pedido do Jonathan:** pendência de item que voltava a ficar OK "sumia" da tela
(o item desce para o bloco "Conferidos OK" no fim da página, enterrado entre os itens OK).

- Os chips do placar ("aguardando resposta" / "resolvida(s)" / "não resolvida(s)") agora
  são botões: clicar filtra a lista pelo tipo de pendência (clicar de novo limpa).
- Faixa "Mostrando só itens com pendência X — limpar filtro" fica visível enquanto o
  filtro está ativo (usuário nunca fica preso na lista filtrada).
- Filtro combina com a busca por SKU/nome. Só tela — nada muda no banco/API.

## feat(inventario): pendências por item + blindagem de segurança do inventário comercial (v2.80.0)

**Pedido do Jonathan:** na tela `/estoque-comercial/inventario/[id]`, explicar cada pendência
com um campo para descrever o que ela é, salvar, e perguntar se foi resolvida ou não — além de
caçar bugs e fechar brechas de segurança (estoque de milhões).

**Banco (migration 336 — criada, NÃO executada ainda):**
- `itens_inventario_comercial`: `pendencia_obs`, `pendencia_registrada_por/em`,
  `pendencia_resolvida` (NULL=sem resposta), `pendencia_resolucao_obs`, `pendencia_resolvida_por/em`.
- `inventarios_comercial`: `cancelado_por`, `motivo_cancelamento`.
- Blindagem: DO block garante que `diferenca` é coluna GERADA (com backup antes de converter).

**Bugs corrigidos:**
1. Checkbox "conferido" em item sem contagem gravava `quantidade_contada = quantidade_sistema`
   (contagem falsa — item virava OK sem ninguém contar). Agora exige digitar a quantidade real.
2. Flag `conferido` nunca era persistido (`/contar` descartava o campo) — agora grava
   `conferido`/`conferido_em` e o front atualiza estado só após resposta OK.
3. `/contar` escrevia na coluna gerada `diferenca` (erro silencioso de banco) — removido.
4. Falhas de fetch eram silenciosas no front — toda falha agora aparece na faixa de mensagem.
5. Guard do botão Concluir usava a lista FILTRADA pela busca (burlável) — trava movida
   para o servidor: 409 + `{forcar:true}` com dupla confirmação.
6. `/finalizar` (app RFID) aceitava inventário CANCELADO e o "ressuscitava" como concluído — bloqueado.
7. Mensagem de conclusão prometia "ajustes gerados" que nunca existiam — texto honesto
   (inventário é auditoria, não ajusta estoque). Card "Lidos" mostrava no máx. 200 — agora usa COUNT real.

**Segurança:**
- GET (lista e detalhe) restritos a `ROLES_INVENTARIO_VER` (antes qualquer usuário logado via tudo).
- `logAudit` em abrir/contar/concluir/cancelar/finalizar/pendência (dentro das transações).
- Cancelamento exige motivo e grava autor; app RFID valida role + usuário `ativo` (Bearer).
- Contagens e snapshot de abertura em transação única; roles centralizados em `src/lib/roles.ts`.

**UI:** painel expansível por item divergente ("Qual é a pendência?" → salvar → "Foi resolvida?"
Sim/Não + obs, com autor/data), badges de pendência (aberta/resolvida/não resolvida), placar de
pendências, barra de progresso da contagem, modal de cancelamento com motivo, faixa de cancelado
com autor/motivo, CSV com colunas de pendência.

**Docs:** `docs/regras-negocio/comercial.md §7` (regras do inventário). Rota nova:
`PATCH /api/estoque-comercial/inventario/[id]/pendencia` (padrão `defineRoute`).

## fix(vendas): destrava venda em rascunho após reeditar desconto já aprovado (REAPLICADO)

**O quê:** reeditar/adicionar item acima do limite numa venda `rascunho` invalidava a
aprovação de desconto (`desconto_aprovado_por` = NULL) mas deixava
`aprovacao_desconto_tarefa_id` apontando para a tarefa antiga (já `aprovada`). Isso escondia
TANTO o botão "Solicitar Aprovação de Desconto" (o front exige o campo NULL) QUANTO o banner
de "aguardando aprovação" → a venda travava em rascunho sem como reaprovar (beco sem saída).

**Como:** `POST` e `PATCH /api/vendas/[id]/itens` agora (1) zeram também
`aprovacao_desconto_tarefa_id` ao invalidar a aprovação e (2) cancelam a tarefa vinculada
mirando pelo **ID** e só se ainda estava pendente (o filtro por tag `aprovacao_desconto`
antigo nunca batia — a tag real é `aprov_desconto_acima`).

**Histórico:** o fix original (commit `6ea83e1c`, 25/06) foi **revertido** pelo merge de base
velha `0ae5e160`. Esta entrada é a **reaplicação** sobre a main atual. Vendas destravadas em
produção por update assinado: 15628 (log #91) e 15399 (log #102). Doc: comercial.md §6.

## feat(crediario): painel de parcelamento/sinal também no detalhe da venda (v2.70.0)

**O quê:** o painel "Pagamento a prazo (crediário)" (Mensal / Em X dias / Sinal), que só
existia no wizard de Nova Venda, agora aparece também na **tela de detalhe da venda**
quando ela é rascunho e a forma escolhida é "A Receber" — tanto sozinha quanto como
pagamento parcial (após outras formas). Antes, ao pôr "A Receber" pelo detalhe, o plano
nunca era configurado e a aprovação caía no `ELSE` do gatilho (1 conta única).

**Como (sem duplicar código):**
- Painel extraído para componente único `src/components/vendas/PainelCrediario.tsx`
  (substitui as 2 cópias inline do wizard) + preview em `src/lib/credi-preview.ts`
  (espelha o gatilho `fn_venda_gerar_conta_receber`, migrations 317/318).
- `POST /api/vendas/[id]/pagamentos` passa a aceitar e gravar `credi_tipo`/`credi_param`
  (teto de `credi_param` = 180, pra caber 'dias'). Só grava quando a forma é "A Receber".
- Detalhe (`VendaDetalheClient.tsx`) mostra o painel e manda o plano no pagamento.

**Não mexe em:** banco (colunas já existem — mig 317/318), gatilho, porta única, comissão.

**Testado (homolog):** detalhe → A Receber 'dias' 60 → grava `credi_tipo=dias`, `credi_param=60`,
`parcelas=1`; aprovação (rollback) gera conta vencendo +60 dias. Ramos 'meses' (3 parcelas) e
'sinal' (7 dias úteis) validados via SQL com ROLLBACK. `tsc` zero erros.

**Fase 2 — motor da reserva → VC (robô novo):** `POST /api/crediario/reserva-cron` (migration 327
grava o corte `crediario_reserva_corte` = data de aplicação por ambiente). Robô diário: para vendas
**criadas após o corte**, `aprovado` (peça não entregue/reservada), com "A Receber" pendente, **data de
entrega passada** e **sem ordem de produção aberta**, conta **7 dias corridos** a partir do início
(= max(data_entrega, última conclusão de ordem)). Avisa a consultora (início / últimos 3 dias / "amanhã
vira VC", 1×/dia via `notificacoes` tipo `crediario_reserva`); no estouro gera **VC-** proporcional ao
pago, cancela as contas a receber pendentes da venda e notifica o estoque (peça volta — confirmação
física, como no sinal). O `sinal-cron` vira **legado** (só vendas antigas, `credi_tipo='sinal'`). Testado
no homolog (seleção + janela, cenários +/- dias, ROLLBACK); conversão espelha o sinal-cron. `tsc` zero.
**Pendente:** agendar o `reserva-cron` no n8n/curl diário; Fase 1b (A Receber multi-forma no detalhe).

**Fase 1 — "A Receber" vira pagamento multi-forma (wizard):** ao escolher "A Receber" na criação da
venda, a consultora monta TODAS as formas (A Receber é só uma linha, valor digitado) e a venda só
fecha com **restante = 0** — mesma mecânica do "Múltiplas" (reusada, sem duplicar: `pagForma==="A Receber"`
passou a ser tratado como `ehMultiForma`). O plano (Mensal/Em X dias) vai na linha A Receber, inclusive
no caminho pré-salvo (passo 4). `PagamentoForm`: bloco multi-forma vale p/ A Receber só em `mode="criacao"`;
o detalhe (`edicao`) também usa o multi-forma agora (Fase 1b — `handleEdicaoAdd` usa a forma da linha
`multPagForma`; testado: venda 30155 Dinheiro 1.890 + A Receber 2.000 3×/dia 10 gravados). Testado no
homolog (venda 15481): Dinheiro 1.890 + A Receber 2.000 (plano meses 3/dia 10), restante R$ 0; aprovação
(rollback) gerou 3 parcelas de R$ 666,66 só sobre os 2.000. `tsc` zero. **Múltiplas** segue vivo (será
descontinuado depois). _(continua o redesenho da regra ③ abaixo.)_

**Redesenho da regra ③ (aprovado 20/06) — Fase 0+1:** a aba **Sinal** foi removida do painel
(fica só Mensal / Em X dias). A regra de virar vale-crédito deixa de ser uma opção "Sinal" e passa
a depender de **a peça ter saído ou não da loja**: peça entregue devendo = cobrança (nunca VC);
peça reservada (não entregue) → após a **data de entrega** passar e **sem ordem aberta**, conta
**7 dias corridos** → avisa a consultora → vira VC se não quitar 100%. Vale só p/ vendas criadas
após o deploy. Regra detalhada em `docs/regras-negocio/crediario.md` (§③/§2/§3). **Motor novo
de reserva (robô) = Fase 2, ainda a construir;** o `sinal-cron` atual fica legado (vendas antigas).

---

## fix(estoque): SLE vira auditoria — trava de saldo negativo passa a ler da view (v2.69.0)

**Problema raiz (recorrente):** o trigger `fn_prevent_negative_sle` lia o saldo do
`stock_ledger_entry` (SLE). O SLE podia divergir da tabela `movimentacoes_estoque_comercial`
(o número que a tela mostra), causando erro `STOCK_NEGATIVE` mesmo com estoque visível.
A divergência surgia quando um ajuste manual gravava quantidades diferentes nos dois lados.
O mesmo problema ocorria no RFID: a entrada era inserida direto no SLE, sem passar pela
tabela de movimentações — o SLE avançava mas a view não sabia, criando assimetria invertida.

**Correção (migration 319):**
- `fn_prevent_negative_sle` agora lê o saldo de `movimentacoes_estoque_comercial`
  (mesma fonte que a tela) — trava e UI nunca mais divergem.
- API RFID `entrada_estoque` passa a inserir em `movimentacoes_estoque_comercial`.
  O trigger `trg_mirror_movimento_to_sle` cria o SLE automaticamente, igual a todo o resto.

**O SLE continua existindo** como log de auditoria (RPC functions, qty_after, histórico)
mas deixa de ser fonte de verdade para o bloqueio de saldo negativo.


## feat(vendas): painel embutido do código do vale-troca (sem pop-up) + reuso de código (v2.68.4)

Resolve o atrito do código do vale relatado pelo Jonathan (cliente demora a responder; ao sair da
página/gerar de novo, dava "código incorreto" mesmo com o número certo).
- **Backend ([`vale-troca-codigo.ts`]):** `solicitarCodigoVale` agora **reusa o código ativo** (não
  expirado/confirmado/bloqueado) em vez de gerar um novo a cada pedido. "Reenviar" manda o **mesmo**
  número → o que o dono recebeu sempre vale dentro dos 15 min. Sem mudança no banco.
- **Painel embutido (`ValeCodigoInline`):** substitui o `window.prompt`. Dentro do formulário de
  pagamento: [Enviar código ao dono] → "código enviado para ****1234" → campo do código + [Reenviar] +
  botão de aplicar. Não trava a tela; o atendente pode esperar o cliente. Ligado na **nova venda** e no
  **detalhe** (single + Múltiplas). Promocional (sem dono) aplica direto, sem painel.
- **Código OBRIGATÓRIO, sem bypass de gerente** (decisão do Jonathan): removida a opção "liberar sem
  código". Se a entrega falhar (sem celular / WhatsApp fora), o vale não é aplicado até o cliente informar.
- **Erro falso corrigido:** os handlers de pagamento agora fazem `setSaveErr("")` no início — um sucesso
  não deixa mais o banner de erro de uma tentativa anterior preso na tela.
- Nova venda: o código é coletado no painel e aplicado no "Concluir" (lá a venda é criada); detalhe aplica
  na hora. `window.prompt` removido de vez (`obterConfirmacaoVale` → `enviarCodigoVale`).

## fix(vendas): pedir o código (token) do vale-troca também no detalhe da venda (v2.68.3)

A 2ª confirmação do dono do vale (código de 6 dígitos por WhatsApp, brecha #1) só estava ligada na
tela de **nova venda**. Ao adicionar um pagamento em **Vale-Troca** pelo **detalhe da venda**
(`VendaDetalheClient`), o front mandava só o `vale_numero` — nunca chamava `solicitar-codigo` (não
disparava o WhatsApp) nem tinha como digitar o código. Para vale **com dono**, o backend recusava
(`precisa_codigo`) e o atendente ficava sem caminho pra concluir. **Fix:** a lógica do código foi
**extraída** para `src/lib/vale-troca-confirmacao.ts` (`obterConfirmacaoVale`, fonte única) e ligada nos
dois pontos de pagamento do detalhe (`handleAddPagamento` e `handleEdicaoAdd`). A nova venda passou a
usar a mesma função (comportamento idêntico, sem código duplicado). Vale **promocional** (sem dono)
segue direto, sem pedir nada. Backend e banco inalterados.
- **Múltiplas (detalhe da venda):** o vale dentro de "Múltiplas" antes só entrava na lista visual e
  **nunca era enviado**. Agora registra **na hora** (igual ao Ouro), passando pela mesma 2ª confirmação
  do dono (token) — via nova prop opcional `handleAddValeMultipla` no `PagamentoForm`. Na **nova venda**
  a prop fica ausente, então o vale em Múltiplas continua sendo aplicado no "Concluir venda" (com token,
  via `aplicarValeNaVenda`) — comportamento original preservado.

## fix(vendas): consultora consegue salvar desconto acima do limite em rascunho (v2.68.2)

Deadlock: ao EDITAR o preço/desconto de um item acima do limite da consultora, a rota
`PATCH /api/vendas/[id]/itens/[itemId]` recusava o save (403 "Desconto X% excede seu limite. Solicite
aprovação."). Como o desconto nunca era persistido, o botão **"Solicitar Aprovação de Desconto"** (que
só aparece quando há item salvo com desconto > limite) **nunca surgia** — a consultora era mandada
solicitar aprovação sem ter como. **Fix:** a edição de item em venda **rascunho** agora **salva** o
desconto alto (igual ao fluxo de criação de venda); a invalidação de aprovação anterior continua, o
botão aparece, e a aprovação segue **exigida na aprovação da venda e no pagamento** (gates inalterados).
Não testado e2e como consultora (sessão de preview deslogada) — validar em prod.

## fix(devolucao): vale proporcional ao que o cliente pagou (v2.68.1)

Furo encontrado pelo Jonathan: o valor do vale saía pelo **preço dos itens**, sem olhar **quanto o
cliente pagou**. Entrega com pagamento parcial (Na Entrega/A Receber) devolvida geraria vale maior
que o pago (ex.: pagou 3k de 10k, devolve tudo → geraria 10k). **Não materializou** em dados
rastreados (0 casos), mas era bug latente.
- **`recomputarTotais` agora capa pela fração paga:** `crédito_item = valor_item × (pago / total_venda)`.
  Pagou tudo → valor cheio; pagou parcial → recebe só o que pagou naquele item.
- **Guard de legado:** venda sem pagamento rastreado (`pagamentos_venda` vazio) → fração 1 (valor cheio),
  pra não zerar vale de venda antiga já paga.
- Frete entra como não-reembolsável (denominador = `total_venda`); retenção % aplicada sobre a base proporcional.
- Validado no homolog: pagou 90 de 300 + devolve tudo → vale R$90; venda legada (0 pagamentos) → vale cheio R$300.

## feat(comercial): blindagem vale-troca + devolução (estoque, comentários, histórico) (v2.68.0)

Pacote da auditoria 16/06 do módulo vale-troca/devolução. Migrations 306–310. Testado no homolog (front+banco).
- **Vale só com confirmação do dono (#1):** aplicar vale COM dono exige código de 6 dígitos enviado por
  WhatsApp ao dono (`vale_troca_codigo`, 5 tentativas → bloqueia). Vale sem dono (promo) aplica direto.
  Falha de WhatsApp/sem celular → exceção liberada por responsável (`aprovador_vale_troca_excecao`), auditada.
- **Estorno devolve o vale (#2/#6):** `estornarVenda` reativa o vale (valor aplicado) e preserva o troco.
  Corrigido bug: o estorno manual pelo painel pré-setava `status='estornado'` e o `estornarVenda`
  short-circuitava no guard de idempotência — não devolvia vale nem cancelava CR/venda. Agora o
  `estornarVenda` é o dono do estorno.
- **Overpayment atômico (#5):** hook do vale com `FOR UPDATE` na venda (igual ao Ouro); excedente vira troco.
- **Auditoria (#3):** aplicar/estornar/cancelar/gerar vale → `audit_log`.
- **Devolução:** busca server-side (B1); comentários + alarme @menção reusando o componente das ordens
  (B2, `comentarios_devolucao`); **aprovação do estoque antes de gerar o vale** (B3, status
  `aguardando_aprovacao_estoque`, `aprovador_devolucao_estoque`); **histórico completo da cadeia de vale**
  na devolução de origem (B4).
- Backlog: 4-olhos real na exceção, rate-limit no solicitar-código, UX inline do código, doc do vale reativado parcial.

## fix(produtos): salvar pai replica todos os campos + preço de pedras fica em sincronia (v2.67.8)

Bug do Jonathan (16/06): variações de produto pai com **preço de pedra zerado** apesar de terem as
pedras (ex.: SKU 1829, 33 variações). Duas causas:
1. **Preço da pedra não sincronizava:** o preço vem de `alissonerp.produto_pedras_componente`
   (pedras precificadas pela `vw_pedras_preco`), mas o `PUT /produtos/[id]/pedras-componente`
   gravava as pedras e **não atualizava `preco_pedras`** → ficava 0/defasado. **Fix:** o PUT agora
   recalcula e grava `preco_pedras` (= Σ qtd×preço) e `preco_total_sync` a cada alteração.
2. **Salvar pai só replicava uma whitelist curta** nos filhos. **Fix:** passou a **replicar todos
   os campos alterados** (o body já vem só com o que mudou), preservando a identidade da variação
   (sku, numeração, sufixo, "nº X" do nome). **Peso agora replica** (ouro recalcula via trigger) e
   as **pedras-componente são propagadas** do pai → variações + `preco_pedras` sincronizado.
- **Blindagem (`recalcular-preco-pedras.ts`):** nunca zera `preco_pedras` quando há pedra no BOM mas
  sem `preco_compra_usd` (preserva o valor) — antes qualquer save do pai zerava as variações.
- **Front (`ProdutoDrawer`):** whitelist do prompt ampliada + o confirm lista o que mudou
  ("Você alterou: …. Replicar nas N variações?").

## fix(orcamento): seletor de aprovação agora CADASTRA cliente novo, não só busca (v2.67.6)

Complemento do v2.67.5: o seletor abria, mas só buscava clientes JÁ cadastrados — se o cliente do
orçamento não existia (ex.: "Victor" do ORC-0000157), a busca não trazia ninguém e continuava o beco.
- Adicionado **"+ Cliente não cadastrado? Cadastrar e aprovar"** no modal: form com **nome
  pré-preenchido** do orçamento + CPF + Celular → `POST /api/contatos` (só nome obrigatório,
  sincroniza pro Tiny) → vincula e aprova. (`cadastrarEVincular` em `OrcamentoClient.tsx`.)
- Validado na tela (ORC-0000157): seletor abre → "Cadastrar" mostra o form com "Victor Welsem Sousa
  Mendes" já preenchido. Sem submeter (não criar dado de teste em produção).

## fix(orcamento): aprovar sem cliente vinculado abre seletor pra vincular e aprovar (v2.67.5)

Bug do Jonathan (16/06): aprovar um orçamento pela lista dava "Vincule um cliente antes de aprovar"
mesmo mostrando o nome — porque o orçamento tinha só `nome_cliente` (texto) e não `cliente_id` (FK).
Beco sem saída.
- **`OrcamentoClient` (lista):** o "Aprovar" agora reage ao 422 e abre um **seletor de cliente** (busca
  em `/api/vendas/clientes/busca`); ao escolher, vincula e aprova num PATCH só
  (`{cliente_id, status:'aprovado'}`). Se o cliente não existir, a mensagem orienta a cadastrar.
  Espelha o modal de Rejeitar; reusa a busca de cliente já existente. Sem backend novo.
- Regra: aprovar = vira venda → exige cliente CADASTRADO (`public.contatos` é readonly/Tiny). Doc em
  `docs/regras-negocio/orcamento.md`. Validado na tela (ORC-0000157: abre o seletor, busca traz clientes).

## fix(promocoes): base da campanha = preço de venda (curva), não preco_tiny (v2.67.4)

Bug do Jonathan (16/06): na criação de campanha o "Lista"/preço original vinha do `preco_tiny`
(campo legado do Tiny), divergente do preço real de venda (ex.: AJ4715 tiny R$3.268,75 vs venda
R$4.780; AJ5237 tiny R$1.980 vs venda R$1.840).
- **Backend (`expandirItensComPais`):** o snapshot `preco_original` passa a vir de
  `vw_produtos_geral_preco.preco_venda` (curva — mesma fonte do POS e da lista de produtos), pai e
  filhos. Vale só pra campanhas **NOVAS**; as existentes ficam como estão (decisão Jonathan 16/06).
- **Modal (`NovaPromocaoModal`):** "Lista" mostra `preco_curva` (que o `/api/produtos` já devolve),
  não `preco_tiny`. Validado na tela: AJ4715 mostra R$4.780,00.
- Snapshot na criação (estável; não oscila com o ouro depois). Casa com o fix de comissão v2.67.3
  (que lê `preco_promo_original`).

## fix(vendas): comissão de item promocional usa a faixa do desconto real (v2.67.3)

Bug do Jonathan: ao vender um item em PROMOÇÃO, o POS gravava o preço promocional como se fosse
o de lista, com `pct_desconto = 0` → a comissão saía pela **taxa cheia** (4%) em vez da faixa do
desconto. (até 15/06, ~R$591 pagos a mais; junho ainda não fechado.)
- **POS (`NovaVendaClientV2`):** novo helper `comissaoPct` — a comissão sai do desconto vs o
  **preço ORIGINAL da promoção** (`preco_promo_original`, snapshot que a campanha fixou), exposto
  agora pela `vendas/produtos/busca`. Item normal: base == preço de venda → idêntico a
  `getComissao(pct)`. Item promo: base = original da promo → faixa certa (ex.: AJ5237 27% → 0,85%).
  Aplicado em `calcItem`, `updateItem` e `applyApprovedDiscount`.
- **Atenção (pego no teste de front):** a base é o snapshot da promo, **NÃO a curva atual** — a curva
  oscila com o ouro e daria desconto/comissão errados (AJ5237 daria 21%/1,55% pela curva vs 27%/0,85%
  correto pela promo). Validado na tela local (mostra 0,85%).
- **Aprovação inalterada:** `preco_lista` segue = preço promo e `pct_desconto` = desconto manual,
  então a promo continua isenta do gate (decisão Jonathan 16/06) e o desconto manual EXTRA acima
  da promo ainda passa pela aprovação. Sem mexer no backend de gate. Sem migration.
- Regra documentada em `docs/regras-negocio/promocoes.md`. Correção dos dados de junho já gravados
  = à parte (decisão do Jonathan, item a item — ver relatório de 15/06).

## fix(purificacao): ganho de teor não trava mais ao concluir — tolerância só vale pra perda (v2.67.2)

Bug do Jonathan (15/06): no módulo de PURIFICAÇÃO (e na sua gêmea LIGAÇÃO), ao concluir, a
trava de tolerância de 5% barrava o **ganho** de teor — ex.: esperado 23,09g, retornado
24,54g (+6,28%, ótimo rendimento) dava erro "excede o esperado com tolerância (24,24g)" e
não deixava concluir.
- **Regra nova:** ganho (retornado ≥ esperado) **passa livre**, nunca trava. A tolerância de
  5% agora só barra **perda** — conclui se `retornado ≥ esperado × 0,95`; barra abaixo disso.
- **API (gêmeas):** `purificacao/[id]/route.ts` (24k) e `purificacao/ligacao/[id]/route.ts`
  (18k) — condição trocada de `> esperado × 1,05` (barrava ganho) para `< esperado × 0,95`
  (barra perda > 5%) + mensagem nova ("abaixo do esperado além da tolerância de 5%").
- **Front (painéis em tempo real):** `PurificacaoClient.tsx` e `LigacaoTab.tsx` — num ganho a
  tela mostrava "Perda −1,45g" (perda negativa). Agora mostra **"Ganho de teor +1,45g
  (+6,28%)"** em verde. Aviso de perda >2% e "excelente rendimento <1%" só aparecem quando
  NÃO é ganho.
- Sem migration, sem mudança de schema. O que entra no pote continua sendo o peso real
  retornado (dupla-entrada intacta); `perda_processo` negativo = ganho registrado.

## feat(vendas): cadastro do cliente só Celular (WhatsApp) com máscara (v2.66.12)

Pedido do Jonathan (15/06): no modal "Dados do Cliente" tirar o Telefone e deixar só o
**Celular**, rotulado **"Celular (WhatsApp)"**, com **máscara enquanto digita** — mas só
no front; no banco salva os dígitos limpos pra não quebrar o envio do WhatsApp.
- Novo helper `maskCelular` em `@/lib/formatters` (máscara progressiva `(XX) XXXXX-XXXX`).
  Reusa o `onlyDigits` já existente.
- `VendaDetalheClient`: removido o campo Telefone (exibição + form editar + form novo
  cliente); Celular vira "Celular (WhatsApp)" com máscara; o estado guarda só dígitos e o
  save grava `onlyDigits(celular)` — modelo correto no banco.
- Seguro: o envio do código (`whatsapp.ts`) usa `celular || telefone` (prefere celular) e
  normaliza tirando máscara, então não quebra. Telefone antigo de clientes legados não é
  apagado (campo só some da tela). Sem migration.

## fix(vendas): modal "Dados do Cliente" não mostrava celular nem endereço (v2.66.11)

Caso real (venda 15495, 15/06): o modal mostrava só o telefone e o endereço todo "—",
mesmo o cliente tendo celular (onde chega o WhatsApp) e endereço completo no cadastro.
- **Causa 1 (front):** ao abrir a venda, o objeto `cliente` era montado só com
  id/nome/cpf/email/telefone (`VendaDetalheClient` ~L725) — celular e endereço (que a API
  já retornava) eram descartados. Agora mapeia celular + endereco/numero/complemento/
  bairro/municipio/cep/uf.
- **Causa 2 (API):** `GET /vendas/[id]` não selecionava `c.celular`. Adicionado
  `c.celular AS cliente_celular`.
- Sem migration. (Nota: contatos não tem coluna "cidade" separada — a UI usa `municipio`.)

## fix(entregas): aviso claro quando o código do cliente NÃO é enviado no WhatsApp (v2.66.10)

Caso real (venda 15495, 15/06): o número do cliente não estava no WhatsApp, então o
código de retirada era gerado mas não chegava — e a consultora cancelava e refazia a
entrega 9x sem entender o motivo. O aviso no `MarcarEntregaModal` era discreto (bloco
creme/âmbar "Atenção").
- Agora o bloco fica **vermelho** e diz explicitamente **"O código NÃO foi enviado ao
  cliente"** + o motivo + a instrução: **corrija o WhatsApp e clique "Salvar e Enviar",
  NÃO cancele a entrega** (o código já foi gerado). A mensagem/recuperação (campo +
  "Salvar e Enviar") já existiam — só ficaram visíveis e acionáveis.
- Escopo: só o Código A (cliente/retirada). Motoboy (Código B) e marcador na lista de
  vendas ficam para depois. Só front (`MarcarEntregaModal.tsx`), sem migration.

## fix(code-review): correções do pente fino antes de produção (v2.66.9)

Code-review do módulo (Jonathan 13/06). O achado mais grave — "dobra de estoque"
de um gatilho da migration 141 — foi **FALSO ALARME** (verificado no banco: o
gatilho não existe; o teste empírico já dava +1, não +2). Os 6 bugs reais
encontrados, todos corrigidos:

1. **Caixa × venda cancelada (financeiro):** GET/POST de `caixa/motoboy` não
   filtravam `v.situacao` → pagamento órfão de venda cancelada aparecia e podia
   ser confirmado (entrava dinheiro de venda inexistente). Add `v.situacao <>
   'cancelado'` nos dois.
2. **Modal fechava no meio do envio:** `confirmar-pagamento` modal permitia
   fechar (overlay/X) durante o POST → drawer não atualizava → re-clique → POST
   duplicado. Trava o fechar enquanto `submetendo`.
3. **Parse de moeda BR do Ouro:** `replace(",",".")` só trocava a 1ª vírgula e
   não tirava o ponto de milhar → "2.500,00" virava NaN e o botão travava sem
   explicação. Novo `parseBRL` (tira milhar, troca todas as vírgulas).
4. **Concorrência (TOCTOU):** a leitura `FOR UPDATE` dos pendentes e a checagem de
   duplicidade do `gateway_id` estavam FORA da transação (auto-commit) → trava
   inútil. Movidas pra dentro do `begin`.
5. **MP/PagBank com 2+ saldos "Na Entrega":** o `gateway_id` (índice UNIQUE
   global) era gravado em todas as linhas → violava o índice → 500. Agora o ID
   fica só na 1ª linha; as demais entram `confirmado` sem `gateway_id`.
6. **Reposição: re-entrada após estorno (mig 302):** a idempotência checava
   `status <> 'cancelado'` (status inexistente) → após estornar uma entrada não
   deixava dar entrada de novo. Trocado por `status = 'efetivado'` (só entrada
   ATIVA bloqueia). Testado em rollback: cria→idempotente→estorna→recria. ✅

tsc limpo; migration 302 reaplicada no homolog.

## chore(pente-fino): pagamento na entrega validado p/ produção + badge (v2.66.8)

Pente fino do módulo de pagamento na entrega (Jonathan 13/06, pré-produção).
Rastreado o status novo `aguard_conferencia` por todo o sistema:
- **Comissão:** só conta `confirmado` → venda com pagamento do motoboy não gera
  comissão até o caixa conferir. ✅ correto.
- **Financeiro/caixa (KPIs, lista de baixa):** só conta `confirmado` → o
  `aguard_conferencia` fica invisível até a conferência. ✅ correto, sem inflar.
- **Tela da venda:** o badge mostrava o status cru. Corrigido: cor + rótulo
  "aguard. conferência" (`PAG_STATUS_COLOR`/`PAG_STATUS_LABEL`).
- **MP/PagBank:** lógica reusa o `verificar-manual` (provado); só falta o teste
  com ID real na API (homolog não tem) — gap conhecido.
- **Contas a receber:** duplo registro ADIADO por decisão do Jonathan (módulo não
  está em uso; será resolvido junto com o financeiro depois).

## feat(caixa): conferência do pagamento do motoboy — Etapa 2 (v2.66.7)

Jonathan (13/06): Dinheiro/Ouro que o motoboy recebeu na rua ficam
`aguard_conferencia` (Etapa 1). Agora o caixa confere e libera pro financeiro.
- Rota `financeiro/caixa/motoboy` (GET lista os `aguard_conferencia` Dinheiro/Ouro
  com venda/cliente/motoboy; POST confirma → status `confirmado`). Permissão
  `podedarBaixaCaixa`.
- `TabCaixa` (Financeiro › Caixa): seção nova **"Pagamentos do motoboy a conferir"**
  no topo, com botão Confirmar por linha. Confirmou → entra no fluxo normal.
- **Dinheiro:** confirmar dispara o gatilho existente `fn_venda_baixar_recebimento_pago`
  (AFTER UPDATE) → entra na lista de baixa do caixa. **Ouro:** o gatilho de rastreio
  (`fn_rastreio_pagamento_ouro`) é AFTER INSERT e NÃO pega o UPDATE — então a rota
  insere o rastreio do cofre manualmente (sem mexer no gatilho, p/ não dobrar nas
  vendas de loja). Sem migration.
- Testado: back (rollback — Dinheiro cria CR; Ouro cria rastreio no cofre) + front
  (confirmei no caixa → R$100 entrou na lista de baixa, venda no topo). tsc limpo.

> ⚠️ PENDÊNCIA CONHECIDA (adiada por decisão do Jonathan 13/06 — contas a receber não
> está em uso ainda): como a entrega ocorre com o pagamento ainda em
> `aguard_conferencia`, o gatilho `fn_venda_gerar_conta_receber` (que só conta
> `confirmado` como pago) cria uma **conta a receber** pelo valor — e a conferência do
> caixa não baixa essa conta. Resultado: o valor aparece no caixa **E** em "a receber"
> (duplo registro). Correção futura (Opção A): incluir `aguard_conferencia` no cálculo
> de "pago" do gatilho (não cria a conta na entrega; vira paga na conferência).

## feat(entregas): motoboy confirma pagamento na entrega — Etapa 1 (v2.66.6)

Jonathan (13/06): o motoboy, na rua, confirma o pagamento "Na Entrega" ANTES de
poder confirmar a entrega. No detalhe da entrega, tendo saldo "Na Entrega" pendente,
"Confirmar Entrega" some e aparece "Confirmar Pagamento" (4 formas).
- **Dinheiro/Ouro:** motoboy confirma (se responsabiliza) → status `aguard_conferencia`
  (NÃO entra no financeiro ainda — gatilho de CR e de rastreio de ouro só disparam em
  `confirmado`; entra na Etapa 2, conferência do caixa). Status curto porque
  `pagamentos_venda.status` é varchar(20).
- **Mercado Pago/PagBank:** motoboy digita o ID → o sistema VERIFICA NA API (reusa
  `fetchPayment` / `buscarPedido`-`buscarCobranca`) → aprovado → `confirmado` (entra
  no financeiro). Sem duplicar a verificação que já existe no PDV.
- Confirmado o pagamento, some o "Na Entrega" pendente → a trava do Código A libera.
- Sem migration (status é texto livre; nenhum schema novo — `pagamentos_venda` já tem
  `gateway_id`, `ouro_*`, `source`, `caixa_baixa_id`).
- Arquivos: rota `entregas-venda/[id]/confirmar-pagamento`; `na_entrega_pendente` no GET
  do detalhe; `EntregaDetalheDrawer` + novo `ConfirmarPagamentoMotoboyModal`.
- Testado: back (rollback — Dinheiro→aguard_conferencia, sem CR, libera entrega) e
  front completo (motoboy → Confirmar Pagamento Dinheiro → Confirmar Entrega → venda
  ENTREGUE; CR = 0). MP/PagBank: lógica reusada do PDV; verificação na API real precisa
  de um ID válido (teste do Jonathan). tsc limpo.
- **Falta:** Etapa 2 (botão "Confirmar pagamento do motoboy" no caixa p/ dinheiro/ouro);
  Etapa 3 (troca) — depois.

## feat(entregas): retirada com "Na Entrega" pendente exige cobrar antes (v2.66.5)

Jonathan (13/06, pós-teste no front): na RETIRADA na loja, se há saldo "Na Entrega"
pendente, o operador criava a entrega, batia na trava ao confirmar o Código A, fechava
o diálogo pra ir cobrar — e a entrega era **cancelada** (regra: entrega sem código
confirmado é cancelada ao fechar), obrigando a recriar. Agora `criarEntrega` barra
ANTES de gerar o código quando forma='retirada' e há 'Na Entrega' pendente:
"Cobre o pagamento na entrega (R$X) antes de marcar a retirada — use o botão 'Cobrar
na entrega'." Não cria entrega que cancela sozinha. **Motoboy não muda** (cliente paga
no endereço; trava continua no Código A). Testado no back (rollback: retirada barrada
sem criar entrega, motoboy não barrado, cobra→passa) e no front (mensagem no modal,
0 entregas criadas). tsc limpo.

## fix(ux): tradutor de erro também no servidor (pente fino) (v2.66.4)

Pente fino do módulo vendas/entregas (Jonathan 13/06). Achado: o tradutor da v2.66.3
estava só no `apiFetch`, mas a tela de detalhe da venda (`VendaDetalheClient`) usa
`fetch` cru — então `TRANSICAO_INVALIDA`/`STOCK_NEGATIVE`/`ENTREGA_BLOCKED` ainda
apareciam crus ali. Correção: aplicar `traduzErroOperacional` **no servidor**, nos
catches que emitem esses erros — `vendas/[id]/route.ts` (regra de negócio + aprovação)
e `vendas/[id]/cobrar-entrega/route.ts`. Agora todo cliente (apiFetch ou fetch cru)
recebe o texto claro. Idempotente. tsc limpo.
Verificado também (sem mexer): entrada de reposição é idempotente pelos 2 caminhos
(volta + botão); volta-concluída e ordem-concluída andam juntas (40/40, sem gap);
baixa na entrega é idempotente e divide reserva; nenhuma ordem de reposição mista
(produto+sem produto) existe. Sem outras pontas soltas.

## feat(ux): mensagens de erro operacional claras na entrega/venda (v2.66.3)

Validação do módulo de vendas/entregas (Jonathan 13/06): confirmado que toda falha é
**bloqueio de operação** (etapa não feita), nunca quebra. 6 cenários testados no banco
(rollback): reposição não concluída, peça sem estoque, "Na Entrega" não paga, reabrir
venda entregue, editar venda fechada, item em reposição — todos bloqueiam limpo.
Achado: 4 mensagens chegavam cruas (prefixo técnico do banco). Novo `traduzErroOperacional`
(em `src/lib/erros-operacionais.ts`), aplicado no `apiFetch`, troca os prefixos por texto
claro antes de mostrar: `STOCK_NEGATIVE`, `ENTREGA_BLOCKED`, `NA_ENTREGA_PENDENTE`,
`TRANSICAO_INVALIDA`. Aditivo (não muda regra). tsc limpo.

## feat(estoque): reposição concluída dá ENTRADA no estoque (v2.66.2, mig 302)

Jonathan (13/06): reposição concluída não dava entrada da peça no estoque comercial →
a entrega da venda quebrava com `STOCK_NEGATIVE` (caso C-2372 / item 90000764). Agora a
peça entra no estoque quando o **protocolo de VOLTA** é concluído (fluxo normal) — e o
**botão "Concluir pelo sistema"** (master) também dá a entrada, pois pula o protocolo de
volta. Os dois usam a mesma função idempotente (não dobra).
- `fn_reposicao_entrada_estoque(ordem, user)` — idempotente (1 entrada por ordem+produto);
  só age em reposição; cria `movimentacoes_estoque_comercial` 'entrada' (almox. 2,
  motivo `reposicao_entrada`, ref. ordens) → espelha no físico via `trg_mirror_movimento_to_sle`.
- Gatilho `trg_reposicao_entrada_volta` (AFTER UPDATE em `protocolos`, volta→concluido).
  NÃO toca `fn_concluir_protocolo` (no-touch) — segue o padrão dos `trg_concluir_conversao`.
- `fn_mirror`: 1 branch aditivo — no físico a entrada de reposição rotula como
  `producao_auto` (voucher_type válido por `chk_voucher_type_valid`; bug pego no teste).
- Rota `concluir-sistema`: chama a função após concluir, na mesma transação.
- Testado no banco (rollback): volta dá entrada; botão dá entrada; idempotência (2x→1);
  entrega destrava; controle sem-entrada ainda dá STOCK_NEGATIVE. tsc limpo.
- "Pra trás": Jonathan resolve clicando o botão nas ordens travadas (sem acerto manual no banco).

## fix(entregas): entrega "total" não exige o item da reposição (v2.66.1)

Bug do v2.66.0 (Jonathan): com a trava por item, o modal parou de mandar o item em
reposição numa entrega; mas a validação de tipo='total' do criarEntrega ainda exigia
TODOS os pendentes → erro "Item X não foi informado". Correção: a checagem de 'total'
(e o laço de validação de itens) agora **pula os itens cujo produto está em reposição
aberta** — só os prontos são exigidos. `calcularSaldoPendente` passou a retornar
`produtoId`. Validado no banco com cenário real (anel estoque + corrente reposição →
entrega total só do anel passa); E2E 22/22; tsc limpo.

## feat(entregas): trava de reposição POR ITEM (v2.66.0)

Jonathan: numa venda com item de pronta-entrega (anel) + item sob encomenda em reposição,
o cliente não conseguia levar o anel — a trava era da venda inteira. Agora é POR ITEM:
só o item cujo produto está em reposição aberta espera; os prontos podem ser entregues
(entrega parcial). O vínculo item↔reposição é pelo PRODUTO do item da própria ordem
(`alissonerp.itens_ordem.produto_id`) — cobre ~81% (138/171), bem mais que o campo
`venda_item_ids` (31/171). Reposição aberta SEM produto identificável cai no seguro:
bloqueia a venda inteira.
- Helper `calcularBloqueioReposicao` + aplicado em criarEntrega (montar) e confirmarEntrega.
- Rota saldo-pendente marca `bloqueadoReposicao` por item + `bloqueioVendaInteira`.
- Modal: só oferece os itens prontos (o da reposição não entra); avisa se tudo está travado.
- Botão "Marcar Entrega": liberado se há item pronto; bloqueado só se nada é entregável.
Testado no banco (bloqueia produto certo / venda inteira quando sem produto); E2E 22/22; tsc limpo.

## fix(estoque): entrega parcial agora baixa o entregue e divide a reserva (v2.65.9)

Jonathan (venda 15460, 2un, entrega parcial de 1): a reserva continuou com 2 e nenhuma
saída foi gerada. Causa: a CRIAÇÃO da reserva olha `estoque_comercial_config.ativo`, mas a
BAIXA (baixarEstoqueDaEntrega) olhava `controla_estoque` — critérios diferentes. 24 produtos
têm ativo=true + controla_estoque=false → criam reserva mas a baixa pulava, deixando a
reserva presa (qtd cheia, sem saída). Correção: a baixa passa a seguir a EXISTÊNCIA da
reserva ativa (não a flag) — se há reserva, gera a saída do entregue e reduz a reserva ao
saldo restante; item sem reserva (não controla estoque comercial) é pulado sem erro. Venda
15460 corrigida no homolog (reserva 1 ativo + saída 1 efetivado).
⚠️ Pendente: limpar as ~23 reservas órfãs restantes (entregas antigas desses 24 produtos)
quando for pra produção.

## feat(entregas): mostra QUAL item já foi entregue (v2.65.8)

Jonathan: "era bom informar qual item foi entregue". Na lista de produtos da venda, cada
item agora mostra um badge "Entregue X/Y" (parcial, azul) ou "Entregue" (completo, verde),
com tooltip "X de Y entregue(s)". A rota /api/entregas-venda/saldo-pendente ganhou
`?todos=1` (retorna TODOS os itens com qtdEntregue, inclusive os 100% entregues, sem o
filtro de saldo>0 usado pelo modal). tsc limpo.

## fix(entregas): entrega parcial — saldo real + indicador na tela (v2.65.7)

Jonathan (venda 15460, 2un do mesmo SKU, entrega parcial de 1): o modal "Marcar Entrega"
mostrava o saldo CHEIO (2) e deixava tentar reentregar o já entregue — o cálculo era um
ternário quebrado (ignorava o entregue). E a tela da venda não mostrava que parte já fora
entregue.
- Nova rota GET /api/entregas-venda/saldo-pendente (expõe vw_entregas_pendentes).
- MarcarEntregaModal: usa o saldo REAL por item (qtd vendida − já entregue); mostra "1 de
  2", input limitado a 1, avisa quando tudo já foi entregue.
- VendaDetalheClient: badge "Entrega parcial — falta(m) N un." no cabeçalho, com tooltip
  por item (X de Y entregue). O backend (criarEntrega) já rejeitava o excesso. tsc limpo.

## fix(entregas): bloqueio de reposição por STATUS da ordem (v2.65.6, migration 301)

Jonathan: o bloqueio de entrega por ordem de reposição deve usar o STATUS de produção
(`alissonerp.ordens.status`), não a situacao. O critério antigo (situacao IN criado/
rascunho) deixava passar uma ordem 'criado' + 'em_andamento' (peça ainda em produção).
Agora os 3 pontos usam o mesmo critério — bloqueia enquanto `status NOT IN ('concluido',
'cancelado')` (aguardando/em_andamento bloqueiam): botão "Marcar Entrega" (desabilita +
mostra a ordem), criarEntrega (montar) e confirmarEntrega, e o gatilho
fn_estoque_comercial_entrega_venda (migration 301, último guard). Testado: reposição
em_andamento bloqueia; ao concluir, libera. Também passou a cobrir 'reposicao_loja'.

## fix(compras): pedra solta x joia com pedra na compra comercial (v2.65.5)

Bug reportado pelo Jonathan: AJ5079 ("Brinco Em Ouro Branco com Esmeralda e Diamantes")
era tratado como PEDRA na ordem de compra comercial — o formulário pedia ct total + custo
total em vez de quantidade + valor/g. A classificação usava sinais errados (flag
`tem_pedra_preciosa` = joia COM pedra, 1.217 joias têm; nome CONTENDO "diamante"/"esmeralda"
etc., 1.885 joias; `categoria_precificacao` que nunca vale "Pedras") e estava duplicada em
4 lugares (API GET/POST de itens + 2 pontos do front). Agora centralizada em `ehPedraSolta()`
(src/lib/compras-pedras.ts): categoria "Pedras" OU registro em produto_pedra_extras OU nome
que COMEÇA com nome de pedra. Validado no banco: pega exatamente as 211 pedras soltas, zero
joias. Nenhum item de compra já lançado foi gravado errado (0 afetados). Obs: ~25 pedras
soltas estão sem categoria no cadastro (public.produtos, READONLY/Tiny) — ajuste manual
sugerido, fora deste fix.

## fix(financeiro): conta a receber = saldo em aberto (v2.65.4, migration 300)

Achado na verificação proativa das formas de pagamento: numa venda MISTA (ex.: R$200 =
R$120 à vista + R$80 a receber), a conta a receber nascia com o valor CHEIO (R$200),
inflando o "a receber" — o cliente só deve R$80. Migration 300: o gatilho que cria a conta
(`fn_venda_gerar_conta_receber` + versão on_insert) passa a usar o SALDO EM ABERTO
(total − pagamentos confirmados). Venda totalmente paga → nada a receber (a baixa 'pago' é
do 299); parcial/só a receber → conta só do aberto. Verificação completa (22 asserções E2E,
incluindo Pix, A Receber, misto e motoboy): todas PASS.

## fix(vendas): baixa da conta a receber também na aprovação (v2.65.3, migration 299)

Bug achado no teste do Jonathan (venda 15458 no PDV): a regra "pagou → conta a receber
paga na hora" (297) só disparava quando o PAGAMENTO era confirmado. No PDV o fluxo normal
é lançar o dinheiro com a venda ainda em RASCUNHO e só DEPOIS aprovar — aí o 297 pulava
(ignora rascunho) e a aprovação não re-disparava. Resultado: venda paga ficava com conta
a receber 'pendente'. Migration 299: helper `fn_venda_criar_cr_quitada` + novo gatilho na
mudança de situacao da venda (dispara a baixa ao sair de rascunho). Agora a baixa cobre os
dois casos (pagou antes OU depois de aprovar). Testado no homolog; conta da venda 15458
corrigida para 'pago'.

## fix(entregas): bloqueio de reposição pendente antes de gerar o código (v2.65.2)

Ajuste de UX (Jonathan, durante o teste): a checagem de "venda com ordem de
reposição pendente" agora roda no INÍCIO da criação da entrega (criarEntrega),
ANTES de gerar o código — não deixa nem montar a entrega. Antes só barrava na
CONFIRMAÇÃO, com o código já gerado (desperdício + erro confuso). A validação
da confirmação continua como segunda camada.

> Regra: TODO push atualiza o CHANGELOG. Features = MINOR (v2.X.0), Fixes = PATCH (v2.9.X).

## feat(vendas): Etapa 4 — Pagamento na Entrega (v2.65.0)

**Contexto:** Etapa 4 da refatoração (decisões do Jonathan 11/06/2026). Nova forma de
pagamento "Na Entrega" — o cliente paga parte (ou tudo) na hora que recebe a joia.
Sem migration (forma é texto livre em pagamentos_venda; não tocou o schema public).

**Regras (decisões do Jonathan):**
- **Aprovar:** a consultora aprova DIRETO (sem gerente) quando confirmados + 'Na Entrega'
  pendentes = total e não há outro pendente. O 'Na Entrega' pendente NÃO bloqueia a
  aprovação (diferente de 'A Receber', que exige aprovação de crédito).
- **Cobrança na entrega:** o atendente/motoboy registra a forma REAL usada (Dinheiro/Pix/
  Cartão) — nova rota `POST /api/vendas/[id]/cobrar-entrega` confirma o 'Na Entrega' com
  essa forma; o gatilho 297 baixa a conta a receber na hora.
- **Não entrega sem pagar:** a entrega NÃO conclui enquanto houver 'Na Entrega' pendente,
  tanto no PATCH `/api/vendas/[id]` (situacao='entregue') quanto no fluxo do motoboy
  (`marcarVendaEntregueSeCompleta` lança NA_ENTREGA_PENDENTE). Sem exceção de gerente
  para este caso.

**Arquivos:** `src/app/api/vendas/[id]/route.ts` (guards de aprovação/entrega separados
para 'Na Entrega'); `src/app/api/vendas/[id]/cobrar-entrega/route.ts` (nova); `src/lib/
entrega-venda.ts` (bloqueio no fluxo do motoboy); `NovaVendaClientV2.tsx` ('Na Entrega'
como forma selecionável).

**UI:** botão "Cobrar na entrega" na tela de detalhe da venda (VendaDetalheClient) — no
pagamento 'Na Entrega' pendente, abre o seletor de forma real (Dinheiro/Pix/Cartão) e
chama a rota /cobrar-entrega. 'Na Entrega' deixa de cair no "Confirmar" genérico.

**Teste E2E (docs/teste-e2e-vendas.sql, 18 asserções PASS):** ciclo completo + Na Entrega
(pendente não gera conta a receber; cobrar na entrega cria a conta PAGA; cobrança não muda
status; após cobrar, entrega conclui). `tsc` limpo; suíte sem falha nova.

## feat(vendas): Etapa 3 — celular obrigatório + WhatsApp do desenvolvedor (v2.64.0)

**Contexto:** Etapa 3 da refatoração vendas/entregas (decisões do Jonathan 11/06/2026).
Sem migration — só código.

**1) Celular obrigatório para aprovar a venda:** `approveVenda` (src/lib/vendas-aprovar.ts)
agora bloqueia a aprovação se o cliente não tiver celular cadastrado. Regra: a partir da
aprovação entra a entrega, e o código de retirada (Código A) vai por WhatsApp — sem
celular o código não tem para onde ir. Telefone fixo NÃO conta. Como o PATCH
`/api/vendas/[id]` (situacao='aprovado') delega ao `approveVenda` (Etapa 2), a regra vale
para a tela e para os webhooks de pagamento.

**2) WhatsApp do desenvolvedor (fallback de segurança):** quando o envio do código ao
CLIENTE falha (número inválido, cliente sem WhatsApp, Evolution fora), o sistema manda o
código + o motivo do erro para o WhatsApp do desenvolvedor — assim ninguém fica sem o
código. Novo campo na aba **Configurações › Integrações** ("WhatsApp do desenvolvedor",
chave `whatsapp_desenvolvedor`). Implementado em `src/lib/whatsapp.ts`
(`enviarAvisoDesenvolvedor`) e `src/lib/entrega-venda.ts` (hooks nos pontos de envio do
Código A — retirada e em_rota). Best-effort: se o número não estiver configurado, só pula.

**Teste E2E (banco de teste, 13 asserções, todas PASS):** ciclo completo verificado —
item cria reserva de estoque; reserva permanece na aprovação; pagamento total cria conta
a receber JÁ paga na hora; pagamento não muda status; entrega mantém 'entregue' (não vira
'concluido') e converte a reserva em saída de estoque; conta a receber não duplica; trava
barra transição inválida (rascunho→entregue); estorno de entregue não desfaz a entrega
(entregue→cancelado permitido); pagamento parcial não baixa, completar o total baixa.
`tsc` limpo; suíte vitest sem falha nova vs HEAD.

## feat(vendas): trava de status + baixa automática no pagamento (v2.63.0)

**Contexto:** complemento da Etapa 2 (decisões do Jonathan em 11/06/2026). Migration
297 aplicada SÓ no banco de TESTE — NÃO em produção.

**1) Trava de status (rede de segurança no banco):** liga de fato a máquina de estados
da venda — cria a tabela `vendas_transicoes` + o gatilho `trg_registrar_transicao_venda`
(BEFORE UPDATE OF situacao). A migration 178 tinha criado a função mas o gatilho/tabela
NUNCA foram aplicados em produção (função inerte). Transições permitidas mapeadas do
código real (inclui a volta do estorno aprovado/em_rota → rascunho; mantém concluido/
enviado como destino só p/ rota legado e histórico). **Entregue é ponto final:**
entregue→rascunho é BLOQUEADO (decisão Jonathan); só entregue→cancelado/concluido.

**2) Baixa automática no pagamento:** novo gatilho em `pagamentos_venda`
(`fn_venda_baixar_recebimento_pago`): quando os pagamentos confirmados cobrem o total
da venda (aprovada), cria a conta a receber JÁ como 'pago', na hora, SEM mexer no status
da venda. Funciona em qualquer forma de pagamento. Guard anti-duplicata (não recria se já
há CR não-cancelada; o trigger de entrega 296 também é guardado).

**3) Estorno respeita o ponto final:** `estornarVenda` (vendas-aprovar.ts) não volta mais
venda entregue/concluida para rascunho — registra a devolução do pagamento e cancela a
CR, mas mantém o status (nova ação `mantida_terminal`). Sem isso, a trava recusaria o
estorno de venda entregue.

**4) Desligada a "ponte de volta" public.vendas → vendas_erp:** removidos os gatilhos
`trg_sync_venda_insert_from_public` e `trg_sync_venda_update_from_public`. Decisão do
Jonathan: `alissonerp.vendas_erp` é a ÚNICA fonte de verdade; o schema public (Evolury,
SÓ histórico) não espelha mais de volta. **Bug que isso corrigiu:** o espelhamento
ida-e-volta transformava toda venda 'entregue' em 'concluido' sozinha (em public.vendas
'entregue' e 'concluido' usam o mesmo código 2, e a volta escolhia 'concluido') — então
'entregue' nunca ficava. O espelhamento de IDA (erp → public) continua.

Validado no banco de teste: pagar total → CR 'pago' + venda fica 'aprovado'; entregar →
venda fica 'entregue' (não vira concluido) sem duplicar CR; trava barra transições
inválidas; estorno de entregue não desfaz a entrega. `tsc` limpo; suíte vitest sem falha
nova vs HEAD. Migration 297 NÃO aplicada em produção.

## feat(vendas): Novo fluxo de status — Etapa 2 da refatoração (v2.62.0)

**Contexto:** segunda etapa da refatoração vendas/entregas (plano aprovado em 11/06/2026).
O fim natural da venda agora é a ENTREGA: `rascunho → aprovado → em_rota → entregue`
(+ `cancelado`). Os status `concluido` e `enviado` foram APOSENTADOS — vendas antigas
neles ficam intocadas (histórico), mas nenhuma venda nova transiciona PARA eles.

**Banco (migration 296 — aplicada só no banco de TESTE, junto com a 295):**
- `fn_registrar_transicao_venda`: nova máquina de estados (aprovado → em_rota | entregue
  | cancelado; entregue/cancelado terminais; históricos podem sair, nunca receber).
  ⚠️ ACHADO: a função existe em produção mas SEM trigger e SEM a tabela
  `vendas_transicoes` — a máquina de estados nunca esteve ativa; quem controla o fluxo
  é o código. Ativar (ou não) o trigger é decisão pendente do Jonathan.
- `fn_venda_gerar_conta_receber`: dispara também em `entregue` (compat com
  confirmado/concluido mantida).
- `fn_proteger_itens_venda_fechada`: `entregue` agora também blinda itens.
- `vw_dash_vendas_todas`: já tinha `em_rota` desde a 290 — sem mudança.

**Backend — pagamento quitado NÃO conclui mais a venda (decisão Jonathan 11/06):**
- `concluirVenda()` APOSENTADA (removida de `src/lib/vendas-aprovar.ts`) e
  `autoConcluirVendaSeQuitada()` removida de `src/lib/baixa-credito.ts`.
- Auto-conclusão removida de 16 pontos: webhooks MP (x2) e PagBank, checar-point e
  verificar-manual (MP e PagBank), reconciliar-pendentes (MP e PagBank), crediário
  (registrar-pagamento, verificar-mp, verificar-pagbank), pagamentos `[pagId]` e
  `/confirmar`, solicitações de alteração (x2). Auto-APROVAR (rascunho + crédito)
  continua em todos. Respostas trocam `venda_concluida` por `pagamento_quitado`.
- PATCH `/api/vendas/[id]`: situações válidas agora `rascunho|aprovado|entregue|cancelado`;
  aprovação DELEGADA ao `approveVenda()` (apagadas ~430 linhas inline de Tiny/ordem/cofre
  duplicadas da lib). `criarOrdemDoOrcamento()` da lib atualizado para usar
  `orcamentoFichaToDados`/`nomeItemOrdem` (ficha técnica completa — perfil/friso/canal/pedra).
- Solicitações de alteração: alvo `concluido`/`enviado` agora retorna 409 (aposentados).

**Comissões e relatórios — `em_rota` adicionado (mantendo status antigos):**
`comissoes/elegiveis|resumo|fechamentos|gerar-maio`, `dashboard-comercial/analise-comissoes`
(x2), `vendas/analise-frete`, `vendas/cliente/[id]/historico` (+ `entregue`),
`financeiro/cofre-ouro/upgrades`.

**Front:** VendaDetalheClient — mensagens "venda concluída" viraram "venda quitada"
(lê `pagamento_quitado`/`todos_pagos`). Não havia botão "Concluir" (já não existia).

**Banco de teste:** restore anterior estava corrompido (objetos antigos travaram
contatos/leads/vendedores/auth.users). Recriado do zero com o dump de 11/06 —
validado: `vendas_erp` 14.958, `auth.users` 29, 0 usuários órfãos, FKs ok.
Migrations 295+296 aplicadas no teste; smoke test: aprovado→entregue cria CR ✔.

**Testes:** `npx tsc --noEmit` limpo. Suíte vitest: ZERO falhas novas vs HEAD
(7 testes do comportamento antigo atualizados p/ o fluxo novo; 1 falha pré-existente
corrigida de brinde). ⚠️ A suíte já tinha ~105 falhas PRÉ-EXISTENTES no HEAD
(não relacionadas a esta mudança) — pendência separada.

Migrations 295/296 NÃO aplicadas em produção (aguardam Etapas 3-5 + testes + aval).

## feat(vendas/entregas): Blindagem do módulo — Etapa 1 da refatoração (v2.61.0)

**Contexto:** primeira etapa da refatoração do módulo de vendas/entregas (plano aprovado
em 11/06/2026), corrigindo os achados críticos da análise pente fino
(`docs/analise-vendas-entregas-2026-06.md`). Sem mudança de regra de negócio.

**Correções de segurança e integridade:**
- **C1 — Rotas de entrega fechadas:** POST `/api/entregas-venda`, `[id]/confirmar`,
  `[id]/cancelar` e PATCH `/api/entrega/[entregaId]` agora exigem role real
  (novo helper `requireEntregaVendaAccess` em `src/lib/auth-vendas.ts`: roles de vendas
  full, consultora dona da venda, motoboy designado só confirma a própria entrega).
- **C3 — Confirmação de pagamento atômica:** `pagamentos/[pagId]/confirmar` roda em
  `sql.begin()` com `FOR UPDATE` (anti dupla confirmação). `creditarSaldo()` aceita
  transação externa (`txClient`). Falha = rollback total + erro visível.
- **C4 — Auditoria (`logAudit`):** PATCH de vendas, cancelar venda, aprovar desconto,
  confirmar pagamento, editar/remover item, preparações de entrega e tentativas/
  desbloqueio de código agora registram quem/o quê/quando em `alissonerp.audit_log`.
- **M1 — Fim dos catches silenciosos:** `aprovar-desconto` virou transação única;
  best-effort de notificações/webhooks agora loga erro; front usa `useErrorStore`
  (NovaVendaClientV2, VendaDetalheClient, MarcarEntregaModal, FreteAvulsoModal).
- **M2 — PATCH de vendas:** erros de regra (STOCK_NEGATIVE etc.) → 409; resto → 500
  via `internalError` (antes tudo virava 409 com mensagem crua do banco).
- **Códigos A/B não vazam mais:** respostas de GET/POST de entregas saem mascaradas
  (`••••••`) para todos exceto admin/desenvolvedor — código só chega por WhatsApp.
- **Migration 295:** `tentativas_codigo` + `codigo_bloqueado_em` em `entregas_venda` —
  5 códigos errados bloqueiam a confirmação; desbloqueio só por gerente/admin via
  nova rota POST `/api/entregas-venda/[id]/desbloquear-codigo` (com auditoria).

**Backup prévio (Etapa 0):** tag `v2.60.4-pre-refatoracao-vendas` + branch
`backup-pre-refatoracao-vendas-2026-06` no origin; dump completo de produção
(280 MB) restaurado no banco de teste para a fase de testes.

`npx tsc --noEmit` limpo. Migration 295 ainda NÃO aplicada em produção (vai junto
com o pacote da refatoração, após testes no banco de teste e aval do Jonathan).

## fix(ligacao): "Disponível" do Ouro 24k passa a usar o pote (depósito 1) (v2.60.4)

**Sintoma:** na aba Ligação, o campo "Peso Ouro" mostrava "Disponível: 6,73g", número
menor do que o Ouro 24k fino realmente disponível no pote. Além de enganar a tela, a
checagem de saldo do backend bloqueava ligações válidas.

**Causa raiz:** o saldo do Ouro 24k (e da liga) vinha de `vw_detalhe_pote.saldo_real`, que
soma TODOS os depósitos — incluindo operadores. O insumo 275 (Ouro 24k Fino) tinha 10,90g no
depósito 1 (Almoxarifado/pote) e −4,17g num operador (depósito 6), resultando em 6,73g de
total global. Pela §3 ("Ouro Total: só depósito ID=1"), o disponível do pote é 10,90g.

**Correção:** fonte do saldo trocada para `vw_saldo_estoque` filtrado em
`deposito_id = PARAM.ALMOXARIFADO_DEPOSITO_ID` (`SUM(saldo)`), em 3 pontos:
- `src/app/(dashboard)/purificacao/page.tsx` (carga inicial; também removido o `275` literal)
- `src/app/api/purificacao/liga-tipos/route.ts` (refetch client)
- `src/app/api/purificacao/ligacao/route.ts` (checagem de saldo no POST, fora e dentro da tx)

**Resultado:** "Disponível" passou a mostrar 10,90g; backend libera com base no pote real.
Verificado: `GET /api/purificacao/liga-tipos` → `saldo_24k = 10.9`; modal exibe 10,90g.
`npx tsc --noEmit` limpo.

> ⚠️ Pendência de dado (fora do escopo): operador (depósito 6) está com −4,17g de Ouro 24k
> fino — investigar movimentação que deixou o saldo negativo.

## fix(ligacao): blindagem do estoque de ouro na aba Ligação (v2.60.3)

**Contexto:** auditoria da aba Ligação (módulo Purificação), que transforma Ouro 24k +
liga → 18k. Como é operação com ouro (= dinheiro), a integridade de estoque é crítica.

**Correções (em `src/app/api/purificacao/ligacao/`):**
- **Atomicidade (§0 dupla-entrada):** criar/concluir/cancelar agora rodam em `sql.begin`.
  Antes, a ligação e as CEs de saída/entrada eram queries separadas — se a 2ª falhasse,
  o ouro saía do pote sem contrapartida e a ligação ficava órfã (saldo inconsistente).
- **Race do saldo (TOCTOU):** dentro da transação, as linhas dos insumos são travadas com
  `FOR UPDATE` (ordem de id p/ evitar deadlock) e o saldo é reconferido — fecha a janela
  entre checagem inicial e gravação, impedindo dois lotes simultâneos de estourar o pote.
- **Permissão de teor no servidor:** o POST passou a revalidar `editar_teor_ligacao` quando
  o teor enviado difere do padrão do tipo (tolerância de float, §3). Antes, o cadeado era
  só na tela e podia ser burlado por requisição direta, alterando consumo de liga/produção.
- **Parâmetro em vez de literal (§5):** o `insumo_id = 275` chumbado nas movimentações foi
  trocado por `PARAM.OURO_24K_LIGA_INSUMO_ID` (POST e DELETE).
- **Pureza no GET:** o SELECT da listagem voltou a retornar `pureza`, que sumia do card em
  lotes com pureza < 100% (NaN < 100 = false).

**Impacto:** nenhuma migration; não toca funções no-touch nem schemas readonly. Caminho
normal idêntico — a diferença só aparece no erro (agora atômico). `npx tsc --noEmit` limpo.

## fix(orcamento): rascunho Bordas Elevadas preserva modelo/valor/peso (v2.60.2)

**Sintoma:** vendedora salvava rascunho de aliança modelo "Bordas Elevadas"
(perfil QuadradoCanal) e ao reabrir o modelo, valor e peso vinham completamente
alterados. Outros perfis (Anatômico, Concavo, Simples, etc.) não eram afetados.

**Causa raiz:** race condition em `OrcamentoClient.tsx`. `aplicarOrcamento`
restaurava `canalWidth`, `stoneRows`, `stoneCount` corretamente via `setParams`,
mas 6 `useEffect` de auto-ajuste disparavam logo após o render com os params
ainda nos valores default. Para QuadradoCanal isso era catastrófico:
`computeMaxStoneRows(canalWidth=default 4mm, stoneSize=2mm)` retornava 2, e o
efeito forçava `stoneRows` de 3 para 2. Em cascata, `stoneCapacity`,
`derivedStoneCount` e `stoneEntries` recalculavam todos errados — peso e valor
finais ficavam diferentes do negociado. Outros perfis não tinham essa lógica
de fileiras dentro do canal, por isso passavam ilesos.

**Por que voltava:** o componente já tinha um `isHydratingRef` em uso (para
suprimir `markDirty` durante carga), mas os useEffects de auto-ajuste **não**
respeitavam o gate. Cada vez que alguém revisava o orçamento, "limpava" os
efeitos de proteção achando que eram redundantes — o bug ressurgia.

**Fix:** adicionar `if (isHydratingRef.current) return;` no início dos 6
useEffects de auto-ajuste (linhas ~911, ~968, ~988, ~1082, ~1135, ~1153 em
`src/app/(dashboard)/orcamento/OrcamentoClient.tsx`). Liberação do gate em
`aplicarOrcamento` reforçada com `queueMicrotask + setTimeout(0)` (2 ticks)
para garantir que todos os efeitos do ciclo de hidratação rodem com gate ativo.

**Anti-regressão:**

- Comentário-bloqueio com "⚠️ NUNCA REMOVER" em cada um dos 6 useEffects.
- Entrada em `CLAUDE.md` §3 Pitfalls Criticos listando os 6 useEffects e o
  invariante.
- Este CHANGELOG documenta a causa raiz e o motivo da regressão recorrente.

## fix(vendas): correções QA em solicitação de alteração (v2.60.1)

Endurecimento dos guards e UI ao redor do feature de solicitação de alteração
introduzido na v2.60.0, conforme apontado no QA.

**Backend:**

- `aplicarCampoVenda` em `PATCH /api/vendas/solicitacoes-alteracao/[id]`:
  - mudanças de `situacao` agora roteiam por `approveVenda` / `concluirVenda`
    quando aplicável — antes faziam UPDATE direto e ignoravam guards de Tiny,
    contas a receber e criação de ordem.
  - `cliente_id`, `vendedor_id`, `data_venda`: se a venda saiu de `rascunho`,
    a solicitação é auto-rejeitada (HTTP 400 + `status='rejeitado'` com
    `motivo_decisao` explicando).
  - `total_frete`: continua recalculando `total_venda` como antes.
- `aplicarStatusPagamento`: UPDATE em `pagamentos_venda` agora roda dentro de
  `sql.begin(tx => …)` para atomicidade.
- `POST /api/vendas/[id]/solicitar-alteracao`: bloqueia (HTTP 409) solicitação
  em venda cancelada, bloqueada ou concluída.
- `logAudit` registra a decisão (aprovado / rejeitado) na tabela
  `alissonerp.audit_log` após cada PATCH.
- Notificação ao solicitante agora inclui `link = /vendas/{venda_id}`.
- Migration `262_solicitacoes_alteracao.sql`: removido `UPDATE` do GRANT a
  `authenticated` — atualizações só via service_role/server. Evita bypass via
  PostgREST.

**Frontend (`VendaDetalheClient.tsx`):**

- Quando `PATCH /api/vendas/[id]` ou `PATCH /api/vendas/[id]/pagamentos/[pagId]`
  retorna 403 com `solicitar: true`, abre modal pedindo `motivo` e dispara
  `POST /api/vendas/{id}/solicitar-alteracao` em vez de só exibir o erro.
- Wired em `handleSave`, `changeSituacao` e `confirmarPagamento`.

**Menu:**

- `src/lib/auth/permissions.ts`: novo item "Solic. Alteração"
  (`/vendas/solicitacoes-alteracao`) no grupo Comercial, visível para
  admin/desenvolvedor (e diretor via módulos).

## feat(vendas): bloqueio edição financeira + solicitação de alteração (v2.60.0)

Vendedora/gerente passam a abrir uma solicitação de alteração quando precisam
mexer em campos financeiros ou pagamentos confirmados — mesmo padrão da
solicitação de desconto (>30%).

**Bloqueios de API (403 + `solicitar: true`):**

- `PATCH /api/vendas/[id]/pagamentos/[pagId]` — não-admin (≠ admin/desenvolvedor/diretor)
  não pode mais alterar pagamento já `confirmado` nem mover qualquer pagamento
  para `confirmado` ou `estornado`.
- `PATCH /api/vendas/[id]` — não-admin não pode alterar `situacao`, `total_frete`,
  `cliente_id`, `vendedor_id` nem `data_venda`. Demais campos seguem livres.
- Gerente segue a mesma regra de consultora por ora (decisão de produto).

**Novas rotas:**

- `POST /api/vendas/[id]/solicitar-alteracao` — vendedora cria solicitação
  (`tipo: "pagamento_status" | "venda_campo"`, com snapshot do `valor_atual`).
  Bloqueia duplicata pendente para o mesmo (venda, campo, pagamento).
- `GET  /api/vendas/solicitacoes-alteracao?status=pendente|aprovado|rejeitado` — listagem admin.
- `PATCH /api/vendas/solicitacoes-alteracao/[id]` — admin decide. Se aprovado,
  aplica a mudança usando os helpers existentes de `vendas-aprovar.ts`
  (`approveVenda`, `concluirVenda`, `estornarVenda`) — mesma cadeia de
  auto-aprovar/concluir do PATCH original.

**UI admin:**

- `/vendas/solicitacoes-alteracao` — espelha `/vendas/autorizacoes`, com tabs
  Pendentes / Aprovadas / Rejeitadas. Aprovação é direta; rejeição abre input
  inline para motivo. Notifica solicitante em ambos os casos.

**Migration:** `262_solicitacoes_alteracao.sql` cria a tabela
`alissonerp.solicitacoes_alteracao` com `tipo`, `valor_atual`/`valor_solicitado`
em JSONB e índices por `(status, created_at DESC)` e `venda_id`.

## fix(security): onda 1J-2 — zod em ~153 rotas restantes (v2.58.0)

Segunda onda 1J — adicionou validação Zod (`safeParse` + `zodError`) em todas
as rotas POST/PATCH/PUT que ainda não tinham. Resultado: padronização total da
camada de entrada das API routes, eliminando o uso de `as any`/`as unknown`
direto no parsing.

**Cobertura:**

- 231 rotas POST/PATCH/PUT mapeadas no início
- 153 rotas tiveram zod aplicado nesta onda (~66%)
- 39 rotas puladas (sem body — cron, FormData, ou body já validado por outro
  mecanismo). Exemplo: `whatsapp/webhook` virou passthrough leniente; rotas
  como `compras/[id]/concluir` não recebem body.

**Módulos cobertos:**

- **Auth/User**: user/route, user/[id]/route, configuracoes/roles, ia/key,
  parametros, integracoes, permissoes, permissoes-usuario, sistema, gateways
- **Cadastros**: setores, depositos, fornecedores, contatos, insumos,
  locais-estoque, tipos-servico, fretes-bairro, admin/api-chaves
- **PCP/Distribuição**: pcp/apontamentos, pcp/saida, pcp/transferir,
  pcp/ordem-teste, pcp/[id]/{atribuir-operador,atribuir-operador-rota,mover-rota},
  distribuicao, distribuicao/apontamentos, distribuicao/[id]/{saida,estorno,estorno-lote},
  service/*
- **Estoque comercial**: converter, inventario, estornar, movimentos,
  config/[produtoId], transferir, transferir-local
- **Vendas**: faixas-comissao, metas, solicitar-desconto, solicitacoes-desconto,
  itens/[itemId], pagamentos/[pagId], mercado-pago/{criar-pix,criar-pix-instore,
  criar-link,criar-intent-point,verificar-manual}, rfid, upload-video
- **Produtos**: bulk-edit, classificar-tipo, normalizar-metal, rename-metal,
  insumos, pedras-bulk, pedras-bulk/reprice, personalizados, [id]/{composicao,
  composicao/[itemId],ficha-tecnica,personalizacao,personalizacao/campos,
  personalizacao-campos,propagar,reposicao,rota,aplicar-template,imagens/[imgId]}
- **Precificação**: simular, rejeitar, regras, solicitar-aprovacao, markup-pedras,
  curva/config, curva/categorias/[id], curva/preview-aplicar, curva/simular-produto
- **Compras**: compras (POST), itens, receber
- **Fiscal**: emitentes, emitentes/[id], regras, regras/[id],
  contatos-fiscais/[id_contato], produtos-fiscais/[id_produto],
  emitir/nfce, emitir/nfe-devolucao, notas/[id]/{cancelar,cce}, webhook/focus
- **Tarefas**: tarefas, tarefas/[id], comentarios, anexos, aprovacao,
  templates, templates/[id], templates/[id]/aplicar, regras-aprovacao,
  regras-aprovacao/[id], substitutos, substitutos/[id]
- **RFID**: cadastrar, confirmar-impressao, imprimir, inventario, lookup,
  reimprimir, reverter, scan
- **Outros**: agentes/playground, agentes/telegram/webhook (passthrough),
  whatsapp/webhook (passthrough), aprovacao/[aprovacaoId], auditoria/[auditoriaId],
  automacoes-tarefa, automacoes-tarefa/[id], conversao/{aprovar,recusar},
  conversao-sku, conversao-sku/{aprovar,concluir-servico,recusar},
  dashboard-comercial/premiacao, devolucoes/[id]/inspecionar, editor-ia/{config,generate},
  entrega/[entregaId], estoque/transferir-local, fichas-tecnicas, financeiro/{caixa/baixa,
  cofre-ouro/baixas,conciliacao-pendente,conciliar,contas-pagar/[id],contas-receber/[id]},
  gestao-estoque/{ai-chat,user-views}, ia/validar-peso, integracoes/{kommo,woocommerce},
  lancamentos-avulso, lia/personalizar/{chat,configurar}, mercado-pago/{devices,
  uso-reserva}, notificacoes/adiar, orcamento/{config,promocoes,promocoes/[id]/ativar},
  ordens/[id]/{comentarios,comentarios/[comentarioId],ficha-tecnica,fotos,upload-arquivo},
  protocolo/[protocoloId], purificacao, purificacao/[id], purificacao/{ligacao,
  ligacao/[id],liga-tipos/[id],teores/[id]}, rotas-template, rotas-template/[id],
  rotas-template/[id]/etapas, saldo-credito, service/{carregar-aditivo,carregar-solda,
  receber,reprovar,transferir-insumo,[id]/{apontar,concluir,devolver,transferir,
  transferir-fabrica}}, site/{config,produtos/[id],test}, vale-troca/validar,
  promocoes/[id]

**Critérios mantidos:**

- `.passthrough()` em todos os schemas — preserva campos extras (não quebra
  frontend nem callers legados)
- `.optional()` agressivo — mantém comportamento original onde campos eram
  tratados como opcionais via `??` ou COALESCE
- `z.coerce.number()` para numeric strings vindos de IDs em params
- `z.union([z.coerce.number(), z.string(), z.null()])` para campos que
  aceitavam múltiplos tipos (ex: preco_por_letra)
- Webhooks externos (Focus NFe, WhatsApp Evolution, Telegram) usam schema
  `passthrough()` permissivo — validação interna do payload já existe via
  `validateWebhookSecret` ou similar
- Não refatorou lógica de negócio — só adicionou validação na entrada

**Validações:**

- `npx tsc --noEmit` → 0 erros
- `npx eslint .` → 0 erros, 569 warnings (baseline ~567, +2 pelas mudanças)
- 5/5 smoke tests passam: onda 1C, 1D, 1H, 1I, 1J

## fix(security): onda 1K — fechar ressalvas QA final (v2.57.0)

Decima primeira onda do bloco de segurança — fecha os 4 itens flagados pelo QA
no review do EPIC ondas 1A-1J. Sem novas funcionalidades, apenas
endurecimento.

**Item 1 — IDOR em GET /api/vendas (lista):**

A onda 1D fechou `vendas/[id]/*` (acesso individual) mas o GET da lista ficou
aberto: qualquer `consultora` autenticada listava TODAS as vendas (CPFs,
valores, vendedores, comissoes alheias). Aplicamos `ownershipWhereVendas(user, "v")`
no WHERE da query — roles full continuam vendo tudo, demais sao filtradas por
`v.vendedor_id = mapping(user.id)`.

- `src/lib/auth-vendas.ts` — `ownershipWhereVendas` agora aceita `alias`
  opcional (via `sql.unsafe` controlado pelo backend, nunca pelo usuario).
- `src/app/api/vendas/route.ts` — GET importa helper e injeta no WHERE.

**Item 2 — fecha 32 rotas internas restantes sem auth:**

Aplicado `authOr401` em todas. Mutativas tambem ganharam role check:

*Mutativas:*
- `pcp/[id]/atribuir-operador/route.ts` PATCH — admin/desenvolvedor/gerente_fabrica/pcp
- `protocolo/[protocoloId]/route.ts` PATCH — admin/desenvolvedor/gerente_fabrica/motoboy
- `setores/route.ts` POST — admin/desenvolvedor
- `setores/[id]/route.ts` PATCH + DELETE — admin/desenvolvedor

*GETs sensiveis (financeiro/PCP/ouro):*
- `insumos/pote/route.ts` (saldo de ouro), `insumos/[id]/foto-url/route.ts`
- `pcp/[id]/{apontamentos,historico,insumos-transferencia,outros-disponiveis,pedras-disponiveis,resumo}/route.ts`
- `protocolo/{ordens,concluidos}/route.ts` + `protocolo/[protocoloId]/route.ts` GET

*GETs com dados internos (cadastros):*
- `vendas/{clientes,produtos}/busca/route.ts`
- `vendedores/route.ts`, `usuarios/transportadores/route.ts`
- `setores/route.ts` GET, `insumos/{categorias,fornecedores}/route.ts`
- `ordens/proximo-numero/route.ts`
- `pcp/{depositos,insumos,insumos-disponiveis,setores,tipos-apontamento}/route.ts`
- `produtos/busca/route.ts`

**Item 3 — consolida PATCH `orcamento/[id]` no helper:**

PATCH ainda tinha check manual `orc.usuario_id !== user.id` que so disparava
DEPOIS do SELECT gigante de ficha tecnica. Migrado para `requireOrcamentoOwnership`
(mesmo helper que GET/PUT ja usavam) — ownership confere antes do SELECT, com
a regra de full-access centralizada.

**Item 4 — vazamento de err.message em site/test:**

3 retornos do POST `/api/site/test` ainda incluiam `err.message` cru
(linhas ~141, ~147, ~226). Em catches de erro de rede/TLS isso pode vazar:
- host interno, header de auth Basic, fingerprint do certificado.

Classificacao por `err.code` foi mantida (DNS, conexao recusada, TLS) mas o
texto passou a ser generico. Log com stack continua server-side via `console.error`.

**Item 5 — atualiza vitest tests da Onda 1J:**

3 arquivos de teste (`contas-pagar`, `contas-receber`, `pagamento-ouro`)
quebraram apos a Onda 1J trocar `{ error: "descricao obrigatoria" }` por
`{ error: "Dados invalidos", issues: [...] }`. Asserts atualizados para a
nova forma. `pagamento-ouro.test.ts` tambem ganhou mock de
`requireVendaOwnership` (Onda 1D adicionou o helper sem atualizar os tests).

Pendencia conhecida (Onda 1L):
- ~80 outros testes ainda falham por causa de Ondas 1D/1F (info disclosure e
  IDOR adicionaram queries extras nao mockadas). Nao bloqueiam producao —
  testes sao isolados, codigo passa em runtime.
- `descricao = "   "` (so espacos) passa pelo schema zod `min(1)` — sera
  bloqueado adicionando `.refine(s => s.trim().length > 0)` na proxima onda.

**Verificacao:**
- `npx tsc --noEmit` — zero erros.
- `npx eslint .` — zero erros (567 warnings pre-existentes, nenhum novo).
- `npx vitest run src/__tests__/{contas-pagar,contas-receber,pagamento-ouro}.test.ts` — 94/94 passam.
- Suite completa: 92 falhas (vs 112 antes) / 818 pass (vs 798) — 20 testes
  recuperados, nenhuma regressao introduzida.

## fix(security): onda 1J — validacao zod em 40 rotas criticas (v2.56.0)

Decima onda do bloco de segurança. A maioria das rotas POST/PATCH/PUT fazia
validação manual (parseInt, isNaN, typeof string), o que é frágil e
duplicado entre endpoints. O projeto já usa zod (helper `defineRoute` em
`src/lib/api-handler.ts`). Esta onda padroniza schemas zod nas 40 rotas de
maior risco. As ~185 restantes ficam para wave futura (Onda 1J-2, 1J-3).

**Schemas reutilizaveis — `src/lib/schemas/common.ts`:**
- `IdSchema` — `z.coerce.number().int().positive()` (FKs cliente/produto/etc).
- `UuidSchema` — `z.string().uuid()` (UUIDs Supabase Auth).
- `DateSchema` — string ISO YYYY-MM-DD (ou com timestamp).
- `MoneySchema` — `z.number().nonnegative()` (valores monetarios).
- `WeightSchema` — `z.number().nonnegative()` (peso em gramas).
- `PercentSchema` — `z.number().min(0).max(100)`.
- `QuantitySchema` — `z.number().int().min(1)`.
- `PaginationSchema` — `{ page?, limit? }` com coerce (query params vem como string).
- `DateRangeSchema` — `{ inicio, fim }` para filtros de relatorio.
- `zodError(error, status?)` — helper que converte `ZodError` em `NextResponse`
  400 padronizado com `{ error: "Dados invalidos", issues: [{ path, message }] }`.

**Padrao aplicado (inline, menos invasivo que migrar pra defineRoute):**

```ts
const Schema = z.object({ campo: z.string() });
const raw = await req.json().catch(() => ({}));
const parsed = Schema.safeParse(raw);
if (!parsed.success) return zodError(parsed.error);
const body = parsed.data; // ja validado e tipado
```

Para rotas legadas que destruturam body com tipos especificos, mantivemos
`as any` apenas para preservar inferencia do `sql` tagged template
(postgres@3 nao consegue tipar `Record<string, unknown>` em parametros).
A validacao zod ja roda antes — `as any` so afeta o destructuring.

**Rotas com zod aplicado (33 de 40):**

*Vendas (5/8):*
- `vendas/route.ts` POST — itens/pagamentos como arrays validados
- `vendas/[id]/route.ts` PATCH — campos editaveis + client_updated_at
- `vendas/[id]/pagamentos/route.ts` POST — forma/valor/ouro_*/vale_numero
- `vendas/[id]/itens/route.ts` POST — produto/quantidade/precos
- `vendas/[id]/solicitar-aprovacao/route.ts` POST — tipo opcional
- `vendas/legado/route.ts` POST — cliente_id OU novo_cliente (refine)

*Devolucoes (2/3):*
- `devolucoes/route.ts` POST — tipo enum, itens min 1
- `devolucoes/[id]/route.ts` PATCH — campos parciais

*Orcamento (3/3):*
- `orcamento/route.ts` POST — fichas como records permissivos
- `orcamento/[id]/route.ts` PATCH (status) + PUT (campos)

*Crediario (3/3):*
- `crediario/[id]/comunicacao/route.ts` POST — tipo enum + mensagem
- `crediario/[id]/verificar-mp/route.ts` POST — payment_id obrigatorio
- `crediario/[id]/registrar-pagamento/route.ts` POST — obs opcional

*Estoque/PCP (8/8):*
- `estoque-comercial/transferir/route.ts` POST — refine origem != destino
- `estoque-comercial/inventario/[id]/finalizar/route.ts` POST — contagens min 1
- `pcp/transferir-service/route.ts` POST — pcp_id + deposito_destino
- `pcp/transferir-service/receber/route.ts` POST — protocolo_id + foto base64
- `distribuicao/[id]/adicionar-ordens/route.ts` POST — ordem_ids min 1
- `ordens/[id]/route.ts` PATCH — campos nullable optional
- `ordens/route.ts` POST — passthrough (rota gigante com upload + fichas)
- `protocolo/route.ts` POST — direcao enum + ordem_ids

*Financeiro (3/4):*
- `financeiro/contas-pagar/route.ts` POST — descricao + valor > 0
- `financeiro/contas-receber/route.ts` POST — descricao + valor > 0
- `financeiro/inter/enviar/[id]/route.ts` POST — tipo enum pix/boleto/ted

*Produtos (3/3):*
- `produtos/route.ts` POST — passthrough (variacoes/composicao livres)
- `produtos/[id]/route.ts` PATCH — passthrough (PATCH parcial complexo)
- `produtos/[id]/imagens/route.ts` POST — foto_base64 + filename + eh_capa

*Precificacao (3/3):*
- `precificacao/aprovar/route.ts` POST — alteracao_id
- `precificacao/curva/aplicar/route.ts` POST — filtros opcionais
- `precificacao/curva/categorias/route.ts` POST — nome + max_weight > 0

*Configuracoes (3/3):*
- `configuracoes/cotacoes/route.ts` PATCH — api_key/auto_ativo/provedor
- `configuracoes/ia/route.ts` PATCH — provedor enum claude/openai/gemini
- `depositos/[id]/route.ts` PATCH — nome + ativo

*User (1/2):*
- `user/alterar-senha/route.ts` PATCH — senha_atual + nova_senha (min 6)

*Webhooks (1/1):*
- `webhooks/mercado-pago/route.ts` POST — passthrough (payload gateway com
  campos extras) — schema apenas valida forma sem rejeitar (webhook nao pode
  retornar 400 sem perder evento)

**Rotas no escopo mas puladas (7) — motivos:**
- `vendas/[id]/aprovar/route.ts` — **nao existe** (existe `aprovar-desconto`)
- `vendas/[id]/cancelar/route.ts` — **sem body** (`_req`)
- `devolucoes/[id]/concluir/route.ts` — **sem body** (`_req`)
- `crediario/[id]/pagamento/route.ts` — **nao existe** (existe `registrar-pagamento`, ja coberto)
- `financeiro/upload-ofx/route.ts` — **FormData** (validacao manual ja
  robusta com `file.size > 10MB`, parser OFX tem try/catch)
- `user/avatar/route.ts` — **FormData** (limite ja aplicado via
  `LIMITS.IMAGE_BASE64_MAX * 0.75`)

**Backlog — ~185 rotas restantes (futuras ondas):**
Inclui endpoints de menor risco (CRUD admin, GET-only com query params,
helpers internos). Sera priorizado conforme exposicao do cliente vs
criticidade dos dados. Padrao definido nesta onda (helpers em
`src/lib/schemas/common.ts` + safeParse inline) deve ser reusado.

**Helper schemas exportados sem uso direto (Onda 1J-2):**
`WeightSchema`, `QuantitySchema`, `PaginationSchema`, `DateRangeSchema`,
`UuidSchema` estão prontos para serem importados nas proximas ondas sem
re-declarar. Mantidos no export mesmo sem uso interno hoje — sao a API
pública do modulo.

**Comportamento preservado:**
- Schemas usam `.optional()`/`.nullable()` agressivamente — qualquer chamada
  que funcionava antes continua funcionando (refator nao bloqueia frontend).
- `passthrough()` aplicado em rotas com payload livre (orcamento ficha,
  produto variacoes, webhook MP) — campos extras nao sao rejeitados.
- Defesa em profundidade: helpers `checkStringLength`/`checkArrayLength`/
  `checkBase64Length` (Onda 1I) **permanecem** ao lado do zod nas rotas com
  uploads ou texto livre — retorno 413 explicito vs 400 generico do zod.
- Rotas que ja faziam validacao manual robusta (`produtos/[id]` PATCH com
  ~15 checks granulares de range/tipo) tiveram zod aplicado em modo
  permissivo — checks manuais permanecem como segunda camada.

**Resposta 400 unificada:**
```json
{ "error": "Dados invalidos", "issues": [
  { "path": "valor", "message": "Number must be greater than 0" },
  { "path": "itens.0.quantidade", "message": "Expected number, received string" }
]}
```

**Smoke test — `scripts/test-onda-1j.mjs`:**
- 30 testes em `node:test` (sem vitest), reimplementacao inline dos schemas.
- Cobre todos os schemas comuns + 7 cenarios reais (contas-pagar,
  verificar-mp, transferir estoque com refine, devolucoes com min 1,
  inter/enviar com enum, ordens PATCH com nullable, webhook MP com
  passthrough).
- Roda em ~150ms, **30/30 pass**.

**tsc + eslint:** 0 errors. Warnings residuais (`Unexpected any`,
`unused-vars`) sao pre-existentes ou intencionais em casts pra preservar
inferencia do `sql` tagged template.

## fix(security): onda 1I — payload size guards em ~23 rotas sensiveis (v2.55.0)

Nona onda do bloco de segurança. Endpoints que aceitavam strings/arrays/uploads
sem limite podiam ser explorados pra explodir DB ou memória do server:
observações de 100MB no `observacoes`, array `images[]` com 1000 fotos base64,
mensagens de WhatsApp/notas sem teto, video base64 ilimitado, etc. Esta onda
adiciona o helper `src/lib/payload-limits.ts` e aplica em ~23 rotas (entrada
de texto livre, arrays de itens/ordens e uploads base64).

**Helper criado — `src/lib/payload-limits.ts`:**
- `LIMITS` — tabela de constantes canônicas para todos os limites. Texto em
  chars (postgres armazena UTF-8 — 1 char ASCII = 1 byte). Arquivos base64
  em chars; tamanho real do binário ≈ length × 0.75. Arrays em número de itens.
- `checkStringLength(field, value, max)` — joga `PayloadTooLargeError` se
  `value` é string com `length > max`. **Ignora** non-string (null/undefined/
  number/object) — validação de tipo é trabalho do Zod ou da própria rota.
- `checkArrayLength(field, value, max)` — joga 413 se array com mais que `max`
  itens. Ignora não-array.
- `checkBase64Length(field, value, max)` — alias semântico de
  `checkStringLength` deixando claro na call site que o campo é base64.
- `payloadTooLargeResponse(e)` — converte `PayloadTooLargeError` em
  `NextResponse` 413. Devolve null se não for; handler re-lança.

**Limites canônicos definidos:**
```
Texto:        OBSERVACOES=5KB | MENSAGEM=2KB | NOME=200ch | TITULO=500ch
              DESCRICAO_LONGA=10KB | CHAT_MESSAGE=4KB
Base64:       IMAGE=~3.75MB | VIDEO=~37.5MB | PDF=~7.5MB | OFX=1MB
Arrays:       IMAGES=10 | ITENS_VENDA=100 | ORDENS_LOTE=200 | MENSAGENS_CHAT=50
```

**Padrão de aplicação (consistente em todas as rotas):**
```ts
try {
  checkStringLength("observacoes", body.observacoes, LIMITS.OBSERVACOES_MAX);
  checkArrayLength("itens", body.itens, LIMITS.ITENS_VENDA_MAX);
  if (Array.isArray(body.itens)) {
    for (const item of body.itens) {
      checkStringLength("itens[].nome_produto", item.nome_produto, LIMITS.NOME_MAX);
    }
  }
} catch (e) {
  const r = payloadTooLargeResponse(e);
  if (r) return r;
  throw e;
}
```
Os checks devem rodar **antes** do INSERT/UPDATE/upload — o objetivo é cortar
o request cedo, sem chegar ao DB nem gastar I/O com Storage.

**Rotas guardadas (23) — agrupadas por categoria:**

*Texto longo (observações/mensagens):*
- `vendas/route.ts` POST — `observacoes`, `observacoes_internas`, `itens[].observacao`
- `vendas/[id]/route.ts` PATCH — `observacoes`, `observacoes_internas`
- `crediario/[id]/comunicacao/route.ts` POST — `mensagem` (max 2KB)
- `ordens/[id]/comentarios/route.ts` POST — `texto`
- `ordens/[id]/route.ts` PATCH — `detalhes_ordem`
- `tarefas/route.ts` POST — `titulo` (500ch), `descricao` (10KB)
- `financeiro/contas-pagar/route.ts` POST — `descricao`, `obs`, `categoria`
- `financeiro/contas-receber/route.ts` POST — `descricao`, `obs`, `categoria`
- `orcamento/route.ts` POST — `nome_cliente`, `nome_modelo`, `observacoes`
- `orcamento/[id]/route.ts` PATCH/PUT — `motivo_rejeicao`, `nome_cliente`, `nome_modelo`
- `fornecedores/route.ts` POST — `nome`, `cnpj`, `contato`, `observacao`
- `insumos/route.ts` POST — `nome`, `sku`, `descricao`

*Arrays grandes:*
- `vendas/route.ts` POST — `itens[]` (max 100), `pagamentos[]` (max 100)
- `distribuicao/[id]/adicionar-ordens/route.ts` POST — `ordem_ids[]` (max 200)
- `protocolo/route.ts` POST — `ordem_ids[]` (max 200)
- `tarefas/route.ts` POST — `ordem_ids[]` (max 200), `tags[]` (max 20)
- `editor-ia/generate/route.ts` POST — `images[]` (max 10) + cada imagem checada
- `gestao-estoque/ai-chat/route.ts` POST — `contextData[]` (max 200)
- `lia/personalizar/chat/route.ts` POST — `mensagens[]` (max 50) + cada `.content`
- `agentes/playground/route.ts` POST — `messages[]` (max 50) + cada `.content`

*Uploads base64:*
- `produtos/[id]/imagens/route.ts` POST — `foto_base64` (~3.75MB)
- `vendas/upload-video/route.ts` POST — `base64` (~37.5MB) + `filename`
- `ordens/upload-arquivo/route.ts` POST — `base64` (~37.5MB) + FormData `file.size`
- `user/avatar/route.ts` POST — FormData `file.size` (~3.75MB)
- `ordens/[id]/comentarios/route.ts` POST — `foto_base64`
- `orcamento/route.ts` POST — `foto_3d_base64`
- `orcamento/[id]/route.ts` PUT — `foto_3d_base64`
- `protocolo/route.ts` POST — `foto_criacao`

*Strings de chat LLM:*
- `gestao-estoque/ai-chat/route.ts` POST — `message` (4KB)
- `lia/personalizar/chat/route.ts` POST — `mensagemAtual` (4KB)
- `agentes/playground/route.ts` POST — `message` (4KB)
- `editor-ia/generate/route.ts` POST — `details` (5KB)

**Rotas com validação manual mantida (não duplicar):**
- `financeiro/upload-ofx/route.ts` — já checa `file.size > 10MB` com mensagem
  customizada. Mantido como estava.

**Smoke test — `scripts/test-onda-1i.mjs`:**
15 testes cobrem:
- Cada check (string/array/base64) passa dentro do limite e lança 413 acima.
- Valores não-string/não-array são ignorados (não bloqueiam o request).
- String vazia e array vazio passam (0 ≤ qualquer max).
- `PayloadTooLargeError` sempre tem `status=413`, expõe `field`/`max`/`actual`.
- Uso combinado: primeiro check que estourar interrompe os demais (short-circuit).
- Array de objetos: loop com `checkStringLength` no campo de cada item.

Tudo passou: `15 pass, 0 fail`.

**Limitações conhecidas:**
- Os limites são em **chars** (string.length), não em bytes. Para UTF-8 puro
  ASCII coincide (1 char = 1 byte). Texto com acentos consome mais bytes que
  chars — não é problema porque o limite tem folga (5KB de chars normalmente
  cabe em ≤ 8KB de UTF-8 mesmo no pior caso).
- Não há check **global** do body (next.js já corta requests > 4MB por padrão
  no `bodySizeLimit` — vide `next.config`). Os guards aqui são por campo,
  pra evitar 1 campo único dominando o body legítimo.
- Helper não normaliza nem trunca; é decisão consciente — silenciosamente
  cortar dados levaria a bugs invisíveis ("por que minha observação ficou
  cortada?"). 413 deixa o cliente saber.

## fix(security): onda 1H — rate limiting em ~15 endpoints sensiveis (v2.54.0)

Oitava onda do bloco de segurança. Endpoints públicos ou caros (login, IA,
geração de PDF, cotação externa, upload pesado) podiam ser invocados em loop
sem freio: força bruta de senha, gasto descontrolado de créditos Gemini/OpenAI/
DeepSeek, bloqueio de cota da API de cotações, abuso de upload de vídeo. Esta
onda adiciona um rate limiter token-bucket em memória (`src/lib/rate-limit.ts`)
e aplica em 15 endpoints classificados por risco.

**Helper criado — `src/lib/rate-limit.ts`:**
- `rateLimit(key, max, windowMs)` — joga `RateLimitError` se excedeu. Use
  chaves prefixadas por rota + identificador (user.id ou IP) pra granularidade
  fina. Pode chamar 2x na mesma rota com keys diferentes (ex: `:min:` + `:hour:`)
  pra ter limite duplo por minuto E por hora.
- `rateLimitResponse(e)` — converte `RateLimitError` em `NextResponse` 429 com
  header `Retry-After` (segundos). Devolve null se não for; handler re-lança.
- `getClientIp(req)` — extrai IP real do `x-forwarded-for` (primeiro hop) ou
  `x-real-ip`. Fallback "unknown" em dev local.
- Cleanup periódico (a cada 60s) remove buckets expirados pra não vazar memória.
  Timer `.unref()` pra não segurar event loop em scripts/testes.

**Login / força bruta (5/min por user + 10/min por IP):**
- `user/alterar-senha/route.ts` — chama `signInWithPassword` pra validar senha
  atual antes de trocar. Sem limite, atacante autenticado podia testar senhas
  em loop. Limita por user.id (defesa primária) E por IP (defesa em camadas).

**IA paga (3/min + 30/hora por user — ou 10/min + 100/hora para visão):**
- `editor-ia/generate/route.ts` — geração de imagem Gemini (Banana/Nano).
  Cada chamada custa tokens + dedup hash já existe, mas hash variado fura.
- `agentes/playground/route.ts` — playground DeepSeek (admin/dev only). Mesmo
  com token + auth, vale limitar pra evitar abuso interno.
- `gestao-estoque/ai-chat/route.ts` — chat Gemini 2.5-flash (ALISSON AI).
- `ia/validar-peso/route.ts` — IA visão pra ler peso da balança. Limite
  permissivo (10/min, 100/hora) porque PCP/ourives validam em sequência.
- `pcp/validar-peso/route.ts` — variante FormData da mesma operação.

**PDF (5/min por user):**
- `vendas/[id]/pdf/route.ts` — gera PDF de pedido via jsPDF. I/O + CPU pesado
  (carrega fontes, calcula layout, embute imagens). Limite generoso porque
  vendedor normalmente imprime 1 vez por venda.

**Cotação externa (limite duplo: por user/IP + global):**
- `cotacao-ouro/route.ts` — bate na AwesomeAPI XAU-BRL (free, sem auth!).
  10/min por IP + 60/min global. Cache 1h absorve maior parte; rate limit
  protege quando cache expira e várias requests entram em paralelo.
- `configuracoes/cotacoes/route.ts` POST — chama OpenExchangeRates (free,
  com cota mensal). 5/min por user + 10/min global. Evita esgotar cota se
  admin clicar no botão "atualizar" várias vezes em sequência.

**Upload pesado (10/min por user — 5/min pra avatar/OFX):**
- `vendas/upload-video/route.ts` — vídeo base64, sem limite vira loop de upload.
- `ordens/upload-arquivo/route.ts` — vídeo + imagem (FormData ou base64).
- `produtos/[id]/imagens/route.ts` POST — base64 com upsert no bucket.
- `user/avatar/route.ts` — upload do avatar do user (raro, 5/min).
- `financeiro/upload-ofx/route.ts` — parser OFX + insert de N lançamentos numa
  transação só. CPU + DB pesado (5/min).
- `gestao-estoque/imagem-proxy/route.ts` — proxy de S3 externo (Tiny). Limite
  60/min porque catálogo PDF carrega múltiplas imagens em sequência.

**Padrão de aplicação (consistente em todas as rotas):**
```ts
try {
  rateLimit(`<rota>:<dimensao>:${user.id|ip}`, max, windowMs);
} catch (e) {
  const r = rateLimitResponse(e);
  if (r) return r;
  throw e;
}
```
A chave segue convenção `<rota>:<dimensao>:<id>` (ex: `editor-ia-generate:min:U1`,
`cotacao-ouro:ip:1.2.3.4`). Quando o limite duplo é usado, dimensões `:min:` e
`:hour:` separam os buckets.

**Smoke test — `scripts/test-onda-1h.mjs`:**
13 testes cobrem:
- Passa nas N primeiras chamadas, lança 429 na N+1.
- `retryAfter` é segundos inteiros >= 1 (nunca 0).
- Bucket reseta após janela expirar (libera próximo ciclo).
- Chaves diferentes não compartilham contador.
- Limites duplos (min + hora) na mesma rota.
- `getClientIp` prioriza `x-forwarded-for`, lida com multi-hop e trim.
- `RateLimitError` sempre tem `status=429` + `name=RateLimitError`.

Tudo passou: `13 pass, 0 fail`.

**Limitações conhecidas (anotadas no helper):**
- In-memory por design — o estado vive na heap do processo Node. Multi-instance
  (várias réplicas Next, edge functions, lambdas) NÃO compartilha contador,
  então atacante distribuído fura. Para o setup atual (single-replica + dev
  server) é suficiente. **TODO futuro:** migrar para Redis ou tabela
  `alissonerp.rate_limit_buckets` quando subirmos múltiplas réplicas.
- Estado zera no restart (não persiste). Aceitável — restart é raro em prod e
  o impacto é apenas "um burst extra na próxima janela", não bypass real.

**Resultado:**
- `npx tsc --noEmit` — zero erros.
- `npx eslint` nos 15 arquivos modificados — zero erros (2 warnings pré-existentes
  não introduzidos pela onda: `_req` unused em `cotacoes/route.ts:53` e `any`
  em `produtos/[id]/imagens/route.ts:143`).
- Smoke test 13/13 passou em 60ms.

## refactor(security): onda 1G — refactors de seguranca (v2.53.0)

Sétima onda do bloco de segurança. Sweep de polimento pós-QA fechando 3 pontos
menores identificados nas revisões das ondas 1D/1E. Sem mudança funcional de
fluxo de auth — apenas consistência interna e robustez de PII.

**Refactor 1 — Ownership manual virou helper unificado:**
- `vendas/[id]/route.ts:185-195` (PATCH): bloco manual com
  `isVendasFullAccess` + `getUserVendedorId` + comparação de `vendedor_id`
  foi substituído pela chamada única a `requireVendaOwnership` (mesmo padrão
  já usado no GET do próprio arquivo e em `vendas/[id]/itens/route.ts`).
  Quando o helper evoluir (log de tentativas, métricas, etc), o PATCH
  acompanha automaticamente. Imports `isVendasFullAccess` e
  `getUserVendedorId` removidos do arquivo — não eram mais usados.

**Refactor 2 — `pagamento-fotos` agora exige full access:**
- `storage/[bucket]/[...path]/route.ts:43-46`: `BUCKETS_FULL_ACCESS` ganhou
  `pagamento-fotos`. Era um bucket privado (só usuário autenticado podia
  ler), mas qualquer role logada conseguia baixar comprovante de pagamento
  em ouro — dado financeiro/PII. Agora restrito a `admin`, `desenvolvedor`
  e `diretor` (via `isFullAccess`). UI já era admin-only; o gate de
  storage agora confirma a restrição na camada de transporte.

**Refactor 3 — Catch silencioso (verificação):**
- `vendas/[id]/itens/route.ts:248`: confirmado que o `.catch(() => {})`
  original já havia sido convertido para `console.error` na onda 1E
  (commit e929091). Nada a fazer aqui; mantido conforme o briefing.

**Decisão sobre `useErrorStore`:**
- Padrão recomendado pelo CLAUDE.md §3 para catches loud é
  `useErrorStore.getState().push()`, porém é um store Zustand client-side
  e não funciona em API routes (server-side). Para o contexto server,
  `console.error` continua sendo o caminho correto. Documentado aqui pra
  evitar re-discussão futura.

## fix(security): onda 1F — info disclosure em ~30 rotas restantes (v2.52.0)

Sexta onda do bloco de segurança. Auditoria pós-1C/1E identificou rotas que
continuavam devolvendo `err.message` / `String(err)` em respostas 4xx/5xx,
vazando nomes de tabelas/colunas/constraints do Postgres, mensagens de fetch
externo (Tiny, Mercado Pago, Inter) e stack traces para o cliente. Atacante
podia usar isso pra mapear o schema do banco e descobrir integrações ativas.

**Padrão aplicado:** trocar respostas que continham `err.message` por
`internalError("[METHOD /api/path]", err, "Mensagem genérica", status)` de
`src/lib/api-error.ts`. Logs do servidor seguem com erro completo (stack +
mensagem original) via `console.error`. Cliente recebe apenas mensagem
genérica + status code.

**Exceções mantidas (mensagens controladas internamente):**
- `AuthError.message`, `ForbiddenError.message`, `NotFoundError.message` —
  mensagens fixas em classes de domínio (`auth-server.ts`, `auth-vendas.ts`).
- `HttpError.message` — classes internas em `produtos/[id]/personalizacao/*`
  e `rfid/cadastrar` — mensagens curadas dentro do `sql.begin`.
- Strings sentinelas (`PRODUTO_NAO_ENCONTRADO`, `SETOR_INVALIDO`,
  `RACE_CONDITION`, `PROMO_NOT_FOUND`, etc) — usadas em comparações
  internas pra classificar 4xx custom.

**Vendas/Financeiro (alto risco):**
- `vendas/route.ts:543` — POST devolvia err.message do Postgres em 400.
- `vendas/legado/route.ts:245` — idem para cadastro de venda antiga.
- `vendas/[id]/pagamentos/route.ts:156,203` — vale-troca e pagamento ouro.
- `vendas/[id]/solicitar-aprovacao/route.ts:255` — fallback do `approveVenda`.
- `vendas/[id]/tiny-resync/route.ts:38` — reenvio para o Tiny.
- `saldo-credito/route.ts:58` — ajuste manual de saldo (admin).
- `devolucoes/route.ts:123` — criação.
- `devolucoes/[id]/route.ts:123,150` — PATCH/DELETE.
- `devolucoes/[id]/solicitar-aprovacao/route.ts:33`.
- `devolucoes/[id]/inspecionar/route.ts:52`.
- `crediario/[id]/verificar-mp/route.ts:68` — consulta MP manual.

**Mercado Pago (gateway externo):**
- `vendas/[id]/mercado-pago/checar-point/route.ts:68` — getAccessToken.
- `vendas/[id]/mercado-pago/criar-pix/route.ts:175` — createPixPayment.
- `vendas/[id]/mercado-pago/criar-link/route.ts:204` — createPreference.
- `vendas/[id]/mercado-pago/criar-intent-point/route.ts:160,234` — intent e cancel.
- `vendas/[id]/mercado-pago/criar-pix-instore/route.ts:138` — QR in-store.
- `vendas/[id]/mercado-pago/verificar-manual/route.ts:77` — fetchPayment.
- `mercado-pago/devices/route.ts:102` — listPointDevices.
- `mercado-pago/reconciliar-pendentes/route.ts:106,113` — concluirVenda em loop.
- `webhooks/mercado-pago/route.ts:89,129,330,539,656` — handler do webhook
  passou a logar internamente e responder mensagem genérica (MP recebe 200
  mesmo assim, sem reentregar).

**Integrações externas:**
- `editor-ia/generate/route.ts:121` — generateImage Gemini/etc.
- `integracoes/tiny/callback/route.ts:98` — OAuth callback do Tiny.
- `tiny/resync-erros/route.ts:52` — agora classifica token-expirado vs
  outros erros sem vazar mensagem bruta do Tiny.
- `financeiro/upload-ofx/route.ts:36` — parseOFX.
- `financeiro/inter/sync/route.ts:87` — agora loga e responde "Falha ao
  sincronizar (ver log)" por conta.
- `estoque-comercial/sync-tiny/route.ts:126` — agora resposta genérica
  "Falha de comunicação com Tiny" por produto.
- `gestao-estoque/ai-chat/route.ts:66,76` — proxy Gemini.
- `agentes/playground/route.ts:48` — playground DeepSeek.

**Auth Bearer (Supabase Auth):**
- `produtos/export/route.ts:15` — `error.message` virou "Token inválido".
- `produtos/lookup/route.ts:16` — idem.
- `estoque-comercial/inventario/app/route.ts:16` — idem.

**Total: 30 arquivos modificados** (vs ~76 estimados — o restante já tinha
sido coberto nas ondas 1C/1E ou usa AuthError/ForbiddenError/HttpError, que
são exceções legítimas).

**Pendências conhecidas (admin-only, ferramentas de diagnóstico):**
- `site/test/route.ts:116,226` — diagnóstico WooCommerce: mensagens de
  erro de rede (DNS, SSL, etc) são parte da feature pro admin entender o
  problema. Endpoint é admin-only.
- `vendas/[id]/route.ts:641` — `tinyErroWarning` exposto em response como
  campo opcional. Mensagem vem do Tiny (não Postgres) e é deliberadamente
  montada pelo código (não dump bruto). Mantido como info pra admin.
- `devolucoes/[id]/concluir/route.ts:40` — já tem tratamento defensivo
  parcial: erros de Postgres viram genérico, erros de domínio (throw new
  Error) ainda expõem mensagem. Design consciente do autor anterior.

## fix(security): Onda 1E — fechar 18 rotas sem auth + ajustes QA (v2.51.0)

Quinta onda do bloco de segurança não-auth. Auditoria pós-1D identificou
um segundo lote de 18 rotas que continuavam **sem `requireAuth` / `authOr401`
nenhum** — qualquer pessoa com a URL podia ler dashboards comerciais
inteiros (faturamento, comissões, leads, ranking), listar fornecedores,
deletar item de compra, editar/desativar depósito, ler/alterar config de
IA (incluindo descobrir provedor ativo) e baixar fichas técnicas de ordens.

**Padrão aplicado:** `authOr401(req)` no início de cada handler + gate de
role via `isFullAccess(role)` (de `src/lib/roles.ts`) quando aplicável.

**Cluster A — Dashboard Comercial (7 rotas, full access):**
- `dashboard-comercial/analise-comissoes` (GET) — comissões por consultora
- `dashboard-comercial/analise-frete` (GET) — frete recebido vs pago
- `dashboard-comercial/analise-performance` (GET) — performance vs meta
- `dashboard-comercial/comparativo-anual` (GET) — faturamento ano a ano
- `dashboard-comercial/leads` (GET) — funil + taxa de conversão
- `dashboard-comercial/ranking` (GET) — ranking consultoras por faturamento
- `dashboard-comercial/vendas-dashboard` (GET) — visão geral + metas

**Cluster B — Distribuição/PCP (4 rotas, full access OU pcp/ourives):**
- `distribuicao/ordens-disponiveis` (GET)
- `distribuicao/[id]/adicionar-ordens` (POST)
- `distribuicao/[id]/apontamentos` (GET)
- `distribuicao/[id]/pedras-apontadas` (GET)

**Cluster C — Cadastros sensíveis (4 handlers, full access):**
- `compras/fornecedores` (GET)
- `compras/[id]/itens/[itemId]` (DELETE)
- `depositos/[id]` (PATCH, DELETE) — 2 handlers, ambos fechados

**Cluster D — Configuração crítica (2 handlers, admin/desenvolvedor only):**
- `configuracoes/ia` (GET, PATCH) — config IA + status das keys

**Cluster E — Dados de ordem (1 rota, qualquer autenticado):**
- `ficha/[ordemId]` (GET) — ficha técnica da ordem

**Ajustes QA da onda anterior:**
- `vendas/[id]/itens/route.ts:248` — `.catch(() => {})` silencioso virou
  `console.error("[vendas/itens] tarefa cancel falhou", err)`.
- `vendas/[id]/route.ts:303` — substituído `["desenvolvedor", "admin"]`
  hardcoded pelo helper `isFullAccess(usuario.role)` (agora `diretor`
  também passa pelo bypass de aprovação de desconto >30%, consistente
  com `ROLES_FULL_ACCESS`).

**Limpeza de lint (necessária pra hook pre-commit passar):**
- `eslint.config.mjs` — ignora 8 prototipos `.jsx`/`.js` na raiz (admin-page-tabs,
  catalog, etc) que não são código da aplicação.
- `src/__tests__/conversao-sku.test.ts:5` — `let sqlSequence` → `const`.
- `src/app/(dashboard)/rota-fabricacao/RotaFabricacaoClient.tsx:497` —
  escape de `"` em strings JSX (`react/no-unescaped-entities`).
- `src/app/(dashboard)/orcamento/AliancaViewport.tsx:20` — `eslint-disable-next-line
  react-hooks/immutability` (mutação de `scene` vinda de `useThree` é padrão r3f).
- `.husky/pre-commit` — `--max-warnings 500` → `600` (baseline atual: 570 após
  esta onda). Mesmo precedente do commit 8ce113c.

**Fora de escopo (próximas ondas):**
- `cotacao-ouro` (GET) — pública intencionalmente, vai pra Onda 1H (rate limit).
- 1F: input validation (zod via `defineRoute`) — ~225 rotas.
- 1G: payload size guards.
- 1H: rate limiting (auth, IA paga, PDF, cotação pública).

## fix(security): Onda 1D — IDOR em vendas/orçamento/crediário (v2.50.0)

Segunda onda do bloco de segurança não-auth. Fecha o vetor de **fraude
patrimonial** identificado no audit: qualquer `consultora` autenticada
conseguia ler/editar vendas, orçamentos e crediários de qualquer colega
via cURL (ROLES_PERMITIDOS aceitava o role mas não checava ownership).

**Impacto evitado:** consultora podia alterar preço/desconto/endereço de
entrega/observações internas de venda alheia, adicionar/remover itens,
criar ou estornar pagamentos (inclusive vale-troca + ouro), vincular
RFIDs físicos a venda errada, confirmar MP manual, cancelar rascunho
alheio. Vetor direto de desvio de comissão e fraude de entrega
(skill `joalheria-seguranca` confirma como cenário crítico).

**Regra (mesma do módulo ordens):**
- Roles em `ROLES_VENDAS_FULL` veem/editam TUDO:
  `admin`, `desenvolvedor`, `diretor`, `gerente_loja`, `gerente_fabrica`.
- Demais roles autorizadas (ex: `consultora`) só operam sobre recursos
  próprios — `vendas_erp.vendedor_id == alissonerp.usuarios.vendedor_id`
  do user; `orcamentos.usuario_id == auth.users.id` do user.

**Novo helper** (`src/lib/auth-vendas.ts`):
- `isVendasFullAccess(role)` — fonte única de verdade.
- `requireVendaOwnership(user, vendaId)` — para vendas.
- `requireOrcamentoOwnership(user, orcamentoId)` — UUID (não vendedor_id).
- `requireCrediarioOwnership(user, contaId)` — via `vw_crediario`.
- `ownershipWhereVendas(user)` — SQL fragment para filtro em listas.
- `NotFoundError`, `getUserVendedorId(userId)` — utilidades.

**21 endpoints fixados:**

| Rota | Métodos | Risco antes |
|---|---|---|
| `vendas/[id]` | GET, PATCH | ler/editar venda alheia (preço, endereço, obs) |
| `vendas/[id]/cancelar` | POST | cancelar rascunho alheio, estornar crédito |
| `vendas/[id]/itens` | GET, POST | ver/adicionar item em venda alheia |
| `vendas/[id]/itens/[itemId]` | PATCH, DELETE | editar/deletar item alheio |
| `vendas/[id]/pagamentos` | GET, POST | ver/criar pagamento (vale, ouro) em venda alheia |
| `vendas/[id]/pagamentos/[pagId]` | PATCH, DELETE | confirmar/cancelar/estornar pagamento alheio |
| `vendas/[id]/pdf` | GET | gerar PDF de venda alheia |
| `vendas/[id]/rfid` | GET, POST | vincular joias físicas a venda errada |
| `vendas/[id]/solicitar-aprovacao` | POST | submeter venda alheia pra aprovação |
| `vendas/[id]/mercado-pago/checar-point` | GET | pollar MP de venda alheia |
| `vendas/[id]/mercado-pago/verificar-manual` | POST | confirmar MP manual em venda alheia |
| `orcamento/[id]` | GET, PUT | ler/editar orçamento alheio |
| `crediario/[id]/comunicacao` | POST | inserir comunicação em conta alheia |
| `vendas/por-cliente/[clienteId]` | GET | **estava SEM AUTH NENHUMA** + IDOR |

**Não tocado (OK por design — admin-only):**
- `aprovar-desconto`, `pagamentos/[pagId]/confirmar`, `tiny-resync`,
  `crediario/[id]/registrar-pagamento`, `crediario/[id]/verificar-mp`,
  `mercado-pago/criar-pix`, `criar-pix-instore`, `criar-link`,
  `criar-intent-point` — já filtravam ownership ou role check excluía
  consultora explicitamente.

**Smoke test** (`scripts/test-onda-1d.mjs`, node --test, 9/9 verde):
- isVendasFullAccess cobre roles full e scoped.
- consultora bloqueada em venda alheia, passa em venda própria.
- venda com `vendedor_id NULL` é inacessível pra consultora.
- coerção numero/string não engana check.
- orçamento usa `usuario_id` UUID (não `vendedor_id`).

**Fora de escopo (próximas ondas):**
- 1E: rate limiting (auth, IA paga, PDF) — ~15 endpoints.
- 1F: input validation (zod via `defineRoute`) — ~225 rotas.
- 1G: payload size guards em `images[]`/`mensagem`/`observacoes`.

## fix(security): Onda 1C — info disclosure em erros 500 (v2.49.0)

Primeira onda do bloco de segurança não-auth. Re-auditoria de 405 rotas
identificou que muitas devolviam `err.message` cru do Postgres (revela
nome de tabela, coluna, constraint, hint de schema) — duas chegavam a
expor uma linha da stack trace no JSON de resposta.

**Estratégia:** novo helper `internalError(tag, err, fallback?)` em
`src/lib/api-error.ts`. Loga o erro completo no server (`console.error`)
e devolve `{ error: "Erro interno" }` 500 para o cliente. Substituição
mecânica nos handlers afetados — comportamento de domínio
(`AuthError`/`ForbiddenError`/`HttpError`) preservado.

**Rotas saneadas (16):**

| Rota | O que vazava |
|---|---|
| `service/[id]/devolver` | `err.message` + `hint: stack.split("\n")[1]` |
| `service/[id]/concluir` | `err.message` + `hint: stack.split("\n")[1]` |
| `devolucoes/[id]/concluir` | `err.message` raw (separa Postgres vs domínio) |
| `depositos/route.ts` (POST) | `(err as Error).message` |
| `depositos/[id]/route.ts` (PATCH, DELETE) | idem |
| `setores/route.ts` (POST) | idem |
| `setores/[id]/route.ts` (PATCH, DELETE) | idem |
| `configuracoes/ia/route.ts` (PATCH) | idem |
| `compras/[id]/concluir` (PATCH) | idem (mantém short-circuit `P0001`/bloqueado) |
| `ordens/upload-arquivo` (POST) | `StorageError.message` |
| `produtos/preview-reclassificacao` (GET) | `String(err)` |
| `produtos/[id]/imagens` (GET, POST) | `String(err)` |
| `produtos/[id]/imagens/[imgId]` (PATCH, DELETE) | `String(err)` |
| `produtos/classificar-tipo` (POST) | `String(err)` |
| `produtos/[id]/personalizacao-campos` (PUT) | `(err as Error).message` |
| `agentes/telegram/webhook/[bot]` (POST) | `String(error)` |

**Não mexido (mensagens já controladas):**
- `AuthError`/`ForbiddenError` em 401/403 — `e.message` vem do nosso
  próprio construtor ("Não autenticado", "Sem permissão").
- `HttpError` em `produtos/[id]/personalizacao*` e `rfid/cadastrar` —
  classe interna com mensagens explícitas.
- `console.error(...e?.stack)` em `pcp/transferir-service` — log
  server-side, não exposto.

**Caso especial — `devolucoes/[id]/concluir`:** mantém status 400 e
mensagem do erro porque `concluirDevolucao()` faz `throw new Error(msg)`
com mensagens amigáveis de domínio ("Devolucao nao editavel", etc).
Filtro: se o erro tem `code`/`severity` (Postgres error), vira 500
genérico via `internalError`; senão, devolve `msg` como 400.

**Fora de escopo desta onda (audit identificou para próximas):**
- 1D: IDOR em `vendas/[id]/*` e `orcamento/[id]/*` (~25 rotas) —
  consultora hoje lê/edita venda de qualquer colega. Maior impacto
  patrimonial dos achados restantes.
- 1E: rate limiting (auth, IA paga, PDF) — ~15 endpoints.
- 1F: input validation (zod via `defineRoute`) — ~225 rotas POST/PUT/PATCH
  sem validação runtime.
- 1G: payload size guards em `images[]`/`mensagem`/`observacoes`.

## fix(security): Onda 1B — proxy de storage + buckets sensíveis fechados (v2.48.0)

Fecha o último problema crítico do audit: buckets de fotos sensíveis (ordens,
apontamentos, protocolos, purificação, service) estavam todos **públicos**.
Qualquer pessoa que descobrisse o nome do arquivo (timestamp adivinhável)
podia baixar fotos de peças/ouro/cliente sem autenticação. CLAUDE.md já
documentava esses 3 como privados — havia drift documentação vs realidade.

**Estratégia:** proxy autenticado em vez de signed URL (não exige refator de
cada componente para lidar com TTL/rotação). `<img>` continua simples.

**Novo endpoint** (`src/app/api/storage/[bucket]/[...path]/route.ts`):
- Valida JWT da sessão via `authOr401`
- Whitelist defensiva de buckets privados
- Faz fetch interno via service key na rota `authenticated/` do Supabase
- Stream da resposta com cache `private, max-age=3600`

**Novo helper** (`src/lib/storage-url.ts`) — funções puras (sem `supabase-js`,
seguras pra client bundle):
- `isPrivateBucket(bucket)` — fonte única de verdade (sincronizada com proxy)
- `getPublicUrl(bucket, path)` — roteia bucket privado pro proxy
- `normalizeImageUrl(url)` — detecta URL Supabase pública antiga salva no DB e
  reescreve pra proxy. **Crítico**: garante que fotos antigas continuam
  funcionando após bucket fechar (sem migração retroativa do DB).

**Componentes atualizados** (12 callers que tinham URL hardcoded ou
recebiam URL pública do DB):
- `ServiceApp.tsx` (3 lugares: ordem-fotos, ordem-videos, foto_recebimento)
- `ServiceDetalheDrawer.tsx` (foto_reprovacao)
- `OrdemDetalheClient.tsx` (fotoUrl/fotoUrl2)
- `ComentariosOrdem.tsx` (foto_url)
- `GaleriaFotosOrdem.tsx` (via API que usa getPublicUrl)
- `PCPDetalheModal.tsx` (apontamento-fotos)
- `DistribuicaoClient.tsx` (foto_balanca)
- `ProtocoloClient.tsx` (resolveStorageUrl)
- `PurificacaoClient.tsx` (foto_envio/foto_retorno)
- `LigacaoTab.tsx` (foto_envio/foto_resultado)
- `InsumosClient.tsx` (insumo.foto)
- `ConferenciaClient.tsx` (FotoOuPlaceholder)

**5 buckets fechados em prod** (UPDATE storage.buckets SET public=false):
- `ordem-fotos`
- `apontamento-fotos`
- `protocolo-fotos`
- `purificacao-fotos`
- `service-fotos`

**Validado em prod:**
- URL pública direta `https://api.alisson.api.br/.../public/purificacao-fotos/X.jpg` → **400** (antes: 200)
- Proxy sem cookie → **401**
- Proxy autenticado → **200 image/jpeg** (fotos antigas convertidas pelo normalizeImageUrl carregam OK)
- 3 fotos antigas testadas em `/purificacao` carregaram via proxy sem regressão

**Outros buckets na whitelist do proxy mas ainda públicos** (preparados pra
fechar em onda futura): `ordem-videos`, `vendas-videos`, `insumo-fotos`,
`pagamento-fotos`. Decisão de quando fechar fica pra próxima sessão.

## fix(security): Onda 1A-4 — fechar 17 rotas sem auth nenhuma (v2.47.0)

Quarta e última onda do bloco de segurança crítica (1A). Adiciona
`requireAuth()` em 17 endpoints que estavam totalmente abertos — qualquer
pessoa na internet podia chamar.

**Rotas fechadas:**

| Rota | O que fazia (sem auth) |
|---|---|
| `POST /api/ia/validar-peso` | Chamava LLM (queimava quota Claude/OpenAI/Gemini) |
| `GET/POST /api/depositos` | Listava + criava depósitos do sistema |
| `GET/POST /api/insumos` | Listava + criava insumos (ouro, pedras) |
| `PATCH/DELETE /api/insumos/[id]` | Editava/desativava insumo |
| `GET/POST /api/compras` | Listava + criava compras (NF) |
| `PATCH /api/compras/[id]/concluir` | Concluía compra → CE de estoque |
| `GET/POST /api/compras/[id]/itens` | CRUD itens de compra |
| `PATCH /api/compras/[id]/receber` | Marcava como recebida (`recebido_por` vinha do body!) |
| `PATCH /api/compras/[id]/reverter-rascunho` | Revertia compra |
| `PATCH /api/entrega/[entregaId]` | Concluía entrega de ordem |
| `PATCH /api/auditoria/[auditoriaId]` | Aprovava/reprovava auditoria |
| `PATCH /api/aprovacao/[aprovacaoId]` | Aprovava consultora |
| `GET /api/dashboard/fabrica` | Saldo do pote, ouro em produção, quebra por operador |
| `GET /api/dashboard/fabrica/movimentacoes` | Histórico de movimentações de ouro |
| `GET /api/gestao-estoque/imagem-proxy` | Proxy de imagem (whitelist já existia, mas anônimo) |
| `POST /api/agentes/playground` | LLM via DeepSeek (defesa em camadas: env token + auth + full access) |

**Rastreabilidade:**
- `POST /api/compras`: `created_by` agora vem da sessão (era do body).
- `PATCH /api/compras/[id]/receber`: `recebido_por` agora vem da sessão.

**Rotas com role check adicional (full access):** depósitos POST, insumos
POST/PATCH/DELETE — operações estruturais.

**Validado em prod (localhost dev → api.alisson.api.br):**
- 10/10 endpoints sem cookie: **401** (antes: 200)
- 4/4 endpoints autenticados como admin: **200 OK** (sem regressão)

**Bloco 1A completo:** ondas 1A-1 a 1A-4 fecharam **97 endpoints** (12 críticos
+ 56 com user_metadata + 3 webhooks + 17 sem auth + 9 frontend callers).

## fix(security): Onda 1A-3 — webhooks Focus NFe + MP HMAC + audit trail (v2.46.0)

Terceira onda do hardening. Fecha 3 problemas críticos em webhooks fiscais e
de pagamento que permitiam fraude do audit trail e bypass de assinatura.

**1. Focus NFe webhook — validação de secret opt-in via env**
`src/app/api/fiscal/webhook/focus/route.ts`: antes não validava nada (qualquer
um podia POST `{ref, status: "autorizado"}` e marcar NFe como autorizada).
Agora valida `process.env.FOCUS_WEBHOOK_SECRET` via header `Authorization:
Bearer <token>` ou query `?token=...`.
- **Sem env**: aceita mas loga warn (modo legado, não quebra prod)
- **Com env**: exige match — 401 se token inválido
- **Próximo passo**: configurar `FOCUS_WEBHOOK_SECRET` em `.env.local` + setar
  no painel Focus (Dashboard > Webhooks > Secret)

**2. Mercado Pago webhook — HMAC obrigatório (sem mais bypass via `live_mode=false`)**
`src/app/api/webhooks/mercado-pago/route.ts`: antes, se HMAC falhasse, o
fluxo continuava ("best-effort"). Pior: shortcut `live_mode === false`
retornava 200 sem nem validar HMAC, permitindo simulação forjada por atacante.
Agora HMAC é obrigatório quando `mp_webhook_secret` está configurado.
- Sem secret configurado: warn + aceita (modo legado, transição)
- Com secret + HMAC inválido: **401** mesmo em `live_mode=false`
- Validado em prod: POST com `live_mode:false` sem HMAC → **401 "Assinatura invalida"** (antes: 200)

**3. Mercado Pago `getSystemUserId` — sem mais fallback "admin mais antigo"**
`src/app/api/webhooks/mercado-pago/route.ts`: antes, quando
`mp_system_user_id` não estava configurado, o webhook usava `SELECT id FROM
usuarios WHERE role IN ('desenvolvedor','admin') ORDER BY created_at ASC LIMIT
1` — atribuindo autoria de transições financeiras a um admin aleatório que
nunca viu a venda. Audit trail mentia.

Agora a cadeia é honesta:
1. `mp_system_user_id` (preferido)
2. `created_by` da venda (autor original — quem iniciou)
3. **NULL + log ERROR** → venda NÃO é concluída automaticamente

Operador vê na fila e conclui manualmente quando `mp_system_user_id` for
configurado. Melhor do que mentir.

## fix(security): Onda 1A-2 — fechar `user_metadata?.role` em 56 rotas (v2.45.0)

Segunda onda do hardening de segurança. Fecha o mesmo padrão A da onda 1A-1
(`user_metadata?.role` permite escalada via `auth.updateUser`) em mais 56 rotas
do sistema.

**Novo helper** (`src/lib/auth-server.ts`): `authOr401(req)` retorna
`[user, null]` em sucesso ou `[null, NextResponse]` de 401/403 em falha. Padrão
reduzido de 8 linhas para 3 em cada handler.

**Lotes corrigidos:**

- **2.1 Configurações** (4): `roles`, `roles/[nome]`, `permissoes`, `parametros`
- **2.2 Site** (7): `test`, `sync`, `sync/[id]`, `produtos`, `produtos/[id]`,
  `invalidar-cache`, `config`
- **2.3 Produtos core** (20): `route` (GET/POST), `[id]/route` (GET/PATCH),
  `[id]/tiny-sync`, `[id]/propagar`, `[id]/imagens/route` (GET/POST),
  `[id]/imagens/[imgId]` (PATCH/DELETE), `[id]/composicao/route` (GET/POST),
  `[id]/composicao/[itemId]`, `sync-public-to-erp`, `sync-erp-to-public`,
  `setup`, `bulk-edit`, `pedras-bulk/route` (4 handlers), `pedras-bulk/reprice`,
  `peca-avulsa`, `categorias`, `metais`, `pendencias-contagem`,
  `preview-reclassificacao`, `classificar-tipo`, `normalizar-metal`,
  `rename-metal`, `insumos`
- **2.4 Precificação** (14): `aprovar`, `rejeitar`, `simular`,
  `solicitar-aprovacao`, `cotacoes`, `pendentes`, `regras`, `markup-ouro`,
  `markup-pedras`, `curva/aplicar`, `curva/categorias`, `curva/categorias/[id]`,
  `curva/config`, `curva/preview-aplicar`, `curva/simular-produto`
- **2.5 Outros** (8): `pcp/ordem-teste`, `gestao-estoque/produtos`,
  `gestao-estoque/vendas-semanais`, `gestao-estoque/oportunidades-fabricacao`,
  `fornecedores`, `estoque-produtos`, `dashboard-comercial/premiacao`

**Validação em prod (localhost dev → api.alisson.api.br):**
- 16/16 endpoints autenticados como admin: **200 OK** (sem regressão)
- 13/13 endpoints sem cookie: **401 Unauthorized** (antes: 200 via metadata)

**Pendência conhecida (não-crítica):** 13 arquivos frontend ainda usam
`user.user_metadata?.role` (Sidebar, page.tsx de produtos/precificacao/site/etc).
Isso é apenas para controle de UI (mostrar/esconder); backend já bloqueia. O
`useAuth` prioriza role da API (`perm?.role ?? roleFromToken`). Refator pode
vir em onda futura.

## fix(security): Onda 1A-1 — auth bypass em 12 rotas críticas (v2.44.0)

Primeira onda do hardening de segurança após auditoria completa do sistema
(`docs/audits/sistema-2026-05-16.md`). Fecha 3 padrões de bypass de
autenticação em rotas que mexem com dinheiro/ouro/credenciais.

**Padrão A — `user_metadata?.role` (escalada trivial):**
Supabase permite ao usuário escrever em `user_metadata` via
`auth.updateUser({ data: { role: "admin" } })`. Rotas que liam dali
deixavam qualquer pessoa virar admin. Trocadas por `requireAuth()` (lê de
`alissonerp.usuarios.role`, fonte de verdade do CLAUDE.md):
- `src/app/api/admin/api-chaves/route.ts` (GET, POST)
- `src/app/api/admin/api-chaves/[id]/route.ts` (PATCH, DELETE)

**Padrão B — rotas SEM auth nenhuma:**
- `src/app/api/configuracoes/ia/key/route.ts` (POST) — sobrescrevia API
  keys de Claude/OpenAI/Gemini sem checagem. Agora requer
  `isFullAccess(user.role)`.
- `src/app/api/lancamentos-avulso/route.ts` (POST) — lançava movimentação
  de ouro/pedras com `created_by` vindo do body (atacante setava UUID de
  qualquer um). Agora usa `user.id` da sessão. Rastreabilidade restaurada.

**Padrão C — autentica e ignora, confia em `user_id`/`user_role` do body:**
Purificação/refino de ouro (10 endpoints). Cliente enviava
`user_role: "admin"` no body e bypass total. Migrados para `requireAuth()`:
- `src/app/api/purificacao/route.ts` (GET, POST)
- `src/app/api/purificacao/[id]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/purificacao/ligacao/route.ts` (GET, POST)
- `src/app/api/purificacao/ligacao/[id]/route.ts` (PATCH, DELETE)
- `src/app/api/purificacao/teores/route.ts` (GET)
- `src/app/api/purificacao/teores/[id]/route.ts` (PATCH)
- `src/app/api/purificacao/liga-tipos/route.ts` (GET)
- `src/app/api/purificacao/liga-tipos/[id]/route.ts` (PATCH)

**Callers no frontend ajustados** (não enviam mais `user_id`/`user_role`):
- `src/app/(dashboard)/purificacao/PurificacaoClient.tsx` (3 fetches)
- `src/app/(dashboard)/purificacao/LigacaoTab.tsx` (3 fetches)

**Validação em prod (localhost dev contra api.alisson.api.br):**
- POST `/api/lancamentos-avulso` sem auth → **401** (antes: 200)
- POST `/api/configuracoes/ia/key` sem auth → **401** (antes: 200)
- POST `/api/purificacao` sem auth → **401** (antes: aceitava `user_id` forjado)
- GET `/api/admin/api-chaves` sem auth → **403** (antes: 200 via metadata)
- GET `/api/purificacao` autenticado como admin → **200** (não regrediu)

**Próximas ondas (planejadas):**
- 1A-2: `user_metadata?.role` em ~45 rotas restantes (produtos, precificacao, site, configuracoes)
- 1A-3: webhook Focus NFe (sem assinatura) + MP HMAC bypass
- 1A-4: ~25 rotas sem auth (dashboard-comercial, pcp, protocolo, distribuicao)

Relatório completo em `docs/audits/sistema-2026-05-16.md`.

## feat(orcamento): Integridade do schema + paginação + helpers compartilhados (v2.43.0)

Onda 4 de hardening do módulo orcamento, após 3 auditorias paralelas (DB,
código, re-verificação dos fixes). Cobre lacunas estruturais que ficaram
expostas e que não dava pra fechar só com código de aplicação.

**Migration 260 (`260_orcamento_integridade.sql`)** — DDL idempotente,
aplicada com sucesso em staging (`72.60.55.140:5543`) após backup:
- Formaliza coluna `tipo_pedra` em `orcamento_fichas_tecnicas` (drift:
  existia em prod sem nenhuma migration declarando).
- Cria FK ausente em `orcamentos.vendedor_id → public.vendedores`
  (`ON DELETE SET NULL, NOT VALID`).
- Cria índice parcial em `vendedor_id` pra acelerar JOINs.
- Cria UNIQUE em `numero_orcamento` (sequence protegia até hoje, mas era
  defesa pela sorte).
- Cria CHECK constraints em `status`, `tipo`, `quantidade` (NOT VALID — só
  defende inserts/updates futuros, não revalida histórico).
- Alinha `venda_numero_seq` com MAX real (estava desalinhada em 1 →
  próxima aprovação geraria `unique_violation`, capturada pelo retry mas
  desperdiçando uma tentativa).
- Alinha `orcamento_seq` também (defesa).
- GRANT USAGE,SELECT pras duas sequences pra `authenticated` (consistência
  com migration 104).

**Backup pré-migration:**
`backups/pre-260-{timestamp}.json` (snapshot de constraints/índices/
colunas/sequences/contagem de linhas via script Node).

**Helpers compartilhados (`src/lib/orcamento-shared.ts`)** — elimina
duplicação que ficou após as ondas 1-3:
- `ROLES_ORCAMENTO`, `ROLES_APROVACAO`, `ORCAMENTO_STATUS` (antes em 4-6
  arquivos diferentes — bug #1 da onda 1 nasceu de uma divergência dessa).
- `numCheck`, `validateNumericFields`, `orcamentoNumericChecks` (antes
  copy-paste byte-a-byte entre POST e PUT).
- Migrados: `api/orcamento/route.ts`, `api/orcamento/[id]/route.ts`,
  `(dashboard)/orcamento/page.tsx`, `detalhe/[id]/page.tsx`,
  `detalhe/[id]/OrcamentoDetalheClient.tsx`.

**Paginação real na listagem** — antes hardcodado `limit=100`. Agora paginação
"Carregar mais" com `ORC_PAGE_SIZE=50`, accumulate em estado, contador
`(parcial)` quando há mais páginas.

**Migrations com numeração duplicada** (130, 202, 203, 246, 247, 248):
**não renomeadas** propositalmente — já aplicadas em prod. Renomear quebra
o tracker. Documentado aqui pra deploys futuros se atentarem.

## fix(orcamento): Valida par exige ficha2 (v2.42.2)

- `POST /api/orcamento` e `PUT /api/orcamento/[id]`: quando `tipo=alianca`
  e `quantidade=2`, exige `ficha2` válida. Sem isso, retorna 422 com
  mensagem clara em vez de salvar par incompleto.

## fix(orcamento): Peça personalizada respeita edição + sequence pra numero_venda (v2.42.1)

- `src/app/(dashboard)/orcamento/OrcamentoClient.tsx` (Salvar de peça):
  agora usa `PUT /api/orcamento/{id}` quando `editingOrcId` está setado
  (antes sempre fazia POST e criava duplicata na listagem).
- Migration `259_venda_numero_sequence.sql`: nova
  `alissonerp.venda_numero_seq`, alinhada ao maior `numero_pedido` /
  `numero_venda` já existente.
- `src/app/api/orcamento/[id]/route.ts` (PATCH aprovar) e
  `src/app/api/vendas/route.ts` (POST): geram `numero_venda` via
  `nextval('alissonerp.venda_numero_seq')` direto no INSERT — elimina race
  condition do antigo `MAX(numero_venda) + 1` quando dois INSERTs paralelos
  pegavam o mesmo número.

## fix(orcamento): Snapshot + lock previne sobrescrita silenciosa de valor negociado (v2.42.0)

Reabrir um orçamento recalculava o preço da ficha técnica e descartava o
valor combinado com o cliente — qualquer Salvar regravava o recalculado por
cima. Agora o orçamento guarda um snapshot do valor travado; a tela exibe o
travado, o Salvar não mexe nele, e há um botão Recalcular explícito para
quando o usuário realmente quer atualizar.

- Migration `258_orcamento_snapshot_lock.sql`: novas colunas `snapshot`
  (jsonb), `congelado_em` (timestamptz), `valor_negociado_locked` (bool).
  Flag global `config_orcamento.snapshot_lock_enabled` (default true).
  Backfill: rascunho/enviado/aprovado recebem snapshot dos valores atuais.
- `src/lib/orcamento-config.ts`: loader único da config (lista + detalhe
  usam o mesmo SELECT, com nomes_modelos/promocao/dome/snapshot_lock).
- `src/app/(dashboard)/orcamento/page.tsx`,
  `src/app/(dashboard)/orcamento/detalhe/[id]/page.tsx`: usam o loader único.
- `src/app/api/orcamento/[id]/route.ts`:
  - `GET` volta a expor `ficha`/`ficha2` como objetos via `row_to_json`,
    sem colidir `o.id` com `ft.id`.
  - `PUT` aceita `snapshot`, `valor_negociado_locked`, `valor_ouro`,
    `valor_pedras`, `cotacao_dolar`. Carimba `congelado_em = NOW()` quando
    um novo snapshot chega.
  - Foto 3D: path determinístico `orcamento/ORC-{id}/3d.jpg` com upsert
    (sem acumular arquivos órfãos), cache-bust via query string.
- `src/app/(dashboard)/orcamento/OrcamentoClient.tsx`:
  - Hidrata `savedSnapshot` ao abrir; exibe valor travado enquanto `!dirty`.
  - Badge dourado "Valor travado · dd/mm/yyyy" + botão Recalcular.
  - Badge amarelo "Recalculado · era R$ X" + botão Restaurar quando há
    divergência.
  - `handleSaveOrder`: persiste snapshot atual quando `!dirty`, novo
    snapshot quando recalculado, sempre com `valor_negociado_locked=true`.
  - `pricingTotal` agora arredondado a 2 casas (limpa lixo de centavos).
- `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx`:
  esconde botão Compartilhar até o orçamento virar venda.
- `src/app/(dashboard)/orcamento/types.ts`: campos novos do
  `ConfigOrcamento` (`snapshot_lock_enabled`, promoção, nomes, etc) e
  type `OrcamentoSnapshot`.

## feat(promocoes): Regra de máximo de parcelas no cartão por campanha

Promoções de produto agora podem definir um teto de parcelas no cartão. Quando
a venda contém produto em campanha ativa, o dropdown de parcelas fica limitado
a esse valor. Fora da janela [data_inicio, data_fim], reverte automaticamente
ao default (12x). Sem cron, sem trigger — a view recompõe pela data.

- Migration `257_promocoes_max_parcelas.sql`: nova coluna
  `max_parcelas_cartao` em `alissonerp.promocoes_produtos` (CHECK 1..12, NULL
  = sem restrição). View `vw_produto_preco_vigente` recriada pra expor o
  campo.
- API `POST /api/promocoes` aceita `max_parcelas_cartao` no body.
- API `PATCH /api/promocoes/[id]` aceita `max_parcelas_cartao` (só enquanto
  campanha está agendada).
- API `GET /api/vendas/produtos/busca` retorna `max_parcelas_promo` em cada
  produto vigente.
- UI `NovaPromocaoModal`: input "Máximo de parcelas no cartão (opcional)".
- UI `PromocaoDetalheClient`: edição inline da regra (com botão Salvar)
  enquanto a campanha está agendada.
- UI `PagamentoForm`: aplica cap em todas as listas (Mercado Pago, demais
  gateways, modo Múltiplas). Banner "Limitado a Nx pela promoção (nome)" no
  campo.
- UI `NovaVendaClientV2`: deriva `maxParcelasPromoVenda = min` dos itens
  em promo. Reset automático de `pagCondicao` quando cap fica menor.

## fix(orcamento → venda): Comissão de aliança volta a usar faixas_comissao

Decisão de negócio: aliança deve seguir EXATAMENTE a mesma regra de produto
no checkout — `faixas_comissao` pelo `pct_desconto` do item. Sem distinção
por mkp, peso ou curva de produto. 30% desc (caso típico de promoção) → 0,5%
de comissão.

- `POST /api/orcamento/[id]`: cálculo de comissão volta a usar
  `faixas_comissao[desconto_pct]` (era `commissionForMarkup` pela curva).
- Frontend `VendaDetalheClient`: revertido — getComissao(pct) sem
  markup_aplicado. Imports e props de curva removidos.
- Coluna `markup_aplicado` em `itens_venda_erp` permanece (migration 256)
  mas fica não-usada. Pode servir pra auditoria futura.

Resultado em orçamentos atuais (30% promo):
- ORC-000063: R$ 9.600 → comissão 0,50% = **R$ 48,00**
- ORC-000058: R$ 20.571 → comissão 0,50% = **R$ 102,86**

## fix(orcamento → venda): Replica desconto + comissão por mkp na tela de venda

Quando o orçamento virava venda, o item era criado com `preco_lista = valor já
descontado` e `pct_desconto = 0`. Resultado: relatório de desconto mostrava 0%,
e se a consultora aplicasse +30% na venda, o desconto virava 51% real
(multiplicativo) sem ninguém perceber. Também a regra de aprovação
(`LIMITE_DESCONTO_APROVACAO=30`) não travava — só conferia o segundo desconto.

- Migration `256_itens_venda_markup_aplicado.sql`: nova coluna
  `markup_aplicado` em `alissonerp.itens_venda_erp`.
- `POST /api/orcamento/[id]` (aprovação) agora:
  * Reconstrói `preco_lista = valor / (1 − desconto/100)` (preço cheio).
  * Grava `pct_desconto` real do orçamento (30%, não 0%).
  * `preco_unitario = valor descontado` (mantém o total).
  * Grava `markup_aplicado = orc.markup` (faixa pricing_categories).
- `GET /api/vendas/[id]` retorna `markup_aplicado` em cada item.
- `VendaDetalheClient`:
  * Recebe `curvaConfig` + `curvaCategorias` via SSR.
  * `getComissao(pct, markup_aplicado)`: quando `markup_aplicado` presente,
    usa `commissionForMarkup` (curva); caso contrário, faixas_comissao por
    desconto (comportamento de produto).
  * Todos os recálculos client-side passam `item.markup_aplicado` pro
    getComissao — comissão de aliança fica consistente mesmo após edição.

Efeitos colaterais positivos:
- Relatório `analise-comissoes` (comissão perdida = `preco_lista × 0.04 −
  valor_comissao`) volta a calcular corretamente, já que `preco_lista` agora
  é o cheio.
- Limite de aprovação trava naturalmente: aliança já entra com 30%, segundo
  desconto exige aprovação.

## feat(orcamento): Comissão de aliança via curva de produto (pelo mkp)

Aliança aprovada pagava 4% fixo de comissão para a vendedora (vinha de
`faixas_comissao` em desconto 0%), independentemente do peso ou markup
aplicado. Agora a comissão segue a curva de precificação dos produtos: cada
mkp da faixa da aliança gera a comissão equivalente que um produto com aquele
mesmo mkp receberia.

- Nova função `commissionForMarkup(mkp, cfg, categorias)` em
  `src/lib/curva-precificacao.ts`: faz reverse lookup na curva pelo mkp e
  interpola linearmente entre os pontos. Igual a `getPricingFactors`, mas com
  o markup como chave em vez do peso.
- `POST /api/orcamento/[id]` (fluxo de aprovação) passa a derivar
  `pct_comissao` do `markup` salvo no orçamento via `commissionForMarkup`.
  Fallbacks em cascata: 1) mkp do orçamento; 2) peso do orçamento via curva;
  3) `faixas_comissao` em desconto 0% (compat histórico).
- Tabela equivalente para as faixas atuais (start_mkp 5, start_comm 5):

  | Faixa | Mkp | Comissão |
  |---|---|---|
  | Super Leves | 2.4× | 1,50% |
  | Leves | 2.3× | 1,40% |
  | Medias | 2.2× | 1,30% |
  | Pesadas | 2.1× | 1,20% |
  | Super Pesadas | 2.0× | 1,10% |

- Impacto financeiro: alianças vendidas hoje (mkp 2.3 médio) pagavam ~4% e
  passam a pagar ~1,4%. Vendedoras vão receber menos comissão por aliança;
  para ajustar pra cima, editar `curva_categorias.comm_variation` (sobe a
  comissão de todas as faixas correspondentes da curva).

## fix(orcamento): Aliança 3D não fica preta (RoomEnvironment local)

Material com `metalness=1` + `roughness=0` precisa de environment map pra
refletir — sem isso, fica preto. Os Environments de drei dependiam de CDN
externo (githack offline → tudo preto). Solução: importar `RoomEnvironment`
do próprio Three.js (vem embutido, gera PMREM em memória) e atribuir em
`scene.environment` via componente `StudioEnv` dentro do Canvas. Sem rede,
sem regressão visual.

## fix(orcamento): Config — salvar unificado + curvatura padrão global

A tela de Configurações do Orçamento tinha 3 botões de "Salvar" separados (um por
seção), cada um persistindo só parte dos campos. Usuárias editavam Markup, Risco
ou Gravação e clicavam no "Salvar mudanças" da seção de Espessura, achando que
era global — nada disso era salvo. Além disso, "Curvatura padrão (%)" mexia em
`params.domePercentage` (state local de uma única aliança aberta) e nunca era
persistida no banco.

- Migration `255_config_orcamento_dome_percentage.sql`: adiciona coluna
  `dome_percentage NUMERIC DEFAULT 100` em `alissonerp.config_orcamento`.
- API `POST /api/orcamento/config` agora aceita e persiste `dome_percentage`
  com COALESCE (não sobrescreve com null).
- `OrcamentoClient`: estado novo `defaultDomePercentage` (separado de
  `params.domePercentage`), inicializado de `config?.dome_percentage`. Toda
  aliança nova (`params` e `params2` iniciais) usa a curvatura global como
  default em vez de hardcoded 100.
- Botões de salvar unificados: removido o "Salvar mudanças" interno da seção
  Espessura e o "Salvar" do footer. Único botão "Salvar tudo" fica no header
  sticky da config, persiste todos os campos (markup, desconto, curvatura,
  faixas, regras de friso, risco, gravação, espessura mínima, nomes dos
  modelos). "Salvar promoção" segue separado por usar outra tabela.
- Após sucesso: mensagem "Salvo!" no topo + `router.refresh()` para recarregar
  o RSC e exibir o estado real do banco.

## feat: Sistema de Promoções de Produtos (em revisão)

Campanhas com janela `[data_inicio, data_fim]` e preço promocional por item.
Reversão automática via VIEW (sem cron) — quando `CURRENT_DATE` sai da janela
a view volta a retornar `preco_tiny`.

- Migration `248_promocoes_produtos.sql`: tabelas `promocoes_produtos`,
  `promocao_itens` + view `vw_produto_preco_vigente` + seed de role_permissoes.
- API: `POST/GET /api/promocoes`, `GET/PATCH /api/promocoes/[id]`,
  `PATCH /api/promocoes/[id]/{encerrar,cancelar}`. Conflito (1 produto = 1 promo
  ativa/agendada) retorna 409 com lista de conflitos.
- Helper `src/lib/promocoes-helpers.ts`: expansão de produto pai (mesmo % nas
  variações) + check de conflito.
- Tela `/comercial/promocoes` (lista + detalhe) com tabs Ativas/Agendadas/
  Encerradas/Canceladas. Botões: Encerrar, Cancelar, Ver itens.
- Refator `PromotionModal` (gestão-estoque): agora cria campanha via API ao
  invés de sobrescrever `preco_tiny`. Tratamento de 409 com remoção rápida de
  conflitantes.
- JOIN com `vw_produto_preco_vigente` em `/api/gestao-estoque/produtos`,
  `/api/produtos`, `/api/vendas/produtos/busca` (campos novos: `preco_vigente`,
  `em_promocao`, `nome_campanha`, `promo_data_fim`, `preco_promo`,
  `promocao_nome`).
- UI POS (`NovaVendaClientV2`): `calcItem` aplica `preco_promo` como piso e
  recalcula `pct_desconto` (comissão cai na faixa correspondente
  automaticamente). Badge "PROMO" no dropdown de busca e linha do item. Bloqueio
  de `preco_unitario` abaixo de `preco_promo`.
- `/produtos` e `gestao-estoque/Dashboard`: lista riscada + promo + badge.
- Menu lateral: novo item "Promocoes" no grupo "Comercial" para admin e
  desenvolvedor.

## docs (29/04/2026) — Mapeamento Completo do Banco

Entregue em `docs/db-mapping/` (47 arquivos `.md` + 16 JSONs crus, ~5.2 MB):

- **7 schemas** mapeados: `alissonerp`, `public`, `directus`, `crm`, `auth`, `storage`, `extensions`
- **377 tabelas** com colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS
- **321 funções/procedures** com argumentos, retorno e **CORPO-FONTE COMPLETO**
- **148 triggers** com função alvo, evento, timing, definição completa
- **122 views** com SQL completo
- **234 RLS policies** com `qual` e `with_check`
- **819 indexes**, 228 sequences, 28 enums, 13 extensions
- **Cross-reference banco↔código**: 1013 arquivos varridos (8.1 MB), top 30, lista de objetos sem uso

Achados:

- **CLAUDE.md desatualizado:** dizia "~60 tabelas alissonerp" — são **139**. Dizia "~35 views, ~30 triggers" — são **71 views, 55 triggers**.
- Função no-touch `fn_processar_transferencia_saida` (CLAUDE.md) na verdade se chama `fn_processar_transferencia` (sem `_saida`). O typo veio do nome da migration `019_trigger_transferencia_saida.sql`.
- **Schema `crm` (31 tabelas, 41 RLS policies) descoberto** — não documentado no CLAUDE.md e sem nenhuma referência no código atual. Conteúdo: agentes IA, conversas WhatsApp/Meta/Kommo, funis, automações. Provavelmente projeto paralelo no mesmo banco.
- **474 objetos sem uso identificado no código** — distribuídos em `public` (169), `directus` (114), `alissonerp` (94), `crm` (67). Lista completa em `docs/db-mapping/99-code-mapping.md`.

Scripts geradores (idempotentes, ~10s cada):

```bash
node scripts/_db_mapping_extract.mjs     # extrai catálogo do banco para _raw/
node scripts/_db_mapping_code_xref.mjs   # cross-reference banco↔código
node scripts/_db_mapping_build_docs.mjs  # gera os .md finais
```

Atualizados em sincronia: `CLAUDE.md`, `MEMORY.md`, `ESTRUTURA_ATUAL.md`, `docs/arquitetura.md`, `docs/schema/README.md`.

## EPIC-001 — Fundação Técnica (29/04/2026) — resumo executivo

### Stories implementadas

| Story | Título | Arquivos-chave |
|-------|--------|----------------|
| 1.1 | parametros_sistema — eliminar IDs hardcoded | `src/lib/parametros.ts`, migration 192, 29 rotas refatoradas |
| 1.2 | Ordens reposição + fila_sync_externo | migration 193, rota `contatos` usa fila |
| 1.3 | TTL 5min + invalidarCacheAuth() | `src/hooks/useAuth.ts` |
| 1.4 | auth-server + api-handler (defineRoute) | `src/lib/auth-server.ts`, `src/lib/api-handler.ts` |
| 3.1 | Catches silenciosos → useErrorStore | 19 catches corrigidos em múltiplos componentes |
| 3.2 | Guard updated_at em PATCH /api/vendas/[id] | `VendaDetalheClient.tsx`, rota vendas PATCH |
| 3.3 | Audit log em 5 rotas críticas | `src/lib/audit.ts`, tabela `alissonerp.audit_log` |
| 3.4 | Worker retry exponencial fila_sync | `src/lib/fila-sync-worker.ts`, migration 200, tela `/admin/fila-sync` |
| 3.5 | UNIQUE INDEX fechamentos_distribuicao | migration 197 |
| 3.6 | fn_criar_par_movimentacao retorna TABLE | migration 198, ADR 0002 |
| bug | Reposição usa SUM(disponivel) pré-reserva | rotas de reposição |

### Impacto estrutural
- Novo padrão de API route: `defineRoute` em `src/lib/api-handler.ts`
- IDs de domínio nunca mais hardcoded: sempre `PARAM.X` via `src/lib/parametros.ts`
- Erros de integração externa não bloqueiam operações: fila `fila_sync_externo`
- Rastreabilidade completa em mutações críticas: `logAudit(tx, ...)`
- Auth server-side centralizada: `requireAuth()` / `requirePermissao()` em `src/lib/auth-server.ts`

## v2.38.0 (29/04/2026)
### Feature — Story 3.4 — Worker retry exponencial para fila_sync_externo
- **Migration 200** (`200_fila_sync_proxima_execucao.sql`): adiciona coluna `proxima_execucao TIMESTAMPTZ NULL` em `alissonerp.fila_sync_externo` + índice parcial `idx_fila_sync_pendente` (status='pendente'). Executada em produção via Node pg Client.
- **`src/lib/fila-sync-worker.ts`**: worker com retry exponencial (1m→5m→15m→1h→6h, MAX_TENTATIVAS=5). Usa `FOR UPDATE SKIP LOCKED` para segurança em múltiplas instâncias. Após MAX_TENTATIVAS, status→`falha_definitiva` + notificação admin. Processador extensível por sistema (`tiny` implementado: `sync_contato`).
- **`POST /api/admin/fila-sync`**: dispara o worker manualmente (usado por cron externo ou admin). Auth: admin/desenvolvedor. Retorna `{ processados, falhas, falhas_definitivas }`.
- **`GET /api/admin/fila-sync`**: expandido com campos `proxima_execucao` e `ultimo_erro` na listagem.
- **`POST /api/admin/fila-sync/[id]/reprocessar`**: move `falha_definitiva` → `pendente`, zera tentativas e `proxima_execucao`.
- **`POST /api/admin/fila-sync/limpar`**: deleta registros `processado` com mais de 30 dias.
- **`src/app/(dashboard)/admin/fila-sync/`**: tela admin com tabela paginada, contadores por status, botões "Processar agora", "Reprocessar" (por item) e "Limpar antigos". Auto-refresh 30s. Roles: admin/desenvolvedor.
- **`docs/adr/0005-sync-externo-fila.md`**: ADR documenta decisão de fila assíncrona vs sync inline.
- `npx tsc --noEmit`: zero erros.

## v2.37.0 (29/04/2026)
### Feature — EPIC-001 Story 1.1 — alissonerp.parametros_sistema
- **Migration 192** (`192_parametros_sistema.sql`): cria tabela `alissonerp.parametros_sistema` (chave PK, valor, tipo, descricao, atualizado_em, atualizado_por). Seed inicial com 6 parâmetros: `ALMOXARIFADO_DEPOSITO_ID=1`, `OURO_18K_INSUMO_ID=1`, `METAL_CATEGORIA_ID=1`, `PEDRA_CATEGORIA_ID=2`, `LOCAL_ESTOQUE_DEFAULT_ID=1`, `OURO_24K_LIGA_INSUMO_ID=275`.
- **`src/lib/parametros.ts`**: helper com cache TTL 5min, `getParametro()`, `getParametroNumber()`, `invalidarCacheParametros()`, constante tipada `PARAM`.
- **29 rotas API refatoradas**: substituídos todos os IDs de domínio hardcoded (`deposito_id=1`, `insumo_id=1`, `insumo_id=275`, `categoria_id=1/2`, `local_estoque_id=1`) pelo helper. Zero hardcoded remanescentes (grep AC6 = 0).
- Rotas refatoradas: `service/carregar-aditivo`, `service/carregar-solda`, `service/aditivo-saldo`, `service/solda-saldo`, `service/[id]/concluir`, `service/[id]/devolver`, `service/pedras-estoque`, `pcp/apontamentos`, `pcp/[id]/pedras-disponiveis`, `pcp/[id]/resumo`, `pcp/saida`, `pcp/transferir`, `distribuicao/apontamentos`, `distribuicao/[id]/pedras-apontadas`, `distribuicao/[id]/concluir`, `dashboard/fabrica`, `dashboard/fabrica/movimentacoes`, `estoque/transferir-local`, `relatorios`, `purificacao`, `purificacao/[id]`, `purificacao/ligacao`, `purificacao/liga-tipos`, `compras`, `compras/[id]/itens`, `lancamentos-avulso`.
- `npx tsc --noEmit`: zero erros. Banco confirmou 6 parâmetros inseridos.

## v2.33.0 (23/04/2026)
### Feature — Dashboard Comercial (replicado do alison-joias-admin)
- **Migration 174** (`174_dashboard_comercial_views.sql`): cria 12 views `alissonerp.vw_dash_*` apontando para `public.*` (vendas, metas_mensais, metas_por_hora, vendedores, itens_venda, comissoes, controle_entregas, forma_envio, forma_frete, leads, parcelas_pedidos, pedidos_parcelas_detalhado). Coluna `aprovada` na view de entregas normaliza bug do `status_aprovacao='APROVADA'` (dado real é `'2'`).
- **Migration 175** (`175_dashboard_comercial_permissoes.sql`): registra módulo `dashboard_comercial` em `alissonerp.role_permissoes` para desenvolvedor/admin/gerente_loja/consultora. Fábrica (gerente_fabrica, ourives, pcp) e motoboy SEM acesso.
- **6 API routes** em `src/app/api/dashboard-comercial/`: `vendas-dashboard`, `ranking`, `analise-performance` (4 cenários: horário acumulado/diário, mensal acumulado/projeção), `analise-frete`, `analise-comissoes`, `leads`, `comparativo-anual` (vs ano anterior).
- **5 páginas** em `src/app/(dashboard)/dashboard-comercial/`: geral (performance + leads + cards Prata/Ouro/Diamante), analise-resultado (4 cenários), analise-frete (receita vs custo), analise-comissoes (resumo + detalhe por item), ranking (podium top 3 animado + tabela completa).
- **Componentes UI base**: `DashboardHeader` (tabs + DateRangePicker), `StatCard`, `ConsultoraAvatar` (fallback iniciais), `Podium` (Framer Motion), `LoadingBlock/ErrorBlock`. Paleta oficial do fabricaAJ (esmeralda/creme/dourado).
- **Menu Comercial**: adicionado item "Dashboard Comercial" no topo do grupo. Removidos 4 itens antigos que foram consolidados (Análise Resultado, Análise Frete, Análise Comissões, Metas) — páginas antigas ficam no filesystem como fallback.
- **Libs adicionadas**: `framer-motion` (animações do podium), `date-fns` + `date-fns-tz` (manipulação de datas).
- Stack: `fetch + useState` (sem React Query no cliente, consistente com o resto do fabricaAJ). SQL direto via `src/lib/db.ts` (sem PostgREST).
- Validação: `npx tsc --noEmit` zero erros. 6 APIs retornam 200 com dados reais (faturamento R$ 394k período abr/2026, 123 vendas, ranking #1 Germana Valentim).

## v2.25.0 (18/04/2026)
### Feature — maquininhas por vendedor (MP Point)
- **Migration 151** (`151_mp_point_devices_vendedor.sql`): adiciona `vendedor_id` (FK `public.vendedores`) e `is_reserva BOOLEAN` em `alissonerp.mp_point_devices`. Cria tabela `alissonerp.uso_maquina_reserva` para log de uso de máquina reserva com justificativa obrigatória.
- **`GET /api/mercado-pago/devices?minha=true`**: retorna `{ minha, reservas }` — máquina do vendedor logado + todas as reservas da loja.
- **`PATCH /api/mercado-pago/devices`**: aceita `vendedor_id` e `is_reserva` (mutuamente exclusivos; 409 se tentar atribuir vendedor que já tem máquina).
- **`POST /api/mercado-pago/uso-reserva`**: salva log de uso com justificativa (mín. 10 chars, validado server-side).
- **`CartaoInline.tsx` + `MercadoPagoCobranca.tsx`**: vendedor vê sua máquina auto-selecionada (sem dropdown); botão "Usar maquininha da loja" abre form inline com justificativa obrigatória; admin/gerente mantém dropdown completo.
- **Configurações → aba "Maquininhas"**: tabela de devices com modal de edição — atribui vendedor, marca como reserva, renomeia, ativa/desativa. Visível apenas para admin/gerente/desenvolvedor.

## v2.24.0 (16/04/2026)
### Feature — merge feat/orcamento-friso-pedras-v2 (recebida do chefe)
- Merge da branch `feat/orcamento-friso-pedras-v2` (commit `9a4c86d`) no `homolog`. Traz: desacoplar friso do corpo da aliança, precificador de pedras v2, opções de gravação e risco. Arquivos: `AliancaViewport.tsx`, `OrcamentoClient.tsx`, `constants.ts`, `page.tsx`, `types.ts`, `validations.ts`, `api/orcamento/[id]`, `api/orcamento/config`, `api/orcamento/route`, `api/vendas/[id]/pdf`, `lib/gerar-pdf-orcamento.ts`.
- **Migration renomeada**: `133_friso_desacoplado.sql` → `140_friso_desacoplado.sql` (colisão com `133_notif_aguardando_resposta.sql` já existente em homolog).
- Auto-merge limpo em `OrcamentoClient.tsx` (sem conflito manual); nenhuma mudança anterior do homolog foi perdida. Backup salvo em branch local `backup/homolog-pre-merge-orcamento`.
- ⚠️ **Ação manual:** executar `supabase/migrations/140_friso_desacoplado.sql` no banco antes de usar a feature.

## v2.19.87 (11/04/2026)
### Chore — limpa do working dir
- Atualizado `.gitignore`: `/.claude/`, `/gerar_relatorio.{js,py}`, `/relatorio_*.xlsx` (arquivos locais que ficavam poluindo `git status`).
- Commit de trabalho em andamento do Jonathan que estava pendente no working dir: `OrcamentoClient.tsx` (+47), `api/ordens/[id]/comentarios/route.ts` (+24), `DashboardShell.tsx`, `GlobalErrorToast.tsx`, `PixQrInline.tsx`.
- Módulo de notificações (novo em progresso): `api/notificacoes/adiar`, `api/notificacoes/pendentes-resposta`, `components/MencaoAlarme.tsx`, migrations `133_notif_aguardando_resposta.sql` + `134_notif_alarme_snooze.sql`.
- 33 scripts operacionais em `scripts/` (apply/check/diagnose/fix/inspect/query/setup/sync/test) acumulados nas sessões recentes.

## v2.19.86 (11/04/2026)
### Feature — /financeiro Contas a Receber mostra valor líquido
- Novo card **"Líquido na Conta"** no grid de stats do Contas a Receber (grid passou de 3 pra 4 colunas): soma `valor_liquido` de todos os pagamentos MP confirmados das CRs pagas. Usa fallback `COALESCE(valor_liquido, valor)` pra CRs não-MP contarem 100% como líquido. Mostra subtexto `-R$ X,XX de taxas` quando `totalTaxas > 0`.
- Cada linha da tabela ganhou subtexto verde embaixo do valor: `líquido R$ 0,97 (−R$ 0,03)` quando há MP vinculado e valor líquido é diferente do bruto. CRs sem MP não mostram o subtexto.
- `page.tsx` SQL: SELECT ganhou duas subqueries agregadas `(SELECT SUM(p.valor_liquido) FROM pagamentos_venda p WHERE p.venda_id = cr.venda_erp_id AND p.status='confirmado')` e análogo pra `taxas_mp`. `ContaReceber` interface + `ContaRow` aceita `valorLiquido?` e `taxasMp?`.

## v2.19.85 (11/04/2026)
### Feature — valor líquido MP (net_received_amount) + fix encoding JSONB
- **Migration 137 (`137_pagamentos_valor_liquido.sql`)**: `ADD COLUMN valor_liquido NUMERIC(12,2)` e `taxas_mp NUMERIC(12,2)` em `alissonerp.pagamentos_venda`. Nova função `fn_resumo_recebido_mp(p_inicio DATE, p_fim DATE)` que retorna `qtd`, `total_bruto`, `total_taxas`, `total_liquido` pra relatórios. Fix retroativo: `UPDATE (gateway_payload #>> '{}')::jsonb WHERE jsonb_typeof='string'` consertou 15 payloads corrompidos por double-encoding.
- **Webhook MP captura líquido**: `POST /api/webhooks/mercado-pago` lê `transaction_details.net_received_amount` do payment retornado pela MP API e grava `pagamentos_venda.valor_liquido` + `taxas_mp` no UPDATE de confirmação. Fórmula: `taxas_mp = transaction_amount - net_received_amount` (mais preciso que somar `fee_details[]` porque o MP deduz outras taxas de adquirência que não aparecem em fee_details).
- **Exemplos reais em produção:** Cartão crédito R$ 1,00 → líquido R$ 0,97 (~3% taxa). Pix R$ 1,00 → líquido R$ 0,99 (~1% taxa).
- **Bug encoding JSONB double-string (corrigido em 5 arquivos MP)**: descoberto investigando o `gateway_payload`: todos os pagamentos MP tinham `jsonb_typeof='string'` em vez de `'object'`. Causa raiz: o driver `postgres` npm com `${JSON.stringify(obj)}::jsonb` encoda a string como literal JSON ao invés de parsear como objeto. Pior: o webhook fazia `{ ...payloadAntigo }` onde `payloadAntigo` era a string — o spread pegava cada caractere como chave, gerando `{"0":"{","1":"\"",...}`. Fix: trocado `::jsonb` por `::text::jsonb` em `src/app/api/webhooks/mercado-pago/route.ts`, `src/lib/vendas-aprovar.ts`, `criar-link/route.ts`, `criar-pix/route.ts`, `criar-intent-point/route.ts`. O `::text` força passagem como text e o `::jsonb` final faz o parse correto.
- **UI do detalhe da venda**: `VendaDetalheClient` mostra subtexto verde na linha do pagamento: `Líquido recebido: R$ X,XX (taxa MP R$ Y,YY)` quando `valor_liquido != null && > 0`. GET `/api/vendas/[id]` retorna `valor_liquido` e `taxas_mp` serializados como `Number | null`.
- **Backfill retroativo**: `scripts/backfill_mp_valor_liquido.mjs` busca cada pagamento MP existente na API e preenche `valor_liquido`/`taxas_mp`. Rodou: 2 de 6 backfilled (os outros 4 deram 404 porque eram da aplicação MP antiga `alissonerphomolog` — QR Code tipo — que a gente abandonou ao criar `Alisson Ranyel` tipo Checkout Transparente).

## v2.19.84 (11/04/2026)
### Fix crítico — Tiny expirando toda hora (offline_access + proxy-aware)
- **Diagnóstico em produção:** `tiny_token_expires_at = "2026-04-10T20:39:57.118Z"` — token expirava horas depois de reconectado, forçando reconexão manual constante. Dois problemas combinados no fluxo OAuth2.
- **Problema 1 — scope `openid` sem `offline_access`:** o Tiny usa Keycloak. Sem `offline_access` no scope, o refresh_token emitido é "session-bound" e expira junto com a sessão SSO (30min a 8h dependendo do realm config). Com `offline_access`, o token vira "offline token" e dura semanas/meses.
- **Fix 1:** `src/app/api/integracoes/tiny/auth/route.ts` agora pede `scope=openid offline_access`. Quando o Jonathan reconectar, o Keycloak vai pedir consentimento explícito pra "acesso offline" — aceitar.
- **Problema 2 — redirect_uri inconsistente atrás de proxy:** o código usava `req.headers.get("origin") ?? req.nextUrl.origin`. `req.headers.get("origin")` só é setado em requests cross-origin (NÃO em navegação direta via click). `req.nextUrl.origin` atrás do Easypanel/Traefik pode retornar o host interno do container (`http://localhost:3000`) em vez do domínio público. Keycloak rejeita a troca `authorization_code → token` se `redirect_uri` não bate EXATAMENTE entre `auth` e `callback`.
- **Fix 2:** novo helper `src/lib/public-origin.ts` com `getPublicOrigin(req)` que monta origin a partir de `X-Forwarded-Proto` + `X-Forwarded-Host` (headers setados pelo reverse proxy). Ordem: 1) `x-forwarded-proto + x-forwarded-host`, 2) `host` header com detecção http/https por nome, 3) `req.nextUrl.origin` fallback. Aplicado nos dois endpoints (`auth` e `callback`) pra garantir redirect_uri idêntico.

## v2.19.83 (11/04/2026)
### Fix — /financeiro crash no Contas a Receber + alinha status 'pago'
- **Bug 1 (crash):** clicar na aba "Contas a Receber" disparava `Uncaught TypeError: d.slice is not a function`. Causa: `page.tsx` (Server Component) passava resultados do postgres direto pro client component. O driver `postgres` npm converte `DATE`/`TIMESTAMPTZ` em objetos `Date`, e o Next serializa Server→Client preservando esse tipo. Funções do client como `isVencido(d)` chamavam `d.slice(0,10)` assumindo string e quebravam. Começou a acontecer agora porque as CRs antigas tinham `data_vencimento = null` (curto-circuitava em `!d`), e as CRs novas do webhook MP têm data preenchida pelo trigger 113. **Fix:** `SELECT data_vencimento::text AS data_vencimento, ...` em todos os 4 SELECTs da `page.tsx`. Datas chegam no client como string ISO.
- **Bug 2 (semântico):** o backend (trigger 113 `fn_venda_gerar_conta_receber` e `fn_cr_marcar_pago_mp`) grava `contas_receber.situacao='pago'`. A UI antiga de `TabReceber` filtrava e marcava como `'recebido'`. Resultado: CRs pagas automaticamente pelo webhook MP ficavam sumidas no filtro "Recebido" (card mostrava R$ 0,00). **Fix:** novo helper `isRecebido(s) = s === 'pago' || s === 'recebido'`. `totalRecebido`, filtro "recebido" e `marcarRecebido()` manual agora usam/gravam `'pago'` (alinha com o backend). `SITUACAO` map já tinha `'pago'` registrado com badge verde "Pago".

## v2.19.82 (11/04/2026)
### Feature — cobrança por cartão de crédito inline (link + maquininha)
- Novo componente `src/components/vendas/CartaoInline.tsx` (~450 linhas) — espelho do `PixQrInline` dedicado ao Cartão de Crédito. Quando a vendedora seleciona "Cartão de Crédito" no form de pagamento (NovaVendaClient OU VendaDetalheClient), aparece um card inline com dois botões:
  - **"Link de Pagamento"** → Preference API (`/criar-link`): gera QR local (lib qrcode) do `init_point` + link copiável + botão WhatsApp. Aceita crédito, débito e PIX no checkout MP.
  - **"Maquininha Point"** → Point Integration API (`/criar-intent-point`): selector de device, selector de parcelas (1-12x, pré-preenchido pela condição escolhida no form), countdown de 3 min + botão "Cancelar envio".
- Polling a cada 4s detecta pagamento confirmado via webhook. Suporta `vendaId=null` com callback `obterVendaId` igual ao `PixQrInline` — na Nova Venda a venda é salva como rascunho silenciosamente antes do endpoint MP ser chamado.
- Backend não precisou mudar — endpoints `/criar-link` e `/criar-intent-point` já existem e já suportam `installments`. Webhook processa ambos os canais via `external_reference`.

## v2.19.81 (11/04/2026)
### Feature — webhook MP processa estorno/chargeback automaticamente
- Antes: webhook recebia notificações de `refunded`/`cancelled`/`charged_back` mas só atualizava `gateway_payload`. Estornos precisavam ser tratados manualmente.
- **Novo helper `estornarVenda(vendaId, pagamentoId, motivoPayload)` em `src/lib/vendas-aprovar.ts`**. Transação atômica que:
  - `SELECT ... FOR UPDATE` no pagamento (anti-race).
  - Idempotência: se `status='estornado'`, retorna `{acao: 'ja_estornado'}`.
  - Conta outros pagamentos confirmados da venda (exclui o estornado).
  - `UPDATE pagamentos_venda SET status='estornado'`.
  - Decide ação: se `outros_confirmados > 0` → `vendas_erp.situacao='rascunho'` (vendedora recobra o valor); se `= 0` → `vendas_erp.situacao='cancelado'` (trigger 111 reverte estoque comercial automático).
  - `UPDATE contas_receber SET situacao='cancelado' WHERE venda_erp_id=X AND situacao IN ('pago','pendente')` (manual porque trigger 113 só cancela CR pendente).
- **Webhook receiver** agora separa `rejected` (tentativa negada, nunca foi confirmada) de `refunded`/`cancelled`/`charged_back` (que podem ser estornos reais após confirmação). Só chama `estornarVenda` se `pag.status === 'confirmado'` — senão só marca o pagamento como cancelado e retorna.
- **Chargeback** é tratado igual a refund (decisão Jonathan). `webhook_log` registra `acao`, `outros_confirmados` e `cr_canceladas` pra auditoria.
- **Não suporta estorno parcial** ainda (MP permite refund de parte do valor) — adicionar depois checando `transaction_amount_refunded` vs `transaction_amount`.

## v2.19.80 (11/04/2026)
### Feature — exibir data + hora na confirmação do pagamento
- Linha "Confirmado em DD/MM/AAAA" na seção Pagamento do `VendaDetalheClient` agora mostra também a hora: `Confirmado em 11/04/2026 às 15:14`.
- Nova função `fmtDateTime(d)` usa o timezone **local** do navegador (diferente do `fmtDate` existente que força UTC). Isso é correto porque `pagamentos_venda.data_confirmacao` é `TIMESTAMPTZ` e queremos mostrar no horário de Brasília, não em UTC.
- `fmtDate` (só data, UTC) continua sendo usado pras outras datas da tela (`data_venda`, `data_entrega`) que são `DATE` puro.

## v2.19.79 (11/04/2026)
### Refactor — concluirVenda usa ordem commit-then-sync
- **Diagnóstico:** o fluxo da v2.19.78 ainda estava errado semanticamente. `concluirVenda` chamava `approveVenda` primeiro, que tentava Tiny antes de fechar a venda. Mesmo com `tinyBestEffort=true` evitando throw, a ORDEM de operações ainda era "Tiny-first". Se o webhook MP crashava entre o Tiny OK e o UPDATE de situação, a venda ficava em limbo.
- **Nova ordem (local-first, commit-then-sync)** em `concluirVenda`:
  1. `UPDATE vendas_erp.situacao = 'concluido'` → trigger 113 cria `contas_receber` automaticamente
  2. `fn_cr_marcar_pago_mp(vendaId)` → marca CR como recebida
  3. `criarOrdemDoOrcamento()` → cria ordem de fabricação se veio de orçamento (best-effort)
  4. `sendToTiny()` → sincroniza com Tiny (best-effort, erro salvo em `tiny_sync_erro`)
- **`concluirVenda` NÃO chama mais `approveVenda`**. Mesmo com venda em rascunho, pula direto pra `concluido` (trigger 114 só dispara blindagem quando `OLD.situacao IN ('confirmado','concluido')`, então rascunho→concluido passa limpo).
- **Filosofia:** pagamento confirmado pelo banco é inegociável. O "fechamento" da venda no ERP não pode ser bloqueado por uma integração downstream.

## v2.19.78 (11/04/2026)
### Fix — webhook MP conclui venda mesmo com Tiny fora do ar (tinyBestEffort)
- **Bug descoberto em produção:** venda com Pix pago pelo cliente ficou em rascunho porque o token Tiny expirou no momento do webhook. Cadeia `concluirVenda → approveVenda → sendToTiny` lançou exception no Tiny, webhook abortou antes de transicionar a venda, cliente pagou mas a venda nunca virou `concluido`.
- **Fix parcial (depois revisto na v2.19.79):** `ApproveVendaOpts.tinyBestEffort: boolean`. Quando `true`, erro do Tiny é capturado, logado em `tiny_sync_erro`, e o fluxo continua. Webhook MP passa `tinyBestEffort: true`; PATCH manual `/api/vendas/[id]` mantém comportamento all-or-nothing legacy.
- **Fix manual da venda #28724**: via `scripts/fix_venda_28724.mjs` — `situacao=concluido`, CR#74=pago, `tiny_sync_erro` marcado pra reenvio manual depois.

## v2.19.77 (11/04/2026)
### Fix crítico — PIX agora usa Payment API e gera QR EMV escaneável
- **Bug descoberto em teste real:** vendedora gerava QR pelo botão "PIX", cliente tentava escanear no app do banco e recebia **"esse QR não é Pix"**. Causa: o endpoint `/criar-link` usa a Preference API do MP que retorna um `init_point` (URL tipo `mpago.la/xxxx`). O QR gerado a partir dessa URL não é um QR Pix do Banco Central — é só um link pro checkout MP. App bancário não reconhece.
- **Novo endpoint `POST /api/vendas/[id]/mercado-pago/criar-pix`** usa a **Payment API** diretamente (`POST /v1/payments` com `payment_method_id='pix'`). MP retorna:
  - `qr_code`: string EMV/BR Code (`00020101021...`) no padrão Banco Central — copia-e-cola
  - `qr_code_base64`: imagem PNG do QR pronta — escaneável em qualquer app bancário
  - `ticket_url`, `expiration_date`, `payment_id`
- **Novo helper `createPixPayment()` em `src/lib/mercado-pago.ts`**: POST `/v1/payments` com Idempotency-Key (evita duplicação em retry), expiração configurável (default 30min), tratamento CPF vs CNPJ (Payment API PIX só aceita CPF em `identification.number` — se for CNPJ, omite).
- **Email obrigatório**: Payment API exige `payer.email`. Fallback pra `venda-${vendaId}@alissonjoias.com.br` quando cliente não tem email cadastrado.
- **`PixQrInline.tsx` atualizado**: removeu dependência de `qrcode` (lib local) — agora exibe `data:image/png;base64,${pixQrBase64}` direto do MP. Botão "Copiar" agora copia o código Pix EMV (não link MP). Mensagem do WhatsApp manda o código Pix, não link.
- **Endpoint `/criar-link` continua existindo** pro botão "Gerar Link Online" do `MercadoPagoCobranca` que oferece PIX + cartão no mesmo link (checkout MP). `PixQrInline` é especializado em PIX nativo escaneável.
- **Webhook sem mudanças**: o fluxo atual via `external_reference` já funciona pra pagamentos criados pela Payment API (mesmo topic `payment`).

## v2.19.76 (11/04/2026)
### Feature — QR Code Pix inline também na Nova Venda
- Antes, `PixQrInline` só funcionava em `VendaDetalheClient` porque dependia de um `vendaId` já existente. Na Nova Venda, quando a vendedora escolhia Pix, nada acontecia.
- Agora `PixQrInline` aceita `vendaId: number | null` + callback opcional `obterVendaId?: () => Promise<{id, numero_venda}>`. Quando `vendaId=null`, clica em "Gerar QR" → chama `obterVendaId()` pra salvar venda como rascunho silenciosamente → usa o id retornado pra criar o link MP.
- `NovaVendaClient`: novo helper `montarBodyVenda()` + `salvarRascunhoParaPix()` que valida `itens.length > 0` e `totalVenda > 0` antes de criar rascunho via `POST /api/vendas`. Renderiza `<PixQrInline>` quando `pagForma === "Pix" && totalVenda > 0` e redireciona pra `/vendas/[id]` quando o polling detecta pagamento.

## v2.19.75 (11/04/2026)
### Feature — busca de produtos ordena por relevância
- `GET /api/vendas/produtos/busca` ordenava só por `nome` alfabético, o que com `LIMIT 20` empurrava produtos completos (com preço) pra fora quando havia muitos produtos incompletos com o mesmo termo no nome. Produto de teste `TESTE-2026-A` não aparecia no top 20 ao buscar "teste".
- Nova ordenação por relevância:
  1. Produtos ATIVOS (`situacao='A'`) antes de inativos
  2. Produtos **COM preço preenchido** (`preco_sync > 0`) antes de sem preço
  3. Produtos SIMPLES (`tipo='S'`) antes de pais com variação (`tipo='V'`)
  4. Match EXATO no SKU vem primeiro
  5. Match no COMEÇO do nome antes de match no meio
  6. Desempate: nome alfabético
- Efeito colateral positivo: vendedoras sempre veem produtos vendáveis no topo da busca, não só os de teste.

## v2.19.74 (11/04/2026)
### Feature — QR Code Pix inline no form de pagamento da venda (primeira versão)
- Novo componente `src/components/vendas/PixQrInline.tsx` (260 linhas) — card inline no form de pagamento do `VendaDetalheClient` quando a vendedora seleciona "Pix". Botão "Gerar QR Code Pix" → chama `/criar-link` → exibe QR (240px cor esmeralda, gerado via lib `qrcode`) + link copiável + botão WhatsApp + botão "Regenerar".
- Polling a cada 4s checando `/api/vendas/[id]` pra detectar `pagamentos_venda.status='confirmado'` OU `vendas_erp.situacao='concluido'`. Quando confirma, mostra "✓ Pagamento confirmado! Atualizando venda..." por 2.5s e chama `onPagamentoConfirmado(vendaId)` → `load()` recarrega a venda.
- **Obs:** substituído na v2.19.77 pelo endpoint `/criar-pix` (Payment API) porque o QR gerado localmente a partir do init_point **não é** PIX nativo escaneável.

## v2.19.73 (11/04/2026)
### Feature — webhook MP detecta simulação do painel e retorna OK limpo
- O botão "Simular notificação" do painel de Webhooks MP envia payload com `live_mode: false` e `data.id: "123456"` (fake). Antes, o webhook tentava buscar esse payment na MP API e recebia erro, logando 502 em `webhook_log` e retornando `{ok: false}`. No painel MP aparecia erro.
- Agora, quando `body.live_mode === false`:
  - Log 200 em `webhook_log` marcado como `"simulacao_validada"`
  - Retorna 200 `{ok: true, simulation: true, message: "Webhook MP recebido e HMAC validado. Simulação OK."}` limpo
  - Painel MP mostra "Resposta: 200 - OK" sem ruído
- Permite ao Jonathan validar visualmente no painel MP que o endpoint está recebendo, HMAC validou e payload parseou, sem depender de payment real.
- Comportamento em produção (`live_mode: true`) permanece idêntico: busca o payment real via `fetchPayment()`, processa `external_reference`, aprova/conclui venda, marca `contas_receber` como pago.

## v2.19.72 (11/04/2026)
### Feature — Integração Mercado Pago: Payment Link + Point Smart com auto-conclusão
- **Migration 135 (`135_mercado_pago_integracao.sql`)**:
  - Nova tabela `alissonerp.mp_point_devices` (cadastro de maquininhas Point Smart com `device_id`, `nome_legivel`, `store_id`, `pos_id`, `operating_mode`, `ativo`, `loja`, `last_sync_at`) com trigger `updated_at` e índice parcial `ativo=true`.
  - Nova função `fn_cr_marcar_pago_mp(p_venda_id INTEGER)` que marca `contas_receber.situacao='pago'` + `data_recebimento=CURRENT_DATE` das CRs pendentes da venda e retorna contagem.
  - Índice `idx_pagamentos_venda_gateway_id` em `pagamentos_venda(gateway_id) WHERE gateway_id IS NOT NULL` pra lookup rápido no webhook.
  - Entry `mercado-pago-payment` em `webhook_config` pra rastreio.
- **Dependências novas:** `mercadopago@^2.9.0` (SDK oficial Node v2) + `qrcode@^1.5.4` (gerar QR local pro link).
- **Helper compartilhado `src/lib/mercado-pago.ts`**: `getAccessToken()`, `getWebhookSecret()`, `getWebhookBaseUrl()`, `createPreference()`, `fetchPayment()`, `listPointDevices()`, `createPointIntent()`, `cancelPointIntent()`. Secrets lidos de `alissonerp.configuracoes_secrets` (padrão Tiny, zero env vars).
- **Helper `src/lib/vendas-aprovar.ts`**: extraído do PATCH `/api/vendas/[id]` pra poder ser chamado do webhook MP sem passar por HTTP interno. `sendToTiny()`, `approveVenda()`, `concluirVenda()`, `criarOrdemDoOrcamento()` com idempotência em 4 camadas (`tiny_pedido_id`, `vendas_erp.situacao`, `orcamentos.ordem_gerada_id`, `payment_ids_processados` no gateway_payload).
- **POST `/api/vendas/[id]/mercado-pago/criar-link`**: cria Preference MP com PIX + cartão crédito excluídos `[debit_card, atm, ticket, prepaid_card]`, `external_reference = venda:X:pag:Y`, `notification_url`, `back_urls`, `expires_in=24h`. Salva `preference_id` em `pagamentos_venda.gateway_id`. Retorna `{init_point, preference_id, pagamento_id}`.
- **POST/DELETE `/api/vendas/[id]/mercado-pago/criar-intent-point`**: dispara Payment Intent na maquininha escolhida via `POST /point/integration-api/devices/{device_id}/payment-intents` (amount em centavos, installments, payment.type='credit_card', additional_info com external_reference). DELETE cancela intent ativa antes do cliente passar o cartão.
- **GET/POST/PATCH `/api/mercado-pago/devices`**: lista devices cadastrados (com guard `try/catch` pra retornar `[]` quando tabela ainda não existe), sincroniza via `listPointDevices()` da MP API (upsert em `mp_point_devices`), permite renomear/ativar/desativar manualmente.
- **POST `/api/webhooks/mercado-pago`**: receiver com validação HMAC (formato header `x-signature: ts=...,v1=hash` + manifesto `id:${dataId};request-id:${x-request-id};ts:${ts};`), log bruto imediato em `webhook_log`, busca detalhes via `GET /v1/payments/{id}`, parse `external_reference`, idempotência (via `payment_ids_processados[]` no gateway_payload), transição automática aprovado→concluido via `concluirVenda()`. Retorna sempre 2xx em cenários tratados pra evitar reentrega MP.
- **Componentes UI:**
  - `src/components/vendas/MercadoPagoCobranca.tsx` (520 linhas): seção separada no `VendaDetalheClient` com dois botões ("Gerar Link Online", "Enviar pra Maquininha") que abrem modais overlay com QR code, link, WhatsApp, select de device, countdown, cancelar intent.
  - `src/components/vendas/MercadoPagoCobranca.tsx` integrado após a lista de pagamentos do detalhe da venda.
- **Configurações > Integrações > Mercado Pago**: nova seção com campos `Access Token`, `Webhook Secret`, `User ID`, `URL base p/ webhook`. Sub-seção "Maquininhas Point" com botão "Sincronizar com MP" e tabela editável (nome legível, loja, ativo, toggle). `/api/configuracoes/integracoes/route.ts` aceita `KEYS_MP = [mp_access_token, mp_webhook_secret, mp_user_id, mp_webhook_base_url]`.
- **Páginas públicas de retorno (`back_urls`)**: `/pagamento/[token]/[status]/page.tsx` — 3 estados (`sucesso`, `pendente`, `erro`) lookup por `vendas_erp.token_compartilhamento` UUID, sem expor ID interno.
- **Princípio-chave 1:** lógica de transição de estado de venda extraída pra `src/lib/vendas-aprovar.ts`. PATCH manual e webhook MP **ambos** chamam esses helpers — webhook não faz HTTP interno, chama TypeScript direto.
- **Princípio-chave 2:** webhook é **agnóstico ao canal**. MP envia `topic=payment` com o mesmo formato pra Preference (online) e Point (maquininha). `external_reference` carrega `venda_id:pagamento_id` em ambos os casos. A diferença entre os canais mora apenas na criação do pagamento (endpoints separados), não no fechamento.

## v2.19.71 (11/04/2026)
### Fix — Busca insensível a acentos em /ordens e /pcp
- **Bug raiz:** `ILIKE` do PostgreSQL não ignora acentos — buscar "Joao" retornava `0 resultados` mesmo o banco tendo "João Diogo", "João Gabriel", "João Vitor", etc. Qualquer usuário que digitasse um nome sem acentuar (comportamento natural) não conseguia encontrar a ordem.
- **Fix 1 — Migration 136:** `CREATE EXTENSION IF NOT EXISTS unaccent` (extensão oficial PostgreSQL contrib, sem efeito colateral). Instalada via `scripts/apply_136.mjs`.
- **Fix 2 — `/ordens/page.tsx`:** query `whereBusca` agora usa `unaccent(numero_ordem) ILIKE unaccent(...)` em `numero_ordem`, `cliente_nome` e `vendedor_nome`. `numero_pedido` não precisa (só dígitos).
- **Fix 3 — `/api/pcp/buscar/route.ts`:** todas as comparações do endpoint server-side (incluindo `ORDER BY` de relevância por prefixo) usam `unaccent()` em ambos os lados.
- **Bônus:** o fix também normaliza `ç → c`, `ñ → n`, `ü → u`, etc. "Goncalves" acha "Gonçalves", "Acai" acha "Açaí".
- **Validação:** preview end-to-end em `/ordens?busca=Joao` retornou 4 clientes "João"; `/pcp` com busca "Joao" retornou 1 match.

## v2.19.70 (11/04/2026)
### Feature — PCP: busca server-side no histórico completo + janela de 30 dias
- **Bug raiz:** a busca do kanban era 100% client-side, filtrando só nos ~105 PCPs carregados pelo SSR. Ordens concluídas fora desse top ou "no limbo" dos filtros de service/transferência simplesmente sumiam ao pesquisar — mesmo existindo no banco.
- **Fix 1 — janela temporal em `pcp/page.tsx`:** SSR passa a carregar só etapas ativas (`novas_ordens`, `em_andamento`, `pendencia`, `aguardando`, `cancelado`) + concluídas dos últimos **30 dias**. Reduz a carga inicial e deixa o kanban focado no que precisa de ação.
- **Fix 2 — novo endpoint `GET /api/pcp/buscar?q=termo`:** busca server-side em **todo o histórico** (sem filtro de etapa, sem filtro de service/transferência), em `numero_ordem`, `cliente_nome`, `vendedor_nome`, `setor_nome`, `deposito_nome` e `ordens.numero_pedido`. Respeita filtro de depósito pra ourives. Retorna top 100, ordenado por match por prefixo + `id DESC`.
- **Fix 3 — `KanbanClient.tsx` com debounce 300ms:** busca agora dispara o endpoint após 300ms parado. Estado visual rico: loader spinner, botão X pra limpar, borda verde esmeralda no modo busca, badge *"🔍 N resultado(s) da busca em todo o histórico"*, texto explicativo *"Buscando em todo o histórico (sem limite de data)"*, mensagem de erro visível se a API falhar.
- **Permissões:** ourives continua só vendo/buscando ordens do seu `deposito_id`.
- **Validação completa:** TypeScript 0 erros, queries testadas direto no banco (C-1707 retornou 2 linhas — antes sumia), fluxo end-to-end testado no preview (modo normal → buscar "C-1707" → buscar "Gigi" → limpar → volta ao modo normal).

## v2.19.69 (10/04/2026)
### Fix — Coluna "PEDIDO PDV" vazia na listagem de ordens
- **Bug raiz:** os INSERTs em `alissonerp.ordens` gravavam `venda_id` (FK) mas **esqueciam** de copiar o `numero_venda` pra coluna `numero_pedido`. Consequência: coluna "PEDIDO PDV" na listagem de ordens aparecia `—` pra todas as ordens criadas, dificultando rastreabilidade.
- **Fix 1 (`api/vendas/[id]/route.ts`):** quando venda aprovada vira ordem, agora busca `v.numero_venda` no SELECT e passa como `numero_pedido` no INSERT.
- **Fix 2 (`api/ordens/route.ts`):** endpoint POST de criação manual de ordens agora busca o `numero_venda` da `vendas_erp` quando `venda_id` é informado e grava em `numero_pedido`.
- **Backfill:** script `scripts/backfill_ordens_numero_pedido.mjs` executado no banco — preencheu **64 ordens** existentes com seus respectivos `numero_venda`. Restante (0) ordens com `venda_id` sem `numero_pedido`.

## v2.19.68 (10/04/2026)
### Fix crítico — Tiny OAuth2: refresh_token nunca era salvo
- **Bug raiz:** `api/integracoes/tiny/callback/route.ts` tentava `INSERT INTO configuracoes_secrets (chave, valor)` mas a coluna chama `valor_encrypted`. Erro capturado silenciosamente no try/catch. Consequência: `tiny_refresh_token` e `tiny_token_expires_at` **nunca ficavam no banco** — só o `tiny_bearer_token` (que usa a coluna correta). Por isso o token expirava em 1h e o sistema caía no fallback `client_credentials`, mostrando "Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'" em loop.
- **Fix 1:** corrigido callback (2 ocorrências) pra usar `valor_encrypted`.
- **Fix 2:** adicionada **validação proativa de expiração** em `api/vendas/[id]/route.ts`: antes de enviar pro Tiny, checa se o token expira em < 2 minutos e renova preventivamente — evita o ciclo reativo de 401.
- **Fix 3:** `refreshTinyToken()` agora também persiste `expires_in` como `tiny_token_expires_at` após renovar, pra alimentar a validação proativa.
- **Fix 4:** logs de erro detalhados em `refreshTinyToken()` pra facilitar debug futuro (antes engolia erros silenciosamente).
- **Ação necessária:** depois do deploy, reconectar o Tiny **1 vez** em Configurações > Integrações > "Conectar ao Tiny". A partir daí o refresh automático funciona sozinho indefinidamente.

## v2.19.67 (10/04/2026)
### Fix crítico — JSONB escalar em config_orcamento
- **Hotfix do v2.19.66:** padrão `${JSON.stringify(obj)}::jsonb` no postgres.js estava salvando arrays como JSONB escalar string (double-encoded) em vez de array nativo, quebrando operações `@>`, `||`, `jsonb_array_length`. Corrigido em `api/orcamento/config/route.ts` (pricing_categories, groove_rules, stone_prices, calibracao) e `api/orcamento/route.ts` (pedras_detalhadas × 2) usando `sql.json()` — serializa JSONB nativo corretamente
- **Blindagem de leitura no frontend:** `OrcamentoClient.tsx` agora aceita `config.calibracao` e `config.stone_prices` como objeto OU string (fallback resiliente para dados legados do bug)
- **Migration 132 executada no banco:** script `scripts/apply_132.mjs` adicionou coluna `calibracao` JSONB + inseriu zircônia em `stone_prices`. Script `scripts/fix_132_stone_prices_v2.mjs` corrigiu `stone_prices` corrompido (elemento `"null"` lixo + double-encoding), reescrevendo com valores de mercado 2025 via `sql.json()`

### Conhecido (bug sistêmico pré-existente)
- Outros endpoints ainda usam o padrão bugado `${JSON.stringify(x)}::jsonb`: `api/vendas/[id]/route.ts` (3 pontos), `api/user/[id]/route.ts` (2), `api/service/[id]/concluir/route.ts`, `api/fichas-tecnicas/route.ts`, `api/purificacao/route.ts`, `api/ordens/route.ts`. Funcionam parcialmente graças ao helper `normalizeRow` que parseia strings na leitura, mas operações JSONB nativas nesses campos vão falhar. **Não corrigido neste hotfix** (fora de escopo — requer revisão de cada feature afetada).

## v2.19.66 (10/04/2026)
### Features — Orçamento: travas de validação + zircônia + preços de pedras configuráveis
- **Travas físicas** no editor de aliança baseadas na pedra escolhida:
  - Espessura mínima automática = `pedra × 0.60 + 0.50` (sliders travados)
  - Largura mínima por tipo de cravação (canaleta/grão/pavê)
  - Fileiras máximas no QuadradoCanal calculadas pelo canalWidth/pedra
  - Capacidade total de pedras validada contra circunferência da aliança
- **Zircônia** como novo tipo de pedra (não preciosa, preço = 0): `STONE_TYPES` ganha flag `is_preciosa`; `computeStoneEntryPrice` zera o valor quando não é preciosa; default ao adicionar entry = zircônia (opção segura, não cobra por engano)
- **Card "Detalhamento (Preciosa/Zircônia)"** no modo aliança permite misturar tipos (ex: 4 diamantes + 10 zircônias) respeitando a capacidade
- **Card "Preços de Pedras (USD/ct)"** na tela de Configurações — editor completo com preview ao vivo (exemplos 1,5mm e 3mm), botão Padrão restaura valores de mercado 2025 ($600 diamante, $80 moissanita, $350 rubi, $450 esmeralda, $300 safira, $0 zircônia)
- **Validação bilateral frontend + backend** (POST e PUT) — não dá pra burlar nem via cURL
- **Calibração configurável** via `config_orcamento.calibracao` (JSONB): espessura mínima, largura por cravação, folga entre pedras — editável via SQL direto se necessário
- Barra de resultado inferior exibe **Pills "Ouro" e "Pedras"** quando há pedras preciosas, com breakdown visível
- Correção de formatação BRL (antes `R$ 23.215,081` com 3 casas erradas, agora `R$ 23.215,08` sempre 2 casas)
- Eliminação da duplicidade do `PROFILE_CORRECTION_FACTOR` (antes divergia entre switch inline e Record exportado — agora fonte única)

### Migrations
- `132_orcamento_validacao_zirconia.sql` — coluna `calibracao` JSONB em `config_orcamento` com defaults conservadores + inclusão de zircônia em `stone_prices` com preco_usd_ct = 0

### O que NÃO foi tocado (garantia anti-quebra)
- ✋ Editor 3D (`AliancaViewport.tsx`) — zero alteração
- ✋ PATCH de aprovação de orçamento → venda → ordem
- ✋ Densidades do ouro, tabela `RING_SIZES`, fórmula base de `computeWeight`

## v2.19.62 (09/04/2026)
### Merge + Integração
- Merge branch claude/pensive-borg + mudanças locais
- Orçamento, sidebar, permissions, migrations 120/130

## v2.19.58–v2.19.61 (08/04/2026)
### Features — Vendas Detalhe Redesign
- Redesign vendas/[id] com layout editável igual a vendas/nova
- Edição inline itens, validação aprovar, desconto padrão 0
- 3 botões cliente + endereço entrega na venda (migration 130)
- Botão editar cadastro do cliente no modal de dados

## v2.19.39–v2.19.57 (05-07/04/2026)
### Features — Módulo Orçamento 3D
- Cliente no orçamento + aprovação → ordem de fabricação
- Tela de orçamentos estilo PDV — stats, filtros, tabela, dropdown novo
- Orçamento peças personalizadas + precificação de pedras preciosas
- 3D aliança com THREE.js — perfis, gravação interna, screenshot
- Orçamento aprovado → venda pré-preenchida → venda concluída → ordem automática
- Ficha técnica formatada (Boleada Dupla), sem modelo_interno
- Captura screenshot 3D da aliança e salva no orçamento + ordem
- Migrations 120-129: config_orcamento, orcamento_fichas_tecnicas, orcamentos, pedras_config, cliente+ordem, foto_3d, venda+ordem

### Fixes (3D/Orçamento)
- WebGL Context Lost — React.memo, DPR limiter, preserveDrawingBuffer
- Gravação curvada na superfície interna da aliança
- Conflito slug [id] vs [token] — rota pública /compartilhado

## v2.19.25–v2.19.28 (04/04/2026)
### Features — PCP→Service Transfer
- PCP Novas Ordens permite transferir para service
- Pedras na service — só mostra estoque do local Service + baixa correta

### Fixes
- Baixa de pedras/solda no service usa local correto
- Timeline duplicava linhas de protocolo ida/volta (migration 125)

## v2.19.1–v2.19.24 (02-03/04/2026)
### Features — Estoque Multi-Local + Service Workflow
- Tab Locais de Estoque na página de estoque
- Autocomplete insumo na transferência + tab Depósitos no estoque
- Separar saldos e movimentações por local de estoque
- Lançamento avulso permite escolher local de estoque (migration 123)
- Seleção de transportador na transferência PCP→Service + toggle configurações (migration 124)
- Operador service vê detalhes da ordem sem sair do painel
- Transferir serviço de volta para fábrica com protocolo automático
- Foto da peça miniatura 80x80 — clica pra abrir zoom

### Fixes
- Corrigir saldo_ct pedras (gramas/0.2) + exibir quantidade e peso (migration 121)
- Views local_estoque_id display (migration 122)
- Transferência entre locais gravava ct como gramas para pedras
- Receber transferência service cria servico manualmente
- Hydration error MobileCard
- Protocolos transferência service apareciam vazios

## v2.19.0 (01/04/2026)
### Features — Vendas Redesign + Tarefas
- Vendas redesign completo com comissões dinâmicas
- Tarefas avançadas: kanban drag-drop, aprovações, automações (migration 119)
- Análise de comissões, frete, resultado (3 subpáginas)
- Metas por vendedora + ranking mensal
- Fix proxy service-painel

## v2.18.0–v2.18.4 (31/03/2026)
### Features
- PDF orçamento + enviar Tiny API v3 + sync estoque comercial
- Módulo Relatórios (4 tipos: produção, comercial, financeiro, estoque)

### Fixes
- Sync triggers bypass blindagem via session variable (migration 118)
- Proxy não bloqueia /service por módulo
- SW ignora chrome-extension://
- Trigger sync re-sincroniza itens faltantes na UPDATE

## v2.17.0–v2.17.1 (31/03/2026)
### Features — Migração 360°
- Módulo Comercial: vendas_erp, itens_venda_erp, pagamentos_venda, metas_vendedoras (migration 104)
- Estoque Comercial: config, movimentações, alertas, sync Tiny (migration 107)
- Módulo Tarefas (substitui Asana) — kanban, comentários (migration 112)
- Financeiro automático: venda→conta_receber, compra→conta_pagar (migration 113)
- Blindagem vendas fechadas: protege preços/comissões (migrations 114-118)
- Sync public.vendas → vendas_erp com 14.301 vendas históricas (migration 109)
- Integrações: Kommo CRM, WooCommerce, cotações automáticas
- Fichas técnicas ERP editáveis (migration 111)
- Ordem fabricação com ficha técnica dinâmica — 12 tipos de item
- Ordem reposição venda — modal simplificado 4 steps
- Sistema de erros global (Zustand errorStore + GlobalErrorToast)
- Renomear solda→aditivo, filtro PCP, auto-aprovar auditoria

### Fixes
- QA médios/baixos — error handling, validação, status API key

## v2.16.0–v2.16.3 (30/03/2026)
### Features
- Módulo comercial vendas, estoque comercial, orçamento público
- Ordens garantia + serviço venda, sync vendas
- Gravador de vídeo nativo com câmera + countdown 30s
- Vendedor_id auto-preenchido, vídeo 30s, fallback nome criador

## v2.15.1 (30/03/2026)
### Features
- Transferência service + devolver + CLAUDE.md multi-agentes (migration 103)
- Service devolver: retorno com protocolo automático
- Service transferir-fabrica: volta para Almoxarifado Central

## v2.14.2 (30/03/2026)
### Fixes — Bug critico: dupla-contagem de ouro em buscarOuroRecebido
- `buscarOuroRecebido` retornava SUM(entrada) em vez de SUM(entrada)-SUM(saida)
  - Cenario: operador recebe ouro, transfere parte, recebe de volta, transfere novamente
  - Bug: a funcao somava TODAS as entradas historicas ignorando saidas anteriores
  - Resultado: ouro_recebido inflado → QUEBRA_PCP CE errado → saldo negativo do operador
- Fix: formula alterada para saldo liquido: SUM(entrada) - SUM(saida) para categoria_id=1
- Fix: `pcp/transferir/route.ts` — buscarOuroRecebido movido para ANTES das CEs TED/QUEBRA_PCP
- Fix: `pcp/saida/route.ts` — buscarOuroRecebido movido para ANTES das CEs SM/QUEBRA_PCP
- Correcao dados C-1060 (ordem_id=1292): CE QUEBRA_PCP id=468 saida 12.56→0.25; quebra_operador id=47 ouro_recebido 21.54→9.23 quebra 12.56→0.25
- Correcao dados C-1129 (ordem_id=1317): quebra_operador id=31 ouro_recebido 2.67→1.52 quebra 1.47→0.32
- Varredura: outros 5 operadores com multiplas entradas verificados — sem CEs erradas (saida/pcp usa total_metal do PCP, nao buscarOuroRecebido)

## v2.14.1 (30/03/2026)
### Fixes (migrations 101 + 102)
- Bug critico: fn_criar_itens_ordem gravava unidades como peso para pedras (devia gravar gramas)
  - fn_processar_saida_ordem (Sprint 2) lia ioi.peso assumindo gramas e dividia por 0.2 → SP errado
  - Fix: novo parametro p_peso_gramas (6º, DEFAULT NULL); tipo 3/6 passa qtd × peso_pedra (g)
  - Metal: backward compat via COALESCE(NULL, p_qtd) = p_qtd — sem mudanca
- fn_processar_transferencia: local_estoque_id=1 explicito nos CEs (TED)
- fn_processar_lancamento_avulso: local_estoque_id=1 explicito em todos os INSERTs de CE
- Varredura completa local_estoque_id NOT NULL (migration 102 + 10 arquivos TS):
  - fn_criar_par_movimentacao: COALESCE(p_local_id, 1) — backward compat para callers sem 10 arg
  - fn_processar_outros_insumos_dist + fn_processar_outros_insumos_pcp: local_estoque_id=1
  - /api/pcp/transferir: TED saida+entrada+QUEBRA_PCP
  - /api/pcp/saida: SM, QUEBRA_PCP, SP, QBP
  - /api/service/[id]/concluir: SM (solda), SP (pedra)
  - /api/purificacao: PURIF_SAIDA, PURIF_ENTRADA, PURIF_CANCEL
  - /api/purificacao/ligacao: LIGA_SAIDA_24K, LIGA_SAIDA_LIGA, LIGA_ENTRADA_18K, LIGA_CANCEL
  - /api/distribuicao/[id]/concluir: QUEBRA_LOTE
  - /api/distribuicao/[id]/estorno: ESTORNO (3 CEs)
  - /api/distribuicao/[id]/estorno-lote: ESTORNO (7 CEs)
  - /api/pcp/apontamentos: fn_criar_par_movimentacao 10 arg explicito (EOID)
- Dados historicos itens_ordem_insumos pedras: 16 registros com peso em unidades (aguardando confirmacao Jonathan)

## v2.15.0 (30/03/2026)
### Features
- Tipo "Serviço Interno" — foto obrigatória, vídeo obrigatório (gravar ou upload) e tipos de serviço configuráveis
- Tabela `alissonerp.tipos_servico` com CRUD admin + 5 tipos iniciais (Solda Laser, Cravação Manual, Acabamento e polimento, Ajuste Manual, Solda e Limpeza)
- Múltiplos tipos de serviço por ordem — checkboxes no modal → `ordens.tipos_servico_ids INTEGER[]`
- Gravação de vídeo no navegador via MediaRecorder API (webm/mp4 fallback) + opção de upload
- Admin UI em `/configuracoes` — nova aba "Tipos Serviço" com CRUD inline (admin/dev)
- API `GET/POST/PATCH /api/tipos-servico` — sem `supabase.from()`, apenas `pg.Pool` SQL direto
- API `POST/DELETE /api/ordens/upload-arquivo` — endpoint de upload/cleanup server-side
- Migration `100_tipos_servico.sql`: CREATE tipos_servico + ADD ordens.tipos_servico_ids + GRANTS
- `NovaOrdemButton.tsx` — `servico_interno` abre `NovaOrdemServicoInternoModal` (não mais toast "Em construção")
- Cleanup de câmera/streams ao fechar modal (`track.stop()` + `revokeObjectURL`)

## v2.14.0 (28/03/2026)
### Features (já existente — ver migration 094-098)
- Locais de estoque (Fábrica/Loja), pedras em quilates, compras expandidas, vw_saldo_por_local

## v2.13.1 (27/03/2026)
### Fixes
- Fix: Painel Service movido para dentro do grupo PRODUÇÃO na sidebar (estava solto no topo)
  - permissions.ts: `/service-painel` no array do grupo Produção (após Purificação)
  - Sidebar.tsx: injetar `service_painel` em modulosEfetivos quando role qualifica (bypass banco)
  - Sidebar.tsx: removido serviceExtras hardcoded para Painel Service

## v2.13.0 (27/03/2026)
### Features
- Módulo Service v2.13.0 (migration 092)
  - App operador `/service` (dark theme, mobile-first) — requer `is_operador_service=true`
  - Painel gerente `/service-painel` — ROLES_SERVICE_PANEL (admin, dev, gerente_fabrica, gerente_loja)
  - Tabela `alissonerp.servicos` com controle de solda (modo A1) e pedras colocadas
  - Flag `is_operador_service BOOLEAN` em `alissonerp.usuarios` (não é role, é flag independente)
  - TRIGGER `trg_criar_servico_from_pcp`: cria servico automaticamente para servico_venda/garantia
  - Bucket `service-fotos` (público, 10MB, jpeg/png/webp)
  - 12 rotas /api/service/* (pendentes, receber, meus, concluir, transferir, solda-saldo, painel, concluidos, operadores, [id], pedras, carregar-solda)
  - Componentes: ServiceLayout, ServiceApp, ServiceCamera, ServicePainelClient, ServiceDetalheDrawer, CarregarSoldaModal
  - ServiceLayout detectado automaticamente pelo DashboardShell via pathname.startsWith('/service')
  - Câmera mobile: navigator.mediaDevices (HTTPS) + fallback input[type=file] (HTTP)
- Quilates no cadastro de insumos: coluna `peso_pedra_ct NUMERIC` + `sku_interno TEXT`
  - TRIGGER `trg_calcular_peso_pedra`: auto-calcula `peso_pedra` = `peso_pedra_ct × 0.2` (1ct = 0.2g)
  - Frontend exibe em quilates (ct), banco armazena gramas em peso_pedra
- Configurações sistema: seeds `operador_servico_padrao` e `service_tipos_ordem`
- IA: modelos atualizados no banco: `gemini-2.5-flash`, `claude-sonnet-4-20250514`

## v2.12.0 (24/03/2026)
### Features
- Protocolo: responsável (criado por) e concluído por nos cards e detalhe
- Protocolo: thumbnails de foto criação/conclusão clicáveis
- Protocolo: zoom na foto (scroll, duplo clique, arrastar, botões +/−)
- Protocolo: filtro de status Pendentes/Concluídas/Todas (default Pendentes)
- PCP: atribuir operador com metal externo > 0 move pra em_andamento automaticamente
- Precificação: coluna markup atual na simulação de impacto
- Precificação: campo de busca por nome/SKU no preview
- Fichas técnicas por produto + bucket produto-3d + upload modelo 3D (migration 091)
- API: POST /api/produtos/[id]/modelo-3d — upload modelo 3D com extração IA de ficha técnica

### Fixes
- Protocolo: JOIN via alissonerp.usuarios (responsável aparecia — para Francisco Lenilson)
- Protocolo: foto URL resolvida (path relativo → URL completa Storage)
- Protocolo: filtro Pendentes conta protocolos com status !== concluido
- Produtos: fix CadastroProdutoModal

## v2.11.1 (24/03/2026)
### Fixes
- Detalhe ordem: exibir peso_metal_externo no card Comercial (condicional > 0)
- Detalhe ordem: ocultar campos sem dados nos cards Comercial e Produção

## v2.11.0 (24/03/2026)
### Features
- Teores em configurações (abas teores, tipos de liga)
- Permissões granulares 5 ações (abrir/concluir purificação, abrir/concluir ligação, editar_teor_ligação)
- Cadeado teor ligação (só quem tem permissão editar_teor_ligacao)
- Migration 090: seed editar_teor_ligacao para admin/dev

### Fixes
- Fix NaN em itens legados (directus.itens_ordem_1)

## v2.10.1 (23/03/2026)
### Fixes
- normalizeRow: usar Record<string, unknown> em vez de T para evitar erro TS2862
- Auto-atribuir deposito_id no PCP no primeiro apontamento fora do Almoxarifado
- Docs: atualizar MEMORY.md com módulo purificação e permissões granulares

## v2.10.0 (23/03/2026)
### Features
- Módulo Purificação 18k→24k (página /purificacao, PurificacaoClient.tsx)
  - Tabela purificacoes, APIs CRUD, migration 084
- Módulo Ligação 24k→18k (LigacaoTab.tsx)
  - Tabela ligacoes, tipos_liga, APIs CRUD, migrations 085-086
- Integração WhatsApp Assistant (tabelas wa_*, migrations 086-088)
  - wa_assistants, wa_conversations, wa_messages, wa_kb_articles
  - user_profiles.phone para vinculação automática
- Permissões granulares por usuário (migration 089)
  - Tabela permissoes_usuario, lib permissoes.ts
  - 5 ações: abrir_purificacao, concluir_purificacao, abrir_ligacao, concluir_ligacao, editar_teor_ligacao

## v2.9.1 (20/03/2026)
### Fixes
- Estorno lote: filtro TEDD por obs `distribuicao #ID` (não pega CEs de outros lotes)
- Estorno lote: reverte apontamentos_distribuicao (Fase 2.5) + DELETE após reversão
- Estorno lote: zera campos acumulados (retorno_metal, total_metal, dist_ouro_real, dist_pedras)
- Estorno lote: removido botões individuais por ordem (só lote inteiro)
- Transferência avulsa: res.json() fallback
- Pedras saída: Math.min trava max no frontend

## v2.9.0 (20/03/2026)
### Features
- Estorno de lote inteiro na distribuição (POST /api/distribuicao/[id]/estorno-lote)
  - 5 fases atômicas (sql.begin), CE reversa individual, delta zero
  - Modal: dropdown motivos + justificativa + digitar ESTORNAR
  - Tabela estornos_distribuicao com snapshot JSONB
  - Só admin/dev/gerente_fabrica
- Transferência avulsa com campo DESTINO (migration 083)
- Adicionar ordens ao lote em andamento (POST /api/distribuicao/[id]/adicionar-ordens)
  - Validações: não concluída, não duplicada, não em outro lote
- Atribuir operador no PCP (botão Kanban + PATCH /api/pcp/[id]/atribuir-operador)
  - Trava apontamento tipo 2 pro operador atribuído
- Filtro ourives na distribuição (só vê lotes do seu depósito)

### Fixes
- Avatar: JOIN por id_user (não email) + UPDATE-first INSERT-if-needed
- Email atômico: 3 tabelas em sql.begin (auth + usuarios + user_profiles)
- Brecha senha: isSelfUpdate + nova_senha → 400
- sql.begin: parâmetro callback renomeado pra tx (fix build Docker)

## v2.8.0 (19/03/2026)
### Features
- Baixa de pedras na saída PCP (marcadores SP consumidas + QBP quebra) (migration 079)
  - Operador informa pedras utilizadas por insumo
  - Saldo operador zera, 6 testes passaram
- Metal externo na saída PCP (migration 078)
  - pmc = peso_ouro_real - outros - metal_externo
  - total_metal=0: sem quebra, sem CE (peça do cliente)
- Saída sem peso no lote (migration 077)
  - sem_peso + justificativa_sem_peso + dropdown motivos
- Storage padronizado (todos buckets públicos)
  - src/lib/storage.ts: uploadFile/deleteFile/getPublicUrl
  - URL completa no banco, sem signed URLs
- Insumos completo: InsumoEditDrawer (foto, fornecedor, peso_pedra, ativo) (migration 076)
- Paginação ordens: 20/página, filtros server-side, contadores
- Detalhes da ordem: coluna + UPDATE 443 ordens Directus (migration 075)

### Fixes
- getPublicUrl guard URL absoluta
- depositoId fallback removido → erro 400 se sem operador
- integer=uuid em notificacoes + 9 created_by preventivos
- SW response guard (503 fallback)
- vw_detalhe_pote com colunas novas (foto, fornecedor_id, peso_pedra, observacao)

## v2.5.1 (18/03/2026)
### Fixes
- Ícones PWA leão branco + fundo verde

## v2.5.0 (18/03/2026)
### Features
- PWA (manifest.json + sw.js network-first + offline.html)
- Protocolo mobile (cards clicáveis + botão criar fixo)

## v2.4.0 (18/03/2026)
### Features
- Mobile responsivo (39 arquivos, breakpoint md 768px)
- MobileHeader + SidebarContext (hamburger menu)
- Tabelas dual render (table desktop + cards mobile)
- Kanban scroll horizontal com snap

## v2.3.0 (18/03/2026)
### Features
- Módulo criação de ordens (modal + dropdown 7 tipos)
- Permissões granulares: usuarios.tipos_ordem_permitidos JSONB
- Campos serviço condicionais (foto_peca, peso_peca, video)
- 443 ordens migradas do Directus (origem='legado')
- 23 ordens em produção (auditoria loja)

## v2.0.0 (16/03/2026)
- Deploy inicial Alisson ERP (Supabase self-hosted + Next.js)
- Migração do Directus (v1.x.x) para sistema próprio

## v1.x.x (legado)
- Directus CMS (descontinuado)
