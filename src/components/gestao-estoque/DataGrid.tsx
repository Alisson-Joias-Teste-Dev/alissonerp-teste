"use client";

import React, { useState, useEffect } from "react";
import { TableRow, DEFAULT_PAGE_SIZE } from "@/lib/gestao-estoque/types";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Trash2,
  Pencil,
  Search,
  X,
} from "lucide-react";

interface DataGridProps {
  data: TableRow[];
  loading: boolean;
  error: string | null;
  columns: string[];
  page: number;
  totalCount: number | null;
  onNextPage: () => void;
  onPrevPage: () => void;
  onRefresh: () => void;
  tableName: string;
  onActionAttempt: (actionType: "edit" | "delete", rowData: TableRow) => void;
  onSearch: (term: string) => void;
  searchTerm: string;
}

const DataGrid: React.FC<DataGridProps> = ({
  data,
  loading,
  error,
  columns,
  page,
  totalCount,
  onNextPage,
  onPrevPage,
  onRefresh,
  tableName,
  onActionAttempt,
  onSearch,
  searchTerm,
}) => {
  const [localSearch, setLocalSearch] = useState(searchTerm);

  // Sync local state with prop (for external clears)
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  // Debounce search input
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (localSearch !== searchTerm) {
        onSearch(localSearch);
      }
    }, 600); // 600ms wait before searching

    return () => clearTimeout(delayDebounceFn);
  }, [localSearch, onSearch, searchTerm]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      {/* Glass Header Toolbar */}
      <div className="h-20 border-b border-creme-200 flex items-center justify-between px-8 sticky top-0 z-20 bg-white/95 backdrop-blur-xl">
        {/* Title & Count */}
        <div className="flex flex-col justify-center min-w-[200px]">
          <h2 className="text-xl font-serif text-gray-900 flex items-center gap-2 tracking-wide">
            <span className="text-alisson-gold/50">/</span> {tableName}
          </h2>
          {totalCount !== null && (
            <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-semibold">
              {totalCount} Registros Totais
            </span>
          )}
        </div>

        {/* Search Bar - Floating Style */}
        <div className="flex-1 max-w-2xl px-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search
                size={16}
                className="text-gray-500 group-focus-within:text-alisson-gold transition-colors"
              />
            </div>
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full bg-creme-50 text-gray-900 text-sm rounded-full pl-11 pr-10 py-2.5 border border-creme-200 focus:outline-none focus:border-alisson-gold/30 focus:bg-white/80 transition-all placeholder-gray-600 shadow-inner"
            />
            {localSearch && (
              <button
                onClick={() => {
                  setLocalSearch("");
                  onSearch("");
                }}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-900"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={onRefresh}
            className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-creme-100 rounded-full transition-all border border-transparent hover:border-creme-200"
            title="Atualizar Dados"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>

          <div className="flex items-center gap-1 bg-creme-50 rounded-full p-1 border border-creme-200">
            <button
              onClick={onPrevPage}
              disabled={page === 0 || loading}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-creme-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-mono w-20 text-center text-gray-600 border-x border-creme-200 h-4 flex items-center justify-center">
              Pág {page + 1}
            </span>
            <button
              onClick={onNextPage}
              disabled={loading ||
                /* desabilita JA na ultima pagina (antes so depois de cair numa vazia) */
                (totalCount !== null && (page + 1) * DEFAULT_PAGE_SIZE >= totalCount) ||
                (data.length === 0 && page > 0)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-creme-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Data Area */}
      <div className="flex-1 overflow-auto relative scrollbar-thin hover:scrollbar-thumb-gray-700">
        {loading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
            <div className="flex flex-col items-center bg-white/95 p-6 rounded-2xl border border-creme-200 shadow-2xl">
              <Loader2
                className="animate-spin text-alisson-gold mb-3"
                size={32}
              />
              <span className="text-[10px] text-alisson-gold uppercase tracking-[0.2em] font-bold">
                Carregando Dados
              </span>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex h-full items-center justify-center text-red-400 p-8">
            <div className="max-w-md text-center p-8 border border-red-500/20 bg-red-900/10 rounded-2xl">
              <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold mb-2">Falha na Consulta</h3>
              <p className="text-sm font-mono opacity-80">{error}</p>
            </div>
          </div>
        ) : data.length === 0 && !loading ? (
          <div className="flex flex-col h-full items-center justify-center text-gray-500 gap-4">
            <div className="p-6 bg-creme-50 rounded-full">
              <Search size={32} className="opacity-40" />
            </div>
            <p className="text-center font-light">
              {searchTerm
                ? `Nenhum resultado encontrado para "${searchTerm}".`
                : "Nenhum registro encontrado nesta tabela."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-4 py-4 w-20 text-center bg-white/95 backdrop-blur-md border-b border-creme-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider sticky left-0 z-20">
                  Opções
                </th>
                <th className="px-6 py-4 w-20 text-center bg-white/95 backdrop-blur-md border-b border-creme-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-6 py-4 bg-white/95 backdrop-blur-md border-b border-creme-200 text-[10px] font-bold text-gray-600 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-creme-200">
              {data.map((row, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-creme-50 transition-colors group"
                >
                  <td className="px-4 py-3 text-center border-r border-creme-200 sticky left-0 bg-white group-hover:bg-creme-50 transition-colors z-10">
                    <div className="flex items-center justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity duration-300">
                      <button
                        onClick={() => onActionAttempt("edit", row)}
                        className="p-1.5 rounded-lg text-alisson-gold hover:bg-alisson-gold/10 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onActionAttempt("delete", row)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center text-gray-600 font-mono text-xs border-r border-creme-200">
                    {page * 50 + idx + 1}
                  </td>
                  {columns.map((col) => {
                    const value = row[col];
                    let displayValue = value;

                    if (typeof value === "object" && value !== null) {
                      displayValue = (
                        <span className="text-[10px] font-mono text-alisson-gold/80 max-w-xs truncate block">
                          {JSON.stringify(value)}
                        </span>
                      );
                    } else if (typeof value === "boolean") {
                      displayValue = value ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-alisson-gold/10 text-alisson-gold border border-alisson-gold/20">
                          TRUE
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-creme-50 text-gray-600 border border-creme-200">
                          FALSE
                        </span>
                      );
                    } else if (value === null || value === undefined) {
                      displayValue = (
                        <span className="text-gray-700 italic text-xs">
                          null
                        </span>
                      );
                    }

                    return (
                      <td
                        key={`${idx}-${col}`}
                        className="px-6 py-3 text-gray-700 font-light"
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DataGrid;
