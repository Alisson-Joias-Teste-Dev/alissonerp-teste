-- =============================================================================
-- APLICAR A MIGRATION 371 EM PRODUCAO (pedra: movimentacao de estoque em GRAMA)
--
-- POR QUE ESTE ARQUIVO EXISTE, se a migration 371 ja esta em supabase/migrations:
--   Em 11/08/2026 as portas de banco da producao estavam inacessiveis de fora
--   (5432/5433/5543/6543, Connection timed out), so 22/80/443 respondiam. Sem
--   psql de fora, a aplicacao tem que sair de DENTRO do servidor -- e colar 439
--   linhas num terminal de navegador e pedir erro.
--   Este script faz a MESMA mudanca da 371 (4 linhas, 2 funcoes) operando sobre
--   a definicao VIVA das funcoes, em vez de reescrever o corpo inteiro.
--
-- POR QUE ISSO E MAIS SEGURO QUE COLAR A MIGRATION:
--   Ele nao assume que a funcao no banco e igual a do arquivo. Ele LE a funcao
--   que esta rodando, exige encontrar exatamente 2 ocorrencias do padrao em cada
--   uma e ABORTA sem alterar nada se achar outro numero. Se alguem editou a
--   funcao a mao no banco, o script para em vez de sobrescrever.
--   Rodar duas vezes tambem aborta (na segunda achara 0 ocorrencias).
--
-- COMO RODAR (terminal do servidor, painel da Hostinger ou Easypanel):
--   docker exec -i <container_do_banco> psql -U postgres -d postgres < este_arquivo
--   ou cole o conteudo dentro de: docker exec -it <container> psql -U postgres
--
-- ROLLBACK: o passo 2 salva a definicao ORIGINAL das duas funcoes na tabela
--   alissonerp.rollback_371_funcoes. Para desfazer:
--     DO $r$ DECLARE d TEXT; BEGIN
--       FOR d IN SELECT definicao FROM alissonerp.rollback_371_funcoes LOOP
--         EXECUTE d; END LOOP; END $r$;
--   Depois de confirmar que esta tudo certo, a tabela pode ser removida.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Confirmar o ambiente. PARE se nao for producao.
--   producao = current_database 'postgres'   |   homolog = 'postgres-homolog'
-- ─────────────────────────────────────────────────────────────────────────────
SELECT inet_server_addr() AS host, current_database() AS banco, now() AS quando;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Salvar o rollback com a definicao VIVA das funcoes, antes de mexer.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.rollback_371_funcoes (
  proname    TEXT PRIMARY KEY,
  definicao  TEXT NOT NULL,
  salvo_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO alissonerp.rollback_371_funcoes (proname, definicao)
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'alissonerp'
  AND p.proname IN ('fn_processar_apontamento_pcp', 'fn_processar_apontamento_dist')
ON CONFLICT (proname) DO NOTHING;

SELECT proname, length(definicao) AS tamanho_def, salvo_em
FROM alissonerp.rollback_371_funcoes ORDER BY proname;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Assinar a mudanca (rastro de quem mexeu; token do banco e compartilhado).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan',
  'claude-code',
  'Migration 371: movimentacao de estoque de PEDRA passa de quilate para grama nos gatilhos de apontamento (PCP e Distribuicao). Corrige premissa da 368 (assumia entrada por compra; a entrada e por Lancamento Avulso, em grama). Sem isso o apontamento deixava o Almoxarifado com saldo negativo.',
  'CREATE OR REPLACE fn_processar_apontamento_pcp + fn_processar_apontamento_dist (4 linhas: v_peso_ct::REAL -> NEW.qtd)'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 4 — Aplicar. Aborta sem alterar nada se a funcao viva nao for a esperada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
  r        RECORD;
  v_def    TEXT;
  v_novo   TEXT;
  v_alvo   TEXT := 'NEW.insumo_id, v_peso_ct::REAL,';
  v_troca  TEXT := 'NEW.insumo_id, NEW.qtd,';
  v_n      INT;
  v_total  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'alissonerp'
      AND p.proname IN ('fn_processar_apontamento_pcp', 'fn_processar_apontamento_dist')
    ORDER BY p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);

    IF v_n <> 2 THEN
      RAISE EXCEPTION
        'ABORTADO em %: achei % ocorrencia(s) do padrao, esperava 2. A funcao viva no banco nao e a que foi analisada (ou a mudanca ja foi aplicada). NADA foi alterado.',
        r.proname, v_n;
    END IF;

    v_novo := replace(v_def, v_alvo, v_troca);
    EXECUTE v_novo;
    v_total := v_total + v_n;
    RAISE NOTICE 'OK % -> 2 linhas trocadas de quilate para grama', r.proname;
  END LOOP;

  IF v_total <> 4 THEN
    RAISE EXCEPTION 'ABORTADO: esperava trocar 4 linhas no total, troquei %. Verifique se as duas funcoes existem.', v_total;
  END IF;

  RAISE NOTICE 'CONCLUIDO: 4 linhas trocadas nas 2 funcoes.';
END
$do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 5 — Verificar. As duas colunas tem que sair 'f' (nenhum ct restante).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT p.proname,
       position('v_peso_ct::REAL' in pg_get_functiondef(p.oid)) > 0 AS ainda_grava_em_ct,
       position('NEW.insumo_id, NEW.qtd,' in pg_get_functiondef(p.oid)) > 0 AS grava_em_grama
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'alissonerp'
  AND p.proname IN ('fn_processar_apontamento_pcp', 'fn_processar_apontamento_dist')
ORDER BY p.proname;
