"use client";

import { useState, useEffect } from "react";
import {
  Wrench, Clock, CheckCircle2, XCircle,
  ChevronDown, Loader2, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ServiceDetalheDrawer, { ServicoRow } from "./ServiceDetalheDrawer";
import CarregarSoldaModal from "./CarregarSoldaModal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Stats {
  em_servico: number;
  aguardando: number;
  concluidos_hoje: number;
  reprovados: number;
}

interface Operador {
  deposito_id: number;
  operador: string;
  saldo_solda: number;
}

interface ConsumoSolda {
  semana: string;
  operador: string;
  consumo_total: number;
  qtd_servicos: number;
}

interface PedraRow {
  pedra_nome: string;
  insumo_id: string;
  qtd_total: number;
  peso_total: number;
  do_estoque: number;
  do_cliente: number;
}

interface Props {
  stats: Stats;
  operadores: Operador[];
  ativos: ServicoRow[];
  historico: ServicoRow[];
  consumoSolda: ConsumoSolda[];
}

// ── Constantes visuais ────────────────────────────────────────────────────────

const C = {
  esmeralda: "#184036",
  gold:      "#D4AF37",
  bg:        "#FAFAF7",
  border:    "#E8DCC8",
};

const TIPO_LABEL: Record<string, string> = { servico_venda: "Serviço", garantia: "Garantia" };

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  aguardando: { label: "Aguardando",  color: "#92400e", bg: "#fef3c7" },
  em_servico: { label: "Em serviço",  color: "#1e40af", bg: "#dbeafe" },
  concluido:  { label: "Concluído",   color: "#065f46", bg: "#d1fae5" },
  reprovado:  { label: "Reprovado",   color: "#991b1b", bg: "#fee2e2" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function badge(status: string) {
  const s = STATUS_BADGE[status] ?? { label: status, color: "#374151", bg: "#f3f4f6" };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function tipoBadge(tipo: string) {
  const isS = tipo === "servico_venda";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap"
      style={{ backgroundColor: isS ? "#fef9c3" : "#dbeafe", color: isS ? "#713f12" : "#1e3a8a" }}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function tempoDecorrido(iso?: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h === 0) return `${m}min atrás`;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ""} atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtPeso(n?: number | null): string {
  return n != null ? `${n.toFixed(3)}g` : "—";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-4" style={{ borderColor: C.border }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ── Tab Em Serviço ────────────────────────────────────────────────────────────

function TabAtivos({ rows, operadores, onSelect }: { rows: ServicoRow[]; operadores: Operador[]; onSelect: (s: ServicoRow) => void }) {
  const [filtroOp,   setFiltroOp]   = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const filtered = rows.filter(r =>
    (filtroOp   === "todos" || String(r.operador_id) === filtroOp) &&
    (filtroTipo === "todos" || r.tipo_ordem === filtroTipo)
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select
            value={filtroOp}
            onChange={e => setFiltroOp(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 outline-none"
          >
            <option value="todos">Todos os operadores</option>
            {operadores.map(o => <option key={o.deposito_id} value={String(o.deposito_id)}>{o.operador}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {["todos", "servico_venda", "garantia"].map(t => (
          <button key={t}
            onClick={() => setFiltroTipo(t)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
            style={filtroTipo === t
              ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
              : { backgroundColor: "#fff", color: "#374151", borderColor: "#d1d5db" }}>
            {t === "todos" ? "Todos" : t === "servico_venda" ? "Serviço" : "Garantia"}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              {["Ordem", "Tipo", "Operador", "Cliente", "Peso", "Tempo", "Status"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Nenhum serviço ativo</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id}
                onClick={() => onSelect(r)}
                className="border-b last:border-0 hover:bg-amber-50/40 cursor-pointer transition-colors"
                style={{ borderColor: C.border }}>
                <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{r.numero_ordem}</td>
                <td className="px-4 py-3">{tipoBadge(r.tipo_ordem)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.operador_nome ?? <span className="text-amber-600 text-xs">Sem operador</span>}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap max-w-[140px] truncate">{r.cliente_nome ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">{fmtPeso(r.peso_entrada)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{tempoDecorrido(r.recebido_em ?? r.created_at)}</td>
                <td className="px-4 py-3">{badge(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab Histórico ─────────────────────────────────────────────────────────────

function TabHistorico({ rows, operadores, onSelect }: { rows: ServicoRow[]; operadores: Operador[]; onSelect: (s: ServicoRow) => void }) {
  const [filtroOp, setFiltroOp] = useState("todos");
  const [inicio,   setInicio]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(() => new Date().toISOString().slice(0, 10));

  const filtered = rows.filter(r => {
    if (filtroOp !== "todos" && String(r.operador_id) !== filtroOp) return false;
    if (r.concluido_em) {
      const d = r.concluido_em.slice(0, 10);
      if (d < inicio || d > fim) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 outline-none">
            <option value="todos">Todos os operadores</option>
            {operadores.map(o => <option key={o.deposito_id} value={String(o.deposito_id)}>{o.operador}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 outline-none" />
          <span className="text-xs text-gray-400">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)}
            className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 outline-none" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              {["Ordem", "Tipo", "Operador", "Entrada", "Saída", "Aditivo", "Pedras", "Tent.", "Data"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Nenhum registro no período</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id}
                onClick={() => onSelect(r)}
                className="border-b last:border-0 hover:bg-amber-50/40 cursor-pointer transition-colors"
                style={{ borderColor: C.border }}>
                <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{r.numero_ordem}</td>
                <td className="px-4 py-3">{tipoBadge(r.tipo_ordem)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.operador_nome ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtPeso(r.peso_entrada)}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{fmtPeso(r.peso_saida)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.usou_solda ? fmtPeso(r.consumo_solda) : "—"}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.colocou_pedra ? `${(r.pedras_colocadas ?? []).length} tipo(s)` : "—"}</td>
                <td className="px-4 py-3">
                  {r.tentativa > 1 ? (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#fed7aa", color: "#7c2d12" }}>
                      {r.tentativa}ª
                    </span>
                  ) : <span className="text-xs text-gray-400">1ª</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.concluido_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab Aditivo ───────────────────────────────────────────────────────────────

function TabSolda({ operadores, consumo, historico, onCarregar }: {
  operadores: Operador[];
  consumo: ConsumoSolda[];
  historico: ServicoRow[];
  onCarregar: (depositoId: number) => void;
}) {
  const MAX_SALDO = Math.max(...operadores.map(o => o.saldo_solda), 10);

  // Calcular consumo total de cada operador nos últimos 30 dias
  const consumoPorOp = operadores.reduce<Record<number, number>>((acc, op) => {
    acc[op.deposito_id] = historico
      .filter(r => r.operador_id === op.deposito_id && r.usou_solda && r.consumo_solda)
      .reduce((s, r) => s + (r.consumo_solda ?? 0), 0);
    return acc;
  }, {});

  // Preparar dados do gráfico: agrupar por semana
  const semanasMap: Record<string, Record<string, number>> = {};
  consumo.forEach(row => {
    const sem = row.semana.slice(0, 10);
    if (!semanasMap[sem]) semanasMap[sem] = {};
    semanasMap[sem][row.operador] = row.consumo_total;
  });
  const chartData = Object.entries(semanasMap).map(([semana, ops]) => {
    const label = new Date(semana).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return { semana: label, ...ops };
  });

  const COLORS = ["#184036", "#D4AF37", "#059669", "#2563eb", "#dc2626"];

  return (
    <div className="space-y-6">
      {/* Cards por operador */}
      <div className="grid gap-4 sm:grid-cols-2">
        {operadores.map((op, i) => {
          const pct = Math.min(100, (op.saldo_solda / MAX_SALDO) * 100);
          const baixo = op.saldo_solda < 1;
          return (
            <div key={op.deposito_id} className="bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: baixo ? "#fca5a5" : C.border }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{op.operador}</p>
                  <p className="text-xs text-gray-500">Saldo: <span className={`font-bold ${baixo ? "text-red-600" : "text-emerald-700"}`}>{op.saldo_solda.toFixed(3)}g</span></p>
                </div>
                {baixo && (
                  <div title="Aditivo acabando">
                    <AlertTriangle size={18} color="#dc2626" />
                  </div>
                )}
              </div>

              {/* Barra saldo */}
              <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: baixo ? "#ef4444" : "#059669" }} />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Consumo 30d: <span className="font-semibold text-gray-700">{(consumoPorOp[op.deposito_id] ?? 0).toFixed(3)}g</span>
                </p>
                <button
                  onClick={() => onCarregar(op.deposito_id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                  Carregar aditivo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico consumo por semana */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.border }}>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Consumo de aditivo por semana</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="g" width={42} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(3)}g`, ""]} />
              <Legend />
              {operadores.map((op, i) => (
                <Bar key={op.deposito_id} dataKey={op.operador} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={32} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: C.border }}>
          <p className="text-sm text-gray-400">Nenhum consumo de aditivo registrado nas últimas 12 semanas</p>
        </div>
      )}
    </div>
  );
}

// ── Tab Pedras ────────────────────────────────────────────────────────────────

function TabPedras() {
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fim,     setFim]     = useState(() => new Date().toISOString().slice(0, 10));
  const [pedras,  setPedras]  = useState<PedraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);

  async function buscar() {
    setLoading(true);
    const res = await fetch(`/api/service/pedras?inicio=${inicio}&fim=${fim}`);
    const data = await res.json() as { pedras?: PedraRow[] };
    setPedras(data.pedras ?? []);
    setBuscado(true);
    setLoading(false);
  }

  useEffect(() => { buscar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 outline-none" />
          <span className="text-xs text-gray-400">até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)}
            className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 outline-none" />
        </div>
        <button onClick={buscar} disabled={loading}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-60 flex items-center gap-1.5"
          style={{ backgroundColor: C.esmeralda }}>
          {loading && <Loader2 size={13} className="animate-spin" />}
          Buscar
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              {["Pedra", "Qtd total", "Peso total", "Do estoque", "Do cliente"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!buscado || loading ? (
              <tr><td colSpan={5} className="text-center py-8"><Loader2 size={16} className="animate-spin inline text-gray-400" /></td></tr>
            ) : pedras.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">Nenhuma pedra usada no período</td></tr>
            ) : pedras.map((p, i) => (
              <tr key={i} className="border-b last:border-0" style={{ borderColor: C.border }}>
                <td className="px-4 py-3 font-semibold text-gray-800">{p.pedra_nome ?? "—"}</td>
                <td className="px-4 py-3 text-gray-700">{p.qtd_total}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.peso_total.toFixed(3)}g</td>
                <td className="px-4 py-3 text-gray-600">{p.do_estoque}</td>
                <td className="px-4 py-3 text-gray-600">{p.do_cliente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const TABS = ["Em serviço", "Histórico", "Aditivo", "Pedras"] as const;
type Tab = typeof TABS[number];

export default function ServicePainelClient({ stats, operadores, ativos, historico, consumoSolda }: Props) {
  const [tab,           setTab]           = useState<Tab>("Em serviço");
  const [servico,       setServico]       = useState<ServicoRow | null>(null);
  const [carregarOp,    setCarregarOp]    = useState<number | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" style={{ backgroundColor: C.bg, minHeight: "100vh" }}>
      {/* Título */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.esmeralda }}>
          <Wrench size={18} color="#fff" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Painel Service</h1>
          <p className="text-xs text-gray-500">Visão gerencial do módulo de serviços</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Em serviço"      value={stats.em_servico}     color="#2563eb" icon={<Wrench size={20} />} />
        <StatCard label="Aguardando"      value={stats.aguardando}     color="#d97706" icon={<Clock size={20} />} />
        <StatCard label="Concluídos hoje" value={stats.concluidos_hoje} color="#059669" icon={<CheckCircle2 size={20} />} />
        <StatCard label="Reprovados"      value={stats.reprovados}     color="#dc2626" icon={<XCircle size={20} />} />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-gray-200 gap-1">
          {TABS.map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap"
              style={tab === t
                ? { color: C.esmeralda, borderColor: C.esmeralda }
                : { color: "#6b7280", borderColor: "transparent" }}>
              {t}
            </button>
          ))}
        </div>

        <div className="pt-5">
          {tab === "Em serviço" && <TabAtivos    rows={ativos}   operadores={operadores} onSelect={setServico} />}
          {tab === "Histórico"  && <TabHistorico rows={historico} operadores={operadores} onSelect={setServico} />}
          {tab === "Aditivo"    && (
            <TabSolda
              operadores={operadores}
              consumo={consumoSolda}
              historico={historico}
              onCarregar={id => setCarregarOp(id)}
            />
          )}
          {tab === "Pedras" && <TabPedras />}
        </div>
      </div>

      {/* Drawer detalhe */}
      {servico && (
        <ServiceDetalheDrawer servico={servico} onClose={() => setServico(null)} />
      )}

      {/* Modal carregar aditivo */}
      {carregarOp !== null && (
        <CarregarSoldaModal
          operadores={operadores}
          preSelected={carregarOp}
          onClose={() => setCarregarOp(null)}
          onSuccess={() => { setCarregarOp(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}
