"use client";

import { useEffect, useState, Fragment } from "react";
import { ShoppingBag } from "lucide-react";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
};

interface ItemOrdem {
  id: number;
  quantidade: number;
  produto_id: string | number;
  produto_nome: string | null;
  produto_sku: string | null;
  produto_peso: number | null;
  produto_imagem: string | null;
  personalizacao?: { valor?: string } | null;
}

// Itens criados antes do helper passar a usar o nome comercial podem ter
// "Aliança 1 - Quadrado Canal" gravado. Normaliza pra exibir o nome do
// orçamento (mesmo que ourives ve em "Bordas Elevadas").
const NOME_ALIAS: Array<[RegExp, string]> = [
  [/Quadrado Canal/g, "Bordas Elevadas"],
  [/Boleada Dupla/g, "Boleada Dentro e Fora"],
];
function normalizeNomeProduto(nome: string | null): string | null {
  if (!nome) return nome;
  let out = nome;
  for (const [re, sub] of NOME_ALIAS) out = out.replace(re, sub);
  return out;
}

export default function ItensOrdemSection({ ordemId }: { ordemId: number }) {
  const [itens, setItens] = useState<ItemOrdem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ordens/${ordemId}/itens`)
      .then((r) => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
      })
      .then(setItens)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [ordemId]);

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
      >
        <div className="flex items-center gap-2">
          <ShoppingBag size={14} style={{ color: C.esmeralda }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
            Itens da Ordem
          </span>
          {!loading && itens.length > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: "#E8F0ED", color: C.esmeralda }}
            >
              {itens.length}
            </span>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="px-5 py-4 space-y-2">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-3/5" />
                <div className="h-2.5 bg-gray-100 rounded w-1/4" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-12" />
            </div>
          ))}
        </div>
      ) : erro ? (
        <p className="text-[12px] px-5 py-4 text-center" style={{ color: "#DC2626" }}>
          Erro ao carregar itens: {erro}
        </p>
      ) : itens.length === 0 ? (
        <p className="text-[12px] px-5 py-4 text-center" style={{ color: "#9CA3AF" }}>
          Nenhum item encontrado para esta ordem.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: C.esmeralda }}>
              {["Produto", "SKU", "Qtd", "Peso (g)"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: C.sage }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((item, i) => (<Fragment key={item.id}>
              <tr
                className={item.personalizacao?.valor ? "" : "border-b"}
                style={{
                  borderColor: C.creme,
                  backgroundColor: i % 2 === 0 ? "#fff" : C.bg,
                }}
              >
                <td className="px-4 py-2.5 text-[13px]" style={{ color: "#1A1A1A" }}>
                  {normalizeNomeProduto(item.produto_nome) ?? (
                    <span style={{ color: "#9CA3AF" }}>ID {item.produto_id}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                  {item.produto_sku ?? "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm font-semibold" style={{ color: C.dourado }}>
                  {Number(item.quantidade) % 1 === 0
                    ? Number(item.quantidade).toFixed(0)
                    : Number(item.quantidade).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: "#6B7280" }}>
                  {item.produto_peso != null ? Number(item.produto_peso).toFixed(2) : "—"}
                </td>
              </tr>
              {item.personalizacao?.valor && (
                <tr key={`${item.id}-pers`} className="border-b" style={{ borderColor: C.creme, backgroundColor: "#FFFCF5" }}>
                  <td colSpan={4} className="px-4 py-2" style={{ borderTop: `1px solid ${C.cremeBorder}` }}>
                    <div className="flex items-center gap-2 pl-2 border-l-2" style={{ borderColor: "#D4A843" }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#184036" }}>🏷️ Nome a gravar</span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#FFF8E6", color: "#92400E", letterSpacing: "0.08em" }}>
                        {item.personalizacao.valor.toUpperCase()}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>))}
          </tbody>
        </table>
      )}
    </div>
  );
}
