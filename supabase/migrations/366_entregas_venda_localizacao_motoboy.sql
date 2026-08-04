-- ═══════════════════════════════════════════════════════════════════════════
-- 366 — Localização GPS do motoboy na entrega ao cliente
--
-- MOTIVO (pedido do Jonathan, 03/08/2026): sempre que o motoboy finaliza uma
-- corrida (avulsa OU entrega de venda ao cliente), o sistema passa a exigir
-- localização + foto. A hora já é gravada hoje (data_entrega_realizada) — só
-- faltava onde guardar a posição GPS capturada no momento da confirmação.
--
-- O QUE: 2 colunas nullable, sem afetar nenhuma linha existente. Guardam a
-- posição bruta (lat/long) capturada pelo navigator.geolocation do celular do
-- motoboy — o app monta um link do Google Maps a partir daqui na exibição
-- (https://www.google.com/maps?q=lat,long), sem geocodificação reversa (sem
-- custo, sem serviço externo novo).
--
-- IMPACTO SE REMOVIDO: confirmarEntrega/confirmarFreteAvulso (src/lib/
-- entrega-venda.ts) não teriam onde gravar a posição exigida do motoboy no
-- app — a validação de obrigatoriedade (código da aplicação) falharia ao
-- tentar persistir.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS latitude_entrega numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude_entrega numeric(10,7);
