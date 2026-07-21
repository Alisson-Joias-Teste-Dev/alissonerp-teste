/**
 * REGRA DE NEGÓCIO: catálogo — a autoridade de cada evento de aprovação.
 * O QUÊ: 1 entrada por EventoAprovacao. Política config-first ESTRITA (decisão do Jonathan,
 *   11/07 — docs/regras-negocio/aprovacoes-refatoracao/03b-config-first-estrito.md): só o(s)
 *   aprovador(es) configurado(s) em Configurações decide(m). SEM fallback por cargo, SEM
 *   master, SEM override de admin — nem admin decide se não estiver na lista configurada.
 *   Config vazia = "nao_configurado" (a camada nunca escolhe ninguém sozinha).
 * POR QUÊ: o sistema hoje "segue a role, não a config" — causa raiz do mapa de esbarros.
 *   Eliminar o fallback por cargo elimina o problema pela raiz (não só o sintoma do
 *   não-determinismo achado na revisão da Fase 1).
 * IMPACTO: migração fluxo a fluxo (Fase 3) — metal (3a) e conversão/conversao_sku (3b) já
 *   plugados em endpoints reais; os demais eventos abaixo ainda não. `conversao` e
 *   `conversao_sku` usam a MESMA chave `aprovador_conversao` (decisão do Jonathan, 12/07 —
 *   antes eram 2 chaves). `alteracao_venda`, `precificacao` e `auditoria` ainda usam chave de
 *   config NOVA que NÃO existe em alissonerp.configuracoes_sistema — será criada via skill
 *   `/dba` quando cada uma for plugada. Até lá, esses 3 eventos resolvem sempre
 *   "nao_configurado" — comportamento correto e esperado (destrava assim que a chave existir
 *   e for preenchida, sem precisar mudar código).
 */
import type { EventoAprovacao, RegraAutoridade } from "./tipos";

export const CATALOGO: Record<EventoAprovacao, RegraAutoridade> = {
  desconto: {
    evento: "desconto",
    rotulo: "Desconto acima do limite",
    configKeys: ["aprovador_desconto_padrao"],
    configMulti: true,
    camposLock: [
      "vendas_erp.aprovacao_desconto_tarefa_id",
      "vendas_erp.desconto_aprovado_por",
      "vendas_erp.desconto_aprovado_em",
    ],
    observacao:
      "Unifica as 3 portas de hoje (tarefa 0,5% comissão / por-item 0% / atalho não mexe — mapa §D). " +
      "Campo canônico do desconto aprovado é vendas_erp.desconto_aprovado_por (dossiê R3) — " +
      "vendas-aprovar.ts e baixa-credito.ts leem exatamente esse campo pra destravar a venda.",
  },
  cartao_desconto: {
    evento: "cartao_desconto",
    rotulo: "Desconto no pagamento em cartão",
    configKeys: ["aprovador_cartao_desconto_padrao"],
    configMulti: true,
    camposLock: [
      "vendas_erp.aprovacao_cartao_desconto_tarefa_id",
      "vendas_erp.desconto_cartao_aprovado_por",
      "vendas_erp.desconto_cartao_aprovado_em",
    ],
  },
  credito_gerente: {
    evento: "credito_gerente",
    rotulo: "Crédito / A Receber — aprovação de gerente",
    configKeys: ["aprovadora_credito_gerente"],
    configMulti: true,
    camposLock: [
      "vendas_erp.aprovacao_credito_tarefa_id",
      "vendas_erp.aprovacao_credito_tipo",
      "vendas_erp.credito_gerente_usado",
    ],
  },
  credito_diretor: {
    evento: "credito_diretor",
    rotulo: "Crédito / A Receber — aprovação de diretor (zera comissão)",
    configKeys: ["aprovador_credito_diretor"],
    configMulti: true,
    camposLock: [
      "vendas_erp.aprovacao_credito_tarefa_id",
      "vendas_erp.aprovacao_credito_tipo",
      "itens_venda_erp.pct_comissao",
      "itens_venda_erp.valor_comissao",
      "vendas_erp.total_comissao",
    ],
  },
  entrega_sem_pagamento: {
    evento: "entrega_sem_pagamento",
    rotulo: "Entregar devendo (crediário ②)",
    configKeys: ["aprovador_entrega_sem_pagamento"],
    configMulti: true,
    camposLock: [
      "vendas_entrega_excecoes_pagamento.status",
      "pagamentos_venda (forma 'A Receber')",
      "contas_receber",
    ],
    observacao: "Hoje já exige aprovador configurado (409 se ausente) — a política estrita mantém esse comportamento.",
  },
  devolucao: {
    evento: "devolucao",
    rotulo: "Devolução — aprovação da compensação (crédito/vale)",
    configKeys: ["aprovador_devolucao"],
    configMulti: true,
    camposLock: ["devolucoes_venda.status", "devolucoes_venda.tarefa_id"],
    observacao:
      "Fase 3e (12/07) — decisão do Jonathan: 1 aprovador só, a autoridade NÃO depende mais de " +
      "dentro/fora dos 7 dias úteis (substitui o par 'aprovadora_credito_gerente'/" +
      "'aprovador_devolucao_fora_prazo' que a devolução usava por prazo). O cálculo do prazo " +
      "(avaliarPrazoDevolucao) continua existindo só pro aviso '⚠️ FORA DO PRAZO' na descrição da " +
      "tarefa e pra retenção — não influencia mais quem aprova.",
  },
  devolucao_estoque: {
    evento: "devolucao_estoque",
    rotulo: "Devolução — conferência do estoque (baixa física)",
    configKeys: ["aprovador_devolucao_estoque"],
    configMulti: true,
    camposLock: ["devolucoes_venda.status (aguardando_aprovacao_estoque)", "devolucoes_venda.tarefa_id"],
  },
  compra_comercial: {
    evento: "compra_comercial",
    rotulo: "Compra comercial — divergência de peso/cadastro",
    configKeys: ["aprovador_compra_comercial"],
    configMulti: true,
    camposLock: [
      "compras_comercial.situacao",
      "compras_comercial.bloqueado",
      "compras_comercial.aprovador_id",
      "compras_comercial.tarefa_aprovacao_id",
    ],
    observacao: "Dossiê R4: aprovação hoje pode duplicar contas_pagar com a chegada — fix é da Fase 4, não desta.",
  },
  compra_metal: {
    evento: "compra_metal",
    rotulo: "Compra de metal acima do teto",
    configKeys: ["metal_aprovador_id"],
    configMulti: true,
    camposLock: ["compras_metal_aprovacoes.status", "compras_metal.status"],
    observacao: "FIX (mapa §B): hoje a decisão ignora metal_aprovador_id e só checa role.",
  },
  recebimento_metal: {
    evento: "recebimento_metal",
    rotulo: "Recebimento de metal acima do teto",
    configKeys: ["metal_aprovador_id"],
    configMulti: true,
    camposLock: ["recebimentos_metal.status", "creditos_cliente", "vendas_erp.total_venda"],
    observacao: "FIX (mapa §B): idem compra_metal.",
  },
  conversao: {
    evento: "conversao",
    rotulo: "Conversão de estoque em peso (vira Caixa de Ouro)",
    configKeys: ["aprovador_conversao"],
    configMulti: true,
    camposLock: ["conversoes_estoque.status_conversao", "tarefas.status"],
    observacao:
      "Plugado na Fase 3b (12/07) em /api/conversao/{aprovar,recusar} e na criação " +
      "(/api/estoque-comercial/converter). MESMA chave usada por 'conversao_sku' (decisão do " +
      "Jonathan — os dois sub-fluxos têm o mesmo aprovador). Chave criada em homolog pelo Opus; " +
      "produção via /dba. Dossiê R6: se aprovada pela via genérica de tarefas (sem handler " +
      "dedicado) fica presa em pendente — o despachante NÃO decide conversão, só os endpoints dedicados.",
  },
  conversao_sku: {
    evento: "conversao_sku",
    rotulo: "Conversão SKU (troca de peça, via protocolo)",
    configKeys: ["aprovador_conversao"],
    configMulti: true,
    camposLock: ["conversoes_sku.status_conversao", "tarefas.status"],
    observacao:
      "Decisão do Jonathan (12/07, Fase 3b): mesmo aprovador da conversão de estoque — usa a " +
      "MESMA chave 'aprovador_conversao' (a antiga 'aprovador_conversao_sku' não existe mais). " +
      "Dossiê R6: mesmo risco de handler ausente na via genérica.",
  },
  conversao_reversa: {
    evento: "conversao_reversa",
    rotulo: "Conversão Reversa (ouro do cofre vira joia)",
    configKeys: ["aprovadores_conversao_reversa"],
    configMulti: true,
    camposLock: ["conversoes_reversas.status_conversao", "tarefas.status"],
    observacao:
      "Feature independente (PR#94, 15/07) que nasceu FORA da camada config-first — tinha " +
      "fallback pra admin/desenvolvedor quando a config estava vazia (violava a política 03b). " +
      "Plugada nesta camada em 15/07/2026 pra alinhar com o padrão: config vazia = " +
      "'nao_configurado', ninguém decide (nem admin). Chave própria 'aprovadores_conversao_reversa' " +
      "(MULTI, já existia antes desta migração — só passou a ser lida por aqui).",
  },
  precificacao: {
    evento: "precificacao",
    rotulo: "Alteração de markup (precificação)",
    configKeys: ["aprovador_precificacao"],
    configMulti: true,
    camposLock: ["markup_alteracoes.status"],
    observacao: "Chave NOVA (ver conversao).",
  },
  limpeza_ouro: {
    evento: "limpeza_ouro",
    rotulo: "Quebra de limpeza de ouro (aprovação de peso)",
    configKeys: ["aprovador_limpeza"],
    configMulti: true,
    camposLock: ["cofre_ouro_baixas.status", "limpezas_ouro.status"],
    observacao: "Já era rígido por desenho (só o UUID configurado, sem fallback) — a política estrita generaliza isso pra todos os eventos.",
  },
  devolver_peca: {
    evento: "devolver_peca",
    rotulo: "Devolução de peça segurada (crediário ③ virou_credito)",
    configKeys: ["aprovadores_devolver_peca"],
    configMulti: true,
    camposLock: ["reservas_estoque_comercial.status"],
  },
  auditoria: {
    evento: "auditoria",
    rotulo: "Auditoria — parecer final",
    configKeys: ["aprovador_auditoria"],
    configMulti: true,
    camposLock: ["auditorias.situacao", "auditorias.parecer", "auditorias.motivo_reprovacao"],
    observacao: "Chave NOVA (ver conversao). FIX (mapa §C): hoje é brecha total — a rota não checa cargo nenhum (`void user`).",
  },
  conferencia_consultora: {
    evento: "conferencia_consultora",
    rotulo: "Conferência de venda pela própria consultora",
    configKeys: [],
    configMulti: false,
    solicitantePodeAprovar: true,
    camposLock: ["aprovacoes_consultora.etapas"],
    observacao:
      "ÚNICA exceção da política config-first: não há aprovador a configurar — a consultora aprova a própria " +
      "conferência (usuarios.vendedor_id === aprovacoes_consultora.consultora_id, ver " +
      "src/app/api/aprovacao/[aprovacaoId]/route.ts). NÃO pode aprovar a de outra consultora.",
  },
  garantia_fora_prazo: {
    evento: "garantia_fora_prazo",
    rotulo: "Garantia fora do prazo de 7 dias úteis",
    configKeys: ["aprovadores_garantia_fora_prazo"],
    configMulti: true,
    camposLock: ["tarefas.status", "tarefas.ordem_id"],
    observacao:
      "Regra do Jonathan (17/07) — docs/regras-negocio/ordens.md. Autoriza abrir garantia depois dos 7 " +
      "dias úteis da entrega, para serviços NÃO vitalícios. NÃO cobre a trava de venda-não-entregue: " +
      "essa é seca, sem saída por aprovação. " +
      "A tarefa libera a VENDA, não a ordem — a ordem só nasce depois de aprovada (assim nada vaza pro " +
      "Protocolo esperando decisão, e a consultora não sobe foto/peso/vídeo antes de saber se pode). " +
      "USO ÚNICO: `tarefas.ordem_id` é consumido pela garantia que a aprovação gerou (UPDATE ... WHERE " +
      "ordem_id IS NULL, na mesma transação do INSERT). É o que impede uma aprovação virar passe " +
      "vitalício — 18% das vendas têm mais de uma garantia. Chave NOVA: criar em PROD via /dba ANTES do deploy.",
  },
  alteracao_venda: {
    evento: "alteracao_venda",
    rotulo: "Solicitação de alteração de venda (campo restrito ou pagamento)",
    configKeys: ["aprovador_alteracao_venda"],
    configMulti: true,
    camposLock: ["solicitacoes_alteracao.status", "vendas_erp (campo varia por tipo)"],
    observacao: "Chave NOVA (ver conversao). Era ROLES_FINANCEIRO inline em solicitacoes-alteracao/[id]:26.",
  },
  frete_avulso: {
    evento: "frete_avulso",
    rotulo: "Frete avulso solicitado",
    configKeys: ["aprovadores_frete_avulso"],
    configMulti: true,
    camposLock: [
      "entregas_venda.tarefa_aprovacao_id",
      "entregas_venda.liberada_por",
      "entregas_venda.liberada_em",
    ],
    observacao:
      "Migração do frete-avulso-solicitacao (migration 353) pra camada central — decisão do " +
      "Jonathan de trocar o pool na unha (isPoolFreteAvulso/listarAprovadoresFreteAvulso, 4 " +
      "pontos do módulo Tarefas) pela política config-first já testada aqui. Tarefa tipo " +
      "'frete_avulso' é exclusiva desse fluxo (não compartilha tipo com outro evento) — " +
      "qualquer um da lista 'aprovadores_frete_avulso' decide a MESMA tarefa: aprovar libera a " +
      "corrida (motoboy_id NULL, pool) e lança o saldo de frete; recusar exige motivo, sem custo.",
  },
};
