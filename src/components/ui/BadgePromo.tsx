/**
 * BadgePromo — badge "PROMO" usado em todo lugar que exibe produto em promocao.
 * Centraliza o JSX antes espalhado em 6 lugares (Dashboard, ProdutosClient,
 * NovaVendaClient[V2|Legado]).
 *
 * Uso:
 *   <BadgePromo campanha={produto.nome_campanha} />
 *   <BadgePromo campanha={item.promocao_nome} className="ml-1.5 align-middle" />
 */
import React from "react";

interface BadgePromoProps {
  /** Nome da campanha — usado no tooltip. Se vazio/null, mostra "Em promocao". */
  campanha?: string | null;
  /** Classes adicionais (ex: ml-1.5 align-middle) sem sobrescrever as base. */
  className?: string;
}

export default function BadgePromo({ campanha, className = "" }: BadgePromoProps) {
  const title = campanha ? `Campanha: ${campanha}` : "Em promocao";
  return (
    <span
      className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 ${className}`.trim()}
      title={title}
    >
      PROMO
    </span>
  );
}
