 SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            WHEN 'criado'::text THEN 'Criado'::text
            WHEN 'rascunho'::text THEN 'Rascunho'::text
            ELSE 'Desconhecido'::text
        END AS situacao,
    (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE 'Aguardando'::text
        END AS status,
    (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'::text THEN 'PCP'::text
            WHEN 'protocolo'::text THEN 'Protocolo'::text
            ELSE '—'::text
        END AS rota,
    (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico'::text THEN 'Serviço'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE '—'::text
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated
   FROM ((((alissonerp.ordens o
     LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
     LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)));