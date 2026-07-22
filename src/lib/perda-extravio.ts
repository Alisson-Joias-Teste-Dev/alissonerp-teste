/**
 * Perda / extravio de peca — constantes compartilhadas entre API e tela.
 *
 * REGRA DE NEGOCIO: peca que sumiu sai do estoque por uma baixa nomeada
 * "perda_extravio", exclusiva do master admin (o dono). Ver
 * src/app/api/estoque-comercial/perda/route.ts para a regra completa.
 *
 * IMPACTO SE ALTERADO: MOTIVO_PERDA e o valor gravado em
 * movimentacoes_estoque_comercial.motivo. Mudar a string cega todas as perdas
 * ja registradas — o extrato deixa de marcar a linha e o estorno deixa de ser
 * protegido. Nao mudar sem migration de dados.
 */

/** Valor gravado em movimentacoes_estoque_comercial.motivo para uma perda. */
export const MOTIVO_PERDA = "perda_extravio";

/** Palavra que o dono digita para confirmar a baixa (evita clique acidental). */
export const CONFIRMACAO_PERDA = "PERDA";
