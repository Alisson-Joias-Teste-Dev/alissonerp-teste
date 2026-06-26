"use client";

import { DollarSign, TrendingDown, Wallet, Package } from "lucide-react";
import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import StatCard from "@/components/dashboard-comercial/StatCard";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import { P } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatDateBR } from "@/lib/dashboard-comercial/utils";
import { useDateRange, useAnaliseFrete } from "@/hooks/dashboard-comercial/useDashboardData";

export default function AnaliseFretePage() {
  const { from, to, setRange } = useDateRange();
  const frete = useAnaliseFrete(from, to);

  return (
    <div className="p-6">
      <DashboardHeader
        title="Análise de Frete"
        subtitle="Receita vs custo de logística"
        from={from}
        to={to}
        onRangeChange={setRange}
      />

      {frete.loading && <LoadingBlock label="Carregando análise de frete..." />}
      {frete.error && <ErrorBlock error={frete.error} />}

      {frete.data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Recebido dos clientes"
              value={formatBRL(frete.data.total_recebido_clientes)}
              icon={DollarSign}
              color="esmeralda"
              subtitle={`${frete.data.vendas.length} vendas`}
            />
            <StatCard
              label="Pago aos transportadores"
              value={formatBRL(frete.data.total_pago_transportadores)}
              icon={TrendingDown}
              color="dourado"
              subtitle={`${frete.data.entregas.length} entregas`}
            />
            <StatCard
              label="Saldo do período"
              value={formatBRL(frete.data.saldo)}
              icon={Wallet}
              color={frete.data.saldo >= 0 ? "esmeralda" : "prata"}
              subtitle={frete.data.saldo >= 0 ? "Lucro" : "Prejuízo"}
            />
          </div>

          {/* Vendas */}
          <div
            className="mb-6 overflow-hidden rounded-xl"
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
                Vendas do período (frete recebido)
              </h3>
              <span className="text-xs" style={{ color: P.esmeraldaMid }}>
                {frete.data.vendas.length} registros
              </span>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: P.cremeSoft }} className="sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Data</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Pedido</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Consultora</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Envio</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Total</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Frete</th>
                  </tr>
                </thead>
                <tbody>
                  {frete.data.vendas.map((v, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: P.cremeMuted }}>
                      <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                        {formatDateBR(v.data_venda)}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums" style={{ color: P.esmeralda }}>
                        {v.numero_pedido ?? "—"}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                        {v.consultora}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeraldaMid }}>
                        {v.forma_envio}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {formatBRL(v.total_venda)}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.dourado }}>
                        {formatBRL(v.frete_pago_cliente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Entregas */}
          <div
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
          >
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: `1px solid ${P.cremeMuted}` }}
            >
              <h3
                className="flex items-center gap-2 text-base font-semibold"
                style={{ color: P.esmeralda, fontFamily: "var(--font-playfair)" }}
              >
                <Package size={16} style={{ color: P.dourado }} />
                Entregas aprovadas (frete pago)
              </h3>
              <span className="text-xs" style={{ color: P.esmeraldaMid }}>
                {frete.data.entregas.length} registros
              </span>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: P.cremeSoft }} className="sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Data</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Pedido</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Solicitante</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Entregador</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Região</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Recebido</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {frete.data.entregas.map((e) => (
                    <tr key={e.id} className="border-t" style={{ borderColor: P.cremeMuted }}>
                      <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                        {formatDateBR(e.data_entrega)}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                        {e.numero_pedido_plataforma ?? "—"}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                        {e.solicitante}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeraldaMid }}>
                        {e.entregador}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: P.esmeraldaMid }}>
                        {e.regiao ?? "—"}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.sucesso }}>
                        {formatBRL(e.frete_recebido)}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.erro }}>
                        {formatBRL(e.frete_pago)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
