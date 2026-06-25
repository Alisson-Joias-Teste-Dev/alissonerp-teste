"use client";

import { ArrowRightLeft } from "lucide-react";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
};

/**
 * REGRA DE NEGÓCIO: ordem do tipo `conversao_sku` NÃO grava em itens_ordem.
 * Os "itens" dela são a transformação origem → destino, que vive em
 * alissonerp.conversoes_sku (peça de origem vira N peças de destino).
 *
 * O QUE: renderiza o card "Itens da Ordem" para conversão de SKU, mostrando
 *   a peça que entra (origem) e a(s) que saem (destino).
 * POR QUE: a seção genérica (ItensOrdemSection) lê itens_ordem, que é sempre
 *   vazia para conversao_sku — por isso essas ordens apareciam "sem itens".
 * IMPACTO SE REMOVIDO: toda ordem de conversão de SKU volta a exibir
 *   "Nenhum item encontrado", escondendo o que está sendo transformado.
 *
 * Os dados já chegam prontos via prop (a página da ordem busca conversoes_sku
 * com os nomes/SKUs de origem e destino) — este componente é só apresentação,
 * sem fetch.
 */
export default function ConversaoSkuItensSection({ conversao }: { conversao: any }) {
  // Quantidade/peso de destino: enquanto não produzido, mostra o DESEJADO;
  // após a produção (volta da fábrica), mostra o que foi REALMENTE produzido.
  const produziu = conversao?.quantidade_produzida != null;
  const qtdDestino = produziu
    ? Number(conversao.quantidade_produzida)
    : Number(conversao?.sku_destino_quantidade_desejada ?? 0);
  const pesoFinal = conversao?.peso_final != null ? Number(conversao.peso_final) : null;

  const qtdOrigem = Number(conversao?.sku_origem_quantidade ?? 0);
  const pesoOrigem = conversao?.sku_origem_peso != null ? Number(conversao.sku_origem_peso) : null;

  const fmtQtd = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-5 py-3.5 border-b"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
      >
        <ArrowRightLeft size={14} style={{ color: C.esmeralda }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
          Itens da Ordem · Conversão de SKU
        </span>
      </div>

      <div className="px-5 py-4">
        {/* Peça de origem */}
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#888780" }}>
          Peça de origem
        </p>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg border"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px]" style={{ color: "#1A1A1A" }}>
              {conversao?.sku_origem_nome ?? (
                <span style={{ color: "#9CA3AF" }}>ID {conversao?.sku_origem_id}</span>
              )}
            </p>
            <p className="text-[11px] font-mono" style={{ color: "#6B7280" }}>
              {conversao?.sku_origem_cod ?? "—"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold font-mono" style={{ color: C.dourado }}>
              {fmtQtd(qtdOrigem)}×
            </p>
            {pesoOrigem != null && (
              <p className="text-[11px] font-mono" style={{ color: "#6B7280" }}>
                {pesoOrigem.toFixed(2)} g
              </p>
            )}
          </div>
        </div>

        {/* Seta de transformação */}
        <div className="flex items-center justify-center gap-1.5 py-2.5 text-[12px]" style={{ color: C.sage }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>↓</span>
          <span>transforma em</span>
        </div>

        {/* Peça(s) de destino */}
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#888780" }}>
          Peça(s) de destino
        </p>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg border"
          style={{ borderColor: "#C0DD97", backgroundColor: "#EAF3DE" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px]" style={{ color: "#173404" }}>
              {conversao?.sku_destino_nome ?? (
                <span style={{ color: "#3B6D11" }}>ID {conversao?.sku_destino_id}</span>
              )}
            </p>
            <p className="text-[11px] font-mono" style={{ color: "#3B6D11" }}>
              {conversao?.sku_destino_cod ?? "—"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold font-mono" style={{ color: "#27500A" }}>
              {fmtQtd(qtdDestino)}×
            </p>
            <p className="text-[10px]" style={{ color: "#3B6D11" }}>
              {produziu
                ? pesoFinal != null
                  ? `${pesoFinal.toFixed(2)} g produzido`
                  : "produzido"
                : "desejado"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
