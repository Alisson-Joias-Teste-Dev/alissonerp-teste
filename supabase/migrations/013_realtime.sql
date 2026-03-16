-- ==============================================
-- MIGRATION 013: SUPABASE REALTIME
-- Schema: alissonerp
-- ==============================================

ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.protocolos;
ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.ordens;
ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.pcp;
ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.aprovacoes_consultora;
