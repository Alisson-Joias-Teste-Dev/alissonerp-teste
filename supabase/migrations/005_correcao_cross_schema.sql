-- =============================================
-- MIGRATION 005: CORREÇÃO CROSS-SCHEMA
-- Remove duplicatas e cria views de leitura
-- =============================================
SET search_path TO alissonerp;

-- 1. Dropar tabela usuarios primeiro (depende de vendedores via FK)
DROP TABLE IF EXISTS alissonerp.usuarios CASCADE;

-- 2. Dropar duplicatas
DROP TABLE IF EXISTS alissonerp.vendedores CASCADE;
DROP TABLE IF EXISTS alissonerp.contatos CASCADE;
DROP TABLE IF EXISTS alissonerp.comissoes CASCADE;

-- 3. Views de leitura para tabelas do schema public
CREATE VIEW alissonerp.vw_vendedores AS
SELECT * FROM public.vendedores;

CREATE VIEW alissonerp.vw_contatos AS
SELECT * FROM public.contatos;

CREATE VIEW alissonerp.vw_comissoes AS
SELECT * FROM public.comissoes;

CREATE VIEW alissonerp.vw_produtos AS
SELECT * FROM public.produtos;

CREATE VIEW alissonerp.vw_vendas AS
SELECT * FROM public.vendas;

CREATE VIEW alissonerp.vw_user_profiles AS
SELECT * FROM public.user_profiles;

-- 4. Recriar tabela usuarios com FK para public.vendedores
CREATE TABLE alissonerp.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  nome VARCHAR(255) NOT NULL,
  role alissonerp.enum_role NOT NULL DEFAULT 'ourives',
  vendedor_id BIGINT REFERENCES public.vendedores(id_vendedor),
  mx_desconto_permitido DECIMAL(5,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Ajustar FK do insumos.fornecedor_id para public.contatos
ALTER TABLE alissonerp.insumos 
  DROP CONSTRAINT IF EXISTS insumos_fornecedor_id_fkey;

ALTER TABLE alissonerp.insumos 
  ADD CONSTRAINT insumos_fornecedor_id_fkey 
  FOREIGN KEY (fornecedor_id) REFERENCES public.contatos(id_contato);
