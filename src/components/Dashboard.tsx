"use client";

interface Stats {
  totalOrdens: number;
  protocolosPendentes: number;
  cotacaoOuro: number;
  cotacaoDolar: number;
}

interface DashboardProps {
  stats: Stats;
  depositos: any[];
  ultimasOrdens: any[];
  vendedores: any[];
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow"
      style={{ borderColor: "#E8DCC8" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: "#6B7280" }}>
        {label}
      </p>
      <p className="text-2xl font-mono font-semibold tracking-tight"
        style={{ color: accent ? "#DB9864" : "#184036" }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function SituacaoBadge({ situacao }: { situacao: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    criado:     { bg: "#F3EADA", color: "#184036", label: "Criado" },
    cancelado:  { bg: "#FEE2E2", color: "#DC2626", label: "Cancelado" },
    rascunho:   { bg: "#F3F4F6", color: "#6B7280", label: "Rascunho" },
  };
  const s = map[situacao] ?? map["criado"];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

export default function Dashboard({ stats, depositos, ultimasOrdens, vendedores }: DashboardProps) {
  return (
    <div>
      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Título */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}>
            Dashboard
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Dados em tempo real — alissonerp + directus + public
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total de Ordens"
            value={stats.totalOrdens.toLocaleString("pt-BR")}
            sub="directus.ordens (leitura)"
          />
          <StatCard
            label="Protocolos Pendentes"
            value={stats.protocolosPendentes}
            sub="Aguardando motoboy"
          />
          <StatCard
            label="Cotação Ouro"
            value={`R$ ${stats.cotacaoOuro.toFixed(2)}`}
            sub="Por grama"
            accent
          />
          <StatCard
            label="Dólar"
            value={`R$ ${stats.cotacaoDolar.toFixed(2)}`}
            sub="Cotação atual"
            accent
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Tabela ordens */}
          <div className="lg:col-span-2 bg-white rounded-xl overflow-hidden border"
            style={{ borderColor: "#E8DCC8" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#F3EADA" }}>
              <h3 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                Últimas Ordens
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                via alissonerp.vw_ordens_completa
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: "#184036" }}>
                    {["ID", "Nº Ordem", "Situação", "Status", "Vendedor", "Cliente", "Data"].map((h) => (
                      <th key={h}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "#80A795" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ultimasOrdens.map((o: any, i: number) => (
                    <tr
                      key={o.id}
                      className="border-b transition-colors hover:bg-opacity-50"
                      style={{
                        borderColor: "#F3EADA",
                        backgroundColor: i % 2 === 0 ? "#fff" : "#FAFAF7",
                      }}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>
                        {o.id}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#184036" }}>
                        {o.numero_ordem ?? `#${o.id}`}
                      </td>
                      <td className="px-4 py-2.5">
                        <SituacaoBadge situacao={o.situacao ?? "criado"} />
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {o.status ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs truncate max-w-[120px]" style={{ color: "#6B7280" }}>
                        {o.vendedor_nome ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs truncate max-w-[120px]" style={{ color: "#184036" }}>
                        {o.cliente_nome ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                        {o.date_created
                          ? new Date(o.date_created).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {ultimasOrdens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "#6B7280" }}>
                        Nenhuma ordem encontrada
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar direita */}
          <div className="space-y-5">

            {/* Depósitos */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#E8DCC8" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>
                Depósitos
              </h3>
              <div className="space-y-2">
                {depositos.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: d.tipo === "administrativo" ? "#DB9864" : "#80A795" }}
                      />
                      <span className="text-xs" style={{ color: "#1A1A1A" }}>
                        {d.nome}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono" style={{ color: "#6B7280" }}>
                      ID {d.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vendedores */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#E8DCC8" }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "#1A1A1A" }}>
                Vendedores
              </h3>
              <p className="text-[10px] mb-3" style={{ color: "#6B7280" }}>
                public.vendedores — {vendedores.length} cadastrados
              </p>
              <div className="space-y-2">
                {vendedores.slice(0, 8).map((v: any) => (
                  <div key={v.id_vendedor} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #DB9864, #FEDDB4)", color: "#184036" }}
                    >
                      {v.nome?.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs truncate" style={{ color: "#1A1A1A" }}>
                      {v.nome}
                    </span>
                  </div>
                ))}
                {vendedores.length > 8 && (
                  <p className="text-[10px]" style={{ color: "#6B7280" }}>
                    + {vendedores.length - 8} mais
                  </p>
                )}
              </div>
            </div>

            {/* Info schema */}
            <div
              className="rounded-xl p-5"
              style={{ background: "linear-gradient(135deg, #184036, #0F2922)" }}
            >
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "#80A795" }}>
                Schema alissonerp
              </p>
              <p className="text-2xl font-mono font-semibold" style={{ color: "#F3EADA" }}>
                37 tabelas
              </p>
              <p className="text-sm font-mono" style={{ color: "#80A795" }}>
                11 views · 6 triggers
              </p>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "#0F2922" }}>
                <p className="text-[10px]" style={{ color: "#80A795" }}>
                  {stats.totalOrdens} ordens · {vendedores.length} vendedores
                </p>
                <p className="text-[10px]" style={{ color: "#80A795" }}>
                  Cross-schema: directus + public
                </p>
              </div>
            </div>
          </div>
        </div>
        </main>
    </div>
  );
}
