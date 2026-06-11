# Refatoração Vendas/Entregas — Ponto de Retomada

> Atualizado: 11/06/2026 (Fortaleza) · Branch: homolog · Etapa 2 commitada (v2.62.0)
> Plano aprovado: ver conversa de 11/06 + `docs/analise-vendas-entregas-2026-06.md`

## Status das etapas

| Etapa | Status |
|---|---|
| 0 — Backup + banco de teste | ✅ Dump prod (280MB) em `~/backups/alissonerp/prod_full_2026-06-11.dump`; tag `v2.60.4-pre-refatoracao-vendas` e branch `backup-pre-refatoracao-vendas-2026-06` no origin. ✅ Banco de teste RECRIADO do zero (1º restore tinha corrompido — banco-alvo não estava vazio). Validado: `vendas_erp` 14.958, `auth.users` 29, 0 usuários órfãos, FKs de entregas_venda/contas_receber/compras_metal ok. Erros restantes no log v2 são só de roles/extensões Supabase ausentes no WSL (irrelevantes). |
| 1 — Blindagem | ✅ Código pronto e commitado (v2.61.0). Migration 295 aplicada no banco de TESTE; NÃO em produção. |
| 2 — Novos status (fim do concluído) | ✅ FEITO (v2.62.0 + v2.63.0). Migrations 296+297 no TESTE. Código refatorado, trava ligada, baixa-na-hora, ponte de volta desligada. tsc limpo, 0 falha nova. Commitado em homolog (PAROU — sem main). Aguarda teste do Jonathan. |
| 3 — Celular obrigatório + códigos | ✅ FEITO (v2.64.0). Celular obrigatório p/ aprovar (approveVenda); WhatsApp do desenvolvedor (fallback quando código não chega ao cliente) + campo em Config›Integrações. Sem migration. Teste E2E 13/13 PASS. tsc limpo, 0 falha nova. Commitado em homolog — aguarda teste do Jonathan. |
| 4 — Pagamento na entrega | ⬜ Próxima. |
| 5 — Testes + subida | ⬜ |

## Decisões do Jonathan (NÃO re-perguntar)
- Status: rascunho → aprovado → em_rota → entregue (+cancelado). SEM concluído/enviado novos.
- Vendas antigas com concluido/enviado: ficam intocadas (histórico). Filtros de relatório MANTÊM esses status para o passado e ADICIONAM em_rota.
- Correios: registrar rastreio → venda vira ENTREGUE direto (sem integração).
- Pagamento na entrega: consultora aprova DIRETO (sem gerente). Aprovação exige: confirmados + 'Na Entrega' pendentes = total.
- Pós-aprovado: NADA editável (correção só via solicitacoes_alteracao).
- Pagamento quitado NÃO muda mais status da venda (status só muda na entrega). Confirmado 11/06.
- Banco de teste: `.env.test.local` (postgres-homolog @ cloud.alisson.api.br:5435). Produção: `.env.production.local`. Recriar banco de teste do zero quando o restore falhar (autorizado 11/06). NUNCA rodar migration em produção antes dos testes + aval do Jonathan.

## O que foi feito na Etapa 2 (v2.62.0)
- **Migration 296** (`296_novo_fluxo_status_venda.sql`): `fn_registrar_transicao_venda` (nova máquina de estados), `fn_venda_gerar_conta_receber` (dispara em 'entregue'), `fn_proteger_itens_venda_fechada` (blinda 'entregue'). Aplicada no TESTE; NÃO em produção.
- **Backend**: `concluirVenda()` removida de vendas-aprovar.ts; `autoConcluirVendaSeQuitada()` removida de baixa-credito.ts. Auto-conclusão tirada de 16 call sites (MP + PagBank + crediário + solicitações). Auto-APROVAR mantido. PATCH /api/vendas/[id] delega aprovação ao `approveVenda()` (apagadas ~430 linhas inline); `criarOrdemDoOrcamento` da lib usa orcamentoFichaToDados/nomeItemOrdem (ficha completa).
- **Comissões/relatórios**: 'em_rota' adicionado em 8 rotas (mantendo status antigos).
- **Front**: VendaDetalheClient — "venda concluída" → "venda quitada".
- **Testes**: tsc limpo; 7 testes do comportamento antigo atualizados; 0 falhas novas vs HEAD.

## Etapa 2.1 — trava + baixa automática (v2.63.0, migration 297)
Decisões do Jonathan (11/06) e o que foi feito:
- **Trava de status LIGADA** (migration 297): tabela `vendas_transicoes` + gatilho `trg_registrar_transicao_venda`. A 178 nunca foi aplicada em prod. Entregue = ponto final (entregue→rascunho bloqueado). Estorno (aprovado/em_rota→rascunho) permitido; legado→concluido permitido.
- **Baixa na hora do pagamento** (decisão Jonathan): gatilho `fn_venda_baixar_recebimento_pago` em pagamentos_venda — pagou o total → CR 'pago' na hora, venda fica 'aprovado'.
- **Estorno**: venda entregue/concluida não volta pra rascunho (`mantida_terminal`).
- **Ponte de volta public→erp DESLIGADA** (decisão Jonathan: só vendas_erp é fonte de verdade; Evolury é só histórico): dropados `trg_sync_venda_insert_from_public` e `trg_sync_venda_update_from_public`. Corrigiu o bug que transformava 'entregue' em 'concluido' sozinho (código 2 ambíguo no public). Espelhamento de IDA (erp→public) mantido.
- ✅ Validado no teste: paga→entrega mantém 'entregue', CR não duplica, trava barra inválidas, estorno de entregue não desfaz. tsc limpo, 0 falha nova.
- ⚠️ Migration 297 só no TESTE. Commitada em homolog (PAROU — sem main). Aguarda teste do Jonathan.

## ⚠️ Pendências para depois
1. **CLAUDE.md** estava corrompido no working tree (não commitado, não foi eu) — RESTAURADO do HEAD (`git checkout`). A versão do HEAD ainda diz "v2.60.2" (desatualizada — já estamos em v2.63.0); atualizar a versão no header do CLAUDE.md numa próxima.
2. **Suíte vitest tem ~105 falhas PRÉ-EXISTENTES** no HEAD (rate-limit 429 no upload-ofx, mocks desatualizados em verificar-manual/confirmar-pagamento/etc.), não relacionadas a esta mudança. Pendência separada.
3. **CR de venda paga DEPOIS, na entrega sem pagamento total** (Etapa 4): o gatilho 296 cria CR 'pendente' na entrega; a baixa-na-hora (297) só cobre quem pagou antes. Conferir o fluxo "pagamento na entrega" na Etapa 4.

## Cuidados (continuam valendo p/ Etapas 3-5)
- NÃO tocar: ordens/pcp/protocolo/service/compras (têm 'concluido' próprio).
- public/directus READONLY (exceção: UPDATE public.contatos.celular já praticado pelo sistema).
- Migrations 295/296 só no TESTE. Produção só depois das Etapas 3-5 + testes + aval do Jonathan.
