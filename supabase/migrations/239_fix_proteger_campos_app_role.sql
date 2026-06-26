-- Migration 239: Corrige fn_proteger_campos_pdv para respeitar app.role = 'desenvolvedor'
-- Bug: PATCH /api/ordens/[id] define app.role = 'desenvolvedor' via set_config,
-- mas o trigger só bypassava service_role. Isso causava RAISE EXCEPTION
-- ao editar data_entrega, situacao, tipo_ordem e outros campos protegidos.
-- Criado: 07/05/2026

CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_campos_pdv()
RETURNS TRIGGER AS $$
DECLARE v_role TEXT;
DECLARE v_app_role TEXT;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'authenticated');
  IF v_role = 'service_role' THEN RETURN NEW; END IF;

  -- Permite desenvolvedor via app.role (setado pela API route com set_config)
  v_app_role := current_setting('app.role', true);
  IF v_app_role = 'desenvolvedor' THEN RETURN NEW; END IF;

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
