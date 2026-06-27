-- =====================================================================
-- alissonerp_v2 — MÓDULO USUÁRIOS (Fase 2 RPCs) — ROUND 2 pós re-review 27/06
-- Fixes: A) sem vendedor duplicado/órfão; B) comissão exige 'vendedores,gerenciar'
-- (não basta 'usuarios'); C) erro amigável p/ campo obrigatório faltando; num() milhar.
-- =====================================================================

-- helper: número tolerante. Vírgula = decimal BR; se houver vírgula, ponto é milhar.
create or replace function alissonerp_v2.num(t text)
returns numeric language sql immutable as $$
  select case
    when $1 is null or btrim($1) = '' then null
    when position(',' in $1) > 0 then replace(replace($1, '.', ''), ',', '.')::numeric  -- "1.234,56" -> 1234.56
    else $1::numeric                                                                     -- "5" / "5.0"
  end;
$$;

-- helper: exige permissão (centraliza o guard das RPCs; erro padronizado 42501 p/ o front detectar)
create or replace function alissonerp_v2.exige_permissao(p_recurso varchar, p_acao varchar)
returns void language plpgsql as $func$
begin
  if not alissonerp_v2.tem_permissao(auth.uid(), p_recurso, p_acao) then
    raise exception 'sem permissão: % / %', p_recurso, p_acao using errcode = '42501';
  end if;
end; $func$;


-- ---------- criar_vendedor ----------
create or replace function alissonerp_v2.criar_vendedor(p_usuario_id uuid, dados jsonb)
returns bigint language plpgsql security definer set search_path = alissonerp_v2 as $$
declare v_id bigint;
begin
  -- FIX B: mexer em comissão exige permissão ESPECÍFICA (admin tem; RH-só-usuarios não)
  perform alissonerp_v2.exige_permissao('vendedores','gerenciar');
  if not exists (select 1 from alissonerp_v2.usuarios where id = p_usuario_id) then
    raise exception 'usuário % não existe — vendedor não pode ficar sem dono', p_usuario_id;
  end if;
  -- FIX A: se já é vendedor, NÃO cria outro (evita vendedor duplicado/órfão)
  if (select vendedor_id from alissonerp_v2.usuarios where id = p_usuario_id) is not null then
    raise exception 'usuário já é vendedor — use editar, não criar de novo';
  end if;
  insert into alissonerp_v2.vendedores
    (comissao, gerente_orcamento, mx_desconto_permitido, parcelas_padrao_mp, id_api_vendedor, id_api_kommo)
  values
    (alissonerp_v2.num(dados->>'comissao'),
     coalesce((dados->>'gerente_orcamento')::boolean, false),
     coalesce(alissonerp_v2.num(dados->>'mx_desconto_permitido'), 0),
     coalesce(nullif(dados->>'parcelas_padrao_mp','')::integer, 1),
     nullif(dados->>'id_api_vendedor','')::bigint,
     nullif(dados->>'id_api_kommo','')::bigint)
  returning id into v_id;
  update alissonerp_v2.usuarios set vendedor_id = v_id where id = p_usuario_id;
  return v_id;
end; $$;

-- ---------- criar_motoboy ----------
create or replace function alissonerp_v2.criar_motoboy(p_usuario_id uuid, dados jsonb)
returns bigint language plpgsql security definer set search_path = alissonerp_v2 as $$
declare v_id bigint;
begin
  perform alissonerp_v2.exige_permissao('motoboys','gerenciar');
  if not exists (select 1 from alissonerp_v2.usuarios where id = p_usuario_id) then
    raise exception 'usuário % não existe', p_usuario_id;
  end if;
  if exists (select 1 from alissonerp_v2.motoboys where usuario_id = p_usuario_id) then
    raise exception 'usuário já é motoboy — use editar';
  end if;
  insert into alissonerp_v2.motoboys (usuario_id, veiculo, placa)
  values (p_usuario_id, dados->>'veiculo', dados->>'placa')
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- criar_usuario ----------
create or replace function alissonerp_v2.criar_usuario(dados jsonb)
returns uuid language plpgsql security definer set search_path = alissonerp_v2 as $$
declare v_id uuid;
        v_falta text;
begin
  perform alissonerp_v2.exige_permissao('usuarios','gerenciar');

  -- FIX C: valida obrigatórios com erro AMIGÁVEL (em vez de estourar NOT NULL cru)
  v_falta := (select string_agg(k, ', ')
              from unnest(array['id','nome','email','avatar_url','cpf','celular',
                                'rua','numero','bairro','cidade','uf','cep']) k
              where coalesce(dados->>k,'') = '');
  if v_falta is not null then
    raise exception 'campos obrigatórios faltando: %', v_falta;
  end if;
  v_id := (dados->>'id')::uuid;

  insert into alissonerp_v2.usuarios
    (id, nome, email, avatar_url, cpf, celular, rua, numero, bairro, cidade, uf, cep, complemento, deposito_id)
  values
    (v_id, dados->>'nome', dados->>'email', dados->>'avatar_url', dados->>'cpf', dados->>'celular',
     dados->>'rua', dados->>'numero', dados->>'bairro', dados->>'cidade', dados->>'uf', dados->>'cep',
     dados->>'complemento', nullif(dados->>'deposito_id','')::integer);

  -- atribuir CARGO exige 'perfis,gerenciar' (separado de "criar usuário")
  if dados ? 'perfis' and jsonb_array_length(dados->'perfis') > 0 then
    perform alissonerp_v2.exige_permissao('perfis','gerenciar'); -- atribuir cargo = permissão separada
    insert into alissonerp_v2.usuario_perfis (usuario_id, perfil_id)
    select v_id, x::bigint from jsonb_array_elements_text(dados->'perfis') x;
  end if;

  if dados ? 'vendedor' then perform alissonerp_v2.criar_vendedor(v_id, dados->'vendedor'); end if;
  if dados ? 'motoboy'  then perform alissonerp_v2.criar_motoboy(v_id,  dados->'motoboy');  end if;

  return v_id;
end; $$;

grant execute on function alissonerp_v2.criar_usuario(jsonb)        to authenticated;
grant execute on function alissonerp_v2.criar_vendedor(uuid, jsonb) to authenticated;
grant execute on function alissonerp_v2.criar_motoboy(uuid, jsonb)  to authenticated;
