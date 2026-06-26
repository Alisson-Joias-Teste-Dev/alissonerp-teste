"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Search, X, User } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-017: ClienteSelector — Autocomplete para buscar contatos
//
// REGRA DE NEGÓCIO: Busca em public.contatos por nome ou CPF.
// Usado tanto para selecionar o FORNECEDOR (na compra de metal) quanto
// o CLIENTE (no recebimento de metal).
//
// IMPACTO SE REMOVIDO: Usuário não consegue buscar/selecionar fornecedores
// ou clientes no módulo metal, impedindo registrar transações.
// ═══════════════════════════════════════════════════════════════════════════

export interface ClienteOption {
  id_contato: number;
  nome: string;
  cpf_cnpj: string;
  telefone: string;
}

interface ClienteSelectorProps {
  value: ClienteOption | null;
  onChange: (cliente: ClienteOption | null) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** Texto exibido quando busca retorna vazio */
  emptyMessage?: string;
}

export default function ClienteSelector({
  value,
  onChange,
  label = "Cliente",
  placeholder = "Buscar por nome ou CPF...",
  error,
  emptyMessage = "Nenhum contato encontrado",
}: ClienteSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClienteOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    // REGRA DE NEGÓCIO: usa click em vez de mousedown para evitar
    // race condition com o botão X de limpar (dropdown fechava antes do
    // clique no X ser processado).
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const buscar = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/contatos/busca?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setResults(data ?? []);
        setIsOpen(true);
      }
    } catch {
      // Silencioso — dropdown simplesmente não abre
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(val), 300);
  }

  function selecionar(item: ClienteOption) {
    onChange(item);
    setQuery(item.nome);
    setIsOpen(false);
  }

  function limpar() {
    onChange(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1">
        {label}
      </label>

      <div
        className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 transition-all ${
          error ? "border-red-400" : "border-[#C59B6D]/30 focus-within:border-[#C59B6D]"
        }`}
      >
        <Search size={14} className="text-[#1A3C34]/30 shrink-0" />

        <input
          type="text"
          value={value ? value.nome : query}
          onChange={handleInputChange}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={value ? value.nome : placeholder}
          className="flex-1 bg-transparent text-sm font-medium text-[#1A3C34] outline-none placeholder-[#1A3C34]/30"
        />

        {loading && (
          <div className="w-4 h-4 border-2 border-[#C59B6D] border-t-transparent rounded-full animate-spin" />
        )}

        {value && (
          <button
            onClick={limpar}
            className="p-0.5 text-[#1A3C34]/30 hover:text-red-500 transition-colors"
            title="Limpar seleção"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && <p className="text-[10px] text-red-500 mt-1 font-medium">{error}</p>}

      {/* Dropdown de resultados */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#C59B6D]/30 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.id_contato}
              onClick={() => selecionar(item)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F2E8D5] transition-colors border-b border-[#1A3C34]/5 last:border-b-0"
            >
              <div className="bg-[#1A3C34]/10 p-1.5 rounded-full">
                <User size={12} className="text-[#1A3C34]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#1A3C34] truncate">{item.nome}</p>
                <p className="text-[10px] text-[#1A3C34]/50 truncate">
                  {item.cpf_cnpj ? `CPF/CNPJ: ${item.cpf_cnpj}` : ""}
                  {item.telefone ? ` | ${item.telefone}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Dropdown vazio */}
      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#C59B6D]/30 rounded-xl shadow-xl p-4 text-center">
          <p className="text-xs text-[#1A3C34]/50">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
