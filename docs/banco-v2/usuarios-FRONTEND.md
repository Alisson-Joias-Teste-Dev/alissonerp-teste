# Módulo USUÁRIOS (alissonerp_v2) — Guia do Front-end

> Tudo que o dev do front precisa pra consumir o módulo de Usuários. O banco já está
> pronto e **blindado** (RLS + funções). O front fala **direto com a API do Supabase**.

## 1. Arquitetura (como funciona)
```
Front (Next.js + supabase-js)  --JWT do usuário-->  API do Supabase (PostgREST)  -->  RLS decide o que pode
```
- O `supabase-js` manda o **token do usuário logado** em toda requisição.
- O **RLS (no banco) já filtra tudo** pelo usuário. **Você NÃO precisa checar permissão pra "proteger" dado** — o banco barra sozinho. (Use as permissões só pra **mostrar/esconder botões** na tela = UX.)
- Lógica pesada (criar usuário, etc.) vai por **`supabase.rpc()`**, não por `insert` solto.

## 2. Conexão
```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'alissonerp_v2' },   // ⚠️ OBRIGATÓRIO: o módulo vive nesse schema
})
```
- **Local (teste):** URL `http://127.0.0.1:54321` · key `sb_publishable_...` (vem do `supabase status`).
- **Produção:** pegar URL + publishable key do painel do Supabase de prod.
- ⚠️ **Sempre** usar o schema `alissonerp_v2` (no client acima, ou por chamada com `.schema('alissonerp_v2')`). Sem isso, cai no `public` e não acha nada.

## 3. Login (auth)
```ts
await supabase.auth.signInWithPassword({ email, password })  // o token passa a ir automático
const { data: { user } } = await supabase.auth.getUser()
await supabase.auth.signOut()
```
Sem login, o RLS bloqueia tudo (401/[]).

## 4. As tabelas (o que o front lê/escreve)
| Tabela | O que é | Front faz |
|---|---|---|
| `usuarios` | a pessoa (perfil completo: nome, foto, cpf, celular, endereço) | lê o próprio; gestor lê todos |
| `vendedores` | perfil de venda (comissão, parcelas MP) | só gestor OU o próprio vê |
| `motoboys` | dados de entrega (veículo, placa) | só gestor OU o próprio |
| `perfis` | cargos (admin, consultora…) | qualquer logado lê; gestor cria/edita |
| `permissoes` | catálogo de permissões | qualquer logado lê |
| `usuario_perfis` | quem tem qual cargo | gestor de perfis edita |
| `perfil_permissoes` | o que cada cargo pode | gestor de perfis edita |
| `usuario_permissoes` | acessos avulsos (override por pessoa) | gestor de usuários edita |

Ler (exemplo): `await supabase.from('perfis').select('*')`

## 5. Criar um usuário (FLUXO ESPECIAL — leia com atenção)
Criar o **login** é feito pela **Auth Admin API do Supabase (server-side, com a SECRET key)** — NÃO no client. Depois, a RPC monta o perfil.
```ts
// PASSO 1 (no SEU backend / route server-side, com a secret key):
const { data } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
const novoId = data.user.id

// PASSO 2 (pode ser no client logado como gestor, OU no backend):
await supabase.rpc('criar_usuario', { dados: {
  id: novoId,                 // o id do auth criado no passo 1
  nome, email, avatar_url,    // avatar_url = link da foto já subida no Storage
  cpf, celular,
  rua, numero, bairro, cidade, uf, cep, complemento,
  perfis: [1],                // ids dos cargos (opcional)
  vendedor: { comissao: 5, mx_desconto_permitido: 10, parcelas_padrao_mp: 12 }, // opcional
  motoboy: { veiculo: 'Honda CG', placa: 'ABC1D23' }                            // opcional
}})
```

## 6. As funções (RPCs) disponíveis
- `criar_usuario(dados jsonb)` → cria perfil completo + perfis + satélites. (login criado antes, passo 1)
- `criar_vendedor(p_usuario_id uuid, dados jsonb)` → torna um usuário existente vendedor.
- `criar_motoboy(p_usuario_id uuid, dados jsonb)` → torna um usuário existente motoboy.
- `tem_permissao(usuario uuid, recurso varchar, acao varchar)` → bool (use pra UX: mostrar/esconder botão).

Chamada: `await supabase.rpc('criar_vendedor', { p_usuario_id: id, dados: { comissao: 5 } })`

## 7. A tela de ADMIN de perfis (o que construir)
A gestão de cargos/permissões é **cadastro de dados** (não precisa de código novo no banco):
- **Criar/editar perfil:** insert/update em `perfis`.
- **Marcar o que o perfil pode:** insert/update em `perfil_permissoes` (perfil_id + permissao_id + permitido).
- **Dar cargo a um usuário:** insert em `usuario_perfis`.
- **Acesso avulso (exceção por pessoa):** insert em `usuario_permissoes` (permitido true/false).
> Quem usa essa tela precisa ter a permissão `perfis,gerenciar` (o banco barra os outros).

## 8. ⚠️ Gotchas (o banco já trata, mas o front precisa saber)
- **Schema:** toda chamada precisa de `alissonerp_v2` (ver §2). Esqueceu = não acha nada.
- **Foto:** suba a imagem pro **Storage** (bucket `avatars`) primeiro; mande só a **URL** em `avatar_url`. Nunca a imagem no banco.
- **Campos obrigatórios:** se faltar um (`avatar_url`, `cpf`, `celular`, endereço…), a RPC devolve erro **"campos obrigatórios faltando: X"**. Trate e mostre amigável.
- **Número:** pode mandar `"5,0"` (vírgula) que o banco entende; mas prefira `5.0`.
- **Sem permissão:** vem erro **42501** (ou 401). Trate como "você não tem permissão".
- **Dar cargo:** atribuir perfil exige a permissão `perfis,gerenciar` (criar usuário ≠ dar cargo).
- **Não criar login no client:** `auth.admin.createUser` é server-side (secret key). Nunca exponha a secret no front.

## 9. Catálogo de permissões (seed inicial)
`perfis,gerenciar` · `permissoes,gerenciar` · `usuarios,gerenciar` · `vendedores,gerenciar` · `motoboys,gerenciar` · `vendas,ler` · `vendas,criar` · `vendas.preco_custo,ler` · `vendas,aplicar_desconto`
(recurso pode ser uma tabela OU uma coluna, ex.: `vendas.preco_custo`.)

## 10. Resumo pro front
1. Conecta no Supabase com o schema `alissonerp_v2`.
2. Login → o RLS faz o resto (não precisa "proteger" no front, só esconder botões por UX).
3. Ler tabela = `.from('x').select()`. Lógica = `.rpc('fn', { ... })`.
4. Criar usuário = Auth Admin (backend) + `criar_usuario` (RPC).
5. Trate os erros: campos faltando, sem permissão (42501).
