# Dossiê de dependências — Fluxos de aprovação AlissonERP

> Gerado em 11/07/2026 por mapeamento paralelo (10 agentes). Base para a centralização das aprovações.
> Autorização (quem pode) e efeitos de alto nível: ver mapa de esbarros. Este doc cobre FRONT, BANCO, CONTRATO, CAMPOS, ESTADOS, NOTIFICAÇÕES.

---

# FLUXO A — DESCONTO

## FRONT (chamadores + UI dependente de lock/status)
- `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx`:
  - :1651 e :1670 — POST `solicitar-aprovacao` (com body `{tipo}` e sem); :2389 — POST com `tipo` no botão inline
  - :1302 — POST `solicitar-desconto`; :1328 — GET polling `solicitacoes-desconto/[id]`
  - UI por campos: :2143 `isDescontoApproval = !!aprovacao_desconto_tarefa_id && aprovacao_desconto_status==="aguardando_aprovacao"`; :2146 `isCartaoApproval` idem c/ `aprovacao_cartao_desconto_tarefa_id`; :2154 `precisaSolicitarDesconto = temDescontoAlto && !desconto_aprovado_por_nome && !aprovacao_desconto_tarefa_id && situacao==="rascunho"`; :2160 `precisaSolicitarDescontoCartao = cartaoBloqueado && !aprovacao_cartao_desconto_tarefa_id && situacao==="rascunho"`; :2360 link `/tarefas/{aprovacao_desconto_tarefa_id}`; :2446/:2459 banners "liberado por X" via `desconto_cartao_aprovado_por_nome`/`desconto_aprovado_por_nome`; :749 realtime recarrega quando `desconto_aprovado_por`/situacao mudam
- `src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx` :1219 POST `solicitar-desconto`; :1254 GET polling; :1879/:2008/:3318 POST `solicitar-aprovacao`
- `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx` :772/:1308/:1642 e `NovaVendaClientLegado.tsx` :759/:1293/:1627 — POST `solicitar-aprovacao`
- `src/app/(dashboard)/vendas/autorizacoes/AutorizacoesClient.tsx` :48 GET `solicitacoes-desconto?status=`; :60 PATCH `solicitacoes-desconto/[id]` (tela de direção aprova/rejeita)
- Rejeição/aprovação de tarefa (tela /tarefas) → PATCH `src/app/api/tarefas/[id]/aprovacao/route.ts` (handler desconto :460, cartao :416)

## CONTRATO
- **POST /api/vendas/[id]/solicitar-aprovacao** — body `SolicitarAprovacaoSchema = z.object({tipo: z.string().max(50).optional()}).partial()` (route.ts:25). Respostas:
  - tipo=desconto: `{ok, aguardando_aprovacao_desconto: bool, tarefa_id?|message?}` (:98,:122,:159)
  - tipo=cartao_desconto: `{ok, ja_aprovado?|aguardando_aprovacao_cartao?, tarefa_id?|message?}` (:166-232)
  - default (crédito/aprovar direto): `{ok, aguardando_aprovacao_credito, tipo_aprovacao?, tarefa_id?, message?}` ou `{ok, aguardando_aprovacao_credito:false, ordem_criada, tiny_erro}` (:256-280)
  - Erros: 401/400/403/404, 409 "Venda não está em rascunho"/"Venda bloqueada"
- **POST /api/vendas/[id]/aprovar-desconto** — sem body (`_req`); resposta `{ok:true}`; 403 se role ∉ [admin, desenvolvedor]; 409 se não rascunho ou sem item acima do threshold (route.ts:24-38)
- **POST /api/vendas/solicitar-desconto** — `SolicitarDescontoSchema = {venda_id?, item_id?, produto_nome, preco_lista, pct_desconto, preco_solicitado}` (route.ts:7-14). Resposta 201: `{id, status, created_at}` (INSERT em `alissonerp.solicitacoes_desconto`)
- **GET /api/vendas/solicitacoes-desconto/[id]** — resposta `{id, status, pct_desconto_solicitado, preco_solicitado, autorizado_por_nome}` (polling)
- **PATCH /api/vendas/solicitacoes-desconto/[id]** — `{status: z.enum(["aprovado","rejeitado"]), observacao?}`; só admin/desenvolvedor; resposta `{ok:true, status}`; 409 se já processada

## CAMPOS lidos/escritos
- `vendas_erp` lidos (solicitar-aprovacao :60-70): `situacao, bloqueado, aprovacao_desconto_tarefa_id, aprovacao_cartao_desconto_tarefa_id, desconto_aprovado_por, desconto_cartao_aprovado_por, aprovacao_credito_tarefa_id` + `tem_desconto_alto` (EXISTS itens pct_desconto > threshold)
- `vendas_erp` escritos:
  - solicitar (desconto): `aprovacao_desconto_tarefa_id = tarefaId` (:153); (cartão): `aprovacao_cartao_desconto_tarefa_id = tarefaId` (:229)
  - decisão desconto (tarefas/[id]/aprovacao :464-489): aprovado → `aprovacao_desconto_tarefa_id=NULL, desconto_aprovado_por=user, desconto_aprovado_em=NOW()` + `itens_venda_erp SET pct_comissao=0.5, valor_comissao=ROUND(total_item*0.005,2)`; rejeitado → só `aprovacao_desconto_tarefa_id=NULL` (lock solto, sem aprovado_por)
  - decisão cartão (:423-437 e vendas-credito-aprovar.ts:252/:273): aprovado → `aprovacao_cartao_desconto_tarefa_id=NULL, desconto_cartao_aprovado_por, desconto_cartao_aprovado_em`; rejeitado → só NULL
  - aprovar-desconto (rota direta): `desconto_aprovado_por, desconto_aprovado_em` + conclui tarefa (`tarefas.status='concluida'`, `aprovacoes_tarefa.status='aprovado'`) + `aprovacao_credito_tarefa_id=NULL`, tudo em UMA transação com `logAudit` (route.ts:48-88)
- `solicitacoes_desconto` (pré-venda): INSERT `venda_id,item_id,produto_nome,preco_lista,pct_desconto_solicitado,preco_solicitado,solicitado_por_id/nome`; PATCH escreve `status, autorizado_por_id/nome, observacao`; se aprovado+item_id → `itens_venda_erp SET pct_desconto, preco_unitario, total_item, pct_comissao=0 (acima de 30% sem comissão), valor_comissao=0, desconto_autorizado_por`
- Enforcement downstream: `src/lib/vendas-aprovar.ts:653` bloqueia approveVenda se `tem_desconto_alto && !desconto_aprovado_por`; `src/lib/baixa-credito.ts:338` idem na baixa

## ESTADOS/transições
- Venda precisa estar `situacao='rascunho'` e `bloqueado=false` para solicitar (:71-76)
- Lock = tarefa_id preenchido → estado "aguardando_aprovacao"; decisão (aprovado ou rejeitado) sempre limpa o tarefa_id; aprovado adiciona carimbo `*_aprovado_por/em` (permanente até reedição)
- `solicitacoes_desconto.status`: `pendente → aprovado | rejeitado` (PATCH 409 se ≠ pendente)
- `tarefas.status`: criada `aguardando_aprovacao` → `aprovada|rejeitada` (aprovacao/route.ts:341-343) ou `concluida` (rota aprovar-desconto)
- Idempotência: re-solicitar com lock ativo retorna `{ok, message:"Já existe aprovação pendente"}` sem criar nova tarefa

## NOTIFICAÇÕES
- Criação de tarefa: `criarNotificacao` ao aprovador, link `/tarefas?abrir={id}` (src/lib/aprovacao-regras.ts:192)
- Decisão desconto: `criarNotificacao` ao solicitante ("Desconto liberado!"/"Desconto não aprovado"), link `/vendas/{id}` (tarefas/[id]/aprovacao/route.ts:492-501) + log em `webhook_log` nome `aprovacao_desconto` (:504,:513)
- Decisão cartão: `criarNotificacao` ao solicitante (:441 e vendas-credito-aprovar.ts:259/:277)
- Rota aprovar-desconto: `criarNotificacao` ao criador da tarefa ("Desconto aprovado — Venda N"), best-effort logado (route.ts:96-113)
- Fluxo `solicitacoes_desconto` (PATCH): **nenhuma notificação** — front descobre por polling GET

---

# FLUXO B — CRÉDITO / A RECEBER

**(1) FRONT (callers do endpoint `solicitar-aprovacao` + estados UI)**
- `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:1670` — `solicitarAprovacao()`: POST sem body (ramo crédito/aprovação direta); `:1651` variante c/ body; `:2389` body `{tipo:"desconto"}`
- `src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx:1879` (`{tipo:"desconto"}`), `:2008` (sem body, quando `temAReceber`), `:3318` (`{tipo:"cartao_desconto"}`)
- `NovaVendaClient.tsx:772,1308,1642` e `NovaVendaClientLegado.tsx:759,1293,1627` — POST sem body após salvar rascunho
- Estados UI (VendaDetalheClient.tsx): `:2120` `aguardandoAprovacaoCredito = !!venda.aprovacao_credito_tarefa_id && venda.aprovacao_credito_status==="aguardando_aprovacao"`; `:2121` `creditoFoiAprovado = !!venda.aprovacao_credito_tipo && creditoTarefaConcluida`; `:2336/2478` badge "diretor — comissão zerada"; `:2341` link `/tarefas/${aprovacao_credito_tarefa_id}`; `:2472` exibe `credito_gerente_usado`
- Decisão do aprovador vem pela tela de tarefas → `PATCH /api/tarefas/[id]/aprovacao` (route.ts:531-534 chama `processarAprovacaoCredito(tarefaId, user.id, body.decisao, body.motivo)` quando venda ativa + `aprovacao_credito_tipo` + sem tags desconto/cartao)

**(3) CONTRATO**
- `solicitar-aprovacao/route.ts:25-27`: zod `SolicitarAprovacaoSchema = z.object({ tipo: z.string().max(50).optional() }).partial()` — body vazio = ramo crédito
- Resposta ramo crédito (route.ts:256-263): `{ ok, aguardando_aprovacao_credito, tipo_aprovacao ("gerente"|"diretor"), tarefa_id, message }`
- Resposta ramo desconto (route.ts:158): `{ ok, aguardando_aprovacao_desconto, tarefa_id }`; ramo cartão (route.ts:233): `{ ok, aguardando_aprovacao_cartao, tarefa_id }`; sem A Receber (route.ts:273-279): `{ ok, aguardando_aprovacao_credito:false, ordem_criada?, tiny_erro? }`
- `processarAprovacaoCredito` retorna `AprovacaoResult` `{ ok, acao: "aprovado"|"rejeitado"|"cartao_liberado"|"cartao_rejeitado"|"erro", ordem_criada?, tiny_erro?, message }` (vendas-credito-aprovar.ts:224-428); rota tarefas devolve `{ ok:true, credito: resultado }` (aprovacao/route.ts:535)

**(4) CAMPOS lidos/escritos**
- Submissão (vendas-credito-aprovar.ts): lê `vendas_erp.total_venda`, `pagamentos_venda` (confirmados / A Receber pendente, :48-55); escreve `tarefas` INSERT (:158-166, status `aguardando_aprovacao`, tags `["credito_loja", tipo]`), `aprovacoes_tarefa` INSERT (:170-172), `vendas_erp SET aprovacao_credito_tipo, aprovacao_credito_tarefa_id` (:175-180)
- Aprovação gerente (:346-350): `vendas_erp.credito_gerente_usado = valorAReceber` + `debitarSaldo()` (:344)
- Aprovação diretor (:353-361): `itens_venda_erp SET pct_comissao=0, valor_comissao=0` + `vendas_erp.total_comissao=0`
- Rejeição (:314-319): `vendas_erp SET aprovacao_credito_tarefa_id=NULL, aprovacao_credito_tipo=NULL`
- Conta a receber NÃO é criada na lib — vem do trigger `trg_venda_gerar_conta_receber` no update p/ 'aprovado' (:374-380)
- Guard: bloqueia se desconto > threshold sem `desconto_aprovado_por` (:294-310, loga em `webhook_log`)

**(5) ESTADOS/transições**
- Venda fica em `rascunho` durante toda a aprovação de crédito (route.ts:73 exige `situacao === "rascunho"`)
- Aprovado + todos pagamentos não-A-Receber confirmados → `approveVenda` → `rascunho → aprovado` (:392-403); se ainda há pendentes, venda fica em rascunho até `confirmar` pagamento ou webhook MP dispararem `approveVenda` (confirmar/route.ts:349-350; webhook-mp route.ts:532-536)
- Tarefa: `aguardando_aprovacao` → concluída/rejeitada via `/api/tarefas/[id]/aprovacao`

**(6) NOTIFICAÇÕES** (todas `criarNotificacao`, best-effort com catch)
- Submissão → aprovador: título da tarefa, link `/tarefas?abrir=${tarefa_id}` (vendas-credito-aprovar.ts:196-203)
- Rejeição → consultora (`tarefa.criado_por`): "Crédito rejeitado — {numero}" (:322-330)
- Aprovação → consultora: msg varia gerente/diretor/aguardando pagamentos (:405-419)
- Ramo cartao_desconto: "Cartão de crédito liberado!" (:259-267) / "não aprovado" (:279-287)

# FLUXO C — VENDA GERAL (approveVenda / estornarVenda)

**(1) CALL SITES de `approveVenda` (todos passam `{ tinyBestEffort: true }`)**
- `src/app/api/vendas/[id]/solicitar-aprovacao/route.ts:273` — `(vendaId, user.id)` — sem A Receber, aprova direto (qualquer role)
- `src/app/api/vendas/[id]/route.ts:735` — `(vendaId, user.id)` — PUT da venda quando muda pra aprovado
- `src/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route.ts:350` — `(vendaId, user.id)` — auto-aprovação ao confirmar último pagamento (rascunho + `aprovacao_credito_tipo` setado)
- `src/app/api/vendas/[id]/pagamentos/[pagId]/route.ts:109` — `(vendaId, user.id)`
- `src/app/api/webhooks/mercado-pago/route.ts:536` — `(vendaId, sysUser)` — pagamento MP confirmado, crédito já aprovado, sem outros pendentes
- `src/app/api/vendas/solicitacoes-alteracao/[id]/route.ts:254` — `(Number(sol.venda_id), user.id)`; `:359` — `(vendaId, adminId)`
- `src/lib/vendas-credito-aprovar.ts:394` — `(vendaId, aprovadorId)` — após aprovar crédito
- `src/lib/baixa-credito.ts:22` (import; uso interno na baixa de crédito)

**(3) CONTRATO**
- `approveVenda(vendaId, userId, opts {tinyBestEffort?})` → `{ ok:true, ordem_criada?, ja_aprovada?, tiny_erro? }` (vendas-aprovar.ts:598-602)
- `estornarVenda` → `{ ok, acao: "cancelada"|"revertida_rascunho"|"ja_estornado"|"mantida_terminal", outros_confirmados, cr_canceladas }` (:800-920)

**(4) CAMPOS lidos/escritos (approveVenda)**
- Lê: `vendas_erp.situacao/bloqueado/tiny_pedido_id/desconto_aprovado_por`, `itens_venda_erp.pct_desconto` (:604-612), `contatos.celular` (:629-640 — celular obrigatório, throw se vazio), `desconto_cartao_aprovado_por` + pagamento confirmado (:643-653 — skip se cartão liberado sem pagamento)
- Escreve: `vendas_erp SET situacao='aprovado'` (:679-682); `tiny_sync_status/tiny_sync_erro` via sendToTiny (:233,304,329,337); `ordens/itens_ordem/fichas_tecnicas` via criarOrdemDoOrcamento/DeServico (:415-483,547-568); `cofre_ouro_rastreios` entrada_upgrade + `itens_venda_upgrade.cofre_registrado=true` (:743-760); reposição automática best-effort (:704-716). NÃO baixa estoque (baixa só na entrega, :700-703)
- estornarVenda escreve: `pagamentos_venda.status='estornado'` (:857), `vendas_erp.situacao` (rascunho :884-886 ou cancelado :894-896), `contas_receber.situacao='cancelado'` p/ pago+pendente (:906-909)

**(5) ESTADOS/transições de vendas_erp.situacao**
- `rascunho → aprovado`: approveVenda (guard `NOT IN (aprovado,concluido,confirmado,cancelado)`, :681); idempotente — retorna `ja_aprovada` se já aprovado/concluido/confirmado (:617-619)
- Estorno: `→ rascunho` se restam outros pagamentos confirmados; `→ cancelado` se era o único (trigger 111 reverte estoque); `entregue/concluido` = terminal, mantém (`mantida_terminal`, :825, comentário :796-799)
- Disparadores das transições: rotas listadas em (1) + webhook MP (refunded/cancelled/charged_back → estornarVenda)

**(6) NOTIFICAÇÕES**
- `approveVenda`/`estornarVenda`: **não encontrado** nenhum `criarNotificacao` em vendas-aprovar.ts (só logs em `webhook_log` no bloqueio por desconto, :656-659). Notificações do fluxo saem das libs chamadoras (ex.: vendas-credito-aprovar.ts).

---

## FLUXO D — ENTREGA SEM PAGAMENTO (crediário ②)

**FRONT**
- `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:712` — `POST /api/vendas/${vendaId}/solicitar-aprovacao-entrega` via `handleSolicitarAprovacaoEntrega` (estado `solicitandoEntrega`, linha ~706)
- Botão amarelo "Solicitar aprovação para entregar devendo" renderizado quando `venda.entrega_devendo && situacao in ('aprovado','em_rota')` — `VendaDetalheClient.tsx:2484-2506`; se `entrega_excecao_status === 'aprovado'` mostra banner verde "pode entregar normalmente" (`:2485`); se `'pendente'` banner azul "aguardando o SEO" (`:2491`)
- Tipo do campo no front: `entrega_excecao_status?: 'pendente'|'aprovado'|null` — `VendaDetalheClient.tsx:127`
- Badge "entregue com pendência financeira" derivado de `venda.entregue_com_pendencia_financeira` — `VendaDetalheClient.tsx:2163` (comentário) e uso adiante
- Campos vêm do GET venda: `src/app/api/vendas/[id]/route.ts:104` (`entrega_devendo`), `:108` (`entrega_excecao_status`), `:293` (`entregue_com_pendencia_financeira`)

**CONTRATO**
- `POST /api/vendas/[id]/solicitar-aprovacao-entrega` (`route.ts:19-64`): sem body. Respostas: 401/400/404; 409 se cancelado/rascunho (`:33`), 409 se não está devendo (`:38`), `{ok:true,status:'aprovado',jaAprovado:true}` se já aprovado (`:46`), sucesso `{ok:true,status:'pendente',tarefaId,jaExistia}` (`:55`), 409 se aprovador não configurado (`:59`)
- Caminho alternativo: `PATCH /api/vendas/[id]` p/ `entregue` com pagamento incompleto e sem exceção → auto-solicita e responde **202** `{ok:true, precisa_aprovacao_entrega:true, tarefa_id, ja_existia, message}` — `src/app/api/vendas/[id]/route.ts:683-699`
- Decisão: via `PATCH /api/tarefas/[id]/aprovacao` quando `tarefa.tipo === ENTREGA_SEM_PAGAMENTO_TIPO` → chama `processarAprovacaoEntregaSemPagamento` — `src/app/api/tarefas/[id]/aprovacao/route.ts:375`. Retorno da lib: `{ok:true, decisao, venda_id, saldo_aberto?}` (`entrega-sem-pagamento.ts:281`)

**CAMPOS lidos/escritos**
- Lidos p/ totais (`calcularTotais`, `entrega-sem-pagamento.ts:30-72`): `vendas_erp.total_venda/data_entrega/cliente_id/numero_venda`, `pagamentos_venda.valor/status/forma/data_confirmacao`, `contas_receber.valor/situacao/categoria`
- Solicitação escreve: `tarefas` (INSERT, tipo `entrega_sem_pagamento_total`, status `aguardando_aprovacao`, tags — `:148-159`), `aprovacoes_tarefa` (INSERT `:161-164`), `vendas_entrega_excecoes_pagamento` (INSERT: venda_id, tarefa_id, solicitante_id, status='pendente', snapshot total_venda/valor_confirmado_no_momento/valor_a_receber_existente_no_momento/valor_aberto_no_momento, motivo_solicitacao — `:166-176`)
- Aprovação escreve (tx `:305-318`): `vendas_entrega_excecoes_pagamento.status='aprovado'/aprovador_id/motivo_decisao/respondido_em/updated_at` + `garantirAReceberSemDuplicar` (`:199-274`): cancela `pagamentos_venda` pendentes não-'A Receber' (`:205-211`), ajusta/insere pagamento 'A Receber' (`:222-236`), ajusta/insere `contas_receber` (`:249-271`). NÃO toca `vendas_erp.situacao` (Model A — `:315-317`)
- Rejeição: só `vendas_entrega_excecoes_pagamento.status='rejeitado'` + aprovador/motivo/respondido_em (`:293-300`)

**ESTADOS** — `vendas_entrega_excecoes_pagamento.status`: `pendente → aprovado | rejeitado` (idempotente: se já não-pendente devolve o status atual, `:289-291`). A venda NÃO muda de situação; exceção aprovada só destrava o gate do `criarEntrega` — `src/lib/entrega-venda.ts:656-666` (barra com erro se devendo sem exceção)

**NOTIFICAÇÕES** — `criarNotificacao` ao aprovador na solicitação: tipo `aprovacao`, link `/tarefas?abrir=${tarefa.id}`, best-effort `.catch(()=>{})` — `entrega-sem-pagamento.ts:178-186`. Na decisão: não encontrado dentro da lib (notificação de decisão fica a cargo da rota de tarefas)

## FLUXO E — ALTERAÇÃO DE VENDA (solicitacoes_alteracao)

**FRONT**
- Solicitar: `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:1624` — `POST /api/vendas/${venda.id}/solicitar-alteracao` em `enviarSolicitacaoAlteracao()`; modal aberto "via 403 + solicitar:true" (comentário `:1606`), estados `solicitarPayload/solicitarMotivo/solicitarErro/solicitarSucesso/solicitarEnviando`
- Aprovar/rejeitar (tela admin): `src/app/(dashboard)/vendas/solicitacoes-alteracao/SolicitacoesAlteracaoClient.tsx` — GET lista `:74` (`?status=${tab}`, tabs pendente/aprovado/rejeitado), PATCH decisão `:86` e `:112`, invalidação react-query `["solicitacoes-alteracao"]` `:95/:123/:159`

**CONTRATO**
- `POST /api/vendas/[id]/solicitar-alteracao` (`route.ts:9-15`): zod `{tipo:'pagamento_status'|'venda_campo', pagamento_id?, campo?(max 50), valor_solicitado:unknown, motivo:1..1000}`. Campos permitidos: `situacao, cliente_id, vendedor_id, data_venda` (`:19-21`); status pgto válidos: `pendente/confirmado/cancelado/estornado` (`:24-26`). Erros: 404/403 ownership (`:42-48`), 409 venda cancelada/bloqueada/concluída (`:54-59`), 400 validações, 409 duplicata pendente (`:98-111`). Resposta: `{id, status}` (`:164`)
- `GET /api/vendas/solicitacoes-alteracao` (`route.ts:7-42`): `?status=` (default pendente), 403 se role fora de `admin/desenvolvedor/diretor` (`:5,11`). Resposta: array com s.* + `numero_venda, pagamento_forma, pagamento_valor` (LIMIT 200)
- `PATCH /api/vendas/solicitacoes-alteracao/[id]` (`[id]/route.ts:28-31`): zod `{decisao:'aprovado'|'rejeitado', motivo?(max 1000)}`. 403 role (`:49`), 404, 409 já processada (`:71-73`). Resposta `{ok:true}` (`:114/:301`); 502 com reabertura se pós-commit falhar (`:171-183`); 400 auto-rejeição de campo restrito a rascunho (`:215-218`)

**CAMPOS lidos/escritos**
- Solicitação INSERT `solicitacoes_alteracao`: tipo, venda_id, pagamento_id, campo, valor_atual (snapshot jsonb), valor_solicitado (jsonb), motivo, solicitado_por_id, solicitado_por_nome — `solicitar-alteracao/route.ts:117-133`
- Decisão escreve em `solicitacoes_alteracao`: status, decidido_por_id, decidido_por_nome, motivo_decisao, decidido_em (`[id]/route.ts:101-109` rejeição; `:151-159`, `:263-271`, `:281-289` aprovação) + `logAudit` tabela `solicitacoes_alteracao` (`:82-94`)
- Aprovação `pagamento_status`: `pagamentos_venda.status` (+`data_confirmacao` se confirmado) `:139-150`; pós-commit `posCommitPagamento` (`:337-375`): confirmado → auto-`approveVenda` se rascunho c/ crédito e 0 pendentes não-A-Receber; estornado → `estornarVenda`; falha → reverte solicitação p/ pendente (`:172-178`)
- Aprovação `venda_campo`: `vendas_erp.situacao/cliente_id/vendedor_id/data_venda` via `aplicarCampoVendaTx` (`:380-415`); `situacao='aprovado'` roteia por `approveVenda` (helper com tx própria, `:252-259`)

**ESTADOS**
- `solicitacoes_alteracao.status`: `pendente → aprovado | rejeitado` (inclui auto-rejeição `:200-219` e reabertura p/ pendente após falha pós-commit `:172-178`)
- Guards de transição da venda: campos `cliente_id/vendedor_id/data_venda` só em rascunho (`:13`, `:192-220`); `situacao` proibida p/ `concluido/enviado` (aposentados, `:24`, `:245-250`); `entregue` bloqueado se pagamento incompleto sem exceção aprovada (cruza com Fluxo D — `:225-243`, usa `vendaTemPagamentoCompleto` + `vendaTemExcecaoEntregaAprovada`)

**NOTIFICAÇÕES**
- Na solicitação: `criarNotificacao` tipo `aprovacao` p/ TODOS usuários role `admin/desenvolvedor/diretor`, link `/vendas/solicitacoes-alteracao`, try/catch não-fatal — `solicitar-alteracao/route.ts:136-162`
- Na decisão: `notificarSolicitante` (tipo `aprovacao`, link `/vendas/${venda_id}`, best-effort) — `[id]/route.ts:113/:300` e `:305-333`
- Webhook/WhatsApp: não encontrado nesses fluxos

---

## FLUXO F — DESPACHANTE CENTRAL DE APROVAÇÃO DE TAREFAS

### (1) FRONT
- **TarefasClient.tsx** (página /tarefas): aprova/rejeita da aba "Aprovações pendentes" — `handleAprovar`/`handleRejeitar` fazem `GET /api/tarefas/{id}/aprovacao`, pegam a aprovação `status === "pendente"` (fallback `aprovacoes[0]`), depois `PATCH` com `{aprovacao_id, decisao: "aprovado"|"rejeitado", motivo}` — `src/app/(dashboard)/tarefas/TarefasClient.tsx:578-585, 615-622`. Exceção: tipos `conversao_sku`/`conversao` usam endpoints próprios `/api/conversao-sku/aprovar|recusar` e `/api/conversao/aprovar|recusar` com `{tarefa_id, motivo}` (TarefasClient.tsx:~555-618). Espera de resposta: só sucesso/erro; recarrega via `carregar()`+`carregarStats()`.
- **TarefaDrawer.tsx**: `solicitarAprovacao()` → `POST` `{aprovador_id}` (TarefaDrawer.tsx:277); `responderAprovacao()` → `PATCH` `{aprovacao_id, decisao, motivo}` (TarefaDrawer.tsx:291); `moverStatus()` → `PATCH /api/tarefas/{id}` `{status}` (TarefaDrawer.tsx:265). Lista aprovações via `GET .../aprovacao` como `Aprovacao[]` (TarefaDrawer.tsx:168).
- **AprovacaoBottomSheet.tsx** (aprovação a partir da notificação, sem sair da tela): busca `GET /api/tarefas/{id}` + `GET .../aprovacao` (linhas 101-102); `enviarDecisao()` faz PATCH `{aprovacao_id, decisao, motivo?}` (linha 220-227); espera `r.ok`, lê `{error}` no erro. Usado pelo **NotificacoesDrawer.tsx** (comentário linha 5).
- Estados de UI: coluna kanban `aguardando_aprovacao` (TarefasClient.tsx:255); filtro esconde `concluida/cancelada/vencida/aprovada` (246); aba pendentes = `status === "aguardando_aprovacao"` (641); após decisão remove card se status ∈ `aprovada/rejeitada/concluida/cancelada` (1099). Lock de venda na UI: `venda.aprovacao_credito_tarefa_id` / `aprovacao_desconto_tarefa_id` linkam pra `/tarefas/{id}` (`src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:2341, 2361`).

### (3) CONTRATO (`src/app/api/tarefas/[id]/aprovacao/route.ts`)
- `AprovacaoTarefaPostSchema` (linha 29): `{aprovador_id: string min(1)}` .passthrough(). Resposta POST: `{id}` 201.
- `AprovacaoTarefaPatchSchema` (linha 33): `{aprovacao_id: number+, decisao: "aprovado"|"rejeitado", motivo?: string}` .passthrough().
- GET: array de `{id, tarefa_id, status, motivo, created_at, respondido_em, solicitante_nome, aprovador_nome, solicitante_id, aprovador_id}` (linhas 250-263).
- Respostas do PATCH por handler (cada um retorna e encerra):
  - `{ok:true, entrega_sem_pagamento: resultado}` (~382)
  - `{ok:true, quebra_limpeza: baixa}` (~415) — erro: `{error}` com status do serviço
  - `{ok:true, cartao_desconto:{decisao}}` (~455)
  - `{ok:true, desconto:{decisao}}` (~507)
  - `{ok:true, credito: resultado}` (~537)
  - `{ok:true, devolucao_estoque: resultado}` (~551) / `{ok:true, devolucao: resultado}` (~566)
  - `{ok:true, compra_comercial: resultado}` (~574) — resultado pode ser `{ok:false, motivo:"compra_nao_encontrada"}`
  - `{ok:true, recebimento_metal: resultado}` (~583) / `{ok:true, compra_metal: resultado}` (~592)
  - fallback genérico: `{ok:true}` (~608)
- Erros: 401 não autenticado; 404 aprovação não encontrada (~325); 403 "Somente o aprovador pode responder" (admin/desenvolvedor bypass, ~330-337).
- `src/app/api/tarefas/[id]/route.ts` — `TarefaPatchSchema` (linha 10): `{titulo?, descricao?, responsavel_id?|null, prioridade?, status?, data_limite?|null, ordem_id?, ordem_ids?, peso_metal?, tags?, tipo?, motivo_delegacao?}` .passthrough(). Resposta `{ok:true}`. GET retorna tarefa completa + `responsavel_nome/criador_nome/numero_ordem` (linhas 38-51), 403 se não owner nem isFullAccess.

### (4) CAMPOS lidos/escritos
- POST: `tarefas.status='aguardando_aprovacao'`, INSERT `aprovacoes_tarefa(tarefa_id, solicitante_id, aprovador_id, status='pendente')`, INSERT `tarefas_historico(acao='aguardando_aprovacao')` (linhas 280-294).
- PATCH (comum a todos): `aprovacoes_tarefa SET status=decisao, motivo, respondido_em=now()` (~340); `tarefas SET status='aprovada'|'rejeitada'` + `concluida_em=now()` se aprovado (~344); depois `processarDecisao()` de `@/lib/aprovacao-regras` (linha 22, chamada 348).
- Dispatch lê: `tarefas.venda_id/tags/tipo` + `vendas_erp.aprovacao_credito_tipo/situacao` (linhas 351-357); tags aceitas como array ou string `{a,b}` (359-361).
- `cartao_desconto`: `vendas_erp.aprovacao_cartao_desconto_tarefa_id=NULL` + (se aprovado) `desconto_cartao_aprovado_por/em` (~424-434).
- `aprovacao_desconto`: `vendas_erp.aprovacao_desconto_tarefa_id=NULL` + `desconto_aprovado_por/em`; se aprovado, `itens_venda_erp.pct_comissao=0.5, valor_comissao=ROUND(total_item*0.005,2)` (~470-480); loga em `alissonerp.webhook_log('aprovacao_desconto')` ok/erro (504-512).
- `compra_comercial` (handler local): lê `compras_comercial` por `tarefa_aprovacao_id`; rejeição atualiza situação (linhas 40-61+).
- PATCH de `/api/tarefas/[id]`: UPDATE com COALESCE em titulo/descricao/responsavel_id/prioridade/**status**/data_limite/ordem_id(s)/peso_metal/tags/tipo; `concluida_em=NOW()` se status vira `concluida` ou `aprovada` (route.ts:122-141); troca de responsável grava `tarefas_historico(acao='atribuida')` com motivo_delegacao (109-119). ⚠️ Este PATCH muda status SEM passar pelo despachante de aprovação.

### (5) ESTADOS/transições
- `tarefas.status`: (qualquer) → `aguardando_aprovacao` (POST) → `aprovada` (+concluida_em) | `rejeitada` (PATCH aprovacao). Também `concluida/cancelada/vencida` via PATCH genérico da tarefa (moverStatus no drawer/kanban).
- `aprovacoes_tarefa.status`: `pendente` → `aprovado` | `rejeitado`.
- Roteamento por tipo/tag na ordem: entrega_sem_pagamento → quebra/limpeza (`limpeza_ouro:<baixaId>`) → cartao_desconto → aprovacao_desconto → crédito (só se venda ativa ∉ cancelado/entregue/aprovado E `aprovacao_credito_tipo` setado, excluindo tags desconto/venda) → devolucao_estoque (prioridade sobre devolucao) → devolucao (por tag ou `devolucoes_venda.tarefa_id`) → compra_comercial → recebimento_metal → compra_metal → genérico (linhas 373-608).

### (6) NOTIFICAÇÕES (`criarNotificacao` de `@/lib/notificacoes`)
- POST: pro aprovador — tipo `aprovacao`, "Aprovação solicitada", link `/tarefas?abrir={id}` (linhas 296-303).
- PATCH cartao_desconto: pro solicitante — "Cartão de crédito liberado!/não aprovado", link `/vendas/{venda_id}` (~441-450).
- PATCH desconto: pro solicitante — "Desconto liberado!/não aprovado", link `/vendas/{venda_id}` + INSERT `webhook_log('aprovacao_desconto')` (~492-506).
- PATCH fallback genérico: pro solicitante — "Tarefa aprovada!/rejeitada", link `/tarefas?abrir={id}` (~598-605).
- Handlers delegados (crédito/devolução/entrega_sem_pagamento/metal) notificam dentro das próprias libs — não verificado aqui.
- PATCH `/api/tarefas/[id]`: notificação de delegação pro novo responsável, tipo `tarefa` (route.ts:144-151).

Arquivos: `src/app/api/tarefas/[id]/aprovacao/route.ts` (608 linhas), `src/app/api/tarefas/[id]/route.ts` (180 linhas), `src/app/(dashboard)/tarefas/TarefasClient.tsx`, `src/app/(dashboard)/tarefas/TarefaDrawer.tsx`, `src/components/AprovacaoBottomSheet.tsx`.

---

# FLUXO G — METAL (aprovações acima do teto)

## G1 — Compras de metal (compras_metal)

**FRONT**
- `src/components/metal/DrawerCompraDetalhe.tsx:93` — POST `/api/metal/aprovacoes/{aprovacao.id}/aprovar`; `:115` — POST `.../rejeitar` (body `{motivo}`)
- Botões Aprovar/Rejeitar só aparecem se `compra.status === "pendente_aprovacao" && aprovacao` (DrawerCompraDetalhe.tsx:291); mostra R$/g vs teto (`:295`)
- `src/components/metal/CompraForm.tsx:108` — envia `acima_teto` no POST de criação; comentário `:12`: nasce `pendente_aprovacao` se acima do teto
- `src/components/metal/StatusPagamento.tsx:27` — badge roxo "Pend. Aprovação" distinto de pendente_pagamento
- `src/components/metal/ResumoMetal.tsx:47` — soma pendentes = `pendente_pagamento || pendente_aprovacao`
- Páginas: `src/app/(dashboard)/metal/{page,comprar,receber,historico}` + `MetalPageClient.tsx`
- Segundo caminho de aprovação: via tarefa — link `/tarefas?abrir={tarefa.id}` (notificação), handler em `src/app/api/tarefas/[id]/aprovacao/route.ts:203-231` (atualiza compras_metal + compras_metal_aprovacoes)

**CONTRATO**
- GET `/api/metal/aprovacoes` (route.ts:16-32): query `status,page,limit` (sem zod) → `{data: CompraAprovacaoRecord & {compra_numero,fornecedor_nome,solicitante_nome}[], total}` (compras.ts:453-497)
- POST `[id]/aprovar` (route.ts:17-29): sem body → `{ok:true}`; erro 400 `{error:msg}`
- POST `[id]/rejeitar` (route.ts:17-36): body opcional `{motivo?}` (sem zod, `req.json().catch`) → `{ok:true}`
- Guard: 403 se `!ROLES_METAL_APROVACOES.includes(user.role)` (todas as 3 rotas)

**CAMPOS**
- Aprovar (compras.ts:500-518): `compras_metal_aprovacoes SET status='aprovado', aprovador_id, updated_at`; `compras_metal SET status='pendente_pagamento', updated_at`
- Rejeitar (compras.ts:522-538): `..._aprovacoes SET status='rejeitado', aprovador_id, motivo, updated_at`; `compras_metal SET status='cancelado', updated_at`
- Lidos: `compras_metal_aprovacoes.status` (guard "já processada" :505/:527); criação grava `max_limit, cotacao_ouro, valor_pago_grama, solicitante_id` (compras.ts:146-148)
- vendas_erp: não tocada no fluxo de compras

**ESTADOS compras_metal**
- Nasce `pendente_pagamento` OU `pendente_aprovacao` se `valor_pago_grama > max_limit` (compras.ts:68)
- `pendente_aprovacao → pendente_pagamento` (aprovar) | `→ cancelado` (rejeitar)
- `pendente_pagamento → confirmado` (pagamento manual, compras.ts:318) | `→ cancelado` (compras.ts:356; só de pendente_pagamento :350)
- Gerar pagamento exige `status='pendente_pagamento'` (compras.ts:185)
- compras_metal_aprovacoes: `pendente → aprovado | rejeitado`

**NOTIFICAÇÕES**
- Na criação acima do teto: `criarNotificacao` ao aprovador, tipo `aprovacao`, link `/tarefas?abrir=` (`src/app/api/metal/compras/route.ts:101`) + cria `aprovacoes_tarefa` e grava `compras_metal.tarefa_aprovacao_id`
- Na aprovação/rejeição em si: não encontrado (nenhuma notificação nas rotas aprovar/rejeitar nem nas libs)

## G2 — Recebimentos de metal (recebimentos_metal)

**FRONT**
- `src/components/metal/RecebimentoForm.tsx:118` — envia `acima_teto`; `:128` — se resposta `status==='pendente_aprovacao'`, avisa usuário
- Aprovação NÃO tem endpoint próprio `/api/metal/...` — só via tarefas: `src/app/api/tarefas/[id]/aprovacao/route.ts:184-189` chama `aprovarRecebimentoMetal`/`rejeitarRecebimentoMetal`
- `src/components/metal/DrawerRecebimentoDetalhe.tsx`, `TabelaRecebimentos.tsx` (listagem/detalhe)

**CONTRATO**
- Aprovação via POST `/api/tarefas/[id]/aprovacao` (fluxo genérico de tarefas, com `motivo` na rejeição); `aprovarRecebimentoMetal` retorna `{ok:true, recebimento_id}` (recebimentos.ts:379)

**CAMPOS**
- Aprovar (recebimentos.ts:323-381, em transação): lê `recebimentos_metal.*` (guard `status==='pendente_aprovacao'` :328) e `vendas_erp.total_venda`; escreve `vendas_erp.total_venda = total - crédito` (:348-352), INSERT `creditos_cliente (cliente_id, saldo_disponivel, venda_origem_id, status='ativo')` se excedente (:359-362), `recebimentos_metal SET status='ativo', cofre_registrado=true, credito_excedente, credito_excedente_id, updated_at`
- Rejeitar (recebimentos.ts:389-403): guard `pendente_aprovacao` (:394); `SET status='cancelado', motivo...` — sem impacto financeiro
- Cancelar recebimento ativo (recebimentos.ts:182-224): exige `status='ativo'`; cancela `creditos_cliente` (status='cancelado', saldo=0) e recebimento

**ESTADOS recebimentos_metal**
- Nasce `ativo` (entra no cofre, crédito aplicado) OU `pendente_aprovacao` se `acima_teto && valor_credito_grama > maxLimit` (recebimentos.ts:50,93)
- `pendente_aprovacao → ativo` (aprovar) | `→ cancelado` (rejeitar)
- `ativo → cancelado` (cancelamento, desfaz crédito)

**NOTIFICAÇÕES**
- Na criação acima do teto: `criarNotificacao` ao aprovador + `aprovacoes_tarefa` + `recebimentos_metal.tarefa_aprovacao_id` (`src/app/api/metal/recebimentos/route.ts:94`)
- Na aprovação/rejeição: não encontrado nas libs de metal (fluxo genérico de tarefas pode notificar por fora)

---

# FLUXO H — CONVERSÃO (estoque→peso) e CONVERSÃO-SKU

## H1. CONVERSÃO (conversoes_estoque, "virou peso")

**FRONT**
- Criação: `src/components/forms/ConversaoModal.tsx:167` → POST `/api/estoque-comercial/converter`
- Aprovar/recusar via tela de tarefas (branch por `tipo === "conversao"`): `src/app/(dashboard)/tarefas/TarefasClient.tsx:571` (aprovar, body `{tarefa_id}`), `:609` (recusar, body `{tarefa_id, motivo: motivoRejeicao}`); drawer: `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:894` (aprovar), `:920` (recusar)
- Listagem/detalhe dependem de `status_conversao`: `src/app/(dashboard)/conversoes/page.tsx:26`, `ConversoesListClient.tsx:143` (Badge), `[id]/ConversaoDetalheClient.tsx:101,113,151` (Badge/Row/Timeline; comentário linha 35: "status_conversao = 'concluido' → 3 passos marcados")

**CONTRATO**
- Criar — `src/app/api/estoque-comercial/converter/route.ts:12-20` `ConverterPostSchema`: `{ itens: [{produto_id, peso_individual, quantidade}] (min 1), foto_base64?, insumo_destino? }`. Resposta 201: `{ ordem_id, numero_ordem ("C-NNNN"), conversao_id }`
- Aprovar — `src/app/api/conversao/aprovar/route.ts:8-11` `{ tarefa_id (obrig), conversao_id? }`. Resposta: `{ ok: true, message: "Conversão aprovada! Xg entraram no Caixa de Ouro." }`
- Recusar — `src/app/api/conversao/recusar/route.ts:9-14` `{ tarefa_id, conversao_id?, motivo?, foto_base64? }`. Resposta: `{ ok: true, message: "Conversão recusada. Produtos devolvidos ao estoque." }`
- Erros: 401 / 403 (não admin) / 404 / 409 se `tarefa.status !== 'aguardando_aprovacao'` ou `status_conversao !== 'pendente'` (aprovar:48-51,74-76)

**CAMPOS lidos/escritos (aprovar, route.ts:95-165, tudo em `sql.begin`)**
- `tarefas`: SET `status='aprovada', concluida_em, updated_at` (:97-100)
- `conversoes_estoque`: SET `status_conversao='concluido', cofre_registrado=true, aprovado_por, aprovado_em, updated_at` (:105-113)
- `reservas_estoque_comercial`: `status='efetivado', efetivado_em` WHERE `status='ativo'` (:119-122)
- `movimentacoes_estoque_comercial`: INSERT saída `motivo='virou_peso'`, `local_estoque_id=2`, `status='efetivado'` (:125-133); `conversao_itens.movimento_baixa_id` = mov.id (:137-140)
- `cofre_ouro_rastreios`: INSERT `evento='entrada_conversao'`, gramas=peso_total (:147-154)
- `ordens`: SET `status='concluido', data_conclusao` (:158-161); `tarefas_historico` INSERT 'aprovada' (:164-167)
- Recusar (recusar/route.ts:98-140): `tarefas.status='rejeitada'`; `conversoes_estoque` SET `status_conversao='recusado', recusado_por/em, foto_recusa, motivo_recusa`; reservas → `status='cancelado', cancelado_em'`; `ordens` SET `status='cancelado', situacao='cancelado'`; histórico 'rejeitada'
- NÃO toca `vendas_erp` (fluxo é de estoque, não de venda)

**ESTADOS** — `status_conversao`: `pendente` → `concluido` (aprovação; Conversão 2.0 vai direto pro cofre, não passa mais por protocolo — comentário aprovar:14-19) | `pendente` → `recusado`. Legado por protocolo: `fn_concluir_protocolo_conversao` (migration 242:144+, trigger `trg_concluir_conversao` em `protocolos`, 242:219-220).

**NOTIFICAÇÕES** — não encontrado (nenhum `criarNotificacao`/webhook nas rotas nem nas migrations 242/253; a "notificação" é a própria tarefa criada por trigger).

**BANCO/TRIGGERS**
- `trg_criar_tarefa_conversao` AFTER INSERT em `conversoes_estoque` → `fn_processar_conversao` cria tarefa `aguardando_aprovacao` p/ admin e grava `tarefa_aprovacao_id` (migrations/242_conversao_estoque.sql:125-135)
- `trg_concluir_conversao` AFTER UPDATE em `protocolos` (etapas='concluido') → `fn_concluir_protocolo_conversao` (242:219-220) — caminho legado
- `trg_atualizar_tarefa_conversao` em `conversao_itens` (245_fix_descricao_tarefa_conversao.sql:54-55)
- Outras: 243 (motivos ledger), 244 (reserva), 249 (fix conclusão), 282/283 (cofre)

## H2. CONVERSÃO-SKU (conversoes_sku)

**FRONT**
- Criação: `src/components/forms/ConversaoSkuModal.tsx:156` → POST `/api/conversao-sku`
- Aprovar/recusar (branch `tipo === "conversao_sku"`): `TarefasClient.tsx:565` (aprovar `{tarefa_id}`), `:603` (recusar `{tarefa_id, motivo}`); `TarefaDrawer.tsx:818` (aprovar), `:844` (recusar)
- Execução na fábrica: `src/components/forms/ConcluirConversaoSkuModal.tsx:96` → POST `/api/conversao-sku/concluir-servico`; gate de UI: `ConversaoSkuDetalheClient.tsx:120` `podeExecutar = status_conversao === "em_fabrica" && isFabrica`
- Badges/timeline por status: `ConversaoSkuDetalheClient.tsx:136,147,231`; ordem da timeline `:79`

**CONTRATO**
- Criar — `src/app/api/conversao-sku/route.ts:10-20` `ConversaoSkuPostSchema`: `{ sku_origem_id, sku_origem_quantidade, sku_origem_peso, local_origem_id, sku_destino_id, sku_destino_quantidade_desejada, local_destino_id, foto_base64?, motivo? }`. Resposta 201: `{ ordem_id, numero_ordem ("CS-NNNN"), conversao_sku_id }`. Valida saldo em `vw_saldo_estoque_comercial_v2` (route.ts:73-81)
- Aprovar — `conversao-sku/aprovar/route.ts:7-10` `{ tarefa_id, conversao_sku_id? }`. Resposta: `{ ok: true, message: "Conversão SKU aprovada! Liberada para protocolo de ida." }`
- Recusar — `conversao-sku/recusar/route.ts:9-14` `{ tarefa_id, conversao_sku_id?, motivo?, foto_base64? }`. Resposta: `{ ok: true, message: "Conversão SKU recusada. SKU devolvido ao estoque." }`
- Mesmos 401/403/404/409 do H1

**CAMPOS lidos/escritos**
- Criar (route.ts:66-125, transação): INSERT `ordens` (`tipo_ordem='conversao_sku'`, `rota='protocolo'`, status='aguardando'); INSERT `reservas_estoque_comercial` (status='ativo'); INSERT `conversoes_sku` (foto_abertura, reserva_id, motivo, created_by) — trigger cria a tarefa
- Aprovar (aprovar/route.ts:61-81): `tarefas.status='aprovada'`; `conversoes_sku` SET `status_conversao='aprovado', aprovado_por, aprovado_em`; histórico 'aprovada'. (Diferente do H1: NÃO baixa estoque — vai pro protocolo)
- Recusar (recusar/route.ts:80-122): `tarefas.status='rejeitada'`; `conversoes_sku` SET `status_conversao='recusado', recusado_por/em, foto_recusa, motivo_recusa`; reservas canceladas por `ordem_id` (não por reserva_id); `ordens` → cancelado; histórico
- Concluir serviço (concluir-servico/route.ts:41,115): exige `status_conversao='em_fabrica'` → SET `status_conversao='aguardando_volta'`

**ESTADOS** — `pendente` → `aprovado` (admin) → `em_fabrica` (protocolo de ida, via trigger) → `aguardando_volta` (fábrica executa) → `concluido` (protocolo de volta) | `pendente` → `recusado`. Ordem confirmada em `ConversaoSkuDetalheClient.tsx:79`.

**NOTIFICAÇÕES** — não encontrado.

**BANCO/TRIGGERS**
- `trg_criar_tarefa_conversao_sku` AFTER INSERT em `conversoes_sku` → `fn_processar_conversao_sku`: cria tarefa `aguardando_aprovacao` tipo `conversao_sku`, responsável = admin com email LIKE '%alisson%' (fallback qualquer admin), grava `tarefa_aprovacao_id` (253_conversao_sku.sql:123-163)
- `trg_concluir_conversao_sku` AFTER UPDATE em `protocolos` WHEN etapas vira 'concluido' → `fn_concluir_protocolo_conversao_sku` (ida: entrada do SKU origem na fábrica + cria OS; volta: entrada SKU destino + conclui) (253:264-268)
- Ledger: 254_stock_ledger_conversao_sku.sql

Arquivos-chave (WSL): `/home/jonathan_arajo/projetos/alissonerp/src/app/api/conversao/{aprovar,recusar}/route.ts`, `src/app/api/conversao-sku/{route,aprovar/route,recusar/route,concluir-servico/route}.ts`, `src/app/api/estoque-comercial/converter/route.ts`, `supabase/migrations/{242,245,253}_*.sql`.

---

# FLUXO I — PRECIFICAÇÃO (markup_alteracoes)

**FRONT**
- Página única: `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx` — solicitar-aprovacao (L289), pendentes (L683), aprovar (L708), rejeitar (L734-737)
- UI: aba "pendentes" (L60, badge com contagem L805); botão "Enviar p/ aprovação" `disabled={!resultado || enviando}` (L640); botões Aprovar/Rejeitar `disabled={aprovando === p.id}` (L871, 880); modal rejeitar exige motivo `disabled={!modalRejeitar.motivo.trim() || rejeitando}` (L1078)
- Nenhum outro componente chama esses endpoints (grep vazio fora da página)

**CONTRATO**
- `solicitar-aprovacao/route.ts:16-28` — body zod: `{tipo: "ouro"|"pedra", faixa_id: int+, faixa_nome: string, markup_anterior: number, markup_novo: number+, stats?: {produtos_afetados?, variacao_media?, variacao_min?, variacao_max?}, simulacao?: unknown[]}`. Resposta 201: `{alteracao: {id, tipo, faixa_nome, markup_anterior, markup_novo, status, data_criacao}}`
- `aprovar/route.ts:22-24` — body: `{alteracao_id: Id}`. Resposta: `{ok, produtos_atualizados, tipo, faixa_nome, markup_novo, elapsed_s}`; 404 se não pendente
- `rejeitar/route.ts:17-20` — body: `{alteracao_id: int+, motivo: string min(1)}`. Resposta: `{ok: true, alteracao: {id, faixa_nome, status}}`; 404 se não pendente
- `pendentes/route.ts` — GET, sem body. Resposta: `{pendentes: [...], historico: [...], total}` (últimas 50, split por status; shape completo L21-45 inclui criado_por_nome/aprovado_por_nome via join user_profiles)

**CAMPOS**
- INSERT (solicitar, L43-63): markup_alteracoes(tipo, faixa_id, faixa_nome, markup_anterior, markup_novo, produtos_afetados, variacao_media/min/max, simulacao_json, criado_por)
- Aprovar (aprovar/route.ts): lê markup_alteracoes WHERE status='pendente' (L47-51); escreve `erp_produtos.markup` WHERE categoria_precificacao=faixa_nome AND situacao='A' (tipo ouro, L71-77) OU `markup_pedras.markup, updated_at` (tipo pedra, L81-86); depois markup_alteracoes SET status='aprovado', aprovado_por, data_aprovacao, aplicado=true, data_aplicacao (L90-97)
- Rejeitar: markup_alteracoes SET status='rejeitado', aprovado_por, data_aprovacao, motivo_rejeicao (rejeitar/route.ts:35-42)
- vendas_erp: não tocada (fluxo não envolve vendas)

**ESTADOS**: markup_alteracoes.status: `pendente` → `aprovado` | `rejeitado`. Guard WHERE status='pendente' nos dois endpoints (idempotência via 404 "já processada")

**NOTIFICAÇÕES**: não encontrado (nenhum criarNotificacao/webhook em src/app/api/precificacao)

**BANCO**: recálculo de preço via `trigger_atualizar_preco_produto` no UPDATE de erp_produtos.markup (comentário aprovar/route.ts:5-6; migrations `supabase/migrations/167_fix_trigger_preco_produto.sql`, `322_erp_produtos_triggers.sql`). Pedra: pós-commit chama `recalcularPrecoPedras(produto_id)` por produto afetado via produto_composicao (aprovar/route.ts:100-125, lib `src/lib/recalcular-preco-pedras`)

---

# FLUXO J — LIMPEZA DE OURO (cofre_ouro_baixas / limpezas_ouro)

**FRONT**
- `src/app/(dashboard)/purificacao/LimpezaTab.tsx` — kanban 4 colunas via GET `?status=recebido|em_limpeza|aguardando_aprovacao|concluido` (L177-180); POST iniciar (L226) e concluir (L278); embute `EvidenciasLimpeza` (L482, 516)
- `src/components/EvidenciasLimpeza.tsx:44` — GET `/api/purificacao/limpeza?baixa_id=` (fotos antes/depois)
- Aprovação acontece na tela de TAREFAS: `src/app/(dashboard)/tarefas/TarefaDrawer.tsx` — carrega evidências da limpeza (L207, obrigatório p/ aprovador ver fotos, L200) e responde via POST `/api/tarefas/[id]/aprovacao` (L291-294, decisao aprovado/rejeitado + motivo)
- Front do endpoint `/api/purificacao/limpeza/aprovacao`: não encontrado fetch direto (aprovação vai pela rota de tarefas, que chama a mesma lib)

**CONTRATO**
- `limpeza/route.ts` POST discrimina por `raw.acao` ("iniciar"|"concluir", L109-110):
  - IniciarLimpezaSchema (L19-23): `{baixa_id: int+, foto_entrada: string min(1), obs?}`
  - ConcluirLimpezaSchema (L25-33): `{baixa_id, peso_saida: number+, foto_saida: string, houve_pedras?: bool, peso_pedras?: number+, foto_peso_pedras?: string, obs?}`; regra: houve_pedras exige peso_pedras+foto (L115-119); resposta = row atualizada da baixa (L414)
  - GET: filtros `?status=` ou `?baixa_id=`; retorna array de baixas
- `limpeza/aprovacao/route.ts:31-37` — body sem zod: `{baixa_id: number, acao: "aprovar"|"reprovar", motivo?}`; reprovar exige motivo (L36). Resposta: `{id, status}` da baixa
- Lib `src/lib/limpeza-ouro-aprovacao.ts` retorna `{ok, status(http), error?, baixa?: {id, status}}`

**CAMPOS**
- Concluir (limpeza/route.ts): cofre_ouro_baixas SET status='aguardando_aprovacao' (L308-309); limpezas_ouro SET status='aguardando_aprovacao', peso_limpo/fotos (L329-330); INSERT cofre_ouro_rastreios (L346); INSERT tarefas tipo `aprovacao_quebra_metal` status `aguardando_aprovacao` tags `limpeza_ouro:<id>` (L364-392); INSERT aprovacoes_tarefa status 'pendente' (L395-397). Guard: peso_saida ≤ gramas (route L244)
- Aprovar (lib L146-232): lê configuracoes_sistema `aprovador_limpeza` (só o aprovador configurado pode, 403); cofre_ouro_baixas SET status='concluido', obs+='APROVADO...' ; INSERT movimentacoes_estoque entrada 18k (insumo ILIKE '%ouro%18k%amarelo%', marcador 'PURIF_ENTRADA', local 3 se destino=service senão 1, peso = limpezas_ouro.peso_limpo, fallback regex "Peso limpo:" no obs legado); INSERT cofre_ouro_rastreios 'limpeza_aprovada'; limpezas_ouro SET status='aprovada', aprovador_id; tarefas SET status='aprovada', concluida_em; aprovacoes_tarefa SET status='aprovado', respondido_em; logAudit
- Reprovar (lib L82-144): motivo obrigatório; cofre_ouro_baixas SET status='em_limpeza', obs+='REPROVADO...'; limpezas_ouro SET status='reprovada', motivo_reprovacao, aprovador_id; rastreio 'limpeza_reprovada'; tarefas SET status='rejeitada'; aprovacoes_tarefa SET status='rejeitado', motivo; logAudit
- vendas_erp: não tocada

**ESTADOS**
- cofre_ouro_baixas (`src/lib/cofre-ouro-status.ts:11-19`, transições em `validarTransicao`): esperando_protocolo → em_trafego → recebido → **em_limpeza** → **aguardando_aprovacao** → **concluido** (aprovar) | volta **em_limpeza** (reprovar); cancelado; 'pendente' legado. Aprovar baixa já concluída = idempotente 200 (lib L147-149)
- limpezas_ouro.status: em_limpeza → aguardando_aprovacao → aprovada | reprovada (nova tentativa a cada iniciar, campo `tentativa`)
- tarefas: aguardando_aprovacao → aprovada | rejeitada; aprovacoes_tarefa: pendente → aprovado | rejeitado

**NOTIFICAÇÕES**
- `limpeza/route.ts:399-412` — criarNotificacao ao concluir limpeza: p/ aprovadorId, tipo "aprovacao", título "Aprovação de Quebra Limpeza Baixa Ouro #id", link `/tarefas?abrir=<tarefa.id>`, catch silencioso
- Aprovação/reprovação (lib): não encontrado criarNotificacao/webhook

**Nota**: `/api/tarefas/[id]/aprovacao/route.ts:403` também chama `processarAprovacaoQuebraLimpeza` — os dois caminhos convergem na mesma lib (fonte única).

---

# FLUXO K — DEVOLUÇÃO

## (1) FRONT
- `src/app/(dashboard)/devolucoes/DevolucoesClient.tsx` — lista; `fetch(/api/devolucoes?params)` :101, filtro de status :98/187
- `src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx` — criação (POST /api/devolucoes)
- `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx` — detalhe; chamadas: GET `/api/devolucoes/${id}` :175, POST `solicitar-aprovacao` :198, DELETE :214, POST `inspecionar` :233, POST `concluir` :261, POST `/api/fiscal/emitir/nfe-devolucao` :278
- Botões por status (DevolucaoDetalheClient.tsx): `podeInspecionar = status==='aprovado' && item.condicao==='pendente'` :437; bloco rascunho/aprovado :611-613; botão Concluir só se `status==='aprovado' && todosInspecionados` :634 (aviso se falta inspeção :645); banner `aguardando_aprovacao_estoque` :654; motivo de rejeição se `rejeitado` :365; NF-e se aprovado/concluido/pendente_entrega :666
- Outros: `src/app/(dashboard)/vale-troca/ValeTrocaClient.tsx`, `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx`, `src/components/forms/AcaoSolicitacaoModal.tsx` (aprovação via tarefas)

## (3) CONTRATO
- **POST /api/devolucoes** (route.ts:20-27): `{venda_id, tipo:'parcial'|'total', motivo?≤5000, tipo_compensacao (min1 max50), foi_entregue?, percentual_retencao?, itens:[{item_venda_id, quantidade>0}] 1..100}`. Guard: venda.situacao deve ser `entregue` senão 409 :141. Resp 201: `{id, numero}` (criarDevolucao return, lib:211). GET lista: `{data:[...números convertidos], page, limit, total}` :98-107
- **POST [id]/solicitar-aprovacao** (route.ts:28-32): sem body; resp `{tarefa_id}` (lib:361)
- **POST [id]/inspecionar** (route.ts:10-13): `{item_id, condicao (aprovado_retorno|reprovado_descarte|garantia — validado lib:614), observacao?}`; valida item pertence à devolução :50; resp `{ok:true}`
- **POST [id]/concluir** (route.ts:33-35): sem body; NÃO conclui direto — chama `solicitarAprovacaoEstoqueDevolucao` (B3, comentário :30-33); resp `{ok:true, aguardando_aprovacao_estoque:true, tarefa_id}`; erro PG → 500 genérico, erro domínio → 400 :38-45

## (4) CAMPOS lidos/escritos
- `devolucoes_venda`: INSERT numero('DV-'+seq)/venda_id/tipo/motivo/status='rascunho'/tipo_compensacao/percentual_retencao/foi_entregue/criado_por (lib:160-175); recomputarTotais atualiza valor_total_devolvido/valor_retido/valor_compensacao/updated_at (lib:73-129)
- Solicitar: `SET status='aguardando_aprovacao', tarefa_id` (lib:355-359); INSERT em `tarefas` + `aprovacoes_tarefa` (lib:343-354)
- Aprovação (processarAprovacaoDevolucao, hook em /api/tarefas/[id]/aprovacao — lib:380): rejeita → `status='rejeitado', rejeitado_motivo, aprovador_id` :401-402; aprova → `status='aprovado', aprovador_id, aprovado_em` :421-422
- Inspeção: `devolucoes_itens SET condicao, inspecao_por, inspecao_em, inspecao_observacao` (lib:626-633); só com dev `aprovado` :622
- Etapa estoque (solicitarAprovacaoEstoqueDevolucao lib:452): exige status `aprovado` :465 + 0 itens pendentes :473; aprovador de config `aprovador_devolucao_estoque` c/ fallback por cargo :476-498; `SET status='aguardando_aprovacao_estoque', tarefa_id` :526
- processarAprovacaoEstoqueDevolucao (lib:549): busca por `tarefa_id`; rejeitado → volta `status='aprovado'` + rejeitado_motivo :565-569; aprovado → `status='aprovado'` + aprovador_id e chama `concluirDevolucao` :583-588
- concluirDevolucao (lib:639): itens `aprovado_retorno` → INSERT `movimentacoes_estoque_comercial` :679 + upsert `estoque_comercial_config` :691; compensação: vale_troca → `gerarValeTroca` (src/lib/vale-troca.ts:53) :706; reembolso_mp → `estornarMP` (fallback conta a pagar se sem MP/falha :729-747); reembolso_manual → `criarContaPagarReembolso` :749; final `SET status='concluido'` :764
- Lê `vendas_erp` (situacao/joins) mas **não escreve** em vendas_erp em nenhum ponto do fluxo (grep: só SELECT/JOIN em lib:109,149,269,460,647)

## (5) ESTADOS (CHECK migration 309:24-32)
`rascunho → aguardando_aprovacao → aprovado ⇄ aguardando_aprovacao_estoque → concluido`; ramos: `rejeitado` (reenvio não visto — rejeição estoque volta a `aprovado`), `cancelado` (só de rascunho/rejeitado, lib:779). Edição só em rascunho (lib:227).

## (6) NOTIFICAÇÕES (criarNotificacao, todas best-effort .catch)
- Solicitar aprovação → aprovador (lib:365)
- Rejeição da devolução → criador (lib:406) | Aprovação → criador (lib:426)
- Envio p/ estoque → aprovador de estoque (lib:532)
- Estoque reprovou → criador (lib:570) | Estoque aprovou/concluída → criador (lib:590)
- Webhook/WhatsApp: não encontrado neste fluxo

## BANCO (migrations)
- `142_devolucoes_vale_troca.sql` — cria `devolucoes_venda` (:22, FK vendas_erp :25, CHECKs tipo/status/tipo_compensacao :26-31), `devolucoes_itens` (:56, CHECK condicao :65, CASCADE), `vale_troca` (:78, CHECK status ativo/utilizado/cancelado :86, venda_utilizado_id :87), `reembolsos` (:103, CHECK metodo/status :106,114, FK contas_pagar :112)
- `309_devolucao_status_aprovacao_estoque.sql` — recria CHECK de status com `aguardando_aprovacao_estoque` :20-32
- `310_seeds_aprovadores_vale_devolucao.sql` — seeds de aprovadores; `306_vale_troca_codigo.sql`, `307_notificacoes_devolucao_id.sql`, `308_comentarios_devolucao.sql` — complementos
- Triggers dedicados de devolução: não encontrado (nenhum CREATE TRIGGER em 142/309)

---

## FLUXO L — COMPRA COMERCIAL

**FRONT**
- `src/components/ComprasComercialClient.tsx` — único consumidor: criar (`POST /api/compras-comercial` L310), itens (L724/782/814), ações `receber|concluir|reverter-rascunho` via `PATCH /api/compras-comercial/{id}/{path}` (L822), `solicitar-aprovacao` (L849)
- Estados de UI: `bloqueada = compra.bloqueado || situacao==='concluido'` (L700); botão Concluir se `podeConcluir` (L712/1109); botão "Solicitar aprovação" se situacao ∈ rascunho/pendente/rejeitado OU `needsApproval && situacao==='recebido_pendente_cadastro'` (L1119-1124); "Receber" se `situacao==='recebida' && !bloqueado` (L1135); 409+`data.needs_approval` no concluir seta `setNeedsApproval(true)` (L831)
- Link da tarefa: `src/app/(dashboard)/tarefas/TarefasClient.tsx:225` → `/compras-comercial?id={compraId}`

**CONTRATO**
- `solicitar-aprovacao/route.ts` (POST): body ignorado (`void req` L30); resp ok `{ok:true, tarefa_id, aprovador_id}` (L140); erros 400/404/409 `{error}` — 409 especial "Nenhum aprovador configurado" tratado no front (L860)
- `concluir/route.ts` (PATCH, 89 linhas): sem body; resp ok `{ok:true}` (L84); 409 divergência `{error, needs_approval:true, peso_cadastrado, peso_lote, diferenca}` (L68-77)
- Handler aprovação `tarefas/[id]/aprovacao/route.ts`: `AprovacaoTarefaPatchSchema = {aprovacao_id:number, decisao:'aprovado'|'rejeitado', motivo?}` (L33-37)

**CAMPOS (compras_comercial)**
- solicitar-aprovacao escreve: `situacao='aguardando_aprovacao', bloqueado=true, aprovador_id, tarefa_aprovacao_id, motivo_rejeicao=NULL, data_decisao=NULL, aprovado_por=NULL` (route L118-128); insere `tarefas` (tipo `compra_comercial`, tags `aprovacao_compra_comercial`) + `aprovacoes_tarefa` (L101-117)
- Aprovar (`processarAprovacaoCompraComercial` L39-168): lê compra por `tarefa_aprovacao_id`; rejeição → `situacao='rejeitado', bloqueado=false, aprovado_por, data_decisao, motivo_rejeicao`; aprovação (tx única) → INSERT `movimentacoes_estoque_comercial` (entrada, motivo `compra_comercial_aprovada`) por item + INSERT `contas_pagar` por parcela + UPDATE `situacao='aprovado', bloqueado=true, total, aprovado_por, data_decisao`
- concluir escreve só `situacao='concluido'` (L83); lê `bloqueado, situacao, peso_total_g`, soma `itens_compra_comercial.peso_total` vs tolerância (`configuracoes_sistema.tolerancia_lote_peso_g`, default 0.3g)

**ESTADOS**: rascunho/pendente → aguardando_aprovacao → aprovado|rejeitado; recebida/recebido_pendente_cadastro/rascunho/pendente/aprovado → concluido. Trigger `fn_bloquear_compra_comercial` (v final `331_compras_comercial_chegada.sql:189-206`; versões antigas migs 272:105, 274:33): se `bloqueado=true` só permite →aprovado/rejeitado e aprovado→concluido; resto RAISE EXCEPTION.

**NOTIFICAÇÕES**: `criarNotificacao` ao aprovador (tipo `aprovacao`, link `/tarefas?abrir={tarefa.id}`) em solicitar-aprovacao L131-138. Não encontrado notificação na decisão dentro de `processarAprovacaoCompraComercial` (pode haver genérica no restante da route, não verificado).

**⚠️ DUPLICAÇÃO contas_pagar — RISCO CONFIRMADO no código**: trigger `fn_gerar_conta_pagar_chegada_comercial` (`331:68-134`, AFTER INSERT, situacao `recebido_pendente_cadastro` + `valor_total_lote>0`) tem blindagem `IF EXISTS contas_pagar → RETURN` (331:88-92). Mas o handler TS `processarAprovacaoCompraComercial` insere `contas_pagar` **sem checar existência** (aprovacao/route.ts ~L129-160). Fluxo chegada (conta gerada no INSERT) que depois pede aprovação por divergência de peso → ao aprovar, gera **segunda leva de parcelas** (uma pelo valor_total_lote, outra pela soma dos itens). O comentário da mig 331 só cobre a função SQL de conclusão ("vira no-op"), não o handler TS.

## FLUXO M — AUDITORIA + CONFERÊNCIA CONSULTORA

**FRONT**
- `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:187` — `PATCH /api/auditoria/{id}`; `isPendente = situacao ∈ ['pendente','em_analise','pendenciado']` (L183); `handleAprovar` manda `{situacao:'aprovado', parecer}` (L198+); reprovação análoga com `motivo_reprovacao`
- `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:330,352` — `PATCH /api/aprovacao/{id}` body `{etapas:'aprovado'|'reprovado'}` (geral e serviços), optimistic update `setLocalEtapas` com rollback em erro
- Leitura direta SQL de `aprovacoes_consultora` em `conferencia/page.tsx:40,63,93,126` e `protocolo/page.tsx:86`

**CONTRATO**
- `auditoria/[auditoriaId]/route.ts` (PATCH, 47 linhas): zod `{situacao:string, parecer?:string|null, motivo_reprovacao?:string|null}` (passthrough); resp `{id, situacao}`; 400/404
- `aprovacao/[aprovacaoId]/route.ts` (PATCH, 66 linhas): zod `{etapas:string}`; resp `{id, etapas}`; 403 "Sem permissão" / 404

**CAMPOS**
- `auditorias`: escreve `situacao, parecer, motivo_reprovacao, data_conclusao=now() se situacao∈(aprovado,reprovado)` — nenhum campo em vendas_erp tocado
- `aprovacoes_consultora`: escreve só `etapas`; lê `consultora_id` (checagem consultora aprova só a própria via `usuarios.vendedor_id`)

**ESTADOS**: auditorias: pendente/em_analise/pendenciado → aprovado|reprovado (`situacao` é string livre no zod — sem enum no back). aprovacoes_consultora: `etapas` → 'aprovado'|'reprovado' (enum só no front).

**NOTIFICAÇÕES**: não encontrado — nenhuma `criarNotificacao`/webhook em nenhuma das duas routes.

---

# Mapa TABELA → TRIGGER/FUNÇÃO — o que REAGE a mudanças de status (fluxos de aprovação)

Fonte pronta (snapshot 2026-04-29, DESATUALIZADO — falta mig ≥253): `docs/db-mapping/alissonerp/triggers.md`. Abaixo, o mapa reconciliado com as migrations (versão VIVA = último `CREATE OR REPLACE`).

## 1. vendas_erp (coração do fluxo)

| Trigger | Evento | Condição | Efeito | Definição viva |
|---|---|---|---|---|
| `trg_registrar_transicao_venda` | BEFORE UPDATE OF situacao | situacao mudou | **State machine**: valida transição; inválida → `RAISE 'TRANSICAO_INVALIDA'`. Válida → INSERT em `vendas_transicoes` (histórico, usuario_id NULL). Matriz viva (328): rascunho→{aprovado,cancelado,concluido}; aprovado→{em_rota,entregue,cancelado,rascunho(estorno),concluido,virou_credito}; em_rota→{entregue,cancelado,rascunho}; entregue→{cancelado,concluido}; concluido→{cancelado}; virou_credito→{cancelado}; **cancelado→nada**; estado desconhecido→permissivo | `328_status_virou_credito.sql:36` (base 297:71; origem 178:78) |
| `trg_bloquear_venda` | BEFORE UPDATE | `OLD.bloqueado = true` | `RAISE 'Venda bloqueada não pode ser editada'` — trava QUALQUER update, inclusive mudança de situacao | `104_modulo_comercial_base.sql:211` (trigger :224) |
| `trg_aa_proteger_venda_fechada` | BEFORE UPDATE — **DISABLED em prod** (doc triggers.md) | situacao OLD ∈ {confirmado,concluido} e mudou campo financeiro (totais/cliente/vendedor) | RAISE; bypass via `current_setting('app.sync_ativo')='true'` | `118_sync_bypass_blindagem.sql:6` (origem 114:101) |
| `trg_venda_gerar_conta_receber` | AFTER UPDATE | NEW.situacao ∈ {aprovado,confirmado,concluido,entregue} **e** OLD.situacao ∉ desse conjunto (i.e., 1ª entrada em estado fechado — na prática a APROVAÇÃO); guards: já existe CR ativa → skip; saldo aberto ≤ 0,01 → skip | Cria `contas_receber`: à vista (1 conta pelo saldo), `sinal` (1 conta venc. 7 dias úteis) ou `meses` (N parcelas por dia do mês, via `pagamentos_venda.credi_tipo/credi_param/parcelas`) | `318_crediario_sinal.sql:30` (cadeia 113→268→296→300→316→317→318; trigger 113:134) |
| `trg_venda_gerar_conta_receber_insert` | AFTER INSERT | venda já nasce em estado fechado (import/legado) | idem acima | `300_cr_saldo_em_aberto.sql:80` (trigger 113:197) |
| `trg_venda_cancelar_conta_receber` | BEFORE UPDATE | NEW=cancelado e OLD≠cancelado | `UPDATE contas_receber SET situacao='cancelado'` onde `venda_erp_id=NEW.id AND situacao='pendente'` (CR paga NÃO é cancelada) | `113_financeiro_auto.sql:70` (trigger :140) |
| `trg_venda_baixar_recebimento_aprovacao` | AFTER UPDATE OF situacao | situacao mudou e NEW ∉ {rascunho,cancelado} | Chama `fn_venda_criar_cr_quitada`: se pagamentos confirmados ≥ total e não há CR ativa, cria CR já `pago` (cobre "pagou antes de aprovar" no PDV) | `299_baixa_cr_na_aprovacao.sql:103` (trigger :122; fn_venda_criar_cr_quitada :32) |
| `trg_estoque_comercial_cancelamento_venda` | BEFORE UPDATE | NEW=cancelado e OLD≠cancelado | **Estorno de estoque**: reservas ativas → `cancelado`; para cada mov `saida` efetivada não estornada, cria mov `entrada` motivo `cancelamento` (estorno_de_id) e marca original `estornado` | fn viva `169_fix_trigger_search_path.sql:162` (origem 111:117; trigger 161:357) |
| `trg_estoque_comercial_entrega_venda` | BEFORE UPDATE | NEW=entregue e OLD≠entregue | **Baixa na entrega**: (1) bloqueia se há ordens `reposicao_venda/reposicao_loja` com status ∉ {concluido,cancelado} → `RAISE 'ENTREGA_BLOCKED'`; (2) reservas ativas → mov `saida` efetivada + reserva `efetivado`; (3) `joias_rfid` reservado → `vendido` | `301_repos_bloqueio_por_status.sql:24` (cadeia 161→205→267→292→301; trigger 161:362) |
| `trg_estoque_comercial_aprovar_venda` | BEFORE UPDATE | NEW=aprovado e OLD=rascunho | **NO-OP desde a mig 267** (antes efetivava saída na aprovação; hoje reserva segue ativa até entrega). Existe só por compat | `267_fluxo_status_venda.sql:97` (trigger 141:411) |
| `trg_updated_at_vendas_erp` | BEFORE UPDATE | sempre | touch updated_at | `104:242` |

Bypass admin: `SET LOCAL app.sync_ativo='true'` solta `fn_proteger_venda_fechada`/`fn_proteger_itens_venda_fechada` (`118_sync_bypass_blindagem.sql`) — NÃO solta transição/estoque/CR.

## 2. itens_venda_erp (reagem indiretamente à situacao da venda)

| Trigger | Evento | Efeito | Def |
|---|---|---|---|
| `trg_estoque_comercial_baixa_venda` | AFTER INSERT | Lê situacao da venda: rascunho/aprovado/enviado → cria RESERVA ativa (local 2); entregue/concluido/outro → mov saída direta; cancelado → no-op; produto sem config ativa → no-op | `267_fluxo_status_venda.sql` (~l.124; trigger 161:341) |
| `trg_estoque_comercial_reversao_item` | AFTER DELETE | desfaz reserva/mov do item | fn viva 169; trigger 161:346 |
| `trg_estoque_comercial_update_qtd_item` | AFTER UPDATE | ajusta reserva pela delta de quantidade | fn viva 169:211; trigger 161:351 |
| `trg_proteger_itens_venda_fechada` + `..._insert_...` | BEFORE UPDATE/DELETE/INSERT | venda fechada (inclui `virou_credito` desde 328:99) → RAISE; bypass sync_ativo | `328:99` (origem 114:35/43, 118:33) |
| `trg_recalcular_totais_venda` | AFTER INS/UPD/DEL | recalcula totais da venda (→ dispara os BEFORE UPDATE de vendas_erp!) | `104:204` |
| `trg_proteger_preco_itens_venda` / `trg_proteger_delete_itens_venda` | preço/delete em public | `116:39/55` |

## 3. tarefas / aprovacoes_tarefa

- **`aprovacoes_tarefa`: NENHUM trigger encontrado** nas migrations (efeitos são feitos no código TS, não no banco).
- `tarefas`: só `trg_updated_at_tarefas` (112:47), `trg_tarefas_historico` (233:139, grava histórico) e `trg_tarefas_verificar_vencimento` (233:159). Nenhum mexe em venda.
- `aprovacoes_consultora.trg_aprovacao_entrega` → `fn_aprovacao_para_entrega` (AFTER UPDATE) — legado, doc triggers.md.

## 4. pagamentos_venda

| Trigger | Evento | Efeito | Def |
|---|---|---|---|
| `trg_venda_baixar_recebimento_pago` | AFTER INSERT OR UPDATE OF status | status=confirmado, venda ∉ {rascunho,cancelado}, sem CR ativa, soma confirmados ≥ total (±1 centavo) → cria `contas_receber` já `pago` | `299:85` (redefine 297:160; trigger 297:236) |
| `trg_rastreio_pagamento_ouro` | AFTER INSERT | forma='Ouro' e status='confirmado' → INSERT `cofre_ouro_rastreios` | `202:77-97` |

## 5. Conversões / Compras / Cofre / Devoluções

| Tabela | Trigger | Evento/Condição | Efeito | Def |
|---|---|---|---|---|
| `conversoes_estoque` | `trg_criar_tarefa_conversao` | AFTER INSERT | Cria TAREFA de aprovação (`INSERT tarefas`) e grava `tarefa_aprovacao_id` na conversão | `242:134` |
| `conversao_itens` | `trg_atualizar_tarefa_conversao` | AFTER INSERT | atualiza descrição da tarefa | `245:55` |
| `protocolos` | `trg_concluir_conversao` | AFTER UPDATE WHEN etapas→'concluido' | conclui conversão de estoque (movimentações) | `242:220` |
| `conversoes_sku` | `trg_criar_tarefa_conversao_sku` | AFTER INSERT | `fn_processar_conversao_sku` (cria tarefa/fluxo) | `253:160` |
| `protocolos` | `trg_concluir_conversao_sku` | AFTER UPDATE WHEN etapas→'concluido' | ida: entrada SKU origem na fábrica + cria OS; volta: entrada SKU destino + conclui | `253:265` |
| `compras_comercial` | `trg_aa_bloquear_compra_comercial` | BEFORE UPDATE; `bloqueado=true` e situacao mudando | RAISE | `272:104-118` |
| `compras_comercial` | `trg_concluir_compra_comercial` | situacao→'concluido' (só de rascunho/recebida; exige itens) | entrada de estoque comercial (mov efetivada) | `272:130-174` |
| `compras_comercial` | `trg_compra_comercial_gerar_conta_pagar` | situacao→'concluido' (guard duplicata) | cria `contas_pagar` parcelado | `272:190-253` |
| `compras_comercial` | `trg_chegada_gerar_conta_pagar` (`fn_gerar_conta_pagar_chegada_comercial`) | situacao→'recebido_pendente_cadastro', valor_total_lote>0, sem CP existente | cria `contas_pagar` na CHEGADA (parcelado) | `331:68-73` |
| `compras` (legado) | `trg_compra_gerar_conta_pagar` (`fn_compra_gerar_conta_pagar`) | AFTER UPDATE; situacao→'concluido' | cria `contas_pagar` venc. +30d | `113:88` (trigger :146) |
| `compras` | `trg_aa_bloquear_compra` / `trg_concluir_compra` | BEFORE UPDATE | trava/entrada estoque | `022:149/154` |
| `cofre_ouro_baixas` | `trg_rastreio_baixa_ouro` (AFTER INSERT) e `trg_rastreio_concluir_baixa` (AFTER UPDATE, status→'concluido') | INSERT em `cofre_ouro_rastreios` | `202:120/140` |
| `devolucoes_venda` | só `trg_devolucoes_updated_at` (touch) | **nenhum trigger de negócio** — vale-troca/estorno são feitos no código TS | `142:191` |

## Riscos-chave p/ refatoração de aprovações

1. **Qualquer UPDATE em vendas_erp passa por 7+ triggers BEFORE UPDATE** — inclusive updates "inocentes" (recalcular totais via itens dispara a cadeia). `trg_bloquear_venda` roda ANTES de tudo e trava com `bloqueado=true`.
2. **CR nasce na transição rascunho→aprovado** (`fn_venda_gerar_conta_receber`, versão 318) e **é quitada por 2 caminhos** (pagamento confirmado 297/299 OU mudança de situacao 299) — guards anti-duplicata dependem de "existe CR com situacao<>'cancelado'". Mudar a ordem das transições pode duplicar/pular CR.
3. **Estoque só sai na entrega** (301) e **estorna no cancelamento** (169); aprovação NÃO move estoque (267). Estorno pra rascunho (aprovado→rascunho) NÃO mexe em reserva via trigger.
4. `aprovacoes_tarefa` não tem trigger — a lógica de aprovação vive no TS; o banco só reage quando `vendas_erp.situacao` muda.
5. Doc `docs/db-mapping/alissonerp/triggers.md` está defasado (abr/2026): não lista `trg_registrar_transicao_venda`, `trg_venda_baixar_recebimento_*`, `trg_estoque_comercial_aprovar_venda`, conversões e compras_comercial.


---

# RISCOS DE QUEBRA — síntese (o que NÃO pode mudar sem plano)

## 🔴 R1. `vendas_erp.situacao` é o detonador de tudo
Qualquer UPDATE passa por 7+ triggers BEFORE/AFTER. A matriz de transições viva (mig 328) dá RAISE `TRANSICAO_INVALIDA` fora do mapa. CR nasce na transição rascunho→aprovado (mig 318); estoque só baixa na ENTREGA (mig 301); estorno no cancelamento (mig 169). A centralização NÃO pode mudar quem/quando seta `situacao` sem reproduzir exatamente a ordem atual.

## 🔴 R2. Os 3 locks de tarefa dirigem a UI da venda
`VendaDetalheClient` deriva botões de: `aprovacao_desconto_tarefa_id`, `aprovacao_cartao_desconto_tarefa_id`, `aprovacao_credito_tarefa_id` (+`*_status`, `desconto_aprovado_por_nome`, `situacao`) — linhas 2120-2160. Limpar o campo errado (bug histórico do aprovar-desconto) ou esquecer de limpar = botão some = venda travada. Migrar mantendo a semântica desses campos, ou migrar o front junto.

## 🔴 R3. `desconto_aprovado_por` é O portão
`vendas-aprovar.ts:653` e `baixa-credito.ts:338` bloqueiam se `tem_desconto_alto && !desconto_aprovado_por`. A via `solicitacoes-desconto` NUNCA grava esse campo (grava `itens.desconto_autorizado_por`) → aprovação que não destrava. A camada central precisa gravar UM campo canônico e os dois portões lerem dele.

## 🔴 R4. Duplicação de contas a pagar CONFIRMADA (compra comercial)
Trigger `fn_gerar_conta_pagar_chegada_comercial` (331:68) cria CP na CHEGADA com guard anti-duplicata; o handler TS `processarAprovacaoCompraComercial` insere CP SEM checar existência. Chegada + divergência de peso + aprovação = parcelas em dobro. Corrigir na migração do fluxo L.

## 🟠 R5. Guards anti-duplicata de CR são frágeis
CR criada por trigger na transição E quitada por 2 caminhos (pagamento confirmado 297/299; mudança de situacao 299). Guards = "existe CR ativa". Repetir/reordenar updates de situacao pode duplicar ou pular CR.

## 🟠 R6. Conversão/SKU não têm handler no despachante
`TarefasClient` desvia por `tipo` para os endpoints próprios; se a tarefa for aprovada pela via genérica, o card fecha e a conversão fica presa em `pendente` (409 depois). Na centralização: ou registrar handler, ou bloquear a via genérica para esses tipos.

## 🟠 R7. O PATCH genérico de tarefas é usado pelo kanban
`moverStatus()` (TarefaDrawer:265) muda status por `PATCH /api/tarefas/[id]` — uso legítimo de kanban. Fechar o backdoor (`status='aprovada'` por fora) sem quebrar o drag de tarefas comuns: bloquear só os status de decisão (`aprovada`/`rejeitada`) quando a tarefa tem aprovação pendente.

## 🟠 R8. Contratos que o front espera (manter idênticos)
- `{ok, aguardando_aprovacao_credito, tipo_aprovacao, tarefa_id, message}` e variantes desconto/cartão (solicitar-aprovacao)
- 409 `{needs_approval:true, peso_cadastrado, peso_lote, diferenca}` (compra comercial concluir)
- 202 `{precisa_aprovacao_entrega:true, tarefa_id}` no PATCH vendas/[id] → entregue
- Polling `GET solicitacoes-desconto/[id]` (sem notificação — front descobre por poll)
- Realtime: VendaDetalheClient recarrega quando `desconto_aprovado_por`/`situacao` mudam (:749)

## 🟡 R9. `aprovacoes_tarefa` NÃO tem trigger no banco
Todos os efeitos vivem no TS. Bom p/ centralizar (o banco não briga); o perigo todo está em `vendas_erp.situacao` e nos handlers.

## 🟡 R10. `bloqueado=true` trava QUALQUER update
`trg_bloquear_venda` roda antes de tudo. Fluxos que setam `bloqueado` (compra comercial, venda) dependem das matrizes dos triggers `fn_bloquear_*`. Qualquer update automático da camada central precisa respeitar/contornar na ordem certa.

## 🟡 R11. Doc do banco defasada
`docs/db-mapping/alissonerp/triggers.md` (abr/2026) não lista os triggers vivos das migs ≥253. Usar ESTE dossiê como fonte durante a refatoração e atualizar o db-mapping depois.
