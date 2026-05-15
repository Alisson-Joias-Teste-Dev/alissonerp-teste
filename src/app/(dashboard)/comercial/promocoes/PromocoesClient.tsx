"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tag, Plus, Search, Loader2, Calendar, AlertCircle } from "lucide-react";
import { useErrorStore } from "@/stores/errorStore";
import NovaPromocaoModal from "@/components/promocoes/NovaPromocaoModal";

type Status = "ativa" | "agendada" | "encerrada" | "cancelada" | "todas";

interface PromocaoRow {
  id: number;
  nome_campanha: string;
  data_inicio: string;
  data_fim: string;
  situacao_manual: string;
  situacao_efetiva: Status;
  qtd_itens: number;
  observacao: string | null;
}

const STATUS_TABS: { id: Status; label: string }[] = [
  { id: "ativa",     label: "Ativas" },
  { id: "agendada",  label: "Agendadas" },
  { id: "encerrada", label: "Encerradas" },
  { id: "cancelada", label: "Canceladas" },
  { id: "todas",     label: "Todas" },
];

const BADGE_CLASS: Record<Status, string> = {
  ativa:     "bg-emerald-100 text-emerald-800 border-emerald-300",
  agendada:  "bg-blue-100 text-blue-800 border-blue-300",
  encerrada: "bg-gray-100 text-gray-700 border-gray-300",
  cancelada: "bg-red-100 text-red-700 border-red-300",
  todas:     "bg-gray-100 text-gray-700 border-gray-300",
};

function fmtData(iso: string) {
  // YYYY-MM-DD -> DD/MM/YYYY
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function PromocoesClient({ podeEditar }: { podeEditar: boolean }) {
  const [status, setStatus] = useState<Status>("ativa");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PromocaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const pushError = useErrorStore(s => s.push);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, limit: "50" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/promocoes?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        pushError(body.error ?? "Erro ao listar promocoes");
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.promocoes ?? []);
    } catch (err) {
      pushError("Falha de rede ao listar promocoes", { detail: String(err) });
      setRows([]);
    } finally { setLoading(false); }
  }, [status, q, pushError]);

  useEffect(() => { load(); }, [load]);

  async function encerrar(id: number) {
    if (!confirm("Encerrar essa promocao agora? Os produtos voltam ao preco normal imediatamente.")) return;
    const res = await fetch(`/api/promocoes/${id}/encerrar`, { method: "PATCH" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      pushError(body.error ?? "Erro ao encerrar");
      return;
    }
    load();
  }

  async function cancelar(id: number) {
    if (!confirm("Cancelar essa promocao agendada? Essa acao nao pode ser desfeita.")) return;
    const res = await fetch(`/api/promocoes/${id}/cancelar`, { method: "PATCH" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      pushError(body.error ?? "Erro ao cancelar");
      return;
    }
    load();
  }

  return (
    <div className="p-6 min-h-screen bg-creme-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="text-alisson-gold" size={24} />
              Promocoes
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Campanhas de descontos por janela de tempo. Reversao automatica ao fim do periodo.
            </p>
          </div>
          {podeEditar && (
            <button
              onClick={() => setOpenModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-alisson-gold text-white rounded-lg shadow hover:opacity-90 transition"
            >
              <Plus size={16} />
              Nova Campanha
            </button>
          )}
        </div>

        {/* Tabs + busca */}
        <div className="bg-white rounded-xl shadow-sm border border-creme-200 p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex bg-creme-50 p-1 rounded-lg border border-creme-200">
              {STATUS_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setStatus(t.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    status === t.id
                      ? "bg-alisson-gold text-white shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome..."
                className="pl-9 pr-3 py-2 text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-creme-200 p-12 text-center text-gray-500">
            <AlertCircle size={28} className="mx-auto mb-2 text-gray-300" />
            Nenhuma promocao encontrada.
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map(p => (
              <div
                key={p.id}
                className="bg-white border border-creme-200 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/comercial/promocoes/${p.id}`}
                      className="font-semibold text-gray-900 hover:text-alisson-gold truncate"
                    >
                      {p.nome_campanha}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${BADGE_CLASS[p.situacao_efetiva]}`}>
                      {p.situacao_efetiva}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {fmtData(p.data_inicio)} - {fmtData(p.data_fim)}
                    </span>
                    <span>{p.qtd_itens} {p.qtd_itens === 1 ? "produto" : "produtos"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Link
                    href={`/comercial/promocoes/${p.id}`}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 border border-creme-200 rounded-lg hover:bg-creme-50"
                  >
                    Ver itens
                  </Link>
                  {podeEditar && (p.situacao_efetiva === "ativa" || p.situacao_efetiva === "agendada") && (
                    <button
                      onClick={() => encerrar(p.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50"
                    >
                      Encerrar
                    </button>
                  )}
                  {podeEditar && p.situacao_efetiva === "agendada" && (
                    <button
                      onClick={() => cancelar(p.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openModal && (
        <NovaPromocaoModal
          isOpen={openModal}
          onClose={() => setOpenModal(false)}
          onCreated={() => { setOpenModal(false); load(); }}
        />
      )}
    </div>
  );
}
