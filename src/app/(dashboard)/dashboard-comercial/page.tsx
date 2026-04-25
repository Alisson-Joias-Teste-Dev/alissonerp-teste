"use client";

import { TrendingUp, DollarSign, ShoppingCart, Target, Users, CheckCircle2 } from "lucide-react";
import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import StatCard from "@/components/dashboard-comercial/StatCard";
import ConsultoraAvatar from "@/components/dashboard-comercial/ConsultoraAvatar";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import { P, METAS_COR } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatNumber, formatPercent, safeDiv } from "@/lib/dashboard-comercial/utils";
import {
  useDateRange,
  useVendasDashboard,
  useLeadsDashboard,
  useComparativoAnual,
} from "@/hooks/dashboard-comercial/useDashboardData";

export default function DashboardComercialPage() {
  const { from, to, setRange } = useDateRange();
  const vendas = useVendasDashboard(from, to);
  const leads = useLeadsDashboard(from, to);
  const comparativo = useComparativoAnual(from, to);

  return (
    <div className="p-6">
      <DashboardHeader
        title="Dashboard Comercial"
        subtitle="Performance de vendas, metas e leads"
        from={from}
        to={to}
        onRangeChange={setRange}
      />

      {/* Cards de Metas (Prata / Ouro / Diamante) */}
      {vendas.loading && <LoadingBlock label="Carregando métricas..." />}
      {vendas.error && <ErrorBlock error={vendas.error} />}

      {vendas.data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(["Prata", "Ouro", "Diamante"] as const).map((tipo) => {
              const meta = vendas.data!.cardsMetas[tipo];
              const alcancado = vendas.data!.visaoGeral.alcancado;
              const perc = safeDiv(alcancado, meta) * 100;
              const cor = METAS_COR[tipo];
              return (
                <div
                  key={tipo}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: cor.bg, border: `1px solid ${cor.ring}` }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: cor.fg }}
                    >
                      Meta {tipo}
                    </span>
                    <Target size={14} style={{ color: cor.ring }} />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xl font-semibold tabular-nums" style={{ color: cor.fg }}>
                      {formatBRL(meta)}
                    </span>
                    <span className="text-sm font-medium tabular-nums" style={{ color: cor.fg }}>
                      {formatPercent(perc)}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 rounded-full"
                    style={{ backgroundColor: `${cor.ring}44` }}
                  >
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, perc)}%`,
                        backgroundColor: cor.ring,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Performance geral */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Faturamento"
              value={formatBRL(vendas.data.visaoGeral.alcancado)}
              icon={DollarSign}
              subtitle={`Bruto: ${formatBRL(vendas.data.visaoGeral.alcancado_bruto)}`}
              color="esmeralda"
              trend={
                comparativo.data
                  ? {
                      value: comparativo.data.faturamento.delta_percentual,
                      label: "vs ano anterior",
                    }
                  : undefined
              }
            />
            <StatCard
              label="Qtd. Vendas"
              value={formatNumber(vendas.data.visaoGeral.quantidade_vendas)}
              icon={ShoppingCart}
              color="dourado"
              trend={
                comparativo.data
                  ? {
                      value: comparativo.data.quantidade_vendas.delta_percentual,
                      label: "vs ano anterior",
                    }
                  : undefined
              }
            />
            <StatCard
              label="Ticket Médio"
              value={formatBRL(vendas.data.visaoGeral.ticket_medio)}
              icon={TrendingUp}
              color="creme"
              trend={
                comparativo.data
                  ? {
                      value: comparativo.data.ticket_medio.delta_percentual,
                      label: "vs ano anterior",
                    }
                  : undefined
              }
            />
            <StatCard
              label="Vale-troca usado"
              value={formatBRL(vendas.data.visaoGeral.valor_vale_troca)}
              icon={CheckCircle2}
              color="diamante"
              subtitle="Desconto aplicado"
            />
          </div>

          {/* Tabela consultoras */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
          >
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: `1px solid ${P.cremeMuted}` }}
            >
              <h3
                className="text-base font-semibold"
                style={{ color: P.esmeralda, fontFamily: "var(--font-playfair)" }}
              >
                Performance por Consultora
              </h3>
              <span className="text-xs" style={{ color: P.esmeraldaMid }}>
                {vendas.data.tabelaConsultoras.length} consultoras
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: P.cremeSoft }}>
                  <tr>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>
                      Consultora
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      Alcançado
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      Qtd.
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      Ticket Médio
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      % Meta Prata
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      % Meta Ouro
                    </th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
                      % Meta Diamante
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.data.tabelaConsultoras.map((c) => (
                    <tr
                      key={c.id_vendedor}
                      className="border-t"
                      style={{ borderColor: P.cremeMuted }}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <ConsultoraAvatar nome={c.nome} foto={c.foto} size={28} />
                          <span style={{ color: P.esmeralda }}>{c.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {formatBRL(c.alcancado_periodo)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {c.quantidade_vendas}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {formatBRL(c.ticket_medio)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <PercentBadge value={c.metas.Prata.percentual_fim_periodo} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <PercentBadge value={c.metas.Ouro.percentual_fim_periodo} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <PercentBadge value={c.metas.Diamante.percentual_fim_periodo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Leads */}
      <div className="mt-6">
        <h3
          className="mb-3 text-base font-semibold"
          style={{ color: P.esmeralda, fontFamily: "var(--font-playfair)" }}
        >
          Leads
        </h3>
        {leads.loading && <LoadingBlock label="Carregando leads..." />}
        {leads.error && <ErrorBlock error={leads.error} />}
        {leads.data && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Leads"
              value={formatNumber(leads.data.geral.total_leads)}
              icon={Users}
              color="creme"
            />
            <StatCard
              label="Ganhos"
              value={formatNumber(leads.data.geral.ganhos)}
              subtitle={formatPercent(leads.data.geral.percentual_ganhos)}
              color="esmeralda"
            />
            <StatCard
              label="Perdidos"
              value={formatNumber(leads.data.geral.perdidos)}
              subtitle={formatPercent(leads.data.geral.percentual_perdidos)}
              color="prata"
            />
            <StatCard
              label="Conversão"
              value={formatPercent(leads.data.geral.taxa_conversao_geral)}
              icon={TrendingUp}
              color="dourado"
              subtitle={`${leads.data.geral.leads_fechados} fechados`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PercentBadge({ value }: { value: number }) {
  const safe = isFinite(value) ? value : 0;
  const color = safe >= 100 ? P.sucesso : safe >= 70 ? P.dourado : P.erro;
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `${color}22` }}
    >
      {formatPercent(safe)}
    </span>
  );
}
