# MEMORY.md — Alisson ERP (Joalheria de Alto Padrao)

> **Referencia de dominio do projeto. Regras e pitfalls estao em `CLAUDE.md` (raiz do repo).**
> **Atualizado: 09/04/2026 (v2.19.62)**

## Memorias detalhadas
- [feedback_permissoes_banco.md](./feedback_permissoes_banco.md) — CRUD só em alissonerp; public e directus são READONLY
- [project_tela_inicial.md](./project_tela_inicial.md) — Tela inicial `/`: layout, fontes de dados, leao, favicon
- [project_user_profiles.md](./project_user_profiles.md) — Estrutura real de public.user_profiles + constraint roles + mapeamento roles ERP
- [project_storage_buckets.md](./project_storage_buckets.md) — Todos os buckets (avatars, ordem-fotos, protocolo-fotos, apontamento-fotos, imagens)
- [project_api_routes.md](./project_api_routes.md) — Mapa completo das 190 API routes
- [project_modulo_service.md](./project_modulo_service.md) — Modulo Service v2.19.x: transferencia_service_id, devolver, reprovar, transferir-fabrica, aditivo, pedras-estoque
- [project_sprint1_v2140.md](./project_sprint1_v2140.md) — Sprint 1+2 v2.14.0: migrations 094-098 (locais_estoque, pedras ct, compras expandidas)
- [reference_psql.md](./reference_psql.md) — psql no Windows: path pgAdmin, IP direto DB, como conectar via PowerShell
- [project_migracao_360.md](./project_migracao_360.md) — Plano migração 360°: 8 sistemas → fabricaAJ master. 79 workflows n8n. 8 fases. Decisões pendentes D1-D4.
- [feedback_transferencia_foto_ia.md](./feedback_transferencia_foto_ia.md) — Transferencia PCP: foto+IA obrigatoria para metal
- [feedback_conclusao_lote_sem_estoque.md](./feedback_conclusao_lote_sem_estoque.md) — Conclusao do lote: so administrativa, ZERO movimentacoes_estoque
- [feedback_buscar_ouro_recebido.md](./feedback_buscar_ouro_recebido.md) — buscarOuroRecebido: SUM(entrada)-SUM(saida), chamar ANTES das CEs de saida

---

## 1. SCHEMAS — Tabelas alissonerp (referencia)

```
── PRODUCAO ──
ordens, pcp, saidas_ordem, apontamentos_pcp, distribuicoes
tipos_apontamento (IDs 1-9 fixos)

── SUPRIMENTOS ──
insumos (251 registros, com unidade/descricao; insumos.peso_pedra_ct = peso em quilates para pedras)
categorias_insumo (8 categorias: Metal/Ouro=1, Pedras=2, Liga, Solda, Banho, Acabamento, Embalagem, Outros)
locais_estoque (id=1 Fabrica, id=2 Loja)
depositos (= operadores: Almoxarifado=1, Ourives, Laser, Banca) + local_estoque_id FK
setores (vinculados ao deposito)
controle_estoque / movimentacoes_estoque (+ local_estoque_id NOT NULL)
compras (+ local_destino_id, numero_nf, data_compra, data_recebimento, recebido_por)
itens_compra (+ unidade, peso_ct, qtd_pecas, custo_por_ct, lote_referencia, observacao)
vw_saldo_estoque: GROUP BY (deposito_id, insumo_id, local_estoque_id)
vw_detalhe_pote: inclui saldo_ct e peso_pedra_ct
vw_saldo_por_local: saldo por local_estoque + saldo_ct para pedras

── LOGISTICA ──
protocolos (foto_criacao, foto_conclusao, motoboy_id, recebedor_id, tipo_protocolo)
protocolo_ordens, protocolo_fotos
usuarios.tipos_protocolo_permitidos JSONB (["fabrica","service"])

── QUALIDADE ──
auditorias (loja + fabrica)

── COMERCIAL ──
vendas_erp (id, numero_venda, cliente_id, vendedor_id, totais, situacao, token_compartilhamento, orcamento_id)
itens_venda_erp (id, venda_id, produto_id NULLABLE, nome_produto, sku, qtd, precos, comissao, observacao)
pagamentos_venda (id, venda_id, forma, gateway, valor, parcelas, status)
faixas_comissao (31 faixas desconto→comissao)
metas_vendedoras (vendedor_id, mes, ano, meta_valor, meta_quantidade)

── ORCAMENTO ──
config_orcamento (config global: markup, desconto, precos ouro/pedras, regras, JSONB)
orcamento_fichas_tecnicas (specs alianca/pedra, pedras_detalhadas JSONB)
orcamentos (numero ORC-XXXXXX, tipo, peso, valor, status, cliente_id, foto_3d, venda_gerada_id, ordem_gerada_id)

── ESTOQUE COMERCIAL ──
estoque_comercial_config (produto_id, estoque_minimo, ativo)
movimentacoes_estoque_comercial (produto_id, tipo entrada/saida, quantidade, motivo)
vw_saldo_estoque_comercial, vw_estoque_comercial_com_alerta

── TAREFAS ──
tarefas (titulo, descricao, responsavel_id, status, prioridade, data_limite, ordem_id, tags, posicao)
comentarios_tarefa (tarefa_id, autor_id, texto)
aprovacoes_tarefa (tarefa_id, aprovador_id, decisao, motivo)
automacoes_tarefa (titulo, recorrencia diaria/semanal/mensal, responsavel_id, ativa)
automacoes_execucoes (automacao_id, tarefa_id, executado_em)

── FICHAS TECNICAS ──
fichas_tecnicas (ordem_id, tipo_item, dados JSONB) — editaveis no ERP

── SISTEMA ──
configuracoes_sistema (config IA + config preco + config integracoes)
configuracoes_secrets (API keys IA + integracoes)

── PRODUTOS ──
produto_composicao (BOM: produto_id, insumo_id, tipo, quantidade, tamanho, preco_compra_usd)
markup_pedras (faixas por tamanho: tamanho_min, tamanho_max, markup, ativo)
markup_alteracoes (fila aprovacao: tipo, faixa_id, markup_anterior, markup_novo, status=pendente|aprovado|rejeitado)
erp_produtos (pai/variacao: produto_id, sku, parent_sku, parent_id SELF-REF, eh_pai, eh_variacao, sufixo_variacao, numeracao, largura_aro, altura_aro, base, observacao_erp)
  REGRA: SKU com "-" (exceto prefixo AJ) = variacao. "1521-2"→pai=1521, sufixo=2.
  SOURCE OF TRUTH para medidas + observacao_erp
vw_produtos_erp (JOIN erp_produtos + public.produtos, inclui qtd_variacoes)
```

---

## 2. IDs CROSS-SCHEMA

```
alissonerp.ordens.id != directus.ordens.id
SEMPRE usar directus_ordem_id para cruzar
```

---

## 3. FLUXO DA ORDEM

```
PDV → [TRIGGER PONTE] → alissonerp.ordens + AUDITORIA LOJA
  tipo_ordem='servico' → forca rota='protocolo'
  lookup numero_pedido em public.vendas (NAO pedidos)

AUDITORIA LOJA (administrativo, obrigatoria)
  Aprovada + rota=pcp → cria saida_ordem + PCP direto
  Aprovada + rota=protocolo → disponivel pra protocolo ida
  Reprovada → consultora corrige

PROTOCOLO IDA (motoboy cria c/ foto → gerente conclui c/ foto)
  fn_concluir_protocolo → cria saida_ordem + PCP (NAO MEXER)

PCP: novas_ordens → apontar (entrada metal, aditivo) → em_andamento
  → transferir → saida PMC/quebra → concluido

AUDITORIA FABRICA (financeiro, automatica pos-saida)
  Aprovada → protocolo volta | Reprovada → cria -RET + novo PCP

PROTOCOLO VOLTA → fn_concluir_protocolo → CONCLUIDA
```

---

## 4. PROTOCOLO

```
Criacao: motoboy/gerente, foto OBRIGATORIA, motoboy_id = quem criou
Conclusao: gerente/admin/desenvolvedor (NAO motoboy), foto OBRIGATORIA, recebedor_id
Ordem protocolada (qualquer status) → NAO pode ser selecionada
Tabs: Ida, Volta, Entregas (historico)
fn_concluir_protocolo: ida→PCP, volta→consultora (NAO MEXER)
```

---

## 5. AUDITORIA DUPLA

```
LOJA: auto ao criar ordem, administrativo, bloqueia producao
  Modal mostra: dados ordem + numero_pedido + data_entrega + peso_metal_externo + ficha tecnica
  Aprovacao rota=pcp → cria PCP | rota=protocolo → libera protocolo
FABRICA: auto pos-saida PCP, financeiro, bloqueia protocolo volta
```

---

## 6. APONTAMENTOS PCP

```
TIPOS (IDs 1-9 fixos):
  1 = Aditivo de Metal

ENTRADA DE METAL:
  - Tipo primeiro → campos condicionais
  - Usuario SELECIONA deposito/operador + setor
  - Insumo: so Metal/Ouro (cat. 1), so com estoque > 0 no deposito
  - Peso obrigatorio + foto balanca + IA valida (tolerancia zero, bloqueia)
  - Movimentacao: saida almoxarifado → entrada deposito operador

ADITIVO DE METAL:
  - USA deposito/setor do card PCP (nao seleciona)
  - Insumo: so Metal/Ouro, estoque > 0 no ALMOXARIFADO (ID=1)
  - Peso obrigatorio + foto + IA valida
  - Bloqueio: peso > estoque disponivel → erro
  - Movimentacao: saida almoxarifado → entrada deposito do PCP

POS-APONTAMENTO:
  - PCP move de novas_ordens → em_andamento automaticamente
Deposito = Operador (label "Deposito/Operador" na UI)
```

---

## 7. PostgREST BUG

```
alissonerp NAO esta no PGRST_DB_SCHEMAS
supabase.from("alissonerp.*") → FALHA silenciosamente (retorna [])
SOLUCAO: API routes Next.js com pg.Pool (SQL direto)
```

---

## 8. IA — VALIDACAO DE PESO

```
Provedores: claude (claude-sonnet-4-20250514), openai (gpt-4o), gemini (gemini-2.5-flash)
Config: configuracoes_sistema + configuracoes_secrets
Lib: src/lib/ia-validar-peso.ts
Tolerancia: ZERO (bloqueia salvamento se nao bater)
Comparacao: Math.abs(a - b) < 0.005
Input peso: normalizar virgula → ponto antes de parseFloat
IA desabilitada → aceita sem conferencia
```

---

## 9. FICHA TECNICA

```
Relacao: directus.ordens.ficha_tecnica_id → directus.ficha_tecnica_ordem.id
(ordem aponta pra ficha, NAO o contrario)

Mapeamentos:
  modelo (1-14): Safira→Dois frisos
  modelo_interno (2-3): Confort, Reta
  tipo_fonte (1-3): Forma, Cursiva, Sem Gravacao
  tipo_elo (1-15): Cartier Quad.→Outros
  tipo_fecho (1-6): Boia→Ouro
  modelo_pingente (1,2,3,4,6): Crucifixo→Outro
  modelo_externo_anel: PENDENTE
```

---

## 10. SIDEBAR AGRUPADA

```
Dashboard
Producao      → Dashboard Fabrica, Ordens, PCP, Distribuicao, Purificacao, Painel Service
Suprimentos   → Estoque, Quebra, Insumos, Compras
Logistica     → Protocolo, Conferencia, Entrega
Qualidade     → Auditoria
Gestao        → Tarefas, Relatorios
Comercial     → Vendas, Estoque Comercial, Financeiro, Produtos, Precificacao, Orcamento
Configuracoes
Service (standalone, dark theme) → requer is_operador_service=true
```

---

## 11. CADASTROS — STATUS

```
OK  Insumos          /insumos — CRUD + saldo do pote
OK  Depositos        /configuracoes aba — CRUD (ID=1 protegido)
OK  Setores          /configuracoes aba — CRUD (vinculado ao deposito)
OK  IA               /configuracoes aba — provedor, keys, teste
OK  Usuarios         /configuracoes aba — ja existe
NAO Categorias       sem tela (8 fixas no banco)
NAO Tipos Apontamento sem tela (IDs 1-9 fixos)
```

---

## 12. PRODUTOS — CRIACAO DE NOVOS

```
Componente: CadastroProdutoModal (stepper 4 etapas: Dados, BOM, Medidas, Variacoes)
id_produto para produtos novos: nextval('alissonerp.seq_produto_id') — comeca em 90000000
SKU auto-gerado: MAX(sku::integer) + 1 de public.produtos WHERE sku ~ '^[0-9]+$'

Variacoes automaticas:
  Eixos: numeracao (tamanho aro), cor_metal, comprimento
  Regra peso: incremental (base_numeracao + incremento_por_numero) ou tabela manual
  SKU variacao: {pai}-{contador}
  BOM copiado do pai; metal = peso da variacao (nao peso do pai)
  erp_produtos: parent_sku=sku_pai, parent_id=erp_produtos.id do pai, eh_variacao=true

public.produtos: trigger_atualizar_preco_produto BEFORE INSERT → calcula preco_sync
categoria_precificacao: tabela com cedilla, colunas: id, "categoryName", "range", "curvePoints"
```

---

## 13. MIGRATIONS (indice — 132 arquivos, 001-130)

```
001-013: Schema base + config + RLS + Realtime
014-016: Views cross-schema
017-022: Auth + triggers (PCP, transferencia, distribuicao, protocolo, compras)
023-025: Storage + financeiro + webhooks
026-030: Auditoria + ponte PDV + ficha tecnica
031-040: Timeline + grants + numero_pedido + rota protocolo
041-054: Protocolo fotos + insumos + depositos/setores + distribuicao + PCP
055-064: Precificacao + composicao + markup + erp_produtos + sequence
065-072: eh_teste + quebra_operador + roles + comentarios + user_profiles
073-083: Tipo servico_venda + itens_ordem + detalhes + insumos foto + saida sem peso + estorno
084-092: Purificacao + ligacao + WhatsApp + permissoes granulares + modulo service
093-098: Tipo protocolo + locais_estoque + pedras ct + compras expandidas + triggers
099-102: Data entrega + tipos servico + fix triggers pedras + fix local_estoque
103: Transferencia service
104-106: Modulo comercial base + view video + token compartilhamento
107: Estoque comercial (config + movimentacoes + views alertas)
108: Ordens garantia (venda_id + venda_item_ids)
109-110: Sync public.vendas → vendas_erp (14.301 vendas + 75.956 itens) + fix exceptions
111: Estoque comercial auto-venda (4 triggers) + fichas tecnicas ERP
112: Modulo tarefas (substitui Asana)
113: Financeiro auto (3 triggers: venda→CR, cancelar→cancelar CR, compra→CP)
114-118: Blindagem vendas fechadas + fix sync triggers + bypass blindagem
119: Tarefas avancadas (kanban + aprovacoes + automacoes)
120-129: Modulo orcamento (config, fichas, orcamentos, pedras, cliente, foto_3d, venda+ordem)
130: Endereco entrega venda + produto_id nullable em itens_venda_erp
```

---

## 14. FOTOS DE ORDENS + COMENTARIOS

```
PDV: directus.ordens.arquivos_path → bucket 'imagens' (PUBLICO) → origin="pdv"
ERP: alissonerp.ordens.fotos_paths → bucket 'ordem-fotos' (PRIVADO) → signed URL 1h, origin="erp"

Comentarios:
  Realtime: canal "comentarios-ordem-{ordemId}" → INSERT → recarrega lista
  @mention: digitar "@" → busca /api/usuarios/busca?q= → add UUID em mencoes[]
  Notificacoes: tipo='mencao' para cada UUID em mencoes
  Edicao: somente autor; texto_original preservado
  Delete: soft delete (autor ou admin/dev)
```

---

## 15. PERFIL — PerfilDrawer + /api/user/avatar

```
Compressao client-side: canvas.toBlob("image/jpeg", 0.85), max 200x200px
Mapeamento ERP role → user_profiles.role:
  admin/desenvolvedor → 'admin' | gerente_* → 'gerente' | pcp/ourives → 'producao'
  motoboy/logistica → 'logistica' | consultora → 'consultora' | financeiro → 'financeiro'
Avatar: CustomEvent "perfil:foto-atualizada" → useAuth() escuta → setState
useAuth(): role primaria de /api/user/permissoes, fallback user_metadata.role
```

---

## 16. STATUS MODULOS (v2.19.62)

```
── PRODUCAO ──
PCP: completo (apontamentos todos tipos, saida, quebra, transferencia)
Distribuicao: completo (lotes, saida por ordem, conclusao, estorno lote)
Service: completo (receber, concluir, transferir, devolver, reprovar, aditivo, pedras)
Purificacao/Ligacao: completo (18k→24k, 24k→18k, teores configuraveis)

── COMERCIAL ──
Vendas ERP: completo (CRUD, itens, pagamentos, comissoes, metas, ranking, analises)
Estoque Comercial: completo (alertas, movimentos, config minimo, sync Tiny)
Orcamento: completo (3D alianca, pecas, pedras, aprovacao→venda→ordem)
Precificacao: completo (markup ouro/pedras, simulacao, aprovacao)
Produtos: completo (CRUD, BOM, variacoes, propagacao)
PDF + Compartilhamento: completo

── GESTAO ──
Tarefas: completo (kanban drag-drop, aprovacoes, automacoes, comentarios)
Relatorios: completo (producao, comercial, financeiro, estoque)

── INTEGRACOES ──
Tiny ERP: completo (enviar pedido, sync estoque, API v3)
Kommo CRM: basico (sync contato/lead)
WooCommerce: basico (sync produto)
Cotacoes automaticas: completo (openexchangerates)

── FINANCEIRO ──
Contas pagar/receber: completo (CRUD + triggers auto)
OFX import: completo
Conciliacao: em andamento

── PENDENTE ──
Modelo externo anel (aguardando valores do Jonathan)
```

---

## 17. USUARIOS TESTE

### Usuarios antigos (nomes reais, ja existiam antes)

Conferido contra o banco em 2026-05-22. Apenas estes existem e estao ativos:

| Email | Senha | Role | Observacao |
|-------|-------|------|------------|
| gerente@alisson.com | Gerente@123 | gerente_fabrica | nome: Robson |
| ourives1@alisson.com | Ourives@123 | ourives | — |
| pcp@alisson.com | PCP@123 | pcp | — |

**Inativos (nao logam mais — middleware bloqueia ativo=false):**
- consultora@alisson.com (Camila Silva) — sem vendedor_id vinculado tambem

**Nao existem mais (apesar de docs antiga):**
- admin@alisson.com — apagado
- motoboy@alisson.com — apagado

### Usuarios de teste — 1 por role (criados 16/07/2026, SO EM HOMOLOG)

Criados pra ter login de teste dedicado por role, sem usar credenciais de gente real. **Senha unica
pra todos: `Teste@123`**. Todos `ativo=true`, `mx_desconto_permitido=0` (default — sem cadastro de
desconto, cai no fallback da Fase 5 = 0%, exceto admin/desenvolvedor que sao full-access=100%).

**IMPORTANTE — login e compartilhado entre homolog e prod pro MESMO Supabase Auth, mas os dois
bancos Postgres (homolog/prod) sao independentes** (ver [[reference_criar_login_erp]]).
`alissonerp.usuarios` (o perfil/role de negocio) existe **SO em HOMOLOG** (banco `postgres-homolog`,
cloud.alisson.api.br:5435) — sem perfil em producao, entao nao aparecem/nao funcionam la.

**CORRECAO 16/07 (testado e confirmado funcionando):** `auth.users`/`auth.identities` (o login em
si) tiveram que ser criados TAMBEM em PRODUCAO (mesmo UUID, assinado via `assinar_mudanca_banco`,
assinatura #227) — o GoTrue que autentica de verdade nao le o Postgres de homolog (confirmado:
`auth.audit_log_entries` de homolog nunca registra nenhuma tentativa, nem as validas). So inserir em
homolog deixa o login SEMPRE falhando, silenciosamente. Detalhe completo em
[[reference_criar_login_erp]]. **Login CONFIRMADO funcionando** (testado `teste-consultora@alisson.com`
no app apontando pra homolog, 16/07).

| Email | Role | UUID |
|---|---|---|
| teste-admin@alisson.com | admin | `57171a43-c526-4861-b4e8-124299eacd67` |
| teste-desenvolvedor@alisson.com | desenvolvedor | `ae7d63dc-111b-4620-b6b8-2f95d16ff5f9` |
| teste-diretor@alisson.com | diretor | `a503130b-be1d-4930-ab5e-74cef65883cc` |
| teste-gerente_fabrica@alisson.com | gerente_fabrica | `48183383-2cc3-45c1-82ba-2fa47c7588ae` |
| teste-gerente_loja@alisson.com | gerente_loja | `d0d9312e-f892-4063-bfa2-bf95472d4937` |
| teste-consultora@alisson.com | consultora | `648f80ea-3f9c-4e09-b314-78fe4372f109` |
| teste-ourives@alisson.com | ourives | `1960c637-b09e-424e-b95c-8850f5b759dd` |
| teste-motoboy@alisson.com | motoboy | `8e731aa3-71dd-469f-ae4c-a61caa1376da` |
| teste-pcp@alisson.com | pcp | `6c75a3f0-fef7-48e3-b4e9-2225a4ad2974` |
| teste-operador_inventario@alisson.com | operador_inventario | `145c2de4-bc3f-419c-a551-a406f8dfa3f4` |
| teste-administrativo@alisson.com | administrativo | `117cf6b9-92ee-4e0e-a040-1048fe0d983c` |
| teste-entregador@alisson.com | entregador | `73e7e7f5-53a5-42a5-8df8-59f39f43fec5` |
| teste-estoquista_loja@alisson.com | estoquista_loja | `3db0b5e0-7cf8-4b20-b999-24b6b361d5c4` |
| teste-estoquista_fabrica@alisson.com | estoquista_fabrica | `4963a1a3-39d6-46ec-8b6c-9bcde1a125f9` |
| teste-financeiro@alisson.com | financeiro | `5637ef3e-6dfc-4171-b255-aba6a6b66b84` |

**`teste-admin` também foi adicionado (append, sem tirar ninguém) como aprovador extra em TODAS as
16 chaves de `configuracoes_sistema` que decidem aprovações hoje** (`aprovador_desconto_padrao`,
`aprovador_cartao_desconto_padrao`, `aprovadora_credito_gerente`, `aprovador_credito_diretor`,
`aprovador_entrega_sem_pagamento`, `aprovador_devolucao`, `aprovador_devolucao_estoque`,
`aprovador_compra_comercial`, `aprovador_conversao`, `aprovador_precificacao`, `aprovador_limpeza`,
`metal_aprovador_id`, `aprovadores_devolver_peca`, `aprovador_vale_troca_excecao`,
`aprovador_alteracao_venda`, `aprovadores_conversao_reversa`) — só em homolog. Serve pra testar
qualquer fluxo de aprovação logando só com `teste-admin`, sem precisar da senha do Alisson/Germana/
Rafael/Jonathan. **Reversível**: pra tirar, remover o UUID `57171a43-c526-4861-b4e8-124299eacd67` de
cada `valor` (ou rodar `UPDATE ... SET valor = replace(valor, ',57171a43-c526-4861-b4e8-124299eacd67', '')`).

**Uso sugerido pra testar a centralização das aprovações**: `teste-consultora` solicita
desconto/crédito/devolução (sem cadastro = testa o fallback 0% da Fase 5) → `teste-admin` aprova
(está em todas as chaves). Pra testar "só o configurado decide, nem admin passa", usar
`teste-desenvolvedor` (NÃO está em nenhuma chave) tentando aprovar — deve dar 403 sempre.

---

## 18. BUGS CONHECIDOS

```
/api/user/alterar-senha eh PATCH, nao GET (documentacao antiga errada)
```
