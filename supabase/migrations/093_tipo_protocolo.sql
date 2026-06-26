-- Migration 093: tipo_protocolo em protocolos + tipos_protocolo_permitidos em usuarios
-- Agente C — 28/03/2026

-- ⚠️ BACKUP RECOMENDADO antes de executar

-- 1. Adicionar tipo no protocolo
ALTER TABLE alissonerp.protocolos
  ADD COLUMN IF NOT EXISTS tipo_protocolo VARCHAR(20) DEFAULT 'fabrica' NOT NULL;

COMMENT ON COLUMN alissonerp.protocolos.tipo_protocolo IS
  'Tipo: fabrica (vai pra fábrica via motoboy) ou service (vai pra service ao lado)';

-- 2. Backfill: protocolos de ordens servico_venda, servico_interno ou garantia → tipo service
--    (garantia vai nos dois; servico_venda e servico_interno são só service)
UPDATE alissonerp.protocolos p
SET tipo_protocolo = 'service'
WHERE EXISTS (
  SELECT 1
  FROM alissonerp.protocolo_ordens po
  JOIN alissonerp.ordens o ON o.id = po.ordem_id
  WHERE po.protocolo_id = p.id
    AND o.tipo_ordem::text IN ('servico_venda', 'servico_interno', 'garantia')
);
-- Os demais ficam como 'fabrica' (default)

-- 3. Adicionar coluna tipos_protocolo_permitidos no usuario
ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS tipos_protocolo_permitidos JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN alissonerp.usuarios.tipos_protocolo_permitidos IS
  'Array de tipos de protocolo que o usuário pode criar: ["fabrica","service"]. Vazio = sem permissão. Admin/dev ignoram.';

-- 4. Backfill permissões por role
-- Motoboy → só fabrica
UPDATE alissonerp.usuarios
SET tipos_protocolo_permitidos = '["fabrica"]'::jsonb
WHERE role = 'motoboy';

-- Gerentes → ambos
UPDATE alissonerp.usuarios
SET tipos_protocolo_permitidos = '["fabrica","service"]'::jsonb
WHERE role IN ('gerente_fabrica', 'gerente_loja');

-- Consultora → só service
UPDATE alissonerp.usuarios
SET tipos_protocolo_permitidos = '["service"]'::jsonb
WHERE role = 'consultora';

-- Admin/dev ignoram a coluna (fullAccess), ficam com '[]' (sem preenchimento necessário)
