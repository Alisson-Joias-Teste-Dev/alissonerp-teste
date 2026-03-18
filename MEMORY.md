# MEMORY.md — Alisson ERP (Joalheria de Alto Padrão)

> **LEITURA OBRIGATÓRIA antes de qualquer sessão.**
> **Local: fabricaAJ/MEMORY.md** | **Atualizado: 18/03/2026 — Go-Live + reset banco + migração 443 ordens + módulo criação ordens + PWA + mobile responsivo (v2.5.1)**

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
| `alissonerp` | LEITURA+ESCRITA | 60 tabelas reais, 43 views reais, 33 triggers reais |

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
   REGRA: ordens legadas (origem='legado') → itens em directus.itens_ordem_1
          ordens ERP (origem='erp')       → itens em alissonerp.itens_ordem
❌ tipo_ordem='servico'         → ✅ tipo_ordem='servico_venda' (migration 071 renomeou o enum)
```

### Tabelas alissonerp (referência)
```
── PRODUÇÃO ──
ordens, pcp, saidas_ordem, apontamentos_pcp, distribuicoes
tipos_apontamento (IDs 1-9 fixos)

── SUPRIMENTOS ──
insumos (251 registros, com unidade/descricao)
categorias_insumo (8 categorias: Metal/Ouro=1, Pedras=2, Liga, Solda, Banho, Acabamento, Embalagem, Outros)
depositos (= operadores: Almoxarifado=1, Ourives, Laser, Banca)
setores (vinculados ao depósito)
controle_estoque / movimentacoes_estoque

── LOGÍSTICA ──
protocolos (foto_criacao, foto_conclusao, motoboy_id, recebedor_id)
protocolo_ordens, protocolo_fotos

── QUALIDADE ──
auditorias (loja + fábrica)

── SISTEMA ──
configuracoes_sistema (config IA: provedor, modelos, ativa)
configuracoes_secrets (API keys IA)

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
tipo_ordem: "1"=Serviço "2"=Fabricação "3"=Rep.Venda "4"=Rep.Loja "5"=Compra "6"=Garantia "7"=Serv.Interno
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
PDV → [TRIGGER PONTE] → alissonerp.ordens + AUDITORIA LOJA
  tipo_ordem='servico' → força rota='protocolo'
  lookup numero_pedido em public.vendas (NÃO pedidos)

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

Tabela: alissonerp.usuarios.role (enum_role, inclui 'desenvolvedor')
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
GET  /api/ordens/rastreio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
     → 6 categorias: pcp, protocolo_ida, protocolo_volta, auditoria, conferencia, entregues
     → consultora: filtra por vendedor_id automaticamente
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
POST /api/distribuicao/apontamentos
GET  /api/distribuicao/[id]/apontamentos

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

── CONFIGURAÇÕES ──
GET/PATCH /api/configuracoes/ia
POST      /api/configuracoes/ia/key
GET       /api/user/role?user_id=UUID → retorna role, name, avatar_url
POST      /api/user/avatar (FormData: file, user_id?) → upload bucket avatars
PATCH     /api/user/[id] → body: {nome?,role?,ativo?,deposito_id?,email?,nova_senha?}
              email → sync auth.users+usuarios+user_profiles | senha → crypt direto no auth.users

── PRODUTOS ──
GET    /api/produtos
GET    /api/produtos/[id]
PATCH  /api/produtos/[id]                         → campos editáveis: tem_pedra_preciosa, observacao_erp
GET    /api/produtos/[id]/composicao
POST   /api/produtos/[id]/composicao
PATCH  /api/produtos/[id]/composicao/[itemId]
DELETE /api/produtos/[id]/composicao/[itemId]
POST   /api/produtos/[id]/propagar                → propaga medidas/BOM do pai para variações
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
Provedores: claude (claude-haiku-4-5-20251001), openai (gpt-4o), gemini (gemini-2.0-flash)
Config: configuracoes_sistema + configuracoes_secrets
Lib: src/lib/ia-validar-peso.ts (parseAIResponse robusto, regex fallback)
Tolerância: ZERO (bloqueia salvamento se não bater)
Comparação: Math.abs(a - b) < 0.005 (float precision)
Input peso: normalizar vírgula → ponto antes de parseFloat
IA desabilitada → aceita sem conferência
Aba IA em /configuracoes: toggle on/off, selecionar provedor, salvar key, testar

⚠️ Modelos reais no código (15/03/2026):
   Claude:  claude-haiku-4-5-20251001 (em uso — funcionando)
   Gemini:  gemini-2.0-flash (em uso — funcionando)
   OpenAI:  gpt-4o
   Nota: configuracoes/ia/route.ts usa claude-sonnet-4-20250514 como fallback no GET —
         inconsistência interna menor, corrigir quando necessário
```

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

## 14b. SIDEBAR AGRUPADA

```
📊 Dashboard
🔧 Produção      → Dashboard Fábrica, Ordens, PCP, Distribuição
📦 Suprimentos   → Estoque, Quebra, Insumos, Compras
🚚 Logística     → Protocolo, Conferência, Entrega
✅ Qualidade     → Auditoria
💼 Comercial     → Vendas, Financeiro, Produtos, Precificação
⚙️ Configurações

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

```
Bucket               Público  Tamanho  Tipos aceitos
─────────────────────────────────────────────────────────────────────────────────
avatars              SIM      10MB     image/jpeg, image/jpg, image/png, image/webp
imagens              SIM      sem lim  sem restrição (legado PDV — NÃO usar para ERP)
protocolo-fotos      NÃO      10MB     image/jpeg, image/png, image/webp
apontamento-fotos    NÃO      10MB     image/jpeg, image/png, image/webp
ordem-fotos          NÃO      10MB     image/jpeg, image/png, image/webp, image/heic

avatars:
  Caminho: {user_id}.{ext}
  URL pública: {SUPABASE_URL}/storage/v1/object/public/avatars/{path}?t={timestamp}
  Salvo em: public.user_profiles.avatar_url
  API: POST /api/user/avatar

ordem-fotos (migration 071):
  Caminho ordens: ordens/{ordemId}/{timestamp}-{userId8}.{ext}
  Caminho comentários: comentarios/{ordemId}/{timestamp}-{userId8}.{ext}
  Acesso: signed URLs (1h TTL) geradas via supabase.storage.createSignedUrl()
  Paths salvos em: alissonerp.ordens.fotos_paths TEXT[]
                   alissonerp.comentarios_ordem.foto_path TEXT
  APIs: GET/POST/DELETE /api/ordens/[id]/fotos

protocolo-fotos: → campos protocolos.foto_criacao + protocolos.foto_conclusao
apontamento-fotos: → campo apontamentos_pcp.foto_balanca

⚠️ storage.policies NÃO existe (é storage.objects com RLS, não tabela policies)
⚠️ Para listar buckets: SELECT id, name FROM storage.buckets
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
