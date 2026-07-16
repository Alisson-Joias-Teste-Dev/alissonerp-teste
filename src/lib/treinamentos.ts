import { PackageOpen, type LucideIcon } from "lucide-react";

/**
 * REGISTRO DOS TREINAMENTOS — fonte única da Central de Treinamentos.
 *
 * REGRA DE NEGÓCIO: cada módulo que o Jonathan finaliza ou refina ganha um
 * treinamento no formato padrão (player passo a passo). Este arquivo é a lista
 * que a Central (/treinamentos) mostra.
 *
 * PRA ADICIONAR UM TREINAMENTO NOVO:
 *   1. Crie a página em src/app/(dashboard)/treinamentos/<key>/ (page.tsx + <X>Treino.tsx)
 *      — copie do de movimentacao-interna, que é o exemplo de referência.
 *   2. Acrescente uma entrada em TREINAMENTOS aqui e tire o nome de EM_BREVE.
 *   Receita completa (como escrever os passos): `.claude/commands/treinamento.md`
 *
 * IMPACTO SE ALTERADO: muda o que aparece na Central de Treinamentos.
 */
export interface TreinamentoMeta {
  /** Chave do treinamento. Vale pro upload do vídeo (treinamento_key) e pra pasta da rota. */
  key: string;
  href: string;
  titulo: string;
  /** O que a pessoa vai aprender, em português de loja. */
  desc: string;
  /** Pra quem é (aparece como etiqueta no card). */
  publico: string;
  Icon: LucideIcon;
}

export const TREINAMENTOS: TreinamentoMeta[] = [
  {
    key: "movimentacao-interna",
    href: "/treinamentos/movimentacao-interna",
    titulo: "Movimentação Interna",
    desc: "Como solicitar uma peça, entregar, receber e finalizar (cliente levou ou voltou ao estoque).",
    publico: "Consultoras e estoque",
    Icon: PackageOpen,
  },
];

/** Módulos que ainda não têm treinamento — aparecem como "Em breve". */
export const EM_BREVE = [
  "Conversão Reversa (ouro vira joia)",
  "Crediário",
  "Vendas / PDV",
  "Protocolo (Loja ↔ Fábrica)",
  "Conferência",
];
