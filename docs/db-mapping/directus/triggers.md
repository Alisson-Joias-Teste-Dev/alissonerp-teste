# `directus` — Triggers

> 20 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `apontamento` | `trigger_soma_metal` | AFTER | INSERT,DELETE,UPDATE | `directus.atualizar_total_metal_pcp` | ENABLED |
| `aprovar_consultora` | `trg_concl_preparando` | BEFORE | INSERT,UPDATE | `directus.fn_atualizar_conclusao_universal` | ENABLED |
| `auditar_financeiro` | `trg_concl_financeiro` | BEFORE | UPDATE | `directus.fn_atualizar_conclusao_universal` | ENABLED |
| `auditar_financeiro` | `trg_concl_preparando` | BEFORE | INSERT,UPDATE | `directus.fn_atualizar_conclusao_universal` | ENABLED |
| `itens_ordem_compra` | `trg_calc_peso_ourofino` | BEFORE | INSERT,UPDATE | `directus.calc_peso_ourofino` | ENABLED |
| `itens_ordem_compra` | `trg_totais_ordem_compra` | AFTER | INSERT,DELETE,UPDATE | `directus.calc_totais_ordem_compra` | ENABLED |
| `ordem_comentario_mencoes` | `trigger_criar_notificacao_mencao` | AFTER | INSERT | `public.criar_notificacao_mencao` | ENABLED |
| `ordem_comentarios` | `trg_upd_ordens_comentarios` | BEFORE | UPDATE | `directus.fn_ordens_comentarios_update_date_column` | ENABLED |
| `ordens_estoque` | `trg_set_numero_ordem` | BEFORE | INSERT | `directus.func_gerar_numero_ordem` | ENABLED |
| `ordens` | `trg_ponte_ordens` | AFTER | INSERT,UPDATE | `alissonerp.fn_ponte_directus_para_alissonerp` | ENABLED |
| `ordens` | `trg_preencher_numero_ordem` | BEFORE | INSERT | `directus.preencher_numero_ordem` | ENABLED |
| `ordens` | `trigger_nova_ordem` | AFTER | INSERT,UPDATE | `public.notificar_nova_ordem` | ENABLED |
| `outros_insumos` | `trigger_soma_outros_insumos` | AFTER | INSERT,DELETE,UPDATE | `directus.atualizar_outros_pesos_pcp` | ENABLED |
| `pcp` | `trg_atualiza_peso_unitario` | BEFORE | INSERT,UPDATE | `directus.calcular_peso_unitario_pcp` | ENABLED |
| `pcp` | `trigger_calc_total_geral` | BEFORE | INSERT,UPDATE | `directus.calcular_total_geral_pcp` | ENABLED |
| `pedras_ordens` | `trigger_soma_pedras` | AFTER | INSERT,DELETE,UPDATE | `directus.atualizar_totais_pedras_pcp` | ENABLED |
| `preparando_entrega` | `trg_concl_preparando` | BEFORE | INSERT,UPDATE | `directus.fn_atualizar_conclusao_universal` | ENABLED |
| `preparando_entrega` | `trg_vinculo_entrega_ordem` | AFTER | UPDATE | `public.fn_atualizar_ordem_por_entrega` | ENABLED |
| `preparando_entrega` | `trg_vinculo_ordens` | AFTER | UPDATE | `directus.fn_vinculo_entrega_ordens` | ENABLED |
| `protocolo_loja` | `trg_concl_preparando` | BEFORE | INSERT,UPDATE | `directus.fn_atualizar_conclusao_universal` | ENABLED |

## Definições completas

### `apontamento.trigger_soma_metal`

```sql
CREATE TRIGGER trigger_soma_metal AFTER INSERT OR DELETE OR UPDATE ON directus.apontamento FOR EACH ROW EXECUTE FUNCTION directus.atualizar_total_metal_pcp()
```

### `aprovar_consultora.trg_concl_preparando`

```sql
CREATE TRIGGER trg_concl_preparando BEFORE INSERT OR UPDATE ON directus.aprovar_consultora FOR EACH ROW EXECUTE FUNCTION directus.fn_atualizar_conclusao_universal('etapas', '3')
```

### `auditar_financeiro.trg_concl_financeiro`

```sql
CREATE TRIGGER trg_concl_financeiro BEFORE UPDATE OF situacao ON directus.auditar_financeiro FOR EACH ROW EXECUTE FUNCTION directus.fn_atualizar_conclusao_universal('situacao', '2')
```

### `auditar_financeiro.trg_concl_preparando`

```sql
CREATE TRIGGER trg_concl_preparando BEFORE INSERT OR UPDATE ON directus.auditar_financeiro FOR EACH ROW EXECUTE FUNCTION directus.fn_atualizar_conclusao_universal('situacao', '2')
```

### `itens_ordem_compra.trg_calc_peso_ourofino`

```sql
CREATE TRIGGER trg_calc_peso_ourofino BEFORE INSERT OR UPDATE OF peso_ouro18, fator ON directus.itens_ordem_compra FOR EACH ROW EXECUTE FUNCTION directus.calc_peso_ourofino()
```

### `itens_ordem_compra.trg_totais_ordem_compra`

```sql
CREATE TRIGGER trg_totais_ordem_compra AFTER INSERT OR DELETE OR UPDATE ON directus.itens_ordem_compra FOR EACH ROW EXECUTE FUNCTION directus.calc_totais_ordem_compra()
```

### `ordem_comentario_mencoes.trigger_criar_notificacao_mencao`

```sql
CREATE TRIGGER trigger_criar_notificacao_mencao AFTER INSERT ON directus.ordem_comentario_mencoes FOR EACH ROW EXECUTE FUNCTION criar_notificacao_mencao()
```

### `ordem_comentarios.trg_upd_ordens_comentarios`

```sql
CREATE TRIGGER trg_upd_ordens_comentarios BEFORE UPDATE ON directus.ordem_comentarios FOR EACH ROW EXECUTE FUNCTION directus.fn_ordens_comentarios_update_date_column()
```

### `ordens_estoque.trg_set_numero_ordem`

```sql
CREATE TRIGGER trg_set_numero_ordem BEFORE INSERT ON directus.ordens_estoque FOR EACH ROW EXECUTE FUNCTION directus.func_gerar_numero_ordem()
```

### `ordens.trg_ponte_ordens`

```sql
CREATE TRIGGER trg_ponte_ordens AFTER INSERT OR UPDATE ON directus.ordens FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
```

### `ordens.trg_preencher_numero_ordem`

```sql
CREATE TRIGGER trg_preencher_numero_ordem BEFORE INSERT ON directus.ordens FOR EACH ROW EXECUTE FUNCTION directus.preencher_numero_ordem()
```

### `ordens.trigger_nova_ordem`

```sql
CREATE TRIGGER trigger_nova_ordem AFTER INSERT OR UPDATE ON directus.ordens FOR EACH ROW EXECUTE FUNCTION notificar_nova_ordem()
```

### `outros_insumos.trigger_soma_outros_insumos`

```sql
CREATE TRIGGER trigger_soma_outros_insumos AFTER INSERT OR DELETE OR UPDATE ON directus.outros_insumos FOR EACH ROW EXECUTE FUNCTION directus.atualizar_outros_pesos_pcp()
```

### `pcp.trg_atualiza_peso_unitario`

```sql
CREATE TRIGGER trg_atualiza_peso_unitario BEFORE INSERT OR UPDATE ON directus.pcp FOR EACH ROW EXECUTE FUNCTION directus.calcular_peso_unitario_pcp()
```

### `pcp.trigger_calc_total_geral`

```sql
CREATE TRIGGER trigger_calc_total_geral BEFORE INSERT OR UPDATE ON directus.pcp FOR EACH ROW EXECUTE FUNCTION directus.calcular_total_geral_pcp()
```

### `pedras_ordens.trigger_soma_pedras`

```sql
CREATE TRIGGER trigger_soma_pedras AFTER INSERT OR DELETE OR UPDATE ON directus.pedras_ordens FOR EACH ROW EXECUTE FUNCTION directus.atualizar_totais_pedras_pcp()
```

### `preparando_entrega.trg_concl_preparando`

```sql
CREATE TRIGGER trg_concl_preparando BEFORE INSERT OR UPDATE ON directus.preparando_entrega FOR EACH ROW EXECUTE FUNCTION directus.fn_atualizar_conclusao_universal('etapas', '3')
```

### `preparando_entrega.trg_vinculo_entrega_ordem`

```sql
CREATE TRIGGER trg_vinculo_entrega_ordem AFTER UPDATE OF etapas ON directus.preparando_entrega FOR EACH ROW EXECUTE FUNCTION fn_atualizar_ordem_por_entrega('3')
```

### `preparando_entrega.trg_vinculo_ordens`

```sql
CREATE TRIGGER trg_vinculo_ordens AFTER UPDATE OF etapas ON directus.preparando_entrega FOR EACH ROW EXECUTE FUNCTION directus.fn_vinculo_entrega_ordens('3')
```

### `protocolo_loja.trg_concl_preparando`

```sql
CREATE TRIGGER trg_concl_preparando BEFORE INSERT OR UPDATE ON directus.protocolo_loja FOR EACH ROW EXECUTE FUNCTION directus.fn_atualizar_conclusao_universal('etapas', '3')
```

