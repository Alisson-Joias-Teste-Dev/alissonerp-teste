# MEMORY.md — Alisson ERP (Joalheria de Alto Padrão)

> 📋 Última atualização automática: 28/03/2026 — Versão: v2.14.0 <!-- Revisado 28/03/2026 -->

> **LEITURA OBRIGATÓRIA antes de qualquer sessão.**
> **Local: fabricaAJ/MEMORY.md** | **Atualizado: 28/03/2026 — v2.14.0 — Tipos de Protocolo (Fábrica vs Service): tipo_protocolo em protocolos + tipos_protocolo_permitidos em usuarios + permissão por role + NovaProtocoloModal seletor de tipo + ProtocoloClient badge**

---

## 0. REGRA PRÉ-CÓDIGO (INVIOLÁVEL)

```
ANTES DE ESCREVER QUALQUER LINHA DE CÓDIGO:
1. Ler este MEMORY.md inteiro
2. Ler fabricaAJ/docs/arquitetura.md
3. Para CADA tabela que vai usar:
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='alissonerp' AND table_name='NOME';
4. Para CADA bucket Storage:
   SELECT id, name FROM storage.buckets;
5. CONFIRMAR que colunas/tabelas/buckets existem
6. Se NÃO existe → criar ANTES (ADD COLUMN, CREATE TABLE, INSERT bucket)
7. NUNCA ADIVINHAR NOMES

Erros "column does not exist" / "Bucket not found" / "relation does not exist"
são INACEITÁVEIS — significam que não consultou o banco.
```

---

## 1. SCHEMAS

| Schema | Acesso | Conteúdo |
|--------|--------|----------|
| `public` | READONLY | contatos (=CLIENTES), vendedores, produtos, vendas, pedidos, user_profiles |
| `directus` | READONLY | ordens, pcp, apontamento, controle_estoque, protocolo, ficha_tecnica_ordem, insumos |
| `alissonerp` | LEITURA+ESCRITA | 65+ tabelas reais, 43+ views reais, 33+ triggers reais |

### Erros que NUNCA devem acontecer
```
❌ alissonerp.clientes        → ✅ public.contatos
❌ public.pedidos (numero)     → ✅ public.vendas
❌ ficha_tecnica.ordem_id      → ✅ NÃO EXISTE (link é ordens.ficha_tecnica_id)
❌ supabase.from("alissonerp") → ✅ API route SQL direto
❌ insumos.saldo               → ✅ vw_saldo_estoque (saldo real)
❌ ordens.peso_negociado       → ✅ ordens.peso_metal_negociado
❌ distribuicao_ordens.ordem_id → ✅ distribuicao_ordens.ordens_id (nome real da coluna)
❌ distribuicoes.status        → ✅ distribuicoes.etapas (enum_etapas_distribuicao)
❌ contatos.id                 → ✅ contatos.id_contato (PK real de public.contatos)
❌ user_profiles.id            → ✅ user_profiles.id_user (PK real)
❌ user_profiles.nome          → ✅ user_profiles.name
❌ user_profiles.foto_url      → ✅ user_profiles.avatar_url
❌ public.produtos.id          → ✅ public.produtos.id_produto (PK real, BIGINT)
❌ alissonerp.parametros.cotacao_ouro → ✅ public.parametros.ouro (fonte de verdade para precificação)
❌ SELECT descricao FROM alissonerp.insumos → ✅ SELECT nome AS descricao (coluna real é 'nome')
   ⚠️ insumos.unidade: coluna existe (adicionada em produção, migration 042 só no DB)
   ⚠️ /api/produtos/insumos e /api/pcp/insumos usam 'nome'; BOM component usa campo 'descricao' (alias)
❌ auditorias.tipo              → ✅ auditorias.tipo_auditoria (coluna real é tipo_auditoria)
❌ WHERE integer_col = ${uuidVar} → ✅ usar parseInt(id) ou cast explícito (nunca ::uuid em coluna INT)
❌ directus.itens_ordem_1 para ordens ERP → ✅ alissonerp.itens_ordem (fonte separada por origem)
❌ configuracoes_sistema.valor = ${jsonValue} → ✅ configuracoes_sistema.valor::jsonb
   PITFALL: configuracoes_sistema.valor é TEXT — SEMPRE usar ::jsonb ao comparar com JSONB
   Exemplo: WHERE chave='service_tipos_ordem' AND valor::jsonb ? 'servico_venda'
   REGRA: ordens legadas (origem='legado') → itens em directus.itens_ordem_1
          ordens ERP (origem='erp')       → itens em alissonerp.itens_ordem
❌ tipo_ordem='servico'         → ✅ tipo_ordem='servico_venda' (migration 071 renomeou o enum)
```

### Tabelas alissonerp (referência)
```
── PRODUÇÃO ──
ordens           — colunas novas:
  origem VARCHAR(20) DEFAULT 'erp' NOT NULL  — 'erp' | 'legado' (migration 073)
  foto_peca_servico TEXT                     — path bucket ordem-fotos (servico_venda) (073)
  peso_peca_servico NUMERIC(10,2)            — peso peça cliente (servico_venda) (073)
  video_observacao TEXT                      — path bucket ordem-videos (servico_venda) (073)
  detalhes_ordem TEXT                        — campo texto livre (migration 075)
saidas_ordem     — colunas novas:
  metal_externo NUMERIC DEFAULT 0            — ouro do cliente (migration 078)
  pmc = peso_ouro_real - total_outros - metal_externo
  total_metal=0 → sem quebra, sem CE (peça do cliente)
distribuicao_ordens — colunas novas:
  sem_peso BOOLEAN                           — saída sem peso físico (migration 077)
  justificativa_sem_peso TEXT                — motivo obrigatório se sem_peso=true
  ATENÇÃO: coluna é ordens_id (NÃO ordem_id)
pcp, apontamentos_pcp, distribuicoes
tipos_apontamento (IDs 1-9 fixos)
estornos_distribuicao (migration 081/082):
  distribuicao_id INT FK, ordem_id INT NULLABLE FK,
  motivo TEXT, justificativa TEXT, estornado_por UUID,
  dados_revertidos JSONB (snapshot)
itens_ordem      — ordens criadas no ERP (NÃO do PDV)
  id SERIAL, ordem_id INT FK, produto_id BIGINT FK public.produtos.id_produto,
  nome_produto TEXT, sku TEXT, quantidade INT, peso_estimado NUMERIC(10,2),
  observacao TEXT, created_at
  (desnormalizada: nome_produto e sku para performance)

── SUPRIMENTOS ──
insumos (251+ registros) — colunas (migration 076 + 092):
  nome TEXT, unidade VARCHAR, categoria_id INT, ativo BOOLEAN
  peso_pedra REAL      — peso em gramas (calculado automaticamente de peso_pedra_ct via trigger)
  peso_pedra_ct NUMERIC — peso em quilates (source of truth para pedras — migration 092)
  sku_interno TEXT     — SKU interno opcional (migration 092)
  descricao TEXT       — campo livre adicional
  foto TEXT            — URL completa no bucket insumo-fotos (migration 076)
  observacao TEXT      — observação livre (migration 076)
  fornecedor_id BIGINT, ultimo_preco_compra_usd, sku, etc.
  TRIGGER trg_calcular_peso_pedra: BEFORE INSERT/UPDATE em insumos
    → fn_calcular_peso_pedra_gramas: peso_pedra = peso_pedra_ct × 0.2 (1ct = 0.2g)
    → preenche peso_pedra automaticamente ao salvar peso_pedra_ct
categorias_insumo (8 categorias: Metal/Ouro=1, Pedras=2, Liga, Solda, Banho, Acabamento, Embalagem, Outros)
depositos (= operadores: Almoxarifado=1, Ourives, Laser, Banca)
setores (vinculados ao depósito)
controle_estoque / movimentacoes_estoque
  Marcadores SP (Saída Pedra consumida), QBP (Quebra Pedra) — adicionados migration 079

── LOGÍSTICA ──
protocolos (foto_criacao, foto_conclusao, motoboy_id, recebedor_id, tipo_protocolo VARCHAR(20) DEFAULT 'fabrica')
  tipo_protocolo: 'fabrica' (vai pra fábrica via motoboy) | 'service' (vai pra service ao lado)
  Backfill migration 093: ordens servico_venda/garantia → 'service', demais → 'fabrica'
protocolo_ordens, protocolo_fotos

usuarios — colunas novas (migration 093):
  tipos_protocolo_permitidos JSONB DEFAULT '[]'
  Permissões por role: motoboy=["fabrica"], gerente=["fabrica","service"], consultora=["service"]
  Admin/dev ignoram (fullAccess). Verificado via /api/user/[id]/permissoes-protocolo
  API /api/protocolo POST: valida tipos_protocolo_permitidos antes de inserir
  API /api/protocolo/ordens: aceita ?tipo_protocolo=fabrica|service para filtrar ordens por tipo

── QUALIDADE ──
auditorias (loja + fábrica)
  ATENÇÃO: coluna tipo_auditoria (NÃO 'tipo') — varchar(10), valor 'saida_pcp'

── PURIFICAÇÃO E LIGAÇÃO (v2.10.0, migrations 084-090) ──
purificacoes — módulo 18k→24k (ouro bruto → ouro fino)
  id SERIAL, peso_entrada, peso_saida, pureza_entrada, pureza_saida,
  operador_id UUID, deposito_id INT, status (pendente/em_andamento/concluido),
  created_by UUID, created_at, concluido_em, concluido_por
ligacoes — módulo 24k→18k (ouro fino + liga → ouro 18k)
  id SERIAL, peso_ouro_24k, peso_liga, peso_total_18k, pureza,
  tipo_liga_id INT FK, operador_id UUID, deposito_id INT,
  status (pendente/em_andamento/concluido),
  created_by UUID, created_at, concluido_em, concluido_por
tipos_liga — tipos de liga metálica (ex: Cu+Ag amarelo, Pd+Ag branco)
teores — teores de pureza (configurável em /configuracoes)
permissoes_usuario — permissões granulares por usuário (migration 089):
  usuario_id UUID, acao VARCHAR, permitido BOOLEAN
  Ações: abrir_purificacao, concluir_purificacao, abrir_ligacao,
         concluir_ligacao, editar_teor_ligacao

── WHATSAPP ASSISTANT (v2.10.0, migrations 086-088) ──
wa_assistants, wa_conversations, wa_messages, wa_kb_articles
  Tabelas para assistente WhatsApp (integração n8n)
  user_profiles.phone VARCHAR(20) — vinculação automática WhatsApp → usuário ERP

── FICHAS TÉCNICAS PRODUTO (v2.12.0, migration 091) ──
fichas_tecnicas_produto — ficha técnica por produto (não por ordem)
  id SERIAL, produto_id BIGINT, tipo_peca, largura, altura, profundidade,
  diametro_interno, peso_estimado_metal, qtd_pedras, tamanho_pedras_mm/ct,
  tipo_cravacao, qtd_garras, largura_garra, altura_garra, modelo, modelo_interno,
  arquivo_3dm TEXT, arquivo_glb TEXT, ia_provider, ia_raw_response JSONB,
  ia_confianca, revisado_por UUID, revisado_em, created_at
  Bucket: produto-3d (para modelos 3D .glb/.3dm)

── SISTEMA ──
configuracoes_sistema (config IA: provedor, modelos, ativa)
configuracoes_secrets (API keys IA)

── SERVICE (v2.13.0, migration 092) ──
servicos — tabela principal do módulo Service
  id SERIAL, ordem_id INT FK, pcp_id INT FK, operador_id INT FK (depositos)
  tentativa INT DEFAULT 1 — número da tentativa (loop reprovação)
  peso_entrada NUMERIC(10,2), peso_saida NUMERIC(10,2)
  usou_solda BOOLEAN, peso_fio_antes NUMERIC(10,2), peso_fio_depois NUMERIC(10,2)
  consumo_solda NUMERIC(10,2) — modo A1: pesagem do fio de solda
  colocou_pedra BOOLEAN DEFAULT false
  pedras_colocadas JSONB DEFAULT '[]' — [{insumo_id, nome, qtd, peso_unitario, peso_total, origem}]
    origem: 'estoque' | 'cliente'
  status VARCHAR(20): aguardando | em_servico | concluido | reprovado
  foto_recebimento TEXT, foto_conclusao TEXT, foto_fio_solda TEXT (URLs completas, bucket service-fotos)
  motivo_reprovacao TEXT, foto_reprovacao TEXT, reprovado_em TIMESTAMPTZ, reprovado_por UUID
  recebido_em TIMESTAMPTZ, concluido_em TIMESTAMPTZ, concluido_por UUID
  created_at TIMESTAMPTZ
  TRIGGER trg_criar_servico_from_pcp: AFTER INSERT em pcp
    → fn_criar_servico_from_pcp: cria servico automaticamente quando PCP é criado para
      tipos em configuracoes_sistema.service_tipos_ordem (default: servico_venda, garantia)
    → usa configuracoes_sistema.operador_servico_padrao para deposito_id padrão

── USUÁRIOS ──
usuarios — coluna nova (migration 073):
  tipos_ordem_permitidos JSONB DEFAULT '[]'
  — array de tipos permitidos por usuário; admin/dev ignoram (fullAccess)
  is_operador_service BOOLEAN DEFAULT false — migration 092
  — Flag: usuário tem acesso ao app Service (dark mobile). INDEPENDENTE da role.
  — Checked via useAuth().isOperadorService → mostra /service na sidebar
  — NÃO é role — qualquer role pode ser operador service

── COMENTÁRIOS E NOTIFICAÇÕES ──
comentarios_ordem (id, ordem_id, autor_id UUID, texto, mencoes UUID[], editado, editado_em,
  excluido, excluido_em, excluido_por UUID, texto_original, foto_path TEXT NULLABLE,
  created_at) — SOFT DELETE; foto no bucket 'ordem-fotos'
notificacoes (id, usuario_id, tipo, titulo, mensagem, lida, created_at, link, ordem_id,
  comentario_id, remetente_id, lida_em)
ordem_comentario_mencoes (legado — substituído por mencoes UUID[] inline em comentarios_ordem)
ordem_comentarios (legado — tabela antiga sem foto/excluido, não usada pelo código novo)

── COMUNICAÇÃO ──
ordens.fotos_paths TEXT[] — array de paths no bucket 'ordem-fotos' (migration 071)
```

---

## 2. CONSTRAINTS IMUTÁVEIS

```
Depósito ID=1       = Almoxarifado Central (depósito geral)
Insumo ID=1         = Ouro 18k Amarelo
Categoria ID=1      = Metal/Ouro | ID=2 = Pedras
Tipos apontamento   = IDs 1-9 fixos
Movimentação        = SEMPRE dupla-entrada (débito + crédito)
PMC PCP             = peso_final - outros - metal_externo
PMC Distribuição    = peso_final - outros (SEM metal_externo)
Serviço             → SEMPRE rota = protocolo
Ouro Total (pote)   = SÓ depósito geral (ID=1) — outros depósitos são operadores
Pedras Total (pote) = SÓ depósito geral (ID=1) — mesma regra do ouro
vw_detalhe_pote     = saldo_real SÓ deposito_id=1 (migration 052)
vw_saldo_pote       = saldo_total SÓ deposito_id=1 (migration 046)

PEDRAS — REGRA DE MOVIMENTAÇÃO (igual ao ouro):
  ✅ MOVIMENTA: Entrada de Pedra (apontamento tipo3): almox → operador
  ✅ MOVIMENTA: Retorno de Pedra (apontamento tipo6): operador → almox
  ✅ MOVIMENTA: Transferência PCP (/api/pcp/transferir): operador A → operador B
                (saldo = tipo3 - tipo6 de apontamentos_pcp, marcador TED)
  ❌ NÃO MOVIMENTA: Saída da distribuição (só registra em distribuicao_saida_pedras)
  ❌ NÃO MOVIMENTA: Saída do PCP (pedras já estão no estoque do operador)
  Baixa definitiva: conclusão final do PCP (futuro — pedras consumidas saem do operador)
```

---

## 3. VALORES LEGADOS (Directus)

```
situacao: "1"=Cancelado "2"=Criado "3"=Rascunho
status:   "1"=Aguardando "2"=Em Andamento "3"=Concluído
rota:     "1"=PCP "2"=Protocolo
tipo_ordem: "1"=servico_venda "2"=Fabricação "3"=Rep.Venda "4"=Rep.Loja "5"=Compra "6"=Garantia "7"=Serv.Interno
  ⚠️ migration 071: 'servico' renomeado para 'servico_venda' no enum alissonerp
  ⚠️ 'servico_loja' adicionado (migration 072) mas ESCONDIDO do frontend
  ⚠️ trigger ponte: "1" → 'servico_venda' (não mais 'servico')
etapas_pcp: "1"=Novas "2"=Pendência "3"=Aguardando "4"=Em Andamento "5"=Concluído "6"=Cancelado
```

---

## 4. FICHA TÉCNICA

```
Relação: directus.ordens.ficha_tecnica_id → directus.ficha_tecnica_ordem.id
(ordem aponta pra ficha, NÃO o contrário — NÃO existe ficha_tecnica.ordem_id)

Mapeamentos:
  modelo (1-14): Safira→Dois frisos
  modelo_interno (2-3): Confort, Reta
  tipo_fonte (1-3): Forma, Cursiva, Sem Gravação
  tipo_elo (1-15): Cartier Quad.→Outros
  tipo_fecho (1-6): Boia→Ouro
  modelo_pingente (1,2,3,4,6): Crucifixo→Outro
  modelo_externo_anel: PENDENTE
```

---

## 5. IDs CROSS-SCHEMA

```
alissonerp.ordens.id ≠ directus.ordens.id
SEMPRE usar directus_ordem_id para cruzar
```

---

## 6. FLUXO DA ORDEM

```
── FLUXO A: PDV (origem='legado') ──
PDV → [TRIGGER PONTE] → alissonerp.ordens + AUDITORIA LOJA
  tipo_ordem='servico_venda' → força rota='protocolo'
  lookup numero_pedido em public.vendas (NÃO pedidos)
  itens → directus.itens_ordem_1 (ponte: directus_ordem_id)

── FLUXO B: ERP (origem='erp') — Módulo Criação (18/03/2026) ──
Usuário clica "Nova Ordem" → dropdown 7 tipos → NovaOrdemModal
  Número = MAX(ambos schemas) + 1 (evitar colisão)
  Rota: servico_venda → protocolo; demais → pcp
  POST /api/ordens: cria ordem + itens (alissonerp.itens_ordem) + auditoria loja (transação)
  servico_venda: foto_peca_servico + peso_peca_servico OBRIGATÓRIOS
  itens → alissonerp.itens_ordem (NÃO directus.itens_ordem_1)

── CONTINUAÇÃO (ambos fluxos) ──
AUDITORIA LOJA (administrativo, obrigatória)
  Aprovada + rota=pcp → cria saida_ordem + PCP direto
  Aprovada + rota=protocolo → disponível pra protocolo ida
  Reprovada → consultora corrige

PROTOCOLO IDA (motoboy cria c/ foto → gerente conclui c/ foto)
  fn_concluir_protocolo → cria saida_ordem + PCP (NÃO MEXER)

PCP: novas_ordens → apontar (entrada metal, aditivo) → em_andamento
  → transferir → saída PMC/quebra → concluído

AUDITORIA FÁBRICA (financeiro, automática pós-saída)
  Aprovada → protocolo volta | Reprovada → cria -RET + novo PCP

PROTOCOLO VOLTA → fn_concluir_protocolo → CONCLUÍDA
```

---

## 7. PROTOCOLO

```
Criação: motoboy/gerente, foto OBRIGATÓRIA, motoboy_id = quem criou
Conclusão: gerente/admin/desenvolvedor (NÃO motoboy), foto OBRIGATÓRIA, recebedor_id
Ordem protocolada (qualquer status) → NÃO pode ser selecionada
Tabs: Ida, Volta, Entregas (histórico)
fn_concluir_protocolo: ida→PCP, volta→consultora (NÃO MEXER)
```

---

## 8. AUDITORIA DUPLA

```
LOJA: auto ao criar ordem, administrativo, bloqueia produção
  Modal mostra: dados ordem + numero_pedido + data_entrega + peso_metal_externo + ficha técnica
  Aprovação rota=pcp → cria PCP | rota=protocolo → libera protocolo
FÁBRICA: auto pós-saída PCP, financeiro, bloqueia protocolo volta
```

---

## 9. APONTAMENTOS PCP

```
TIPOS (IDs 1-9 fixos):
  1 = Aditivo de Metal
  (verificar IDs dos outros: Entrada de Metal, etc.)

ENTRADA DE METAL:
  - Tipo primeiro → campos condicionais
  - Usuário SELECIONA depósito/operador + setor
  - Insumo: só Metal/Ouro (cat. 1), só com estoque > 0 no depósito
  - Peso obrigatório + foto balança + IA valida (tolerância zero, bloqueia)
  - Movimentação: saída almoxarifado → entrada depósito operador

ADITIVO DE METAL:
  - USA depósito/setor do card PCP (não seleciona)
  - Insumo: só Metal/Ouro, estoque > 0 no ALMOXARIFADO (ID=1)
  - Peso obrigatório + foto + IA valida
  - Bloqueio: peso > estoque disponível → erro
  - Movimentação: saída almoxarifado → entrada depósito do PCP

RETORNO DE METAL (tipo 5):
  - USA depósito/setor do card PCP (não seleciona)
  - Insumo: só Metal/Ouro, SEM filtro de estoque (mostra TODOS)
  - SEM validação de estoque (metal voltando pro pote)
  - Peso obrigatório + foto + IA valida (tolerância zero)
  - Movimentação: saída depósito do PCP → entrada Almoxarifado (ID=1)
  - Atualiza pcp.retorno_metal += qtd (trigger 018)

ENTRADA DE PEDRA (tipo 3):
  - USA depósito/setor do card PCP (não seleciona)
  - Insumo: só Pedras (cat. 2), saldo > 0 no Almoxarifado (ID=1)
  - insumos-disponiveis retorna peso_pedra por insumo
  - QUANTIDADE em unidades (inteiro), NÃO peso
  - Peso total calculado no frontend: qtd × insumo.peso_pedra
  - Foto + IA CONTA pedras (prompt diferente, não lê balança)
  - Endpoint: POST /api/pcp/validar-peso com tipo=pedra + quantidade=N
  - Movimentação: saída Almoxarifado → entrada depósito do PCP (trigger 018)
  - Atualiza pcp.total_pedras_un e pcp.total_pedras_g (trigger 018)
  - Seleção de insumo via AUTOCOMPLETE pesquisável (buscaPedra state + dropdownRef)
    filtra por nome OU sku, onMouseDown (não onClick) para evitar blur race
  - VALIDAÇÃO IA: envia PESO CALCULADO (qtd × peso_pedra) para balança, NÃO conta pedras
    Tolerância CONFIGURÁVEL via ia_margem_pedra_pct (default 10%) — /configuracoes > IA
    Metal: tolerância zero (0.005g) | Pedra: % do peso calculado
    Endpoint: POST /api/pcp/validar-peso com tipo=pedra + peso=pesoCalculado

RETORNO DE PEDRA (tipo 6):
  - USA depósito/setor do card PCP (não seleciona)
  - Label: "Devolvendo de: [Operador] → Almoxarifado Central"
  - Insumo: TODOS os insumos Pedra (cat. 2), SEM filtro estoque (tá devolvendo)
    Busca: /api/pcp/insumos?categoria_id=2 (agora retorna peso_pedra)
  - QUANTIDADE em unidades (inteiro)
  - Peso calculado: qtd × peso_pedra (mesmo display da Entrada de Pedra)
  - Foto balança + IA com MARGEM configurável (mesmo tipo=pedra)
  - SEM validação de estoque na API
  - Movimentação: saída depósito PCP → entrada Almoxarifado (trigger 018, marcador=RP)
  - Autocomplete pesquisável (mesmo componente da Entrada de Pedra — isPedra=true para tipo 6)

RESUMO NO CARD PCP:
  - GET /api/pcp/[id]/resumo → agrupa apontamentos por tipo
  - Retorna: resumo[] (tipo_id, tipo_nome, total_apontamentos, peso_metal, peso_pedras, qtd_pedras)
  - Retorna: totais { metal_entrada, metal_retorno, metal_liquido, pedras_qtd, pedras_peso }
  - PCPDetalheModal mostra seção Resumo antes da lista de apontamentos

PÓS-APONTAMENTO:
  - PCP move de novas_ordens → em_andamento automaticamente
  - Card clicável → abre painel com histórico de apontamentos
  - Painel tem: dados ordem + lista apontamentos + botões Apontar/Transferir/Saída

Depósito = Operador (label "Depósito/Operador" na UI)
```

---

## 10. ROLES

```
desenvolvedor    → TUDO (super-admin) — usa ROLES_FULL_ACCESS de @/lib/roles
admin            → TUDO — usa ROLES_FULL_ACCESS de @/lib/roles
gerente_fabrica  → PCP + estoque + protocolo (cria e conclui)
gerente_loja     → ordens + protocolo + auditoria loja + conferência + entrega
motoboy          → protocolo (só cria, NUNCA conclui)
consultora       → só suas ordens + corrige reprovadas + conferência (aprovar/reprovar)
ourives          → só PCP (apontar/transferir)
pcp              → PCP completo

⚠️ Role enum real é 'motoboy' — NÃO 'logistica'. Usar 'logistica' causa erro de constraint.

Tabela: alissonerp.usuarios.role (VARCHAR(50), migrado de enum_role em migration 068)
NUNCA hardcodar verificação de role. Usar sempre:
  import { isFullAccess, ROLES_FULL_ACCESS } from '@/lib/roles'

Pitfall: auth.users.email ≠ alissonerp.usuarios.email para alguns usuários
  → Joins de permissão SEMPRE por UUID (id), nunca por email
  → Correto: WHERE alissonerp.usuarios.id = ${user.id}::uuid
  → Errado:  JOIN auth.users ON au.email = u.email WHERE au.id = ...

⚠️ ROLES MIGRADAS de enum para VARCHAR(50) em migration 068
   alissonerp.usuarios.role = VARCHAR(50), default 'ourives'
   alissonerp.roles tabela = fonte de verdade das roles válidas (10 roles ativas)
   Roles válidas: desenvolvedor, admin, gerente_fabrica, gerente_loja, ourives,
                  motoboy, consultora, estoquista_fabrica, estoquista_loja, pcp
   EXTRA no banco: 'administrativo' (inserido manualmente, ativo=true)

⚠️ public.user_profiles.role usa constraint CHECK diferente:
   Aceita: 'admin', 'consultora', 'user', 'gerente', 'producao', 'logistica', 'financeiro'
   → NÃO inclui 'desenvolvedor', 'ourives', etc.
   → Fonte de verdade = alissonerp.usuarios.role (NÃO user_profiles.role)
   → API /api/user/role busca de alissonerp.usuarios JOIN user_profiles para avatar_url
```

---

## 11. POSTGREST BUG (CRÍTICO)

```
alissonerp NÃO está no PGRST_DB_SCHEMAS
supabase.from("alissonerp.*") → FALHA silenciosamente (retorna [])
SOLUÇÃO: API routes Next.js com pg.Pool (SQL direto)
supabase.auth.getUser() funciona | supabase.storage funciona
TODO novo fetch alissonerp → API route. NUNCA supabase.from()

✅ R1 CORRIGIDO: ComprasClient.tsx e LancamentoAvulsoModal.tsx migrados para fetch() API routes

── PÁGINA /purificacao (v2.10.0) ──
Roles: admin, desenvolvedor, gerente_fabrica (+ permissões granulares)
Componentes: PurificacaoClient.tsx, LigacaoTab.tsx
Abas: Purificação (18k→24k), Ligação (24k→18k)
Permissões granulares (5 ações via permissoes_usuario):
  abrir_purificacao, concluir_purificacao, abrir_ligacao, concluir_ligacao, editar_teor_ligacao
Lib: src/lib/permissoes.ts — temPermissao(userId, acao, role) → boolean
```

---

## 12. API ROUTES EXISTENTES

```
── PROTOCOLO ──
GET   /api/protocolo/ordens?direcao=ida|volta
POST  /api/protocolo                         → body inclui foto_criacao (base64)
GET   /api/protocolo/concluidos
GET   /api/protocolo/[protocoloId]           → ordens do protocolo
PATCH /api/protocolo/[protocoloId]           → etapas + recebedor_id + foto_conclusao (base64)

── ORDENS ──
POST /api/ordens                     → cria ordem ERP + itens (alissonerp.itens_ordem) + auditoria loja
                                       body: { tipo_ordem, cliente_id, vendedor_id, numero_pedido?,
                                              data_entrega?, peso_metal_negociado?, peso_metal_externo?,
                                              observacao?, itens[], foto_peca_servico?, peso_peca_servico?,
                                              video_observacao? }
                                       Número = MAX(alissonerp + directus) + 1
                                       Rota automática: servico_venda → protocolo; demais → pcp
GET  /api/ordens/contatos?busca=     → autocomplete clientes (public.contatos) — debounce 300ms
GET  /api/ordens/vendedores          → lista vendedores ativos (public.vendedores)
GET  /api/ordens/produtos-busca?busca= → busca produtos ativos (public.produtos + erp_produtos)
GET  /api/ordens/rastreio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
     → 6 categorias: pcp, protocolo_ida, protocolo_volta, auditoria, conferencia, entregues
     → consultora: filtra por vendedor_id automaticamente
GET  /api/ordens/[id]/itens          → itens da ordem (DUAS FONTES):
     origem='legado': directus.itens_ordem_1 WHERE ordem_id = directus_ordem_id
     origem='erp':    alissonerp.itens_ordem WHERE ordem_id = $1
GET  /api/ordens/[id]/fotos          → fotos PDV (bucket imagens, público) + ERP (bucket ordem-fotos, signed URLs)
POST /api/ordens/[id]/fotos          → body: { path } — adiciona ao array fotos_paths
DEL  /api/ordens/[id]/fotos          → body: { path } — remove de fotos_paths + remove do storage (admin only)
GET  /api/ordens/[id]/comentarios    → lista comentarios_ordem WHERE excluido=false, inclui foto_path
POST /api/ordens/[id]/comentarios    → body: { texto, mencoes?, foto_path? } — cria comentário + notificações
PATCH /api/ordens/[id]/comentarios/[comentarioId] → body: { texto } — edita (somente autor)
DEL  /api/ordens/[id]/comentarios/[comentarioId] → soft delete (autor ou admin/desenvolvedor)

── AUDITORIA ──
GET   /api/ficha/[ordemId]           → SELECT vw_fichas_tecnicas WHERE ordem_id=$1 (retorna 1 row ou null)
PATCH /api/auditoria/[auditoriaId]   → body: { situacao, parecer?, motivo_reprovacao? }

── CONFERÊNCIA ──
  Tabela: aprovacoes_consultora | enum etapas: pendente|aguardando|aprovado|reprovado
  Página: /conferencia (Server Component + ConferenciaClient.tsx)
  Roles: desenvolvedor, admin, gerente_loja, consultora
  PATCH /api/aprovacao/[aprovacaoId]   → body: { etapas: "aprovado"|"reprovado" }
    → UPDATE aprovacoes_consultora SET etapas=$1 WHERE id=$2
    → Trigger fn_aprovacao_para_entrega dispara quando etapas→aprovado (cria preparacoes_entrega)

── ENTREGA ──
  Tabela: preparacoes_entrega | enum etapas: pendente|concluido
  Página: /entrega (Server Component + EntregaClient.tsx)
  Roles: desenvolvedor, admin, gerente_loja (NÃO consultora)
  PATCH /api/entrega/[entregaId]       → body: { etapas: "concluido" }
    → UPDATE preparacoes_entrega SET etapas='concluido' WHERE id=$1

── INSUMOS ──
GET/POST   /api/insumos
PATCH/DEL  /api/insumos/[id]
GET        /api/insumos/categorias
GET        /api/insumos/pote

── PCP ──
GET  /api/pcp/tipos-apontamento
GET  /api/pcp/depositos
GET  /api/pcp/setores?deposito_id=X
GET  /api/pcp/insumos?categoria_id=N              → lista insumos ativos (sem filtro estoque, retorna peso_pedra)
GET  /api/pcp/insumos-disponiveis?deposito_id=X&categoria_id=Y  → com filtro saldo > 0
POST /api/pcp/apontamentos                        → body inclui foto_balanca (base64)
POST /api/pcp/validar-peso                        → IA multi-provedor
POST /api/pcp/transferir (body: {pcp_id,destino_deposito_id,setor_id?,obs?,user_id?})
     → CE TED de apontamentos_pcp; setor_id=NULL em transferencias_ordem (bloqueia trigger legado)
POST /api/pcp/ordem-teste                         → só role=desenvolvedor (seção 23)
GET  /api/pcp/[id]                                → detalhe PCP + dados ordem, inclui retorno_metal
GET  /api/pcp/[id]/apontamentos                   → histórico
GET  /api/pcp/[id]/resumo                         → totais por tipo
GET  /api/pcp/[id]/pedras-disponiveis             → pedras tipo3-tipo6 com saldo disponível
GET  /api/pcp/[id]/historico                      → timeline cronológica completa da ordem
GET  /api/pcp/[id]/insumos-transferencia          → insumos pré-preenchidos para transferência
GET  /api/pcp/[id]/outros-disponiveis             → insumos tipo=outros para desconto no peso bruto
POST /api/pcp/saida (body: {pcp_id, peso_bruto, pedras_utilizadas[], foto_balanca, user_id?})
     → BYPASSA trigger (insert peso=0), gerencia manualmente:
       UPDATE pcp (peso_final,pmc,quebra,etapas='concluido')
       UPDATE ordens (status='concluido')
       Baixa SM: saída do dep_operador (insumo_id=1, peso=peso_ouro_real) — SEM entrada no almoxarifado (ouro virou peça, foi consumido)
       CE QUEBRA_PCP: saida dep_operador (insumo_id=1, peso=quebra) — SEM entrada no pote
         → só se quebra > 0 | baixa definitiva | zera vw_ouro_em_producao
       INSERT auditorias (tipo='fabrica', situacao='pendente', rota='saida_pcp')
     → Fórmula PMC: pmc=peso_ouro_real-total_outros-metal_externo
       consumo=total_metal+dist_ouro_real-retorno_metal; quebra=consumo-pmc

── DISTRIBUIÇÃO ──
GET  /api/distribuicao?etapas=em_andamento|concluido
POST /api/distribuicao (body: deposito_id, setor_id?, ordem_ids[], user_id?)
GET  /api/distribuicao/ordens-disponiveis
GET  /api/distribuicao/[id] (dist + ordens: peso_fechamento, pedras_fechamento, foto_fechamento)
POST /api/distribuicao/[id]/saida (body: ordem_id, peso_bruto, pedras_utilizadas[], foto_balanca, user_id)
GET  /api/distribuicao/[id]/pedras-apontadas (pedras com saldo disponível no lote)
POST /api/distribuicao/[id]/concluir (sem body — valida data_baixa em todas ordens, calcula totais, SET etapas='concluido')
POST /api/distribuicao/[id]/estorno (estorno individual)
POST /api/distribuicao/[id]/estorno-lote (5 fases atômicas — só admin/dev/gerente_fabrica)
POST /api/distribuicao/[id]/adicionar-ordens (body: ordem_ids[] — valida não concluída/duplicada/outro lote)
POST /api/distribuicao/apontamentos
GET  /api/distribuicao/[id]/apontamentos

── PCP (novos) ──
PATCH /api/pcp/[id]/atribuir-operador → body: { deposito_id } — trava apontamento tipo 2 pro operador atribuído

── INSUMOS (novos) ──
GET   /api/insumos/fornecedores?q=   → autocomplete fornecedores

── USUÁRIOS (novos) ──
POST  /api/user/avatar               → FormData: file, user_id?
POST  /api/user/alterar-senha        → body: { nova_senha } — isSelfUpdate protegido

── DEPÓSITOS/SETORES ──
GET/POST   /api/depositos
PATCH/DEL  /api/depositos/[id]
GET/POST   /api/setores
PATCH/DEL  /api/setores/[id]

── DASHBOARD ──
GET /api/dashboard/fabrica?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
    → ordens (concluidas/em_producao/aguardando/canceladas), saldo_pote (ouro almox, tempo real),
      ouro_producao (por operador, tempo real), quebra_operadores (período),
      financeiro (saldo_anterior, entradas, saidas, saldo_atual)
GET /api/dashboard/fabrica/movimentacoes?inicio=&fim=&page=&pageSize=
    → movimentacoes_estoque JOIN insumos+depositos, categoria_id=1 (ouro), paginado

── COMPRAS ──
GET  /api/compras/fornecedores          → lista public.contatos para select fornecedor
POST /api/compras                       → nova compra { fornecedor_id?, obs? }
GET  /api/compras/[id]/itens            → itens da compra
POST /api/compras/[id]/itens            → add item { insumo_id, deposito_id?, qtd, valor_unitario? }
                                          trigger trg_calcular_item_compra calcula valor_total
DELETE /api/compras/[id]/itens/[itemId] → remove item (bloqueia se compra.bloqueado)
PATCH /api/compras/[id]/concluir        → UPDATE situacao='concluido' → trigger gera CE + bloqueado=true
  ⚠️ trigger trg_aa_bloquear_compra: lança exception se bloqueado=true → retorna 409

── LANÇAMENTO AVULSO ──
POST /api/lancamentos-avulso            → INSERT { tipo_lancamento, insumo_id, peso, deposito_id?, obs? }
                                          trigger trg_lancamento_avulso executa movimentação automática
                                          enum_tipo_lancamento: entrada|saida|transferencia|sangria

── SERVICE (v2.13.0, migration 092) ──
GET  /api/service/pendentes          → ordens aguardando recebimento pelo operador service
POST /api/service/receber            → operador recebe a peça (foto obrigatória)
GET  /api/service/meus               → serviços em_servico do operador logado
POST /api/service/[id]/concluir      → operador finaliza o serviço (peso_saida + foto + solda + pedras)
POST /api/service/[id]/transferir    → transfere serviço para outro operador
GET  /api/service/solda-saldo        → saldo de solda disponível para o operador
GET  /api/service/painel             → painel gerente: stats, lista serviços, KPIs (ROLES_SERVICE_PANEL)
GET  /api/service/concluidos         → histórico de serviços concluídos
GET  /api/service/operadores         → lista de operadores service ativos
GET  /api/service/[id]               → detalhe completo do serviço
GET  /api/service/pedras             → pedras disponíveis no estoque do operador
POST /api/service/carregar-solda     → registra carregamento de solda para operador

── PURIFICAÇÃO (v2.10.0) ──
GET    /api/purificacao               → lista purificações com filtros
POST   /api/purificacao               → cria purificação
GET    /api/purificacao/[id]          → detalhe purificação
PATCH  /api/purificacao/[id]          → atualiza/conclui purificação
GET    /api/purificacao/teores        → lista teores configurados
POST   /api/purificacao/teores        → cria teor
PATCH  /api/purificacao/teores/[id]   → edita teor
GET    /api/purificacao/liga-tipos    → lista tipos de liga
POST   /api/purificacao/liga-tipos    → cria tipo de liga
PATCH  /api/purificacao/liga-tipos/[id] → edita tipo de liga
GET    /api/purificacao/ligacao       → lista ligações
POST   /api/purificacao/ligacao       → cria ligação
GET    /api/purificacao/ligacao/[id]  → detalhe ligação
PATCH  /api/purificacao/ligacao/[id]  → atualiza/conclui ligação

── CONFIGURAÇÕES ──
GET/PATCH /api/configuracoes/ia
POST      /api/configuracoes/ia/key
GET/PATCH /api/configuracoes/parametros    → parâmetros sistema (cotações, limiares)
GET/PATCH /api/configuracoes/permissoes    → permissões por role e módulo
GET       /api/configuracoes/roles         → lista roles do sistema
PATCH     /api/configuracoes/roles/[nome]  → edita role
GET/PATCH /api/configuracoes/permissoes-usuario → permissões granulares por usuário (5 ações)
GET       /api/user/role?user_id=UUID → retorna role, name, avatar_url
GET       /api/user → lista todos os usuários (admin/dev)
POST      /api/user/avatar (FormData: file, user_id?) → upload bucket avatars
PATCH     /api/user/[id] → body: {nome?,role?,ativo?,deposito_id?,email?,nova_senha?,tipos_ordem_permitidos?}
              email → sync auth.users+usuarios+user_profiles | senha → crypt direto no auth.users
              tipos_ordem_permitidos → JSONB array de tipos ex: ['fabricacao','garantia']

── PRODUTOS ──
GET    /api/produtos
GET    /api/produtos/[id]
PATCH  /api/produtos/[id]                         → campos editáveis: tem_pedra_preciosa, observacao_erp
GET    /api/produtos/[id]/composicao
POST   /api/produtos/[id]/composicao
PATCH  /api/produtos/[id]/composicao/[itemId]
DELETE /api/produtos/[id]/composicao/[itemId]
POST   /api/produtos/[id]/propagar                → propaga medidas/BOM do pai para variações
POST   /api/produtos/[id]/modelo-3d              → upload modelo 3D (.glb/.3dm) + IA extrai ficha técnica (migration 091)
GET    /api/produtos/insumos?categoria_id=N       → lista insumos para dropdown do BOM
GET    /api/produtos/setup                        → nextSku, categorias, cotação ouro/dolar

── PRECIFICAÇÃO ──
(11 rotas — ver arquitetura.md módulo precificação para detalhes)
GET/PATCH /api/precificacao/cotacoes
GET/PATCH /api/precificacao/markup-ouro
GET/PATCH /api/precificacao/markup-pedras
POST      /api/precificacao/simular
POST      /api/precificacao/solicitar-aprovacao
GET       /api/precificacao/pendentes
PATCH     /api/precificacao/aprovar/[id]
PATCH     /api/precificacao/rejeitar/[id]
```

---

## 13. IA — VALIDAÇÃO DE PESO

```
Provedores: claude (claude-sonnet-4-20250514), openai (gpt-4o), gemini (gemini-2.5-flash)
Config: configuracoes_sistema + configuracoes_secrets
Lib: src/lib/ia-validar-peso.ts (parseAIResponse robusto, regex fallback)
Tolerância: ZERO (bloqueia salvamento se não bater)
Comparação: Math.abs(a - b) < 0.005 (float precision)
Input peso: normalizar vírgula → ponto antes de parseFloat
IA desabilitada → aceita sem conferência
Aba IA em /configuracoes: toggle on/off, selecionar provedor, salvar key, testar

⚠️ Modelos reais no banco (27/03/2026 — configuracoes_sistema):
   Claude:  claude-sonnet-4-20250514
   Gemini:  gemini-2.5-flash  (⚠️ NÃO usar gemini-2.0-flash — desatualizado)
   OpenAI:  gpt-4o
   ia_margem_pedra_pct: 10 (tolerância pedras 10%)
```
<!-- Revisado 27/03/2026 -->

---

## 14. TELA INICIAL (rota `/`)

```
Arquivo: src/app/(dashboard)/page.tsx — Server Component
Layout (ordem de cima pra baixo):
  1. Saudação: "Bom dia/Boa tarde/Boa noite, {nome} 👋" + "Bem-vindo ao Alisson ERP"
  2. Leão da marca: /logo.leaoverde.webp — h-80, centralizado, flex-1 (ocupa espaço do meio)
  3. Cards cotação: OURO 24K (R$/g) + DÓLAR (R$) — mt-8, próximos ao fundo
  4. Rodapé: "Atualizado: {data} · Fonte: Fixer API"

Nome do usuário: SELECT nome FROM alissonerp.usuarios WHERE id = {user.id}
  Fallback: user_metadata?.nome → email.split('@')[0] → "Usuário"
Cotações: SELECT ouro, dollar FROM public.parametros LIMIT 1
  Fallback: "Indisponível" se valor = 0 ou NULL
Saudação: hora < 12 = Bom dia | hora < 18 = Boa tarde | else = Boa noite (timezone: America/Sao_Paulo)
Favicon: /logo.leaoverde.webp (definido em layout.tsx metadata.icons)

⚠️ NÃO adicionar gráficos, tabelas, cards de produção ou atalhos — tela LIMPA
```

---

## 14b. SIDEBAR AGRUPADA <!-- Revisado 27/03/2026 -->

```
📊 Dashboard
🔧 Produção      → Dashboard Fábrica, Ordens, PCP, Distribuição, Purificação, Painel Service
📦 Suprimentos   → Estoque, Quebra, Insumos, Compras
🚚 Logística     → Protocolo, Conferência, Entrega
✅ Qualidade     → Auditoria
💼 Comercial     → Vendas, Financeiro, Produtos, Precificação
⚙️ Configurações

Painel Service (/service-painel): grupo PRODUÇÃO, após Purificação (fix 27/03/2026)
  Roles: ROLES_SERVICE_PANEL = admin, desenvolvedor, gerente_fabrica, gerente_loja
  Injetado via modulosEfetivos no Sidebar.tsx quando role qualifica mas banco não retornou o módulo
Service (/service): item solto ANTES dos grupos (flag isOperadorService)
  NÃO é role — flag is_operador_service em alissonerp.usuarios

Dashboard Fábrica (/dashboard-fabrica):
  Roles: desenvolvedor, admin, gerente_fabrica
  Seções: ordens (concluidas/em_producao/aguardando/canceladas), saldo_pote,
          ouro_em_producao, financeiro_ouro, quebra_operadores (alerta>5%),
          movimentacoes_estoque paginadas
  Filtro período: Hoje/7d/30d/Personalizado + botão refresh
  Icon: BarChart2 (lucide)
```

---

## 15. CADASTROS — STATUS

```
✅ Insumos          /insumos — CRUD + saldo do pote
✅ Depósitos        /configuracoes aba — CRUD (ID=1 protegido)
✅ Setores          /configuracoes aba — CRUD (vinculado ao depósito)
✅ IA               /configuracoes aba — provedor, keys, teste
✅ Usuários         /configuracoes aba — listagem + drawer edição (nome/role/ativo/deposito/senha/avatar)
✅ Produtos         /produtos — listagem filtrada + drawer detalhe + BOM (P2.1 + P2.2)
❌ Categorias       sem tela (8 fixas no banco)
❌ Tipos Apontamento sem tela (IDs 1-9 fixos)
```

---

## 22. MÓDULO PRODUTOS (P2)

```
── PÁGINA /produtos (P2.1) ──
Roles: admin, desenvolvedor, gerente_loja (isPrecificacaoAccess)
Filtros: busca (nome/SKU), tipo_metal, tem_pedra_preciosa, situacao
Colunas: SKU, Nome, Metal, Peso, Situação, Preço Sync, Preço Tiny, Δ%
Paginação: 50/página, ordenação por qualquer coluna
Clique na linha → abre ProdutoDrawer

── DRAWER (P2.2) ──
Componente: src/components/produtos/ProdutoDrawer.tsx
Seções:
  1. Dados Básicos    — nome, sku, metal, situação, referência, categoria (readonly)
  2. Precificação     — peso, preços, variação (readonly — calculado por trigger)
  3. Dados ERP        — tem_pedra_preciosa (toggle), observacao_erp (text)
                        PATCH /api/produtos/[id] → campos editáveis
  4. Composição (BOM) — lista produto_composicao, add/edit/remove via API
                        GET/POST /api/produtos/[id]/composicao
                        PATCH/DELETE /api/produtos/[id]/composicao/[itemId]
  5. Ficha Técnica    — placeholder (readonly, remete à tela de Ordens)

── API EXTRA ──
GET /api/produtos/insumos?categoria_id=N
  → SELECT id, descricao, unidade, categoria_id FROM alissonerp.insumos WHERE ativo=true
  → Usada no formulário de adição de item ao BOM

── SIDEBAR ──
Entrada: "Produtos" (icon Tag) no grupo Comercial
Permissões: desenvolvedor, admin, gerente_loja
Posição: após Financeiro, antes de Precificação
```

---

## 16. STORAGE BUCKETS

### Padrão Atual (v2.8+) — TODOS OS BUCKETS SÃO PÚBLICOS

```
✅ TODOS os buckets são PÚBLICOS (public = true) desde v2.8.0
✅ Helper: src/lib/storage.ts (uploadFile, deleteFile, getPublicUrl)
   - Upload server-side com ANON_KEY (fallback; service_role não disponível)
   - upsert: true (sobrescreve se existe)
   - getPublicUrl: guard se já começa com http → retorna direto (evita URL duplicada)
✅ Salvar URL COMPLETA no banco (não path/filename)
✅ Frontend: <img src={campo}> direto (sem signed URLs, sem fetch extra)
✅ Views que listam dados com foto DEVEM incluir coluna foto no SELECT
❌ NUNCA usar createSignedUrl()
❌ NUNCA upload client-side

Policies: SELECT público, INSERT/UPDATE/DELETE autenticado
⚠️ storage.policies NÃO existe (é storage.objects com RLS, não tabela policies)
⚠️ Para listar buckets: SELECT id, name FROM storage.buckets
Referência completa: docs/referencia-storage-imagens.md
```

```
Bucket               Público  Tamanho  Tipos aceitos
─────────────────────────────────────────────────────────────────────────────────
avatars              SIM      10MB     image/jpeg, image/jpg, image/png, image/webp
imagens              SIM      sem lim  sem restrição (legado PDV — NÃO usar para ERP)
protocolo-fotos      SIM      10MB     image/jpeg, image/png, image/webp
apontamento-fotos    SIM      10MB     image/jpeg, image/png, image/webp
ordem-fotos          SIM      10MB     image/jpeg, image/png, image/webp, image/heic
ordem-videos         SIM      100MB    video/mp4, video/webm, video/quicktime, video/avi
insumo-fotos         SIM      10MB     image/jpeg, image/png, image/webp (migration 076)
produto-3d           SIM      50MB     .glb, .3dm (migration 091 — modelos 3D de produtos)

avatars:
  Caminho: {user_id}.{ext}
  URL completa salva em: public.user_profiles.avatar_url
  API: POST /api/user/avatar

ordem-fotos (migration 071):
  Caminho ordens: ordens/{ordemId}/{timestamp}-{userId8}.{ext}
  Caminho comentários: comentarios/{ordemId}/{timestamp}-{userId8}.{ext}
  URL completa salva em: alissonerp.ordens.fotos_paths TEXT[]
                         alissonerp.comentarios_ordem.foto_path TEXT
  APIs: GET/POST/DELETE /api/ordens/[id]/fotos

protocolo-fotos: → campos protocolos.foto_criacao + protocolos.foto_conclusao (URL completa)
apontamento-fotos: → campo apontamentos_pcp.foto_balanca (URL completa)
insumo-fotos: → campo insumos.foto (URL completa, migration 076)

ordem-videos (migration 073):
  Caminho: ordens/{ordemId}/video-{timestamp}-{userId8}.{ext}
  URL completa salva em: alissonerp.ordens.video_observacao TEXT
  Usado em ordens tipo servico_venda

purificacao-fotos:  SIM      10MB     image/jpeg, image/png, image/webp
  Bucket para fotos do módulo Purificação (migrations 084-090)

service-fotos (migration 092):  SIM      10MB     image/jpeg, image/png, image/webp
  Caminhos: service/{servicoId}/recebimento-{timestamp}.{ext}
            service/{servicoId}/conclusao-{timestamp}.{ext}
            service/{servicoId}/fio-solda-{timestamp}.{ext}
  URLs salvas em: servicos.foto_recebimento, servicos.foto_conclusao, servicos.foto_fio_solda
```
<!-- Revisado 27/03/2026 -->

---

## 16b. MÓDULO SERVICE (v2.13.0) <!-- Revisado 27/03/2026 -->

```
OBJETIVO: App mobile dark para operadores de serviço (conserto/garantia de peças)
PÁGINA: /service (app operador, dark theme, mobile-first)
PÁGINA: /service-painel (painel gerente, grupo PRODUÇÃO na sidebar)
ROLES: is_operador_service=true → acessa /service | ROLES_SERVICE_PANEL → acessa /service-painel

COMPONENTES:
  src/components/layout/ServiceLayout.tsx       — layout dark theme, detectado pelo DashboardShell
  src/components/service/ServiceApp.tsx         — app operador (4 views: pendentes, em_servico, concluidos, painel)
  src/components/service/ServiceCamera.tsx      — câmera mobile (navigator.mediaDevices)
    ⚠️ PITFALL: navigator.mediaDevices é undefined em HTTP (só funciona em HTTPS ou localhost)
    Fallback: <input type="file" accept="image/*" capture="environment"> para HTTP
  src/components/service/ServicePainelClient.tsx — painel gerente (Sprint 4)
  src/components/service/ServiceDetalheDrawer.tsx — drawer detalhe serviço
  src/components/service/CarregarSoldaModal.tsx — modal carregar solda para operador

FLUXO DO SERVIÇO:
  1. Ordem tipo servico_venda ou garantia → protocolo ida
  2. fn_concluir_protocolo → cria PCP → trg_criar_servico_from_pcp → cria servicos (status=em_servico)
  3. Operador vê em /service/pendentes (status=aguardando) ou meus (status=em_servico)
     ⚠️ status inicial é 'em_servico' (não 'aguardando') quando operador padrão configurado
  4. POST /api/service/receber → foto obrigatória → status=em_servico
  5. Operador executa serviço, pode carregar solda (POST /api/service/carregar-solda)
  6. POST /api/service/[id]/concluir → peso_saida + foto + solda + pedras → status=concluido
  7. Auditoria fábrica auto-aprovada para serviços (NÃO bloqueia protocolo volta)
  8. REPROVAÇÃO: consultora reprova → cria nova tentativa (servicos.tentativa++)

CONTROLE DE SOLDA (modo A1):
  Pesagem do fio de solda antes/depois (peso_fio_antes, peso_fio_depois)
  consumo_solda = peso_fio_antes - peso_fio_depois
  GET /api/service/solda-saldo → saldo disponível do operador

QUILATES (pedras):
  peso_pedra_ct → gramas: 1 quilate = 0.200 gramas (ct × 0.2)
  TRIGGER trg_calcular_peso_pedra → preenche insumos.peso_pedra automaticamente ao salvar peso_pedra_ct
  Frontend: exibir pedras em quilates (ct), NÃO em gramas

CONFIGURAÇÕES (configuracoes_sistema):
  service_tipos_ordem: ["servico_venda", "garantia"] — tipos que ativam módulo service
  operador_servico_padrao: {"deposito_id": 2} — operador padrão para novos serviços
```

---

## 17. PENDENTES

```
── FICHA TÉCNICA ──
✅ Ficha técnica no modal auditoria — GET /api/ficha/[ordemId] + useEffect AuditoriaModal
✅ Mapeamento ENUMs ficha técnica — migration 033, labels na view + frontend (modelo_1_label etc.)
✅ Peso metal externo no modal auditoria — campo peso_metal_externo em vw_auditorias_completa (migration 039)
❌ Modelo externo anel (aguardando valores do PDV)

── APONTAMENTOS ──
✅ Entrada de Metal (foto + IA + depósito/setor selecionável)
🔄 Aditivo de Metal (depósito/setor do card, estoque validado)
✅ Retorno de Metal (depósito/setor do card, sem filtro estoque, trigger 018 DepOrdem→Dep1)
✅ Entrada de Pedra (qtd UN, IA conta pedras, peso_pedra × qtd, trigger 018 Dep1→DepOrdem)
✅ Resumo no Card PCP (GET /api/pcp/[id]/resumo, seção no PCPDetalheModal)
❌ Tipos 4,6,7 (implementar um a um)

── ESTOQUE ──
✅ Ouro Total: SÓ depósito geral (ID=1) — migration 046 (vw_saldo_pote) + migration 052 (vw_detalhe_pote) + EstoqueClient totalOuro/totalPedrasUn filtram deposito_id===1
✅ Saldo catálogo: vw_detalhe_pote mostra saldo_real SÓ do Almoxarifado (deposito_id=1) — migration 052

── PCP KANBAN ──
✅ Card clicável → painel detalhe + histórico apontamentos
✅ Ações no painel (Apontar, Transferir, Saída) condicionais por etapa
✅ Auto-move novas_ordens → em_andamento após apontamento

── DISTRIBUIÇÃO ──
✅ C1: Kanban 2 colunas (em_andamento/concluido) + modal criar + detalhe ordens
✅ C2: Apontamentos distribuição (foto+IA, tipos 1-3,5-6,8-9, resumo no painel)
✅ C3: Saída por ordem (peso + pedras + foto+IA, botão inline por ordem, trigger cuida CE)
✅ C3b: Rastreamento de Ouro no PCP (dist_ouro_real, dist_pedras_qtd/g, dist_quebra)
✅ C4: Conclusão do lote — balanço do lote (quebra/saldo = ouro_entregue − ouro_pecas)
❌ C5: Conclusão parcial (tarefa pendente)

  Migration 047: ADD deposito_id, setor_id em distribuicoes
  Migration 048: ADD deposito_id em pcp
  Migration 049: ADD foto_balanca em apontamentos_distribuicao
  Migration 050: ADD foto_balanca em fechamentos_distribuicao

  Schema real: distribuicoes.etapas (enum), distribuicao_ordens.ordens_id (NÃO ordem_id)
  fechamentos_distribuicao.ordem_id (ESSE sim é ordem_id)

  TRIGGER fn_criar_fechamento_por_ordem: cria fechamento vazio ao INSERT em distribuicao_ordens
  TRIGGER fn_processar_fechamento_dist: ao UPDATE fechamento SET peso>0 (PRIMEIRA VEZ):
    → CE: TEDD (dep_dist → almoxarifado, insumo=1 como proxy)
    → PCP: total_metal += pmc, total_pedras_un += total_pedras_un
    → ordens.local_atual = 1
    → itens_ordem_insumos: cópia dos itens da distribuição
  GUARD: não reprocessa se OLD.peso já era > 0

  C3 — SAÍDA POR ORDEM (lógica completa):
    Migration 051: ADD colunas em distribuicao_ordens + CREATE distribuicao_saida_pedras

    FÓRMULA SAÍDA (por ordem — SÓ dados físicos):
      peso_bruto     = peso da peça na balança (ouro + pedras)
      peso_pedras    = Σ(qtd_utilizada × insumos.peso_pedra)
      peso_ouro_real = peso_bruto − peso_pedras
      NÃO grava quebra nem ouro_entregue por ordem
      Pedras consumidas: ficam na peça — NÃO voltam ao estoque (sem CE)

    FÓRMULA BALANÇO DO LOTE (na conclusão):
      ouro_entregue = (tipos 1+2 metal) − tipo 5 (retorno), dos apontamentos
      ouro_pecas    = Σ distribuicao_ordens.peso_ouro_real de TODAS as ordens
      quebra_lote   = ouro_entregue − ouro_pecas
        > 0 → QUEBRA (perdeu ouro)
        < 0 → SALDO (sobrou ouro residual)
        = 0 → ZERADO

    REGRA: quebra/saldo é do LOTE INTEIRO — NUNCA por ordem individual

    CE DE BAIXA DA QUEBRA (automático na conclusão do lote):
      Se quebra_lote > 0:
        INSERT movimentacoes_estoque: saida do deposito_id do lote, insumo_id=1,
        campo saida=quebra_lote, marcador='QUEBRA_LOTE' (sem entrada no pote)
        → vw_ouro_em_producao zera para o operador
      Se quebra_lote <= 0: não cria CE (saldo residual fica no operador)

    APIs:
      GET /api/distribuicao/[id]/pedras-apontadas
        → retorna pedras com saldo: entrada(tipo3) − retorno(tipo6) − já usadas em saídas
        → usa CTE com distribuicao_saida_pedras para subtrair usadas
      POST /api/distribuicao/[id]/saida
        Body: { ordem_id, peso_bruto, pedras_utilizadas: [{insumo_id, qtd_utilizada}], foto_balanca, user_id }
        1. Verificar doo.data_baixa = null (não fechada ainda)
        2. Para cada pedra: buscar insumos.peso_pedra, calcular peso_total
        3. Calcular ouro_entregue dos apontamentos tipo 1+2−5 WHERE categoria_id=1
        4. INSERT distribuicao_saida_pedras para cada pedra usada
        5. UPDATE distribuicao_ordens SET peso_bruto, peso_pedras, peso_ouro_real, quebra, ouro_entregue, data_baixa, saida_por, foto_balanca
        6. UPDATE fechamentos_distribuicao SET peso=ouro_real → trigger TEDD+PCP
      7. Lookup pcp_id via pcp.ordem_id → recalcularTotaisPCP (fire-and-forget)

    TABELAS:
      distribuicao_ordens: id, distribuicao_id, ordens_id, peso_bruto, peso_pedras, peso_ouro_real, data_baixa, saida_por, foto_balanca
        [quebra e ouro_entregue existem mas NÃO são gravados na saída — cols legadas]
      distribuicoes: ..., ouro_entregue, ouro_pecas, quebra_lote (migration 054)
      distribuicao_saida_pedras: id, distribuicao_ordem_id FK, insumo_id FK, qtd_utilizada, peso_unitario, peso_total

    FRONTEND:
      Modal: FecharOrdemDistModal.tsx
        props: distribuicaoId, depositoNome, ouroEntregue (=total_metal−retorno_metal), ordem: OrdemInfo|null
        Carrega pedras via GET pedras-apontadas ao abrir
        Cálculo em tempo real (pesoPedrasTotal, ouroReal, quebraGramas, quebraPct)
        IA valida peso_bruto (tolerância zero)
      Botão "📤 Registrar Saída" inline por ordem (só ordens sem data_baixa)
      Resumo pós-saída: bruto Xg | pedras Xg | ouro Xg | quebra Xg
      "Concluída" = data_baixa NOT NULL (ou peso_fechamento > 0 para legado)

  C2 — APONTAMENTOS:
    API: POST /api/distribuicao/apontamentos, GET /api/distribuicao/[id]/apontamentos
    Modal: ApontamentoDistModal.tsx (props: distribuicaoId, depositoId, setorId, depositoNome, setorNome)
    Tipos 1-9 exceto 4,7 (scope pcp-only)
```

---

## 17b. USUÁRIOS — ESTRUTURA DE DADOS

```
alissonerp.usuarios  (tabela principal dos usuários, 23 registros)
  id(uuid), email, nome, role(enum_role), ativo(bool), deposito_id(int) [adicionado],
  vendedor_id, mx_desconto_permitido, created_at, updated_at

public.user_profiles  (só usuários que logaram via Supabase auth, PK=id_user)
  id_user(uuid), email, password_hash, name, role(varchar), avatar_url(text),
  phone, created_at, updated_at, last_login, is_active(bool), vendedor_id, mx_desconto_permitido

auth.users  (gerenciado pelo Supabase, senha em encrypted_password)

Roles (enum_role): admin, gerente_fabrica, gerente_loja, ourives, motoboy,
                   consultora, estoquista_fabrica, estoquista_loja, pcp

Componentes: UserAvatar (iniciais fallback), UserEditDrawer (drawer lateral)
  UserAvatar props: nome, fotoUrl, size?, className?, userId?, clickable?
    clickable=true + userId → Link pra /configuracoes?tab=usuarios&user=UUID
    Só ativar clickable para admin/desenvolvedor (isFullAccess)
  UserEditDrawer props: userLogadoId? → desabilita role select se editando si mesmo
  /configuracoes lê ?tab=usuarios&user=UUID → auto-switch tab + abre drawer

Alterar senha: UPDATE auth.users SET encrypted_password=crypt($1,gen_salt('bf')) WHERE id=$uuid
Alterar email: UPDATE auth.users SET email=$1, email_confirmed_at=now() WHERE id=$uuid
              + UPDATE alissonerp.usuarios SET email=$1
              + UPDATE public.user_profiles SET email=$1 (se existir)
⚠️ auth.users.id = alissonerp.usuarios.id (mesmo UUID) — NUNCA usar JOIN por email
⚠️ Email atualizar SEMPRE nos 3 lugares: auth.users + usuarios + user_profiles
⚠️ REGRA: Usuário NUNCA pode alterar sua própria role — protegido no frontend (disabled) E no backend (role ignorada se user.id===id)
```

---

## 17c. PRODUTOS + PRECIFICAÇÃO

```
── TABELA public.produtos (14.812 registros, READONLY pela app) ──
PK: id_produto (BIGINT) — NUNCA usar 'id'
Campos preço: preco_tiny (Tiny ERP), preco_sync (calculado), preco_total_sync (ouro+pedras)
Campos markup: peso_precificado, markup, fator, categoria_precificacao, tipo_de_pedra
Campos novos (migration 055): tem_pedra_preciosa, preco_pedras, preco_total_sync

── FONTE DE VERDADE PRECIFICAÇÃO ──
public.parametros.ouro = 857.019 R$/g → trigger atualizar_preco_produto usa ESTE
alissonerp.parametros.cotacao_ouro = 398.72 → informativo ERP (câmbio/outro contexto)
⚠️ SÃO DIVERGENTES — nunca confundir. Precificação = public.parametros.

── TRIGGERS INTOCÁVEIS (precificam 14.812 produtos) ──
trigger_atualizar_preco_produto / atualizar_preco_produto()
z_trigger_atualiza_diferenca_percentual / calcular_diferenca_percentual()
trigger_parametros_atualizados / disparar_atualizacao_produtos()
trigger_arredondar_peso / arredondar_peso_para_cima()
on_produtos_update / registrar_modificacao_produtos()
on_product_update / atualiza_obs_produto()
NUNCA alterar. NUNCA recriar. NUNCA adicionar triggers em public.produtos.

── FÓRMULA PRECIFICAÇÃO OURO ──
custo_na_cotacao = public.parametros.ouro × fator × peso_precificado
preco_na_cotacao = custo_na_cotacao × markup
preco_sync       = arredondado para dezena (<5→baixo, ≥5→cima)
preco_total_sync = preco_sync + preco_pedras (quando BOM populado)

── PRECIFICAÇÃO PEDRAS (novo, migration 057) ──
alissonerp.markup_pedras: faixas por tamanho em ct (5 faixas: 0–0.03→3x, ..., >1ct→1.5x)
Lookup: WHERE tamanho_min <= :ct AND tamanho_max > :ct AND ativo = true
custo_pedra  = preco_compra_usd × cotacao_dolar × markup_pedra
preco_pedras = Σ(custo_pedra × quantidade para tipo='pedra' no BOM)

── BOM — alissonerp.produto_composicao (migration 056) ──
produto_id BIGINT → ref public.produtos.id_produto
insumo_id INTEGER → ref alissonerp.insumos.id
tipo: 'metal' (gramas) | 'pedra' (unidades, tem tamanho + preco_compra_usd) | 'outro'
Fase 1: BOM informativo + cálculo pedras; ouro ainda usa peso_precificado legado
Fase 3 (futuro): ouro usará BOM.peso_metal com fallback para peso_precificado

── MARKUP OURO (existente) ──
public.categoria_precificação: 9 faixas por peso (IDs 102-110, curvePoints JSONB)
Gerenciado pelo sistema legado — não tocar.

── PEDRAS COM PREÇO (tipo_de_pedra) ──
1138 produtos com tem_pedra_preciosa=true
Tipos: Diamante(798), Zircônia(185), Moissanite(151), Ônix(3), Espinélio(1)
Produtos com Diamante frequentemente têm markup=null (não precificados automaticamente)

── PREÇO DE COMPRA AUTOMÁTICO (migration 061) ──
insumos.ultimo_preco_compra_usd NUMERIC(10,4) — último preço unitário de compra em USD
insumos.data_ultimo_preco TIMESTAMPTZ         — data/hora da última atualização

FLUXO:
  PATCH /api/produtos/insumos { insumo_id, preco_compra_usd }
    → UPDATE insumos SET ultimo_preco_compra_usd, data_ultimo_preco
    → TRIGGER trg_propagar_preco_insumo → UPDATE produto_composicao.preco_compra_usd WHERE tipo='pedra'
    → recalcularPrecoPedras() para cada produto_id afetado → UPDATE public.produtos
  GET /api/produtos/insumos → retorna ultimo_preco_compra_usd + data_ultimo_preco
  BomRowForm: selecionar insumo (tipo=pedra) → auto-preenche precoUsd + badge "ultimo preco: US$ X.XXXX em DD/MM/AAAA"

REGRA: Preço pedra = último preço compra, propaga automaticamente via trigger
REGRA: trigger só atualiza produto_composicao — NÃO toca public.produtos (só recalcularPrecoPedras)
```

---

## 18. PITFALLS

```
⚠️ numero_pedido: public.vendas (não pedidos)
⚠️ Clientes: public.contatos (não alissonerp.clientes)
⚠️ Saldo: vw_saldo_estoque.saldo (não insumos.saldo legado; vw_saldo_estoque NÃO tem coluna saldo_real)
⚠️ Saldo pedras: migrado do campo legado insumos.saldo via entrada inicial (10/03/2026)
    backup: alissonerp.backup_mov_pedras_20260310 (90 rows deletadas, 232 entradas criadas)
    marcador usado: ENTRADA, data_hora: 2020-01-01 (para aparecer antes dos apontamentos)
⚠️ Ouro Total: SÓ depósito geral ID=1 (outros são operadores)
⚠️ Gemini: gemini-2.0-flash (em uso e funcionando — atualizar quando necessário)
⚠️ Role motoboy: enum real é 'motoboy' — usar 'logistica' causa erro de constraint
⚠️ IA vírgula: normalizar "2,02" → 2.02 antes de comparar
⚠️ IA float: Math.abs(a-b) < 0.005 em vez de ===
⚠️ Peso ouro: sempre exibir com 2 casas decimais via .toFixed(2) ou formatPeso() de src/lib/formatters.ts
⚠️ Pedras: NUNCA exibir qtd como gramas. Mostrar "X UN (Y.YYg)" onde Y = qtd × peso_pedra
   Resumo Pedras: saldo = entrada_qtd - retorno_qtd (não soma; igual ao metal)
⚠️ sql.begin(): parâmetro do callback usar 'tx' NÃO 'sql' (conflito de tipo TypeScript)
⚠️ getPublicUrl: guard se já começa com http → retorna direto (evita URL duplicada)
⚠️ depositoId: NUNCA fallback silencioso — erro 400 se sem operador
⚠️ user_profiles: PK em id_user + UNIQUE em email — JOINs SEMPRE por id_user (nunca por email)
⚠️ Estorno lote: filtrar CEs por obs ILIKE '%distribuicao #ID%' (não pegar CEs de outros lotes)
⚠️ Pedras: quantidade em UN, nunca exibir como gramas (mostrar "X UN (Y.YYg)")
⚠️ metal_externo: subtrair do PMC (ouro do cliente ≠ ouro da joalheria)
   total_metal=0 → sem quebra, sem CE (peça inteira do cliente)
⚠️ saidas_ordem.metal_externo: DEFAULT 0 (não nullable)
⚠️ distribuicao_ordens.sem_peso: flag para saída sem peso físico (justificativa obrigatória)
⚠️ fn_concluir_protocolo / fn_processar_auditoria: NÃO MEXER
⚠️ fn_processar_transferencia (migration 019): trigger de transferência LEGADO
   Guard: só processa se setor_id IS NOT NULL AND deposito_id IS NOT NULL
   Usa ordens.local_atual (pode estar desatualizado) + itens_ordem_insumos (dados legados)
   Nossa rota /api/pcp/transferir insere transferencias_ordem com setor_id=NULL para
   BLOQUEAR este trigger intencionalmente — movimentacoes são criadas via apontamentos_pcp
   ❌ NUNCA inserir transferencias_ordem com setor_id≠NULL a partir do novo sistema PCP
⚠️ PostgREST: supabase.from() falha pro alissonerp
⚠️ Cache Next.js: rm -rf .next após ~24h
⚠️ Apontamento: após salvar, mover PCP novas_ordens→em_andamento
⚠️ Depósito = Operador (label "Depósito/Operador" na UI)
⚠️ Marcador 'QUEBRA_LOTE': saída sem par no pote — baixa definitiva da quebra
   do lote de distribuição. Diferente de SM (saída PCP) e TA (transferência).
   vw_ouro_em_producao zera o operador ao receber esta CE.
⚠️ Marcador 'QUEBRA_PCP': saída sem par no pote — baixa definitiva da quebra
   da saída do PCP. Junto com 'QUEBRA_LOTE' (distribuição), são as únicas
   saídas sem CE dupla no sistema.
⚠️ % Quebra: fórmula ÚNICA em todo o sistema:
   metal_liquido = total_metal - retorno_metal
   % = quebra / metal_liquido × 100
   Guard: metal_liquido <= 0 → % = 0
   NUNCA dividir por PMC (distorce pra cima)
⚠️ Saída PCP: NÃO faz entrada no Almoxarifado. Ouro virou peça = consumido.
   Movimentação: só baixa (saída) do depósito do operador.
⚠️ auditorias.tipo_auditoria: coluna REAL é tipo_auditoria, NÃO 'tipo'
   varchar(10), valor correto: 'saida_pcp' (9 chars), NÃO 'saida_producao' (14 chars)
⚠️ WHERE id = ${uuidVar}::uuid em coluna INTEGER: causa erro de cast no PostgreSQL
   SEMPRE verificar o tipo real da coluna antes de usar casts
   FIX: parseInt(id) para colunas INT, sem ::uuid
⚠️ itens_ordem tem DUAS fontes:
   ordens legadas (origem='legado'): itens em directus.itens_ordem_1 (bridge: directus_ordem_id)
   ordens ERP (origem='erp'):       itens em alissonerp.itens_ordem (FK: ordem_id)
   API /api/ordens/[id]/itens detecta automaticamente via campo origem
⚠️ servico_loja: enum value existe (migration 073) mas está ESCONDIDO do frontend
   Dropdown "Nova Ordem" não exibe servico_loja — 0 ocorrências de servico_loja no frontend
⚠️ tipos_ordem_permitidos: JSONB array em alissonerp.usuarios
   [] vazio → usuário NÃO pode criar ordens
   admin/desenvolvedor ignoram (fullAccess)
   Verificar SEMPRE ao implementar qualquer criação de ordem
```

---

## 19. REGRA DE SEGURANÇA

```
ANTES  → ler MEMORY.md, consultar banco (SELECT column_name), mapear impacto
DURANTE → CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, nunca refatorar
DEPOIS  → testar novo + antigo + impactados
NUNCA   → inventar nomes, supabase.from(alissonerp), deixar pontas soltas
NUNCA   → escrever INSERT/UPDATE sem confirmar colunas existem
```

---

## 20. MIGRATIONS

```
001-013: Schema base + config + RLS + Realtime
014-016: Views
017-022: Auth + triggers (PCP, transferência, distribuição, protocolo, compras)
023-025: Storage + financeiro + webhooks
026-027: Auditoria + ponte PDV
031-032: Timeline + grants ficha técnica
035: numero_pedido (vendas + trigger ponte)
040: Fix rota protocolo pra serviço
041: Protocolo fotos + views filtro
042: Insumos (unidade, descricao) + views saldo_pote + detalhe_pote
     ⚠️ SEM arquivo .sql — aplicada diretamente no banco. Risco em reset/staging.
043: Configuracoes IA (sistema + secrets)
044: Fix configuracoes_sistema + modelo gemini
045+: Depósitos/setores + apontamentos PCP + bucket apontamento-fotos
049-051: foto_balanca apontamentos/fechamentos + distribuicao_ordens saída + distribuicao_saida_pedras
052: Fix vw_detalhe_pote (saldo_real só deposito_id=1)
053: ADD dist_ouro_real, dist_pedras_qtd, dist_pedras_g, dist_quebra em pcp
054: ADD distribuicoes.ouro_entregue, ouro_pecas, quebra_lote (balanço do lote)
055: ADD public.produtos.tem_pedra_preciosa + preco_pedras + preco_total_sync (1138 com pedra)
056: CREATE alissonerp.produto_composicao (BOM: produto_id BIGINT → insumo_id INT)
057: CREATE alissonerp.markup_pedras (5 faixas por tamanho em ct)
058: CREATE alissonerp.configuracoes_sistema (precificacao: limiar, arredondamento)
059: CREATE alissonerp.markup_alteracoes (fila aprovação markup pedras)
060: ADD public.produtos campos ERP (tem_pedra_preciosa, observacao_erp)
061: ADD alissonerp.insumos.ultimo_preco_compra_usd + data_ultimo_preco
     CREATE fn_propagar_preco_insumo + trg_propagar_preco_insumo
     Popula a partir de movimentacoes_estoque.preco_compra (mais recente por insumo)
066: CREATE alissonerp.quebra_operador (dashboard-ready, desnormalizado)
     CREATE vw_saldo_pote_ouro (saldo ouro cat=1 no depósito=1)
     CREATE vw_ouro_em_producao (saldo ouro por operador, dep!=1)
     CREATE vw_quebra_operadores (quebra agrupada por operador)
067: CREATE alissonerp.role_permissoes (granular por módulo: modulo, leitura, escrita)
     CREATE GET /api/configuracoes/roles, /api/configuracoes/permissoes, /api/user/permissoes
068: MIGRAR usuarios.role de ENUM → VARCHAR(50)
     DROP TYPE enum_role CASCADE (removeu fn_user_role + 26 policies)
     RECRIAR fn_user_role RETURNS VARCHAR(50)
     RECRIAR fn_handle_new_user (trigger auth.users INSERT)
     RECRIAR 26 RLS policies (sem ::enum_role)
     ADD role_permissoes.ativo BOOLEAN
     CREATE alissonerp.roles (metadados das roles válidas, seed 10 roles)
069: CREATE alissonerp.comentarios_ordem (tabela nova, substitui ordem_comentarios legada)
     RENAME notificacoes.user_id → usuario_id
     ADD notificacoes: link, ordem_id, comentario_id, remetente_id, lida_em
     ADD realtime para comentarios_ordem + notificacoes
070: RLS para comentarios_ordem + notificacoes
071: ADD comentarios_ordem.foto_path, excluido, excluido_em, excluido_por, texto_original
     ADD alissonerp.ordens.fotos_paths TEXT[]
     CREATE bucket 'ordem-fotos' (privado, 10MB, heic incluído)
     RLS storage.objects para ordem-fotos (upload/select/delete autenticados)
072: ADD public.user_profiles.avatar_url IF NOT EXISTS
     ENSURE UNIQUE constraint em user_profiles.id_user (necessária para ON CONFLICT)
073: RENAME enum value 'servico' → 'servico_venda' em enum_tipo_ordem (105 ordens migradas)
     ADD enum value 'servico_loja' em enum_tipo_ordem (oculto no frontend)
     ADD alissonerp.ordens: foto_peca_servico TEXT, peso_peca_servico NUMERIC(10,2), video_observacao TEXT
     ADD alissonerp.ordens.origem VARCHAR(20) DEFAULT 'erp' NOT NULL
     CREATE alissonerp.itens_ordem (id SERIAL, ordem_id, produto_id, nome_produto, sku, quantidade, peso_estimado, observacao)
     ADD alissonerp.usuarios.tipos_ordem_permitidos JSONB DEFAULT '[]'
     CREATE bucket 'ordem-videos' (100MB, mp4/webm/quicktime/avi)
     UPDATE trigger ponte: "1" → 'servico_venda' (não mais 'servico')
     RECREATE views: vw_ordens_completa, vw_ordens_por_tipo, vw_ordem_detalhe
074: CREATE alissonerp.itens_ordem_erp + permissões associadas
075: ADD alissonerp.ordens.detalhes_ordem TEXT — campo texto livre por ordem
076: ADD alissonerp.insumos.foto TEXT + observacao TEXT
     CREATE bucket 'insumo-fotos' (público)
     InsumoEditDrawer: foto, fornecedor, peso_pedra, ativo
077: ADD distribuicao_ordens.sem_peso BOOLEAN + justificativa_sem_peso TEXT
     Dropdown motivos de saída sem peso
078: ADD alissonerp.saidas_ordem.metal_externo NUMERIC DEFAULT 0
     Fórmula PMC: pmc = peso_ouro_real - total_outros - metal_externo
     total_metal=0 → sem quebra, sem CE
079: ADD marcadores SP (Saída Pedra) + QBP (Quebra Pedra) ao enum controle_estoque
     Baixa definitiva de pedras na saída PCP (operador informa pedras usadas)
080: CREATE alissonerp.estornos_distribuicao (distribuicao_id, ordem_id NULLABLE, motivo,
     justificativa, estornado_por UUID, dados_revertidos JSONB)
     (renumerada como 081 no arquivo)
082: ADD estornos_distribuicao.ordem_id NULLABLE (era NOT NULL originalmente)
083: ADD lancamentos.deposito_destino_id + trigger atualizado (transferência avulsa com destino)
```

---

## 21. USUÁRIOS TESTE

| Email | Senha | Role |
|-------|-------|------|
| admin@alisson.com | Admin@123 | desenvolvedor |
| gerente@alisson.com | Gerente@123 | gerente_fabrica |
| ourives1@alisson.com | Ourives@123 | ourives |
| motoboy@alisson.com | Motoboy@123 | motoboy |
| consultora@alisson.com | Consultora@123 | consultora |
| pcp@alisson.com | PCP@123 | pcp |

---

## 23. ORDENS DE TESTE (Desenvolvimento)

```
API: POST /api/pcp/ordem-teste (só role=desenvolvedor)
Número: T-0001, T-0002... (sequencial, prefixo T-)
Campo: alissonerp.ordens.eh_teste BOOLEAN DEFAULT false
Migration: 065_ordens_eh_teste.sql

Fluxo: cria ordem + PCP em 1 passo (sem venda/protocolo/distribuição)
Etapas: novas_ordens (crua, sem apontamento) | aguardando (local_atual=1/Almox) | em_andamento (local_atual=operador)
Default no modal: novas_ordens
Badge: 🧪 no card do Kanban (pcp.eh_teste = true)
Botão: visível SOMENTE para role=desenvolvedor

Ordem de teste funciona igual à real: apontar, transferir, saída, histórico
```

---

## 24. QUEBRA DE OURO POR OPERADOR

```
REGRA INVIOLÁVEL: Pote (depósito ID=1) NUNCA registra quebra.
QUEBRA = ouro_recebido − ouro_entregue
  > 0 → perdeu ouro  |  < 0 → saldo (sobrou)  |  = 0 → zerado

QUANDO REGISTRA:
  1. Transferência operador→operador: quebra do operador de ORIGEM
     tipo='transferencia'
     ouro_recebido = SUM(entradas cat=1) no depósito de origem para aquela ordem
     ouro_entregue = quantidade do insumo_id=1 sendo transferido
  2. Saída PCP (conclusão): quebra do operador que finalizou
     tipo='saida_pcp'
     ouro_recebido = SUM(entradas cat=1) no depósito do operador para aquela ordem
     ouro_entregue = peso_ouro_real (bruto − pedras − outros)
  3. Conclusão do lote de distribuição: quebra do operador do lote
     tipo='conclusao_lote'
     ouro_recebido = ouro_entregue (Σ apontamentos metal − retorno)
     ouro_entregue = ouro_pecas (Σ peso_ouro_real das ordens)
     quebra_lote=0 → NÃO registra

QUANDO NÃO REGISTRA:
  ❌ Pote → operador (primeira transferência): deposito_id=1, sem quebra
  ❌ Pote em qualquer situação: NUNCA
  ❌ Conclusão de lote com quebra_lote=0

TABELA: alissonerp.quebra_operador (migration 066)
  Campos desnormalizados: numero_ordem, deposito_nome, setor_nome, insumo_nome
  tipo: 'transferencia' | 'saida_pcp' | 'conclusao_lote'
  distribuicao_id: nullable — preenchido apenas para tipo='conclusao_lote'
  ordem_id, pcp_id: nullable — NULL para tipo='conclusao_lote'

OBS vw_ouro_em_producao:
  Exibe saldo FÍSICO real no depósito (movimentacoes_estoque).
  O ouro da quebra permanece no depósito do operador (pó/resíduo físico).
  NÃO zera ao registrar quebra_operador — só zera com CE (sangria).

LIB: src/lib/registrar-quebra.ts
  registrarQuebra(dados: RegistroQuebra) → INSERT + retorna registro
  buscarOuroRecebido(ordem_id, deposito_id) → SUM(entradas cat=1) no depósito

VIEWS (migration 066):
  vw_saldo_pote_ouro    → saldo ouro (cat=1) no almoxarifado (depósito=1)
  vw_ouro_em_producao   → saldo ouro por operador (depósito!=1)
  vw_quebra_operadores  → quebra agrupada por operador (para dashboard)

API: GET /api/dashboard/fabrica?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
  Retorna: ordens (contagens), saldo_pote, ouro_producao,
           quebra_operadores (no período), financeiro (entradas/saídas/saldo)
  saldo_pote e ouro_producao são TEMPO REAL (sem filtro período)
```

---

## 25. GO-LIVE E RESET DO BANCO (18/03/2026)

```
── RESET TOTAL ──
TRUNCATE com RESTART IDENTITY CASCADE em 18 tabelas transacionais:
  ordens, pcp, saidas_ordem, apontamentos_pcp, distribuicoes, distribuicao_ordens,
  distribuicao_saida_pedras, transferencias_ordem, protocolos, protocolo_ordens,
  protocolo_fotos, auditorias, quebra_operador, movimentacoes_estoque,
  controle_estoque, comentarios_ordem, notificacoes, markup_alteracoes

Storage limpo: apontamento-fotos, protocolo-fotos, ordem-fotos (0 arquivos)
Tabela backup_mov_pedras_20260310 dropada
Cadastros intactos: insumos(251), depositos(8), setores(10), tipos_apontamento(9),
  usuarios, roles, produto_composicao, markup_pedras, configuracoes

── MIGRAÇÃO DE ORDENS DO DIRECTUS ──
443 ordens migradas: directus.ordens (situacao='2') → alissonerp.ordens
  origem='legado' para todas (campo adicionado na migration 073)
  Mapeamento: tipo_ordem (CASE diretamente no SQL), rota (servico→protocolo),
              numero_pedido (lookup public.vendas), id_ordem_relacionada (45 links)
  Sequence ajustada: próximo ID = 1330

23 ordens receberam auditoria loja pendente (para produção imediata):
  C-1082, C-1066, C-1065, C-1062, C-1098, C-1100, C-1029, C-1129, C-1173,
  C-1175, C-1183, C-1185, C-1187, C-0374, C-0931, C-0966, C-0965, C-0978,
  C-1021, C-1080, C-1033, C-0583, C-1189

── ITENS DAS ORDENS LEGADAS ──
Source: directus.itens_ordem_1 (541 itens)
Colunas: id, ordem_id (FK → directus.ordens), produto_id (FK → public.produtos.id_produto), qtd
Bridge: alissonerp.ordens.directus_ordem_id → directus.itens_ordem_1.ordem_id
API: GET /api/ordens/[id]/itens (detecta automaticamente a origem da ordem)
Componente: src/components/ordens/ItensOrdemSection.tsx
Posição na UI: acima das tabs, abaixo dos cards Comercial/Produção
```

---

## 26. MÓDULO CRIAÇÃO DE ORDENS (18/03/2026)

```
── TABELA ──
alissonerp.itens_ordem (desnormalizada para performance):
  id SERIAL PK
  ordem_id INTEGER FK → alissonerp.ordens.id
  produto_id BIGINT FK → public.produtos.id_produto
  nome_produto TEXT     ← desnormalizado
  sku TEXT              ← desnormalizado
  quantidade INT
  peso_estimado NUMERIC(10,2)
  observacao TEXT
  created_at TIMESTAMPTZ

── PERMISSÕES DE CRIAÇÃO ──
alissonerp.usuarios.tipos_ordem_permitidos JSONB DEFAULT '[]'
  [] vazio = sem acesso a criar ordens
  ['fabricacao', 'garantia'] = só esses tipos
  admin/desenvolvedor ignoram a coluna (fullAccess sempre)
  Gerenciado em: UserEditDrawer → seção "Permissões de Criação"
  PATCH /api/user/[id] com campo tipos_ordem_permitidos

── APIS ──
POST /api/ordens              → cria ordem + itens (alissonerp.itens_ordem) + auditoria loja
GET  /api/ordens/contatos     → ?busca= autocomplete clientes (public.contatos)
GET  /api/ordens/vendedores   → lista vendedores ativos (public.vendedores)
GET  /api/ordens/produtos-busca → ?busca= busca produtos (public.produtos + erp_produtos)

── FLUXO DE CRIAÇÃO ──
1. Botão "Nova Ordem" → dropdown com 7 tipos (ícones Lucide por tipo)
   Visibilidade: filtra pelos tipos_ordem_permitidos do usuário (admin/dev = tudo)
2. Clicar tipo → abre NovaOrdemModal com badge tipo fixo (não editável)
3. Modal: autocomplete cliente (debounce 300ms), autocomplete produto, peso estimado
4. Para servico_venda: campos obrigatórios adicionais:
   foto_peca_servico: upload com compressão canvas (obrigatório)
   peso_peca_servico: peso da peça em gramas (obrigatório)
   video_observacao: upload vídeo direto para bucket ordem-videos (opcional)
5. Salvar: transação atômica — INSERT ordens + itens_ordem + auditorias
6. Número da ordem = MAX(alissonerp.ordens.id, directus.ordens.id) + 1 (evita colisão)

── COMPONENTES ──
src/components/ordens/NovaOrdemModal.tsx      → modal criação (autocomplete, upload, validação)
src/components/ordens/ItensOrdemSection.tsx   → exibe itens na página /ordens/[id]
src/components/ordens/NovaOrdemButton.tsx     → botão dropdown com 7 tipos

── CARD PEÇA DO CLIENTE ──
Visível somente para tipo=servico_venda na página /ordens/[id]
Exibe: foto da peça na balança + peso + player de vídeo (se houver)
Componente: integrado em OrdemDetalheClient.tsx
```

---

## 27. MOBILE RESPONSIVO (18/03/2026)

```
── BREAKPOINT ──
md: 768px (padrão Tailwind)
Abaixo de md = mobile | Igual ou acima = desktop

── HEADER MOBILE ──
MobileHeader.tsx (src/components/MobileHeader.tsx)
  Header fixo h-14 com: ☰ (toggle sidebar) + logo ALISSON + avatar (só < 768px)
  DashboardShell.tsx: SidebarProvider + MobileHeader + mt-14 md:mt-0

── SIDEBAR MOBILE ──
SidebarContext.tsx (src/contexts/SidebarContext.tsx)
  Context com isOpen/setIsOpen — controla abertura no mobile
Sidebar.tsx: desliza da esquerda (translate-x) com overlay escuro (z-50 mobile, fixo desktop)

── TABELAS ──
Dual render: hidden md:block (tabela) + block md:hidden (cards)
MobileCard.tsx (src/components/ui/MobileCard.tsx): componente reutilizável para cards de tabela

── MODAIS ──
15 modais: bottom-sheet no mobile (rounded-t-2xl, w-full, bottom-0) | normal no desktop
4 drawers: w-full mobile | largura original desktop

── KANBAN ──
PCP e Distribuição: overflow-x-auto snap-x snap-mandatory no mobile
Colunas Kanban: min-w-[280px] snap-start

── FILTROS ──
Colapsáveis no mobile: toggle button + flex-col md:flex-row

── NOTIFICAÇÕES ──
NotificacoesDrawer: left-0 md:left-56 (para não sobrepor sidebar desktop)

── PROTOCOLO MOBILE ──
Cards resumo compactos (h-12), ordens como cards clicáveis
Botão "Criar Protocolo" fixo no bottom (mobile)
Modal criar: full screen no mobile

── ESCOPO ──
39 arquivos com grids/padding/gaps responsivos
```

---

## 28. PWA (18/03/2026)

```
── ARQUIVOS ──
public/manifest.json
  name: "ALISSON ERP" | short_name: "ALISSON"
  display: standalone | theme_color: #184036
  9 ícones (72px → 512px + apple-touch + maskable)
  start_url: /

public/sw.js
  Estratégia: network-first para tudo exceto assets estáticos
  Cache: alisson-erp-v2.4.0
  Ignora: /api/ e qualquer URL supabase (dados nunca ficam no cache)
  Fallback offline: /offline.html (página verde com logo + botão retry)

public/offline.html
  Página verde (#184036) com logo leão branco + botão "Tentar Novamente"

public/icons/
  Leão branco sobre fundo #184036, 10 tamanhos:
  icon-72.png, icon-96.png, icon-128.png, icon-144.png, icon-152.png,
  icon-192.png, icon-384.png, icon-512.png, apple-touch-icon.png, icon-512-maskable.png

── REGISTRO ──
ServiceWorkerRegister.tsx (src/components/ServiceWorkerRegister.tsx)
  Registra SW via componente React (lado client)
  Incluído em src/app/layout.tsx

── FAVICON ──
Leão branco em fundo escuro (removida referência leaoverde.webp)

── VERSÕES ──
v2.3.0 → módulo criação ordens + enum servico→servico_venda + permissões
v2.4.0 → mobile responsivo + dropdown nova ordem
v2.5.0 → PWA + protocolo mobile + fix uuid
v2.5.1 → ícones PWA leão branco (VERSÃO ATUAL em 18/03/2026)
```

---

## 29. FIX INTEGER = UUID (18/03/2026)

```
CAUSA RAIZ: notificacoes/[id]/ler/route.ts usava WHERE id = ${id}::uuid
  mas notificacoes.id é INTEGER, não UUID — PostgreSQL rejeita o cast

FIX RAIZ: WHERE id = ${parseInt(id)}

9 CORREÇÕES PREVENTIVAS (::uuid em colunas INT detectadas):
  Arquivos corrigidos (created_by INTEGER → sem cast ::uuid):
  - src/app/api/pcp/ordem-teste/route.ts
  - src/app/api/distribuicao/route.ts
  - src/app/api/pcp/transferir/route.ts
  - src/app/api/pcp/saida/route.ts
  - src/app/api/lancamentos-avulso/route.ts
  - src/app/api/compras/route.ts
  + 3 outros arquivos de API

REGRA: NUNCA usar ::uuid em colunas que são INTEGER
        Verificar SEMPRE o tipo real: SELECT data_type FROM information_schema.columns
        WHERE table_name='tabela' AND column_name='coluna'
```

---

## 30. ESTORNO DE LOTE (v2.9.0 — 20/03/2026)

```
POST /api/distribuicao/[id]/estorno-lote
Roles: admin, desenvolvedor, gerente_fabrica
Modal: dropdown motivos + justificativa + digitar "ESTORNAR" para confirmar
Tabela: alissonerp.estornos_distribuicao (snapshot JSONB dos dados revertidos)

5 FASES ATÔMICAS em sql.begin() (usar 'tx' não 'sql'):
  FASE 1: reabrir lote (etapas='em_andamento') + zerar balanço
          (ouro_entregue, ouro_pecas, quebra_lote, retorno_metal, total_metal,
           dist_ouro_real, dist_pedras_qtd, dist_pedras_g, dist_quebra)
          + DELETE quebra_operador WHERE distribuicao_id=$id
  FASE 2: reverter CEs TEDD + QUEBRA_LOTE
          FILTRO CRÍTICO: obs ILIKE '%distribuicao #ID%' (não pegar de outros lotes)
          Cria CE reversa: inverte entrada↔saída de cada CE original
  FASE 2.5: reverter apontamentos_distribuicao
          SELECT + INSERT reverso + DELETE dos apontamentos originais
  FASE 3: resetar ordens (data_baixa=NULL, peso_bruto=NULL, peso_pedras=NULL,
          peso_ouro_real=NULL) + DELETE distribuicao_saida_pedras
          + DELETE distribuicao_ordens_insumos (se existir)
  FASE 4: reverter PCP (total_metal=0, dist_ouro_real=0, dist_pedras_qtd=0, dist_pedras_g=0)
          para cada pcp vinculado às ordens do lote
  FASE 5: INSERT estornos_distribuicao com snapshot JSONB completo

REGRA CRÍTICA: filtrar CEs por obs ILIKE '%distribuicao #ID%'
  Motivo: múltiplos lotes podem ter CE para o mesmo operador/insumo
  Erro: pegar CEs de outros lotes causa reversão incorreta
```

---

## 31. FEATURES v2.9.0 (20/03/2026)

```
── DISTRIBUIÇÃO ──
- Estorno lote inteiro (seção 30 acima)
- Adicionar ordens a lote em andamento (POST /api/distribuicao/[id]/adicionar-ordens)
  Validações: lote não concluído, ordem não duplicada, ordem não em outro lote
- Filtro ourives: só vê lotes do seu depósito
- Saída sem peso: sem_peso=true + justificativa obrigatória (migration 077)

── PCP ──
- Atribuir operador: PATCH /api/pcp/[id]/atribuir-operador
  Trava apontamento tipo 2 (aditivo) pro operador atribuído
- Metal externo na saída: pmc = peso_ouro_real - outros - metal_externo (migration 078)
- Baixa pedras na saída: marcadores SP + QBP (migration 079)

── USUÁRIOS / SEGURANÇA ──
- Avatar fix: JOIN por id_user (não email) + UPDATE-first INSERT-if-needed
- Email atômico: 3 tabelas em sql.begin (auth.users + usuarios + user_profiles)
- Brecha senha: isSelfUpdate + nova_senha → 400 (usuário não pode alterar sua própria senha via admin)

── INSUMOS ──
- InsumoEditDrawer completo: foto, fornecedor, peso_pedra, ativo
- Bucket insumo-fotos (público, migration 076)
- GET /api/insumos/fornecedores?q= (autocomplete)

── STORAGE (v2.8.0) ──
- TODOS buckets tornados públicos
- src/lib/storage.ts: uploadFile/deleteFile/getPublicUrl
- URL completa salva no banco (não path relativo)
- Sem signed URLs em nenhum bucket
```

---

## Módulo WhatsApp Assistant (Sprint 8 — 23/03/2026)

### Tabelas (migration 086)
```
alissonerp.wa_conversas      — histórico completo de mensagens (entrada + saída)
alissonerp.wa_escalacoes     — escalações para Jonathan com status
alissonerp.wa_usuarios       — cache telefone → user_profile_id + role
alissonerp.wa_knowledge_base — base de conhecimento editável por categoria
```

### API Routes
```
POST /api/whatsapp/webhook — recebe mensagens do Evolution API (sem auth Supabase — webhook externo)
```

### Libs
```
src/lib/whatsapp/evolution.js  — enviarMensagem, enviarMensagemComBotoes, parsearWebhook
src/lib/whatsapp/assistente.js — processarMensagem (integração Gemini)
```

### LLM Provider — ATENÇÃO
```
API: Google Gemini (generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent)
Model padrão: gemini-2.5-flash (WA_MODEL)
Auth: header x-goog-api-key (NÃO x-api-key)
System prompt: campo systemInstruction.parts[{text}] (NÃO dentro de contents)
Role do assistente: "model" (NÃO "assistant")
Resposta: data.candidates[0].content.parts[].text
Tokens: data.usageMetadata.promptTokenCount / candidatesTokenCount
Safety block: candidate.finishReason === 'SAFETY'
```

### Variáveis de Ambiente (.env.local)
```
EVOLUTION_API_URL           (default: http://localhost:8080)
EVOLUTION_API_KEY           (obrigatória)
EVOLUTION_INSTANCE          (default: suporte_alisson)
EVOLUTION_WEBHOOK_SECRET    (opcional — validação do webhook)
GEMINI_API_KEY              (obrigatória)
WA_MODEL                    (default: gemini-2.5-flash)
WA_MAX_HISTORY              (default: 20 mensagens de contexto)
JONATHAN_WHATSAPP           (número do Jonathan sem formatação: 5511999...)
```

### Fluxo de Escalação
```
Usuário → webhook → Gemini → (se não sabe/bug/sugestão) → wa_escalacoes
→ notifica Jonathan via WhatsApp com contexto + comandos
Jonathan → /resolver {id} <resposta> → salva + envia ao usuário
Jonathan → /descartar {id} → fecha sem resposta
```

### Knowledge Base
```
wa_knowledge_base: seed em migration 087
Categorias: tela, fluxo, erro, faq, role
roles_aplicaveis TEXT[]: filtro por cargo ('{}'=todos)
Editável sem redeploy — adicionar INSERTs direto no banco
```

### Coluna phone em public.user_profiles (migration 088)
```
EXCEÇÃO AUTORIZADA por Jonathan (23/03/2026).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
Índice: idx_user_profiles_phone WHERE phone IS NOT NULL

Lookup automático: webhook busca user_profiles.phone = telefone → pega nome + role do ERP.
Usuários não cadastrados entram como nome=pushName, role=NULL, user_profile_id=NULL.
Popular telefones: UPDATE public.user_profiles SET phone = '551199...' WHERE id_user = '...';
```

### Configuração Evolution API (TASK 6)
```
1. Painel Evolution API → instância "suporte_alisson"
2. Webhook URL: https://{DOMINIO}/api/whatsapp/webhook
3. Events: MESSAGES_UPSERT
4. Webhook secret: valor de EVOLUTION_WEBHOOK_SECRET (header x-webhook-secret)
5. Testar: enviar "oi" para o número de suporte
```
