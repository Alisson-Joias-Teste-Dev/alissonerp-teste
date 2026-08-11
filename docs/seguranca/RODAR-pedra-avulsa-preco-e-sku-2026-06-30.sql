-- ════════════════════════════════════════════════════════════════════════════
-- RODAR NO BANCO — Pedra avulsa: (1) preço próprio + (2) conserto do SKU
-- Autorizado por: Alisson (chefe) — 2026-06-30
-- Reversível, não apaga nada. Pode rodar tudo de uma vez.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── PARTE 1 ─── Preço: pedra sem regra de precificação usa o preço próprio ────
SELECT alissonerp.assinar_mudanca_banco(
  'chefe', 'claude-code',
  'Pedra avulsa: vw_pedras_preco usa preco_tiny (preço próprio) como fallback quando nenhuma regra de precificação casa. Afeta 1 pedra hoje (Mossanite).',
  'CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco ... ELSE round(NULLIF(p.preco_tiny,0))::integer END AS preco_venda'
);

CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
 SELECT p.produto_id AS id_produto,
    p.nome::character varying AS nome,
    p.sku::character varying AS sku,
    ppe.peso_ct,
    r.categoria_pedra,
    r.nome_tabela,
    r.custo_usd_ct,
    r.preco_rs_un,
        CASE
            WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL THEN round(r.markup_inicial - (r.markup_inicial - r.markup_final) * (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric), 4)
            WHEN r.preco_rs_un IS NOT NULL THEN NULL::numeric
            ELSE r.markup_inicial
        END AS markup_calculado,
        CASE
            WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0::numeric THEN r.preco_rs_un::integer
            WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0::numeric AND ppe.peso_ct IS NOT NULL THEN round((ppe.peso_ct * r.custo_usd_ct)::double precision * (( SELECT parametros.dollar
               FROM parametros
             LIMIT 1)) *
            CASE
                WHEN r.tamanho_final_mm > r.tamanho_inicial_mm THEN r.markup_inicial - (r.markup_inicial - r.markup_final) * (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric)
                ELSE r.markup_inicial
            END::double precision)::integer
            -- FALLBACK (fix 2026-06-30): sem regra casada, usa o preço próprio da pedra
            -- (pedra avulsa / peça única). NULLIF evita mostrar R$ 0 como preço.
            ELSE round(NULLIF(p.preco_tiny, 0))::integer
        END AS preco_venda
   FROM alissonerp.erp_produtos p
     JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.produto_id
     LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.produto_id
     LEFT JOIN LATERAL ( SELECT r2.id,
            r2.nome_tabela,
            r2.categoria_pedra,
            r2.custo_usd_ct,
            r2.preco_rs_un,
            r2.tamanho_inicial_mm,
            r2.tamanho_final_mm,
            r2.markup_inicial,
            r2.markup_final,
            r2.ativa
           FROM alissonerp.pedras_precificacao_regras r2
          WHERE lower(COALESCE(p.tipo_de_pedra::text, ''::text)) = lower(r2.categoria_pedra::text) AND (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric >= r2.tamanho_inicial_mm AND replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric <= r2.tamanho_final_mm OR r2.categoria_pedra::text = 'zirconia'::text)
          ORDER BY r2.tamanho_inicial_mm
         LIMIT 1) r ON true
  WHERE ti.tipo_item = 'insumo'::text AND p.situacao::text = 'A'::text AND p.categoria::text = 'Pedras'::text;

-- ─── PARTE 2 ─── SKU: tira a Mossanite da faixa gigante (90000056 -> 1845) ──────
-- Conferido: o SKU 90000056 só existe em erp_produtos e public.estoque
-- (sem venda/ordem/orçamento/RFID). 1845 é o próximo SKU livre da loja.
SELECT alissonerp.assinar_mudanca_banco(
  'chefe', 'claude-code',
  'Corrige SKU da pedra avulsa Mossanite: 90000056 -> 1845 (tira da faixa 90M de saldo inicial).',
  'UPDATE alissonerp.erp_produtos/public.estoque SET sku=1845 WHERE sku=90000056'
);

UPDATE alissonerp.erp_produtos SET sku = '1845' WHERE sku = '90000056';
UPDATE public.estoque          SET sku = '1845' WHERE sku = '90000056';

-- Confere antes de confirmar: deve mostrar a Mossanite com SKU 1845 e preço 622
-- SELECT sku, nome FROM alissonerp.erp_produtos WHERE sku='1845';
-- SELECT sku, preco_venda FROM alissonerp.vw_pedras_preco WHERE sku='1845';

COMMIT;
