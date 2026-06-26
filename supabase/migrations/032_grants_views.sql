-- =============================================
-- MIGRATION 032: GRANTS PARA VIEWS
-- Todas as views alissonerp precisam de SELECT para anon + authenticated
-- (server components usam postgres direto; client-side usa anon key)
-- =============================================
SET search_path TO alissonerp;

-- ─── USAGE no schema (obrigatório para anon/authenticated acessarem via PostgREST) ──
GRANT USAGE ON SCHEMA alissonerp TO anon, authenticated;

-- ─── Views de dados principais ───────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_ordens_completa                    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_por_tipo                    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordem_detalhe                      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_pcp_completa                       TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_pcp_erp                            TO anon, authenticated;

-- ─── Views de auditoria ──────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_auditorias_completa                TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_dashboard_auditoria                TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_aguardando_auditoria_loja   TO anon, authenticated;

-- ─── Views de filas (usadas em modais client-side) ───────────────────────────
GRANT SELECT ON alissonerp.vw_ordens_prontas_ida                 TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_prontas_pcp                 TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_prontas_volta               TO anon, authenticated;

-- ─── Ficha técnica ───────────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_fichas_tecnicas                    TO anon, authenticated;

-- ─── Timeline ────────────────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_timeline_ordem                     TO anon, authenticated;

-- ─── Detalhe da ordem (tabs) ─────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_apontamentos_ordem                 TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_estoque_ordem                      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_transferencias_ordem               TO anon, authenticated;

-- ─── Protocolo ───────────────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_protocolo_ordens                   TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_protocolos_completo                TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_protocolos_loja_completo           TO anon, authenticated;

-- ─── Estoque / Insumos ───────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_saldo_estoque                      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_estoque_directus                   TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_estoque_directus_saldo             TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_movimentacoes_directus             TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_insumos_directus                   TO anon, authenticated;

-- ─── Quebra / Produção ───────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_quebra_por_ourives                 TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_quebra_mensal                      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_quebra_por_deposito                TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_producao_mensal                    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_produtividade_ourives              TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_kpis_gerais                        TO anon, authenticated;

-- ─── Cross-schema (público / comercial) ──────────────────────────────────────
GRANT SELECT ON alissonerp.vw_vendedores                         TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_contatos                           TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_produtos                           TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_vendas                             TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_vendas_completa                    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_comissoes                          TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_resumo_financeiro                  TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_user_profiles                      TO anon, authenticated;

-- =============================================================================
-- GRANTS EM TABELAS (para authenticated — mutations via Supabase client)
-- anon: sem escrita. authenticated: lê tudo + escreve nas tabelas operacionais.
-- RLS policies (migration 012) controlam o quê pode ser escrito por cada role.
-- =============================================================================

-- ─── authenticated: SELECT em todas as tabelas operacionais ──────────────────
GRANT SELECT ON alissonerp.ordens                    TO authenticated;
GRANT SELECT ON alissonerp.pcp                       TO authenticated;
GRANT SELECT ON alissonerp.auditorias                TO authenticated;
GRANT SELECT ON alissonerp.protocolos                TO authenticated;
GRANT SELECT ON alissonerp.protocolo_ordens          TO authenticated;
GRANT SELECT ON alissonerp.protocolo_fotos           TO authenticated;
GRANT SELECT ON alissonerp.aprovacoes_consultora     TO authenticated;
GRANT SELECT ON alissonerp.preparacoes_entrega       TO authenticated;
GRANT SELECT ON alissonerp.apontamentos_pcp          TO authenticated;
GRANT SELECT ON alissonerp.apontamentos_distribuicao TO authenticated;
GRANT SELECT ON alissonerp.saidas_ordem              TO authenticated;
GRANT SELECT ON alissonerp.transferencias_ordem      TO authenticated;
GRANT SELECT ON alissonerp.movimentacoes_estoque     TO authenticated;
GRANT SELECT ON alissonerp.distribuicoes             TO authenticated;
GRANT SELECT ON alissonerp.distribuicao_ordens       TO authenticated;
GRANT SELECT ON alissonerp.itens_distribuicao        TO authenticated;
GRANT SELECT ON alissonerp.saidas_distribuicao       TO authenticated;
GRANT SELECT ON alissonerp.fechamentos_distribuicao  TO authenticated;
GRANT SELECT ON alissonerp.fechamentos_fabrica       TO authenticated;
GRANT SELECT ON alissonerp.compras                   TO authenticated;
GRANT SELECT ON alissonerp.itens_compra              TO authenticated;
GRANT SELECT ON alissonerp.insumos                   TO authenticated;
GRANT SELECT ON alissonerp.depositos                 TO authenticated;
GRANT SELECT ON alissonerp.setores                   TO authenticated;
GRANT SELECT ON alissonerp.tipos_apontamento         TO authenticated;
GRANT SELECT ON alissonerp.categorias_insumo         TO authenticated;
GRANT SELECT ON alissonerp.usuarios                  TO authenticated;
GRANT SELECT ON alissonerp.notificacoes              TO authenticated;
GRANT SELECT ON alissonerp.ordem_comentarios         TO authenticated;
GRANT SELECT ON alissonerp.pedras_ordens             TO authenticated;
GRANT SELECT ON alissonerp.itens_ordem_insumos       TO authenticated;
GRANT SELECT ON alissonerp.itens_ordem_produtos      TO authenticated;
GRANT SELECT ON alissonerp.outros_insumos_pcp        TO authenticated;
GRANT SELECT ON alissonerp.outros_insumos_distribuicao TO authenticated;
GRANT SELECT ON alissonerp.apontamentos_pote         TO authenticated;
GRANT SELECT ON alissonerp.lancamentos_avulso        TO authenticated;
GRANT SELECT ON alissonerp.contas_pagar              TO authenticated;
GRANT SELECT ON alissonerp.contas_receber            TO authenticated;
GRANT SELECT ON alissonerp.fin_extratos_bancarios    TO authenticated;
GRANT SELECT ON alissonerp.fin_lancamentos_bancarios TO authenticated;
GRANT SELECT ON alissonerp.fin_conciliacoes          TO authenticated;
GRANT SELECT ON alissonerp.parametros                TO authenticated;

-- ─── authenticated: escrita nas tabelas operacionais ─────────────────────────
-- Auditoria (aprovar/reprovar/pendenciar)
GRANT UPDATE ON alissonerp.auditorias TO authenticated;
GRANT INSERT ON alissonerp.auditorias TO authenticated;

-- PCP (nova ordem, conclusão)
GRANT INSERT ON alissonerp.pcp        TO authenticated;
GRANT UPDATE ON alissonerp.pcp        TO authenticated;

-- Protocolos (criar ida/volta)
GRANT INSERT ON alissonerp.protocolos         TO authenticated;
GRANT UPDATE ON alissonerp.protocolos         TO authenticated;
GRANT INSERT ON alissonerp.protocolo_ordens   TO authenticated;
GRANT UPDATE ON alissonerp.protocolo_ordens   TO authenticated;
GRANT INSERT ON alissonerp.protocolo_fotos    TO authenticated;

-- Apontamentos e saidas (PCP flow)
GRANT INSERT ON alissonerp.apontamentos_pcp   TO authenticated;
GRANT UPDATE ON alissonerp.apontamentos_pcp   TO authenticated;
GRANT INSERT ON alissonerp.saidas_ordem       TO authenticated;
GRANT UPDATE ON alissonerp.saidas_ordem       TO authenticated;
GRANT INSERT ON alissonerp.transferencias_ordem TO authenticated;

-- Movimentações de estoque (leitura + escrita avulsa)
GRANT INSERT ON alissonerp.movimentacoes_estoque TO authenticated;
GRANT INSERT ON alissonerp.lancamentos_avulso     TO authenticated;

-- Distribuição
GRANT INSERT ON alissonerp.distribuicoes          TO authenticated;
GRANT UPDATE ON alissonerp.distribuicoes          TO authenticated;
GRANT INSERT ON alissonerp.distribuicao_ordens    TO authenticated;
GRANT INSERT ON alissonerp.itens_distribuicao     TO authenticated;
GRANT UPDATE ON alissonerp.itens_distribuicao     TO authenticated;
GRANT INSERT ON alissonerp.saidas_distribuicao    TO authenticated;
GRANT INSERT ON alissonerp.fechamentos_distribuicao TO authenticated;
GRANT UPDATE ON alissonerp.fechamentos_distribuicao TO authenticated;
GRANT INSERT ON alissonerp.apontamentos_distribuicao TO authenticated;

-- Aprovações / preparações (pós-produção)
GRANT INSERT ON alissonerp.aprovacoes_consultora  TO authenticated;
GRANT UPDATE ON alissonerp.aprovacoes_consultora  TO authenticated;
GRANT INSERT ON alissonerp.preparacoes_entrega    TO authenticated;
GRANT UPDATE ON alissonerp.preparacoes_entrega    TO authenticated;

-- Notificações e comentários
GRANT INSERT ON alissonerp.notificacoes           TO authenticated;
GRANT UPDATE ON alissonerp.notificacoes           TO authenticated;
GRANT INSERT ON alissonerp.ordem_comentarios      TO authenticated;
GRANT UPDATE ON alissonerp.ordem_comentarios      TO authenticated;
GRANT INSERT ON alissonerp.ordem_comentario_mencoes TO authenticated;

-- Financeiro
GRANT INSERT ON alissonerp.compras                TO authenticated;
GRANT UPDATE ON alissonerp.compras                TO authenticated;
GRANT INSERT ON alissonerp.itens_compra           TO authenticated;
GRANT UPDATE ON alissonerp.itens_compra           TO authenticated;
GRANT INSERT ON alissonerp.contas_pagar           TO authenticated;
GRANT UPDATE ON alissonerp.contas_pagar           TO authenticated;
GRANT INSERT ON alissonerp.contas_receber         TO authenticated;
GRANT UPDATE ON alissonerp.contas_receber         TO authenticated;
GRANT INSERT ON alissonerp.fin_conciliacoes       TO authenticated;
GRANT UPDATE ON alissonerp.fin_conciliacoes       TO authenticated;

-- ─── Sequences (necessário para INSERT em tabelas com SERIAL) ─────────────────
GRANT USAGE ON ALL SEQUENCES IN SCHEMA alissonerp TO authenticated;
