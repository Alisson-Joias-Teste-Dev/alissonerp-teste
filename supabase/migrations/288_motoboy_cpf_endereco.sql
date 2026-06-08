-- Migration 288: Adiciona CPF e endereço ao cadastro de motoboy
--
-- REGRA DE NEGÓCIO: o motoboy é prestador de serviço e precisa de CPF
-- para cadastro formal. O endereço é necessário para logística e roteirização.
-- Veículo foi removido do formulário de cadastro (mantido na tabela por
-- compatibilidade com dados existentes).
--
-- IMPACTO SE REMOVIDO: perde-se dados cadastrais obrigatórios do entregador.

ALTER TABLE alissonerp.motoboys
  ADD COLUMN IF NOT EXISTS cpf      VARCHAR(14),
  ADD COLUMN IF NOT EXISTS endereco TEXT;
