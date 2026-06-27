# Módulo USUÁRIOS — modelagem do banco (alissonerp_v2)

> Ficha do fichário `/dba`. Modelagem **somente-leitura**. Retrato de **PRODUÇÃO em 27/06/2026**.
> Convenção oficial (skill `/dba` §8): PK = `id`, FK = `<entidade>_id`, datas `created_at`/`updated_at`.
> Padrão técnico = doc oficial do Supabase (citada).

## 0. Glossário (sem jargão)
- **Schema** = "gaveta" de tabelas. **PK** = "RG" da linha (`id`). **FK** = coluna que aponta pra outra tabela (`usuario_id`).
- **N:N (muitos-para-muitos)** = um usuário tem vários perfis e um perfil tem vários usuários → precisa de uma tabela no meio.
- **Perfil** = cargo (admin, consultora…), **criável na tela**. **Permissão** = uma ação liberável sobre um recurso.
- **Recurso** = o que se protege: uma **tabela** (`vendas`) ou uma **coluna** (`vendas.preco_custo`).
- **RLS** = filtro de **linhas** do banco. **CLS (Column-Level Security)** = permissão por **coluna** (mecanismo separado, via GRANT).
- **"Vestir o crachá"** = a API avisar ao banco quem é o usuário antes de consultar (pra o RLS funcionar).

## 1. Mapa atual (tabelas de usuário hoje, qualquer schema)
| Tabela | Schema | Linhas | Função | Veredito |
|---|---|---|---|---|
| `auth.users` | auth | 31 | Login/senha (Supabase) | ✅ Base — não tocar |
| `alissonerp.usuarios` | alissonerp | 27 | Perfil ERP | ✅ Espinha (bate 100% c/ auth) |
| `public.user_profiles` | public | 27 | Perfil duplicado + `password_hash` | 🔴 Aposentar |
| `public.vendedores` | public | 38 | Dados de venda | 🟡 Absorver/ligar |
| `alissonerp.roles` | alissonerp | 12 | Catálogo de papéis (PK textual) | 🟡 Vira `perfis` |
| `alissonerp.role_permissoes` | alissonerp | 307 | Permissão por papel | 🟡 Vira `perfil_permissoes` |
| `alissonerp.permissoes_usuario` | alissonerp | 92 | Exceção por pessoa | 🟡 Vira `usuario_permissoes` |
| `directus.directus_*` | directus | 33/1/896 | Login do sistema ANTIGO | 🔴 Legado morto |

**Provas (read-only, 27/06):** `usuarios`↔`auth` = 27/27 (0 órfãs); `user_profiles` = 15 órfãs + papéis divergentes; 126 FKs p/ `auth.users` × 17 p/ `usuarios`; papel `entregador` fora do catálogo.

## 2. Diagnóstico → bug
1. Duas tabelas pra mesma pessoa (`usuarios` × `user_profiles`) → permissão/senha desencontradas.
2. Chaves divididas (126 vs 17) → "quem fez" cruza duas origens.
3. Permissões fracas: papel é um texto solto, sem perfis customizáveis nem granularidade por coluna.
4. Legado Directus morto.

## 3. Modelo novo — `alissonerp_v2`

> **REGRA DE NEGÓCIO (blindada): a ÚNICA porta do sistema é o login.**
> Acesso = SOMENTE quem tem `usuarios` (que exige `auth.users`). Sem login = sem acesso, sem exceção.
> `vendedores`/`motoboys` são DADOS de negócio, não credenciais. Um vendedor **sem** `usuario` vinculado
> é **legado** (mantém vendas históricas do Tiny corretas), é **read-only** e **não entra no sistema**.
> Só vira acesso se alguém criar um login e ligar `usuarios.vendedor_id` — decisão consciente, nunca automática.


### 3.1 Identidade — [Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data)
```sql
create table alissonerp_v2.usuarios (
  id            uuid primary key references auth.users on delete cascade, -- = auth.users.id
  nome          varchar not null,
  email         varchar not null,
  avatar_url    text    not null,            -- link da FOTO no Storage (bucket 'avatars'); imagem NÃO vai no banco
  cpf           varchar not null unique,     -- só dígitos (11); validar "CPF válido" no app
  celular       varchar not null,            -- WhatsApp, formato 5585999998888
  -- endereço: colunas normais (mesmo padrão da motoboys; NÃO precisa de tabela nem jsonb p/ 1 endereço)
  rua           varchar not null,
  numero        varchar not null,
  bairro        varchar not null,
  cidade        varchar not null,
  uf            varchar not null,
  cep           varchar not null,
  complemento   text,
  vendedor_id   bigint references alissonerp_v2.vendedores,
  deposito_id   integer,
  ativo         boolean not null default true,
  tipos_ordem_permitidos     jsonb   not null default '[]',
  tipos_protocolo_permitidos jsonb   not null default '[]',
  is_operador_service        boolean not null default false,
  is_transportador           boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);  -- SEM password_hash. on delete cascade: apagou login -> some perfil.
-- Foto: bucket 'avatars' (Supabase Storage, público). A imagem vai no Storage; usuarios.avatar_url guarda só o link.
-- Obrigatórios (NOT NULL): perfil nasce COMPLETO via criar_usuario(). Migração dos 27 atuais: preencher o que faltar (ou subir nullable e apertar depois de completar).

-- vendedores: o "PERFIL DE VENDA" — só parâmetros de venda + o vínculo. SEM duplicar identidade.
-- cpf/email NÃO ficam aqui: são identidade, vêm de usuarios. 'nome' é a única identidade aqui,
-- e SÓ p/ vendedor LEGADO sem login (rótulo histórico). Vendedor COM login: nome vem de usuarios.
create table alissonerp_v2.vendedores (
  id                    bigint  generated always as identity primary key,
  nome                  varchar,                        -- SÓ p/ vendedor legado/sem login; com login o nome vem de usuarios
  comissao              numeric,                        -- % de comissão
  gerente_orcamento     boolean not null default false, -- pode aprovar orçamento?
  mx_desconto_permitido numeric not null default 0,     -- desconto MÁXIMO que ele pode dar (movido de usuarios)
  parcelas_padrao_mp    integer not null default 1,     -- nº padrão de parcelas no Mercado Pago (pré-preenche a maquininha)
  id_api_vendedor       bigint,                         -- id no Tiny
  id_api_kommo          bigint                          -- id no Kommo (CRM)
);
-- SEM 'ativo': quem manda é usuarios.ativo (usuário inativo não loga/não vende).
-- Vendedor ATUAL = tem usuario ATIVO vinculado · LEGADO = sem usuario (read-only, vendas antigas).
-- Nome p/ exibir num pedido = COALESCE(usuario.nome quando há login, vendedores.nome).
-- Assim: vendedor linkado usa usuarios; legado usa o próprio nome. Nunca os dois → zero duplicação.

-- motoboys: satélite "entregador". Como SEMPRE tem login, guarda SÓ o que é específico de entrega.
-- Identidade e endereço NÃO ficam aqui: vêm de usuarios (via usuario_id). Zero duplicação.
create table alissonerp_v2.motoboys (
  id          bigint  generated always as identity primary key,
  usuario_id  uuid    not null unique references alissonerp_v2.usuarios on delete cascade, -- 1 motoboy = 1 usuário (nome/cpf/celular/endereço vêm DAQUI)
  veiculo     varchar,                        -- ex.: moto Honda CG
  placa       varchar,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Migração: o endereço/telefone que hoje estão na motoboys vão pra usuarios (são da pessoa, não da entrega).
```

### 3.2 Permissões (perfis + por tabela/coluna) — [RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
```sql
-- perfis: cargos CRIÁVEIS na tela (ex.: 'Caixa', 'Consultora').
create table alissonerp_v2.perfis (
  id         bigint  generated always as identity primary key,
  nome       varchar not null unique,          -- nome do cargo (não repete)
  descricao  text,
  is_sistema boolean not null default false,   -- true = cargo fixo do sistema (admin), não dá pra apagar
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- usuario_perfis: liga PESSOA <-> PERFIL (N:N — vários, um, ou NENHUM cargo)
create table alissonerp_v2.usuario_perfis (
  usuario_id uuid   references alissonerp_v2.usuarios on delete cascade, -- quem
  perfil_id  bigint references alissonerp_v2.perfis   on delete cascade, -- qual cargo
  primary key (usuario_id, perfil_id)                                    -- não repete o par
);

-- permissoes: CATÁLOGO do que pode ser liberado. recurso = tabela OU tabela.coluna.
create table alissonerp_v2.permissoes (
  id        bigint  generated always as identity primary key,
  recurso   varchar not null,   -- 'vendas' (tabela)  ou  'vendas.preco_custo' (coluna)
  acao      varchar not null,   -- 'ler' | 'criar' | 'editar' | 'excluir' | ação de negócio
  descricao text,
  unique (recurso, acao)        -- cada par recurso+ação existe uma vez
);

-- perfil_permissoes: o que cada PERFIL pode
create table alissonerp_v2.perfil_permissoes (
  perfil_id    bigint  references alissonerp_v2.perfis     on delete cascade,
  permissao_id bigint  references alissonerp_v2.permissoes on delete cascade,
  permitido    boolean not null default true,   -- true = libera · false = nega
  primary key (perfil_id, permissao_id)
);

-- usuario_permissoes: acessos AVULSOS (override direto na PESSOA, fora do perfil)
create table alissonerp_v2.usuario_permissoes (
  usuario_id   uuid    references alissonerp_v2.usuarios   on delete cascade,
  permissao_id bigint  references alissonerp_v2.permissoes on delete cascade,
  permitido    boolean not null,   -- true = libera avulso · false = nega avulso
  primary key (usuario_id, permissao_id)
);
```

**Permissão efetiva** — precedência decidida (27/06): **nega avulsa > libera avulsa > nega perfil > libera perfil**.
```sql
create or replace function alissonerp_v2.tem_permissao(p_usuario uuid, p_recurso varchar, p_acao varchar)
returns boolean language sql stable as $$
  with perm as (select id from alissonerp_v2.permissoes where recurso=p_recurso and acao=p_acao),
  avulso as (  -- override direto na pessoa (1 linha no máx; nega vence)
    select bool_and(up.permitido) ok from alissonerp_v2.usuario_permissoes up
    join perm on perm.id=up.permissao_id where up.usuario_id=p_usuario),
  perfil as (  -- via perfis (deny vence entre perfis)
    select bool_and(pp.permitido) ok from alissonerp_v2.usuario_perfis upf
    join alissonerp_v2.perfil_permissoes pp on pp.perfil_id=upf.perfil_id
    join perm on perm.id=pp.permissao_id where upf.usuario_id=p_usuario)
  select coalesce((select ok from avulso where ok is not null),  -- avulso decide se existir
                  (select ok from perfil), false);                -- senão perfil; senão NEGA
$$;
```

### 3.2b Exemplo populado (pra entender — IDs ilustrativos)
```sql
-- 1) perfis (cargos)
insert into perfis (nome,is_sistema) values ('admin',true),('consultora',false),('gerente_loja',false);

-- 2) catálogo de permissões: tabela, COLUNA e AÇÃO de negócio. Módulo novo = só mais linhas, SEM alter table.
insert into permissoes (recurso,acao) values
  ('vendas','ler'), ('vendas','criar'),
  ('vendas.preco_custo','ler'),            -- granularidade por COLUNA (custo sensível)
  ('vendas','aplicar_desconto'),           -- ação de negócio (não é só CRUD)
  ('compras','ler'), ('compras','criar');  -- MÓDULO NOVO entra aqui, zero mudança estrutural

-- 3) o que cada perfil pode (permitido = true/false)
--   consultora: vê e cria venda, dá desconto, MAS não vê o custo
insert into perfil_permissoes (perfil_id,permissao_id,permitido) values
  (consultora, vendas_ler, true), (consultora, vendas_criar, true),
  (consultora, vendas_aplicar_desconto, true),
  (consultora, vendas_preco_custo_ler, false),     -- NÃO vê custo
  (gerente_loja, vendas_preco_custo_ler, true),    -- gerente vê custo
  (gerente_loja, compras_ler, true);

-- 4) vínculos pessoa<->perfil
insert into usuario_perfis values (Maria, consultora), (Joao, gerente_loja);

-- 5) avulso: trava SÓ a Maria no desconto (as outras consultoras seguem podendo)
insert into usuario_permissoes values (Maria, vendas_aplicar_desconto, false);
```
**Resolução (`tem_permissao`):**
| chamada | resultado | por quê |
|---|---|---|
| `tem_permissao(Maria,'vendas','ler')` | ✅ true | perfil consultora libera |
| `tem_permissao(Maria,'vendas.preco_custo','ler')` | ⛔ false | perfil nega a coluna |
| `tem_permissao(Maria,'vendas','aplicar_desconto')` | ⛔ false | perfil dá, mas **avulso NEGA vence** |
| `tem_permissao(Joao,'vendas.preco_custo','ler')` | ✅ true | perfil gerente libera a coluna |

**Não-engessamento:** criar perfil, mudar o que ele pode, dar avulso, liberar coluna nova = **INSERT/UPDATE de dados**, sem `ALTER TABLE` e sem deploy. O que o código do módulo novo faz: (a) registrar seus recursos (INSERT em `permissoes`) e (b) chamar `tem_permissao(...)` nos pontos certos.

### 3.3 Como é APLICADO (enforcement — REVISADO 27/06: usar a API do Supabase)
- **Front (Next.js + supabase-js) → API do Supabase (PostgREST) → RLS.** O `supabase-js` manda o JWT do usuário em toda requisição → roda como `authenticated` → as policies disparam SOZINHAS (acabou o "vestir o crachá" manual). **RLS = tranca PRINCIPAL.**
- **Pré-requisitos** (senão volta `[]`): EXPOR o schema `alissonerp_v2` no PostgREST + CRIAR as policies + `grant` aos papéis `anon`/`authenticated`. (O `[]` antigo era schema não-exposto OU RLS-ligada-sem-policy — não bug.)
- **Linhas (RLS):** `using ((select auth.uid()) = id)` / `tem_permissao(...)`. Uma policy por operação; indexar colunas usadas.
- **Coluna sensível** (ex.: custo): sem API no meio, protege NO BANCO → tabela 1:1 separada com RLS própria (vira problema de linha) OU view que esconde a coluna. (CLS nativo é por papel do banco, não por perfil dinâmico.)
- **Lógica pesada** (ouro/dupla-entrada, aprovações, baixa de crediário): função no banco via `supabase.rpc('fn')` (ou Edge Function) — NUNCA `insert` solto.

### 3.4 Migração das chaves
FKs de autoria (`created_by`→`criado_por_id`, `aprovador_id`…) passam a apontar pra `v2.usuarios` (mesma PK do auth). `directus.*` e `public.user_profiles`: parar de ler → arquivar.

## 4. Fluxo
```
Convite → auth.users → trigger cria v2.usuarios → admin liga usuario_perfis (vários/um/nenhum)
Acesso  → API "veste o crachá" → tem_permissao(recurso, acao) decide (avulso > perfil; nega vence)
        → linha: RLS filtra · coluna: API esconde
Demissão→ ativo=false OU apaga login → cascade limpa perfil/vínculos
```

## 5. Checklist de saúde
- `usuarios` sem `auth`? = 0. · `usuario_perfis.perfil_id` fora de `perfis`? = 0.
- `permissoes.recurso` com `.` aponta pra coluna existente? · Nenhuma escrita nova em `user_profiles`/`directus.*`.

## 6. Decisões registradas (27/06)
- Convenção: PK `id`, FK `<entidade>_id`, datas `created_at`/`updated_at` (skill `/dba` §8).
- Operador/ourives = `usuario` (perfil) + `deposito_id` (FK → `depositos`, do módulo ESTOQUE). PESSOA ≠ DEPÓSITO: o saldo de ouro pertence ao DEPÓSITO (conta de estoque), NUNCA fica em `usuarios`. Saldo é CALCULADO = SUM(entradas)−SUM(saídas) das movimentações (dupla-entrada, append-only), nunca um campo sobrescrito. Há depósito que não é pessoa (pote central ID=1). Detalhe de depositos/movimentações = módulo Estoque.
- `user_views` (salvar filtro nomeado na tela de Estoque): REMOVIDA do v2 — feature sem uso (1 linha, 22/04, nunca reusada). Tela PROD segue até virar tarefa de código pra remover botão+API+tabela.
- Satélites de papel: `vendedores` (pode existir SEM login → usuarios.vendedor_id) e `motoboys` (sempre tem login → motoboys.usuario_id). Operador/ourives NÃO tem tabela (é usuario+deposito_id+perfil).
- `usuarios` ↔ `vendedores` = 1:1 OPCIONAL. Usuário não-vendedor: `vendedor_id` NULL (ok). Usuário vendedor: ao criar com "é vendedor?", `criar_usuario()` cria o registro em `vendedores` e linka — NUNCA vende sem registro (senão comissão/atribuição ficam sem dono). Vendedor sem login = legado/externo (só a linha em `vendedores`). Regra garantida na RPC de criação (não há constraint de banco forçando "perfil vendedor ⇒ vendedor_id not null").
- Permissões: perfis customizáveis + N:N + avulsos + por tabela/coluna.
- Enforcement (v2): **Front (Next.js+supabase-js) → API do Supabase → RLS principal**. Pré-req: expor schema + policies + grants.
- Lógica pesada (ouro/dupla-entrada, aprovações, baixa crediário): **função no banco via `supabase.rpc()`** (regra perto do dado, transação blindada).
- Coluna sensível: **proteger NO BANCO** (regra geral); escolher tabela-1:1-com-RLS vs view **caso a caso**, ao modelar cada módulo.
- Precedência permissão: avulso > perfil; nega vence.

## 8. Funções e Policies do módulo (camada de segurança — no diagrama em cyan/🔒)

### Funções
| Função | Tipo | O que faz |
|---|---|---|
| `tem_permissao(usuario, recurso, acao) → bool` | SQL · **SECURITY DEFINER** | O "cérebro". Lê `usuario_perfis` + `perfil_permissoes` + `usuario_permissoes` + `permissoes` e decide pode/não. Toda policy de escrita chama ela. SECURITY DEFINER pra ler as tabelas mesmo com RLS ligada. |
| `criar_usuario(dados jsonb)` | RPC · **SECURITY DEFINER** (via `supabase.rpc`) | O LOGIN (`auth.users`) é criado ANTES pela **Auth Admin API** do Supabase (jeito seguro, não SQL na unha), que devolve o `id`. Esta RPC recebe esse `id` em `dados` e monta o perfil **COMPLETO** (`usuarios`) + vínculos de perfil + satélites, numa transação. Guard: exige `tem_permissao(uid,'usuarios','gerenciar')`. Orquestra: `dados.vendedor` → `criar_vendedor`; `dados.motoboy` → `criar_motoboy`. |
| `criar_vendedor(usuario_id, dados)` | RPC · SECURITY DEFINER | Cria a linha em `vendedores` e liga `usuarios.vendedor_id` (comissão, Tiny, Kommo). Chamada por `criar_usuario` quando "é vendedor". |
| `criar_motoboy(usuario_id, dados)` | RPC · SECURITY DEFINER | Cria a linha em `motoboys` (`motoboys.usuario_id`: veículo, placa, endereço). Chamada por `criar_usuario` quando "é motoboy". |
| `set_updated_at()` | trigger BEFORE UPDATE | Atualiza `updated_at = now()` em toda edição (usuarios, motoboys, perfis). |
| `num(text)` | helper immutable | Converte número do front tolerando vírgula BR (`5,0`) e vazio→null. |
| `exige_permissao(recurso, acao)` | helper | Centraliza o guard das RPCs: barra (erro 42501) se o usuário não tem a permissão. |

### Policies (RLS) por tabela
| Tabela | Ler (select) | Gravar (insert/update/delete) |
|---|---|---|
| `usuarios` | `ve_proprio`: `auth.uid() = id` | `gerenciar`: `tem_permissao(uid,'usuarios','gerenciar')` |
| `perfis` | todos logados | `tem_permissao(uid,'perfis','gerenciar')` |
| `usuario_perfis` | próprio / gestor | `tem_permissao(uid,'perfis','gerenciar')` |
| `permissoes` | todos logados | `tem_permissao(uid,'permissoes','gerenciar')` |
| `perfil_permissoes` | gestor | `tem_permissao(uid,'perfis','gerenciar')` |
| `usuario_permissoes` | próprio / gestor | `tem_permissao(uid,'usuarios','gerenciar')` |
| `vendedores` | **gestor OU o próprio dono** (comissão não vaza p/ todos) | `tem_permissao(uid,'vendedores','gerenciar')` |
| `motoboys` | **gestor OU o próprio** | `tem_permissao(uid,'motoboys','gerenciar')` |

> Padrão: a função é criada UMA vez (objeto à parte); cada policy só a **chama**. Pra a policy disparar, a API "veste o crachá" (`set local role authenticated` + `request.jwt.claims`). RLS = reforço; tranca principal segue na API.
> **Padrão de diagrama:** funções em cyan (`ƒ`), policies como rodapé `🔒` no card de cada tabela, seta cyan tracejada = "função lê" / "trigger cria".

### Blindagem (pós code-review 27/06)
Fixes aplicados e testados no LOCAL: leitura de comissão/placa só gestor-ou-dono; sem grant p/ anon; atribuir perfil exige `perfis,gerenciar`; RPCs validam que o usuário existe; trigger `updated_at`; números aceitam vírgula BR; SQL idempotente. Regras viraram o **Checklist de Blindagem** na skill `/dba` §10.

## 7. Fontes oficiais
- Auth/Perfis: https://supabase.com/docs/guides/auth/managing-user-data
- RBAC: https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- CLS (coluna): https://supabase.com/docs/guides/database/postgres/column-level-security
