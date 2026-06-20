-- 327_crediario_reserva_corte.sql
--
-- O QUÊ: registra a DATA DE CORTE da regra nova de reserva do crediário (③).
--   A regra "peça reservada não paga em 7 dias corridos → vira VC" vale SOMENTE
--   para vendas criadas A PARTIR do dia em que esta migration roda no ambiente.
--
-- POR QUE: o Jonathan decidiu (20/06) que a regra nova NÃO pode pegar vendas
--   antigas (que nasceram sob a lógica anterior do "sinal"). O corte é por ambiente:
--   cada banco (homolog, depois prod) carimba a SUA data de aplicação. Vendas com
--   created_at < corte seguem o motor legado (sinal/sinal-cron).
--
-- IMPACTO SE ALTERADO/REMOVIDO: sem este registro, o robô `reserva-cron` NÃO
--   processa nada (ele exige o corte). Mudar a data muda QUAIS vendas entram na
--   regra nova — mexer aqui afeta conversões financeiras (geração de VC).
--
-- BLINDAGEM: INSERT idempotente (ON CONFLICT DO NOTHING) — re-rodar NÃO move o corte.

INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'crediario_reserva_corte',
  CURRENT_DATE::text,
  'Data de corte da regra nova de reserva do crediário (③). Só vendas criadas a partir desta data viram VC por reserva não paga (7 dias corridos). Vendas antigas seguem o motor legado (sinal).'
)
ON CONFLICT (chave) DO NOTHING;
