"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, X,
  Search, Package, ShoppingCart,
} from "lucide-react";
import { formatPesoCt, formatPeso, formatMoeda, gramasToCt } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";

// ─── Color palette ──────────────────────────────────────────────────────────
const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Compra {
  id: number;
  situacao: "rascunho" | "recebida" | "concluida" | "concluido" | "pendente";
  total: number;
  bloqueado: boolean;
  obs?: string;
  local_destino_id?: number;
  numero_nf?: string;
  data_compra?: string;
  data_recebimento?: string;
  recebido_por?: string;
  created_at: string;
  fornecedor_id?: number;
  fornecedor_nome?: string;
  local_nome?: string;
  recebido_por_nome?: string;
  total_itens: number;
}

interface ItemCompra {
  id: number;
  compra_id: number;
  insumo_id: number;
  insumo_nome: string;
  categoria_id: number;
  categoria_nome: string;
  qtd: number;
  valor_unitario: number;
  valor_total: number;
  unidade?: string;
  peso_ct?: number;
  qtd_pecas?: number;
  custo_por_ct?: number;
  lote_referencia?: string;
  deposito_id?: number;
  deposito_nome?: string;
  peso_pedra_ct?: number;
}

interface Insumo {
  id: number;
  nome: string;
  categoria_id: number;
  unidade?: string;
  peso_pedra_ct?: number;
}

interface Local {
  id: number;
  nome: string;
}

interface Fornecedor {
  id: number;
  nome: string;
}

// ─── Roles ────────────────────────────────────────────────────────────────────
const ROLES_COMPRAS = ["admin", "desenvolvedor", "gerente_fabrica", "estoquista_fabrica"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── SituacaoBadge ────────────────────────────────────────────────────────────
function SituacaoBadge({
  situacao,
  bloqueado,
}: {
  situacao: string;
  bloqueado: boolean;
}) {
  if (bloqueado) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
      >
        <Lock size={9} /> Bloqueada
      </span>
    );
  }
  const map: Record<string, { bg: string; color: string; label: string }> = {
    rascunho:  { bg: "#FEF3C7", color: "#92400E", label: "Rascunho" },
    recebida:  { bg: "#DBEAFE", color: "#1D4ED8", label: "Recebida" },
    concluida: { bg: "#ECFDF5", color: "#059669", label: "Concluída" },
    // backward compat
    concluido: { bg: "#ECFDF5", color: "#059669", label: "Concluída" },
    pendente:  { bg: "#FEF3C7", color: "#92400E", label: "Pendente" },
  };
  const s = map[situacao] ?? { bg: "#F3F4F6", color: "#6B7280", label: situacao };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4 border flex flex-col gap-1"
      style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "#9CA3AF" }}
      >
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color: color ?? C.esmeralda }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────
function Timeline({ compra }: { compra: Compra }) {
  const steps = [
    { key: "rascunho", label: "Rascunho", date: compra.data_compra ?? compra.created_at },
    { key: "recebida", label: "Recebida", date: compra.data_recebimento },
    {
      key: "concluida",
      label: "Concluída",
      date: compra.bloqueado ? "Bloqueada" : null,
    },
  ];

  const currentStep =
    compra.situacao === "rascunho" || compra.situacao === "pendente"
      ? 0
      : compra.situacao === "recebida"
      ? 1
      : 2;

  // also handle legacy "concluido"
  const resolvedStep =
    compra.situacao === "concluido" ? 2 : currentStep;

  return (
    <div className="flex items-center gap-0 mb-4">
      {steps.map((step, i) => {
        const reached = i <= resolvedStep;
        const isLast = i === steps.length - 1;
        return (
          <div key={step.key} className="flex items-center">
            {/* Dot + label */}
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center border-2 text-[11px] font-bold transition-all"
                style={{
                  backgroundColor: reached ? C.esmeralda : "white",
                  borderColor: reached ? C.esmeralda : C.cremeBorder,
                  color: reached ? C.creme : "#9CA3AF",
                }}
              >
                {i + 1}
              </div>
              <span
                className="text-[10px] mt-1 whitespace-nowrap"
                style={{ color: reached ? C.esmeralda : "#9CA3AF", fontWeight: reached ? 600 : 400 }}
              >
                {step.label}
              </span>
              {step.date && (
                <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  {typeof step.date === "string" && step.date !== "Bloqueada"
                    ? fmtDate(step.date)
                    : step.date}
                </span>
              )}
            </div>
            {/* Connector */}
            {!isLast && (
              <div
                className="h-0.5 w-10 md:w-16 mx-1 mb-5 transition-all"
                style={{ backgroundColor: i < resolvedStep ? C.esmeralda : C.cremeBorder }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Modal Nova Compra ────────────────────────────────────────────────────────
function NovaCompraModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id: number) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [localId, setLocalId] = useState("1");
  const [numeroNf, setNumeroNf] = useState("");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState("");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setObs(""); setError(""); setFornecedorId(""); setNumeroNf("");
      setDataCompra(new Date().toISOString().slice(0, 10));
      return;
    }
    fetch("/api/compras/fornecedores")
      .then((r) => r.json())
      .then((data: { id_contato: number; nome: string }[]) =>
        setFornecedores((data ?? []).map((c) => ({ id: c.id_contato, nome: c.nome })))
      );
    fetch("/api/locais-estoque")
      .then((r) => r.json())
      .then((data: Local[]) => {
        setLocais(data ?? []);
        if (data?.[0]) setLocalId(String(data[0].id));
      });
  }, [isOpen]);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    const body: Record<string, unknown> = {
      local_destino_id: localId ? Number(localId) : 1,
    };
    if (fornecedorId) body.fornecedor_id = Number(fornecedorId);
    if (numeroNf.trim()) body.numero_nf = numeroNf.trim();
    if (dataCompra) body.data_compra = dataCompra;
    if (obs.trim()) body.obs = obs.trim();

    const res = await fetch("/api/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao criar compra"); return; }
    onSuccess(data.id as number);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
            Nova Compra
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Fornecedor */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Fornecedor (opcional)
            </label>
            <select
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            >
              <option value="">— Sem fornecedor —</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Local de destino */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Local de Destino
            </label>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            >
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>

          {/* NF + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B7280" }}
              >
                Número NF
              </label>
              <input
                type="text"
                value={numeroNf}
                onChange={(e) => setNumeroNf(e.target.value)}
                placeholder="Ex: 001234"
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B7280" }}
              >
                Data da Compra
              </label>
              <input
                type="date"
                value={dataCompra}
                onChange={(e) => setDataCompra(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
          </div>

          {/* Obs */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Observação
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Detalhes da compra..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: C.cremeBorder }}
        >
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Criando...</>
            ) : (
              "Criar Compra"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddItemForm ──────────────────────────────────────────────────────────────
function AddItemForm({
  compraId,
  insumos,
  onAdded,
}: {
  compraId: number;
  insumos: Insumo[];
  onAdded: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [insumoSelecionado, setInsumoSelecionado] = useState<Insumo | null>(null);
  const [pesoG, setPesoG] = useState("");
  const [qtd, setQtd] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [custoPorCt, setCustoPorCt] = useState("");
  const [qtdPecas, setQtdPecas] = useState("");
  const [loteRef, setLoteRef] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const insumosFiltrados = useMemo(() => {
    if (!busca.trim()) return insumos.slice(0, 50);
    const b = busca.toLowerCase();
    return insumos.filter((i) => i.nome.toLowerCase().includes(b)).slice(0, 50);
  }, [insumos, busca]);

  function selectInsumo(ins: Insumo) {
    setInsumoSelecionado(ins);
    setBusca(ins.nome);
    setPesoG(""); setQtd(""); setValorUnitario("");
    setCustoPorCt(""); setQtdPecas(""); setLoteRef("");
    setError("");
  }

  const catId = insumoSelecionado?.categoria_id ?? 0;
  const ehPedra = catId === 2;
  const ehMetal = [1, 3, 4].includes(catId);
  const ehBanho = catId === 5;
  const pesoCt = pesoG ? gramasToCt(parseFloat(pesoG)) : 0;

  // Preview do total
  let previewTotal = 0;
  if (ehMetal || ehBanho || (!ehPedra && !ehMetal && !ehBanho)) {
    const q = parseFloat(ehMetal ? pesoG : qtd);
    const v = parseFloat(valorUnitario);
    if (!isNaN(q) && !isNaN(v)) previewTotal = q * v;
  } else if (ehPedra) {
    const c = parseFloat(custoPorCt);
    if (!isNaN(pesoCt) && pesoCt > 0 && !isNaN(c)) previewTotal = pesoCt * c;
  }

  async function handleAdd() {
    setError("");
    if (!insumoSelecionado) { setError("Selecione um insumo"); return; }

    let body: Record<string, unknown>;

    if (ehMetal) {
      const q = parseFloat(pesoG);
      if (isNaN(q) || q <= 0) { setError("Informe o peso (g)"); return; }
      body = { insumo_id: insumoSelecionado.id, qtd: q, valor_unitario: valorUnitario ? parseFloat(valorUnitario) : null };
    } else if (ehPedra) {
      if (!pesoG || parseFloat(pesoG) <= 0) { setError("Informe o peso em gramas"); return; }
      const ptCt = gramasToCt(parseFloat(pesoG));
      body = {
        insumo_id: insumoSelecionado.id,
        peso_ct: ptCt,
        qtd_pecas: qtdPecas ? parseInt(qtdPecas) : undefined,
        custo_por_ct: custoPorCt ? parseFloat(custoPorCt) : undefined,
        lote_referencia: loteRef || undefined,
      };
    } else {
      const q = parseFloat(qtd);
      if (isNaN(q) || q <= 0) { setError("Informe a quantidade"); return; }
      body = { insumo_id: insumoSelecionado.id, qtd: q, valor_unitario: valorUnitario ? parseFloat(valorUnitario) : null };
    }

    setAdding(true);
    const res = await fetch(`/api/compras/${compraId}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setError(data.error ?? "Erro ao adicionar item"); return; }
    // Reset form
    setInsumoSelecionado(null);
    setBusca(""); setPesoG(""); setQtd(""); setValorUnitario("");
    setCustoPorCt(""); setQtdPecas(""); setLoteRef("");
    onAdded();
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
        Adicionar Item
      </p>

      {/* Busca de insumo */}
      <div className="relative">
        <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
          Insumo
        </label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setInsumoSelecionado(null); }}
            placeholder="Buscar insumo..."
            className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none bg-white"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>
        {busca && !insumoSelecionado && insumosFiltrados.length > 0 && (
          <div
            className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto"
            style={{ borderColor: C.cremeBorder }}
          >
            {insumosFiltrados.map((ins) => (
              <button
                key={ins.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                style={{ color: C.esmeralda }}
                onClick={() => selectInsumo(ins)}
              >
                {ins.nome}
                <span className="ml-2 text-[11px]" style={{ color: "#9CA3AF" }}>
                  cat.{ins.categoria_id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Campos condicionais */}
      {insumoSelecionado && (
        <>
          {ehMetal && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Peso (g)
                </label>
                <input
                  type="number" step="0.001" min="0.001"
                  value={pesoG} onChange={(e) => setPesoG(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Valor unitário (R$/g)
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            </div>
          )}

          {ehPedra && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                    Peso (g)
                  </label>
                  <input
                    type="number" step="0.0001" min="0.0001"
                    value={pesoG} onChange={(e) => setPesoG(e.target.value)}
                    placeholder="0.0000"
                    className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }}
                  />
                  {pesoG && parseFloat(pesoG) > 0 && (
                    <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
                      = {formatPesoCt(pesoCt)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                    Custo por ct (R$/ct)
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    value={custoPorCt} onChange={(e) => setCustoPorCt(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                    Qtd peças (opcional)
                  </label>
                  <input
                    type="number" step="1" min="1"
                    value={qtdPecas} onChange={(e) => setQtdPecas(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                    Lote referência
                  </label>
                  <input
                    type="text"
                    value={loteRef} onChange={(e) => setLoteRef(e.target.value)}
                    placeholder="Ex: LOTE-001"
                    className="w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
              </div>
            </div>
          )}

          {ehBanho && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Quantidade (ml)
                </label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={qtd} onChange={(e) => setQtd(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Valor unitário (R$/ml)
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            </div>
          )}

          {!ehMetal && !ehPedra && !ehBanho && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Quantidade (un)
                </label>
                <input
                  type="number" step="1" min="1"
                  value={qtd} onChange={(e) => setQtd(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>
                  Valor unitário (R$/un)
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {previewTotal > 0 && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <span>Total previsto</span>
              <span className="font-bold">{formatMoeda(previewTotal)}</span>
            </div>
          )}
        </>
      )}

      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleAdd}
          disabled={adding || !insumoSelecionado}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
          style={{ backgroundColor: "#18403612", color: C.esmeralda }}
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Adicionar Item
        </button>
      </div>
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2" style={{ color: "#111827" }}>{title}</h3>
        <p className="text-sm mb-6" style={{ color: "#6B7280" }}>{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function CompraDetalhe({
  compra,
  insumos,
  canEdit,
  onBack,
  onRefreshCompra,
}: {
  compra: Compra;
  insumos: Insumo[];
  canEdit: boolean;
  onBack: () => void;
  onRefreshCompra: () => void;
}) {
  const [itens, setItens] = useState<ItemCompra[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmConcluir, setConfirmConcluir] = useState(false);

  const bloqueada = compra.bloqueado || compra.situacao === "concluida" || compra.situacao === "concluido";

  const loadItens = useCallback(async () => {
    setLoadingItens(true);
    try {
      const data = await fetch(`/api/compras/${compra.id}/itens`).then((r) => r.json());
      setItens((data as ItemCompra[]) ?? []);
    } finally {
      setLoadingItens(false);
    }
  }, [compra.id]);

  useEffect(() => {
    loadItens();
  }, [loadItens]);

  async function handleRemoveItem(itemId: number) {
    await fetch(`/api/compras/${compra.id}/itens/${itemId}`, { method: "DELETE" });
    loadItens();
    onRefreshCompra();
  }

  async function handleReceber() {
    setError(""); setSuccess(""); setActionLoading(true);
    const res = await fetch(`/api/compras/${compra.id}/receber`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao registrar recebimento"); return; }
    setSuccess("Recebimento registrado!");
    onRefreshCompra();
  }

  async function handleConcluir() {
    setError(""); setSuccess(""); setActionLoading(true);
    setConfirmConcluir(false);
    const res = await fetch(`/api/compras/${compra.id}/concluir`, { method: "PATCH" });
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao concluir compra"); return; }
    setSuccess("Compra concluída! Estoque atualizado.");
    onRefreshCompra();
  }

  const totalCalc = itens.reduce((sum, i) => sum + Number(i.valor_total ?? 0), 0);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
        <div className="flex items-center gap-3 mb-1">
          {/* Mobile back */}
          <button
            onClick={onBack}
            className="md:hidden flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: "#6B7280" }}
          >
            <ArrowLeft size={15} />
          </button>
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Compra #{compra.id}
            {compra.fornecedor_nome ? ` — ${compra.fornecedor_nome}` : ""}
          </h3>
          <SituacaoBadge situacao={compra.situacao} bloqueado={compra.bloqueado} />
        </div>
        {compra.local_nome && (
          <p className="text-[12px]" style={{ color: "#6B7280" }}>
            Local: {compra.local_nome}
          </p>
        )}
      </div>

      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* Timeline */}
        <Timeline compra={compra} />

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={formatMoeda(totalCalc || compra.total)} color="#059669" />
          <StatCard label="Itens" value={String(compra.total_itens)} />
          <StatCard label="NF" value={compra.numero_nf || "—"} />
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
            <AlertCircle size={14} />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
            <CheckCircle2 size={14} />{success}
          </div>
        )}

        {/* Items table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Insumo", "Categoria", "Qtd/Peso", "Unid", "Vlr Unit.", "Total", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "#9CA3AF" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingItens && (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Loader2 size={18} className="animate-spin mx-auto" style={{ color: "#9CA3AF" }} />
                  </td>
                </tr>
              )}
              {!loadingItens && itens.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-sm" style={{ color: "#9CA3AF" }}>
                    Nenhum item adicionado
                  </td>
                </tr>
              )}
              {itens.map((item, i) => {
                const isPedra = item.categoria_id === 2;
                const isMetal = [1, 3, 4].includes(item.categoria_id);
                const qtdDisplay = isPedra
                  ? formatPesoCt(item.peso_ct)
                  : isMetal
                  ? `${formatPeso(item.qtd)} g`
                  : `${Number(item.qtd).toFixed(2)} ${item.unidade ?? ""}`;
                const vlrUnit = isPedra
                  ? (item.custo_por_ct != null ? formatMoeda(item.custo_por_ct) : "—")
                  : item.valor_unitario != null
                  ? formatMoeda(item.valor_unitario)
                  : "—";

                return (
                  <tr
                    key={item.id}
                    style={{ borderTop: i > 0 ? `1px solid ${C.creme}` : undefined }}
                  >
                    <td className="px-3 py-2.5 font-medium text-[13px]" style={{ color: C.esmeralda }}>
                      {item.insumo_nome}
                      {isPedra && item.qtd_pecas ? (
                        <span className="block text-[11px]" style={{ color: "#9CA3AF" }}>
                          {item.qtd_pecas} pç
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: "#6B7280" }}>
                      {item.categoria_nome}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px]">{qtdDisplay}</td>
                    <td className="px-3 py-2.5 text-[12px]" style={{ color: "#9CA3AF" }}>
                      {isPedra ? "ct" : item.unidade ?? ""}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px]" style={{ color: "#6B7280" }}>
                      {vlrUnit}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[12px]" style={{ color: "#059669" }}>
                      {item.valor_total != null ? formatMoeda(item.valor_total) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!bloqueada && canEdit && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-[11px] px-2 py-1 rounded hover:bg-red-50 transition-colors"
                          style={{ color: "#DC2626" }}
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add item form */}
        {!bloqueada && canEdit && (
          <AddItemForm
            compraId={compra.id}
            insumos={insumos}
            onAdded={() => { loadItens(); onRefreshCompra(); }}
          />
        )}

        {/* Action buttons */}
        {canEdit && (
          <div className="flex items-center gap-3 flex-wrap">
            {!bloqueada && (compra.situacao === "rascunho" || compra.situacao === "pendente") && (
              <>
                <button
                  onClick={handleReceber}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 border"
                  style={{ borderColor: "#1D4ED8", color: "#1D4ED8", backgroundColor: "#EFF6FF" }}
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                  Registrar Recebimento
                </button>
                <button
                  onClick={() => setConfirmConcluir(true)}
                  disabled={actionLoading || itens.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Concluir Direto
                </button>
              </>
            )}

            {!bloqueada && compra.situacao === "recebida" && (
              <button
                onClick={() => setConfirmConcluir(true)}
                disabled={actionLoading || itens.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Concluir Compra
              </button>
            )}

            {bloqueada && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
              >
                <Lock size={14} /> Compra bloqueada
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmConcluir}
        title="Concluir Compra"
        message={`Ao concluir, os itens serão adicionados ao estoque${compra.local_nome ? ` do local ${compra.local_nome}` : ""}. Esta ação não pode ser desfeita.`}
        onConfirm={handleConcluir}
        onCancel={() => setConfirmConcluir(false)}
        loading={actionLoading}
      />
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────
export default function ComprasClient({ compras: initialCompras }: { compras: Compra[] }) {
  const { role } = useAuth();
  const canEdit = ROLES_COMPRAS.includes(role as typeof ROLES_COMPRAS[number]);

  const [compras, setCompras] = useState<Compra[]>(initialCompras);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [showNovaCompra, setShowNovaCompra] = useState(false);

  // Filters
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"" | "rascunho" | "recebida" | "concluida">("");
  const [filtroLocal, setFiltroLocal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/pcp/insumos")
      .then((r) => r.json())
      .then((data: Insumo[]) => setInsumos(data ?? []));
    fetch("/api/locais-estoque")
      .then((r) => r.json())
      .then((data: Local[]) => setLocais(data ?? []));
  }, []);

  const reloadCompras = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroSituacao) params.set("situacao", filtroSituacao);
    if (filtroLocal) params.set("local_id", String(filtroLocal));
    const url = `/api/compras${params.toString() ? "?" + params.toString() : ""}`;
    const data = await fetch(url).then((r) => r.json());
    setCompras((data as Compra[]) ?? []);
  }, [filtroSituacao, filtroLocal]);

  // Reload when filters change
  useEffect(() => {
    reloadCompras();
  }, [reloadCompras]);

  // Stats
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const stats = useMemo(() => {
    const totalMes = compras
      .filter((c) => {
        const d = new Date(c.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, c) => sum + Number(c.total ?? 0), 0);

    const rascunho = compras.filter((c) => c.situacao === "rascunho" || c.situacao === "pendente").length;
    const recebidas = compras.filter((c) => c.situacao === "recebida").length;
    const concluidas = compras.filter((c) => c.situacao === "concluida" || c.situacao === "concluido").length;

    return { totalMes, rascunho, recebidas, concluidas };
  }, [compras, currentMonth, currentYear]);

  // Filtered list
  const filteredCompras = useMemo(() => {
    let list = compras;
    if (busca.trim()) {
      const b = busca.toLowerCase();
      list = list.filter((c) => c.fornecedor_nome?.toLowerCase().includes(b));
    }
    return list;
  }, [compras, busca]);

  const selectedCompra = selectedId != null ? compras.find((c) => c.id === selectedId) ?? null : null;

  function handleSelectCompra(compra: Compra) {
    setSelectedId(compra.id);
  }

  async function handleNovaCompraSuccess(newId: number) {
    setShowNovaCompra(false);
    await reloadCompras();
    setSelectedId(newId);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total do mês"
          value={formatMoeda(stats.totalMes)}
          color="#059669"
        />
        <StatCard
          label="Rascunho"
          value={String(stats.rascunho)}
          color="#92400E"
        />
        <StatCard
          label="Recebidas"
          value={String(stats.recebidas)}
          color="#1D4ED8"
        />
        <StatCard
          label="Concluídas"
          value={String(stats.concluidas)}
          color="#059669"
        />
      </div>

      {/* List + Detail */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left: List */}
        <div className={`${selectedId != null ? "hidden md:block" : ""} md:w-2/5`}>
          {/* List header */}
          <div
            className="rounded-t-xl border border-b-0 px-4 py-3 flex items-center justify-between gap-3"
            style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: C.esmeralda }} />
              <span className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                Compras
              </span>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#E5E7EB", color: "#6B7280" }}
              >
                {filteredCompras.length}
              </span>
            </div>
            {canEdit && (
              <button
                onClick={() => setShowNovaCompra(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                <Plus size={12} /> Nova Compra
              </button>
            )}
          </div>

          {/* Filters */}
          <div
            className="border border-b-0 px-4 py-2.5 space-y-2"
            style={{ backgroundColor: "white", borderColor: C.cremeBorder }}
          >
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5" style={{ color: "#9CA3AF" }} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar fornecedor..."
                className="w-full pl-7 pr-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* Situacao + Local */}
            <div className="flex gap-2">
              <select
                value={filtroSituacao}
                onChange={(e) => setFiltroSituacao(e.target.value as "" | "rascunho" | "recebida" | "concluida")}
                className="flex-1 px-2.5 py-1.5 rounded-lg border text-[12px] focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Todas situações</option>
                <option value="rascunho">Rascunho</option>
                <option value="recebida">Recebida</option>
                <option value="concluida">Concluída</option>
              </select>
              <select
                value={filtroLocal ?? ""}
                onChange={(e) => setFiltroLocal(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border text-[12px] focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Todos locais</option>
                {locais.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table (desktop) / Cards (mobile) */}
          <div
            className="rounded-b-xl border overflow-hidden"
            style={{ borderColor: C.cremeBorder }}
          >
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                  {["#", "Fornecedor", "Status", "Itens", "Total", "Data", "Local"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "#9CA3AF" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCompras.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-sm" style={{ color: "#9CA3AF" }}>
                      Nenhuma compra encontrada
                    </td>
                  </tr>
                )}
                {filteredCompras.map((c, i) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-amber-50"
                    style={{
                      borderTop: i > 0 ? `1px solid ${C.creme}` : undefined,
                      backgroundColor: selectedId === c.id ? "#FEF3C7" : undefined,
                    }}
                    onClick={() => handleSelectCompra(c)}
                  >
                    <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                      #{c.id}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[13px]" style={{ color: C.esmeralda }}>
                      {c.fornecedor_nome ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <SituacaoBadge situacao={c.situacao} bloqueado={c.bloqueado} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-center text-[12px]" style={{ color: "#374151" }}>
                      {c.total_itens}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[12px]" style={{ color: c.total > 0 ? "#059669" : "#9CA3AF" }}>
                      {c.total > 0 ? formatMoeda(c.total) : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                      {fmtDate(c.data_compra ?? c.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px]" style={{ color: "#6B7280" }}>
                      {c.local_nome ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y" style={{ borderColor: C.cremeBorder }}>
              {filteredCompras.length === 0 && (
                <div className="text-center py-10 text-sm" style={{ color: "#9CA3AF" }}>
                  Nenhuma compra encontrada
                </div>
              )}
              {filteredCompras.map((c) => (
                <div
                  key={c.id}
                  className="px-4 py-3 cursor-pointer hover:bg-amber-50 transition-colors"
                  style={{ backgroundColor: selectedId === c.id ? "#FEF3C7" : undefined }}
                  onClick={() => handleSelectCompra(c)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[13px]" style={{ color: C.esmeralda }}>
                      #{c.id} {c.fornecedor_nome ?? "Sem fornecedor"}
                    </span>
                    <SituacaoBadge situacao={c.situacao} bloqueado={c.bloqueado} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: "#9CA3AF" }}>
                    <span>{c.total_itens} itens</span>
                    <span>{c.total > 0 ? formatMoeda(c.total) : "—"}</span>
                    <span>{fmtDate(c.data_compra ?? c.created_at)}</span>
                    {c.local_nome && <span>{c.local_nome}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Detail */}
        {selectedId != null && selectedCompra && (
          <div className="flex-1 md:w-3/5">
            <CompraDetalhe
              compra={selectedCompra}
              insumos={insumos}
              canEdit={canEdit}
              onBack={() => setSelectedId(null)}
              onRefreshCompra={reloadCompras}
            />
          </div>
        )}

        {/* Placeholder when no selection (desktop) */}
        {selectedId == null && (
          <div
            className="hidden md:flex flex-1 md:w-3/5 rounded-xl border items-center justify-center"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, minHeight: "300px" }}
          >
            <div className="text-center space-y-2">
              <ShoppingCart size={32} style={{ color: "#E8DCC8", margin: "0 auto" }} />
              <p className="text-sm" style={{ color: "#9CA3AF" }}>
                Selecione uma compra para ver os detalhes
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Compra */}
      <NovaCompraModal
        isOpen={showNovaCompra}
        onClose={() => setShowNovaCompra(false)}
        onSuccess={handleNovaCompraSuccess}
      />
    </div>
  );
}
