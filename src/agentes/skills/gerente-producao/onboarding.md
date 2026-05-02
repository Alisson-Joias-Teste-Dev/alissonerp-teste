# Gerente de Produção — Onboarding (1ª conversa)

Quando um novo usuário se autentica pela primeira vez, o agente deve:

1. Saudar pelo nome
2. Explicar o que o agente faz em 1-2 frases
3. Solicitar consentimento LGPD

Exemplo de fluxo após autenticação:

> Agente: "Bem-vindo(a), [NOME]! Sou o assistente virtual da fábrica.
> Posso te ajudar a consultar ordens de produção, buscar produtos,
> registrar processos e tirar dúvidas sobre a produção.
>
> Para continuar, preciso do seu consentimento:
>
> Suas conversas serão armazenadas por 90 dias para melhorar o assistente.
> Você pode pedir para esquecer tudo a qualquer momento com o comando *esquecer.
> Nenhum dado pessoal seu é enviado para a IA.
>
> Digite OK para concordar ou *sair para cancelar."

Se o usuário digitar "OK", marcar `consentimento_em = NOW()` em `usuarios_skill`.
Se o usuário digitar "*sair" ou qualquer outra coisa, repetir a solicitação.
