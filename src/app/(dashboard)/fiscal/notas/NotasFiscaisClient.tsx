"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, FileText, Download, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import NotaFiscalDetalheModal from "@/components/fiscal/NotaFiscalDetalheModal";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA", cremeBg: "#FAFAF7" };

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface NotaFiscal {
  id: number;
  modelo: "55" | "65";
  serie: number;
  numero: number | null;
  chave_44: string | null;
  status: string;
  valor_total: number;
  emitida_em: string | null;
  pdf_danfe_url: string | null;
  xml_protocolo: string | null;
  emitente_razao_social: string | null;
  origem_tipo: string | null;
  origem_id: number | null;
  origem_numero: string | null;
  mensagem_sefaz: string | null;
}

interface Paginacao {
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  autorizada:  { bg: "#ECFDF5", color: "#059669", label: "Autorizada"  },
  processando: { bg: "#FFFBEB", color: "#D97706", label: "Processando" },
  rejeitada:   { bg: "#FEF2F2", color: "#DC2626", label: "Rejeitada"   },
  cancelada:   { bg: "#F3F4F6", color: "#6B7280", label: "Cancelada"   },
  rascunho:    { bg: "#FAFAF8", color: "#78716C", label: "Rascunho"    },
  denegada:    { bg: "#FFF7ED", color: "#EA580C", label: "Denegada"    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { bg: "#F3F4F6", color: "#6B7280", label: status };
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function ModeloBadge({ modelo }: { modelo: "55" | "65" }) {
  return modelo === "65" ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">NFC-e</span>
  ) : (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">NF-e</span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function origemLabel(nota: NotaFiscal): string {
  if (!nota.origem_tipo) return "—";
  if (nota.origem_tipo === "vendas_erp" && nota.origem_numero) return `Venda #${nota.origem_numero}`;
  if (nota.origem_numero) return `${nota.origem_tipo} #${nota.origem_numero}`;
  return nota.origem_tipo;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  role: string;
}

export default function NotasFiscaisClient({ role: _role }: Props) {
  const [notas, setNotas]       = useState<NotaFiscal[]>([]);
  const [pag, setPag]           = useState<Paginacao | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [verNotaId, setVerNotaId] = useState<number | null>(null);

  // Filtros
  const [modelo, setModelo]     = useState("");
  const [status, setStatus]     = useState("");
  const [busca, setBusca]       = useState("");
  const [page, setPage]         = useState(1);

  const fetchNotas = useCallback(async (p?: number) => {
    setLoading(true);
    setError(null);
    const pg = p ?? page;
    try {
      const params = new URLSearchParams({ page: String(pg), per_page: "20" });
      if (modelo) params.set("modelo", modelo);
      if (status) params.set("status", status);
      if (busca.trim()) params.set("q", busca.trim());
      const res = await fetch(`/api/fiscal/notas?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setNotas(j.notas ?? j);
      if (j.paginacao) setPag(j.paginacao);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar notas");
    } finally {
      setLoading(false);
    }
  }, [modelo, status, busca, page]);

  useEffect(() => {
    setPage(1);
    fetchNotas(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, status]);

  function handleBusca(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchNotas(1);
  }

  function goPage(p: number) {
    setPage(p);
    fetchNotas(p);
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Notas Fiscais
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            Histórico de NFC-e e NF-e emitidas
          </p>
        </div>
        <button
          onClick={() => fetchNotas()}
          disabled={loading}
          className="p-2 rounded-xl border hover:opacity-70 disabled:opacity-40 transition-opacity"
          style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}
          title="Atualizar"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Filtros */}
      <div
        className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        {/* Modelo */}
        <select
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <option value="">Todos os modelos</option>
          <option value="65">NFC-e (65)</option>
          <option value="55">NF-e (55)</option>
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <option value="">Todos os status</option>
          <option value="autorizada">Autorizada</option>
          <option value="processando">Processando</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
          <option value="rascunho">Rascunho</option>
        </select>

        {/* Busca */}
        <form onSubmit={handleBusca} className="flex gap-1.5 flex-1 min-w-48">
          <input
            type="text"
            placeholder="Buscar por número ou chave..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ background: C.esmeralda }}
          >
            Buscar
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Modelo", "Número", "Emitente", "Origem", "Valor Total", "Status", "Emitida em", "Ações"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#9CA3AF" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && notas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={16} className="animate-spin inline-block mr-2" />
                    Carregando...
                  </td>
                </tr>
              ) : notas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center" style={{ color: "#9CA3AF" }}>
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma nota fiscal encontrada</p>
                  </td>
                </tr>
              ) : (
                notas.map((n, i) => (
                  <tr
                    key={n.id}
                    className="hover:bg-stone-50 transition-colors"
                    style={{ borderTop: i > 0 ? `1px solid ${C.creme}` : undefined }}
                  >
                    <td className="px-4 py-3">
                      <ModeloBadge modelo={n.modelo} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: C.esmeralda }}>
                      {n.numero ? `${n.serie}-${String(n.numero).padStart(6, "0")}` : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[150px]">
                      <p className="truncate text-xs text-gray-700">
                        {n.emitente_razao_social ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {origemLabel(n)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-medium whitespace-nowrap" style={{ color: "#374151" }}>
                      {fmt(n.valor_total ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={n.status} />
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap" style={{ color: "#9CA3AF" }}>
                      {fmtDate(n.emitida_em)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setVerNotaId(n.id)}
                          title="Ver detalhes"
                          className="p-1.5 rounded-lg border hover:bg-stone-50 transition-colors inline-flex items-center gap-1 text-xs"
                          style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                        >
                          <Eye size={13} />
                          Ver
                        </button>
                        {n.pdf_danfe_url && (
                          <a
                            href={n.pdf_danfe_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Baixar DANFE"
                            className="p-1.5 rounded-lg border hover:bg-stone-50 transition-colors inline-flex items-center gap-1 text-xs"
                            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                          >
                            <Download size={13} />
                            DANFE
                          </a>
                        )}
                        {n.xml_protocolo && (
                          <a
                            href={n.xml_protocolo}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Baixar XML"
                            className="p-1.5 rounded-lg border hover:bg-stone-50 transition-colors inline-flex items-center gap-1 text-xs"
                            style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                          >
                            <Download size={13} />
                            XML
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pag && pag.pages > 1 && (
          <div
            className="px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderTop: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
          >
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
              {pag.total} nota{pag.total !== 1 ? "s" : ""} · pág. {pag.page} de {pag.pages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goPage(pag.page - 1)}
                disabled={pag.page <= 1}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => goPage(pag.page + 1)}
                disabled={pag.page >= pag.pages}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {verNotaId && (
        <NotaFiscalDetalheModal notaId={verNotaId} onClose={() => setVerNotaId(null)} />
      )}
    </div>
  );
}
