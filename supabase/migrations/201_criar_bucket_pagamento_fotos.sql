-- Cria o bucket pagamento-fotos se ainda não existir
-- Necessário para o fluxo de pagamento em Ouro (foto da balança)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pagamento-fotos', 'pagamento-fotos', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated pode fazer upload e leitura
CREATE POLICY IF NOT EXISTS "pagamento_fotos_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pagamento-fotos');

CREATE POLICY IF NOT EXISTS "pagamento_fotos_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pagamento-fotos');
