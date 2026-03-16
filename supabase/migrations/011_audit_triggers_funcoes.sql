-- ==============================================
-- MIGRATION 011: AUDIT LOG + TRIGGERS + FUNCOES
-- Schema: alissonerp
-- ==============================================
SET search_path TO alissonerp;

CREATE TABLE alissonerp.audit_log (
  id BIGSERIAL PRIMARY KEY,
  tabela TEXT NOT NULL,
  operacao TEXT NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro_id TEXT NOT NULL,
  dados_antes JSONB,
  dados_depois JSONB,
  usuario_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_tabela ON alissonerp.audit_log(tabela);
CREATE INDEX idx_audit_data   ON alissonerp.audit_log(created_at);

CREATE OR REPLACE FUNCTION alissonerp.fn_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.audit_log (tabela, operacao, registro_id, dados_antes, dados_depois, usuario_id)
  VALUES (
    TG_TABLE_NAME, TG_OP,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'sub', NULL)::uuid
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_ordens AFTER INSERT OR UPDATE OR DELETE ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();
CREATE TRIGGER trg_audit_pcp AFTER INSERT OR UPDATE OR DELETE ON alissonerp.pcp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();
CREATE TRIGGER trg_audit_mov_estoque AFTER INSERT ON alissonerp.movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();
CREATE TRIGGER trg_audit_protocolos AFTER INSERT OR UPDATE OR DELETE ON alissonerp.protocolos FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();
CREATE TRIGGER trg_audit_distribuicoes AFTER INSERT OR UPDATE OR DELETE ON alissonerp.distribuicoes FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log();

CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_campos_pdv()
RETURNS TRIGGER AS $$
DECLARE v_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'authenticated');
  IF v_role = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.numero_ordem IS DISTINCT FROM OLD.numero_ordem THEN RAISE EXCEPTION 'Campo protegido: numero_ordem'; END IF;
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN RAISE EXCEPTION 'Campo protegido: cliente_id'; END IF;
  IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN RAISE EXCEPTION 'Campo protegido: vendedor_id'; END IF;
  IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id THEN RAISE EXCEPTION 'Campo protegido: pedido_id'; END IF;
  IF NEW.tipo_ordem IS DISTINCT FROM OLD.tipo_ordem THEN RAISE EXCEPTION 'Campo protegido: tipo_ordem'; END IF;
  IF NEW.data_entrega IS DISTINCT FROM OLD.data_entrega THEN RAISE EXCEPTION 'Campo protegido: data_entrega'; END IF;
  IF NEW.peso_metal_negociado IS DISTINCT FROM OLD.peso_metal_negociado THEN RAISE EXCEPTION 'Campo protegido: peso_metal_negociado'; END IF;
  IF NEW.ficha_tecnica_id IS DISTINCT FROM OLD.ficha_tecnica_id THEN RAISE EXCEPTION 'Campo protegido: ficha_tecnica_id'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ordens_proteger_pdv BEFORE UPDATE ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_proteger_campos_pdv();

CREATE OR REPLACE FUNCTION alissonerp.fn_criar_par_movimentacao(
  p_insumo_id INTEGER, p_quantidade REAL,
  p_dep_origem INTEGER, p_set_origem INTEGER,
  p_dep_destino INTEGER, p_set_destino INTEGER,
  p_marcador alissonerp.enum_marcador_estoque,
  p_ordem_id INTEGER DEFAULT NULL, p_obs TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque (saida,entrada,insumo_id,deposito_id,setor_id,marcador,ordem_id,obs)
  VALUES (p_quantidade,0,p_insumo_id,p_dep_origem,p_set_origem,p_marcador,p_ordem_id,p_obs);
  INSERT INTO alissonerp.movimentacoes_estoque (saida,entrada,insumo_id,deposito_id,setor_id,marcador,ordem_id,obs)
  VALUES (0,p_quantidade,p_insumo_id,p_dep_destino,p_set_destino,p_marcador,p_ordem_id,p_obs);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_pmc_pcp(p_peso_final REAL, p_total_outros REAL, p_metal_externo REAL, p_entrada REAL, p_retorno REAL)
RETURNS TABLE(pmc REAL, quebra REAL, percentual REAL) AS $$
DECLARE v_pmc REAL; v_consumo REAL; v_quebra REAL; v_pct REAL;
BEGIN
  IF p_entrada = 0 THEN RETURN QUERY SELECT 0::REAL,0::REAL,0::REAL; RETURN; END IF;
  v_pmc:=p_peso_final-p_total_outros-p_metal_externo; v_consumo:=p_entrada-p_retorno;
  v_quebra:=v_consumo-v_pmc;
  v_pct:=CASE WHEN v_consumo!=0 THEN (v_quebra/v_consumo*100) ELSE 0 END;
  RETURN QUERY SELECT ROUND(v_pmc::numeric,2)::REAL,ROUND(v_quebra::numeric,2)::REAL,ROUND(v_pct::numeric,2)::REAL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_pmc_distribuicao(p_peso_final REAL, p_total_outros REAL, p_entrada REAL, p_retorno REAL)
RETURNS TABLE(pmc REAL, quebra REAL, percentual REAL) AS $$
DECLARE v_pmc REAL; v_quebra REAL; v_pct REAL;
BEGIN
  v_pmc:=p_peso_final-p_total_outros; v_quebra:=p_entrada-v_pmc;
  v_pct:=CASE WHEN v_pmc!=0 THEN (v_quebra/v_pmc*100) ELSE 0 END;
  RETURN QUERY SELECT ROUND(v_pmc::numeric,3)::REAL,ROUND(v_quebra::numeric,3)::REAL,ROUND(v_pct::numeric,2)::REAL;
END;
$$ LANGUAGE plpgsql;

CREATE VIEW alissonerp.vw_quebra_por_ourives AS
SELECT p.operador, u.nome AS nome_ourives, COUNT(p.id) AS total_ordens,
  SUM(p.total_metal) AS total_metal, SUM(p.pmc) AS total_pmc, SUM(p.quebra) AS total_quebra,
  CASE WHEN SUM(p.total_metal)>0 THEN ROUND((SUM(p.quebra)/SUM(p.total_metal)*100)::numeric,2) ELSE 0 END AS percentual_medio
FROM alissonerp.pcp p LEFT JOIN alissonerp.usuarios u ON p.operador=u.id
WHERE p.etapas='concluido' GROUP BY p.operador,u.nome;

CREATE VIEW alissonerp.vw_quebra_por_deposito AS
SELECT d.id AS deposito_id, d.nome AS deposito_nome,
  SUM(CASE WHEN me.marcador IN ('AD','EM','EIMD','ADD') THEN me.entrada ELSE 0 END) AS total_entrada,
  SUM(CASE WHEN me.marcador IN ('SM','RM','RMD') THEN me.saida ELSE 0 END) AS total_saida,
  SUM(me.entrada)-SUM(me.saida) AS saldo
FROM alissonerp.movimentacoes_estoque me
JOIN alissonerp.depositos d ON me.deposito_id=d.id
WHERE me.insumo_id=1 GROUP BY d.id,d.nome;
