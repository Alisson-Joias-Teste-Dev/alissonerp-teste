-- Migration 355: endereço estruturado (com CEP) na solicitação de frete avulso
-- REGRA DE NEGÓCIO (decisão do Jonathan, 21/07):
--   O que faz: acrescenta a alissonerp.entregas_venda as colunas estruturadas
--     de endereço (número, complemento, bairro, cidade, CEP, UF), espelhando
--     EXATAMENTE os nomes já usados em alissonerp.vendas_erp
--     (endereco_entrega_numero, _complemento, _bairro, _cidade, _cep, _uf) —
--     mesma convenção de nomenclatura, mesmo padrão de UI (busca por CEP via
--     ViaCEP, componente novo src/components/endereco/EnderecoForm.tsx).
--   Por que: hoje o modal de frete avulso (FreteAvulsoModal.tsx) grava o
--     endereço da solicitação como TEXTO LIVRE num único textarea
--     (entregas_venda.endereco_entrega, coluna TEXT da migration 353) —
--     concatenado a partir dos campos JÁ estruturados da venda. Isso perde a
--     estrutura por campo (não dá pra filtrar/validar CEP, bairro etc.) e é
--     inconsistente com o padrão do resto do sistema (Nova Venda já usa
--     formulário estruturado com busca por CEP).
--   Decisão sobre a coluna `endereco_entrega` (TEXT) já existente desde a
--     353: REUTILIZADA como "logradouro" — NÃO foi criado um conjunto de
--     colunas totalmente novo. Motivo (grep feito antes de decidir):
--       `endereco_entrega` de entregas_venda é lida em só 3 lugares no código
--       — criarFreteAvulso (src/lib/entrega-venda.ts, grava e monta a
--       descrição da tarefa), GET /api/entregas-venda/motoboy/minhas (exibe
--       pro motoboy) e GET /api/entregas-venda (listagem, campo exposto na
--       API mas ainda sem consumidor visual) — e os TRÊS são ajustados NA
--       MESMA migration/PR desta feature. Não há nenhum outro consumidor
--       histórico que dependa dela conter o endereço INTEIRO concatenado.
--       (Atenção: NÃO confundir com `vendas_erp.endereco_entrega`, mesma
--       nomenclatura mas TABELA e finalidade diferentes — o endereço
--       cadastrado na própria venda, usado por NovaVendaClientV2/PDF/NFe,
--       que esta migration NÃO altera.)
--     Reaproveitar evita duplicar coluna (regra de blindagem do projeto) e
--     não quebra dado histórico: solicitações já criadas antes desta
--     migration continuam com o texto completo antigo dentro de
--     `endereco_entrega` (as colunas novas ficam NULL nelas) — o helper de
--     exibição (formatarEnderecoEntregaAvulso, entrega-venda.ts) mostra esse
--     texto legado normalmente, só não quebra em colunas.
--   Impacto se removido: o formulário estruturado não teria onde gravar
--     número/complemento/bairro/cidade/CEP separados — voltaria a depender
--     do texto único (concatenado no client, como era antes).
--   Impacto em dados/código já existentes: ZERO — ADD COLUMN IF NOT EXISTS,
--     todas opcionais (NULL); a coluna `endereco_entrega` não muda de tipo
--     nem de nome, só passa a ser preenchida com o logradouro (em vez do
--     endereço inteiro) nas solicitações NOVAS.

BEGIN;

SET search_path TO alissonerp;

ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS endereco_entrega_numero      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_bairro      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_cidade      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_cep         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_uf          TEXT;

COMMIT;
