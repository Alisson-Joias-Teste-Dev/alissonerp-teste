"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-019: TabelaCompras — Listagem de compras de metal
// ═══════════════════════════════════════════════════════════════════════════

import StatusPagamento from "./StatusPagamento";
import type { CompraRecord } from "@/lib/metal/types";

interface TabelaComprasProps {
  data: CompraRecord[];
  loading?: boolean;
  onRowClick?: (id: number) => void;
}

export default function TabelaCompras({ data, loading, onRowClick }: TabelaComprasProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[#1A3C34]/50">Nenhuma compra de metal registrada.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-[#1A3C34]/60 font-bold border-b border-[#1A3C34]/10">
            <th className="text-left py-2 pl-2">Número</th>
            <th className="text-left py-2">Fornecedor</th>
            <th className="text-right py-2">Peso (g)</th>
            <th className="text-right py-2">Valor Total</th>
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
              <td className="py-2 text-xs text-[#1A3C34]/80">{item.fornecedor_nome || "—"}</td>
              {/* REGRA DE NEGÓCIO: postgres.js retorna NUMERIC como string;
                  Number() garante que .toFixed() funcione */}
              <td className="py-2 text-right font-mono text-xs">{Number(item.peso_gramas).toFixed(3)}</td>
              <td className="py-2 text-right font-mono font-bold text-xs">
                R$ {Number(item.valor_total).toFixed(2)}
              </td>
              <td className="py-2 text-center">
                <StatusPagamento status={item.status} tipo="compra" />
              </td>
              <td className="py-2 pr-2 text-right text-[10px] text-[#1A3C34]/50">
                {new Date(item.created_at).toLocaleDateString("pt-BR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
