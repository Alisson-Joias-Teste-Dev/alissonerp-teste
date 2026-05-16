-- Sequence única pra numero_venda — elimina race condition do MAX+1.
-- Antes: 2 INSERTs paralelos podiam pegar o mesmo MAX e colidir no UNIQUE.
-- Agora: nextval atomicamente reserva o próximo número.

CREATE SEQUENCE IF NOT EXISTS alissonerp.venda_numero_seq;

-- Alinha a sequence com o maior número já existente (entre public.vendas
-- legado e alissonerp.vendas_erp). Roda em qualquer ambiente — idempotente.
SELECT setval(
  'alissonerp.venda_numero_seq',
  GREATEST(
    1,
    (SELECT COALESCE(MAX(numero_pedido), 0) FROM public.vendas),
    (SELECT COALESCE(MAX(numero_venda::bigint), 0)
       FROM alissonerp.vendas_erp
       WHERE numero_venda ~ '^[0-9]+$')
  )
);
