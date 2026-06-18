# Análise (pente fino) do documento `TAREFAS-blindagem-comercial-producao.md`

> **O que é.** Pente fino do documento da TASK 3 (os 11 bugs B1–B11), que estava na branch
> `fix/ficha-completa-pcp` e agora temos em mãos. Objetivo: dizer se é seguro executar e o que
> corrigir antes. Verificado no repo (`main`/`homolog`) em 2026-06-17.
>
> **Legenda:** ✅ confirmado · ⚠️ ajustar antes de seguir · 🔴 risco · 🟡 decisão do Alisson

---

## Veredito geral
Documento **bom e executável** — detalhado, dividido em 5 fases, "uma tarefa por conversa", já
revisado 2× e conferido em produção por quem escreveu. A causa-raiz de cada bug está clara e os
consertos respeitam as zonas no-touch. **Mas tem 5 pontos a acertar antes de sair executando** (abaixo).
Não é um documento pra rasgar — é pra ajustar e usar.

---

## O que confirmei no código ✅
- **B8 é real (Tarefa 1).** A `main` tem o filtro errado em `src/lib/entrega-venda.ts` (5 ocorrências
  de `controla_estoque`) que a `homolog` não tem (3). A "bomba latente" procede: se a `main` for usada,
  prende reservas de novo.
- **As 5 fases e a regra "uma tarefa por conversa"** são boa prática — evita o Claude Code se perder.
- **As decisões A–E** estão bem mapeadas como bloqueadores reais.

---

## Pontos a acertar ANTES de executar

### 1. ⚠️ Número de migration desatualizado
O doc diz *"próxima livre = 306"*. **Main e homolog já estão na 310** → a próxima real é a **311**.
O doc se protege (manda rodar `ls supabase/migrations` ao vivo), mas quem seguir o "306" literal erra.
**Ação:** corrigir o número no doc.

### 2. 🔴 O documento mora numa branch que ele mesmo manda não usar
O doc está na `fix/ficha-completa-pcp`. E o próprio doc avisa: *"NUNCA suba essa branch direto pra
homolog — está atrasada e carrega o B8"*. Pior: a **Tarefa 7 (friso)** manda trabalhar **dentro dessa
branch**. Risco real de alguém mergear a branch sem querer e reintroduzir o B8.
**Ação:** copiar o doc pra fora da branch (homolog/main) e tratar essa branch só pela Tarefa 7, com cuidado.

### 3. ⚠️ Tarefas 6 e 9 são a mesma família e podem se atropelar
Tarefa 6 (B7, ponteiro morto) e Tarefa 9 (B2, cancelar ordem) mexem nos mesmos pontos de
"cancelamento". O doc pede pra "alinhar", mas a regra "uma tarefa por conversa" pode gerar conflito se
forem em conversas separadas e distantes.
**Ação:** fazer as duas em sequência imediata, mesmo dev, conferindo uma contra a outra.

### 4. ⚠️ O bug do cartão (venda 15516) NÃO está neste documento
O doc cobre só os 11 (B1–B11). O **12º item (cartão fantasma)** existe só no resumo do chefe. Se o dev
seguir apenas este doc, o cartão fica de fora.
**Ação:** anexar o cartão como Tarefa 12 (a spec já está no nosso pente fino, seção 3.A).

### 5. 🟡 Metade do documento está travada por decisão do Alisson
5 das 11 tarefas dependem das decisões A–E:
- **A** (sobra de pagamento) → Tarefa 11
- **B** (qual ordem da V-15282 é a verdadeira) → Tarefa 6
- **C** (cancelar venda com ouro: travar ou avisar?) → Tarefa 9
- **D** (agendador da fila do Tiny: interno ou externo?) → Tarefa 10
- **E** (criar gatilho na ficha técnica?) → Tarefa 7

**Ação:** arrancar essas 5 decisões com o Alisson **antes** — senão metade do doc não anda.

---

## Onde dá pra economizar esforço
- **Tarefa 2 (B11)** e **Tarefa 3 (B10)** são **só documentação** — e o B10 **nem é bug** (o banco
  resolve sozinho por cascata). Valor de "blindagem" baixo, mas valem pra não confundir o futuro.
  Podem ir rápido, juntas, em uma conversa só de docs (exceção à regra "uma por conversa").

---

## Ordem de trabalho sugerida (ajuste da ordem do doc)
1. **Arrancar as decisões A–E** com o Alisson (destrava 5 tarefas).
2. **Fase 1** sem dependência: Tarefa 1 (B8), Tarefa 4 (B5), e as docs (2+3 juntas).
3. **Fase 2/3** conforme decisões saírem; fazer 6 e 9 coladas (família cancelamento).
4. **Anexar o cartão (Tarefa 12).**
5. Tarefa 11 (B6) por último (alto risco, depende da Decisão A).

---

## Resumo em 1 linha
Documento sólido; antes de executar: corrigir o nº de migration (311, não 306), tirar o doc da branch
perigosa, arrancar as 5 decisões do Alisson, e anexar o bug do cartão.
