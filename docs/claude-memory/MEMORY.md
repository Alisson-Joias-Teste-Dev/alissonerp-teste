# MEMORY.md — Alisson ERP (Joalheria de Alto Padrao)

> **Referencia de dominio do projeto. Regras e pitfalls estao em `CLAUDE.md` (raiz do repo).**
> **Atualizado: 31/03/2026 (v2.15.0)**

## Memorias detalhadas
- [feedback_permissoes_banco.md](./feedback_permissoes_banco.md) — CRUD só em alissonerp; public e directus são READONLY
- [project_tela_inicial.md](./project_tela_inicial.md) — Tela inicial `/`: layout, fontes de dados, leao, favicon
- [project_user_profiles.md](./project_user_profiles.md) — Estrutura real de public.user_profiles + constraint roles + mapeamento roles ERP
- [project_storage_buckets.md](./project_storage_buckets.md) — Todos os buckets (avatars, ordem-fotos, protocolo-fotos, apontamento-fotos, imagens)
- [project_api_routes.md](./project_api_routes.md) — Mapa completo das 88 API routes
- [project_modulo_service.md](./project_modulo_service.md) — Modulo Service v2.15.0: transferencia_service_id, devolver, rotas pcp/transferir-service
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

── SISTEMA ──
configuracoes_sistema (config IA + config preco)
configuracoes_secrets (API keys IA)

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
Producao      → Ordens, PCP, Distribuicao
Suprimentos   → Estoque, Insumos, Compras
Logistica     → Protocolo
Qualidade     → Auditoria
Comercial     → Vendas, Financeiro, Precificacao
Configuracoes
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

## 13. MIGRATIONS (indice)

```
001-013: Schema base + config + RLS + Realtime
014-016: Views
017-022: Auth + triggers (PCP, transferencia, distribuicao, protocolo, compras)
023-025: Storage + financeiro + webhooks
026-027: Auditoria + ponte PDV
031-032: Timeline + grants ficha tecnica
035: numero_pedido
040: Fix rota protocolo
041-042: Protocolo fotos + insumos
043-044: Configuracoes IA
045+: Depositos/setores + apontamentos PCP
055-062: Precificacao + composicao + markup + erp_produtos
063-064: erp_produtos populate + sequence
065+: Service module + locais_estoque + pedras ct
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

## 16. PENDENTES

```
── FICHA TECNICA ──
Ficha tecnica no modal auditoria (fetch faltando)
Mapeamento ENUMs ficha tecnica
Peso metal externo no modal auditoria
Modelo externo anel (aguardando valores)

── APONTAMENTOS ──
Entrada de Metal: OK
Aditivo de Metal: em andamento
Tipos 2-9: pendente

── ESTOQUE ──
Ouro Total: corrigir pra contar SO deposito geral (ID=1)
Saldo catalogo: usar vw_detalhe_pote
```

---

## 17. USUARIOS TESTE

| Email | Senha | Role |
|-------|-------|------|
| admin@alisson.com | Admin@123 | desenvolvedor |
| gerente@alisson.com | Gerente@123 | gerente_fabrica |
| ourives1@alisson.com | Ourives@123 | ourives |
| motoboy@alisson.com | Motoboy@123 | logistica |
| consultora@alisson.com | Consultora@123 | consultora |
| pcp@alisson.com | PCP@123 | pcp |

---

## 18. BUGS CONHECIDOS

```
ComprasClient.tsx usa supabase.from() para alissonerp → retorna [] silenciosamente
  Solucao: migrar para API route com sql direto
/api/user/alterar-senha eh PATCH, nao GET
```
