"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Factory, ShoppingBag, DollarSign, Package,
  Download, Calendar, Loader2
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { formatMoeda } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoRelatorio = "producao" | "comercial" | "financeiro" | "estoque";

const TABS: { key: TipoRelatorio; label: string; icon: typeof Factory }[] = [
  { key: "producao",   label: "Produção",   icon: Factory },
  { key: "comercial",  label: "Comercial",  icon: ShoppingBag },
  { key: "financeiro", label: "Financeiro", icon: DollarSign },
  { key: "estoque",    label: "Estoque",    icon: Package },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function RelatoriosClient() {
  const [tab, setTab] = useState<TipoRelatorio>("producao");
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Record<string, unknown>>(
        `/api/relatorios?tipo=${tab}&inicio=${inicio}&fim=${fim}`
      );
      setData(res);
    } catch { setData(null); }
    setLoading(false);
  }, [tab, inicio, fim]);

  useEffect(() => { carregar(); }, [carregar]);

  const exportJSON = () => {
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${tab}_${inicio}_${fim}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <h1 className="text-xl font-bold" style={{ color: "#184036" }}>Relatórios</h1>
        <button onClick={exportJSON} disabled={!data} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: "#E8DCC8" }}>
          <Download size={14} /> Exportar
        </button>
      </div>

      {/* Filtros período */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="px-2 py-1.5 border rounded text-sm" style={{ borderColor: "#E8DCC8" }} />
          <span className="text-gray-400">a</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="px-2 py-1.5 border rounded text-sm" style={{ borderColor: "#E8DCC8" }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "#E8DCC8" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? "border-current" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
            style={tab === t.key ? { color: "#184036" } : undefined}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" size={24} style={{ color: "#184036" }} />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {tab === "producao" && <ProducaoView data={data} />}
          {tab === "comercial" && <ComercialView data={data} />}
          {tab === "financeiro" && <FinanceiroView data={data} />}
          {tab === "estoque" && <EstoqueView data={data} />}
        </div>
      ) : (
        <p className="text-center text-gray-400 py-16">Sem dados para o período</p>
      )}
    </div>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────
function StatCard({ label, valor, cor }: { label: string; valor: string | number; cor?: string }) {
  return (
    <div className="p-4 rounded-lg border" style={{ borderColor: "#E8DCC8" }}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold mt-1" style={{ color: cor || "#184036" }}>{valor}</p>
    </div>
  );
}

function ProducaoView({ data }: { data: Record<string, unknown> }) {
  const r = data.resumo as Record<string, number>;
  const ourives = (data.ourives as Array<Record<string, unknown>>) || [];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Ordens" valor={Number(r.total)} />
        <StatCard label="Em Andamento" valor={Number(r.em_andamento)} cor="#D97706" />
        <StatCard label="Concluídas" valor={Number(r.concluidas)} cor="#059669" />
        <StatCard label="Aguardando" valor={Number(r.aguardando)} cor="#6B7280" />
      </div>
      {ourives.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#184036" }}>Top Ourives</h3>
          <div className="space-y-2">
            {ourives.map((o, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded border text-sm" style={{ borderColor: "#E8DCC8" }}>
                <span>{o.nome as string}</span>
                <span className="flex gap-4">
                  <span className="text-gray-500">{String(o.pcps_concluidos)} PCPs</span>
                  <span style={{ color: Number(o.media_quebra) > 5 ? "#DC2626" : "#059669" }}>{String(o.media_quebra)}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ComercialView({ data }: { data: Record<string, unknown> }) {
  const r = data.resumo as Record<string, number>;
  const ranking = (data.ranking as Array<Record<string, unknown>>) || [];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Vendas" valor={Number(r.total_vendas)} />
        <StatCard label="Valor Total" valor={formatMoeda(Number(r.valor_total))} cor="#059669" />
        <StatCard label="Comissões" valor={formatMoeda(Number(r.total_comissao))} cor="#D97706" />
        <StatCard label="Descontos" valor={formatMoeda(Number(r.total_desconto))} cor="#DC2626" />
      </div>
      {ranking.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#184036" }}>Ranking Vendedoras</h3>
          <div className="space-y-2">
            {ranking.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded border text-sm" style={{ borderColor: "#E8DCC8" }}>
                <span>{v.vendedor as string}</span>
                <span className="flex gap-4">
                  <span className="text-gray-500">{String(v.qtd_vendas)} vendas</span>
                  <span style={{ color: "#059669" }}>{formatMoeda(Number(v.valor_total))}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FinanceiroView({ data }: { data: Record<string, unknown> }) {
  const p = data.pagar as Record<string, number>;
  const r = data.receber as Record<string, number>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "#DC2626" }}>Contas a Pagar</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Pendentes" valor={Number(p.pendentes)} />
          <StatCard label="Total Pendente" valor={formatMoeda(Number(p.total_pendente))} cor="#DC2626" />
          <StatCard label="Pagos" valor={Number(p.pagos)} cor="#059669" />
          <StatCard label="Vencidos" valor={Number(p.vencidos)} cor="#DC2626" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "#059669" }}>Contas a Receber</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Pendentes" valor={Number(r.pendentes)} />
          <StatCard label="Total Pendente" valor={formatMoeda(Number(r.total_pendente))} cor="#D97706" />
          <StatCard label="Recebidos" valor={Number(r.recebidos)} cor="#059669" />
          <StatCard label="Vencidos" valor={Number(r.vencidos)} cor="#DC2626" />
        </div>
      </div>
    </div>
  );
}

function EstoqueView({ data }: { data: Record<string, unknown> }) {
  const alertas = (data.alertas_comercial as Array<Record<string, unknown>>) || [];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Ouro no Pote (g)" valor={Number(Number(data.ouro_pote).toFixed(2))} cor="#D97706" />
        {alertas.map((a, i) => (
          <StatCard
            key={i}
            label={String(a.status_alerta)}
            valor={Number(a.qtd)}
            cor={a.status_alerta === "zerado" ? "#DC2626" : a.status_alerta === "abaixo_minimo" ? "#D97706" : "#059669"}
          />
        ))}
      </div>
    </>
  );
}
