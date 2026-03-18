"use client";

import { useState, useMemo } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileUp,
  Landmark,
} from "lucide-react";
import { dispararWebhook } from "@/lib/webhooks";

// ─── types ───────────────────────────────────────────────────────────────────

interface ContaPagar {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
}

interface ContaReceber {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_recebimento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
}

interface Extrato {
  id: number;
  banco: string | null;
  arquivo_nome: string | null;
  processado: boolean;
  total_lancamentos: number;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
}

interface Lancamento {
  id: number;
  fitid: string | null;
  tipo: string | null;
  valor: number;
  data_transacao: string | null;
  descricao: string | null;
  memo: string | null;
  conciliado: boolean;
  extrato_id: number | null;
  banco: string | null;
}

interface Props {
  pagar: ContaPagar[];
  receber: ContaReceber[];
  extratos: Extrato[];
  lancamentos: Lancamento[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

const isVencido = (d: string | null, situacao: string) =>
  situacao === "pendente" && d && new Date(d) < new Date();

const SITUACAO: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendente:   { label: "Pendente",   color: "#DB9864", icon: Clock },
  pago:       { label: "Pago",       color: "#4A9F73", icon: CheckCircle },
  recebido:   { label: "Recebido",   color: "#4A9F73", icon: CheckCircle },
  cancelado:  { label: "Cancelado",  color: "#E05C5C", icon: AlertTriangle },
  vencido:    { label: "Vencido",    color: "#E05C5C", icon: AlertTriangle },
};

// ─── ContaRow ────────────────────────────────────────────────────────────────

function ContaRow({
  descricao,
  valor,
  vencimento,
  liquidacao,
  situacao,
  categoria,
  vencido,
}: {
  descricao: string;
  valor: number;
  vencimento: string | null;
  liquidacao: string | null;
  situacao: string;
  categoria: string | null;
  vencido: boolean;
}) {
  const st = vencido ? SITUACAO["vencido"] : (SITUACAO[situacao] ?? { label: situacao, color: "#4A7568", icon: Clock });
  const Icon = st.icon;
  return (
    <tr style={{ borderBottom: "1px solid #0F2922" }} className="hover:bg-[#0F2922]/40 transition-colors">
      <td className="px-4 py-3 max-w-[220px]">
        <p className="text-sm truncate" style={{ color: "#F3EADA" }}>{descricao}</p>
        {categoria && (
          <p className="text-[10px]" style={{ color: "#4A7568" }}>{categoria}</p>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap" style={{ color: "#DB9864" }}>
        {fmt(Number(valor))}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: vencido ? "#E05C5C" : "#80A795" }}>
        {fmtDate(vencimento)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "#4A7568" }}>
        {fmtDate(liquidacao)}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: st.color + "22", color: st.color }}
        >
          <Icon size={10} />
          {st.label}
        </span>
      </td>
    </tr>
  );
}

// ─── TabPagar ────────────────────────────────────────────────────────────────

function TabPagar({ pagar }: { pagar: ContaPagar[] }) {
  const [filtro, setFiltro] = useState("todos");

  const totalPendente = pagar
    .filter((p) => p.situacao === "pendente")
    .reduce((s, p) => s + Number(p.valor), 0);
  const totalVencido = pagar
    .filter((p) => isVencido(p.data_vencimento, p.situacao))
    .reduce((s, p) => s + Number(p.valor), 0);

  const filtradas = useMemo(() => {
    if (filtro === "vencido") return pagar.filter((p) => isVencido(p.data_vencimento, p.situacao));
    if (filtro === "todos") return pagar;
    return pagar.filter((p) => p.situacao === filtro);
  }, [pagar, filtro]);

  return (
    <div className="space-y-4">
      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Contas", value: pagar.length },
          { label: "Pendente", value: fmt(totalPendente), color: "#DB9864" },
          { label: "Vencido", value: fmt(totalVencido), color: "#E05C5C" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
            <p className="text-lg font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtro status */}
      <div className="flex gap-2 flex-wrap">
        {["todos", "pendente", "pago", "cancelado", "vencido"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className="text-[11px] px-3 py-1 rounded-full capitalize transition-colors"
            style={{
              backgroundColor: filtro === s ? "#1C3D32" : "transparent",
              border: "1px solid",
              borderColor: filtro === s ? "#4A9F73" : "#1C3D32",
              color: filtro === s ? "#F3EADA" : "#4A7568",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                {["Descrição", "Valor", "Vencimento", "Pagamento", "Situação"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "#4A7568" }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map((p) => (
                  <ContaRow
                    key={p.id}
                    descricao={p.descricao}
                    valor={p.valor}
                    vencimento={p.data_vencimento}
                    liquidacao={p.data_pagamento}
                    situacao={p.situacao}
                    categoria={p.categoria}
                    vencido={!!isVencido(p.data_vencimento, p.situacao)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── TabReceber ──────────────────────────────────────────────────────────────

function TabReceber({ receber }: { receber: ContaReceber[] }) {
  const [filtro, setFiltro] = useState("todos");

  const totalPendente = receber
    .filter((r) => r.situacao === "pendente")
    .reduce((s, r) => s + Number(r.valor), 0);
  const totalRecebido = receber
    .filter((r) => r.situacao === "recebido")
    .reduce((s, r) => s + Number(r.valor), 0);

  const filtradas = useMemo(() => {
    if (filtro === "vencido") return receber.filter((r) => isVencido(r.data_vencimento, r.situacao));
    if (filtro === "todos") return receber;
    return receber.filter((r) => r.situacao === filtro);
  }, [receber, filtro]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Contas", value: receber.length },
          { label: "A Receber", value: fmt(totalPendente), color: "#DB9864" },
          { label: "Recebido", value: fmt(totalRecebido), color: "#4A9F73" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
            <p className="text-lg font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {["todos", "pendente", "recebido", "cancelado", "vencido"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className="text-[11px] px-3 py-1 rounded-full capitalize transition-colors"
            style={{
              backgroundColor: filtro === s ? "#1C3D32" : "transparent",
              border: "1px solid",
              borderColor: filtro === s ? "#4A9F73" : "#1C3D32",
              color: filtro === s ? "#F3EADA" : "#4A7568",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                {["Descrição", "Valor", "Vencimento", "Recebimento", "Situação"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "#4A7568" }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map((r) => (
                  <ContaRow
                    key={r.id}
                    descricao={r.descricao}
                    valor={r.valor}
                    vencimento={r.data_vencimento}
                    liquidacao={r.data_recebimento}
                    situacao={r.situacao}
                    categoria={r.categoria}
                    vencido={!!isVencido(r.data_vencimento, r.situacao)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── TabConciliacao ──────────────────────────────────────────────────────────

function TabConciliacao({ extratos, lancamentos }: { extratos: Extrato[]; lancamentos: Lancamento[] }) {
  const [extratoSel, setExtratoSel] = useState<number | null>(extratos[0]?.id ?? null);
  const [reprocessando, setReprocessando] = useState<number | null>(null);

  async function handleReprocessar(extratoId: number) {
    setReprocessando(extratoId);
    await dispararWebhook("processar-ofx", { extrato_id: extratoId });
    setReprocessando(null);
  }

  const lançamentosFiltrados = useMemo(
    () => (extratoSel ? lancamentos.filter((l) => l.extrato_id === extratoSel) : lancamentos),
    [lancamentos, extratoSel]
  );

  const totalC = lançamentosFiltrados.filter((l) => l.tipo === "C").reduce((s, l) => s + Number(l.valor), 0);
  const totalD = lançamentosFiltrados.filter((l) => l.tipo === "D").reduce((s, l) => s + Number(l.valor), 0);
  const conciliados = lançamentosFiltrados.filter((l) => l.conciliado).length;

  return (
    <div className="space-y-4">
      {/* Extratos */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#4A7568" }}>
          Extratos OFX importados
        </p>
        {extratos.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ backgroundColor: "#0F2922", border: "1px dashed #1C3D32" }}
          >
            <FileUp size={24} className="mx-auto mb-2" style={{ color: "#4A7568" }} />
            <p className="text-sm" style={{ color: "#4A7568" }}>
              Nenhum extrato importado. O n8n enviará extratos OFX automaticamente.
            </p>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {extratos.map((e) => (
              <button
                key={e.id}
                onClick={() => setExtratoSel(e.id)}
                className="rounded-lg px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: extratoSel === e.id ? "#1C3D32" : "#0F2922",
                  border: `1px solid ${extratoSel === e.id ? "#4A9F73" : "#1C3D32"}`,
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Landmark size={11} style={{ color: "#80A795" }} />
                  <span className="text-xs font-medium" style={{ color: "#F3EADA" }}>
                    {e.banco ?? "Banco"} — #{e.id}
                  </span>
                  {e.processado && (
                    <CheckCircle size={10} style={{ color: "#4A9F73" }} />
                  )}
                </div>
                <p className="text-[10px]" style={{ color: "#4A7568" }}>
                  {e.total_lancamentos} lançamentos · {fmtDate(e.data_inicio)}
                  {e.data_fim ? ` – ${fmtDate(e.data_fim)}` : ""}
                </p>
                <button
                  onClick={(ev) => { ev.stopPropagation(); handleReprocessar(e.id); }}
                  disabled={reprocessando === e.id}
                  className="mt-1.5 text-[10px] flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                  style={{ color: "#80A795" }}
                >
                  <RefreshCw size={9} className={reprocessando === e.id ? "animate-spin" : ""} />
                  {reprocessando === e.id ? "Enviando..." : "Reprocessar"}
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini stats extrato selecionado */}
      {extratoSel && lançamentosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Lançamentos", value: lançamentosFiltrados.length },
            { label: "Entradas (C)", value: fmt(totalC), color: "#4A9F73" },
            { label: "Saídas (D)", value: fmt(totalD), color: "#E05C5C" },
            { label: "Conciliados", value: conciliados, color: conciliados > 0 ? "#4A9F73" : "#4A7568" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
              <p className="text-base font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabela lançamentos */}
      {lançamentosFiltrados.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                  {["Data", "Tipo", "Valor", "Descrição", "FITID", "Conciliado"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lançamentosFiltrados.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #0F2922" }} className="hover:bg-[#0F2922]/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "#80A795" }}>
                      {fmtDate(l.data_transacao)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-bold"
                        style={{
                          backgroundColor: l.tipo === "C" ? "#4A9F7322" : "#E05C5C22",
                          color: l.tipo === "C" ? "#4A9F73" : "#E05C5C",
                        }}
                      >
                        {l.tipo === "C" ? "↑ Entrada" : "↓ Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap" style={{ color: l.tipo === "C" ? "#4A9F73" : "#E05C5C" }}>
                      {fmt(Number(l.valor))}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-sm" style={{ color: "#F3EADA" }}>
                      {l.descricao ?? l.memo ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "#4A7568" }}>
                      {l.fitid ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.conciliado ? (
                        <CheckCircle size={14} style={{ color: "#4A9F73" }} className="mx-auto" />
                      ) : (
                        <RefreshCw size={12} style={{ color: "#4A7568" }} className="mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "pagar" | "receber" | "conciliacao";

export default function FinanceiroClient({ pagar, receber, extratos, lancamentos }: Props) {
  const [tab, setTab] = useState<Tab>("pagar");

  const totalPagar = pagar.filter((p) => p.situacao === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  const totalReceber = receber.filter((r) => r.situacao === "pendente").reduce((s, r) => s + Number(r.valor), 0);

  const tabs: { key: Tab; label: string; icon: React.ElementType; badge?: string }[] = [
    { key: "pagar",       label: "Contas a Pagar",   icon: ArrowUpCircle,   badge: pagar.filter((p) => p.situacao === "pendente").length > 0 ? String(pagar.filter((p) => p.situacao === "pendente").length) : undefined },
    { key: "receber",     label: "Contas a Receber", icon: ArrowDownCircle, badge: receber.filter((r) => r.situacao === "pendente").length > 0 ? String(receber.filter((r) => r.situacao === "pendente").length) : undefined },
    { key: "conciliacao", label: "Conciliação OFX",  icon: RefreshCw },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-xl font-semibold tracking-wide"
            style={{ fontFamily: "var(--font-playfair)", color: "#F3EADA" }}
          >
            Financeiro
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#80A795" }}>
            Contas a Pagar / Receber · Conciliação Bancária
          </p>
        </div>
        {/* Saldo líquido */}
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#4A7568" }}>Saldo Líquido Pendente</p>
          <p
            className="text-xl font-semibold tabular-nums"
            style={{ color: totalReceber - totalPagar >= 0 ? "#4A9F73" : "#E05C5C" }}
          >
            {fmt(totalReceber - totalPagar)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}
      >
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors"
            style={{
              backgroundColor: tab === key ? "#1C3D32" : "transparent",
              color: tab === key ? "#F3EADA" : "#4A7568",
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
            {badge && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: "#DB986422", color: "#DB9864" }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "pagar" && <TabPagar pagar={pagar} />}
      {tab === "receber" && <TabReceber receber={receber} />}
      {tab === "conciliacao" && <TabConciliacao extratos={extratos} lancamentos={lancamentos} />}
    </div>
  );
}
