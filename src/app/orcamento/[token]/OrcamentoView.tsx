"use client";

import { useState, useEffect } from "react";
import { Printer, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ItemOrcamento {
  nome_produto:   string;
  sku:            string | null;
  quantidade:     number;
  preco_lista:    number;
  pct_desconto:   number;
  preco_unitario: number;
  total_item:     number;
  observacao:     string | null;
}

interface Orcamento {
  id:              number;
  numero_venda:    string;
  cliente_nome:    string | null;
  cliente_email:   string | null;
  cliente_telefone: string | null;
  data_venda:      string;
  data_entrega:    string | null;
  total_produtos:  number;
  total_desconto:  number;
  total_frete:     number;
  total_venda:     number;
  situacao:        string;
  forma_envio:     string | null;
  observacoes:     string | null;
  itens:           ItemOrcamento[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const SITUACAO_LABEL: Record<string, string> = {
  rascunho:  "Rascunho",
  aprovado:  "Aprovado",
  enviado:   "Enviado",
  concluido: "Concluído",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrcamentoView({ token }: { token: string }) {
  const [orc,     setOrc]     = useState<Orcamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch(`/api/orcamento/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Orcamento>;
      })
      .then(setOrc)
      .catch(e => setError(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAFAF7" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#184036" }} />
      </div>
    );
  }

  if (error || !orc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: "#FAFAF7" }}>
        <p className="text-lg font-semibold" style={{ color: "#184036" }}>Orçamento não encontrado</p>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  const totalDesconto = orc.itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);

  return (
    <>
      {/* Botão imprimir — oculto no print */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: "#184036", color: "#F3EADA" }}
        >
          <Printer size={15} />
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Orçamento */}
      <div
        className="min-h-screen py-10 px-4"
        style={{ backgroundColor: "#FAFAF7" }}
      >
        <div
          className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border p-8 print:shadow-none print:border-none print:rounded-none print:p-6"
          style={{ borderColor: "#E8DCC8" }}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b" style={{ borderColor: "#E8DCC8" }}>
            <div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Orçamento</p>
              <h1
                className="text-2xl font-bold"
                style={{ fontFamily: "Georgia, serif", color: "#184036" }}
              >
                {orc.numero_venda}
              </h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: orc.situacao === "aprovado" ? "#D1FAE5" : "#F3F4F6",
                    color:           orc.situacao === "aprovado" ? "#065F46" : "#6B7280",
                  }}
                >
                  {SITUACAO_LABEL[orc.situacao] ?? orc.situacao}
                </span>
                <span className="text-xs" style={{ color: "#9CA3AF" }}>
                  Emitido em {fmtDate(orc.data_venda)}
                </span>
                {orc.data_entrega && (
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>
                    · Entrega: {fmtDate(orc.data_entrega)}
                  </span>
                )}
              </div>
            </div>

            {/* Logo empresa */}
            <div className="text-right">
              <p className="font-bold text-base" style={{ color: "#184036" }}>Alisson Joias</p>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>alissonjoias.com.br</p>
            </div>
          </div>

          {/* Cliente */}
          {orc.cliente_nome && (
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>Cliente</p>
              <p className="font-semibold" style={{ color: "#1A1A1A" }}>{orc.cliente_nome}</p>
              {orc.cliente_email && <p className="text-sm" style={{ color: "#6B7280" }}>{orc.cliente_email}</p>}
              {orc.cliente_telefone && <p className="text-sm" style={{ color: "#6B7280" }}>{orc.cliente_telefone}</p>}
            </div>
          )}

          {/* Itens */}
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>Produtos</p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #E8DCC8" }}>
                  <th className="text-left pb-2 font-semibold" style={{ color: "#6B7280" }}>Produto</th>
                  <th className="text-center pb-2 font-semibold w-12" style={{ color: "#6B7280" }}>Qtd</th>
                  <th className="text-right pb-2 font-semibold w-28" style={{ color: "#6B7280" }}>Preço Unit.</th>
                  <th className="text-right pb-2 font-semibold w-28" style={{ color: "#6B7280" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orc.itens.map((item, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #F3F4F6" }}
                  >
                    <td className="py-2.5 pr-3">
                      <p style={{ color: "#1A1A1A" }}>{item.nome_produto}</p>
                      {item.sku && <p className="text-xs" style={{ color: "#9CA3AF" }}>{item.sku}</p>}
                      {item.pct_desconto > 0 && (
                        <p className="text-xs" style={{ color: "#D97706" }}>
                          Desconto {item.pct_desconto}%
                          {" "}(lista: {fmt(item.preco_lista)})
                        </p>
                      )}
                      {item.observacao && (
                        <p className="text-xs italic mt-0.5" style={{ color: "#9CA3AF" }}>{item.observacao}</p>
                      )}
                    </td>
                    <td className="py-2.5 text-center tabular-nums" style={{ color: "#374151" }}>{item.quantidade}</td>
                    <td className="py-2.5 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_unitario)}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium" style={{ color: "#184036" }}>{fmt(item.total_item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totais */}
          <div className="ml-auto max-w-xs space-y-1.5 mb-6">
            {totalDesconto > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6B7280" }}>Subtotal</span>
                <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(orc.total_produtos + totalDesconto)}</span>
              </div>
            )}
            {totalDesconto > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "#D97706" }}>Desconto</span>
                <span className="tabular-nums" style={{ color: "#D97706" }}>−{fmt(totalDesconto)}</span>
              </div>
            )}
            {orc.total_frete > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6B7280" }}>
                  Frete{orc.forma_envio ? ` (${orc.forma_envio})` : ""}
                </span>
                <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(orc.total_frete)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-base font-bold pt-2 border-t"
              style={{ borderColor: "#E8DCC8" }}
            >
              <span style={{ color: "#184036" }}>Total</span>
              <span className="tabular-nums" style={{ color: "#184036" }}>{fmt(orc.total_venda)}</span>
            </div>
          </div>

          {/* Observações */}
          {orc.observacoes && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{ backgroundColor: "#FAFAF7", borderLeft: "3px solid #184036" }}
            >
              <p className="font-semibold mb-1 text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Observações</p>
              <p style={{ color: "#374151" }}>{orc.observacoes}</p>
            </div>
          )}

          {/* Rodapé */}
          <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: "#E8DCC8" }}>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Este orçamento tem validade de 7 dias a partir da data de emissão.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
