-- =====================================================================
-- alissonerp_v2 — MÓDULO USUÁRIOS (Fase 1, BLINDADO pós code-review 27/06)
-- Correções: leitura de comissão só gestor/dono; sem grant p/ anon;
-- trigger updated_at; idempotente. Espelha docs/banco-v2/usuarios.md.
-- =====================================================================

create schema if not exists alissonerp_v2;

-- ---------- TABELAS (idempotentes: if not exists) ----------
create table if not exists alissonerp_v2.vendedores (
  id                    bigint  generated always as identity primary key,
  nome                  varchar,
  comissao              numeric,
  gerente_orcamento     boolean not null default false,
  mx_desconto_permitido numeric not null default 0,
  parcelas_padrao_mp    integer not null default 1,
  id_api_vendedor       bigint,
  id_api_kommo          bigint
);

create table if not exists alissonerp_v2.usuarios (
  id          uuid primary key references auth.users on delete cascade,
  nome        varchar not null,
  email       varchar not null,
  avatar_url  text    not null,
  cpf         varchar not null unique,
  celular     varchar not null,
  rua         varchar not null,
  numero      varchar not null,
  bairro      varchar not null,
  cidade      varchar not null,
  uf          varchar not null,
  cep         varchar not null,
  complemento text,
  vendedor_id bigint  unique references alissonerp_v2.vendedores, -- unique: 1 vendedor = 1 usuário (anti-duplicado)
  deposito_id integer,
  ativo       boolean not null default true,
  tipos_ordem_permitidos     jsonb not null default '[]',
  tipos_protocolo_permitidos jsonb not null default '[]',
  is_operador_service        boolean not null default false,
  is_transportador           boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alissonerp_v2.motoboys (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null unique references alissonerp_v2.usuarios on delete cascade,
  veiculo    varchar,
  placa      varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alissonerp_v2.perfis (
  id         bigint generated always as identity primary key,
  nome       varchar not null unique,
  descricao  text,
  is_sistema boolean not null default false,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alissonerp_v2.permissoes (
  id        bigint generated always as identity primary key,
  recurso   varchar not null,
  acao      varchar not null,
  descricao text,
  unique (recurso, acao)
);

create table if not exists alissonerp_v2.usuario_perfis (
  usuario_id uuid   references alissonerp_v2.usuarios on delete cascade,
  perfil_id  bigint references alissonerp_v2.perfis   on delete cascade,
  primary key (usuario_id, perfil_id)
);

create table if not exists alissonerp_v2.perfil_permissoes (
  perfil_id    bigint  references alissonerp_v2.perfis     on delete cascade,
  permissao_id bigint  references alissonerp_v2.permissoes on delete cascade,
  permitido    boolean not null default true,
  primary key (perfil_id, permissao_id)
);

create table if not exists alissonerp_v2.usuario_permissoes (
  usuario_id   uuid    references alissonerp_v2.usuarios   on delete cascade,
  permissao_id bigint  references alissonerp_v2.permissoes on delete cascade,
  permitido    boolean not null,
  primary key (usuario_id, permissao_id)
);

-- ---------- FIX #5: trigger que atualiza updated_at em todo UPDATE ----------
create or replace function alissonerp_v2.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- trigger updated_at em TODA tabela que tiver a coluna (a infra acompanha o schema sozinha)
do $$ declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema='alissonerp_v2' and column_name='updated_at' loop
    execute format('drop trigger if exists trg_updated_at on alissonerp_v2.%I', t);
    execute format('create trigger trg_updated_at before update on alissonerp_v2.%I '
                   'for each row execute function alissonerp_v2.set_updated_at()', t);
  end loop;
end $$;

-- ---------- FUNÇÃO: tem_permissao (o cérebro) ----------
create or replace function alissonerp_v2.tem_permissao(p_usuario uuid, p_recurso varchar, p_acao varchar)
returns boolean language sql stable security definer set search_path = alissonerp_v2 as $$
  with perm as (select id from alissonerp_v2.permissoes where recurso = p_recurso and acao = p_acao),
  avulso as (select bool_and(up.permitido) ok from alissonerp_v2.usuario_permissoes up
             join perm on perm.id = up.permissao_id where up.usuario_id = p_usuario),
  perfil as (select bool_and(pp.permitido) ok from alissonerp_v2.usuario_perfis upf
             join alissonerp_v2.perfil_permissoes pp on pp.perfil_id = upf.perfil_id
             join perm on perm.id = pp.permissao_id where upf.usuario_id = p_usuario)
  select coalesce((select ok from avulso where ok is not null),(select ok from perfil),false);
$$;

-- ---------- FIX #3: GRANTS sem anon em tabelas (RLS é a tranca; anon NÃO lê PII) ----------
grant usage on schema alissonerp_v2 to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema alissonerp_v2 to authenticated;
grant usage, select on all sequences in schema alissonerp_v2 to authenticated;
grant execute on function alissonerp_v2.tem_permissao(uuid, varchar, varchar) to authenticated;
alter default privileges in schema alissonerp_v2 grant select, insert, update, delete on tables to authenticated;

-- ---------- RLS + POLICIES (idempotente: drop if exists antes) ----------
alter table alissonerp_v2.usuarios            enable row level security;
alter table alissonerp_v2.vendedores          enable row level security;
alter table alissonerp_v2.motoboys            enable row level security;
alter table alissonerp_v2.perfis              enable row level security;
alter table alissonerp_v2.permissoes          enable row level security;
alter table alissonerp_v2.usuario_perfis      enable row level security;
alter table alissonerp_v2.perfil_permissoes   enable row level security;
alter table alissonerp_v2.usuario_permissoes  enable row level security;

-- usuarios: vê o próprio OU gestor
drop policy if exists usuarios_ler on alissonerp_v2.usuarios;
create policy usuarios_ler on alissonerp_v2.usuarios for select to authenticated
  using ((select auth.uid()) = id or alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'));
drop policy if exists usuarios_gerenciar on alissonerp_v2.usuarios;
create policy usuarios_gerenciar on alissonerp_v2.usuarios for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'));

-- FIX #1: vendedores — leitura SÓ gestor OU o próprio dono (não vaza comissão p/ todos)
drop policy if exists vendedores_ler on alissonerp_v2.vendedores;
create policy vendedores_ler on alissonerp_v2.vendedores for select to authenticated
  using (alissonerp_v2.tem_permissao((select auth.uid()),'vendedores','gerenciar')
      or id = (select vendedor_id from alissonerp_v2.usuarios where id = (select auth.uid())));
drop policy if exists vendedores_gerenciar on alissonerp_v2.vendedores;
create policy vendedores_gerenciar on alissonerp_v2.vendedores for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'vendedores','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'vendedores','gerenciar'));

-- FIX #1: motoboys — leitura SÓ gestor OU o próprio
drop policy if exists motoboys_ler on alissonerp_v2.motoboys;
create policy motoboys_ler on alissonerp_v2.motoboys for select to authenticated
  using (alissonerp_v2.tem_permissao((select auth.uid()),'motoboys','gerenciar')
      or usuario_id = (select auth.uid()));
drop policy if exists motoboys_gerenciar on alissonerp_v2.motoboys;
create policy motoboys_gerenciar on alissonerp_v2.motoboys for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'motoboys','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'motoboys','gerenciar'));

-- perfis / permissoes: catálogo legível por logado; gravar só gestor
drop policy if exists perfis_ler on alissonerp_v2.perfis;
create policy perfis_ler on alissonerp_v2.perfis for select to authenticated using (true);
drop policy if exists perfis_gerenciar on alissonerp_v2.perfis;
create policy perfis_gerenciar on alissonerp_v2.perfis for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'));

drop policy if exists permissoes_ler on alissonerp_v2.permissoes;
create policy permissoes_ler on alissonerp_v2.permissoes for select to authenticated using (true);
drop policy if exists permissoes_gerenciar on alissonerp_v2.permissoes;
create policy permissoes_gerenciar on alissonerp_v2.permissoes for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'permissoes','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'permissoes','gerenciar'));

drop policy if exists usuario_perfis_ler on alissonerp_v2.usuario_perfis;
create policy usuario_perfis_ler on alissonerp_v2.usuario_perfis for select to authenticated
  using ((select auth.uid()) = usuario_id or alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'));
drop policy if exists usuario_perfis_gerenciar on alissonerp_v2.usuario_perfis;
create policy usuario_perfis_gerenciar on alissonerp_v2.usuario_perfis for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'));

drop policy if exists perfil_permissoes_ler on alissonerp_v2.perfil_permissoes;
create policy perfil_permissoes_ler on alissonerp_v2.perfil_permissoes for select to authenticated using (true);
drop policy if exists perfil_permissoes_gerenciar on alissonerp_v2.perfil_permissoes;
create policy perfil_permissoes_gerenciar on alissonerp_v2.perfil_permissoes for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'perfis','gerenciar'));

drop policy if exists usuario_permissoes_ler on alissonerp_v2.usuario_permissoes;
create policy usuario_permissoes_ler on alissonerp_v2.usuario_permissoes for select to authenticated
  using ((select auth.uid()) = usuario_id or alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'));
drop policy if exists usuario_permissoes_gerenciar on alissonerp_v2.usuario_permissoes;
create policy usuario_permissoes_gerenciar on alissonerp_v2.usuario_permissoes for all to authenticated
  using      (alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'))
  with check (alissonerp_v2.tem_permissao((select auth.uid()),'usuarios','gerenciar'));

-- ---------- SEED (idempotente: on conflict do nothing) ----------
insert into alissonerp_v2.perfis (nome, descricao, is_sistema) values
  ('admin', 'Administrador — acesso total', true)
on conflict (nome) do nothing;

insert into alissonerp_v2.permissoes (recurso, acao, descricao) values
  ('perfis','gerenciar','criar/editar/excluir perfis'),
  ('permissoes','gerenciar','editar catálogo de permissões'),
  ('usuarios','gerenciar','criar/editar usuários'),
  ('vendedores','gerenciar','gerenciar vendedores'),
  ('motoboys','gerenciar','gerenciar motoboys'),
  ('vendas','ler','ver vendas'),
  ('vendas','criar','criar venda'),
  ('vendas.preco_custo','ler','ver o custo na venda'),
  ('vendas','aplicar_desconto','dar desconto na venda')
on conflict (recurso, acao) do nothing;

insert into alissonerp_v2.perfil_permissoes (perfil_id, permissao_id, permitido)
select p.id, pm.id, true
from alissonerp_v2.perfis p cross join alissonerp_v2.permissoes pm
where p.nome = 'admin'
on conflict (perfil_id, permissao_id) do nothing;
