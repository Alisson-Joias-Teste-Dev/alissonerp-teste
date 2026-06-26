"use client";

import { useState } from "react";
import { TrendingUp, DollarSign, ShoppingCart, Target, Users, CheckCircle2, X } from "lucide-react";
import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import StatCard from "@/components/dashboard-comercial/StatCard";
import ConsultoraAvatar from "@/components/dashboard-comercial/ConsultoraAvatar";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import { P, METAS_COR } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatNumber, formatPercent, safeDiv, formatDateBR } from "@/lib/dashboard-comercial/utils";
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

  /** Estado para controlar o modal de auditoria de vale-troca */
  const [showValeTrocaModal, setShowValeTrocaModal] = useState(false);

  /** Estado para controlar o modal de auditoria de faturamento */
  const [showFaturamentoModal, setShowFaturamentoModal] = useState(false);

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
              onClick={() => setShowFaturamentoModal(true)}
              trend={
                comparativo.data
                  ? {
                      value: comparativo.data.faturamento.delta_percentual,
                      label: "vs ano anterior",
                      // REGRA DE NEGOCIO: mostra a base numérica do ano anterior para
                      // evitar interpretação isolada do percentual no card de faturamento.
                      // Impacto se remover: auditoria rápida do comparativo fica prejudicada.
                      baseValueLabel: formatBRL(comparativo.data.faturamento.anterior),
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
                      // REGRA DE NEGOCIO: exibe a quantidade base do ano anterior para
                      // contextualizar a variação percentual de vendas.
                      // Impacto se remover: o usuário perde referência objetiva do comparativo.
                      baseValueLabel: formatNumber(comparativo.data.quantidade_vendas.anterior),
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
                      // REGRA DE NEGOCIO: explicita o ticket médio base do ano anterior,
                      // mantendo transparência da conta usada no comparativo.
                      // Impacto se remover: aumenta risco de leitura equivocada do indicador.
                      baseValueLabel: formatBRL(comparativo.data.ticket_medio.anterior),
                    }
                  : undefined
              }
            />
            <StatCard
              label="Vale-troca usado"
              value={formatBRL(vendas.data.visaoGeral.valor_vale_troca)}
              icon={CheckCircle2}
              color="diamante"
              subtitle="Clique para auditar"
              onClick={() => setShowValeTrocaModal(true)}
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

      {/* Modal de auditoria de vale-troca */}
      {showValeTrocaModal && vendas.data && (
        <ValeTrocaAuditoriaModal
          vendas={vendas.data.vendasBrutas.filter((v) => v.valor_vale_troca > 0).sort((a, b) => (b.data_venda ?? "").localeCompare(a.data_venda ?? ""))}
          onClose={() => setShowValeTrocaModal(false)}
        />
      )}

      {/* Modal de auditoria de faturamento */}
      {showFaturamentoModal && vendas.data && (
        <FaturamentoAuditoriaModal
          vendas={vendas.data.vendasBrutas.sort((a, b) => (b.data_venda ?? "").localeCompare(a.data_venda ?? ""))}
          onClose={() => setShowFaturamentoModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Modal de auditoria do faturamento — exibe todas as vendas do período que compõem o faturamento,
 * ordenadas por valor líquido decrescente (maiores vendas primeiro).
 * Mostra bruto, vale-troca e líquido de cada venda.
 *
 * Impacto se remover: perde-se a capacidade de auditar quais vendas compõem o faturamento da dashboard.
 */
function FaturamentoAuditoriaModal({
  vendas,
  onClose,
}: {
  vendas: Array<{
    id: number;
    data_venda: string | null;
    vendedor_nome: string | null;
    vendedor_foto: string | null;
    cliente_nome: string | null;
    total_venda: number | null;
    valor_vale_troca: number;
    valor_liquido: number;
  }>;
  onClose: () => void;
}) {
  const totalBruto = vendas.reduce((s, v) => s + (v.total_venda ?? 0), 0);
  const totalValeTroca = vendas.reduce((s, v) => s + v.valor_vale_troca, 0);
  const totalLiquido = vendas.reduce((s, v) => s + v.valor_liquido, 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40,
        }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 50, width: "min(90vw, 820px)", maxHeight: "80vh",
        background: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${P.cremeMuted}`,
          background: P.cremeSoft,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DollarSign size={18} color={P.esmeralda} />
            <span style={{ fontWeight: 700, fontSize: 15, color: P.esmeralda }}>
              Vendas do Período — {vendas.length} {vendas.length === 1 ? "venda" : "vendas"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={P.esmeraldaMid} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "0 20px 16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${P.cremeMuted}` }}>
                <th style={{ textAlign: "center", padding: "10px 4px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase", width: 32 }}>#</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Consultora</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Data</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Cliente</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Bruto</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Vale-Troca</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Líquido</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: `1px solid ${P.cremeMuted}` }}>
                  <td style={{ padding: "10px 4px", color: P.esmeraldaMid, fontSize: 12, textAlign: "center" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeralda }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ConsultoraAvatar nome={v.vendedor_nome ?? "—"} foto={v.vendedor_foto} size={24} />
                      {v.vendedor_nome ?? "—"}
                    </div>
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeraldaMid, whiteSpace: "nowrap" }}>
                    {formatDateBR(v.data_venda)}
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeralda }}>
                    {v.cliente_nome ?? "—"}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.esmeralda, fontWeight: 500 }}>
                    {formatBRL(v.total_venda ?? 0)}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.diamante, fontWeight: 600 }}>
                    {formatBRL(v.valor_vale_troca)}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.dourado, fontWeight: 600 }}>
                    {formatBRL(v.valor_liquido)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${P.esmeraldaMid}`, background: P.cremeSoft }}>
                <td style={{ padding: "10px 4px" }} />
                <td style={{ padding: "10px 6px", color: P.esmeralda, fontWeight: 700, fontSize: 13 }} colSpan={3}>
                  TOTAL — {vendas.length} {vendas.length === 1 ? "venda" : "vendas"}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.esmeralda, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalBruto)}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.diamante, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalValeTroca)}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.dourado, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalLiquido)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

/**
 * Modal de auditoria — exibe todas as vendas do período que usaram vale-troca.
 * Permite auditar: qual consultora, qual cliente, quanto foi o vale-troca e quanto foi o líquido.
 * Os dados já vêm carregados em vendasBrutas — não há chamada extra à API.
 *
 * Impacto se remover: perde-se a capacidade de auditar o uso de vale-troca na dashboard.
 */
function ValeTrocaAuditoriaModal({
  vendas,
  onClose,
}: {
  vendas: Array<{
    id: number;
    data_venda: string | null;
    vendedor_nome: string | null;
    vendedor_foto: string | null;
    cliente_nome: string | null;
    total_venda: number | null;
    valor_vale_troca: number;
    valor_liquido: number;
  }>;
  onClose: () => void;
}) {
  const totalBruto = vendas.reduce((s, v) => s + (v.total_venda ?? 0), 0);
  const totalValeTroca = vendas.reduce((s, v) => s + v.valor_vale_troca, 0);
  const totalLiquido = vendas.reduce((s, v) => s + v.valor_liquido, 0);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40,
        }}
      />
      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 50, width: "min(90vw, 820px)", maxHeight: "80vh",
        background: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${P.cremeMuted}`,
          background: P.cremeSoft,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={18} color={P.esmeralda} />
            <span style={{ fontWeight: 700, fontSize: 15, color: P.esmeralda }}>
              Vendas com Vale-Troca — {vendas.length} {vendas.length === 1 ? "venda" : "vendas"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={P.esmeraldaMid} />
          </button>
        </div>

        {/* Tabela */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px 16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${P.cremeMuted}` }}>
                <th style={{ textAlign: "center", padding: "10px 4px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase", width: 32 }}>#</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Consultora</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Data</th>
                <th style={{ textAlign: "left", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Cliente</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Total Venda</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Vale-Troca</th>
                <th style={{ textAlign: "right", padding: "10px 6px", color: P.esmeraldaMid, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Líquido</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: `1px solid ${P.cremeMuted}` }}>
                  <td style={{ padding: "10px 4px", color: P.esmeraldaMid, fontSize: 12, textAlign: "center" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeralda }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ConsultoraAvatar nome={v.vendedor_nome ?? "—"} foto={v.vendedor_foto} size={24} />
                      {v.vendedor_nome ?? "—"}
                    </div>
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeraldaMid, whiteSpace: "nowrap" }}>
                    {formatDateBR(v.data_venda)}
                  </td>
                  <td style={{ padding: "10px 6px", color: P.esmeralda }}>
                    {v.cliente_nome ?? "—"}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.esmeralda, fontWeight: 500 }}>
                    {formatBRL(v.total_venda ?? 0)}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.diamante, fontWeight: 600 }}>
                    {formatBRL(v.valor_vale_troca)}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "right", color: P.dourado, fontWeight: 600 }}>
                    {formatBRL(v.valor_liquido)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${P.esmeraldaMid}`, background: P.cremeSoft }}>
                <td style={{ padding: "10px 4px" }} />
                <td style={{ padding: "10px 6px", color: P.esmeralda, fontWeight: 700, fontSize: 13 }} colSpan={3}>
                  TOTAL — {vendas.length} {vendas.length === 1 ? "venda" : "vendas"}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.esmeralda, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalBruto)}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.diamante, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalValeTroca)}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right", color: P.dourado, fontWeight: 700, fontSize: 13 }}>
                  {formatBRL(totalLiquido)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
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
