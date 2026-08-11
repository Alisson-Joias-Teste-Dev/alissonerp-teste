-- Migration 358: Relatórios de pagamento do motoboy (persistidos)
--
-- REGRA DE NEGÓCIO: reforma da aba "Pagamento do motoboy" (21/07/2026,
-- mockup aprovado pelo Jonathan — ver docs/regras-negocio/entregas.md §12.8).
-- Até aqui (migration 291 / §12.6) o "relatório" era só um CÁLCULO em tela
-- (GET /motoboy/relatorio-pagamento por entregador+período) — nada era
-- gravado, e o ajuste do financeiro (toggle Pagar/Não pagar por linha) era
-- EFÊMERO (perdia-se ao recarregar a página). Essa limitação já estava
-- registrada como decisão RESERVADA ao Jonathan (§12.6, linha final: "Se o
-- Jonathan preferir persistir o rascunho de decisão... isso exigiria uma
-- tabela nova"). Esta migration é essa decisão, agora autorizada.
--
-- MODELAGEM ESCOLHIDA (documentada na task): tabela NOVA, em vez de estender
-- `pagamentos_motoboy` com um status 'rascunho'/'pago' (que exigiria relaxar
-- o CHECK valor_total > 0 daquela tabela E arriscaria contaminar
-- `pagamentos_motoboy_itens` — hoje a EXISTÊNCIA de uma linha ali já
-- significa "entrega paga" em vários pontos do código, ex.: `motoboy/pagar`,
-- `motoboy/minhas`, `motoboy/relatorio-pagamento` (`foi_pago`). Inserir itens
-- de RASCUNHO nessa tabela faria uma corrida "revisar"/"não pagar" ainda não
-- confirmada aparecer como JÁ PAGA em qualquer consulta que reuse esse EXISTS
-- — quebrando a trava anti-duplo-pagamento e o próprio relatório).
--
-- Por isso: `relatorios_pagamento_motoboy` é um estágio de CONFERÊNCIA
-- (rascunho -> aguardando confirmação), separado do LIVRO de pagamento de
-- fato (`pagamentos_motoboy`/`pagamentos_motoboy_itens`, que continua sendo a
-- ÚNICA fonte de verdade sobre "o que já foi pago"). Ao confirmar
-- ("Confirmar pagamento"), a rota cria o `pagamentos_motoboy` correspondente
-- REUSANDO a mesma transação/validação de `motoboy/pagar`
-- (`src/lib/pagamento-motoboy.ts` -> `criarPagamentoMotoboyTx`, extraída
-- nesta mudança para não duplicar a lógica) — nunca um segundo caminho de
-- pagamento, nunca burla a UNIQUE(entrega_id) de `pagamentos_motoboy_itens`.
--
-- Tabelas:
--   relatorios_pagamento_motoboy       — cabeçalho (entregador, período,
--                                        status, total sugerido/pago)
--   relatorios_pagamento_motoboy_itens — corridas do período, com a
--                                        classificação (SUGESTÃO, snapshot no
--                                        momento da criação) e a DECISÃO
--                                        (pagar/não pagar) — a decisão
--                                        inicial é `decisaoInicialFinanceiro`
--                                        e só é sobrescrita de verdade no
--                                        momento da confirmação (o ajuste
--                                        entre abrir e confirmar continua
--                                        vivendo no estado do componente,
--                                        igual antes — só a decisão FINAL
--                                        usada na confirmação é gravada).
--
-- IMPACTO SE REMOVIDO: a aba volta a não ter histórico de relatórios — cada
-- geração era um cálculo solto, sem rastro do que foi mostrado ao financeiro
-- antes de confirmar.

SET search_path TO alissonerp, public;

-- 1. Cabeçalho do relatório
CREATE TABLE IF NOT EXISTS alissonerp.relatorios_pagamento_motoboy (
  id              SERIAL PRIMARY KEY,
  motoboy_id      UUID NOT NULL REFERENCES auth.users(id),

  -- Período coberto pelo relatório (mesmo par início/fim do formulário)
  data_inicio     DATE NOT NULL,
  data_fim        DATE NOT NULL,

  -- REGRA DE NEGÓCIO: 'aguardando' = ainda pode ser aberto/ajustado/pago.
  -- 'pago' = HISTÓRICO TRAVADO — não reedita, não confirma de novo (a rota
  -- de confirmação rejeita com 409 quando o status já é 'pago').
  status          VARCHAR(20) NOT NULL DEFAULT 'aguardando'
                    CHECK (status IN ('aguardando', 'pago')),

  -- Enquanto 'aguardando': soma das corridas com decisão inicial "pagar"
  -- (mesmo cálculo de calcularTotalAjustado no momento da criação).
  -- Ao confirmar: é SOBRESCRITO com o valor_total real do pagamento criado
  -- (pode divergir da sugestão se o financeiro ajustou linhas ao abrir).
  total_sugerido  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_sugerido >= 0),

  -- Preenchido só na confirmação — aponta para o lote de pagamento de fato
  -- criado (rastreabilidade: de qual relatório este pagamento veio).
  pagamento_id    INTEGER REFERENCES alissonerp.pagamentos_motoboy(id),

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  pago_em         TIMESTAMPTZ,
  pago_por        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_pagamento_motoboy_motoboy
  ON alissonerp.relatorios_pagamento_motoboy(motoboy_id, created_at DESC);

-- REGRA DE NEGÓCIO: listagem da aba ordena por created_at DESC, paginada de
-- 10 em 10 — este índice cobre a listagem geral (sem filtro de motoboy).
CREATE INDEX IF NOT EXISTS idx_relatorios_pagamento_motoboy_created
  ON alissonerp.relatorios_pagamento_motoboy(created_at DESC);

-- 2. Corridas do relatório (snapshot da sugestão + decisão)
CREATE TABLE IF NOT EXISTS alissonerp.relatorios_pagamento_motoboy_itens (
  id               SERIAL PRIMARY KEY,
  relatorio_id     INTEGER NOT NULL REFERENCES alissonerp.relatorios_pagamento_motoboy(id) ON DELETE CASCADE,
  entrega_id       INTEGER NOT NULL REFERENCES alissonerp.entregas_venda(id),

  -- Snapshot da SUGESTÃO calculada por classificarCorridaMotoboy() no
  -- momento da criação do relatório — nunca recalculada depois (histórico
  -- estável mesmo que a venda/entrega mude de situação depois).
  classificacao    VARCHAR(20) NOT NULL CHECK (classificacao IN ('pagar', 'revisar', 'nao_pagar')),

  -- Decisão gravada — parte de decisaoInicialFinanceiro(classificacao) na
  -- criação; é ATUALIZADA para o valor final usado na hora da confirmação
  -- (histórico fiel do que realmente foi pago), mas SÓ enquanto o relatório
  -- ainda está 'aguardando' — depois de 'pago', trava junto com o cabeçalho.
  decisao          VARCHAR(20) NOT NULL CHECK (decisao IN ('pagar', 'nao_pagar')),

  frete_motoboy    NUMERIC(12,2) NOT NULL CHECK (frete_motoboy >= 0),

  -- REGRA DE NEGÓCIO: UNIQUE por RELATÓRIO (não global) — a mesma entrega
  -- pode aparecer em relatórios diferentes ainda não confirmados (ex.: dois
  -- rascunhos com períodos sobrepostos). A trava anti-duplo-PAGAMENTO real
  -- continua sendo a UNIQUE(entrega_id) de pagamentos_motoboy_itens,
  -- checada de novo na confirmação (NOT EXISTS, mesma condição de
  -- motoboy/pagar) — não duplicada/enfraquecida aqui.
  UNIQUE(relatorio_id, entrega_id)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_pagamento_motoboy_itens_relatorio
  ON alissonerp.relatorios_pagamento_motoboy_itens(relatorio_id);
