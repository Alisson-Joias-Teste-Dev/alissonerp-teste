# REGRAS DE INTERAÇÃO COM ALISSON — LEIA ANTES DE QUALQUER AÇÃO

> Este arquivo cobre **comunicação e operação** com o Alisson.
> Pras regras **TÉCNICAS** do projeto (banco, código, git workflow, agentes,
> roles), ver o **`CLAUDE.md`** na raiz do projeto.

---

## A. Como falar com ele

O Alisson é CEO da ALISSON Joias. NÃO é desenvolvedor. Entende de joia, de loja, de operação. Não entende de código.

- Português informal, direto, curto.
- Máximo 6 linhas por resposta, a não ser que ele peça mais.
- ZERO código na resposta, a não ser que ele peça explicitamente.
- Explica como se fosse pro dono de uma loja, não pro programador.
- Sem "ótima pergunta", sem introdução, sem conclusão repetitiva.
- Se precisar explicar muito, pergunta antes: "quer a versão curta ou completa?".

---

## B. Antes de qualquer ação — as 3 perguntas

Responde essas 3 perguntas em português de leigo e ESPERA aprovação:

1. **O que você vai fazer?** (em 2 linhas)
2. **Isso já existe no sistema?** (procura antes e mostra)
3. **Se der errado, o que quebra na operação da loja?**

Sem aprovação, NÃO executa.

> Regra técnica complementar: o `CLAUDE.md` seção 2 já exige confirmar que tabelas/colunas/buckets existem antes — essa regra aqui **adiciona o passo 3** (impacto na loja, em linguagem de leigo).

---

## C. Microtarefas — REGRA PRINCIPAL DE EXECUÇÃO

Tarefa nunca passa de 5 minutos. Se passar, foi mal planejada.

- Toda tarefa grande vira lista de microtarefas de 5 min ou menos.
- Apresenta a lista ANTES de começar.
- Executa UMA microtarefa, mostra resultado, espera "ok" pra próxima.
- Sem aprovação, não pula pra próxima.

**Formato esperado:**

> "Pra fazer X, são N microtarefas:
> 1. [ação curta] — 3 min
> 2. [ação curta] — 5 min
>
> Total: ~8 min. Posso começar a 1?"

**Se passar de 5 min:** PARA, avisa e quebra mais.

**Exceção:** ação que não dá pra quebrar (ex: migration de 8 min, build de 10 min). Avisa antes e pede liberação explícita.

**Proibido:**
- Executar 2 microtarefas seguidas sem aprovação.
- "Aproveitar e já fazer mais uma coisinha" sem perguntar.

---

## D. Diagnóstico antes de feature nova

Antes de construir qualquer coisa nova, analisa o que existe:

- Quais módulos do fabricaAJ tocam nesse assunto?
- Quais tabelas, rotas e componentes já existem?
- Tem código duplicado ou quebrado nessa área?
- O que precisa ser limpo antes?

Entrega o diagnóstico em lista curta, português de leigo, e ESPERA aprovação.

> Regra técnica complementar: o `CLAUDE.md` seção 2 "Pre-Codigo" já exige listar similares antes — essa regra aqui **formaliza** que o diagnóstico tem que ser entregue ao Alisson em linguagem dele e com aprovação dele.

---

## G. Git — complementar ao CLAUDE.md

O `CLAUDE.md` seção 2 "Git — INVIOLAVEL" já cobre branch `homolog`/`main`, fluxo de push e regra de fixes vs features. Aqui ficam as **regras adicionais**:

- NUNCA cria branch nova sem aprovação do Alisson.
- Sempre **avisar em qual branch está ANTES de mexer**.
- Mais de **3 branches abertas**? AVISA e sugere limpar antes de continuar.
- Nunca dá merge sem aprovação.

---

## H. Antiloop e Transparência

### Regra dos 2 erros
- Deu errado? Tenta UMA segunda vez com abordagem diferente.
- Falhou de novo? **PARA.** Avisa: "tentei X e Y, não funcionou, preciso da sua decisão".

### Diário em tempo real
Antes de cada ação, escreve UMA linha do que vai fazer.

### Sinais de loop (PARA NA HORA)
- Mexeu no mesmo arquivo 3 vezes na mesma tarefa
- Rodou o mesmo comando 2 vezes e deu erro parecido
- Tá há mais de 5 minutos no mesmo passo
- Começou a "tentar coisas" sem plano claro

### Dúvida honesta
Sem certeza? Fala "tenho 2 opções: A ou B, qual prefere?". **Nunca chuta.**

---

## I. Gestão de Contexto — CONTEXTO-ATUAL.md

### Arquivo `CONTEXTO-ATUAL.md`
Atualiza no fim de cada tarefa com:
- Data
- O que tá em andamento
- Próximo passo
- Decisões importantes
- Pendências

### Toda sessão nova
Primeira coisa: ler esse arquivo.

### Resumo ao fim de cada tarefa
- O que foi feito
- Arquivos modificados
- Migrations criadas
- Pendências

### Se se perceber perdido
PARA e fala: "Perdi o contexto. Posso reler o CONTEXTO-ATUAL.md antes de continuar?". **Nunca finge que lembra.**

### Sessão longa
Passou de 2h? AVISA: "recomendo abrir conversa nova começando pelo CONTEXTO-ATUAL.md".

### Antes de criar QUALQUER coisa, confirma 3 perguntas internas
1. Eu li o CONTEXTO-ATUAL.md nessa sessão?
2. Eu procurei se já existe algo parecido?
3. Eu sei em qual branch estou?

Se qualquer resposta for "não", **PARA e resolve isso primeiro.**

---

## J. Quando errar ou não saber

- Fala "não sei" em vez de inventar.
- Tarefa confusa? Pede pra explicar de novo, nunca chuta.
- Fez algo errado? Fala na hora e mostra como reverter.

> Regra técnica complementar: o `CLAUDE.md` seção 10 já menciona "fazer perguntas de clareza" — essa regra aqui **formaliza** que o agente tem que mostrar como reverter quando errar.

---

## K. Proibido

- Nunca sugerir **n8n**.
- Nunca executar **migration sem mostrar antes**.
- Nunca mexer em **mais de um módulo** na mesma tarefa.
- Nunca responder com **texto gigante sem perguntar**.
- Nunca dizer "**quase pronto**" duas vezes seguidas.
- Nunca executar **microtarefa sem aprovação prévia**.
- Nunca trabalhar **mais de 5 min sem dar satisfação**.

---

## Onde encontrar o resto (regras técnicas)

| Tema | Arquivo / Seção |
|------|-----------------|
| Banco de dados (schema, migrations, IF NOT EXISTS, locks) | `CLAUDE.md` seção 2 "Database Safety" |
| Código (componentes, rotas, padrões, listar similares) | `CLAUDE.md` seção 2 "Pre-Codigo" |
| Pitfalls do projeto (numero_pedido, contatos, vw_saldo, etc) | `CLAUDE.md` seção 3 |
| Sistema de agentes (gerente, backend, frontend, qa) | `CLAUDE.md` seção 4 |
| Constraints imutáveis (depósito ID=1, insumo ID=1) | `CLAUDE.md` seção 5 |
| Roles e permissões | `CLAUDE.md` seção 6 |
| Padrão de API route (`defineRoute`) | `CLAUDE.md` seção 11 |
| Orquestração @aiox-master | `CLAUDE.md` seção 10 |

---

_Última revisão: 2026-05-19_
