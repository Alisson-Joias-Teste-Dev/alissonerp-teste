"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-019: TabelaRecebimentos — Listagem de recebimentos de metal
// ═══════════════════════════════════════════════════════════════════════════

import StatusPagamento from "./StatusPagamento";
import type { RecebimentoRecord } from "@/lib/metal/types";

interface TabelaRecebimentosProps {
  data: RecebimentoRecord[];
  loading?: boolean;
  error?: string;
  onRowClick?: (id: number) => void;
}

export default function TabelaRecebimentos({ data, loading, error, onRowClick }: TabelaRecebimentosProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // REGRA DE NEGÓCIO: erro de API distinto de resultado vazio.
  if (error) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="text-xs text-[#1A3C34] underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[#1A3C34]/50">Nenhum recebimento de metal registrado.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* REGRA DE NEGÓCIO: Tabela completa em desktop, cards empilhados em mobile (< 640px).
          Evita scroll horizontal excessivo com 8 colunas em telas pequenas. */}
      <table className="w-full text-sm hidden sm:table">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="text-[10px] uppercase text-[#1A3C34]/60 font-bold border-b border-[#1A3C34]/10">
            <th className="text-left py-2 pl-2">Número</th>
            <th className="text-left py-2">Cliente</th>
            <th className="text-right py-2">Peso (g)</th>
            <th className="text-right py-2">Crédito</th>
            <th className="text-right py-2">Venda</th>
            <th className="text-right py-2">Excedente</th>
            <th className="text-center py-2">Status</th>
            <th className="text-right py-2 pr-2">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1A3C34]/5">
          {data.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick?.(item.id)}
              className="hover:bg-[#F2E8D5]/40 transition-colors cursor-pointer"
            >
              <td className="py-2 pl-2 font-bold text-[#1A3C34] text-xs">{item.numero}</td>
              <td className="py-2 text-xs text-[#1A3C34]/80 truncate max-w-[120px]">{item.cliente_nome || "—"}</td>
              {/* REGRA DE NEGÓCIO: postgres.js retorna NUMERIC como string;
                  Number() garante que .toFixed() funcione */}
              <td className="py-2 text-right font-mono text-xs">{Number(item.peso_gramas).toFixed(3)}</td>
              <td className="py-2 text-right font-mono font-bold text-xs">
                R$ {Number(item.valor_total).toFixed(2)}
              </td>
              <td className="py-2 text-right font-mono text-xs">
                {item.venda_id ? `#${item.venda_id}` : "—"}
              </td>
              <td className="py-2 text-right font-mono text-xs text-amber-600">
                {item.credito_excedente ? `R$ ${Number(item.credito_excedente).toFixed(2)}` : "—"}
              </td>
              <td className="py-2 text-center">
                <StatusPagamento status={item.status} tipo="recebimento" />
              </td>
              <td className="py-2 pr-2 text-right text-[10px] text-[#1A3C34]/50">
                {new Date(item.created_at).toLocaleDateString("pt-BR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: cards empilhados */}
      <div className="sm:hidden space-y-3">
        {data.map((item) => (
          <div
            key={item.id}
            onClick={() => onRowClick?.(item.id)}
            className="bg-white border border-[#C59B6D]/20 rounded-xl p-3 space-y-2 cursor-pointer hover:bg-[#F2E8D5]/20 transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#1A3C34] text-xs">{item.numero}</span>
              <StatusPagamento status={item.status} tipo="recebimento" />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/50">Cliente</span>
              <span className="text-[#1A3C34] truncate max-w-[180px]">{item.cliente_nome || "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/50">Peso</span>
              <span className="font-mono">{Number(item.peso_gramas).toFixed(3)}g</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/50">Crédito</span>
              <span className="font-mono font-bold">R$ {Number(item.valor_total).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/50">Venda</span>
              <span className="font-mono">{item.venda_id ? `#${item.venda_id}` : "—"}</span>
            </div>
            {item.credito_excedente ? (
              <div className="flex justify-between text-xs">
                <span className="text-[#1A3C34]/50">Excedente</span>
                <span className="font-mono text-amber-600">R$ {Number(item.credito_excedente).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="text-[10px] text-[#1A3C34]/40 text-right">
              {new Date(item.created_at).toLocaleDateString("pt-BR")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
