"use client";

import { useState } from "react";
import { DollarSign, TrendingDown, Percent, Award } from "lucide-react";
import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import StatCard from "@/components/dashboard-comercial/StatCard";
import ConsultoraAvatar from "@/components/dashboard-comercial/ConsultoraAvatar";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import { P } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatPercent, formatDateBR } from "@/lib/dashboard-comercial/utils";
import { useDateRange, useAnaliseComissoes } from "@/hooks/dashboard-comercial/useDashboardData";

export default function AnaliseComissoesPage() {
  const { from, to, setRange } = useDateRange();
  const [view, setView] = useState<"resumo" | "detalhe">("resumo");
  const [filtroConsultora, setFiltroConsultora] = useState<number | null>(null);
  const [filtroPedido, setFiltroPedido] = useState<string>("");
  const dados = useAnaliseComissoes(from, to);

  return (
    <div className="p-6">
      <DashboardHeader
        title="Análise de Comissões"
        subtitle="Performance por consultora — comissão ganha vs perdida, desconto médio"
        from={from}
        to={to}
        onRangeChange={setRange}
      />

      {dados.loading && <LoadingBlock label="Calculando comissões..." />}
      {dados.error && <ErrorBlock error={dados.error} />}

      {dados.data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Maior comissão média"
              value={formatPercent(dados.data.ranking.maior_comissao_media_perc)}
              icon={Percent}
              color="dourado"
            />
            <StatCard
              label="Maior comissão R$"
              value={formatBRL(dados.data.ranking.maior_comissao_valor)}
              icon={DollarSign}
              color="esmeralda"
            />
            <StatCard
              label="Maior desconto médio"
              value={formatPercent(dados.data.ranking.maior_desconto_medio)}
              icon={TrendingDown}
              color="prata"
            />
            <StatCard
              label="Maior comissão perdida"
              value={formatBRL(dados.data.ranking.maior_comissao_perdida)}
              icon={Award}
              color="diamante"
            />
          </div>

          {/* Toggle resumo / detalhe */}
          <div className="mb-4 inline-flex rounded-lg p-1" style={{ backgroundColor: P.cremeSoft }}>
            {(["resumo", "detalhe"] as const).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors"
                  style={{
                    backgroundColor: active ? P.esmeralda : "transparent",
                    color: active ? P.creme : P.esmeralda,
                  }}
                >
                  {v === "resumo" ? "Resumo por consultora" : "Detalhamento por item"}
                </button>
              );
            })}
          </div>

          {view === "resumo" && (
            <div
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
            >
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: P.cremeSoft }} className="sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Consultora</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Total Desejado</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Total Realizado</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>% Desc. médio</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>% Com. média</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Comissão</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Perdida</th>
                      <th className="px-4 py-2 text-center" style={{ color: P.esmeralda }}>Na meta?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.data.resumo_consultoras.map((c) => (
                      <tr key={c.id_vendedor} className="border-t" style={{ borderColor: P.cremeMuted }}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <ConsultoraAvatar nome={c.nome} foto={c.foto} size={28} />
                            <span style={{ color: P.esmeralda }}>{c.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeraldaMid }}>
                          {formatBRL(c.total_desejado)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                          {formatBRL(c.total_realizado)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.erro }}>
                          {formatPercent(c.media_desconto)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.dourado }}>
                          {formatPercent(c.media_comissao)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {c.esta_dentro_meta ? (
                            <span style={{ color: P.sucesso }}>{formatBRL(c.comissao_ganha)}</span>
                          ) : (
                            <div>
                              <span style={{ color: P.erro }}>{formatBRL(c.comissao_fora_meta)}</span>
                              <p className="text-[10px] tabular-nums" style={{ color: P.sucesso }}>
                                {formatBRL(c.comissao_ganha)} se bater
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.erro }}>
                          {formatBRL(c.comissao_perdida)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className="inline-block rounded-md px-2 py-0.5 text-xs font-medium"
                            style={{
                              color: c.esta_dentro_meta ? P.sucesso : P.erro,
                              backgroundColor: c.esta_dentro_meta ? `${P.sucesso}22` : `${P.erro}22`,
                            }}
                          >
                            {c.esta_dentro_meta ? "Sim" : "Não"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "detalhe" && (
            <div
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
            >
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: P.cremeMuted }}>
                <span className="text-sm font-medium" style={{ color: P.esmeralda }}>Consultora:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFiltroConsultora(null)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: filtroConsultora === null ? P.esmeralda : P.cremeSoft,
                      color: filtroConsultora === null ? P.creme : P.esmeralda,
                    }}
                  >
                    Todas
                  </button>
                  {dados.data.resumo_consultoras.map((c) => (
                    <button
                      key={c.id_vendedor}
                      onClick={() => setFiltroConsultora(c.id_vendedor)}
                      className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: filtroConsultora === c.id_vendedor ? P.esmeralda : P.cremeSoft,
                        color: filtroConsultora === c.id_vendedor ? P.creme : P.esmeralda,
                      }}
                    >
                      {c.nome.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <span className="text-sm font-medium ml-2" style={{ color: P.esmeralda }}>Pedido:</span>
                <input
                  type="text"
                  value={filtroPedido}
                  onChange={(e) => setFiltroPedido(e.target.value)}
                  placeholder="Nº do pedido"
                  className="rounded-md px-3 py-1 text-xs outline-none"
                  style={{
                    backgroundColor: P.cremeSoft,
                    color: P.esmeralda,
                    border: `1px solid ${P.cremeMuted}`,
                    width: "160px",
                  }}
                />
                {filtroPedido && (
                  <button
                    onClick={() => setFiltroPedido("")}
                    className="rounded-md px-2 py-1 text-xs font-medium"
                    style={{ backgroundColor: P.cremeSoft, color: P.esmeralda }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: P.cremeSoft }} className="sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Data</th>
                      <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Pedido</th>
                      <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Consultora</th>
                      <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>SKU</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Qtd</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Cheio</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Vendido</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Desc %</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Com %</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Ganha</th>
                      <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Perdida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.data.itens_detalhados
                      .filter((i) => filtroConsultora === null || i.id_vendedor === filtroConsultora)
                      .filter((i) => !filtroPedido || String(i.numero_pedido ?? "").toLowerCase().includes(filtroPedido.toLowerCase()))
                      .slice(0, 500).map((i) => (
                      <tr key={i.id} className="border-t" style={{ borderColor: P.cremeMuted }}>
                        <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                          {formatDateBR(i.data_venda)}
                        </td>
                        <td className="px-4 py-1.5 tabular-nums" style={{ color: P.esmeralda }}>
                          {i.numero_pedido ?? "—"}
                        </td>
                        <td className="px-4 py-1.5" style={{ color: P.esmeralda }}>
                          {i.consultora}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs" style={{ color: P.esmeraldaMid }}>
                          {i.sku ?? "—"}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.esmeralda }}>
                          {i.quantidade}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.esmeraldaMid }}>
                          {formatBRL(i.preco_cheio)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.esmeralda }}>
                          {formatBRL(i.preco_vendido)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.erro }}>
                          {formatPercent(i.desconto_percentual)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.dourado }}>
                          {formatPercent(i.comissao_percentual)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.sucesso }}>
                          {formatBRL(i.comissao_ganha)}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: P.erro }}>
                          {formatBRL(i.comissao_perdida)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dados.data.itens_detalhados.length > 500 && (
                  <div
                    className="border-t px-4 py-2 text-center text-xs"
                    style={{ color: P.esmeraldaMid, borderColor: P.cremeMuted }}
                  >
                    Mostrando 500 de {dados.data.itens_detalhados.length} itens. Filtre por período menor para ver todos.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
