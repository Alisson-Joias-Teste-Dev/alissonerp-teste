"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useDebounce } from "./useDebounce";
import { C } from "./constants";
import type { ProdutoBusca } from "./types";

interface Props {
  onSelecionar: (p: ProdutoBusca) => void;
  autoFocus?: boolean;
}

/**
 * Campo de busca de produto (nome/SKU) com dropdown de resultados.
 * REGRA DE NEGOCIO: usado nas ordens que partem de um PRODUTO (Reposicao Loja,
 * Servico Interno) — nao confundir com a busca de CLIENTE das ordens que
 * partem de uma VENDA (Fabricacao, Reposicao Venda), que fica em outro fluxo.
 * So renderizar enquanto nenhum produto estiver selecionado — a tela de
 * origem mostra o card do produto escolhido no lugar deste componente.
 */
export function ProdutoBuscaOrdem({ onSelecionar, autoFocus }: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);
  const buscaDebounced = useDebounce(busca, 300);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (buscaDebounced.length < 2) { setResultados([]); setDropOpen(false); return; }
    setBuscando(true);
    fetch(`/api/ordens/produtos-busca?busca=${encodeURIComponent(buscaDebounced)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setResultados(Array.isArray(d) ? d : []); setDropOpen(true); })
      .catch(() => setResultados([]))
      .finally(() => setBuscando(false));
  }, [buscaDebounced]);

  function selecionar(p: ProdutoBusca) {
    setBusca(""); setDropOpen(false); setResultados([]);
    onSelecionar(p);
  }

  return (
    <div className="relative" ref={buscaRef}>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
        {buscando
          ? <Loader2 size={15} className="animate-spin shrink-0" style={{ color: "#9CA3AF" }} />
          : <Search size={15} className="shrink-0" style={{ color: "#9CA3AF" }} />
        }
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou SKU..."
          className="flex-1 text-sm bg-transparent outline-none"
          style={{ color: "#1A1A1A" }}
          autoFocus={autoFocus}
        />
      </div>

      {dropOpen && resultados.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border overflow-hidden max-h-48 overflow-y-auto"
          style={{ borderColor: C.cremeBorder }}
        >
          {resultados.map(p => (
            <button
              key={p.id_produto}
              onClick={() => selecionar(p)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left border-b last:border-0"
              style={{ borderColor: C.creme }}
            >
              <div className="min-w-0 mr-2">
                <p className="font-medium truncate" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  {p.sku}{p.tipo_metal ? ` · ${p.tipo_metal}` : ""}
                </p>
              </div>
              {p.peso_precificado != null && (
                <span className="text-xs shrink-0" style={{ color: "#9CA3AF" }}>
                  {Number(p.peso_precificado).toFixed(2)}g
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {dropOpen && busca.length >= 2 && resultados.length === 0 && !buscando && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border px-4 py-3 text-sm"
          style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
        >
          Nenhum produto encontrado para &ldquo;{busca}&rdquo;
        </div>
      )}
    </div>
  );
}
