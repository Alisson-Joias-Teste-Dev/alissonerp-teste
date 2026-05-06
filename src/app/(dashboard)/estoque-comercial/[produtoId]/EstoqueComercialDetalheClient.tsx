"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle,
  Settings2, Loader2, Save, AlertTriangle,
  RotateCcw, ArrowRightLeft, Bookmark, X,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Consolidado {
  produto_id:     number;
  nome_produto:   string;
  sku:            string | null;
  saldo_fisico:   number;
  reservado:      number;
  disponivel:     number;
  em_transito:    number;
  estoque_minimo: number;
  ativo:          boolean;
  alerta:         string;
}

interface SaldoLocal {
  local_estoque_id: number;
  local_nome:       string;
  saldo_fisico:     number;
  reservado:        number;
  disponivel:       number;
  em_transito:      number;
}

interface Movimento {
  id:               number;
  tipo:             "entrada" | "saida";
  quantidade:       number;
  motivo:           string;
  observacao:       string | null;
  referencia_tipo:  string | null;
  referencia_id:    number | null;
  local_estoque_id: number | null;
  local_nome:       string | null;
  status:           string;
  estorno_de_id:    number | null;
  estornado_por_id: number | null;
  ordem_id:         number | null;
  protocolo_id:     number | null;
  created_at:       string;
  criado_por:       string | null;
}

interface Reserva {
  id:           number;
  quantidade:   number;
  venda_id:     number;
  numero_venda: string;
  created_at:   string;
}

interface Transferencia {
  id:                  number;
  quantidade:          number;
  status:              string;
  local_origem_nome:   string;
  local_destino_nome:  string;
  obs:                 string | null;
  created_at:          string;
  enviado_por_email:   string | null;
  recebido_por_email:  string | null;
  recebido_em:         string | null;
}

interface RfidItem {
  id:                string;
  epc:               string;
  sku:               string;
  nome:              string;
  localizacao_atual: string;
  status:            string;
  peso_g:            number | null;
  preco_venda:       number | null;
}

interface DetalheData {
  consolidado:    Consolidado | null;
  saldoPorLocal:  SaldoLocal[];
  movimentos:     Movimento[];
  reservas:       Reserva[];
  transferencias: Transferencia[];
  rfidItens:      RfidItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const MOTIVO_LABEL: Record<string, string> = {
  producao:             "Producao",
  producao_auto:        "Producao (auto)",
  devolucao:            "Devolucao",
  ajuste_entrada:       "Ajuste de entrada",
  ajuste_saida:         "Ajuste de saida",
  inventario:           "Inventario",
  venda:                "Venda",
  cancelamento:         "Cancelamento",
  estorno:              "Estorno",
  transferencia_saida:  "Transferencia (saida)",
  transferencia_entrada:"Transferencia (entrada)",
};

type TabId = "movimentos" | "reservas" | "transferencias" | "rfid";

// ─── TransferirModal ──────────────────────────────────────────────────────────
function TransferirModal({
  produtoId, onClose, onDone,
}: { produtoId: number; onClose: () => void; onDone: () => void }) {
  const [destino, setDestino] = useState(5); // default: Motoboy
  const [quantidade, setQuantidade] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleTransferir() {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/transferir-motoboy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: destino === 2 ? "receber_na_loja" : "enviar_para_motoboy",
          produto_id: produtoId,
          quantidade,
          motoboy_id: destino === 1 ? "fabrica" : undefined,
        }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Erro");
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: "#184036" }}>Transferir Produto</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Destino</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
              value={destino}
              onChange={e => setDestino(Number(e.target.value))}
            >
              <option value={5}>Motoboy [Nome] (Fabrica → Motoboy)</option>
              <option value={2}>Loja (Motoboy → Loja)</option>
              <option value={1}>Fabrica (devolver)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Quantidade</label>
            <input
              type="number" min={1}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E8DCC8" }}
              value={quantidade}
              onChange={e => setQuantidade(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
        <button
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          style={{ background: "#D97706", color: "#fff" }}
          onClick={handleTransferir}
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
          Transferir
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EstoqueComercialDetalheClient({ produtoId }: { produtoId: number }) {
  const router  = useRouter();
  const [data,    setData]    = useState<DetalheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<TabId>("movimentos");
  const [estornando, setEstornando] = useState<number | null>(null);
  const [transferindo, setTransferindo] = useState(false);

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
        if (d.consolidado) {
          setEditMin(d.consolidado.estoque_minimo);
          setEditAtivo(d.consolidado.ativo);
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

  async function handleEstorno(movId: number) {
    if (!confirm("Confirma o estorno deste movimento?")) return;
    setEstornando(movId);
    try {
      const r = await fetch(`/api/estoque-comercial/estornar/${movId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json() as { error?: string };
        alert(err.error ?? "Erro ao estornar");
      } else {
        await fetchData();
      }
    } finally {
      setEstornando(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
      </div>
    );
  }

  const c = data?.consolidado;
  const movimentos = data?.movimentos ?? [];
  const reservas = data?.reservas ?? [];
  const transferencias = data?.transferencias ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70 transition-opacity"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      {/* Hero Section */}
      <div className="rounded-2xl p-5 sm:p-6 mb-6" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
              {c?.nome_produto ?? `Produto #${produtoId}`}
            </h1>
            {c?.sku && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">{c.sku}</span>
                {c && (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{
                      background: c.alerta === "ok" ? "#D1FAE5" : c.alerta === "zerado" ? "#F3F4F6" : "#FEE2E2",
                      color: c.alerta === "ok" ? "#065F46" : c.alerta === "zerado" ? "#6B7280" : "#991B1B",
                    }}
                  >
                    {c.alerta === "ok" ? "OK" : c.alerta === "zerado" ? "Zerado" : "Critico"}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setTransferindo(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              title="Transferir este produto"
            >
              <ArrowRightLeft size={15} />
              Transferir
            </button>
            {c && (
              <div className="text-center min-w-[80px]">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Disponivel</p>
                <p
                  className="text-3xl sm:text-4xl font-bold leading-none"
                  style={{ color: c.disponivel <= 0 ? "#DC2626" : "#059669" }}
                >
                  {c.disponivel}
                </p>
                {c.reservado > 0 && (
                  <p className="text-xs mt-1 font-medium" style={{ color: "#2563EB" }}>
                    {c.reservado} reservado{c.reservado > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saldo por local */}
      {data?.saldoPorLocal && data.saldoPorLocal.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {data.saldoPorLocal.map(sl => (
            <div
              key={sl.local_estoque_id}
              className="rounded-xl p-4"
              style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
            >
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">{sl.local_nome}</p>
              <p className="text-2xl font-bold mb-2" style={{ color: "#184036" }}>{sl.disponivel}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="text-gray-500">Fisico: <strong>{sl.saldo_fisico}</strong></span>
                {sl.reservado > 0 && (
                  <span style={{ color: "#2563EB" }}>Res: <strong>{sl.reservado}</strong></span>
                )}
                {sl.em_transito > 0 && (
                  <span style={{ color: "#D97706" }}>Transito: <strong>{sl.em_transito}</strong></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Collapsible */}
      <details className="mb-6 group">
        <summary
          className="flex items-center gap-2 cursor-pointer rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          style={{ color: "#184036", border: "1px solid #E8DCC8", background: "#FAFAF7" }}
        >
          <Settings2 size={15} />
          Configuracao
          <span className="text-xs text-gray-400 ml-auto group-open:rotate-180 transition-transform">&#9660;</span>
        </summary>
        <div className="mt-3 rounded-xl p-5" style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Estoque minimo</label>
              <input
                type="number" min={0}
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
      </details>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "#E8DCC8" }}>
        {([
          { id: "movimentos" as TabId, label: "Movimentacoes", count: movimentos.length },
          { id: "reservas" as TabId, label: "Reservas", count: reservas.length },
          { id: "transferencias" as TabId, label: "Transferencias", count: transferencias.length },
          { id: "rfid" as TabId, label: "Itens RFID", count: data?.rfidItens?.length ?? 0 },
        ]).map(t => (
          <button
            key={t.id}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: tab === t.id ? "#184036" : "#9CA3AF",
              borderBottom: tab === t.id ? "2px solid #184036" : "2px solid transparent",
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label} {t.count > 0 && <span className="text-xs opacity-60">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content: Movimentacoes */}
      {tab === "movimentos" && (
        movimentos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma movimentacao registrada.</p>
        ) : (
          <div className="space-y-2">
            {movimentos.map(m => {
              const isEstornado = m.status === "estornado";
              return (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{
                    border: "1px solid #F3F4F6",
                    opacity: isEstornado ? 0.5 : 1,
                  }}
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
                        {m.tipo === "entrada" ? "+" : "-"}{m.quantidade}
                      </span>
                      <span className="text-sm text-gray-600">
                        {MOTIVO_LABEL[m.motivo] ?? m.motivo}
                      </span>
                      {m.local_nome && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          {m.local_nome}
                        </span>
                      )}
                      {isEstornado && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                          Estornado
                        </span>
                      )}
                      {m.estorno_de_id && (
                        <span className="text-xs text-gray-400">(estorno de #{m.estorno_de_id})</span>
                      )}
                    </div>
                    {m.observacao && (
                      <p className="text-xs text-gray-400 mt-0.5">{m.observacao}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="text-xs text-gray-400">{fmtDate(m.created_at)}</p>
                    {m.criado_por && (
                      <p className="text-xs text-gray-300 truncate max-w-[120px]">{m.criado_por}</p>
                    )}
                    {!isEstornado && !m.estornado_por_id && !m.estorno_de_id && (
                      <button
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        style={{ color: "#DC2626" }}
                        onClick={() => handleEstorno(m.id)}
                        disabled={estornando === m.id}
                        title="Estornar"
                      >
                        {estornando === m.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <RotateCcw size={11} />}
                        Estornar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Tab content: Reservas */}
      {tab === "reservas" && (
        reservas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma reserva ativa.</p>
        ) : (
          <div className="space-y-2">
            {reservas.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <Bookmark size={16} style={{ color: "#2563EB" }} />
                <div className="flex-1">
                  <span className="text-sm font-medium" style={{ color: "#2563EB" }}>
                    {r.quantidade} un
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    Venda {r.numero_venda}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab content: Transferencias */}
      {tab === "transferencias" && (
        transferencias.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma transferencia.</p>
        ) : (
          <div className="space-y-2">
            {transferencias.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <ArrowRightLeft size={16} style={{ color: "#D97706" }} />
                <div className="flex-1">
                  <span className="text-sm font-medium">{t.quantidade} un</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {t.local_origem_nome} &rarr; {t.local_destino_nome}
                  </span>
                  <span
                    className="text-xs ml-2 px-1.5 py-0.5 rounded"
                    style={{
                      background: t.status === "concluido" ? "#D1FAE5" : t.status === "cancelado" ? "#FEE2E2" : "#FEF3C7",
                      color: t.status === "concluido" ? "#065F46" : t.status === "cancelado" ? "#991B1B" : "#92400E",
                    }}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{fmtDate(t.created_at)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab content: Itens RFID */}
      {tab === "rfid" && (
        !data?.rfidItens || data.rfidItens.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum item RFID cadastrado para este produto.</p>
        ) : (
          <div className="space-y-2">
            {data.rfidItens.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-gray-500">{r.epc.slice(-12)}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: r.status === "ativo" ? "#D1FAE5" : r.status === "pendente_impressao" ? "#FEF3C7" : "#FEE2E2",
                        color: r.status === "ativo" ? "#065F46" : r.status === "pendente_impressao" ? "#92400E" : "#991B1B",
                      }}
                    >
                      {r.status === "ativo" ? "Disponivel" : r.status === "pendente_impressao" ? "Pendente" : "Inativo"}
                    </span>
                    <span className="text-xs text-gray-400">{r.localizacao_atual}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">ID: {r.id.slice(0, 8)}...</p>
                </div>
                <div className="text-right shrink-0">
                  {r.peso_g != null && <p className="text-xs text-gray-500">{r.peso_g}g</p>}
                  {r.preco_venda != null && <p className="text-xs text-gray-500">R$ {Number(r.preco_venda).toFixed(2)}</p>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Transferir Modal */}
      {transferindo && (
        <TransferirModal
          produtoId={produtoId}
          onClose={() => setTransferindo(false)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
