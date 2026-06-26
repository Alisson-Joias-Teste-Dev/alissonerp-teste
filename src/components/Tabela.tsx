"use client";

import { ReactNode } from "react";

export interface Coluna<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface Props<T> {
  colunas: Coluna<T>[];
  dados: T[];
  onLinhaClick?: (item: T) => void;
  mensagemVazia?: string;
  minWidth?: string;
}

export default function Tabela<T extends { id: string | number }>({
  colunas,
  dados,
  onLinhaClick,
  mensagemVazia = "Nenhum registro encontrado",
  minWidth = "600px",
}: Props<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {colunas.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-[10px] uppercase tracking-widest font-semibold text-gray-400 whitespace-nowrap ${col.headerClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} className="px-4 py-8 text-center text-sm text-gray-400">
                {mensagemVazia}
              </td>
            </tr>
          ) : (
            dados.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-gray-50 transition-colors ${onLinhaClick ? "hover:bg-gray-50 cursor-pointer" : ""}`}
                onClick={() => onLinhaClick?.(item)}
              >
                {colunas.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
