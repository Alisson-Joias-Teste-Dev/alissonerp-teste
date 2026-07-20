"use client";

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { Search, Loader2, Keyboard } from "lucide-react";
import { useBuscaProduto } from "@/hooks/rfid/useBuscaProduto";
import type { ProdutoRfid } from "@/lib/rfid/tipos";

interface BuscaProdutoProps {
  onProdutoSelecionado: (produto: ProdutoRfid) => void;
  disabled?: boolean;
}

/**
 * Componente de busca de produtos por SKU/nome com filtro por categoria.
 *
 * Usa o hook useBuscaProduto internamente. Suporta navegação por teclado
 * (ArrowUp/Down/Enter/Esc) e exibe os resultados em dropdown.
 */
export function BuscaProduto({ onProdutoSelecionado, disabled = false }: BuscaProdutoProps) {
  const [categoriaBase, setCategoriaBase] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const {
    categorias,
    produtos,
    isProdutosLoading,
    isProdutosFetching,
    totalGeral,
  } = useBuscaProduto({ categoriaBase, query, previewId: null, limit: 20 });

  // Open dropdown when there's a query or category filter
  useEffect(() => {
    if (query.length >= 2 || categoriaBase !== null) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  }, [query, categoriaBase]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [produtos]);

  const selectProduto = useCallback(
    (produto: ProdutoRfid) => {
      onProdutoSelecionado(produto);
      setQuery("");
      setIsOpen(false);
      setHighlightIndex(-1);
      inputRef.current?.blur();
    },
    [onProdutoSelecionado],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || produtos.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) => (prev < produtos.length - 1 ? prev + 1 : 0));
          break;

        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) => (prev > 0 ? prev - 1 : produtos.length - 1));
          break;

        case "Enter":
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < produtos.length) {
            selectProduto(produtos[highlightIndex]);
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setHighlightIndex(-1);
          inputRef.current?.blur();
          break;

        default:
          break;
      }
    },
    [isOpen, produtos, highlightIndex, selectProduto],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search size={16} className="text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 2 || categoriaBase !== null) setIsOpen(true);
          }}
          placeholder="Buscar por SKU ou nome do produto..."
          disabled={disabled}
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isProdutosFetching && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <Loader2 size={14} className="animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {/* Category Chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategoriaBase(null)}
          disabled={disabled}
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium transition ${
            categoriaBase === null
              ? "bg-emerald-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Todas ({totalGeral})
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.base}
            type="button"
            onClick={() => setCategoriaBase(categoriaBase === cat.base ? null : cat.base)}
            disabled={disabled}
            className={`rounded-full px-2.5 py-0.5 text-sm font-medium transition ${
              categoriaBase === cat.base
                ? "bg-emerald-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {cat.base} ({cat.total})
          </button>
        ))}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {isProdutosLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Buscando produtos...
            </div>
          ) : produtos.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-6 text-sm text-gray-500">
              <Search size={24} className="text-gray-300" />
              Nenhum produto encontrado
            </div>
          ) : (
            <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
              {produtos.map((produto, index) => (
                <li key={produto.id_produto}>
                  <button
                    type="button"
                    onClick={() => selectProduto(produto)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      index === highlightIndex
                        ? "bg-emerald-50 text-emerald-900"
                        : "text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 font-mono text-xs font-semibold text-emerald-700">
                        {produto.sku ?? "—"}
                      </span>
                      <span className="truncate text-sm">{produto.nome ?? "Produto sem nome"}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {(produto as any).qtd_estoque ?? 0} un
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Keyboard Hint */}
          <div className="flex items-center gap-1 border-t border-gray-100 px-4 py-1.5 text-xs text-gray-400">
            <Keyboard size={12} />
            Navegar: ↑↓&nbsp;&nbsp;Selecionar: Enter&nbsp;&nbsp;Fechar: Esc
          </div>
        </div>
      )}
    </div>
  );
}
