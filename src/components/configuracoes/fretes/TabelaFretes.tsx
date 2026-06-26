"use client";

import { Search, X, Save, CheckCircle, AlertTriangle } from "lucide-react";
import { Button, Toggle, StatusBadge } from "@/components/ui";

const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

interface FreteBairro {
  id: number;
  bairro: string;
  municipio: string | null;
  valor: number;
  ativo: boolean;
}

interface TabelaFretesProps {
  fretes: FreteBairro[];
  filtro: string;
  onFiltroChange: (v: string) => void;
  editValores: Record<number, string>;
  onEditValorChange: (id: number, valor: string) => void;
  onSalvar: (frete: FreteBairro) => void;
  onToggleAtivo: (frete: FreteBairro) => void;
  salvandoId: number | null;
  savedId: number | null;
  erroId: number | null;
}

export default function TabelaFretes({
  fretes,
  filtro,
  onFiltroChange,
  editValores,
  onEditValorChange,
  onSalvar,
  onToggleAtivo,
  salvandoId,
  savedId,
  erroId,
}: TabelaFretesProps) {
  const filtered = fretes.filter(f =>
    filtro.trim() === "" ||
    f.bairro.toLowerCase().includes(filtro.toLowerCase()) ||
    (f.municipio ?? "").toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <>
      {/* Filtro */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: P.muted }} />
        <input
          type="text"
          value={filtro}
          onChange={e => onFiltroChange(e.target.value)}
          placeholder="Filtrar por bairro ou município..."
          className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
          style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
        />
        {filtro && (
          <button onClick={() => onFiltroChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={12} />
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: P.muted }}>
        {filtered.length} {filtered.length === 1 ? "bairro" : "bairros"}{filtro ? " encontrado(s)" : " no total"}
      </p>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <div className="overflow-x-auto" style={{ maxHeight: 600, overflowY: "auto" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Bairro", "Município", "Valor (R$)", "Ativo", "Ações"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: P.muted }}>
                    {filtro ? "Nenhum bairro encontrado para este filtro" : "Nenhum frete cadastrado"}
                  </td>
                </tr>
              ) : (
                filtered.map(frete => (
                  <tr key={frete.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: P.border }}>
                    <td className="px-4 py-3 font-medium" style={{ color: P.creme }}>{frete.bairro}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: P.sage }}>{frete.municipio ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: P.muted }}>R$</span>
                        <input
                          type="text"
                          value={editValores[frete.id] !== undefined ? editValores[frete.id] : String(frete.valor)}
                          onChange={e => onEditValorChange(frete.id, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") onSalvar(frete); }}
                          className="w-24 border rounded-lg px-2 py-1 text-sm text-right outline-none"
                          style={{ borderColor: P.border, backgroundColor: P.card, color: P.creme }}
                        />
                        {savedId === frete.id && <CheckCircle size={13} style={{ color: P.verde }} />}
                        {erroId === frete.id && <AlertTriangle size={13} style={{ color: P.vermelho }} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Toggle ativo={frete.ativo} onChange={() => onToggleAtivo(frete)} disabled={salvandoId === frete.id} />
                        <StatusBadge ativo={frete.ativo} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={salvandoId === frete.id}
                        disabled={editValores[frete.id] === undefined}
                        onClick={() => onSalvar(frete)}
                      >
                        <Save size={11} /> Salvar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
