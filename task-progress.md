# Task Progress: Fluxo Completo da Baixa do Ouro

## Checklist
- [x] Analisar fluxo atual de pagamento em ouro (já mapeado)
- [ ] Explorar módulo de protocolo (tabelas, rotas, views)
- [ ] Explorar módulo de estoque (como ouro 18k amarelo é armazenado)
- [ ] Mapear tabela `pagamentos_venda` e campos existentes
- [ ] Criar migration: adicionar campos de protocolo/transito na tabela
- [ ] Criar trigger/function: ao registrar pagamento ouro, criar protocolo "Sangria de Metal"
- [ ] Criar migration: view/sangria tracking
- [ ] Criar rota API: concluir sangria (foto, confirmação) → estoque
- [ ] Criar/atualizar component frontend de sangria de metal
- [ ] Testar fluxo completo
