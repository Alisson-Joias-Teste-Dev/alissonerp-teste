# `public` — Triggers

> 33 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `config_orcamento_aliancas` | `set_updated_at` | BEFORE | UPDATE | `public.set_updated_at` | ENABLED |
| `contatos` | `on_contatos_update` | BEFORE | INSERT,UPDATE | `public.registrar_modificacao_contatos` | ENABLED |
| `contatos` | `Webhook Contatos Envio tiny` | AFTER | INSERT,UPDATE | `supabase_functions.http_request` | ENABLED |
| `controle_entregas` | `trigger_entregas_updated_at` | BEFORE | UPDATE | `public.update_entregas_updated_at` | ENABLED |
| `controle_entregas` | `trigger_sync_venda_entregue` | AFTER | INSERT,DELETE | `public.sync_venda_entregue` | ENABLED |
| `estoque` | `trigger_atualizar_saldo_estoque` | BEFORE | INSERT,UPDATE | `public.atualizar_saldo_estoque` | ENABLED |
| `estoque` | `webhook_estoque_insert_seguro` | AFTER | INSERT | `supabase_functions.http_request` | ENABLED |
| `estoque` | `webhook_estoque_update_seguro` | AFTER | UPDATE | `supabase_functions.http_request` | ENABLED |
| `fila_webhooks_n8n` | `trg_webhook_novo_produto` | AFTER | INSERT | `public.disparar_webhook_n8n` | ENABLED |
| `itens_venda` | `trg_proteger_delete_itens_venda` | BEFORE | DELETE | `public.fn_proteger_delete_itens_venda` | ENABLED |
| `itens_venda` | `trg_proteger_preco_itens_venda` | BEFORE | UPDATE | `public.fn_proteger_preco_itens_venda` | ENABLED |
| `itens_venda` | `trg_sync_item_venda_insert_from_public` | AFTER | INSERT | `alissonerp.fn_sync_item_venda_from_public` | ENABLED |
| `leads` | `trg_leads_update` | BEFORE | UPDATE | `public.update_data_atualizacao` | ENABLED |
| `metas_mensais` | `trigger_gerar_metas_por_hora` | AFTER | INSERT,UPDATE | `public.gerar_metas_por_hora_final` | ENABLED |
| `metas_por_hora` | `trg_definir_meta_acumulada` | BEFORE | INSERT,UPDATE | `public.definir_meta_acumulada_inicial` | ENABLED |
| `orcamento` | `trg_antes_inserir_orcamento` | BEFORE | INSERT | `public.fn_inicializar_orcamento` | ENABLED |
| `orcamento` | `trg_aprovacao_orcamento` | BEFORE | UPDATE | `public.processar_aprovacao_orcamento` | ENABLED |
| `orcamento` | `trg_gerar_numero_orcamento` | BEFORE | INSERT | `public.fn_gerar_numero_orcamento` | ENABLED |
| `parametros` | `trigger_parametros_atualizados` | AFTER | UPDATE | `public.disparar_atualizacao_produtos` | ENABLED |
| `produtos` | `on_product_update` | AFTER | UPDATE | `public.atualiza_obs_produto` | ENABLED |
| `produtos` | `on_produto_update_notify_situacao` | AFTER | UPDATE | `public.notificar_apenas_mudanca_situacao` | ENABLED |
| `produtos` | `on_produtos_update` | BEFORE | UPDATE | `public.registrar_modificacao_produtos` | ENABLED |
| `produtos` | `trg_notifica_estoque` | AFTER | UPDATE | `public.notificar_mudanca_estoque` | ENABLED |
| `produtos` | `trigger_arredondar_peso` | BEFORE | INSERT,UPDATE | `public.arredondar_peso_para_cima` | ENABLED |
| `produtos` | `trigger_atualizar_preco_produto` | BEFORE | INSERT,UPDATE | `public.atualizar_preco_produto` | ENABLED |
| `produtos` | `z_trigger_atualiza_diferenca_percentual` | BEFORE | INSERT,UPDATE | `public.calcular_diferenca_percentual` | ENABLED |
| `solicitacoes_vale_troca` | `handle_updated_at` | BEFORE | UPDATE | `public.update_entregas_updated_at` | ENABLED |
| `solicitacoes_vale_troca` | `trg_solicitacao_vale_troca` | AFTER | INSERT | `public.notify_n8n_solicitacao_vale_troca` | ENABLED |
| `vendas` | `on_update_vendas` | BEFORE | UPDATE | `public.handle_updated_at` | ENABLED |
| `vendas` | `trg_notificar_n8n` | AFTER | INSERT,UPDATE | `public.notificar_n8n_nova_venda` | ENABLED |
| `vendas` | `trg_sync_venda_insert_from_public` | AFTER | INSERT | `alissonerp.fn_sync_venda_from_public` | ENABLED |
| `vendas` | `trg_sync_venda_update_from_public` | AFTER | UPDATE | `alissonerp.fn_sync_venda_update_from_public` | ENABLED |
| `vendas` | `trg_venda_sequencial` | BEFORE | INSERT | `public.fn_gerar_venda_sequencial_manual` | ENABLED |

## Definições completas

### `config_orcamento_aliancas.set_updated_at`

```sql
CREATE TRIGGER set_updated_at BEFORE UPDATE ON config_orcamento_aliancas FOR EACH ROW EXECUTE FUNCTION set_updated_at()
```

### `contatos.on_contatos_update`

```sql
CREATE TRIGGER on_contatos_update BEFORE INSERT OR UPDATE ON contatos FOR EACH ROW EXECUTE FUNCTION registrar_modificacao_contatos()
```

### `contatos.Webhook Contatos Envio tiny`

```sql
CREATE TRIGGER "Webhook Contatos Envio tiny" AFTER INSERT OR UPDATE ON contatos FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://etl.alissonranyel.com.br/webhook/7809b5d0-7438-4186-9737-09edaf834158', 'POST', '{"Content-type":"application/json"}', '{}', '5000')
```

### `controle_entregas.trigger_entregas_updated_at`

```sql
CREATE TRIGGER trigger_entregas_updated_at BEFORE UPDATE ON controle_entregas FOR EACH ROW EXECUTE FUNCTION update_entregas_updated_at()
```

### `controle_entregas.trigger_sync_venda_entregue`

```sql
CREATE TRIGGER trigger_sync_venda_entregue AFTER INSERT OR DELETE ON controle_entregas FOR EACH ROW EXECUTE FUNCTION sync_venda_entregue()
```

### `estoque.trigger_atualizar_saldo_estoque`

```sql
CREATE TRIGGER trigger_atualizar_saldo_estoque BEFORE INSERT OR UPDATE ON estoque FOR EACH ROW EXECUTE FUNCTION atualizar_saldo_estoque()
```

### `estoque.webhook_estoque_insert_seguro`

```sql
CREATE TRIGGER webhook_estoque_insert_seguro AFTER INSERT ON estoque FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://etl.alissonranyel.com.br/webhook/fa8e0cf3-01cd-4ccb-8b7f-d6d85e413cf4', 'POST', '{"Content-type":"application/json"}', '{}', '1000')
```

### `estoque.webhook_estoque_update_seguro`

```sql
CREATE TRIGGER webhook_estoque_update_seguro AFTER UPDATE ON estoque FOR EACH ROW WHEN (old.* IS DISTINCT FROM new.*) EXECUTE FUNCTION supabase_functions.http_request('https://etl.alissonranyel.com.br/webhook/fa8e0cf3-01cd-4ccb-8b7f-d6d85e413cf4', 'POST', '{"Content-type":"application/json"}', '{}', '1000')
```

### `fila_webhooks_n8n.trg_webhook_novo_produto`

```sql
CREATE TRIGGER trg_webhook_novo_produto AFTER INSERT ON fila_webhooks_n8n FOR EACH ROW EXECUTE FUNCTION disparar_webhook_n8n()
```

### `itens_venda.trg_proteger_delete_itens_venda`

```sql
CREATE TRIGGER trg_proteger_delete_itens_venda BEFORE DELETE ON itens_venda FOR EACH ROW EXECUTE FUNCTION fn_proteger_delete_itens_venda()
```

### `itens_venda.trg_proteger_preco_itens_venda`

```sql
CREATE TRIGGER trg_proteger_preco_itens_venda BEFORE UPDATE ON itens_venda FOR EACH ROW EXECUTE FUNCTION fn_proteger_preco_itens_venda()
```

### `itens_venda.trg_sync_item_venda_insert_from_public`

```sql
CREATE TRIGGER trg_sync_item_venda_insert_from_public AFTER INSERT ON itens_venda FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_item_venda_from_public()
```

### `leads.trg_leads_update`

```sql
CREATE TRIGGER trg_leads_update BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_data_atualizacao()
```

### `metas_mensais.trigger_gerar_metas_por_hora`

```sql
CREATE TRIGGER trigger_gerar_metas_por_hora AFTER INSERT OR UPDATE ON metas_mensais FOR EACH ROW EXECUTE FUNCTION gerar_metas_por_hora_final()
```

### `metas_por_hora.trg_definir_meta_acumulada`

```sql
CREATE TRIGGER trg_definir_meta_acumulada BEFORE INSERT OR UPDATE ON metas_por_hora FOR EACH ROW EXECUTE FUNCTION definir_meta_acumulada_inicial()
```

### `orcamento.trg_antes_inserir_orcamento`

```sql
CREATE TRIGGER trg_antes_inserir_orcamento BEFORE INSERT ON orcamento FOR EACH ROW EXECUTE FUNCTION fn_inicializar_orcamento()
```

### `orcamento.trg_aprovacao_orcamento`

```sql
CREATE TRIGGER trg_aprovacao_orcamento BEFORE UPDATE OF status ON orcamento FOR EACH ROW WHEN (new.status = 2) EXECUTE FUNCTION processar_aprovacao_orcamento()
```

### `orcamento.trg_gerar_numero_orcamento`

```sql
CREATE TRIGGER trg_gerar_numero_orcamento BEFORE INSERT ON orcamento FOR EACH ROW EXECUTE FUNCTION fn_gerar_numero_orcamento()
```

### `parametros.trigger_parametros_atualizados`

```sql
CREATE TRIGGER trigger_parametros_atualizados AFTER UPDATE OF ouro, prata_manual ON parametros FOR EACH ROW EXECUTE FUNCTION disparar_atualizacao_produtos()
```

### `produtos.on_product_update`

```sql
CREATE TRIGGER on_product_update AFTER UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION atualiza_obs_produto()
```

### `produtos.on_produto_update_notify_situacao`

```sql
CREATE TRIGGER on_produto_update_notify_situacao AFTER UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION notificar_apenas_mudanca_situacao()
```

### `produtos.on_produtos_update`

```sql
CREATE TRIGGER on_produtos_update BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION registrar_modificacao_produtos()
```

### `produtos.trg_notifica_estoque`

```sql
CREATE TRIGGER trg_notifica_estoque AFTER UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION notificar_mudanca_estoque()
```

### `produtos.trigger_arredondar_peso`

```sql
CREATE TRIGGER trigger_arredondar_peso BEFORE INSERT OR UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION arredondar_peso_para_cima()
```

### `produtos.trigger_atualizar_preco_produto`

```sql
CREATE TRIGGER trigger_atualizar_preco_produto BEFORE INSERT OR UPDATE OF tipo_metal, fator, peso_precificado, markup ON produtos FOR EACH ROW EXECUTE FUNCTION atualizar_preco_produto()
```

### `produtos.z_trigger_atualiza_diferenca_percentual`

```sql
CREATE TRIGGER z_trigger_atualiza_diferenca_percentual BEFORE INSERT OR UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION calcular_diferenca_percentual()
```

### `solicitacoes_vale_troca.handle_updated_at`

```sql
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON solicitacoes_vale_troca FOR EACH ROW EXECUTE FUNCTION update_entregas_updated_at('updated_at')
```

### `solicitacoes_vale_troca.trg_solicitacao_vale_troca`

```sql
CREATE TRIGGER trg_solicitacao_vale_troca AFTER INSERT ON solicitacoes_vale_troca FOR EACH ROW EXECUTE FUNCTION notify_n8n_solicitacao_vale_troca()
```

### `vendas.on_update_vendas`

```sql
CREATE TRIGGER on_update_vendas BEFORE UPDATE ON vendas FOR EACH ROW EXECUTE FUNCTION handle_updated_at()
```

### `vendas.trg_notificar_n8n`

```sql
CREATE TRIGGER trg_notificar_n8n AFTER INSERT OR UPDATE ON vendas FOR EACH ROW EXECUTE FUNCTION notificar_n8n_nova_venda()
```

### `vendas.trg_sync_venda_insert_from_public`

```sql
CREATE TRIGGER trg_sync_venda_insert_from_public AFTER INSERT ON vendas FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_venda_from_public()
```

### `vendas.trg_sync_venda_update_from_public`

```sql
CREATE TRIGGER trg_sync_venda_update_from_public AFTER UPDATE ON vendas FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_venda_update_from_public()
```

### `vendas.trg_venda_sequencial`

```sql
CREATE TRIGGER trg_venda_sequencial BEFORE INSERT ON vendas FOR EACH ROW EXECUTE FUNCTION fn_gerar_venda_sequencial_manual()
```

