# `alissonerp` — Triggers

> 55 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `apontamentos_distribuicao` | `trg_after_insert_apontamento_dist` | AFTER | INSERT | `alissonerp.fn_processar_apontamento_dist` | ENABLED |
| `apontamentos_pcp` | `trg_after_insert_apontamento_pcp` | AFTER | INSERT | `alissonerp.fn_processar_apontamento_pcp` | ENABLED |
| `aprovacoes_consultora` | `trg_aprovacao_entrega` | AFTER | UPDATE | `alissonerp.fn_aprovacao_para_entrega` | ENABLED |
| `auditorias` | `trg_processar_auditoria` | BEFORE | UPDATE | `alissonerp.fn_processar_auditoria` | ENABLED |
| `compras` | `trg_aa_bloquear_compra` | BEFORE | UPDATE | `alissonerp.fn_bloquear_compra` | ENABLED |
| `compras` | `trg_compra_gerar_conta_pagar` | AFTER | UPDATE | `alissonerp.fn_compra_gerar_conta_pagar` | ENABLED |
| `compras` | `trg_concluir_compra` | BEFORE | UPDATE | `alissonerp.fn_concluir_compra` | ENABLED |
| `curva_categorias` | `trg_curva_categorias_updated_at` | BEFORE | UPDATE | `alissonerp.fn_curva_touch_updated_at` | ENABLED |
| `curva_config` | `trg_curva_config_updated_at` | BEFORE | UPDATE | `alissonerp.fn_curva_touch_updated_at` | ENABLED |
| `devolucoes_venda` | `trg_devolucoes_updated_at` | BEFORE | UPDATE | `alissonerp.fn_devolucoes_updated_at` | ENABLED |
| `distribuicao_ordens` | `trg_after_insert_distribuicao_ordem` | AFTER | INSERT | `alissonerp.fn_criar_fechamento_por_ordem` | ENABLED |
| `distribuicoes` | `trg_audit_distribuicoes` | AFTER | INSERT,DELETE,UPDATE | `alissonerp.fn_audit_log` | ENABLED |
| `distribuicoes` | `trg_concluir_distribuicao` | BEFORE | UPDATE | `alissonerp.fn_concluir_distribuicao` | ENABLED |
| `estoque_comercial_config` | `trg_update_estoque_comercial_config_ts` | BEFORE | UPDATE | `alissonerp.fn_update_estoque_comercial_config_ts` | ENABLED |
| `fechamentos_distribuicao` | `trg_fechamento_distribuicao` | AFTER | INSERT,UPDATE | `alissonerp.fn_processar_fechamento_dist` | ENABLED |
| `fornecedores` | `trg_fornecedores_updated_at` | BEFORE | UPDATE | `alissonerp.fn_touch_updated_at` | ENABLED |
| `insumos` | `trg_calcular_peso_pedra` | BEFORE | INSERT,UPDATE | `alissonerp.fn_calcular_peso_pedra_gramas` | ENABLED |
| `itens_compra` | `trg_calcular_item_compra` | BEFORE | INSERT,UPDATE | `alissonerp.fn_calcular_item_compra` | ENABLED |
| `itens_venda_erp` | `trg_estoque_comercial_baixa_venda` | AFTER | INSERT | `alissonerp.fn_estoque_comercial_baixa_venda` | ENABLED |
| `itens_venda_erp` | `trg_estoque_comercial_reversao_item` | AFTER | DELETE | `alissonerp.fn_estoque_comercial_reversao_item` | ENABLED |
| `itens_venda_erp` | `trg_estoque_comercial_update_qtd_item` | AFTER | UPDATE | `alissonerp.fn_estoque_comercial_update_qtd_item` | ENABLED |
| `itens_venda_erp` | `trg_proteger_insert_itens_venda_fechada` | BEFORE | INSERT | `alissonerp.fn_proteger_itens_venda_fechada` | ENABLED |
| `itens_venda_erp` | `trg_proteger_itens_venda_fechada` | BEFORE | DELETE,UPDATE | `alissonerp.fn_proteger_itens_venda_fechada` | ENABLED |
| `itens_venda_erp` | `trg_recalcular_totais_venda` | AFTER | INSERT,DELETE,UPDATE | `alissonerp.fn_recalcular_totais_venda` | ENABLED |
| `joias_rfid` | `trg_joias_rfid_touch_updated` | BEFORE | UPDATE | `alissonerp.tg_joias_rfid_touch_updated` | ENABLED |
| `lancamentos_avulso` | `trg_lancamento_avulso` | AFTER | INSERT | `alissonerp.fn_processar_lancamento_avulso` | ENABLED |
| `movimentacoes_estoque` | `trg_audit_mov_estoque` | AFTER | INSERT | `alissonerp.fn_audit_log` | ENABLED |
| `mp_point_devices` | `trg_updated_at_mp_point_devices` | BEFORE | UPDATE | `alissonerp.fn_updated_at_mp_point_devices` | ENABLED |
| `ordens` | `trg_audit_ordens` | AFTER | INSERT,DELETE,UPDATE | `alissonerp.fn_audit_log` | ENABLED |
| `ordens` | `trg_auto_auditoria_loja` | AFTER | INSERT | `alissonerp.fn_auto_auditoria_loja` | ENABLED |
| `ordens` | `trg_cancelar_pcp_ordem` | AFTER | UPDATE | `alissonerp.fn_cancelar_pcp_ordem` | ENABLED |
| `ordens` | `trg_ordens_proteger_pdv` | BEFORE | UPDATE | `alissonerp.fn_proteger_campos_pdv` | ENABLED |
| `outros_insumos_distribuicao` | `trg_after_insert_outros_insumos_dist` | AFTER | INSERT | `alissonerp.fn_processar_outros_insumos_dist` | ENABLED |
| `outros_insumos_pcp` | `trg_after_insert_outros_insumos_pcp` | AFTER | INSERT | `alissonerp.fn_processar_outros_insumos_pcp` | ENABLED |
| `parametros_sistema` | `trg_atualizar_parametros_sistema` | BEFORE | UPDATE | `alissonerp.fn_atualizar_parametros_sistema` | ENABLED |
| `pcp` | `trg_audit_pcp` | AFTER | INSERT,DELETE,UPDATE | `alissonerp.fn_audit_log` | ENABLED |
| `pcp` | `trg_criar_servico_from_pcp` | AFTER | INSERT | `alissonerp.fn_criar_servico_from_pcp` | ENABLED |
| `produto_imagens` | `trg_produto_imagens_touch` | BEFORE | UPDATE | `alissonerp.fn_produto_imagens_touch` | ENABLED |
| `produto_personalizacao` | `trg_produto_personalizacao_touch_updated` | BEFORE | UPDATE | `alissonerp.tg_produto_personalizacao_touch_updated` | ENABLED |
| `protocolos` | `trg_audit_protocolos` | AFTER | INSERT,DELETE,UPDATE | `alissonerp.fn_audit_log` | ENABLED |
| `protocolos` | `trg_concluir_protocolo` | BEFORE | UPDATE | `alissonerp.fn_concluir_protocolo` | ENABLED |
| `saidas_ordem` | `trg_after_saida_ordem` | AFTER | INSERT | `alissonerp.fn_processar_saida_ordem` | ENABLED |
| `site_config` | `trg_site_config_updated_at` | BEFORE | UPDATE | `alissonerp.fn_touch_updated_at` | ENABLED |
| `site_produtos` | `trg_site_produtos_updated_at` | BEFORE | UPDATE | `alissonerp.fn_touch_updated_at` | ENABLED |
| `tarefas` | `trg_updated_at_tarefas` | BEFORE | UPDATE | `alissonerp.fn_updated_at_tarefas` | ENABLED |
| `transferencias_ordem` | `trg_after_transferencia_ordem` | AFTER | INSERT,UPDATE | `alissonerp.fn_processar_transferencia` | ENABLED |
| `user_views` | `trg_user_views_touch` | BEFORE | UPDATE | `alissonerp.fn_user_views_touch_updated` | ENABLED |
| `vendas_erp` | `trg_aa_proteger_venda_fechada` | BEFORE | UPDATE | `alissonerp.fn_proteger_venda_fechada` | DISABLED |
| `vendas_erp` | `trg_bloquear_venda` | BEFORE | UPDATE | `alissonerp.fn_bloquear_venda` | ENABLED |
| `vendas_erp` | `trg_estoque_comercial_cancelamento_venda` | BEFORE | UPDATE | `alissonerp.fn_estoque_comercial_cancelamento_venda` | ENABLED |
| `vendas_erp` | `trg_estoque_comercial_entrega_venda` | BEFORE | UPDATE | `alissonerp.fn_estoque_comercial_entrega_venda` | ENABLED |
| `vendas_erp` | `trg_updated_at_vendas_erp` | BEFORE | UPDATE | `alissonerp.fn_updated_at_vendas_erp` | ENABLED |
| `vendas_erp` | `trg_venda_cancelar_conta_receber` | BEFORE | UPDATE | `alissonerp.fn_venda_cancelar_conta_receber` | ENABLED |
| `vendas_erp` | `trg_venda_gerar_conta_receber` | AFTER | UPDATE | `alissonerp.fn_venda_gerar_conta_receber` | ENABLED |
| `vendas_erp` | `trg_venda_gerar_conta_receber_insert` | AFTER | INSERT | `alissonerp.fn_venda_gerar_conta_receber_on_insert` | ENABLED |

## Definições completas

### `apontamentos_distribuicao.trg_after_insert_apontamento_dist`

```sql
CREATE TRIGGER trg_after_insert_apontamento_dist AFTER INSERT ON alissonerp.apontamentos_distribuicao FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_apontamento_dist()
```

### `apontamentos_pcp.trg_after_insert_apontamento_pcp`

```sql
CREATE TRIGGER trg_after_insert_apontamento_pcp AFTER INSERT ON alissonerp.apontamentos_pcp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_apontamento_pcp()
```

### `aprovacoes_consultora.trg_aprovacao_entrega`

```sql
CREATE TRIGGER trg_aprovacao_entrega AFTER UPDATE ON alissonerp.aprovacoes_consultora FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_aprovacao_para_entrega()
```

### `auditorias.trg_processar_auditoria`

```sql
CREATE TRIGGER trg_processar_auditoria BEFORE UPDATE ON alissonerp.auditorias FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_auditoria()
```

### `compras.trg_aa_bloquear_compra`

```sql
CREATE TRIGGER trg_aa_bloquear_compra BEFORE UPDATE ON alissonerp.compras FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_bloquear_compra()
```

### `compras.trg_compra_gerar_conta_pagar`

```sql
CREATE TRIGGER trg_compra_gerar_conta_pagar AFTER UPDATE ON alissonerp.compras FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_compra_gerar_conta_pagar()
```

### `compras.trg_concluir_compra`

```sql
CREATE TRIGGER trg_concluir_compra BEFORE UPDATE ON alissonerp.compras FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_compra()
```

### `curva_categorias.trg_curva_categorias_updated_at`

```sql
CREATE TRIGGER trg_curva_categorias_updated_at BEFORE UPDATE ON alissonerp.curva_categorias FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_curva_touch_updated_at()
```

### `curva_config.trg_curva_config_updated_at`

```sql
CREATE TRIGGER trg_curva_config_updated_at BEFORE UPDATE ON alissonerp.curva_config FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_curva_touch_updated_at()
```

### `devolucoes_venda.trg_devolucoes_updated_at`

```sql
CREATE TRIGGER trg_devolucoes_updated_at BEFORE UPDATE ON alissonerp.devolucoes_venda FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_devolucoes_updated_at()
```

### `distribuicao_ordens.trg_after_insert_distribuicao_ordem`

```sql
CREATE TRIGGER trg_after_insert_distribuicao_ordem AFTER INSERT ON alissonerp.distribuicao_ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_criar_fechamento_por_ordem()
```

### `distribuicoes.trg_audit_distribuicoes`

```sql
CREATE TRIGGER trg_audit_distribuicoes AFTER INSERT OR DELETE OR UPDATE ON alissonerp.distribuicoes FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log()
```

### `distribuicoes.trg_concluir_distribuicao`

```sql
CREATE TRIGGER trg_concluir_distribuicao BEFORE UPDATE ON alissonerp.distribuicoes FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_distribuicao()
```

### `estoque_comercial_config.trg_update_estoque_comercial_config_ts`

```sql
CREATE TRIGGER trg_update_estoque_comercial_config_ts BEFORE UPDATE ON alissonerp.estoque_comercial_config FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts()
```

### `fechamentos_distribuicao.trg_fechamento_distribuicao`

```sql
CREATE TRIGGER trg_fechamento_distribuicao AFTER INSERT OR UPDATE ON alissonerp.fechamentos_distribuicao FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_fechamento_dist()
```

### `fornecedores.trg_fornecedores_updated_at`

```sql
CREATE TRIGGER trg_fornecedores_updated_at BEFORE UPDATE ON alissonerp.fornecedores FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at()
```

### `insumos.trg_calcular_peso_pedra`

```sql
CREATE TRIGGER trg_calcular_peso_pedra BEFORE INSERT OR UPDATE ON alissonerp.insumos FOR EACH ROW WHEN (new.categoria_id = 2) EXECUTE FUNCTION alissonerp.fn_calcular_peso_pedra_gramas()
```

### `itens_compra.trg_calcular_item_compra`

```sql
CREATE TRIGGER trg_calcular_item_compra BEFORE INSERT OR UPDATE ON alissonerp.itens_compra FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_calcular_item_compra()
```

### `itens_venda_erp.trg_estoque_comercial_baixa_venda`

```sql
CREATE TRIGGER trg_estoque_comercial_baixa_venda AFTER INSERT ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()
```

### `itens_venda_erp.trg_estoque_comercial_reversao_item`

```sql
CREATE TRIGGER trg_estoque_comercial_reversao_item AFTER DELETE ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_estoque_comercial_reversao_item()
```

### `itens_venda_erp.trg_estoque_comercial_update_qtd_item`

```sql
CREATE TRIGGER trg_estoque_comercial_update_qtd_item AFTER UPDATE ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_estoque_comercial_update_qtd_item()
```

### `itens_venda_erp.trg_proteger_insert_itens_venda_fechada`

```sql
CREATE TRIGGER trg_proteger_insert_itens_venda_fechada BEFORE INSERT ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
```

### `itens_venda_erp.trg_proteger_itens_venda_fechada`

```sql
CREATE TRIGGER trg_proteger_itens_venda_fechada BEFORE DELETE OR UPDATE ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
```

### `itens_venda_erp.trg_recalcular_totais_venda`

```sql
CREATE TRIGGER trg_recalcular_totais_venda AFTER INSERT OR DELETE OR UPDATE ON alissonerp.itens_venda_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_recalcular_totais_venda()
```

### `joias_rfid.trg_joias_rfid_touch_updated`

```sql
CREATE TRIGGER trg_joias_rfid_touch_updated BEFORE UPDATE ON alissonerp.joias_rfid FOR EACH ROW EXECUTE FUNCTION alissonerp.tg_joias_rfid_touch_updated()
```

### `lancamentos_avulso.trg_lancamento_avulso`

```sql
CREATE TRIGGER trg_lancamento_avulso AFTER INSERT ON alissonerp.lancamentos_avulso FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_lancamento_avulso()
```

### `movimentacoes_estoque.trg_audit_mov_estoque`

```sql
CREATE TRIGGER trg_audit_mov_estoque AFTER INSERT ON alissonerp.movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log()
```

### `mp_point_devices.trg_updated_at_mp_point_devices`

```sql
CREATE TRIGGER trg_updated_at_mp_point_devices BEFORE UPDATE ON alissonerp.mp_point_devices FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_mp_point_devices()
```

### `ordens.trg_audit_ordens`

```sql
CREATE TRIGGER trg_audit_ordens AFTER INSERT OR DELETE OR UPDATE ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log()
```

### `ordens.trg_auto_auditoria_loja`

```sql
CREATE TRIGGER trg_auto_auditoria_loja AFTER INSERT ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_auto_auditoria_loja()
```

### `ordens.trg_cancelar_pcp_ordem`

```sql
CREATE TRIGGER trg_cancelar_pcp_ordem AFTER UPDATE OF status ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_cancelar_pcp_ordem()
```

### `ordens.trg_ordens_proteger_pdv`

```sql
CREATE TRIGGER trg_ordens_proteger_pdv BEFORE UPDATE ON alissonerp.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_proteger_campos_pdv()
```

### `outros_insumos_distribuicao.trg_after_insert_outros_insumos_dist`

```sql
CREATE TRIGGER trg_after_insert_outros_insumos_dist AFTER INSERT ON alissonerp.outros_insumos_distribuicao FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_outros_insumos_dist()
```

### `outros_insumos_pcp.trg_after_insert_outros_insumos_pcp`

```sql
CREATE TRIGGER trg_after_insert_outros_insumos_pcp AFTER INSERT ON alissonerp.outros_insumos_pcp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_outros_insumos_pcp()
```

### `parametros_sistema.trg_atualizar_parametros_sistema`

```sql
CREATE TRIGGER trg_atualizar_parametros_sistema BEFORE UPDATE ON alissonerp.parametros_sistema FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_atualizar_parametros_sistema()
```

### `pcp.trg_audit_pcp`

```sql
CREATE TRIGGER trg_audit_pcp AFTER INSERT OR DELETE OR UPDATE ON alissonerp.pcp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log()
```

### `pcp.trg_criar_servico_from_pcp`

```sql
CREATE TRIGGER trg_criar_servico_from_pcp AFTER INSERT ON alissonerp.pcp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_criar_servico_from_pcp()
```

### `produto_imagens.trg_produto_imagens_touch`

```sql
CREATE TRIGGER trg_produto_imagens_touch BEFORE UPDATE ON alissonerp.produto_imagens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_produto_imagens_touch()
```

### `produto_personalizacao.trg_produto_personalizacao_touch_updated`

```sql
CREATE TRIGGER trg_produto_personalizacao_touch_updated BEFORE UPDATE ON alissonerp.produto_personalizacao FOR EACH ROW EXECUTE FUNCTION alissonerp.tg_produto_personalizacao_touch_updated()
```

### `protocolos.trg_audit_protocolos`

```sql
CREATE TRIGGER trg_audit_protocolos AFTER INSERT OR DELETE OR UPDATE ON alissonerp.protocolos FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_audit_log()
```

### `protocolos.trg_concluir_protocolo`

```sql
CREATE TRIGGER trg_concluir_protocolo BEFORE UPDATE ON alissonerp.protocolos FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_protocolo()
```

### `saidas_ordem.trg_after_saida_ordem`

```sql
CREATE TRIGGER trg_after_saida_ordem AFTER INSERT ON alissonerp.saidas_ordem FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_saida_ordem()
```

### `site_config.trg_site_config_updated_at`

```sql
CREATE TRIGGER trg_site_config_updated_at BEFORE UPDATE ON alissonerp.site_config FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at()
```

### `site_produtos.trg_site_produtos_updated_at`

```sql
CREATE TRIGGER trg_site_produtos_updated_at BEFORE UPDATE ON alissonerp.site_produtos FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at()
```

### `tarefas.trg_updated_at_tarefas`

```sql
CREATE TRIGGER trg_updated_at_tarefas BEFORE UPDATE ON alissonerp.tarefas FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_tarefas()
```

### `transferencias_ordem.trg_after_transferencia_ordem`

```sql
CREATE TRIGGER trg_after_transferencia_ordem AFTER INSERT OR UPDATE ON alissonerp.transferencias_ordem FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_transferencia()
```

### `user_views.trg_user_views_touch`

```sql
CREATE TRIGGER trg_user_views_touch BEFORE UPDATE ON alissonerp.user_views FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_user_views_touch_updated()
```

### `vendas_erp.trg_aa_proteger_venda_fechada`

```sql
CREATE TRIGGER trg_aa_proteger_venda_fechada BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_proteger_venda_fechada()
```

### `vendas_erp.trg_bloquear_venda`

```sql
CREATE TRIGGER trg_bloquear_venda BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_bloquear_venda()
```

### `vendas_erp.trg_estoque_comercial_cancelamento_venda`

```sql
CREATE TRIGGER trg_estoque_comercial_cancelamento_venda BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_estoque_comercial_cancelamento_venda()
```

### `vendas_erp.trg_estoque_comercial_entrega_venda`

```sql
CREATE TRIGGER trg_estoque_comercial_entrega_venda BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
```

### `vendas_erp.trg_updated_at_vendas_erp`

```sql
CREATE TRIGGER trg_updated_at_vendas_erp BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_vendas_erp()
```

### `vendas_erp.trg_venda_cancelar_conta_receber`

```sql
CREATE TRIGGER trg_venda_cancelar_conta_receber BEFORE UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_venda_cancelar_conta_receber()
```

### `vendas_erp.trg_venda_gerar_conta_receber`

```sql
CREATE TRIGGER trg_venda_gerar_conta_receber AFTER UPDATE ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
```

### `vendas_erp.trg_venda_gerar_conta_receber_insert`

```sql
CREATE TRIGGER trg_venda_gerar_conta_receber_insert AFTER INSERT ON alissonerp.vendas_erp FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_venda_gerar_conta_receber_on_insert()
```

