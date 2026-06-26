-- Migration 090: Adiciona permissão editar_teor_ligacao para admin/desenvolvedor
-- Seed: admin e desenvolvedor recebem permissão de editar teor manualmente na ligação

INSERT INTO alissonerp.permissoes_usuario (usuario_id, acao, permitido)
SELECT u.id, 'editar_teor_ligacao', true
FROM alissonerp.usuarios u
WHERE u.role IN ('admin', 'desenvolvedor')
  AND u.ativo = true
ON CONFLICT (usuario_id, acao) DO NOTHING;
