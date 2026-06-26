-- =====================================================================
-- Migration 174: Dashboard Comercial — Views alissonerp -> public.*
-- =====================================================================
-- Cria VIEWS em alissonerp que apontam para tabelas do schema public.
-- Estratégia: não duplicar dados; dashboard lê sempre o estado atual.
--
-- Fonte de dados: projeto alison-joias-admin-site-main (mesmo banco).
-- As 12 tabelas base vivem em public.* e são populadas por integração
-- externa (Tiny ERP + Kommo). Este dashboard consome-as via views.
--
-- Padrão de nomes: alissonerp.vw_dash_<tabela>
-- =====================================================================

-- 1. Vendas ------------------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_vendas AS
SELECT
  id,
  created_at,
  updated_at,
  cliente_id,
  vendedor_id,
  data_venda,
  data_envio,
  status,
  total_produtos,
  total_venda,
  total_itens_qnt,
  total_itens_unidades,
  forma_envio_id,
  forma_frete_id,
  endereco_cobranca,
  dados_entrega,
  dados_pagamento,
  observacoes_internas,
  observacoes,
  arquivos_path,
  frete_pago_cliente,
  lead_id,
  numero_pedido_tiny,
  id_api_tiny,
  public_link_uuid,
  entregue,
  numero_pedido,
  pedido_numero
FROM public.vendas;

-- 2. Metas Mensais -----------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_metas_mensais AS
SELECT
  id,
  created_at,
  mes_ano,
  horas_dia,
  hora_inicio,
  dias_trabalhados,
  valor_ouro,
  valor_prata,
  valor_diamante,
  consultora,
  dias_nao_trabalhados
FROM public.metas_mensais;

-- 3. Metas por Hora ----------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_metas_por_hora AS
SELECT
  id,
  meta_mensal_id,
  created_at,
  data_hora,
  consultora,
  tipo_meta,
  valor_meta,
  meta_acumulada
FROM public.metas_por_hora;

-- 4. Vendedores --------------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_vendedores AS
SELECT
  id_vendedor,
  nome,
  id_api_vendedor,
  foto,
  situacao,
  id_api_kommo,
  cpf,
  email,
  user_id,
  comissao,
  gerente_orcamento
FROM public.vendedores;

-- 5. Itens de Venda ----------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_itens_venda AS
SELECT
  id,
  venda_id,
  produto_id,
  sku,
  quantidade,
  preco_tabela,
  preco_unitario_final,
  preco_total,
  desconto_percentual,
  desconto_valor,
  comissao_valor,
  comissao_percentual,
  n8n
FROM public.itens_venda;

-- 6. Comissões ---------------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_comissoes AS
SELECT
  id,
  created_at,
  nome,
  tabela
FROM public.comissoes;

-- 7. Controle de Entregas ----------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_controle_entregas AS
SELECT
  id,
  pedido_id,
  entregador_responsavel,
  data_entrega,
  valor_entrega,
  observacoes,
  anexos_path,
  numero_pedido_plataforma,
  numero_pedido_tiny,
  nome_cliente,
  frete_pago_cliente,
  bairro_entrega,
  created_at,
  updated_at,
  created_by,
  vendedor_responsavel_id,
  entrega_type,
  status_aprovacao,
  descricao_entrega,
  -- Normalização do status para boolean (bug do alison: filtra 'APROVADA' mas dado é '1'/'2'/'3')
  -- Convenção identificada: '2' = aprovada (197 de 203 registros)
  (status_aprovacao = '2') AS aprovada
FROM public.controle_entregas;

-- 8. Forma de Envio ----------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_forma_envio AS
SELECT
  id,
  created_at,
  id_api,
  tipo,
  situacao,
  nome
FROM public.forma_envio;

-- 9. Forma de Frete ----------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_forma_frete AS
SELECT
  id,
  created_at,
  nome,
  codigo,
  codigo_externo,
  tipo_entrega,
  id_api,
  id_api_logistica
FROM public.forma_frete;

-- 10. Leads ------------------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_leads AS
SELECT
  id,
  id_lead,
  fonte_entrada_id,
  consultor,
  data_entrada,
  data_fechamento,
  motivo_perda,
  pedido_tiny,
  contao_nome AS contato_nome,  -- corrige typo da tabela original
  contato_telefone,
  etapa_lead,
  nome_lead,
  data_criacao,
  data_atualizacao,
  id_vendedor,
  status_pedido,
  status_id
FROM public.leads;

-- 11. Parcelas dos Pedidos ---------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_parcelas_pedidos AS
SELECT
  id_parcela,
  dias,
  data,
  valor,
  observacao,
  forma_pagamento,
  meio_pagamento,
  pedido_id_api
FROM public.parcelas_pedidos;

-- 12. View Detalhada Parcelas+Pedido -----------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_dash_pedidos_parcelas_detalhado AS
SELECT
  numero_pedido,
  data_pedido,
  situacao,
  cliente_id_api,
  id_vendedor,
  forma_pagamento_pedido,
  meio_pagamento_pedido,
  data_vencimento_parcela,
  valor_parcela,
  forma_pagamento_parcela,
  meio_pagamento_parcela,
  eh_devolucao
FROM public.pedidos_parcelas_detalhado;

-- =====================================================================
-- Grants: permitir leitura via PostgREST / anon
-- =====================================================================
GRANT SELECT ON alissonerp.vw_dash_vendas                     TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_metas_mensais              TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_metas_por_hora             TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_vendedores                 TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_itens_venda                TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_comissoes                  TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_controle_entregas          TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_forma_envio                TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_forma_frete                TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_leads                      TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_parcelas_pedidos           TO anon, authenticated, service_role;
GRANT SELECT ON alissonerp.vw_dash_pedidos_parcelas_detalhado TO anon, authenticated, service_role;

-- =====================================================================
-- Comentários
-- =====================================================================
COMMENT ON VIEW alissonerp.vw_dash_vendas                     IS 'Dashboard Comercial: vendas do Tiny ERP (read-only mirror de public.vendas)';
COMMENT ON VIEW alissonerp.vw_dash_metas_mensais              IS 'Dashboard Comercial: metas mensais por consultora (Ouro/Prata/Diamante)';
COMMENT ON VIEW alissonerp.vw_dash_metas_por_hora             IS 'Dashboard Comercial: metas granulares por hora (derivadas de metas_mensais)';
COMMENT ON VIEW alissonerp.vw_dash_vendedores                 IS 'Dashboard Comercial: vendedores/consultoras (id_vendedor, nome, foto, situacao)';
COMMENT ON VIEW alissonerp.vw_dash_itens_venda                IS 'Dashboard Comercial: itens das vendas (para cálculo de comissão)';
COMMENT ON VIEW alissonerp.vw_dash_comissoes                  IS 'Dashboard Comercial: tabelas de comissão (JSON com faixas de desconto)';
COMMENT ON VIEW alissonerp.vw_dash_controle_entregas          IS 'Dashboard Comercial: entregas aprovadas (coluna "aprovada" normaliza status_aprovacao=2)';
COMMENT ON VIEW alissonerp.vw_dash_forma_envio                IS 'Dashboard Comercial: formas de envio (lookup)';
COMMENT ON VIEW alissonerp.vw_dash_forma_frete                IS 'Dashboard Comercial: formas de frete (lookup)';
COMMENT ON VIEW alissonerp.vw_dash_leads                      IS 'Dashboard Comercial: leads do Kommo (coluna contato_nome corrige typo original)';
COMMENT ON VIEW alissonerp.vw_dash_parcelas_pedidos           IS 'Dashboard Comercial: parcelas (para cálculo de vale-troca por venda)';
COMMENT ON VIEW alissonerp.vw_dash_pedidos_parcelas_detalhado IS 'Dashboard Comercial: view agregada parcelas+pedido (comparativo histórico)';
