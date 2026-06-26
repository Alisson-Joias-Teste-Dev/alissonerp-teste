-- 187_fix_vw_ordens_completa_status_cancelado.sql
-- Adiciona 'cancelado' no CASE de status e expõe venda_id para link direto na UI.

DROP VIEW IF EXISTS alissonerp.vw_ordens_completa CASCADE;

CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.venda_id,
    o.situacao::text AS situacao_cod,
        CASE o.situacao::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
    o.status::text AS status_cod,
        CASE o.status::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE 'Desconhecido'
        END AS status,
    o.rota::text AS rota_cod,
        CASE o.rota::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
    o.tipo_ordem::text AS tipo_ordem_cod,
        CASE o.tipo_ordem::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            ELSE '—'
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
   FROM alissonerp.ordens o
     LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
     LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
     LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
     LEFT JOIN contatos c ON c.id_contato = o.cliente_id;
