-- ══════════════════════════════════════════════════════════════════════════
-- Migration 315 — B1: Friso fantasma (anel liso indo pra fábrica com friso)
-- ══════════════════════════════════════════════════════════════════════════
-- O QUÊ: garante que uma ficha técnica de orçamento SEM friso (has_friso != true)
--        não carregue MEDIDA de friso residual. Duas partes:
--          (1) TRAVA  — trigger BEFORE INSERT/UPDATE zera as medidas de friso
--                       quando a ficha não tem friso marcado.
--          (2) LIMPEZA — zera as medidas residuais das fichas já existentes.
--
-- POR QUÊ (regra de negócio): o painel do orçamento salvava as medidas do friso
--        (largura/profundidade/lado/offset) SEMPRE — mesmo com o friso desligado,
--        gravando os defaults do painel (0.50 / 0.20 / UPPER / 0.80). O visualizador
--        3D da ordem (api/ordens/[id]/ring-params) reconstruía "tem friso" a partir
--        dessa medida residual (friso_largura>0 && friso_profundidade>0), mandando o
--        ourives cavar friso num anel que era pra ser LISO.
--        Diagnóstico homolog (18/06/2026): 146 fichas afetadas (prod ~154).
--
-- IMPACTO se removido: volta o friso fantasma — anel liso vai pra fábrica com sulco.
--
-- PRESERVA (NUNCA toca):
--   • Perfis legados 'FrisoUnico' / 'FrisoLateral' — nesses o friso vem do PERFIL,
--     então as medidas são legítimas mesmo com has_friso != true.
--   • Fichas com has_friso = true — friso real, medidas mantidas.
--
-- SEGURO/ADITIVO: trigger é defesa nova (CREATE OR REPLACE, sem DROP destrutivo);
--   o UPDATE só zera medida ONDE NÃO há friso. Sem alterar schema/coluna.
-- ══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- (1) TRAVA — função que normaliza a ficha: sem friso ⇒ sem medida de friso.
--     Zera as 4 medidas que o 3D usa pra desenhar o sulco (largura/profundidade/
--     lado/offset). friso_kind/friso_tipo são metadados inertes sem medida e sem
--     has_friso — não precisam ser tocados.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_normalizar_friso_ficha()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Perfis legados têm o friso embutido no PERFIL (antes da migration 140 friso
  -- era um perfil, não uma flag). As medidas deles são legítimas — não tocar.
  IF COALESCE(NEW.perfil, '') IN ('FrisoUnico', 'FrisoLateral') THEN
    RETURN NEW;
  END IF;

  -- Sem friso marcado ⇒ zera TODA medida de friso (mata o sulco fantasma na origem).
  IF NEW.has_friso IS NOT TRUE THEN
    NEW.friso_largura      := NULL;
    NEW.friso_profundidade := NULL;
    NEW.friso_lado         := NULL;
    NEW.friso_offset       := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION alissonerp.fn_normalizar_friso_ficha() IS
  'B1 friso fantasma: ficha sem friso (has_friso != true) não carrega medida de friso. Preserva perfis legados FrisoUnico/FrisoLateral e fichas com friso real.';

-- CREATE OR REPLACE TRIGGER (PG15) — idempotente, sem DROP destrutivo.
CREATE OR REPLACE TRIGGER trg_normalizar_friso_ficha
  BEFORE INSERT OR UPDATE ON alissonerp.orcamento_fichas_tecnicas
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_normalizar_friso_ficha();

-- ──────────────────────────────────────────────────────────────────────────
-- (2) LIMPEZA — zera a medida residual das fichas já existentes (mesma regra).
--     Mira anel sem friso, não-legado, com QUALQUER resíduo de friso. O WHERE
--     cobre os 4 campos que o SET zera (largura/profundidade/lado/offset) — não
--     basta filtrar largura/profundidade, senão uma ficha cujo único lixo é
--     lado/offset escaparia da limpeza.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE alissonerp.orcamento_fichas_tecnicas
SET friso_largura      = NULL,
    friso_profundidade = NULL,
    friso_lado         = NULL,
    friso_offset       = NULL
WHERE has_friso IS NOT TRUE
  AND COALESCE(perfil, '') NOT IN ('FrisoUnico', 'FrisoLateral')
  AND (COALESCE(friso_largura, 0) > 0 OR COALESCE(friso_profundidade, 0) > 0
       OR friso_lado IS NOT NULL OR COALESCE(friso_offset, 0) > 0);
