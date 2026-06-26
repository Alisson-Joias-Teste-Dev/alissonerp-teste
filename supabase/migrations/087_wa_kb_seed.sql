-- =============================================
-- MIGRATION 087: WhatsApp Assistant — seed knowledge base
-- Schema: alissonerp
-- =============================================

INSERT INTO alissonerp.wa_knowledge_base (categoria, titulo, conteudo, roles_aplicaveis, ordem) VALUES

-- === FAQ ===
('faq', 'Como acessar o sistema',
'O ERP da Alisson é acessado pelo navegador em https://erp.alisson.api.br. Use o e-mail e senha fornecidos pelo administrador. Se for seu primeiro acesso, entre em contato com Jonathan.',
'{}', 1),

('faq', 'Esqueci minha senha',
'Para redefinir a senha, acesse a tela de login e clique em "Esqueci minha senha". Informe seu e-mail cadastrado. Se não receber o e-mail em alguns minutos, peça ao administrador para redefinir manualmente.',
'{}', 2),

('faq', 'Sistema está lento ou com erro de carregamento',
'Tente: 1) Limpar o cache do navegador (Ctrl+Shift+Del). 2) Abrir em aba anônima. 3) Verificar sua conexão com a internet. 4) Fechar abas extras do navegador. Se persistir, comunique ao suporte.',
'{}', 3),

('faq', 'Não consigo acessar uma tela ou botão',
'O acesso a telas e ações depende do seu cargo (role) no sistema. Se você não vê uma opção que deveria ver, fale com o administrador para verificar suas permissões.',
'{}', 4),

-- === ROLE ===
('role', 'O que o ourives acessa',
'Ourives acessa: ordens de produção atribuídas a ele, lançamento de apontamentos (entrar metal, aditivo, etc.), histórico de ordens concluídas. NÃO acessa: estoque geral, financeiro, configurações, outros operadores.',
'{"ourives"}', 10),

('role', 'O que a consultora acessa',
'Consultora acessa: catálogo de produtos, clientes, pedidos da loja. NÃO acessa: produção, distribuição de ouro, estoque da fábrica, financeiro.',
'{"consultora"}', 11),

('role', 'O que o gerente de fábrica acessa',
'Gerente de fábrica acessa: PCP (planejamento e controle da produção), distribuição de ouro entre operadores, estoque de insumos, ordens de produção, controle de operadores, auditorias de fábrica.',
'{"gerente_fabrica"}', 12),

('role', 'O que o gerente de loja acessa',
'Gerente de loja acessa: precificação de produtos, catálogo, pedidos e clientes, relatórios da loja, consulta de ordens.',
'{"gerente_loja"}', 13),

('role', 'O que a logística acessa',
'Logística acessa: protocolo de envio de peças entre loja e fábrica (ida e volta), rastreamento de ordens em trânsito.',
'{"logistica", "motoboy"}', 14),

('role', 'O que o PCP acessa',
'PCP acessa: painel de produção, acompanhamento de todas as ordens em andamento, distribuição para operadores, transferências entre setores.',
'{"pcp"}', 15),

('role', 'O que o admin acessa',
'Admin acessa: todas as telas do sistema exceto configurações exclusivas de desenvolvedor. Pode criar usuários, alterar permissões, ver todos os relatórios.',
'{"admin"}', 16),

-- === FLUXO ===
('fluxo', 'Fluxo completo de uma ordem de serviço',
'1. Consultora registra pedido no PDV. 2. Ordem chega ao ERP e aguarda auditoria da loja. 3. Gerente de loja aprova a ordem. 4. Motoboy cria protocolo de ida com foto e leva a peça à fábrica. 5. Gerente de fábrica conclui o protocolo. 6. PCP distribui a ordem para o ourives. 7. Ourives executa e faz apontamentos. 8. Saída do PCP gera auditoria de fábrica. 9. Financeiro aprova. 10. Protocolo de volta: motoboy leva a peça de volta à loja. 11. Consultora entrega ao cliente.',
'{}', 20),

('fluxo', 'Como funciona a distribuição de ouro',
'1. Acesse a tela Distribuição. 2. Crie uma distribuição selecionando as ordens. 3. Defina o operador (ourives) responsável. 4. Informe o peso de ouro entregue (pesado na balança). 5. Tire foto da balança. 6. Confirme a distribuição. O ouro sai do almoxarifado e vai para o operador.',
'{"gerente_fabrica", "pcp", "admin", "desenvolvedor"}', 21),

('fluxo', 'Como funciona o PCP',
'No painel PCP as ordens passam pelos estágios: Novas → Em Andamento → Concluído. O ourives faz apontamentos em cada etapa (entrada de metal, aditivos, etc.). Ao finalizar, registra o peso final para calcular o PMC (perda de metal do cliente).',
'{"pcp", "ourives", "gerente_fabrica", "admin", "desenvolvedor"}', 22),

('fluxo', 'Como funciona o protocolo de envio',
'Protocolo de Ida: motoboy cria o protocolo, seleciona as ordens, tira foto das peças, envia. Gerente de fábrica recebe e conclui o protocolo (com foto de recebimento). Protocolo de Volta: mesmo processo no sentido inverso — fábrica envia, loja recebe.',
'{"logistica", "motoboy", "gerente_fabrica", "gerente_loja", "admin", "desenvolvedor"}', 23),

('fluxo', 'Como transferir ordens entre operadores/setores',
'Na tela PCP, selecione a ordem em andamento e clique em Transferir. Escolha o operador de destino. A ordem sai do operador atual e vai para o próximo. Use quando uma peça precisa passar por mais de um ourives.',
'{"pcp", "gerente_fabrica", "admin", "desenvolvedor"}', 24),

-- === ERRO ===
('erro', 'Peso não bate / divergência de peso',
'Verifique: 1) Se a balança está tarada corretamente (zerada antes de pesar). 2) Se todos os apontamentos foram registrados (entrada de metal, aditivos). 3) Se foi registrada a quebra de ouro corretamente. 4) Se há metal externo (peça do cliente) que deve ser subtraído.',
'{"ourives", "pcp", "gerente_fabrica", "admin", "desenvolvedor"}', 30),

('erro', 'Ordem não aparece na lista',
'Verifique: 1) Os filtros ativos na tela (limpar filtros). 2) Se a ordem passou pela auditoria de loja (precisa ser aprovada). 3) Se a ordem foi distribuída para o operador correto. 4) Status da ordem (cancelada, concluída?). Se nada resolver, informe o número da ordem ao suporte.',
'{}', 31),

('erro', 'Não consigo criar um protocolo ou distribuição',
'Para protocolo: verifique se há peças disponíveis (aprovadas pela auditoria e não em outro protocolo ativo). Para distribuição: verifique se há saldo de ouro no almoxarifado e se sua conta tem permissão. Em ambos os casos, tire print da mensagem de erro e envie ao suporte.',
'{"logistica", "motoboy", "gerente_fabrica", "pcp", "admin", "desenvolvedor"}', 32),

('erro', 'Erro ao fazer upload de foto',
'Formatos aceitos: JPG, PNG, HEIC, WEBP. Tamanho máximo: 10MB por foto. Se a foto está dentro do limite e o erro persiste, tente: 1) Reduzir a resolução da foto. 2) Usar outro navegador. 3) Verificar conexão de internet.',
'{}', 33);
