# Refatoração Vendas/Entregas — Ponto de Retomada

> Atualizado: 11/06/2026 (Fortaleza) · Branch: homolog · Etapa 2 commitada (v2.62.0)
> Plano aprovado: ver conversa de 11/06 + `docs/analise-vendas-entregas-2026-06.md`

## Status das etapas

| Etapa | Status |
|---|---|
| 0 — Backup + banco de teste | ✅ Dump prod (280MB) em `~/backups/alissonerp/prod_full_2026-06-11.dump`; tag `v2.60.4-pre-refatoracao-vendas` e branch `backup-pre-refatoracao-vendas-2026-06` no origin. ✅ Banco de teste RECRIADO do zero (1º restore tinha corrompido — banco-alvo não estava vazio). Validado: `vendas_erp` 14.958, `auth.users` 29, 0 usuários órfãos, FKs de entregas_venda/contas_receber/compras_metal ok. Erros restantes no log v2 são só de roles/extensões Supabase ausentes no WSL (irrelevantes). |
| 1 — Blindagem | ✅ Código pronto e commitado (v2.61.0). Migration 295 aplicada no banco de TESTE; NÃO em produção. |
| 2 — Novos status (fim do concluído) | ✅ FEITO (v2.62.0). Migration 296 criada + aplicada no TESTE. Código todo refatorado, tsc limpo, testes ajustados. Commitado em homolog (PAROU — sem main). Aguarda teste do Jonathan. |
| 3 — Celular obrigatório + códigos | ⬜ Próxima. |
| 4 — Pagamento na entrega | ⬜ |
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

## ⚠️ Pendências / achados para o Jonathan decidir
1. **Trigger da máquina de estados NÃO existe em produção.** A função `fn_registrar_transicao_venda` existe mas (a) não há trigger em `vendas_erp` chamando ela e (b) a tabela `vendas_transicoes` não existe. Ou seja: a validação de transição NUNCA esteve ativa no banco — quem controla o fluxo é o código (SITUACOES_VALIDAS no PATCH). Decidir: ativar o trigger (cria tabela + trigger) ou deixar a máquina de estados só no código? A migration 296 atualiza a FUNÇÃO por consistência, mas sem trigger ela é inerte.
2. **CR de venda paga ANTES da entrega (Etapa 4).** No fluxo novo a conta a receber nasce 'pendente' quando a venda vira 'entregue'. Se o cliente já pagou tudo antes (no aprovado), quem marca essa CR como paga? Antes era o `fn_cr_marcar_pago_mp` dentro do `concluirVenda`. Definir na Etapa 4 (provável: chamar na confirmação de entrega).
3. **CLAUDE.md corrompido no working tree** (não commitado): cada linha virou comentário `# ` com escapes `\*\*`. NÃO fui eu. Deixei intocado e FORA deste commit. O Jonathan precisa decidir: restaurar do HEAD (`git checkout CLAUDE.md`) ou recuperar a versão que ele queria. A versão do HEAD ainda diz "v2.60.2" (desatualizada — já estamos em v2.62.0).
4. **Suíte vitest tem ~105 falhas PRÉ-EXISTENTES** no HEAD, não relacionadas a esta mudança. Pendência separada.

## Cuidados (continuam valendo p/ Etapas 3-5)
- NÃO tocar: ordens/pcp/protocolo/service/compras (têm 'concluido' próprio).
- public/directus READONLY (exceção: UPDATE public.contatos.celular já praticado pelo sistema).
- Migrations 295/296 só no TESTE. Produção só depois das Etapas 3-5 + testes + aval do Jonathan.
