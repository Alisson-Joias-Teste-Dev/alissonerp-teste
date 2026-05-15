-- ==============================================
-- MIGRATION 012: RLS BASICO
-- Schema: alissonerp
-- ==============================================
SET search_path TO alissonerp;

ALTER TABLE alissonerp.ordens ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.pcp ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.distribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.protocolos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.apontamentos_pcp ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.apontamentos_distribuicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.transferencias_ordem ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.aprovacoes_consultora ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.preparacoes_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.ordem_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.usuarios ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION alissonerp.fn_user_role()
RETURNS alissonerp.enum_role AS $$
  SELECT role FROM alissonerp.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "admin_full_ordens" ON alissonerp.ordens FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_pcp" ON alissonerp.pcp FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_distribuicoes" ON alissonerp.distribuicoes FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_mov_estoque" ON alissonerp.movimentacoes_estoque FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_protocolos" ON alissonerp.protocolos FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_apt_pcp" ON alissonerp.apontamentos_pcp FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_apt_dist" ON alissonerp.apontamentos_distribuicao FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_transf" ON alissonerp.transferencias_ordem FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_aprovacoes" ON alissonerp.aprovacoes_consultora FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_preparacoes" ON alissonerp.preparacoes_entrega FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_notificacoes" ON alissonerp.notificacoes FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_comentarios" ON alissonerp.ordem_comentarios FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');
CREATE POLICY "admin_full_usuarios" ON alissonerp.usuarios FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'admin') WITH CHECK (alissonerp.fn_user_role() = 'admin');

CREATE POLICY "gerente_fab_ordens" ON alissonerp.ordens FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'gerente_fabrica');
CREATE POLICY "gerente_fab_pcp" ON alissonerp.pcp FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'gerente_fabrica');
CREATE POLICY "gerente_fab_distribuicoes" ON alissonerp.distribuicoes FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'gerente_fabrica');
CREATE POLICY "gerente_fab_estoque" ON alissonerp.movimentacoes_estoque FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'gerente_fabrica');
CREATE POLICY "gerente_fab_protocolos" ON alissonerp.protocolos FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'gerente_fabrica');

CREATE POLICY "motoboy_select_protocolos" ON alissonerp.protocolos FOR SELECT TO authenticated USING (alissonerp.fn_user_role() = 'motoboy');
CREATE POLICY "motoboy_update_protocolos" ON alissonerp.protocolos FOR UPDATE TO authenticated USING (alissonerp.fn_user_role() = 'motoboy' AND motoboy_id = auth.uid());

CREATE POLICY "ourives_select_pcp" ON alissonerp.pcp FOR SELECT TO authenticated USING (alissonerp.fn_user_role() = 'ourives');
CREATE POLICY "ourives_apontamentos" ON alissonerp.apontamentos_pcp FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'ourives') WITH CHECK (alissonerp.fn_user_role() = 'ourives');

CREATE POLICY "consultora_aprovacoes" ON alissonerp.aprovacoes_consultora FOR ALL TO authenticated USING (alissonerp.fn_user_role() = 'consultora');

CREATE POLICY "user_own_notificacoes" ON alissonerp.notificacoes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "all_read_comentarios" ON alissonerp.ordem_comentarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "author_write_comentarios" ON alissonerp.ordem_comentarios FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_own_profile" ON alissonerp.usuarios FOR SELECT TO authenticated USING (id = auth.uid());
