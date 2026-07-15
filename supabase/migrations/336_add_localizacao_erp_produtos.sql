-- Migration 336: localizacao fisica da peca em erp_produtos
-- O QUE: adiciona a coluna `localizacao` (texto livre) na tabela de produtos do ERP.
-- POR QUE: a localizacao fisica da peca (ex: "LJ-ET04") ja existe na fonte externa e
--          sera importada uma unica vez para o ERP; a partir dai o ERP vira o dono do
--          dado (edicao manual na tela do estoque comercial).
-- IMPACTO SE REMOVER: a coluna Localizacao na lista/detalhe do estoque comercial e a
--          ferramenta de importacao/edicao param de funcionar. NAO afeta saldo de
--          estoque, reservas nem financeiro (coluna puramente informativa).
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS localizacao text;

COMMENT ON COLUMN alissonerp.erp_produtos.localizacao IS
  'Localizacao fisica da peca (prateleira/gaveta). Carga inicial via importacao externa; depois editada no ERP.';
