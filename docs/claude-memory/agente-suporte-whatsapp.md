# Agente de Suporte WhatsApp

## Stack
- WhatsApp: Evolution API (VPS própria)
- Orquestrador: n8n (https://etl.alissonranyel.com.br)
- LLM: Gemini 2.0 Flash (gratuito, function calling)
- Banco: Supabase self-hosted (PostgreSQL)
  - Host: 72.60.55.140 | Porta: 5543 | DB: postgres | User: postgres
- MCP n8n: configurado em settings.json (supergateway)
- MCP postgres: configurado em settings.json (@modelcontextprotocol/server-postgres)

## Status
- [x] Estrutura e fluxos definidos
- [x] Tabela `public.suporte_conversas` criada no banco
- [ ] Workflows n8n (próximo passo após reiniciar Claude Code)

## Tabelas do banco
- `public.vendas` — pedidos (busca por `numero_pedido` bigint)
- `public.contatos` — clientes (busca por `cpf_cnpj`)
- `directus.ordens` — ordens de serviço (`pedido_id` → vendas.id)
- `directus.pcp` — produção (se `ordem_id` existe aqui = ordem bloqueada)
- `public.suporte_conversas` — estado das conversas do bot (CRIADA)

## Tipos de Ordem (campo tipo_ordem)
- "1" Serviço | "2" Fabricação | "3" Reposição Venda
- "4" Reposição Loja | "6" Garantia (outros fora do escopo)

## Fluxos
### Garantia (6)
- Pede número do pedido → busca vendas.numero_pedido
- Se não achar → venda antiga: pede CPF → busca contato → cria se não existir → cria venda antiga → cria ordem
- Se achar → busca ordem → verifica pcp → bloqueia se em produção

### Fabricação/Reposição (2,3,4)
- Pede número do pedido → busca venda → busca ordem
- Sem ordem → cria ordem
- Com ordem → verifica pcp → bloqueia se encontrar registro no pcp

## Escalonamento
- Nível 1: bot não resolve → envia para WhatsApp do AGENTE HUMANO
- Nível 2: agente não resolve → agente aciona manualmente o DONO
- Após escalar: `escalado = true` → bot para de responder
- Reativação: comando `/reativar {telefone}` → zera estado

## Workflows n8n (a criar)
1. wf_01_webhook_principal
2. wf_02_gemini_orquestrador (loop function calling)
3. wf_03_tool_buscar_venda
4. wf_04_tool_buscar_contato_cpf
5. wf_05_tool_criar_contato
6. wf_06_tool_criar_venda_antiga
7. wf_07_tool_buscar_ordem
8. wf_08_tool_verificar_pcp
9. wf_09_tool_criar_ou_atualizar_ordem
10. wf_10_tool_escalar_para_humano
11. wf_11_reativar_conversa (comando /reativar)

## SQL útil (node em C:/Users/jonat/tmp-pg)
```js
const { Client } = require('C:/Users/jonat/tmp-pg/node_modules/pg');
const client = new Client({ host:'72.60.55.140', port:5543, database:'postgres', user:'postgres', password:'...' });
```
