"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Calendar, Tag } from "lucide-react";
import { useErrorStore } from "@/stores/errorStore";

interface ItemDetalhe {
  id: number;
  produto_id: number;
  sku: string | null;
  nome: string | null;
  preco_original: string;
  preco_promo: string;
  preco_tiny: string | null;
  pct_desconto: string;
}

interface Campanha {
  id: number;
  nome_campanha: string;
  data_inicio: string;
  data_fim: string;
  situacao_manual: string;
  situacao_efetiva: "ativa" | "agendada" | "encerrada" | "cancelada";
  observacao: string | null;
  max_parcelas_cartao: number | null;
  itens: ItemDetalhe[];
}

const BADGE_CLASS: Record<string, string> = {
  ativa:     "bg-emerald-100 text-emerald-800 border-emerald-300",
  agendada:  "bg-blue-100 text-blue-800 border-blue-300",
  encerrada: "bg-gray-100 text-gray-700 border-gray-300",
  cancelada: "bg-red-100 text-red-700 border-red-300",
};

function fmtData(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtMoeda(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PromocaoDetalheClient({
  id, podeEditar,
}: { id: number; podeEditar: boolean }) {
  const [camp, setCamp] = useState<Campanha | null>(null);
  const [loading, setLoading] = useState(true);
  const pushError = useErrorStore(s => s.push);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/promocoes/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        pushError(body.error ?? "Erro ao carregar promocao");
        setCamp(null);
        return;
      }
      setCamp(await res.json());
    } catch (err) {
      pushError("Falha de rede", { detail: String(err) });
      setCamp(null);
    } finally { setLoading(false); }
  }, [id, pushError]);

  useEffect(() => { load(); }, [load]);

  async function encerrar() {
    if (!confirm("Encerrar essa promocao agora?")) return;
    const res = await fetch(`/api/promocoes/${id}/encerrar`, { method: "PATCH" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      pushError(body.error ?? "Erro ao encerrar");
      return;
    }
    load();
  }

  async function cancelar() {
    if (!confirm("Cancelar essa promocao agendada?")) return;
    const res = await fetch(`/api/promocoes/${id}/cancelar`, { method: "PATCH" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      pushError(body.error ?? "Erro ao cancelar");
      return;
    }
    load();
  }

  // Edição da regra "máximo de parcelas" — só funciona enquanto a promo está
  // 'agendada' (mesma restrição do PATCH no backend).
  const [editandoMax, setEditandoMax] = useState(false);
  const [maxInput, setMaxInput] = useState<string>("");
  const [savingMax, setSavingMax] = useState(false);

  function abrirEdicaoMax() {
    setMaxInput(camp?.max_parcelas_cartao != null ? String(camp.max_parcelas_cartao) : "");
    setEditandoMax(true);
  }

  async function salvarMax() {
    const raw = maxInput.trim();
    const valor = raw === "" ? null : parseInt(raw, 10);
    if (valor != null && (!Number.isInteger(valor) || valor < 1 || valor > 12)) {
      pushError("Máximo de parcelas deve ser entre 1 e 12 (ou vazio)");
      return;
    }
    setSavingMax(true);
    try {
      const res = await fetch(`/api/promocoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_parcelas_cartao: valor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        pushError(body.error ?? "Erro ao salvar regra de parcelas");
        return;
      }
      setEditandoMax(false);
      load();
    } catch (err) {
      pushError("Falha de rede", { detail: String(err) });
    } finally { setSavingMax(false); }
  }

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-creme-50 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin mr-2 text-gray-400" /> Carregando...
      </div>
    );
  }
  if (!camp) {
    return (
      <div className="p-6 min-h-screen bg-creme-50">
        <Link href="/comercial/promocoes" className="text-sm text-alisson-gold hover:underline">
          &larr; Voltar
        </Link>
        <p className="mt-4 text-gray-500">Promocao nao encontrada.</p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-creme-50">
      <div className="max-w-5xl mx-auto">
        <Link href="/comercial/promocoes" className="inline-flex items-center text-sm text-gray-600 hover:text-alisson-gold mb-4">
          <ChevronLeft size={16} /> Voltar
        </Link>

        {/* Header */}
        <div className="bg-white border border-creme-200 rounded-xl p-5 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Tag className="text-alisson-gold" size={20} />
                <h1 className="text-xl font-semibold text-gray-900">{camp.nome_campanha}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${BADGE_CLASS[camp.situacao_efetiva]}`}>
                  {camp.situacao_efetiva}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar size={12} /> {fmtData(camp.data_inicio)} - {fmtData(camp.data_fim)}
                </span>
                <span>{camp.itens.length} {camp.itens.length === 1 ? "item" : "itens"}</span>
              </div>
              {camp.observacao && (
                <p className="mt-2 text-xs text-gray-600">{camp.observacao}</p>
              )}
              {/* Regra de pagamento: máximo de parcelas no cartão */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
                  Máx. parcelas no cartão:
                </span>
                {editandoMax ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={maxInput}
                      onChange={(e) => setMaxInput(e.target.value)}
                      placeholder="sem restrição"
                      className="w-32 px-2 py-1 text-xs border border-creme-200 rounded focus:outline-none focus:border-alisson-gold/50"
                    />
                    <button
                      onClick={salvarMax}
                      disabled={savingMax}
                      className="px-2 py-1 text-[11px] font-semibold text-white rounded disabled:opacity-50"
                      style={{ background: "#184036" }}
                    >
                      {savingMax ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      onClick={() => setEditandoMax(false)}
                      disabled={savingMax}
                      className="px-2 py-1 text-[11px] font-semibold text-gray-600 border border-creme-200 rounded"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-gray-800">
                      {camp.max_parcelas_cartao != null ? `${camp.max_parcelas_cartao}x` : "Sem restrição (12x default)"}
                    </span>
                    {podeEditar && camp.situacao_efetiva === "agendada" && (
                      <button
                        onClick={abrirEdicaoMax}
                        className="text-[11px] text-alisson-gold hover:underline"
                      >
                        editar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {podeEditar && (
              <div className="flex items-center gap-2">
                {(camp.situacao_efetiva === "ativa" || camp.situacao_efetiva === "agendada") && (
                  <button
                    onClick={encerrar}
                    className="px-3 py-1.5 text-xs font-semibold text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50"
                  >
                    Encerrar
                  </button>
                )}
                {camp.situacao_efetiva === "agendada" && (
                  <button
                    onClick={cancelar}
                    className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white border border-creme-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-creme-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">SKU</th>
                <th className="text-left px-4 py-2 font-semibold">Produto</th>
                <th className="text-right px-4 py-2 font-semibold">Preco original</th>
                <th className="text-right px-4 py-2 font-semibold">Preco promo</th>
                <th className="text-right px-4 py-2 font-semibold">% desc.</th>
              </tr>
            </thead>
            <tbody>
              {camp.itens.map(i => (
                <tr key={i.id} className="border-t border-creme-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{i.sku ?? "-"}</td>
                  <td className="px-4 py-2 text-gray-900">{i.nome ?? `#${i.produto_id}`}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtMoeda(i.preco_original)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-alisson-gold">{fmtMoeda(i.preco_promo)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">-{parseFloat(i.pct_desconto).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
