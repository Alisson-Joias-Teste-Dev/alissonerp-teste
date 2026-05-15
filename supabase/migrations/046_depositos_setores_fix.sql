-- =============================================
-- MIGRATION 046: Fix vw_saldo_pote + setores.deposito_id
-- =============================================

-- 1. vw_saldo_pote: contar saldo SOMENTE do Almoxarifado Central (deposito_id=1)
CREATE OR REPLACE VIEW alissonerp.vw_saldo_pote AS
SELECT ci.id AS categoria_id,
    ci.nome AS categoria_nome,
    count(DISTINCT i.id) AS total_insumos,
    COALESCE(sum(se.saldo_total), 0::real) AS saldo_total,
    COALESCE(( SELECT insumos.unidade
           FROM alissonerp.insumos
          WHERE insumos.categoria_id = ci.id AND insumos.ativo = true
         LIMIT 1), 'g'::character varying) AS unidade
   FROM alissonerp.categorias_insumo ci
     LEFT JOIN alissonerp.insumos i ON i.categoria_id = ci.id AND i.ativo = true
     LEFT JOIN ( SELECT vw_saldo_estoque.insumo_id,
            sum(vw_saldo_estoque.saldo) AS saldo_total
           FROM alissonerp.vw_saldo_estoque
          WHERE vw_saldo_estoque.deposito_id = 1
          GROUP BY vw_saldo_estoque.insumo_id) se ON se.insumo_id = i.id
  GROUP BY ci.id, ci.nome
  ORDER BY ci.id;

-- 2. setores: adicionar FK para depósito
ALTER TABLE alissonerp.setores
  ADD COLUMN IF NOT EXISTS deposito_id INTEGER REFERENCES alissonerp.depositos(id);

GRANT SELECT, INSERT, UPDATE ON alissonerp.setores TO authenticated;
