-- Migra os registros da v0 da Movimentacao Interna (que rodou em producao
-- reaproveitando protocolos tipo='interno' + protocolo_produtos) para a
-- estrutura nova solicitacoes_peca.
--
-- Mapeamento (v0 tinha 2 passos: abriu com foto -> confirmou recebimento com
-- foto; nao tinha solicitante nem finalizacao):
--   abertura (created_by + foto_criacao + created_at) -> passo ENTREGUE
--   recebimento (recebedor_id + foto_conclusao + data_conclusao) -> passo RECEBIDO
--   solicitante_id := created_by (melhor disponivel; a v0 nao tinha solicitante)
--   etapas 'concluido' -> status 'recebido' (com a solicitante) — a v0 nao
--     registrava se a peca voltou ao estoque ou o cliente levou, entao nao se
--     inventa finalizacao.
--   etapas 'pendente' (so abriu, sem confirmar) -> status 'entregue'
--
-- NAO deleta nem altera os protocolos originais — eles ficam preservados como
-- backup. origem_protocolo_id guarda a proveniencia. Idempotente (NOT EXISTS).

INSERT INTO alissonerp.solicitacoes_peca (
  status, solicitante_id, created_at,
  entregue_por_id, entregue_em, foto_entrega,
  recebido_por_id, recebido_em, foto_recebimento,
  origem_protocolo_id
)
SELECT
  CASE WHEN p.etapas::text = 'concluido' THEN 'recebido' ELSE 'entregue' END,
  p.created_by,
  p.created_at,
  p.created_by, p.created_at, p.foto_criacao,
  CASE WHEN p.etapas::text = 'concluido' THEN p.recebedor_id END,
  CASE WHEN p.etapas::text = 'concluido' THEN p.data_conclusao END,
  CASE WHEN p.etapas::text = 'concluido' THEN p.foto_conclusao END,
  p.id
FROM alissonerp.protocolos p
WHERE p.tipo_protocolo = 'interno'
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.solicitacoes_peca s WHERE s.origem_protocolo_id = p.id
  );

INSERT INTO alissonerp.solicitacao_peca_produtos (solicitacao_id, produto_id)
SELECT s.id, pp.produto_id
FROM alissonerp.protocolo_produtos pp
JOIN alissonerp.protocolos po ON po.id = pp.protocolo_id AND po.tipo_protocolo = 'interno'
JOIN alissonerp.solicitacoes_peca s ON s.origem_protocolo_id = po.id
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.solicitacao_peca_produtos x
  WHERE x.solicitacao_id = s.id AND x.produto_id = pp.produto_id
);
