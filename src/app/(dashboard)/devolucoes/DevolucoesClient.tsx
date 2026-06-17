"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, Plus, Loader2, ChevronLeft, ChevronRight, Search,
  RotateCcw,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Devolucao {
  id: number;
  numero: string;
  venda_id: number;
  numero_venda: string;
  tipo: "parcial" | "total";
  status: string;
  tipo_compensacao: "vale_troca" | "reembolso_mp" | "reembolso_manual";
  valor_total_devolvido: number;
  valor_retido: number;
  valor_compensacao: number;
  percentual_retencao: number;
  foi_entregue: boolean;
  cliente_id: number | null;
  cliente_nome: string | null;
  motivo: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  role: string;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  rascunho:             { bg: "#F3F4F6", text: "#6B7280" },
  aguardando_aprovacao: { bg: "#FEF9C3", text: "#713F12" },
  aprovado:             { bg: "#DBEAFE", text: "#1E40AF" },
  rejeitado:            { bg: "#FEE2E2", text: "#991B1B" },
  concluido:            { bg: "#D1FAE5", text: "#065F46" },
  cancelado:            { bg: "#E5E7EB", text: "#374151" },
};

const COMPENSACAO_LABEL: Record<string, string> = {
  vale_troca:       "Vale-Troca",
  reembolso_mp:     "Reembolso MP",
  reembolso_manual: "Reembolso Manual",
};

const TIPO_LABEL: Record<string, string> = {
  parcial: "Parcial",
  total:   "Total",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function DevolucoesClient({ role }: Props) {
  const router = useRouter();
  void role;

  const [statusFilter, setStatusFilter] = useState("");
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<Devolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      // B1: busca agora vai pro servidor (filtra todas as paginas, nao so a carregada)
      if (busca.trim()) params.set("busca", busca.trim());
      const res = await fetch(`/api/devolucoes?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar devoluções");
      const d = (await res.json()) as { data: Devolucao[]; total: number };
      setRows(d.data ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, busca]);

  // Volta pra primeira pagina quando muda o filtro/busca (evita pagina vazia).
  useEffect(() => {
    setPage(1);
  }, [busca, statusFilter]);

  // Debounce: nao dispara um fetch por tecla digitada na busca.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  // A busca agora e server-side; a lista exibida e exatamente o que veio da API.
  const filtered = rows;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              <RotateCcw size={18} /> Devoluções
            </h2>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Gerenciamento de devoluções de vendas, vale-troca e reembolsos.
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
          <Link
            href="/devolucoes/nova"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} /> Nova Devolução
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nº devolução, venda ou cliente..."
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
          <option value="rascunho">Rascunho</option>
          <option value="aguardando_aprovacao">Aguardando Aprovação</option>
          <option value="aprovado">Aprovado</option>
          <option value="concluido">Concluído</option>
          <option value="rejeitado">Rejeitado</option>
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
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Número</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Venda</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Cliente</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Data</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Tipo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Valor Dev.</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Compensação</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>Via</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center" style={{ color: "#9CA3AF" }}>
                      Nenhuma devolução encontrada
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR.rascunho;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/devolucoes/${r.id}`)}
                        className="border-t cursor-pointer hover:bg-gray-50 transition-colors"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <td className="px-3 py-3 font-medium" style={{ color: C.esmeralda }}>{r.numero}</td>
                        <td className="px-3 py-3" style={{ color: "#374151" }}>{r.numero_venda ?? "—"}</td>
                        <td className="px-3 py-3 max-w-[200px] truncate" style={{ color: "#374151" }}>{r.cliente_nome ?? "—"}</td>
                        <td className="px-3 py-3 text-xs" style={{ color: "#6B7280" }}>{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                            {TIPO_LABEL[r.tipo] ?? r.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: "#1A1A1A" }}>
                          {fmt(r.valor_total_devolvido)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: C.esmeralda }}>
                          {fmt(r.valor_compensacao)}
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: "#6B7280" }}>
                          {COMPENSACAO_LABEL[r.tipo_compensacao] ?? r.tipo_compensacao}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <span className="text-xs" style={{ color: "#6B7280" }}>
                Página {page} de {totalPages} — {total} registro(s)
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
    </div>
  );
}
