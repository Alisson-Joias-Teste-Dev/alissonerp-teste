---
name: Tela Inicial fabricaAJ
description: Layout e implementação da rota / (tela inicial) do Alisson ERP
type: project
---

Tela inicial (`/`) = boas-vindas + leão da marca + cotações do dia. Tela LIMPA, sem dashboard.

**Why:** Jonathan substituiu a dashboard antiga por uma tela simples e elegante com identidade visual da marca.

**How to apply:** Nunca adicionar gráficos, tabelas ou cards de produção na rota `/`. Se precisar mexer na tela inicial, editar apenas `src/app/(dashboard)/page.tsx`.

## Estrutura atual

Arquivo: `src/app/(dashboard)/page.tsx` — Server Component

Ordem dos elementos (de cima pra baixo):
1. Saudação: "Bom dia/Boa tarde/Boa noite, {nome} 👋" + subtítulo "Bem-vindo ao Alisson ERP"
2. Leão da marca: `/logo.leaoverde.webp` — `h-80`, `flex-1` (ocupa espaço do meio)
3. Cards cotação: OURO 24K (R$/g) + DÓLAR (R$) — `mt-8`, próximos ao fundo
4. Rodapé: "Atualizado: {data} · Fonte: Fixer API"

## Fontes de dados

- **Nome do usuário:** `SELECT nome FROM alissonerp.usuarios WHERE id = {user.id}` → fallback JWT → email → "Usuário"
- **Cotações:** `SELECT ouro, dollar FROM public.parametros LIMIT 1` → fallback "Indisponível" se 0 ou NULL
- **Saudação:** timezone `America/Sao_Paulo` — hora < 12 = Bom dia | < 18 = Boa tarde | else = Boa noite

## Imagem e favicon

- Leão: `fabricaAJ/public/logo.leaoverde.webp` (leão verde fundo transparente)
- Favicon: mesmo arquivo, definido em `src/app/layout.tsx` → `metadata.icons`
