---
name: API Routes Map
description: Mapa completo de todas as API routes do fabricaAJ (167 arquivos .ts/.tsx total)
type: project
updated: 2026-03-17
---

## Total de arquivos

- 167 arquivos .ts/.tsx
- 88 API routes (route.ts)
- 32 componentes .tsx
- 1 hook (useAuth.ts)
- 11 libs (.ts)
- 20 páginas (page.tsx)

---

## API Routes por Módulo

### ORDENS
```
GET  /api/ordens/rastreio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
     → 6 categorias: pcp, protocolo_ida, protocolo_volta, auditoria, conferencia, entregues
     → consultora: filtra por vendedor_id automaticamente
GET  /api/ordens/[id]/fotos          → fotos PDV (signed) + ERP (signed URLs 1h)
POST /api/ordens/[id]/fotos          → body: { path } → array_append fotos_paths
DEL  /api/ordens/[id]/fotos          → body: { path } → array_remove + remove storage (admin only)
GET  /api/ordens/[id]/comentarios    → lista comentarios_ordem WHERE excluido=false, inclui foto_path + signed URL
POST /api/ordens/[id]/comentarios    → body: { texto, mencoes?, foto_path? } + notificações
PATCH /api/ordens/[id]/comentarios/[comentarioId] → body: { texto } — somente autor
DEL  /api/ordens/[id]/comentarios/[comentarioId] → soft delete (autor ou admin/desenvolvedor)
```

### PROTOCOLO
```
GET   /api/protocolo/ordens?direcao=ida|volta
POST  /api/protocolo
GET   /api/protocolo/concluidos
GET   /api/protocolo/[protocoloId]
PATCH /api/protocolo/[protocoloId]
```

### AUDITORIA E CONFERÊNCIA
```
GET   /api/ficha/[ordemId]
PATCH /api/auditoria/[auditoriaId]
PATCH /api/aprovacao/[aprovacaoId]
PATCH /api/entrega/[entregaId]
```

### INSUMOS
```
GET/POST   /api/insumos
PATCH/DEL  /api/insumos/[id]
GET        /api/insumos/categorias
GET        /api/insumos/pote
```

### PCP
```
GET  /api/pcp/tipos-apontamento
GET  /api/pcp/depositos
GET  /api/pcp/setores?deposito_id=X
GET  /api/pcp/insumos?categoria_id=N
GET  /api/pcp/insumos-disponiveis?deposito_id=X&categoria_id=Y
POST /api/pcp/apontamentos
POST /api/pcp/validar-peso
POST /api/pcp/transferir
POST /api/pcp/ordem-teste (só desenvolvedor)
POST /api/pcp/saida
GET  /api/pcp/[id]
GET  /api/pcp/[id]/apontamentos
GET  /api/pcp/[id]/resumo
GET  /api/pcp/[id]/pedras-disponiveis
GET  /api/pcp/[id]/historico
GET  /api/pcp/[id]/insumos-transferencia
GET  /api/pcp/[id]/outros-disponiveis
```

### DISTRIBUIÇÃO
```
GET  /api/distribuicao?etapas=em_andamento|concluido
POST /api/distribuicao
GET  /api/distribuicao/ordens-disponiveis
GET  /api/distribuicao/[id]
POST /api/distribuicao/[id]/saida
GET  /api/distribuicao/[id]/pedras-apontadas
POST /api/distribuicao/[id]/concluir
POST /api/distribuicao/apontamentos
GET  /api/distribuicao/[id]/apontamentos
```

### DEPÓSITOS E SETORES
```
GET/POST   /api/depositos
PATCH/DEL  /api/depositos/[id]
GET/POST   /api/setores
PATCH/DEL  /api/setores/[id]
```

### DASHBOARD
```
GET /api/dashboard/fabrica?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
GET /api/dashboard/fabrica/movimentacoes?inicio=&fim=&page=&pageSize=
```

### COMPRAS
```
GET  /api/compras/fornecedores
POST /api/compras
GET  /api/compras/[id]/itens
POST /api/compras/[id]/itens
DEL  /api/compras/[id]/itens/[itemId]
PATCH /api/compras/[id]/concluir
```

### LANÇAMENTOS
```
POST /api/lancamentos-avulso
```

### USUÁRIOS
```
GET  /api/user/role?user_id=UUID      → role, name, avatar_url (de usuarios JOIN user_profiles)
POST /api/user/avatar                 → FormData: file, user_id? → bucket avatars
GET  /api/user/permissoes?user_id=UUID → modulos_leitura[], modulos_escrita[], role
PATCH /api/user/[id]                  → nome, role, ativo, deposito_id, email, nova_senha
GET  /api/user/alterar-senha          → (usuário muda própria senha)
GET  /api/usuarios/busca?q=          → busca @mentions em comentários
```

### CONFIGURAÇÕES
```
GET/PATCH /api/configuracoes/ia
POST      /api/configuracoes/ia/key
GET/PATCH /api/configuracoes/parametros
GET/PATCH /api/configuracoes/permissoes
GET       /api/configuracoes/roles
PATCH     /api/configuracoes/roles/[nome]
```

### NOTIFICAÇÕES
```
GET  /api/notificacoes
GET  /api/notificacoes/contagem
POST /api/notificacoes/ler-todas
PATCH /api/notificacoes/[id]/ler
```

### PRECIFICAÇÃO
```
GET       /api/precificacao/cotacoes
GET       /api/precificacao/markup-ouro
GET/POST/PATCH /api/precificacao/markup-pedras
GET/PATCH /api/precificacao/regras
POST      /api/precificacao/simular
POST      /api/precificacao/solicitar-aprovacao
GET       /api/precificacao/pendentes
POST      /api/precificacao/aprovar
POST      /api/precificacao/rejeitar
```

### PRODUTOS
```
GET/POST  /api/produtos
GET/PATCH /api/produtos/[id]
GET/POST  /api/produtos/[id]/composicao
PATCH/DEL /api/produtos/[id]/composicao/[itemId]
POST      /api/produtos/[id]/propagar
GET       /api/produtos/insumos?categoria_id=N
GET       /api/produtos/setup
```

### VENDAS
```
GET /api/vendas
GET /api/vendedores
```

---

## Padrões de implementação

### Autenticação nas API routes
```ts
const supabase = await createServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

// Para verificar role:
const [rows] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
```

### Conexão DB
```ts
import sql from "@/lib/db";  // postgres npm, direto ao DB
// NÃO usar supabase.from() para alissonerp — falha silenciosamente
```

### Supabase Storage (signed URL)
```ts
const supabase = await createServerSupabase();
const { data: signed } = await supabase.storage
  .from("ordem-fotos")
  .createSignedUrl(path, 3600);
```
