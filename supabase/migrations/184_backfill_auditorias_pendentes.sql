-- Migration 184: Backfill — aprovar auditorias loja pendentes
-- Aprova todas as auditorias loja que estão 'pendente' e cuja ordem ainda está
-- em 'aguardando'. Dispara fn_processar_auditoria via BEFORE UPDATE, que cria
-- saida_ordem + PCP (rota=pcp) ou mantém aguardando (rota=protocolo).

UPDATE alissonerp.auditorias a
SET
  situacao       = 'aprovado',
  data_conclusao = now(),
  parecer        = 'Aprovação automática — backfill migração 184'
FROM alissonerp.ordens o
WHERE a.ordem_id    = o.id
  AND a.tipo_auditoria = 'loja'
  AND a.situacao       = 'pendente'
  AND o.status         = 'aguardando';
