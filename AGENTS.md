# Database Access Rules

O banco de dados da Alisson Joias (schema `alissonerp`) é **PROTEGIDO**.

## Quem pode tocar no banco

Apenas o agente **dba-alisson** (`.opencode/agent/dba-alisson.md`) tem permissão irrestrita para executar SQL.

## O que fazer quando precisar de dados do banco

1. Delegue para o agente **dba-alisson** usando a Task tool com `subagent_type: "dba-alisson"`
2. O agente dba-alisson vai executar a consulta e trazer o resultado
3. Se o resultado for uma consulta (SELECT): ele executa direto
4. Se for modificação (INSERT/UPDATE/DELETE/CREATE): ele apresenta o Plano de Aprovação

## O que NÃO fazer

- NÃO execute `psql` — o sistema de permissões vai te perguntar e o usuário deve negar
- NÃO execute `pg_dump` — mesma coisa
- NÃO use `node -e "require('pg')..."` ou `import postgres` para conectar no banco — o sistema de permissões vai te perguntar e o usuário deve negar
- NÃO tente instalar `postgresql-client` — não há permissão sudo

## Por quê

O banco é a **fonte única da verdade** da Alisson Joias. Dados de produção de ouro, pedras, ordens, financeiro — qualquer erro custa dinheiro real. Apenas o agente DBA especializado (dba-alisson) tem o protocolo correto de aprovação e verificação anti-duplicação.

Se o agente dba-alisson não estiver disponível na Task tool, peça autorização EXPLÍCITA ao usuário antes de qualquer SQL.
