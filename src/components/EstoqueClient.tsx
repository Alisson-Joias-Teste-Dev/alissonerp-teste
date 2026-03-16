"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import LancamentoAvulsoModal from "@/components/forms/LancamentoAvulsoModal";

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

type Tab = "saldos" | "movimentacoes" | "insumos";

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
  const [, startTransition] = useTransition();
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

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

  const filteredSaldos = useMemo(() => {
    return saldos.filter((s) => {
      const matchCat = filterCat === "Todos" || s.categoria_nome === filterCat;
      const q = searchSaldo.toLowerCase();
      const matchQ =
        !q ||
        s.insumo_nome?.toLowerCase().includes(q) ||
        s.deposito_nome?.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [saldos, searchSaldo, filterCat]);

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

  const tabs: { key: Tab; label: string }[] = [
    { key: "saldos",         label: "Saldos por Depósito" },
    { key: "movimentacoes",  label: `Movimentações (${movimentacoes.length})` },
    { key: "insumos",        label: `Catálogo (${insumos.length})` },
  ];

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Estoque
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Leitura de directus.controle_estoque + directus.insumos
          </p>
        </div>
        <button
          onClick={() => setModalAvulso(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={15} /> Lançamento Avulso
        </button>
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
            Pedras (un)
          </p>
          <p className="text-2xl font-mono font-semibold" style={{ color: C.esmeralda }}>
            {Math.round(totalPedrasUn).toLocaleString("pt-BR")}
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
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Buscar insumo ou depósito..."
              value={searchSaldo}
              onChange={(e) => setSearchSaldo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
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

          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: C.esmeralda }}>
                    {["Insumo", "SKU", "Categoria", "Depósito", "Entradas", "Saídas", "Saldo", "Movim."].map((h) => (
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
                      key={`${s.deposito_id}-${s.insumo_id}`}
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
                      <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: C.success }}>
                        {Number(s.total_entrada).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs" style={{ color: C.danger }}>
                        {Number(s.total_saida).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className="font-mono text-sm font-semibold"
                          style={{ color: Number(s.saldo) < 0 ? C.danger : C.dourado }}
                        >
                          {Number(s.saldo).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-center" style={{ color: "#6B7280" }}>
                        {s.total_movimentacoes}
                      </td>
                    </tr>
                  ))}
                  {filteredSaldos.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#6B7280" }}>
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
            className="border rounded-lg px-3 py-2 text-sm mb-4 outline-none"
            style={{ borderColor: C.cremeBorder, width: 320 }}
          />
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: C.esmeralda }}>
                    {["ID", "Data", "Insumo", "Marcador", "Entrada", "Saída", "Depósito", "Setor", "Ordem"].map((h) => (
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
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
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
      )}
      <LancamentoAvulsoModal
        isOpen={modalAvulso}
        onClose={() => setModalAvulso(false)}
        onSuccess={() => { setModalAvulso(false); refresh(); }}
      />
    </div>
  );
}
