-- Migration 065: Adiciona flag eh_teste à tabela ordens
-- Identifica ordens criadas diretamente pelo PCP para testes de desenvolvimento.
-- Uso: badge "🧪 TESTE" no Kanban + filtro futuro

ALTER TABLE alissonerp.ordens
ADD COLUMN IF NOT EXISTS eh_teste BOOLEAN NOT NULL DEFAULT false;
