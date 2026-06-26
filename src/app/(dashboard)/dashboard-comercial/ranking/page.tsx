"use client";

import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import Podium from "@/components/dashboard-comercial/Podium";
import ConsultoraAvatar from "@/components/dashboard-comercial/ConsultoraAvatar";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import PremiacaoCard from "@/components/dashboard-comercial/PremiacaoCard";
import { P, METAS_COR } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatPercent } from "@/lib/dashboard-comercial/utils";
import { useDateRange, useRanking } from "@/hooks/dashboard-comercial/useDashboardData";

export default function RankingPage() {
  const { from, to, setRange } = useDateRange();
  const rank = useRanking(from, to);

  return (
    <div className="p-6">
      <DashboardHeader
        title="Ranking de Consultoras"
        subtitle="Classificação por faturamento líquido do período"
        from={from}
        to={to}
        onRangeChange={setRange}
      />

      {rank.loading && <LoadingBlock label="Calculando ranking..." />}
      {rank.error && <ErrorBlock error={rank.error} />}

      {rank.data && (
        <>
          <div className="mb-6">
            <Podium top3={rank.data.ranking.slice(0, 3)} />
          </div>

          <div
            className="overflow-hidden rounded-xl"
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
                Classificação completa
              </h3>
              <span className="text-xs" style={{ color: P.esmeraldaMid }}>
                {rank.data.ranking.length} consultoras
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: P.cremeSoft }}>
                  <tr>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>#</th>
                    <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>Consultora</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Faturamento líq.</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Vale-troca</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Qtd.</th>
                    <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>Ticket M.</th>
                    <th className="px-4 py-2 text-center" style={{ color: P.esmeralda }}>% Prata</th>
                    <th className="px-4 py-2 text-center" style={{ color: P.esmeralda }}>% Ouro</th>
                    <th className="px-4 py-2 text-center" style={{ color: P.esmeralda }}>% Diamante</th>
                    <th className="px-4 py-2 text-center" style={{ color: P.esmeralda }}>Medalha</th>
                  </tr>
                </thead>
                <tbody>
                  {rank.data.ranking.map((r) => (
                    <tr key={r.id_vendedor} className="border-t" style={{ borderColor: P.cremeMuted }}>
                      <td
                        className="px-4 py-2 text-center font-bold tabular-nums"
                        style={{ color: r.posicao <= 3 ? P.dourado : P.esmeraldaMid }}
                      >
                        {r.posicao}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <ConsultoraAvatar nome={r.nome} foto={r.foto} size={28} />
                          <span style={{ color: P.esmeralda }}>{r.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium" style={{ color: P.esmeralda }}>
                        {formatBRL(r.valor_liquido)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeraldaMid }}>
                        {formatBRL(r.total_vale_troca)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {r.quantidade_vendas}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                        {formatBRL(r.ticket_medio)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <MetaBadge atingiu={r.atingiu_prata} percentual={r.percentual_prata} tipo="Prata" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <MetaBadge atingiu={r.atingiu_ouro} percentual={r.percentual_ouro} tipo="Ouro" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <MetaBadge atingiu={r.atingiu_diamante} percentual={r.percentual_diamante} tipo="Diamante" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.maior_meta_atingida ? (
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                            style={{
                              backgroundColor: METAS_COR[r.maior_meta_atingida].bg,
                              color: METAS_COR[r.maior_meta_atingida].fg,
                              border: `1px solid ${METAS_COR[r.maior_meta_atingida].ring}`,
                            }}
                          >
                            {r.maior_meta_atingida}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: P.esmeraldaMid }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <PremiacaoCard />
        </>
      )}
    </div>
  );
}

function MetaBadge({
  atingiu,
  percentual,
  tipo,
}: {
  atingiu: boolean;
  percentual: number;
  tipo: "Prata" | "Ouro" | "Diamante";
}) {
  const cor = METAS_COR[tipo];
  return (
    <span
      className="inline-block rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{
        color: atingiu ? "#fff" : cor.fg,
        backgroundColor: atingiu ? cor.ring : cor.bg,
      }}
    >
      {isFinite(percentual) ? formatPercent(percentual, 0) : "—"}
    </span>
  );
}
