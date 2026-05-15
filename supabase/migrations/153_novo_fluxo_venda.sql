-- Migration 153: novos campos em vendas_erp + tabela fretes_bairro
-- Suporte ao novo wizard de vendas: tipo_venda, rastreio, garantia e tabela de fretes por bairro

-- Novos campos em alissonerp.vendas_erp
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS tipo_venda TEXT CHECK (tipo_venda IN ('produto','servico','fabricacao','garantia')),
  ADD COLUMN IF NOT EXISTS numero_rastreio TEXT,
  ADD COLUMN IF NOT EXISTS venda_garantia_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- Tabela de fretes por bairro
CREATE TABLE IF NOT EXISTS alissonerp.fretes_bairro (
  id         SERIAL PRIMARY KEY,
  bairro     TEXT NOT NULL,
  municipio  TEXT NOT NULL DEFAULT 'Fortaleza',
  valor      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fretes_bairro_uniq ON alissonerp.fretes_bairro (bairro, municipio);

-- Inserir os ~119 bairros oficiais de Fortaleza (todos com valor 0 — admin configura depois)
INSERT INTO alissonerp.fretes_bairro (bairro, municipio) VALUES
  ('Aerolândia','Fortaleza'),('Aguanambi','Fortaleza'),('Aldeota','Fortaleza'),
  ('Alto da Balança','Fortaleza'),('Ancuri','Fortaleza'),('Antônio Bezerra','Fortaleza'),
  ('Bairro de Fátima','Fortaleza'),('Barra do Ceará','Fortaleza'),('Barroso','Fortaleza'),
  ('Bela Vista','Fortaleza'),('Benfica','Fortaleza'),('Boa Vista','Fortaleza'),
  ('Bom Futuro','Fortaleza'),('Bom Jardim','Fortaleza'),('Cais do Porto','Fortaleza'),
  ('Cambeba','Fortaleza'),('Campo Quatro','Fortaleza'),('Canindezinho','Fortaleza'),
  ('Carlito Pamplona','Fortaleza'),('Casa Amarela','Fortaleza'),('Castelão','Fortaleza'),
  ('Cidades','Fortaleza'),('City Periferia','Fortaleza'),('Conjunto Ceará I','Fortaleza'),
  ('Conjunto Ceará II','Fortaleza'),('Conjunto Esperança','Fortaleza'),('Conjunto Palmeiras','Fortaleza'),
  ('Couto Fernandes','Fortaleza'),('Curio','Fortaleza'),('Dendê','Fortaleza'),
  ('Dias Macedo','Fortaleza'),('Dix-Sept Rosado','Fortaleza'),('Dom Lustosa','Fortaleza'),
  ('Edson Queiroz','Fortaleza'),('Ellery','Fortaleza'),('Engenheiro Luciano Cavalcante','Fortaleza'),
  ('Farias Brito','Fortaleza'),('Genibaú','Fortaleza'),('Granja Lisboa','Fortaleza'),
  ('Granja Portugal','Fortaleza'),('Guajerú','Fortaleza'),('Guarapes','Fortaleza'),
  ('Henrique Jorge','Fortaleza'),('Irmã Tereza Araújo','Fortaleza'),('Itaoca','Fortaleza'),
  ('Itaperi','Fortaleza'),('Jangurussu','Fortaleza'),('Jardim América','Fortaleza'),
  ('Jardim das Oliveiras','Fortaleza'),('Jardim Guanabara','Fortaleza'),('Jardim Iracema','Fortaleza'),
  ('Jardim Jatobá','Fortaleza'),('Jardim União','Fortaleza'),('João XXIII','Fortaleza'),
  ('José Bonifácio','Fortaleza'),('José de Alencar','Fortaleza'),('Josefa Távora','Fortaleza'),
  ('Jóquei Clube','Fortaleza'),('Júlio Abreu','Fortaleza'),('Lagoa Redonda','Fortaleza'),
  ('Lavras da Mangabeira','Fortaleza'),('Luciano Cavalcante','Fortaleza'),('Maceió','Fortaleza'),
  ('Manibura','Fortaleza'),('Manuel Sátiro','Fortaleza'),('Maraponga','Fortaleza'),
  ('Mata Galinha','Fortaleza'),('Messejana','Fortaleza'),('Mondubim','Fortaleza'),
  ('Monte Castelo','Fortaleza'),('Montese','Fortaleza'),('Morada Nova','Fortaleza'),
  ('Mucuripe','Fortaleza'),('Novo Mondubim','Fortaleza'),('Panamericano','Fortaleza'),
  ('Papicu','Fortaleza'),('Parque Araxá','Fortaleza'),('Parque Dois Irmãos','Fortaleza'),
  ('Parque Genibaú','Fortaleza'),('Parque Iracema','Fortaleza'),('Parque Leblon','Fortaleza'),
  ('Parque Manibura','Fortaleza'),('Parque Presidente Vargas','Fortaleza'),('Parque Santa Rosa','Fortaleza'),
  ('Parque São José','Fortaleza'),('Parquelândia','Fortaleza'),('Passaré','Fortaleza'),
  ('Paupina','Fortaleza'),('Pedras','Fortaleza'),('Pentecoste','Fortaleza'),
  ('Pirambu','Fortaleza'),('Planalto Ayrton Sena','Fortaleza'),('Praia de Iracema','Fortaleza'),
  ('Praia do Futuro I','Fortaleza'),('Praia do Futuro II','Fortaleza'),('Presidente Kennedy','Fortaleza'),
  ('Quintino Cunha','Fortaleza'),('Reduto','Fortaleza'),('Rodolfo Teófilo','Fortaleza'),
  ('Salinas','Fortaleza'),('Santa Filomena','Fortaleza'),('Santa Tereza','Fortaleza'),
  ('São Bento','Fortaleza'),('São Gerardo','Fortaleza'),('São João do Tauape','Fortaleza'),
  ('São José','Fortaleza'),('Sapiranga','Fortaleza'),('Serrinha','Fortaleza'),
  ('Siqueira','Fortaleza'),('Sítio São João','Fortaleza'),('Tauape','Fortaleza'),
  ('Tururu','Fortaleza'),('Varjota','Fortaleza'),('Vicente Pinzón','Fortaleza'),
  ('Vila Ellery','Fortaleza'),('Vila Peri','Fortaleza'),('Vila União','Fortaleza'),
  ('Villagio','Fortaleza')
ON CONFLICT (bairro, municipio) DO NOTHING;
