"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Layers,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  DollarSign,
} from "lucide-react";

// ─── Paleta ──────────────────────────────────────────────────────────────────
const P = {
  esmeralda: "#184036",
  esmeraldaMid: "#1C3D32",
  esmeraldaLight: "#0F2922",
  sage: "#80A795",
  dourado: "#DB9864",
  creme: "#F3EADA",
  cremeMuted: "#4A7568",
  verde: "#4A9F73",
  vermelho: "#E05C5C",
  pieColors: ["#184036", "#4A9F73", "#DB9864", "#80A795", "#E05C5C", "#1C3D32", "#6EE7B7"],
};

// ─── Tooltip customizado ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32", color: P.creme }}
    >
      <p className="font-semibold mb-1" style={{ color: P.dourado }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? P.sage }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: (color ?? P.dourado) + "22" }}
        >
          <Icon size={15} strokeWidth={1.75} style={{ color: color ?? P.dourado }} />
        </div>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: color ?? P.creme }}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-1" style={{ color: P.cremeMuted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Kpis {
  ordens_em_andamento: number;
  ordens_aguardando: number;
  concluidas_mes: number;
  pcps_ativos: number;
  protocolos_pendentes: number;
  cotacao_ouro: number;
  cotacao_dolar: number;
  contas_pagar_pendentes: number;
  total_a_pagar: number;
  contas_receber_pendentes: number;
  total_a_receber: number;
}

interface ProducaoMes {
  mes_label: string;
  total_ordens: number;
  concluidas: number;
  em_andamento: number;
  aguardando: number;
}

interface OrdemTipo {
  tipo: string;
  total: number;
}

interface Ourives {
  operador: string;
  total_ordens: number;
  media_quebra: number;
  total_quebra: number;
}

interface UltimaOrdem {
  id: number;
  numero_ordem: string | null;
  situacao: string | null;
  status: string | null;
  setor_nome: string | null;
  cliente_nome: string | null;
  date_created: string | null;
}

interface Props {
  kpis: Kpis;
  producaoMensal: ProducaoMes[];
  ordensTipo: OrdemTipo[];
  ourives: Ourives[];
  ultimasOrdens: UltimaOrdem[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Status badge da ordem ───────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  "1": { label: "Aguardando", color: "#DB9864" },
  "2": { label: "Em Andamento", color: "#4A9F73" },
  "3": { label: "Concluído",   color: "#80A795" },
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DashboardClient({
  kpis,
  producaoMensal,
  ordensTipo,
  ourives,
  ultimasOrdens,
}: Props) {
  const saldoLiq = Number(kpis.total_a_receber ?? 0) - Number(kpis.total_a_pagar ?? 0);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-xl font-semibold tracking-wide"
            style={{ fontFamily: "var(--font-playfair)", color: P.creme }}
          >
            Dashboard
          </h1>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            Visão geral — Fábrica ALISSON
          </p>
        </div>
        {/* Cotações */}
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
              Ouro / g
            </p>
            <p className="text-base font-semibold tabular-nums" style={{ color: P.dourado }}>
              {fmt(Number(kpis.cotacao_ouro ?? 0))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
              Dólar
            </p>
            <p className="text-base font-semibold tabular-nums" style={{ color: P.sage }}>
              {fmt(Number(kpis.cotacao_dolar ?? 0))}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={ClipboardList}
          label="Em Andamento"
          value={kpis.ordens_em_andamento ?? 0}
          sub={`${kpis.ordens_aguardando ?? 0} aguardando`}
          color={P.verde}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Concluídas no Mês"
          value={kpis.concluidas_mes ?? 0}
          sub={`${kpis.pcps_ativos ?? 0} PCPs ativos`}
          color={P.dourado}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Protocolos Pend."
          value={kpis.protocolos_pendentes ?? 0}
          sub="aguardando conclusão"
          color={kpis.protocolos_pendentes > 10 ? P.vermelho : P.sage}
        />
        <KpiCard
          icon={TrendingUp}
          label="Saldo Financeiro"
          value={fmt(saldoLiq)}
          sub={`${kpis.contas_pagar_pendentes ?? 0} a pagar · ${kpis.contas_receber_pendentes ?? 0} a receber`}
          color={saldoLiq >= 0 ? P.verde : P.vermelho}
        />
      </div>

      {/* ── Linha 2: Gráfico área + Pizza ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Produção Mensal — Area Chart (2/3) */}
        <div
          className="lg:col-span-2 rounded-xl p-5"
          style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: P.cremeMuted }}>
            Produção Mensal — últimos 12 meses
          </p>
          {producaoMensal.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: P.cremeMuted }}>Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={producaoMensal} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={P.esmeralda} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={P.esmeralda} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradConc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={P.dourado} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={P.dourado} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C3D32" />
                <XAxis dataKey="mes_label" tick={{ fill: P.cremeMuted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: P.cremeMuted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: P.sage, paddingTop: 8 }}
                  formatter={(v) => <span style={{ color: P.sage }}>{v}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="total_ordens"
                  name="Total"
                  stroke={P.esmeralda}
                  strokeWidth={2}
                  fill="url(#gradTotal)"
                />
                <Area
                  type="monotone"
                  dataKey="concluidas"
                  name="Concluídas"
                  stroke={P.dourado}
                  strokeWidth={2}
                  fill="url(#gradConc)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Ordens por Tipo — Pie Chart (1/3) */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: P.cremeMuted }}>
            Tipos — últimos 6 meses
          </p>
          {ordensTipo.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: P.cremeMuted }}>Sem dados</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={ordensTipo}
                    dataKey="total"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    innerRadius={30}
                    strokeWidth={0}
                  >
                    {ordensTipo.map((_, i) => (
                      <Cell key={i} fill={P.pieColors[i % P.pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {ordensTipo.map((t, i) => (
                  <div key={t.tipo} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: P.pieColors[i % P.pieColors.length] }}
                      />
                      <span style={{ color: P.sage }}>{t.tipo}</span>
                    </div>
                    <span className="font-semibold tabular-nums" style={{ color: P.creme }}>
                      {t.total}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Linha 3: Ranking Ourives + Atividade Recente ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Ranking Ourives — Horizontal Bar */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: P.cremeMuted }}>
            Top Ourives — PCPs concluídos
          </p>
          {ourives.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: P.cremeMuted }}>Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={ourives.length * 44 + 20}>
              <BarChart
                data={ourives}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                barSize={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1C3D32" horizontal={false} />
                <XAxis type="number" tick={{ fill: P.cremeMuted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="operador"
                  tick={{ fill: P.sage, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tickFormatter={(v: string) => v.split(" ")[0]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total_ordens" name="Ordens" fill={P.esmeralda} radius={[0, 4, 4, 0]} />
                <Bar dataKey="media_quebra" name="Quebra %" fill={P.dourado} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Legenda manual */}
          <div className="flex gap-4 mt-3">
            {[
              { color: P.esmeralda, label: "Ordens" },
              { color: P.dourado, label: "Quebra %" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: P.sage }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Atividade Recente */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: P.cremeMuted }}>
            Atividade Recente — Ordens
          </p>
          <div className="space-y-2">
            {ultimasOrdens.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: P.cremeMuted }}>Sem ordens</p>
            ) : (
              ultimasOrdens.map((o) => {
                const st = STATUS_MAP[o.status ?? ""] ?? { label: o.status ?? "—", color: P.cremeMuted };
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                    style={{ backgroundColor: "#0c1f1a" }}
                  >
                    <div
                      className="w-1.5 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: st.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: P.creme }}>
                          {o.numero_ordem ?? `#${o.id}`}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: st.color + "22", color: st.color }}
                        >
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[10px] truncate" style={{ color: P.cremeMuted }}>
                        {o.cliente_nome ?? "—"}
                        {o.setor_nome ? ` · ${o.setor_nome}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: P.cremeMuted }}>
                      {fmtDate(o.date_created)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Mini cards financeiros ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: CreditCard,
            label: "A Pagar",
            value: fmt(Number(kpis.total_a_pagar ?? 0)),
            sub: `${kpis.contas_pagar_pendentes ?? 0} contas`,
            color: P.vermelho,
          },
          {
            icon: DollarSign,
            label: "A Receber",
            value: fmt(Number(kpis.total_a_receber ?? 0)),
            sub: `${kpis.contas_receber_pendentes ?? 0} contas`,
            color: P.verde,
          },
          {
            icon: Layers,
            label: "PCPs Ativos",
            value: kpis.pcps_ativos ?? 0,
            sub: "peças em produção",
            color: P.sage,
          },
          {
            icon: Clock,
            label: "Aguardando",
            value: kpis.ordens_aguardando ?? 0,
            sub: "ordens na fila",
            color: P.dourado,
          },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: color + "22" }}
            >
              <Icon size={16} strokeWidth={1.75} style={{ color }} />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
                {label}
              </p>
              <p className="text-sm font-semibold tabular-nums" style={{ color }}>
                {value}
              </p>
              <p className="text-[9px]" style={{ color: P.cremeMuted }}>
                {sub}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
