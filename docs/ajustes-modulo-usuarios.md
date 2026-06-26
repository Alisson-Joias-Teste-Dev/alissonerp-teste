# Ajustes - Módulo de Usuários

## 1. Toast padronizado com `sonner`
- Substituído feedback local (`msg` state) por `toast.success()`/`toast.error()` do `sonner`
- Mensagens contextuais:
  - Só senha → `"Senha alterada com sucesso!"`
  - Múltiplas alterações → `"Alterações feitas com sucesso!"`
  - Upload de foto → `"Foto alterada com sucesso!"`
- Removido `CheckCircle`/`AlertTriangle` inline e `setTimeout` de auto-dismiss

## 2. Componente `Tabela` genérico
- Criado `src/components/Tabela.tsx` — tabela reutilizável com colunas configuráveis
- Responsivo: `overflow-x-auto` + `min-width` + `whitespace-nowrap` + `truncate`
- Tipado: aceita `<T extends { id: string | number }>`

## 3. Rotas próprias por aba
Antes: tudo em `/configuracoes` com `?tab=xxx`
Agora: cada aba em sua própria rota

```
/configuracoes
  /parametros
  /cotacoes
  /integracoes
  /webhooks
  /usuarios
  /ia
  /depositos
  /teores
  /locais
  /tipos_servico
  /comissoes
  /credito_loja
  /fretes
  /gateways
  /metal
  /aprovadores
  /permissoes
  /produto_visibilidade
  /maquininhas
```

- `layout.tsx` com navegação por abas via `Link` + `usePathname()`
- `page.tsx` redireciona para `/configuracoes/parametros`
- Cada aba tem seu server component (`page.tsx`) que busca **apenas os dados necessários**
- `UserAvatar.tsx` atualizado: `/configuracoes?tab=usuarios&user=UUID` → `/configuracoes/usuarios?user=UUID`

## 4. Projeto movido para WSL
- Movido de `/mnt/c/...` para `~/alissonerp`
- Hot reload funcionando com `WATCHPACK_POLLING=true` no `.env.local`
- `.env.local` copiado com `DATABASE_URL` correta
