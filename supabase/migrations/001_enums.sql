-- =============================================
-- MIGRATION 001: ENUMS DO SISTEMA
-- Joalheria ALISSON — ERP de Produção
-- Schema: alissonerp
-- =============================================

SET search_path TO alissonerp;

CREATE TYPE enum_situacao_ordem AS ENUM ('cancelado','criado','rascunho');
CREATE TYPE enum_status_ordem AS ENUM ('aguardando','em_andamento','concluido');
CREATE TYPE enum_rota_ordem AS ENUM ('pcp','protocolo');
CREATE TYPE enum_tipo_ordem AS ENUM ('producao','reparo','ajuste','banho','gravacao','reposicao','outro');
CREATE TYPE enum_etapas_pcp AS ENUM ('novas_ordens','pendencia','aguardando','em_andamento','concluido','cancelado');
CREATE TYPE enum_etapas_distribuicao AS ENUM ('em_andamento','concluido');
CREATE TYPE enum_setor_distribuicao AS ENUM ('fundicao','aliancas','cnc','laser','banca','tamboreador','epg');
CREATE TYPE enum_etapas_protocolo AS ENUM ('pendente','concluido');
CREATE TYPE enum_direcao_protocolo AS ENUM ('ida','volta');
CREATE TYPE enum_tipo_deposito AS ENUM ('administrativo','producao');
CREATE TYPE enum_tipo_apontamento_scope AS ENUM ('pcp','distribuicao','ambos');
CREATE TYPE enum_marcador_estoque AS ENUM (
  'AD','EM','EP','RM','RP','BI','SM','SP','SOI',
  'TED',
  'ADD','EIMD','EPD','RPD','RMD','EOID','SOID',
  'TEDMD','TEDPD','TEDD',
  'TA','EA','SA','Sangria','ENTRADA'
);
CREATE TYPE enum_tipo_lancamento AS ENUM ('transferencia','entrada','saida','sangria');
CREATE TYPE enum_role AS ENUM ('admin','gerente_fabrica','gerente_loja','ourives','motoboy','consultora','estoquista_fabrica','estoquista_loja','pcp');
CREATE TYPE enum_etapas_aprovacao AS ENUM ('pendente','aguardando','aprovado','reprovado');
CREATE TYPE enum_etapas_entrega AS ENUM ('pendente','concluido');
CREATE TYPE enum_tipo_metal AS ENUM ('ouro','prata');
CREATE TYPE enum_situacao_ativa AS ENUM ('ativo','inativo');
