-- =====================================================================
-- Migration 247: Premiação do Ranking — tabela de config editável
-- =====================================================================

CREATE TABLE IF NOT EXISTS alissonerp.config_premiacao (
  id         INT PRIMARY KEY DEFAULT 1,
  texto      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT config_premiacao_single_row CHECK (id = 1)
);

INSERT INTO alissonerp.config_premiacao (id, texto)
VALUES (1, $txt$🏆 PREMIAÇÃO INDIVIDUAL

• Vendas em prata — R$ 100
• Vendas em ouro — R$ 200
• Vendas em diamante — R$ 300

——————————————————————————

🏆 PREMIAÇÃO GERAL
(Válida apenas se a meta da equipe for atingida)

• Maior quantidade de vendas — R$ 100
• Maior resultado proporcional à meta — R$ 100
• Maior ticket médio — R$ 100

——————————————————————————

🏆 PREMIAÇÃO EQUIPE DE APOIO
(Válida apenas se a loja bater a meta geral)

Geovana e Ytalo recebem:

• Meta prata — R$ 300
• Meta ouro — R$ 400
• Meta diamante — R$ 500

Sujeito a alteração conforme o mês$txt$)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON alissonerp.config_premiacao TO anon, authenticated, service_role;
GRANT UPDATE ON alissonerp.config_premiacao TO service_role;
