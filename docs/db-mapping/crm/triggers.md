# `crm` — Triggers

> 31 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `agentes_ia` | `trg_agentes_ia_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `agentes_ia` | `trg_audit_agentes_ia` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `automacao_etapas` | `trg_automacao_etapas_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `automacoes` | `trg_audit_automacoes` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `automacoes` | `trg_automacoes_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `brechas` | `trg_audit_brechas` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `brechas` | `trg_brechas_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `config_geral` | `trg_audit_config_geral` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `config_geral` | `trg_config_geral_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `contato_canais` | `trg_contato_canais_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `conversas` | `trg_audit_conversas` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `conversas` | `trg_conversas_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `funil_blocos` | `trg_audit_funil_blocos` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `funil_blocos` | `trg_funil_blocos_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `funil_etapas` | `trg_audit_funil_etapas` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `funil_etapas` | `trg_funil_etapas_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `funis` | `trg_funis_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `instagram_posts` | `trg_instagram_posts_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `kommo_config` | `trg_audit_kommo_config` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `kommo_config` | `trg_kommo_config_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `mensagens` | `trg_mensagens_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `meta_config` | `trg_audit_meta_config` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `meta_config` | `trg_meta_config_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `oportunidades` | `trg_oportunidades_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `prompt_templates` | `trg_audit_prompt_templates` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `prompt_templates` | `trg_prompt_templates_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `tarefas` | `trg_audit_tarefas` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `tarefas` | `trg_tarefas_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `unipile_config` | `trg_audit_unipile_config` | AFTER | INSERT,DELETE,UPDATE | `crm.audit_trigger` | ENABLED |
| `unipile_config` | `trg_unipile_config_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |
| `webhook_config` | `trg_webhook_config_updated` | BEFORE | UPDATE | `crm.set_updated_at` | ENABLED |

## Definições completas

### `agentes_ia.trg_agentes_ia_updated`

```sql
CREATE TRIGGER trg_agentes_ia_updated BEFORE UPDATE ON crm.agentes_ia FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `agentes_ia.trg_audit_agentes_ia`

```sql
CREATE TRIGGER trg_audit_agentes_ia AFTER INSERT OR DELETE OR UPDATE ON crm.agentes_ia FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `automacao_etapas.trg_automacao_etapas_updated`

```sql
CREATE TRIGGER trg_automacao_etapas_updated BEFORE UPDATE ON crm.automacao_etapas FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `automacoes.trg_audit_automacoes`

```sql
CREATE TRIGGER trg_audit_automacoes AFTER INSERT OR DELETE OR UPDATE ON crm.automacoes FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `automacoes.trg_automacoes_updated`

```sql
CREATE TRIGGER trg_automacoes_updated BEFORE UPDATE ON crm.automacoes FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `brechas.trg_audit_brechas`

```sql
CREATE TRIGGER trg_audit_brechas AFTER INSERT OR DELETE OR UPDATE ON crm.brechas FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `brechas.trg_brechas_updated`

```sql
CREATE TRIGGER trg_brechas_updated BEFORE UPDATE ON crm.brechas FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `config_geral.trg_audit_config_geral`

```sql
CREATE TRIGGER trg_audit_config_geral AFTER INSERT OR DELETE OR UPDATE ON crm.config_geral FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `config_geral.trg_config_geral_updated`

```sql
CREATE TRIGGER trg_config_geral_updated BEFORE UPDATE ON crm.config_geral FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `contato_canais.trg_contato_canais_updated`

```sql
CREATE TRIGGER trg_contato_canais_updated BEFORE UPDATE ON crm.contato_canais FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `conversas.trg_audit_conversas`

```sql
CREATE TRIGGER trg_audit_conversas AFTER INSERT OR DELETE OR UPDATE ON crm.conversas FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `conversas.trg_conversas_updated`

```sql
CREATE TRIGGER trg_conversas_updated BEFORE UPDATE ON crm.conversas FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `funil_blocos.trg_audit_funil_blocos`

```sql
CREATE TRIGGER trg_audit_funil_blocos AFTER INSERT OR DELETE OR UPDATE ON crm.funil_blocos FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `funil_blocos.trg_funil_blocos_updated`

```sql
CREATE TRIGGER trg_funil_blocos_updated BEFORE UPDATE ON crm.funil_blocos FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `funil_etapas.trg_audit_funil_etapas`

```sql
CREATE TRIGGER trg_audit_funil_etapas AFTER INSERT OR DELETE OR UPDATE ON crm.funil_etapas FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `funil_etapas.trg_funil_etapas_updated`

```sql
CREATE TRIGGER trg_funil_etapas_updated BEFORE UPDATE ON crm.funil_etapas FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `funis.trg_funis_updated`

```sql
CREATE TRIGGER trg_funis_updated BEFORE UPDATE ON crm.funis FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `instagram_posts.trg_instagram_posts_updated`

```sql
CREATE TRIGGER trg_instagram_posts_updated BEFORE UPDATE ON crm.instagram_posts FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `kommo_config.trg_audit_kommo_config`

```sql
CREATE TRIGGER trg_audit_kommo_config AFTER INSERT OR DELETE OR UPDATE ON crm.kommo_config FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `kommo_config.trg_kommo_config_updated`

```sql
CREATE TRIGGER trg_kommo_config_updated BEFORE UPDATE ON crm.kommo_config FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `mensagens.trg_mensagens_updated`

```sql
CREATE TRIGGER trg_mensagens_updated BEFORE UPDATE ON crm.mensagens FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `meta_config.trg_audit_meta_config`

```sql
CREATE TRIGGER trg_audit_meta_config AFTER INSERT OR DELETE OR UPDATE ON crm.meta_config FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `meta_config.trg_meta_config_updated`

```sql
CREATE TRIGGER trg_meta_config_updated BEFORE UPDATE ON crm.meta_config FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `oportunidades.trg_oportunidades_updated`

```sql
CREATE TRIGGER trg_oportunidades_updated BEFORE UPDATE ON crm.oportunidades FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `prompt_templates.trg_audit_prompt_templates`

```sql
CREATE TRIGGER trg_audit_prompt_templates AFTER INSERT OR DELETE OR UPDATE ON crm.prompt_templates FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `prompt_templates.trg_prompt_templates_updated`

```sql
CREATE TRIGGER trg_prompt_templates_updated BEFORE UPDATE ON crm.prompt_templates FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `tarefas.trg_audit_tarefas`

```sql
CREATE TRIGGER trg_audit_tarefas AFTER INSERT OR DELETE OR UPDATE ON crm.tarefas FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `tarefas.trg_tarefas_updated`

```sql
CREATE TRIGGER trg_tarefas_updated BEFORE UPDATE ON crm.tarefas FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `unipile_config.trg_audit_unipile_config`

```sql
CREATE TRIGGER trg_audit_unipile_config AFTER INSERT OR DELETE OR UPDATE ON crm.unipile_config FOR EACH ROW EXECUTE FUNCTION crm.audit_trigger()
```

### `unipile_config.trg_unipile_config_updated`

```sql
CREATE TRIGGER trg_unipile_config_updated BEFORE UPDATE ON crm.unipile_config FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

### `webhook_config.trg_webhook_config_updated`

```sql
CREATE TRIGGER trg_webhook_config_updated BEFORE UPDATE ON crm.webhook_config FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at()
```

