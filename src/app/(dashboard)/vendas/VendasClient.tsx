"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, RefreshCw, Loader2, Plus, TrendingUp,
  ShoppingBag, DollarSign, ChevronRight, Trophy,
  ChevronLeft, Wallet, Receipt, FileCheck, History,
} from "lucide-react";
import EmitirNfceModal from "@/components/fiscal/EmitirNfceModal";
import LegacySaleModal from "@/components/vendas/LegacySaleModal";
import Link from "next/link";
import { useErrorStore } from "@/stores/errorStore";

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// ─── Situação config ─────────────────────────────────────────────────────────
const SITUACAO: Record<string, { label: string; bg: string; color: string }> = {
  rascunho:  { label: "Rascunho",  bg: "#F3F4F6", color: "#6B7280" },
  aprovado:  { label: "Aprovado",  bg: "#ECFDF5", color: "#059669" },
  em_rota:   { label: "Em Rota",   bg: "#FFF7ED", color: "#9A3412" },
  enviado:   { label: "Enviado",   bg: "#EFF6FF", color: "#2563EB" },
  entregue:  { label: "Entregue",  bg: "#EDE9FE", color: "#5B21B6" },
  cancelado: { label: "Cancelado", bg: "#FEF2F2", color: "#DC2626" },
  concluido: { label: "Concluído", bg: "#F0FDF4", color: "#16A34A" },
  virou_credito: { label: "Virou crédito", bg: "#FFFBEB", color: "#B45309" },
};

const TABS = [
  { key: "",          label: "Todos"     },
  { key: "rascunho",  label: "Rascunho"  },
  { key: "aprovado",  label: "Aprovado"  },
  { key: "em_rota",   label: "Em Rota"   },
  { key: "enviado",   label: "Enviado"   },
  { key: "entregue",  label: "Entregue"  },
  { key: "concluido", label: "Concluído" },
  { key: "cancelado", label: "Cancelado" },
  { key: "virou_credito", label: "Virou crédito" },
];

// ─── Roles com acesso total ──────────────────────────────────────────────────
const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];

// ─── Types ───────────────────────────────────────────────────────────────────
interface VendaERP {
  id:             number;
  numero_venda:   string;
  cliente_id:     number | null;
  cliente_nome:   string | null;
  vendedor_id:    number | null;
  vendedor_nome:  string | null;
  data_venda:     string;
  data_entrega:   string | null;
  total_produtos: number;
  total_desconto: number;
  total_frete:    number;
  total_venda:    number;
  total_comissao: number;
  situacao:           string;
  bloqueado:          boolean;
  qtd_itens:          number;
  total_pago:         number;
  nota_fiscal_id:     number | null;
  nfce_chave_44:      string | null;
  empresa_emitente_id: number | null;
  entrega_sem_pagamento_aprovada?: boolean;
  saldo_financeiro_aberto?: number;
  entregue_com_pendencia_financeira?: boolean;
}

interface Vendedor {
  id_vendedor: number;
  nome:        string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toYMDLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function ontem() { return menosNDiasLocal(1); }
function hojeLocal() { return toYMDLocal(new Date()); }
function menosNDiasLocal(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYMDLocal(d);
}
function ultimoDiaMesLocal(ano: number, mes1a12: number) {
  return toYMDLocal(new Date(ano, mes1a12, 0));
}
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  // Usa só YYYY-MM-DD para evitar conversão de fuso (coluna DATE vira T00:00:00Z no driver)
  const [year, month, day] = String(d).slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  role:        string;
  vendedorId:  number | null;
  nomeUsuario: string;
}

type Preset = "all" | "today" | "yesterday" | "7d" | "30d" | "mes" | "custom";

interface VendasPaginatedResponse {
  items: VendaERP[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function VendasClient({ role, vendedorId, nomeUsuario }: Props) {
  const router       = useRouter();
  const isFullAccess = FULL_ACCESS.includes(role);

  // Período
  const [preset, setPreset] = useState<Preset>("30d");
  const [inicio, setInicio] = useState(() => menosNDiasLocal(30));
  const [fim,    setFim]    = useState(() => hojeLocal());
  const nowDate = new Date();
  const [mesSel, setMesSel] = useState(
    `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`
  );

  // Filtros
  const [tabSituacao,   setTabSituacao]   = useState("");
  const [busca,         setBusca]         = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState<number | "">(
    isFullAccess ? "" : (vendedorId ?? "")
  );

  // Dados
  const [vendas,     setVendas]     = useState<VendaERP[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  // NFC-e modal
  const [vendaNfce, setVendaNfce] = useState<VendaERP | null>(null);
  // Legacy sale modal
  const [showLegacyModal, setShowLegacyModal] = useState(false);

  // Saldo crédito (só gerente_loja / diretor)
  const mostraSaldo = ["gerente_loja", "diretor"].includes(role);
  const [saldoCredito, setSaldoCredito] = useState<{ saldo: number; limite: number } | null>(null);
  useEffect(() => {
    if (!mostraSaldo) return;
    fetch("/api/saldo-credito")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSaldoCredito({ saldo: d.saldo_atual, limite: d.limite }); })
      .catch(() => useErrorStore.getState().push("Erro ao carregar saldo de crédito", { level: "warning" }));
  }, [mostraSaldo]);

  // Carregar vendedores (apenas acesso total)
  useEffect(() => {
    if (!isFullAccess) return;
    fetch("/api/vendedores")
      .then(r => r.json())
      .then(setVendedores)
      .catch(() => useErrorStore.getState().push("Erro ao carregar vendedores", { level: "warning" }));
  }, [isFullAccess]);

  // Fetch vendas
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;

  /**
   * REGRA DE NEGOCIO (listagem de vendas):
   * O que faz: busca vendas paginadas no backend, respeitando período, situação,
   * vendedor e texto de busca em qualquer data.
   * Por que: sem LIMIT fixo, o usuário consegue pesquisar histórico completo sem
   * travar a tela; a UI renderiza só 15 por página.
   * Impacto: se voltar para filtro/paginação local, o "Sem filtro" deixa de cobrir
   * todo o banco e a busca pode omitir vendas antigas.
   */
  const fetchVendas = useCallback(async (
    ini: string,
    fi: string,
    paginaAlvo: number,
    vId?: number | "",
    buscaTexto?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ inicio: ini, fim: fi });
      params.set("page", String(paginaAlvo));
      params.set("page_size", String(POR_PAGINA));
      if (tabSituacao) params.set("situacao", tabSituacao);
      const vid = vId !== undefined ? vId : vendedorFiltro;
      if (vid) params.set("vendedor_id", String(vid));
      const termoBusca = (buscaTexto ?? busca).trim();
      if (termoBusca) params.set("q", termoBusca);

      const res  = await fetch(`/api/vendas?${params}`);
      const body = await res.json() as VendasPaginatedResponse | { error: string };
      if (!res.ok) throw new Error((body as { error: string }).error ?? `HTTP ${res.status}`);
      const payload = body as VendasPaginatedResponse;
      setVendas(payload.items);
      setTotalRegistros(payload.total);
      setTotalPaginas(Math.max(1, payload.total_pages));
      setPagina(payload.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }, [tabSituacao, vendedorFiltro, busca]);

  // Carregar ao montar + quando filtros mudam
  useEffect(() => {
    const delay = setTimeout(() => {
      fetchVendas(inicio, fim, 1);
    }, 250);
    return () => clearTimeout(delay);
  }, [fetchVendas, inicio, fim, tabSituacao, vendedorFiltro, busca]);

  // Stats
  const stats = useMemo(() => ({
    count:     totalRegistros,
    faturado:  vendas.reduce((s, v) => s + v.total_venda,    0),
    comissao:  vendas.reduce((s, v) => s + v.total_comissao, 0),
    pago:      vendas.reduce((s, v) => s + v.total_pago,     0),
  }), [vendas, totalRegistros]);

  function applyPreset(p: Preset, mes?: string) {
    let ini = inicio, fi = fim;
    if (p === "all") { ini = "1900-01-01"; fi = "2999-12-31"; }
    if (p === "today") { ini = hojeLocal();         fi = hojeLocal(); }
    if (p === "yesterday") { ini = ontem(); fi = ontem(); }
    if (p === "7d")    { ini = menosNDiasLocal(7);  fi = hojeLocal(); }
    if (p === "30d")   { ini = menosNDiasLocal(30); fi = hojeLocal(); }
    if (p === "mes") {
      const ref = mes ?? mesSel;
      const [y, m] = ref.split("-").map(Number);
      ini = `${y}-${String(m).padStart(2, "0")}-01`;
      fi  = ultimoDiaMesLocal(y, m);
    }
    setPreset(p); setInicio(ini); setFim(fi);
    fetchVendas(ini, fi, 1);
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Vendas
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            {isFullAccess ? "Todas as vendas ERP" : `Minhas vendas — ${nomeUsuario}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFullAccess && (
            <Link
              href="/vendas/ranking"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              <Trophy size={14} />
              Ranking
            </Link>
          )}
          {(role === "admin" || role === "desenvolvedor") && (
            <button
              type="button"
              onClick={() => setShowLegacyModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 border"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              <History size={15} strokeWidth={2} />
              Venda Antiga
            </button>
          )}
          <Link
            href="/vendas/nova"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Nova Venda
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className={`grid grid-cols-2 ${mostraSaldo ? "md:grid-cols-5" : "md:grid-cols-4"} gap-3 mb-5`}>
        {[
          { icon: ShoppingBag,  label: "Vendas",    value: String(stats.count),       mono: false },
          { icon: TrendingUp,   label: "Faturado",  value: fmt(stats.faturado),        mono: true  },
          { icon: DollarSign,   label: "Comissão",  value: fmt(stats.comissao),        mono: true  },
          { icon: DollarSign,   label: "Recebido",  value: fmt(stats.pago),            mono: true  },
        ].map(({ icon: Icon, label, value, mono }) => (
          <div
            key={label}
            className="rounded-xl p-3 border"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} style={{ color: "#9CA3AF" }} />
              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "#9CA3AF" }}>
                {label}
              </span>
            </div>
            <p
              className={`text-base font-semibold ${mono ? "tabular-nums" : ""}`}
              style={{ color: C.esmeralda }}
            >
              {loading ? <span className="text-gray-300">—</span> : value}
            </p>
          </div>
        ))}
        {/* Card Saldo Crédito — só gerente_loja e diretor */}
        {mostraSaldo && saldoCredito && (() => {
          const pct = saldoCredito.limite > 0 ? saldoCredito.saldo / saldoCredito.limite : 1;
          const cor = pct > 0.2 ? "#059669" : pct > 0.05 ? "#D97706" : "#EF4444";
          return (
            <div className="rounded-xl p-3 border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet size={12} style={{ color: cor }} />
                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "#9CA3AF" }}>
                  Saldo Crédito
                </span>
              </div>
              <p className="text-base font-semibold tabular-nums" style={{ color: cor }}>
                {fmt(saldoCredito.saldo)}
              </p>
              <div className="mt-1.5 h-1 rounded-full" style={{ backgroundColor: "#E5E7EB" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: cor }} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Período ── */}
      <div
        className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        {(["all", "today", "yesterday", "7d", "30d", "mes", "custom"] as Preset[]).map(p => {
          const labels: Record<Preset, string> = {
            all: "Sem filtro",
            today: "Hoje",
            yesterday: "Ontem",
            "7d": "7 dias",
            "30d": "30 dias",
            mes: "Mês",
            custom: "Período",
          };
          return (
            <button
              key={p}
              onClick={() => (p === "custom" || p === "mes") ? setPreset(p) : applyPreset(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: preset === p ? C.esmeraldaLt : "transparent",
                border: `1px solid ${preset === p ? C.esmeralda : C.cremeBorder}`,
                color: preset === p ? C.esmeralda : "#6B7280",
              }}
            >
              {labels[p]}
            </button>
          );
        })}

        {preset === "mes" && (
          <div className="flex items-center gap-1.5">
            <input
              type="month"
              value={mesSel}
              onChange={e => {
                setMesSel(e.target.value);
                applyPreset("mes", e.target.value);
              }}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
            />
          </div>
        )}

        {preset === "custom" && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }} />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>até</span>
            <input type="date" value={fim} onChange={e => setFim(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }} />
            <button
               onClick={() => fetchVendas(inicio, fim, 1)}
              disabled={loading}
              className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >Aplicar</button>
          </div>
        )}

        <button
          onClick={() => fetchVendas(inicio, fim, pagina)}
          disabled={loading}
          className="ml-auto p-1.5 rounded-lg hover:opacity-70 disabled:opacity-40 transition-opacity"
          style={{ border: `1px solid ${C.cremeBorder}`, color: "#9CA3AF" }}
          title="Atualizar"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
        </button>
      </div>

      {/* ── Tabs situação ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTabSituacao(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: tabSituacao === t.key ? C.esmeralda : "transparent",
              color: tabSituacao === t.key ? C.creme : "#6B7280",
              border: `1px solid ${tabSituacao === t.key ? C.esmeralda : C.cremeBorder}`,
            }}
          >
            {t.label}
            {t.key !== "" && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {vendas.filter(v => v.situacao === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Busca + Vendedor ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-40 border"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <Search size={13} style={{ color: "#9CA3AF" }} />
          <input
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: "#1A1A1A" }}
            placeholder="Buscar número, cliente, vendedor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {isFullAccess && (
          <select
            className="rounded-lg px-3 py-2 text-sm outline-none border"
            style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: "#374151" }}
            value={vendedorFiltro}
              onChange={e => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                setVendedorFiltro(v);
                fetchVendas(inicio, fim, 1, v);
              }}
          >
            <option value="">Todas as vendedoras</option>
            {vendedores.map(v => (
              <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Nº Venda", "Data", "Cliente", "Vendedor", "Itens", "Total", "Recebido", "Situação", ""].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#9CA3AF" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && vendas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={16} className="animate-spin inline-block mr-2" />
                    Carregando...
                  </td>
                </tr>
              ) : vendas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center" style={{ color: "#9CA3AF" }}>
                    <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma venda no período</p>
                    {isFullAccess && (
                      <Link
                        href="/vendas/nova"
                        className="inline-flex items-center gap-1 mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}
                      >
                        <Plus size={14} /> Nova Venda
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                vendas.map((v, i) => {
                  const sit = SITUACAO[v.situacao] ?? { label: v.situacao, bg: "#F3F4F6", color: "#6B7280" };
                  const saldo = v.total_venda - v.total_pago;
                  // REGRA DE NEGOCIO: Automacao de Estoque 2.0 mostra selo
                  // especial quando a venda ja baixou estoque (`entregue`), mas
                  // ainda tem saldo financeiro aberto por excecao aprovada.
                  // IMPACTO SE REMOVIDO: pedido entregue sem quitacao fica
                  // visualmente igual ao entregue totalmente pago.
                  const sitLabel = v.entregue_com_pendencia_financeira ? "Entregue c/ pendência" : sit.label;
                  const sitStyle = v.entregue_com_pendencia_financeira
                    ? { bg: "#FEF3C7", color: "#92400E" }
                    : sit;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-stone-50 transition-colors cursor-pointer"
                      style={{ borderTop: i > 0 ? `1px solid ${C.creme}` : undefined }}
                      onClick={() => router.push(`/vendas/${v.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: C.esmeralda }}>
                        {v.numero_venda}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs tabular-nums" style={{ color: "#9CA3AF" }}>
                        {fmtDate(v.data_venda)}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]" style={{ color: "#374151" }}>
                        <p className="truncate text-xs">{v.cliente_nome ?? <span style={{ color: "#9CA3AF" }}>—</span>}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[120px]" style={{ color: "#374151" }}>
                        <p className="truncate text-xs">{v.vendedor_nome ?? <span style={{ color: "#9CA3AF" }}>—</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs tabular-nums" style={{ color: "#6B7280" }}>
                        {v.qtd_itens}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-medium whitespace-nowrap" style={{ color: "#374151" }}>
                        {fmt(v.total_venda)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">
                        <span style={{ color: v.total_pago >= v.total_venda ? "#059669" : saldo > 0 ? "#D97706" : "#9CA3AF" }}>
                          {fmt(v.total_pago)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                            style={{ backgroundColor: sitStyle.bg, color: sitStyle.color }}
                          >
                            {sitLabel}
                          </span>
                          {/* Venda aprovada com saldo em aberto (ex.: A Receber no Crediário):
                              status segue "Aprovado", a tag avisa que falta receber. */}
                          {v.situacao === "aprovado" && saldo > 0.01 && (
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                            >
                              Pagamento pendente
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {v.nota_fiscal_id ? (
                            <span title="NFC-e emitida" className="p-1 inline-flex">
                              <FileCheck size={14} className="text-emerald-600" />
                            </span>
                          ) : v.empresa_emitente_id && v.situacao !== "rascunho" ? (
                            // Emitir NFC-e escondido em rascunho: nota fiscal só pode ser emitida de venda firmada
                            <button
                              title="Emitir NFC-e"
                              onClick={e => { e.stopPropagation(); setVendaNfce(v); }}
                              className="p-1 rounded hover:bg-stone-100 transition-colors inline-flex"
                              style={{ color: "#9CA3AF" }}
                            >
                              <Receipt size={14} />
                            </button>
                          ) : null}
                          <Link
                            href={`/vendas/${v.id}`}
                            className="p-1 rounded hover:bg-gray-100 transition-colors inline-flex"
                            style={{ color: "#9CA3AF" }}
                            onClick={e => e.stopPropagation()}
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {vendas.length > 0 && (
          <div
            className="px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderTop: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
          >
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
              {totalRegistros} venda{totalRegistros !== 1 ? "s" : ""}
              {" · "}pág. {pagina} de {totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const proxima = Math.max(1, pagina - 1);
                  fetchVendas(inicio, fim, proxima);
                }}
                disabled={pagina === 1 || loading}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => {
                  const proxima = Math.min(totalPaginas, pagina + 1);
                  fetchVendas(inicio, fim, proxima);
                }}
                disabled={pagina === totalPaginas || loading}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {vendaNfce && (
        <EmitirNfceModal
          venda={vendaNfce}
          onClose={() => setVendaNfce(null)}
          onSuccess={() => { fetchVendas(inicio, fim, pagina); }}
        />
      )}

      {showLegacyModal && (
        <LegacySaleModal
          onClose={() => setShowLegacyModal(false)}
          onSuccess={(result) => {
              setShowLegacyModal(false);
              fetchVendas(inicio, fim, pagina);
            }}
          />
        )}
    </div>
  );
}
