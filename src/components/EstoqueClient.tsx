"use client";

import { useState, useMemo, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal, ArrowLeftRight } from "lucide-react";
import LancamentoAvulsoModal from "@/components/forms/LancamentoAvulsoModal";
import TransferirLocalModal from "@/components/forms/TransferirLocalModal";
import { MobileCard } from "@/components/ui/MobileCard";
import { formatPesoCt } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import LocaisEstoqueTab from "@/components/LocaisEstoqueTab";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
  danger: "#DC2626",
  warning: "#F59E0B",
  success: "#10B981",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:      { bg: "#D1FAE5", color: "#065F46", label: "OK" },
    atencao: { bg: "#FEF3C7", color: "#92400E", label: "Atenção" },
    critico: { bg: "#FEE2E2", color: "#991B1B", label: "Crítico" },
  };
  const s = map[status] ?? map.ok;
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function MarcadorBadge({ marcador }: { marcador: string }) {
  const entradas = ["AD", "EM", "EP", "ADD", "EIMD", "EPD", "EA", "ENTRADA", "Sangria"];
  const isEntrada = entradas.includes(marcador ?? "");
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
      style={{
        backgroundColor: isEntrada ? "#D1FAE5" : "#FEE2E2",
        color: isEntrada ? "#065F46" : "#991B1B",
      }}
    >
      {marcador || "—"}
    </span>
  );
}

type Tab = "saldos" | "movimentacoes" | "insumos" | "depositos" | "locais";

interface Props {
  saldos: any[];
  insumos: any[];
  movimentacoes: any[];
  cotacaoOuro: number;
  saldoDepositos: any[];
}

export default function EstoqueClient({ saldos, insumos, movimentacoes, cotacaoOuro, saldoDepositos }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("saldos");
  const [searchSaldo, setSearchSaldo] = useState("");
  const [searchMov, setSearchMov] = useState("");
  const [filterCat, setFilterCat] = useState("Todos");
  const [modalAvulso, setModalAvulso] = useState(false);
  const [modalTransferir, setModalTransferir] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [locais, setLocais] = useState<{id: number, nome: string}[]>([]);
  const [localSelecionado, setLocalSelecionado] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  const { role } = useAuth();
  const podeTransferir = ["admin", "desenvolvedor", "gerente_fabrica"].includes(role ?? "");

  const totalOuro = useMemo(
    () => saldos.filter((s) => s.categoria_id === 1 && s.deposito_id === 1).reduce((sum, s) => sum + Number(s.saldo || 0), 0),
    [saldos]
  );

  const totalPedrasUn = useMemo(
    () => saldos.filter((s) => s.categoria_id === 2 && s.deposito_id === 1).reduce((sum, s) => sum + Number(s.saldo || 0), 0),
    [saldos]
  );

  const alertas = useMemo(
    () => insumos.filter((i) => i.status_estoque === "critico" || i.status_estoque === "atencao"),
    [insumos]
  );

  const categorias = useMemo(() => {
    const cats = [...new Set(saldos.map((s) => s.categoria_nome).filter(Boolean))];
    return ["Todos", ...cats];
  }, [saldos]);

  useEffect(() => {
    fetch("/api/locais-estoque", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLocais(data); })
      .catch(() => {});
  }, []);

  const filteredSaldos = useMemo(() => {
    return saldos.filter((s) => {
      const matchCat = filterCat === "Todos" || s.categoria_nome === filterCat;
      const q = searchSaldo.toLowerCase();
      const matchQ =
        !q ||
        s.insumo_nome?.toLowerCase().includes(q) ||
        s.deposito_nome?.toLowerCase().includes(q) ||
        s.local_estoque_nome?.toLowerCase().includes(q);
      const matchLocal = !localSelecionado || Number(s.local_estoque_id) === localSelecionado;
      return matchCat && matchQ && matchLocal;
    });
  }, [saldos, searchSaldo, filterCat, localSelecionado]);

  const filteredMov = useMemo(() => {
    if (!searchMov) return movimentacoes;
    const q = searchMov.toLowerCase();
    return movimentacoes.filter(
      (m) =>
        m.insumo_nome?.toLowerCase().includes(q) ||
        m.marcador?.toLowerCase().includes(q) ||
        m.numero_ordem?.toLowerCase().includes(q)
    );
  }, [movimentacoes, searchMov]);

  const [depositos, setDepositos] = useState<{id: number; nome: string; tipo: string; ativo: boolean}[]>([]);
  const [novoDeposito, setNovoDeposito] = useState("");
  const [tipoDeposito, setTipoDeposito] = useState<"producao" | "administrativo">("producao");
  const [savingDep, setSavingDep] = useState(false);
  const [editingDep, setEditingDep] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");

  const loadDepositos = useCallback(() => {
    fetch("/api/depositos")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setDepositos(data); })
      .catch(() => {});
  }, []);

  useEffect(() => { if (tab === "depositos") loadDepositos(); }, [tab, loadDepositos]);

  async function criarDeposito() {
    if (!novoDeposito.trim()) return;
    setSavingDep(true);
    const res = await fetch("/api/depositos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoDeposito.trim(), tipo: tipoDeposito }),
    });
    setSavingDep(false);
    if (res.ok) { setNovoDeposito(""); loadDepositos(); }
  }

  async function toggleDeposito(id: number, ativo: boolean) {
    await fetch(`/api/depositos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !ativo }),
    });
    loadDepositos();
  }

  async function renomearDeposito(id: number) {
    if (!editNome.trim()) { setEditingDep(null); return; }
    await fetch(`/api/depositos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editNome.trim() }),
    });
    setEditingDep(null);
    setEditNome("");
    loadDepositos();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "saldos",         label: "Saldos por Depósito" },
    { key: "movimentacoes",  label: `Movimentações (${movimentacoes.length})` },
    { key: "insumos",        label: `Catálogo (${insumos.length})` },
    { key: "depositos",      label: "Depósitos" },
    { key: "locais",          label: "Locais" },
  ];

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Estoque
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Leitura de directus.controle_estoque + directus.insumos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeTransferir && (
            <button
              onClick={() => setModalTransferir(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda, backgroundColor: "#fff" }}
            >
              <ArrowLeftRight size={15} /> Transferir entre Locais
            </button>
          )}
          <button
            onClick={() => setModalAvulso(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} /> Lançamento Avulso
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            Ouro Total
          </p>
          <p className="text-2xl font-mono font-semibold" style={{ color: C.dourado }}>
            {totalOuro.toFixed(2)}g
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
            ≈ R$ {(totalOuro * cotacaoOuro).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            Pedras (ct)
          </p>
          <p className="text-2xl font-mono font-semibold" style={{ color: C.esmeralda }}>
            {(() => {
              const saldosCt = saldos.filter((s) => s.categoria_id === 2 && s.deposito_id === 1);
              const totalCt = saldosCt.reduce((sum, s) => sum + Number(s.saldo_ct ?? 0), 0);
              if (totalCt > 0) return formatPesoCt(totalCt);
              return `${Math.round(totalPedrasUn).toLocaleString("pt-BR")} un`;
            })()}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>Almoxarifado Central</p>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            Insumos Cadastrados
          </p>
          <p className="text-2xl font-mono font-semibold" style={{ color: C.esmeralda }}>
            {insumos.length}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>directus.insumos</p>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
            Alertas
          </p>
          <p className="text-2xl font-mono font-semibold" style={{ color: alertas.length > 0 ? C.danger : C.success }}>
            {alertas.length}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>Abaixo do mínimo</p>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-0.5 rounded-lg p-0.5 w-fit mb-5"
        style={{ backgroundColor: C.creme }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: tab === t.key ? C.esmeralda : "transparent",
              color: tab === t.key ? C.creme : "#6B7280",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Saldos */}
      {tab === "saldos" && (
        <>
          {/* Filtros mobile */}
          <div className="flex gap-2 mb-2 md:hidden">
            <input
              type="text"
              placeholder="Buscar insumo ou depósito..."
              value={searchSaldo}
              onChange={(e) => setSearchSaldo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm flex-1 outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
            <button
              onClick={() => setFiltrosAbertos((v) => !v)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border"
              style={{
                borderColor: C.cremeBorder,
                backgroundColor: filtrosAbertos ? C.esmeralda : C.creme,
                color: filtrosAbertos ? "#F3EADA" : C.esmeralda,
              }}
            >
              <SlidersHorizontal size={14} />
              Cat.
            </button>
          </div>
          {filtrosAbertos && (
            <div className="flex flex-wrap gap-1 mb-3 md:hidden">
              {categorias.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCat(c)}
                  className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors border"
                  style={{
                    backgroundColor: filterCat === c ? C.esmeralda : "transparent",
                    borderColor: filterCat === c ? C.esmeralda : C.cremeBorder,
                    color: filterCat === c ? "#F3EADA" : "#6B7280",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Filtros desktop */}
          <div className="hidden md:flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Buscar insumo ou depósito..."
              value={searchSaldo}
              onChange={(e) => setSearchSaldo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
            {locais.length > 0 && (
              <select
                value={localSelecionado ?? ''}
                onChange={(e) => setLocalSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Todos os locais</option>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            )}
            <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: C.creme }}>
              {categorias.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCat(c)}
                  className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: filterCat === c ? C.esmeralda : "transparent",
                    color: filterCat === c ? "#F3EADA" : "#6B7280",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Lista mobile */}
          <div className="block md:hidden space-y-3 mb-3">
            {filteredSaldos.map((s) => (
              <MobileCard
                key={`${s.deposito_id}-${s.insumo_id}`}
                titulo={s.insumo_nome || "—"}
                subtitulo={s.categoria_nome || "—"}
                campos={[
                  { label: "Depósito", valor: s.deposito_nome || "—" },
                  { label: "Local", valor: s.local_estoque_nome || "—" },
                  { label: "Saldo", valor: <span style={{ color: Number(s.saldo) < 0 ? C.danger : C.dourado }} className="font-mono font-semibold">{s.categoria_id === 2 && s.saldo_ct != null ? formatPesoCt(s.saldo_ct) : Number(s.saldo).toFixed(2)}</span> },
                  ...(s.categoria_id === 2 && s.quantidade != null ? [{ label: "Qtd.", valor: <span className="font-mono">{Number(s.quantidade).toLocaleString("pt-BR")} un</span> }] : []),
                  { label: "Entradas", valor: <span style={{ color: C.success }} className="font-mono">{s.categoria_id === 2 ? formatPesoCt(Number(s.total_entrada) / 0.2) : Number(s.total_entrada).toFixed(2)}</span> },
                  { label: "Saídas", valor: <span style={{ color: C.danger }} className="font-mono">{s.categoria_id === 2 ? formatPesoCt(Number(s.total_saida) / 0.2) : Number(s.total_saida).toFixed(2)}</span> },
                ]}
              />
            ))}
            {filteredSaldos.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: "#6B7280" }}>Nenhum resultado</p>
            )}
          </div>

          {/* Tabela desktop */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: C.esmeralda }}>
                    {["Insumo", "SKU", "Categoria", "Depósito", "Local", "Entradas", "Saídas", "Saldo", "Qtd.", "Movim."].map((h) => (
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
                  {filteredSaldos.map((s, i) => (
                    <tr
                      key={`${s.deposito_id}-${s.insumo_id}-${s.local_estoque_id ?? 0}`}
                      className="border-b"
                      style={{
                        borderColor: C.creme,
                        backgroundColor: i % 2 === 0 ? "#fff" : C.bg,
                      }}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#1A1A1A" }}>
                        {s.insumo_nome || "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                        {s.insumo_sku || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {s.categoria_nome || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {s.deposito_nome || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {s.local_estoque_nome || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: C.success }}>
                        {s.categoria_id === 2 && s.saldo_ct != null
                          ? formatPesoCt(Number(s.total_entrada) / 0.2)
                          : Number(s.total_entrada).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: C.danger }}>
                        {s.categoria_id === 2 && s.saldo_ct != null
                          ? formatPesoCt(Number(s.total_saida) / 0.2)
                          : Number(s.total_saida).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className="font-mono text-sm font-semibold"
                          style={{ color: Number(s.saldo) < 0 ? C.danger : C.dourado }}
                        >
                          {s.categoria_id === 2 && s.saldo_ct != null
                            ? formatPesoCt(s.saldo_ct)
                            : `${Number(s.saldo).toFixed(2)}`}
                        </span>
                        {s.categoria_id === 2 && s.saldo_ct != null && (
                          <span className="block text-[10px] font-mono" style={{ color: "#9CA3AF" }}>
                            {Number(s.saldo).toFixed(3)}g
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-center" style={{ color: "#6B7280" }}>
                        {s.categoria_id === 2 && s.quantidade != null
                          ? <>{Number(s.quantidade).toLocaleString("pt-BR")} <span className="text-[9px]">un</span></>
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-center" style={{ color: "#6B7280" }}>
                        {s.total_movimentacoes}
                      </td>
                    </tr>
                  ))}
                  {filteredSaldos.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm" style={{ color: "#6B7280" }}>
                        Nenhum resultado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t text-[11px]" style={{ borderColor: C.creme, color: "#6B7280" }}>
              {filteredSaldos.length} registros
            </div>
          </div>
        </>
      )}

      {/* TAB: Movimentações */}
      {tab === "movimentacoes" && (
        <>
          <input
            type="text"
            placeholder="Buscar por insumo, marcador ou ordem..."
            value={searchMov}
            onChange={(e) => setSearchMov(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm mb-4 outline-none w-full md:w-80"
            style={{ borderColor: C.cremeBorder }}
          />

          {/* Lista mobile */}
          <div className="block md:hidden space-y-3 mb-3">
            {filteredMov.slice(0, 50).map((m) => (
              <MobileCard
                key={m.id}
                titulo={m.insumo_nome || "—"}
                subtitulo={m.marcador || "—"}
                campos={[
                  { label: "Data", valor: m.date_created ? new Date(m.date_created).toLocaleDateString("pt-BR") : "—" },
                  { label: "Depósito", valor: m.deposito_nome || "—" },
                  { label: "Entrada", valor: Number(m.entrada) > 0 ? <span style={{ color: C.success }} className="font-mono">{Number(m.entrada).toFixed(2)}</span> : "—" },
                  { label: "Saída", valor: Number(m.saida) > 0 ? <span style={{ color: C.danger }} className="font-mono">{Number(m.saida).toFixed(2)}</span> : "—" },
                ]}
              />
            ))}
          </div>

          {/* Tabela desktop */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: C.esmeralda }}>
                    {["ID", "Data", "Insumo", "Marcador", "Entrada", "Saída", "Depósito", "Local", "Setor", "Ordem"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: C.sage }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMov.slice(0, 50).map((m, i) => (
                    <tr
                      key={m.id}
                      className="border-b"
                      style={{
                        borderColor: C.creme,
                        backgroundColor: i % 2 === 0 ? "#fff" : C.bg,
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: "#6B7280" }}>{m.id}</td>
                      <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>
                        {m.date_created ? new Date(m.date_created).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: "#1A1A1A" }}>{m.insumo_nome || "—"}</td>
                      <td className="px-3 py-2">
                        <MarcadorBadge marcador={m.marcador} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.success }}>
                        {Number(m.entrada) > 0 ? Number(m.entrada).toFixed(2) : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.danger }}>
                        {Number(m.saida) > 0 ? Number(m.saida).toFixed(2) : ""}
                      </td>
                      <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.deposito_nome || "—"}</td>
                      <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.local_estoque_nome || "—"}</td>
                      <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.setor_nome || "—"}</td>
                      <td className="px-3 py-2 text-[11px] font-mono" style={{ color: C.esmeralda }}>
                        {m.numero_ordem || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB: Insumos */}
      {tab === "insumos" && (
        <>
          {/* Lista mobile */}
          <div className="block md:hidden space-y-3 mb-3">
            {insumos.map((ins) => (
              <MobileCard
                key={ins.id}
                titulo={ins.nome || "—"}
                subtitulo={ins.categoria || "—"}
                badges={ins.status_estoque ? [{ label: ins.status_estoque === "ok" ? "OK" : ins.status_estoque === "atencao" ? "Atenção" : "Crítico", cor: ins.status_estoque === "ok" ? "bg-green-100 text-green-700" : ins.status_estoque === "atencao" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700" }] : []}
                campos={[
                  { label: "SKU", valor: ins.sku || "—" },
                  { label: "Saldo", valor: ins.saldo != null ? <span style={{ color: C.dourado }} className="font-mono font-semibold">{Number(ins.saldo).toFixed(2)}</span> : "—" },
                  { label: "Mínimo", valor: ins.estoque_minimo || "—" },
                  { label: "Máximo", valor: ins.estoque_maximo || "—" },
                ]}
              />
            ))}
          </div>

          {/* Tabela desktop */}
        <div className="hidden md:block bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: C.esmeralda }}>
                  {["ID", "Nome", "SKU", "Categoria", "Saldo Diretus", "Mínimo", "Máximo", "Status"].map((h) => (
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
                {insumos.map((ins, i) => (
                  <tr
                    key={ins.id}
                    className="border-b"
                    style={{
                      borderColor: C.creme,
                      backgroundColor: i % 2 === 0 ? "#fff" : C.bg,
                    }}
                  >
                    <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#6B7280" }}>{ins.id}</td>
                    <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#1A1A1A" }}>{ins.nome || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#6B7280" }}>{ins.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>{ins.categoria || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold" style={{ color: C.dourado }}>
                      {ins.saldo != null ? Number(ins.saldo).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: "#6B7280" }}>
                      {ins.estoque_minimo || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: "#6B7280" }}>
                      {ins.estoque_maximo || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={ins.status_estoque} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
      {/* TAB: Depósitos */}
      {tab === "depositos" && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          {/* Formulário novo depósito */}
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 items-end" style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}>
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>
                Nome do Depósito
              </label>
              <input
                type="text"
                value={novoDeposito}
                onChange={(e) => setNovoDeposito(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") criarDeposito(); }}
                placeholder="Ex: Ourives João, Bancada 3..."
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
              />
            </div>
            <div className="w-full md:w-40">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>
                Tipo
              </label>
              <select
                value={tipoDeposito}
                onChange={(e) => setTipoDeposito(e.target.value as "producao" | "administrativo")}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
              >
                <option value="producao">Produção</option>
                <option value="administrativo">Administrativo</option>
              </select>
            </div>
            <button
              onClick={criarDeposito}
              disabled={savingDep || !novoDeposito.trim()}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 whitespace-nowrap"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {savingDep ? "Salvando..." : "+ Criar"}
            </button>
          </div>

          {/* Lista */}
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: C.esmeralda }}>
                {["ID", "Nome", "Tipo", "Status", "Ações"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sage }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depositos.map((dep, i) => (
                <tr
                  key={dep.id}
                  className="border-b"
                  style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}
                >
                  <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "#6B7280" }}>{dep.id}</td>
                  <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#1A1A1A" }}>
                    {editingDep === dep.id ? (
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renomearDeposito(dep.id); if (e.key === "Escape") setEditingDep(null); }}
                        onBlur={() => renomearDeposito(dep.id)}
                        autoFocus
                        className="px-2 py-1 rounded border text-sm focus:outline-none w-full"
                        style={{ borderColor: C.cremeBorder }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() => { setEditingDep(dep.id); setEditNome(dep.nome); }}
                      >
                        {dep.nome}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                    {dep.tipo === "producao" ? "Produção" : "Administrativo"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: dep.ativo ? "#D1FAE5" : "#FEE2E2",
                        color: dep.ativo ? "#065F46" : "#991B1B",
                      }}
                    >
                      {dep.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {dep.id !== 1 && (
                      <button
                        onClick={() => toggleDeposito(dep.id, dep.ativo)}
                        className="text-[11px] px-2 py-1 rounded transition-colors hover:bg-gray-100"
                        style={{ color: dep.ativo ? "#DC2626" : "#059669" }}
                      >
                        {dep.ativo ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {depositos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: "#6B7280" }}>
                    Nenhum depósito cadastrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t text-[11px]" style={{ borderColor: C.creme, color: "#6B7280" }}>
            {depositos.length} depósitos
          </div>
        </div>
      )}

      {/* TAB: Locais */}
      {tab === "locais" && (
        <LocaisEstoqueTab canEdit={["admin", "desenvolvedor"].includes(role ?? "")} />
      )}

      <LancamentoAvulsoModal
        isOpen={modalAvulso}
        onClose={() => setModalAvulso(false)}
        onSuccess={() => { setModalAvulso(false); refresh(); }}
      />
      <TransferirLocalModal
        isOpen={modalTransferir}
        onClose={() => setModalTransferir(false)}
        onSuccess={() => { setModalTransferir(false); refresh(); }}
        locais={locais}
      />
    </div>
  );
}
