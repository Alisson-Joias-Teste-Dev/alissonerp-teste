-- v2.30.11 — Pagamento em Ouro
-- Adiciona campos de ouro em pagamentos_venda + bucket pagamento-fotos

ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS ouro_peso        NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS ouro_valor_grama NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ouro_foto_path   TEXT;

-- Bucket para fotos de confirmação de peso (pagamento em ouro)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pagamento-fotos', 'pagamento-fotos', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated pode fazer upload e leitura
CREATE POLICY "pagamento_fotos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pagamento-fotos');

CREATE POLICY "pagamento_fotos_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pagamento-fotos');
