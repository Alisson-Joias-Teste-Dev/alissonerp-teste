"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle,
  Settings2, Loader2, Save, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaldoItem {
  produto_id:     number;
  nome_produto:   string;
  sku:            string | null;
  saldo:          number;
  estoque_minimo: number;
  ativo:          boolean;
  alerta:         string;
}

interface Movimento {
  id:              number;
  tipo:            "entrada" | "saida";
  quantidade:      number;
  motivo:          string;
  observacao:      string | null;
  referencia_tipo: string | null;
  referencia_id:   number | null;
  created_at:      string;
  criado_por:      string | null;
}

interface DetalheData {
  saldo:      SaldoItem | null;
  movimentos: Movimento[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const MOTIVO_LABEL: Record<string, string> = {
  producao:       "Produção",
  devolucao:      "Devolução",
  ajuste_entrada: "Ajuste de entrada",
  ajuste_saida:   "Ajuste de saída",
  inventario:     "Inventário",
  venda:          "Venda",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function EstoqueComercialDetalheClient({ produtoId }: { produtoId: number }) {
  const router  = useRouter();
  const [data,    setData]    = useState<DetalheData | null>(null);
  const [loading, setLoading] = useState(true);

  // Config edit
  const [editMin,    setEditMin]    = useState(0);
  const [editAtivo,  setEditAtivo]  = useState(true);
  const [savingCfg,  setSavingCfg]  = useState(false);
  const [cfgMsg,     setCfgMsg]     = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/${produtoId}?limit=100`);
      if (r.ok) {
        const d = await r.json() as DetalheData;
        setData(d);
        if (d.saldo) {
          setEditMin(d.saldo.estoque_minimo);
          setEditAtivo(d.saldo.ativo);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveConfig() {
    setSavingCfg(true); setCfgMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/config/${produtoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoque_minimo: editMin, ativo: editAtivo }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      setCfgMsg("Salvo!");
      await fetchData();
    } catch (e) {
      setCfgMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingCfg(false);
      setTimeout(() => setCfgMsg(""), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
      </div>
    );
  }

  const saldo = data?.saldo;
  const movimentos = data?.movimentos ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70 transition-opacity"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            {saldo?.nome_produto ?? `Produto #${produtoId}`}
          </h1>
          {saldo?.sku && <p className="text-sm text-gray-400 mt-0.5">{saldo.sku}</p>}
        </div>

        {/* Saldo badge */}
        {saldo && (
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Saldo</p>
            <p
              className="text-4xl font-bold"
              style={{ color: saldo.saldo === 0 ? "#9CA3AF" : "#184036" }}
            >
              {saldo.saldo}
            </p>
            {saldo.alerta !== "ok" && (
              <div className="flex items-center gap-1 mt-1 justify-center">
                <AlertTriangle size={12} style={{ color: "#DC2626" }} />
                <p className="text-xs" style={{ color: "#DC2626" }}>
                  {saldo.alerta === "zerado" ? "Zerado" : "Abaixo do mínimo"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Config */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={15} style={{ color: "#184036" }} />
          <h2 className="font-semibold text-sm" style={{ color: "#184036" }}>Configuração</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Estoque mínimo</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
              value={editMin}
              onChange={e => setEditMin(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Status</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
              value={editAtivo ? "ativo" : "inativo"}
              onChange={e => setEditAtivo(e.target.value === "ativo")}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
            onClick={saveConfig}
            disabled={savingCfg}
          >
            {savingCfg ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Salvar
          </button>
          {cfgMsg && (
            <p className="text-xs" style={{ color: cfgMsg === "Salvo!" ? "#059669" : "#DC2626" }}>
              {cfgMsg}
            </p>
          )}
        </div>
      </div>

      {/* Movimentações */}
      <div>
        <h2 className="font-semibold text-sm mb-3" style={{ color: "#184036" }}>
          Histórico de movimentações
        </h2>

        {movimentos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="space-y-2">
            {movimentos.map(m => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <div className="mt-0.5">
                  {m.tipo === "entrada"
                    ? <ArrowUpCircle size={16} style={{ color: "#059669" }} />
                    : <ArrowDownCircle size={16} style={{ color: "#DC2626" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold text-sm"
                      style={{ color: m.tipo === "entrada" ? "#059669" : "#DC2626" }}
                    >
                      {m.tipo === "entrada" ? "+" : "−"}{m.quantidade}
                    </span>
                    <span className="text-sm text-gray-600">
                      {MOTIVO_LABEL[m.motivo] ?? m.motivo}
                    </span>
                    {m.referencia_tipo === "venda_erp" && m.referencia_id && (
                      <span className="text-xs text-gray-400">
                        (venda #{m.referencia_id})
                      </span>
                    )}
                  </div>
                  {m.observacao && (
                    <p className="text-xs text-gray-400 mt-0.5">{m.observacao}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{fmtDate(m.created_at)}</p>
                  {m.criado_por && (
                    <p className="text-xs text-gray-300 mt-0.5 truncate max-w-[120px]">{m.criado_por}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
