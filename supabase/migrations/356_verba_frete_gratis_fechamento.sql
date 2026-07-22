-- Migration 356: fechamento mensal da verba de frete grátis (reaproveita fechamentos_frete)
-- ⚠️ MIGRATION CRIADA COMO ARQUIVO — NÃO EXECUTADA. Rodar só depois de revisão/aprovação.
--
-- REGRA DE NEGÓCIO (verba de frete grátis, definida pelo Jonathan, 21/07):
--   A loja recebe todo mês uma verba para dar frete grátis de cortesia (o
--   normal é o cliente pagar). Verba = 0,1% do FATURAMENTO DO MÊS ANTERIOR
--   (ver src/lib/frete-verba.ts, BLOCO 3 desta mesma sessão).
--   No dia 01, automático: fecha o mês anterior e a verba nova entra —
--   SEMPRE, independente do resultado do fechamento.
--     Saldo POSITIVO (ou zero) no fechamento -> ZERA. NÃO é cumulativo — a
--       sobra não carrega pro mês seguinte (regra NOVA — ver abaixo o que
--       isso substitui).
--     Saldo NEGATIVO no fechamento -> gera TAREFA de aprovação (motivo
--       obrigatório se recusada). Se APROVADA: vira CONTA A PAGAR da
--       gerente, vencimento no dia 10 do mês em que o fechamento ocorre. Se
--       RECUSADA: não lança conta nenhuma.
--
--   O que muda desde a versão original desta tabela (migration 285, NUNCA
--   usada por nenhum código até hoje — zero linhas em produção):
--     ANTES (regra antiga, nunca chegou a ser implementada): saldo positivo
--       CARREGAVA pro mês seguinte (cumulativo); saldo negativo virava
--       DESCONTO EM FOLHA de pagamento da gerente (valor_descontado_folha).
--     AGORA (regra que vale, ver acima): saldo positivo ZERA (não é
--       cumulativo); saldo negativo vira CONTA A PAGAR (não desconto em
--       folha) — sujeita a aprovação antes de lançar.
--
--   Por que reaproveitar fechamentos_frete em vez de criar tabela nova:
--     a tabela já tem UNIQUE(gerente_id, mes_referencia) — idempotência do
--     fechamento mensal de graça — e saldo_frete_gratis.fechamento_id já é
--     FK pra ela (migration 285). Criar tabela nova duplicaria estrutura já
--     pronta (regra do CLAUDE.md: NUNCA duplicar tabelas).
--
--   O que faz este arquivo:
--     1. Acrescenta as colunas que faltam para o fechamento novo funcionar:
--        verba_creditada, faturamento_base, percentual_verba (auditoria do
--        cálculo da verba do mês — ver frete-verba.ts) e tarefa_aprovacao_id
--        + conta_pagar_id (rastreiam a aprovação e a conta gerada quando o
--        saldo fecha negativo).
--     2. Marca valor_descontado_folha como LEGADO via COMMENT (regra antiga,
--        NUNCA remover coluna — CLAUDE.md §2 Database Safety) — o desconto em
--        folha não existe mais; quem lê esta tabela a partir de agora deve
--        olhar conta_pagar_id, não valor_descontado_folha.
--     3. Redefine o domínio de `status` (fechado / aguardando_aprovacao /
--        pago / recusado) com CHECK — a tabela nunca foi usada, então não há
--        linha antiga para violar a constraint nova. DEFAULT também migra de
--        'aberto' (valor da regra antiga, fora do domínio novo) para
--        'fechado' (caso mais comum — saldo positivo/zero fecha sozinho,
--        sem aprovação); o código que INSERE deve sempre passar
--        'aguardando_aprovacao' explicitamente quando o saldo fechar
--        negativo — o DEFAULT é só uma rede de segurança para o caso comum.
--     4. Reescreve os COMMENTs (fechamentos_frete e saldo_frete_gratis, que
--        também descrevia a regra antiga) para refletir a regra atual.
--
--   Impacto se não aplicada: nenhum — nenhum código lê/escreve
--     fechamentos_frete ainda (fundação para o fechamento automático do dia
--     01, que vem em bloco futuro, fora desta sessão).
--   Impacto se a migration for revertida depois de aplicada e usada: perda
--     das colunas de auditoria do cálculo (verba_creditada/faturamento_base/
--     percentual_verba) e do rastreio da tarefa/conta gerada — o histórico
--     de fechamentos continua existindo (linhas não são apagadas), só sem
--     esses campos.

BEGIN;

SET search_path TO alissonerp;

-- 1. Colunas novas — auditoria do cálculo da verba e rastreio da aprovação.
-- REGRA: todas NULLABLE/opcionais (ADD COLUMN IF NOT EXISTS, idempotente).
-- IMPACTO SE REMOVIDAS: perde-se a rastreabilidade de QUANTO foi creditado,
-- de QUAL faturamento/percentual saiu o cálculo, e QUAL tarefa/conta a
-- pagar está ligada a este fechamento.
ALTER TABLE alissonerp.fechamentos_frete
  ADD COLUMN IF NOT EXISTS verba_creditada   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS faturamento_base  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS percentual_verba  NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id),
  ADD COLUMN IF NOT EXISTS conta_pagar_id      INTEGER REFERENCES alissonerp.contas_pagar(id);

COMMENT ON COLUMN alissonerp.fechamentos_frete.verba_creditada IS
'Valor da verba de frete grátis creditada no fechamento (0,1% do faturamento do MÊS ANTERIOR — ver calcularFaturamentoMes em src/lib/frete-verba.ts). Entra SEMPRE, independente do resultado do saldo anterior.';

COMMENT ON COLUMN alissonerp.fechamentos_frete.faturamento_base IS
'Faturamento do mês anterior usado como base do cálculo da verba — auditoria (permite reconferir o percentual aplicado depois). Mesma consulta da dashboard comercial (vw_dash_vendas_todas).';

COMMENT ON COLUMN alissonerp.fechamentos_frete.percentual_verba IS
'Percentual aplicado sobre faturamento_base para chegar em verba_creditada (config `percentual_verba_frete`, default 0,1%). Gravado por fechamento — se o percentual mudar depois, fechamentos antigos continuam mostrando o percentual que valia na época.';

COMMENT ON COLUMN alissonerp.fechamentos_frete.tarefa_aprovacao_id IS
'Tarefa de aprovação gerada quando o fechamento dá saldo NEGATIVO (aguardando decisão do usuário configurado para aprovar negativo de frete grátis — chave de config própria, definida em bloco futuro). NULL quando o fechamento é positivo/zero (status=fechado, sem aprovação).';

COMMENT ON COLUMN alissonerp.fechamentos_frete.conta_pagar_id IS
'Conta a pagar da GERENTE gerada quando a tarefa de saldo negativo é APROVADA (vencimento dia 10). NULL enquanto aguardando aprovação, ou se RECUSADA (recusa não lança conta — motivo obrigatório fica na tarefa/observacoes).';

-- 2. valor_descontado_folha — LEGADO da regra antiga (NUNCA remover coluna,
-- CLAUDE.md §2 Database Safety). A regra atual não desconta em folha —
-- saldo negativo aprovado vira conta_pagar_id. Mantida só por histórico;
-- não usar em código novo.
COMMENT ON COLUMN alissonerp.fechamentos_frete.valor_descontado_folha IS
'LEGADO — pertence à regra ANTIGA (nunca implementada em código): saldo negativo descontava da folha de pagamento da gerente. A regra ATUAL usa conta_pagar_id (conta a pagar, vencimento dia 10, sujeita a aprovação) — não usar esta coluna em código novo. Mantida sem remoção (CLAUDE.md §2).';

-- 3. Domínio de status — tabela NUNCA usada em produção (0 linhas), então dá
-- para redefinir o CHECK sem risco de violar linha existente.
-- REGRA: 'fechado' = saldo positivo ou zero, fechamento automático sem
-- aprovação (caso mais comum — também o DEFAULT). 'aguardando_aprovacao' =
-- saldo negativo, tarefa criada, esperando decisão. 'pago' = negativo
-- aprovado, conta_pagar_id preenchido. 'recusado' = negativo recusado
-- (motivo obrigatório — ver tarefa vinculada em tarefa_aprovacao_id).
-- IMPACTO SE ALTERADO: o código que fecha o mês (fora desta sessão) depende
-- destes 4 valores exatos para decidir o que fazer com cada fechamento.
ALTER TABLE alissonerp.fechamentos_frete
  DROP CONSTRAINT IF EXISTS chk_fechamento_frete_status;

ALTER TABLE alissonerp.fechamentos_frete
  ALTER COLUMN status SET DEFAULT 'fechado';

ALTER TABLE alissonerp.fechamentos_frete
  ADD CONSTRAINT chk_fechamento_frete_status
    CHECK (status IN ('fechado', 'aguardando_aprovacao', 'pago', 'recusado'));

-- 4. COMMENTs da tabela — reescritos para a regra ATUAL (positivo ZERA;
-- negativo -> aprovação -> conta a pagar). fechamentos_frete nunca teve
-- COMMENT ON TABLE (migration 285 não incluiu); saldo_frete_gratis tinha um
-- COMMENT descrevendo a regra ANTIGA (positivo carrega / negativo desconta
-- em folha) — também corrigido aqui, mesmo assunto.
COMMENT ON TABLE alissonerp.fechamentos_frete IS
'Fechamento mensal da verba de frete grátis (dia 01, automático). Saldo POSITIVO ou ZERO: fecha e ZERA (não é cumulativo — não carrega pro mês seguinte). Saldo NEGATIVO: gera tarefa de aprovação; se aprovada, vira conta a pagar da gerente (venc. dia 10, ver conta_pagar_id); se recusada, não lança nada (motivo obrigatório). A verba do mês novo (verba_creditada = 0,1% do faturamento do mês anterior, ver src/lib/frete-verba.ts) entra SEMPRE, independente do resultado deste fechamento.';

COMMENT ON TABLE alissonerp.saldo_frete_gratis IS
'Conta-corrente de frete grátis por gerente. Créditos abastecem (frete cobrado > motoboy). Débitos consomem (frete grátis ou parcial). Fechamento mensal (ver fechamentos_frete): saldo positivo/zero ZERA (não é cumulativo); saldo negativo vira conta a pagar da gerente após aprovação (não desconta mais em folha).';

COMMIT;
