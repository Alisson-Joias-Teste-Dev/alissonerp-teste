 SELECT
        CASE (o.tipo_ordem)::text
            WHEN 'servico'::text THEN 'Serviço'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE 'N/D'::text
        END AS tipo,
    count(*) AS total
   FROM alissonerp.ordens o
  WHERE (o.created_at > (now() - '6 mons'::interval))
  GROUP BY o.tipo_ordem
  ORDER BY (count(*)) DESC;