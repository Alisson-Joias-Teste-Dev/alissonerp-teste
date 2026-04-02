# Projeto: Automação Financeira — Conciliação Bancária (Alisson Joias)

## Status: TRAVADO — aguardando token Tiny API v2

## Ponto Exato Onde Parou
O workflow n8n roda e completa com sucesso (status: success), o banco de dados é atualizado corretamente, mas o nó "Baixar no Tiny" está falhando silenciosamente (continueOnFail=true esconde o erro). As contas ficam como `pago` no nosso BD mas continuam **abertas no Tiny ERP**.

**Próximo passo:** Confirmar se a credencial "TINY API LOJA V2" no n8n tem um token válido. Se não tiver, pegar o token Tiny API v2 (não OAuth2) e testar uma chamada direta.

---

## Infraestrutura

| Serviço | URL/Endereço |
|---------|-------------|
| PostgreSQL | 72.60.55.140:5543, db: postgres, user: postgres |
| Senha DB | V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA |
| Directus | https://base.alissonranyel.com.br |
| Token Directus | JqEPp9fYa8Bzv9Xa_lUaqNRiDypaNQFr |
| n8n | https://etl.alissonranyel.com.br |
| n8n API Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ZDBlNjAzOS1jYzMxLTQzY2QtYWFjMy1iODcwNzQ1NjY3MGUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZWJjNzBhNjYtM2IyOS00MzU3LWI2NmYtODIzMTk1YzZmNzY2IiwiaWF0IjoxNzcyNjUyMjY1LCJleHAiOjE3NzUxODg4MDB9.3r8oxU1narRKqSOvWo7B3GZac_eEcV7RYmNTNOH1CqM |

## Workflows n8n

| ID | Nome | Status |
|----|------|--------|
| x0iOJUHmtXDdn1lB | Financeiro: Processar Extrato OFX | Ativo |
| hcYvVvOwQlhRUPCK | Financeiro: Confirmar Divergencia | Ativo |

## Credenciais n8n Relevantes

| ID | Nome | Tipo |
|----|------|------|
| tOCiqkPt6U5LZHEE | Supabase - Alisson Joias | postgres |
| OjBQwa6M4vyBDA4Z | TINY API LOJA V2 | httpQueryAuth (token v2) |
| dyqOPAo3JAOnZMoF | TINY ALISSON LOJA | oAuth2Api (v3 — NÃO usar para baixar) |

## Banco de Dados — Tabelas Criadas (schema: public)

- `fin_extratos_bancarios` — controle dos extratos OFX
- `fin_lancamentos_bancarios` — lançamentos individuais (UNIQUE extrato_id+fitid)
- `fin_conciliacoes` — resultado do matching (status: confirmado/divergente)
- `fin_divergencias_pendentes` — VIEW, só divergentes, é o que Esmeralda vê

## Função SQL
- `fin_auto_conciliar(p_extrato_id BIGINT)` — algoritmo de matching
  - Tolerância: ±1% do valor (mín R$0,50), janela ±5 dias
  - Confirmado: diff < R$0,01 → marca contas_a_pagar.situacao = 'pago'
  - Divergente: diff > R$0,01 mas dentro da tolerância → vai para revisão

## Directus Flows

| ID | Nome | Trigger | Ação |
|----|------|---------|------|
| fa75c0b9-... | Processar OFX | items.create em fin_extratos_bancarios | POST n8n /webhook/processar-ofx |
| 36a2b1dd-... | Confirmar Divergência | Manual em fin_divergencias_pendentes | POST n8n /webhook/confirmar-divergencia |

**Payload do webhook (camelCase obrigatório):**
```json
{"extratoId": 6, "banco": "Itau", "arquivoId": "uuid-do-arquivo", "nomeArquivo": "arquivo.ofx"}
```

## Arquivo OFX de Teste
- Arquivo: `C:\Users\jonat\Downloads\Extrato_2639_978978_04-03-2026.ofx`
- Directus File ID: `988d793a-c450-4487-901d-93c13fbc5c7b`
- Banco: Itaú (BANKID: 0341), conta 2639978978
- Extrato ID no BD: 6 (status: concluido, 25 importados, 9 conciliados, 5 divergentes)

## Tiny API — Descoberta Importante
- **API v3 NÃO tem endpoint de baixar conta a pagar** (só para contas-receber)
- Endpoint v2 usado: `POST https://api.tiny.com.br/api2/contas.pagar.alterar.php`
- Params: `token={api_key}&formato=json&id={tiny_id}&situacao=pago&dataPagamento={data}`
- Campo do tiny_id na tabela: `contas_a_pagar.id_api_conta`

## Asana — Task Criada
- Projeto: Roadmap Tech (GID: 1211230435595187)
- Task principal: GID 1213548591084418
- Subtarefas (converter manualmente no Asana):
  - 1213548624829869 — Planejamento e Arquitetura
  - 1213548615008153 — Banco de Dados
  - 1213548613324732 — Directus
  - 1213513071564930 — n8n Workflows
  - 1213548635977565 — Integração Tiny API
  - 1213548643939346 — Testes e Validação

## Scripts Locais
- `C:\Users\jonat\criar_n8n_workflows.py` — criação dos workflows
- `C:\Users\jonat\organizar_directus.py` — organização do menu Directus
