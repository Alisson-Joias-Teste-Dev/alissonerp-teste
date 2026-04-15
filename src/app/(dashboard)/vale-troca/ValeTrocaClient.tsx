"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Loader2, ChevronLeft, ChevronRight, Search,
  Ticket, X, CheckCircle2, AlertCircle, ArrowRight,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Vale {
  id: number;
  numero: string;
  devolucao_id: number | null;
  devolucao_numero: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  valor_original: number;
  valor_disponivel: number;
  status: "ativo" | "usado" | "expirado" | "cancelado";
  venda_utilizado_id: number | null;
  utilizado_em: string | null;
  vale_origem_id: number | null;
  created_at: string;
}

interface ValeDetalhe extends Vale {
  origem: {
    id: number;
    numero: string;
    valor_original: number;
    status: string;
  } | null;
  filhos: Array<{
    id: number;
    numero: string;
    valor_original: number;
    valor_disponivel: number;
    status: string;
    created_at: string;
  }>;
}

interface Props {
  role: string;
}

const STATUS_LABEL: Record<string, string> = {
  ativo:     "Ativo",
  usado:     "Usado",
  expirado:  "Expirado",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ativo:     { bg: "#D1FAE5", text: "#065F46" },
  usado:     { bg: "#DBEAFE", text: "#1E40AF" },
  expirado:  { bg: "#FEE2E2", text: "#991B1B" },
  cancelado: { bg: "#E5E7EB", text: "#374151" },
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ValeTrocaClient({ role }: Props) {
  void role;

  const [statusFilter, setStatusFilter] = useState("");
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<Vale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Drawer/modal detalhe
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<ValeDetalhe | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);

  // Modal validar
  const [showValidar, setShowValidar] = useState(false);
  const [validarNumero, setValidarNumero] = useState("");
  const [validarLoading, setValidarLoading] = useState(false);
  const [validarResult, setValidarResult] = useState<{
    ok: boolean;
    mensagem: string;
    valor_disponivel?: number;
    status?: string;
    cliente_id?: number | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/vale-troca?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar vales");
      const d = (await res.json()) as { data: Vale[]; total: number };
      setRows(d.data ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetalhe = async (id: number) => {
    setDetalheId(id);
    setDetalhe(null);
    setDetalheLoading(true);
    try {
      const res = await fetch(`/api/vale-troca/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar detalhe");
      setDetalhe(await res.json());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
      setDetalheId(null);
    } finally {
      setDetalheLoading(false);
    }
  };

  const validarVale = async () => {
    if (!validarNumero.trim()) return;
    setValidarLoading(true);
    setValidarResult(null);
    try {
      const res = await fetch("/api/vale-troca/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: validarNumero.trim() }),
      });
      const d = await res.json();
      setValidarResult(d);
    } catch {
      setValidarResult({ ok: false, mensagem: "Erro ao validar" });
    } finally {
      setValidarLoading(false);
    }
  };

  const filtered = rows.filter((r) => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return (
      r.numero.toLowerCase().includes(q) ||
      (r.cliente_nome ?? "").toLowerCase().includes(q) ||
      (r.devolucao_numero ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Total em vales ativos (soma saldo_disponivel dos "ativo" na pagina atual)
  // Nota: este destaque eh baseado apenas na pagina corrente.
  const totalAtivos = rows
    .filter((r) => r.status === "ativo")
    .reduce((acc, r) => acc + r.valor_disponivel, 0);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              <Ticket size={18} /> Vales-Troca
            </h2>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Gestao de vales gerados por devolucoes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
            style={{ color: "#6B7280" }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => {
              setShowValidar(true);
              setValidarNumero("");
              setValidarResult(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <CheckCircle2 size={15} /> Validar Vale
          </button>
        </div>
      </div>

      {/* Destaque: Total em vales ativos (da pagina) */}
      <div
        className="rounded-xl border p-4 flex items-center justify-between"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.esmeraldaLt }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "#6B7280" }}>
            Total em vales ativos (pagina)
          </p>
          <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: C.esmeralda }}>
            {fmt(totalAtivos)}
          </p>
        </div>
        <Ticket size={36} style={{ color: C.esmeralda, opacity: 0.4 }} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar numero, cliente ou devolucao..."
            className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
            style={{ borderColor: C.cremeBorder, color: "#374151" }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border rounded-lg px-3 py-2.5 text-sm outline-none bg-white"
          style={{ borderColor: C.cremeBorder, color: "#374151" }}
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="usado">Usado</option>
          <option value="expirado">Expirado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Tabela */}
      {error && <p className="text-center text-sm text-red-600 py-4">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.cremeBg }}>
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Numero</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Cliente</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Valor Original</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Saldo Disponivel</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Origem</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Usado em Venda</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "#9CA3AF" }}>
                      Nenhum vale encontrado
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR.ativo;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => openDetalhe(r.id)}
                        className="border-t cursor-pointer hover:bg-gray-50 transition-colors"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <td className="px-3 py-3 font-medium" style={{ color: C.esmeralda }}>{r.numero}</td>
                        <td className="px-3 py-3 max-w-[200px] truncate" style={{ color: "#374151" }}>{r.cliente_nome ?? "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>
                          {fmt(r.valor_original)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: C.esmeralda }}>
                          {fmt(r.valor_disponivel)}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {r.devolucao_numero ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {r.venda_utilizado_id ? `Venda #${r.venda_utilizado_id}` : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {fmtDate(r.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacao */}
          {total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                Pagina {page} de {totalPages} — {total} registro(s)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30"
                  style={{ color: "#6B7280" }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded hover:bg-white disabled:opacity-30"
                  style={{ color: "#6B7280" }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Validar */}
      {showValidar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowValidar(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: C.esmeralda }}>
                <CheckCircle2 size={18} /> Validar Vale-Troca
              </h3>
              <button
                onClick={() => setShowValidar(false)}
                className="p-1 rounded hover:bg-gray-100"
                style={{ color: "#6B7280" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium" style={{ color: "#6B7280" }}>
                  Numero do vale
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={validarNumero}
                    onChange={(e) => setValidarNumero(e.target.value)}
                    placeholder="VT-00001"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                    onKeyDown={(e) => e.key === "Enter" && validarVale()}
                  />
                  <button
                    onClick={validarVale}
                    disabled={!validarNumero.trim() || validarLoading}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}
                  >
                    {validarLoading ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                  </button>
                </div>
              </div>

              {validarResult && (
                <div
                  className="rounded-lg border p-3 flex items-start gap-2"
                  style={{
                    borderColor: validarResult.ok ? "#A7F3D0" : "#FECACA",
                    backgroundColor: validarResult.ok ? "#ECFDF5" : "#FEF2F2",
                  }}
                >
                  {validarResult.ok ? (
                    <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
                  ) : (
                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#991B1B" }} />
                  )}
                  <div className="text-sm flex-1" style={{ color: validarResult.ok ? "#065F46" : "#991B1B" }}>
                    <p className="font-medium">{validarResult.mensagem}</p>
                    {validarResult.ok && validarResult.valor_disponivel !== undefined && (
                      <p className="mt-1 text-xs">
                        Saldo disponivel: <strong>{fmt(validarResult.valor_disponivel)}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer Detalhe */}
      {detalheId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setDetalheId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: C.esmeralda }}>
                <Ticket size={18} /> {detalhe?.numero ?? "Carregando..."}
              </h3>
              <button
                onClick={() => setDetalheId(null)}
                className="p-1 rounded hover:bg-gray-100"
                style={{ color: "#6B7280" }}
              >
                <X size={18} />
              </button>
            </div>

            {detalheLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: C.esmeralda }} />
              </div>
            ) : detalhe ? (
              <div className="space-y-4">
                {/* Dados gerais */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Cliente" value={detalhe.cliente_nome ?? "—"} />
                  <Info label="Status" value={STATUS_LABEL[detalhe.status] ?? detalhe.status} />
                  <Info label="Valor Original" value={fmt(detalhe.valor_original)} />
                  <Info label="Saldo Disponivel" value={fmt(detalhe.valor_disponivel)} highlight />
                  <Info label="Criado em" value={fmtDate(detalhe.created_at)} />
                  <Info label="Utilizado em" value={fmtDate(detalhe.utilizado_em)} />
                </div>

                {/* Origem (devolucao) */}
                {detalhe.devolucao_numero && (
                  <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                    <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                      Gerado a partir da devolucao
                    </p>
                    <Link
                      href={`/devolucoes/${detalhe.devolucao_id}`}
                      className="text-sm font-medium flex items-center gap-1 hover:underline"
                      style={{ color: C.esmeralda }}
                    >
                      {detalhe.devolucao_numero}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}

                {/* Vale de origem (se este eh um troco de outro vale) */}
                {detalhe.origem && (
                  <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
                    <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                      Vale de origem (troco de)
                    </p>
                    <button
                      onClick={() => openDetalhe(detalhe.origem!.id)}
                      className="text-sm font-medium flex items-center gap-1 hover:underline"
                      style={{ color: C.esmeralda }}
                    >
                      {detalhe.origem.numero} ({fmt(detalhe.origem.valor_original)})
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}

                {/* Filhos (trocos gerados) */}
                {detalhe.filhos.length > 0 && (
                  <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "#6B7280" }}>
                      Vales-troco gerados
                    </p>
                    <div className="space-y-1.5">
                      {detalhe.filhos.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => openDetalhe(f.id)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-left"
                        >
                          <span className="text-sm font-medium" style={{ color: C.esmeralda }}>
                            {f.numero}
                          </span>
                          <span className="text-xs tabular-nums" style={{ color: "#374151" }}>
                            {fmt(f.valor_disponivel)} disp. — {STATUS_LABEL[f.status] ?? f.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usado em venda */}
                {detalhe.venda_utilizado_id && (
                  <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
                    <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                      Usado na venda
                    </p>
                    <Link
                      href={`/vendas/${detalhe.venda_utilizado_id}`}
                      className="text-sm font-medium flex items-center gap-1 hover:underline"
                      style={{ color: C.esmeralda }}
                    >
                      Venda #{detalhe.venda_utilizado_id}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>{label}</p>
      <p
        className="text-sm font-medium mt-0.5"
        style={{ color: highlight ? C.esmeralda : "#374151" }}
      >
        {value}
      </p>
    </div>
  );
}
