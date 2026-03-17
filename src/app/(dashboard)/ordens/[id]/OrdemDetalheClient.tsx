"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ComentariosOrdem from "@/components/ComentariosOrdem";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
  danger: "#DC2626",
  warning: "#F59E0B",
  success: "#10B981",
};

const STATUS_MAP: Record<string, { bg: string; color: string }> = {
  "Aguardando":   { bg: "#FEF3C7", color: "#92400E" },
  "Em Andamento": { bg: "#DBEAFE", color: "#1E40AF" },
  "Concluído":    { bg: "#D1FAE5", color: "#065F46" },
  "Cancelado":    { bg: "#FEE2E2", color: "#991B1B" },
  "Novas Ordens": { bg: "#EEF2FF", color: "#4338CA" },
  "Pendência":    { bg: "#FEF3C7", color: "#92400E" },
  "Pendente":     { bg: "#FEF3C7", color: "#92400E" },
};

function Badge({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  const s = STATUS_MAP[label] ?? { bg: "#F3F4F6", color: "#6B7280" };
  const pad = size === "lg" ? "px-3 py-1 text-[13px]" : "px-2.5 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex rounded-full font-semibold ${pad}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {label || "—"}
    </span>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</span>
      <span className={`text-[13px] text-right ${mono ? "font-mono" : ""}`} style={{ color: "#1A1A1A" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function MarcadorBadge({ marcador }: { marcador: string }) {
  const entradas = ["AD", "EM", "EP", "ADD", "EIMD", "EPD", "EA", "ENTRADA", "Sangria"];
  const isEntrada = entradas.includes(marcador ?? "");
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
      style={{
        backgroundColor: isEntrada ? "#D1FAE5" : "#FEE2E2",
        color: isEntrada ? "#065F46" : "#991B1B",
      }}
    >
      {marcador || "—"}
    </span>
  );
}

type Tab = "producao" | "apontamentos" | "estoque" | "transferencias" | "ficha" | "comentarios";

interface Props {
  ordem: any;
  apontamentos: any[];
  movEstoque: any[];
  transferencias: any[];
  fichaTecnica: any | null;
  timeline: any[];
}

export default function OrdemDetalheClient({ ordem, apontamentos, movEstoque, transferencias, fichaTecnica, timeline }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("producao");
  const [comentariosCount, setComentariosCount] = useState(0);

  const temPcp = !!ordem.pcp_id;
  const pcpConcluido = ordem.pcp_etapas_cod === "5";
  const quebraAlta = Number(ordem.pcp_quebra_pct) > 5;

  // Encontrar o passo atual (primeiro não-concluido)
  const passoAtualIdx = timeline.findIndex((ev) => ev.status !== "concluido");

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "producao",       label: "Produção" },
    { key: "apontamentos",   label: "Apontamentos",   count: apontamentos.length },
    { key: "estoque",        label: "Mov. Estoque",   count: movEstoque.length },
    { key: "transferencias", label: "Transferências", count: transferencias.length },
    { key: "ficha",          label: "Ficha Técnica",  count: fichaTecnica ? 1 : 0 },
    { key: "comentarios",    label: "Comentários",    count: comentariosCount },
  ];

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/ordens")}
          className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          ←
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
            >
              {ordem.numero_ordem || `Ordem #${ordem.id}`}
            </h2>
            <Badge label={ordem.status} size="lg" />
            {ordem.pcp_bloqueado && (
              <span
                className="px-2 py-0.5 rounded text-[11px] font-semibold"
                style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
              >
                Bloqueado
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            ID {ordem.id} · {ordem.tipo_ordem} · {ordem.rota}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="col-span-2 space-y-5">

          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                Comercial
              </p>
              <InfoRow label="Cliente"        value={ordem.cliente_nome} />
              <InfoRow label="Vendedor(a)"    value={ordem.vendedor_nome} />
              <InfoRow label="Data Entrega"   value={ordem.data_entrega ? new Date(ordem.data_entrega).toLocaleDateString("pt-BR") : null} />
              <InfoRow label="Peso Negociado" value={ordem.peso_metal_negociado ? `${Number(ordem.peso_metal_negociado).toFixed(2)}g` : null} mono />
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                Produção
              </p>
              <InfoRow label="PCP"            value={temPcp ? `#${ordem.pcp_id} — ${ordem.pcp_etapas}` : "Sem PCP"} />
              <InfoRow label="Operador"       value={ordem.pcp_operador_nome !== "Sem operador" ? ordem.pcp_operador_nome : null} />
              <InfoRow label="Setor Atual"    value={ordem.setor_nome} />
              <InfoRow label="Metal Externo"  value={Number(ordem.pcp_metal_externo || 0) > 0 ? `${Number(ordem.pcp_metal_externo).toFixed(2)}g` : "—"} mono />
            </div>
          </div>

          {/* Card PMC — só quando PCP concluído */}
          {pcpConcluido && (
            <div
              className="rounded-xl p-5"
              style={{ background: `linear-gradient(135deg, ${C.esmeralda}, #0F2922)` }}
            >
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: C.sage }}>
                Resultado de Produção (PCP Concluído)
              </p>
              <div className="grid grid-cols-5 gap-4">
                {[
                  { label: "Entrada Metal", value: `${Number(ordem.pcp_total_metal || 0).toFixed(2)}g` },
                  { label: "Retorno",       value: `${Number(ordem.pcp_retorno_metal || 0).toFixed(2)}g` },
                  { label: "Peso Final",    value: `${Number(ordem.pcp_peso_final || 0).toFixed(2)}g` },
                  { label: "PMC",           value: `${Number(ordem.pcp_pmc || 0).toFixed(2)}g`, accent: true },
                  { label: "Quebra",        value: `${Number(ordem.pcp_quebra || 0).toFixed(2)}g (${Number(ordem.pcp_quebra_pct || 0).toFixed(1)}%)`, danger: quebraAlta },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[10px] mb-1" style={{ color: C.sage }}>{item.label}</p>
                    <p
                      className="font-mono text-lg font-semibold"
                      style={{
                        color: item.danger ? "#FCA5A5" : item.accent ? C.dourado : C.creme,
                      }}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0.5 rounded-lg p-0.5 w-fit" style={{ backgroundColor: C.creme }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: tab === t.key ? C.esmeralda : "transparent",
                  color: tab === t.key ? C.creme : "#6B7280",
                }}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1 opacity-60">({t.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab: Produção */}
          {tab === "producao" && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              <p className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>
                Dados de Produção (PCP)
              </p>
              {!temPcp ? (
                <p className="text-sm py-4 text-center" style={{ color: "#9CA3AF" }}>
                  Nenhum PCP vinculado a esta ordem.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-x-8 gap-y-1">
                  {[
                    { label: "Total Metal",    value: `${Number(ordem.pcp_total_metal || 0).toFixed(2)}g` },
                    { label: "Retorno Metal",  value: `${Number(ordem.pcp_retorno_metal || 0).toFixed(2)}g` },
                    { label: "Metal Externo",  value: `${Number(ordem.pcp_metal_externo || 0).toFixed(2)}g` },
                    { label: "Pedras (un)",    value: `${ordem.pcp_total_pedras_un || 0}` },
                    { label: "Pedras (g)",     value: `${Number(ordem.pcp_total_pedras_g || 0).toFixed(2)}g` },
                    { label: "Outros Pesos",   value: `${Number(ordem.pcp_total_outros || 0).toFixed(2)}g` },
                    { label: "Peso Final",     value: `${Number(ordem.pcp_peso_final || 0).toFixed(2)}g` },
                    { label: "PMC",            value: `${Number(ordem.pcp_pmc || 0).toFixed(2)}g` },
                    { label: "Quebra",         value: `${Number(ordem.pcp_quebra || 0).toFixed(2)}g (${Number(ordem.pcp_quebra_pct || 0).toFixed(1)}%)` },
                  ].map((item) => (
                    <div key={item.label} className="py-2.5 border-b" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{item.label}</p>
                      <p className="font-mono text-sm mt-0.5" style={{ color: "#1A1A1A" }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Apontamentos */}
          {tab === "apontamentos" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {apontamentos.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhum apontamento registrado</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: C.esmeralda }}>
                      {["Data", "Tipo", "Insumo", "Qtd", "Depósito", "Setor", "Por"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sage }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apontamentos.map((a, i) => (
                      <tr key={a.id} className="border-b" style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}>
                        <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                          {a.data ? new Date(a.data).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: "#1A1A1A" }}>{a.tipo_descricao || "—"}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{a.insumo_nome || "—"}</td>
                        <td className="px-3 py-2 font-mono text-sm font-semibold" style={{ color: C.dourado }}>{a.qtd}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{a.deposito_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{a.setor_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#9CA3AF" }}>{a.criado_por || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Movimentações Estoque */}
          {tab === "estoque" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {movEstoque.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhuma movimentação de estoque</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: C.esmeralda }}>
                      {["Data", "Marcador", "Entrada", "Saída", "Insumo", "Depósito", "Setor"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.sage }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movEstoque.map((m, i) => (
                      <tr key={m.id} className="border-b" style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}>
                        <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "#6B7280" }}>
                          {m.date_created ? new Date(m.date_created).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2"><MarcadorBadge marcador={m.marcador} /></td>
                        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.success }}>
                          {Number(m.entrada) > 0 ? Number(m.entrada).toFixed(2) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: C.danger }}>
                          {Number(m.saida) > 0 ? Number(m.saida).toFixed(2) : ""}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "#6B7280" }}>{m.insumo_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.deposito_nome || "—"}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: "#6B7280" }}>{m.setor_nome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Transferências */}
          {tab === "transferencias" && (
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {transferencias.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhuma transferência registrada</p>
              ) : (
                <div>
                  {transferencias.map((t, i) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-4 px-5 py-3 border-b"
                      style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.bg }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: "#E8F0ED", color: C.esmeralda }}
                      >
                        →
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px]" style={{ color: "#1A1A1A" }}>
                          {t.setor_nome || "Setor desconhecido"}
                          {t.deposito_nome ? ` · ${t.deposito_nome}` : ""}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{t.criado_por}</p>
                      </div>
                      <p className="font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                        {t.data ? new Date(t.data).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Comentários */}
          {tab === "comentarios" && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#E8DCC8" }}>
              <ComentariosOrdem
                ordemId={ordem.id}
                onCountChange={setComentariosCount}
              />
            </div>
          )}

          {/* Tab: Ficha Técnica */}
          {tab === "ficha" && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
              {!fichaTecnica ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma ficha técnica vinculada a esta ordem.</p>
                  <p className="text-[11px] mt-1" style={{ color: "#C4B5A0" }}>A ficha é criada pelo PDV no Directus ao lançar a ordem.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {[
                    {
                      titulo: "Medições",
                      campos: [
                        ["Milimetragem 1", fichaTecnica.milimetragem_1 != null ? `${fichaTecnica.milimetragem_1} mm` : null],
                        ["Milimetragem 2", fichaTecnica.milimetragem_2 != null ? `${fichaTecnica.milimetragem_2} mm` : null],
                        ["Numeração 1", fichaTecnica.numeracao],
                        ["Numeração 2", fichaTecnica.numeracao_2],
                        ["Comprimento", fichaTecnica.comprimento != null ? `${fichaTecnica.comprimento} mm` : null],
                      ],
                    },
                    {
                      titulo: "Modelo",
                      campos: [
                        ["Modelo 1", fichaTecnica.modelo_1_label ?? fichaTecnica.modelo_1],
                        ["Modelo Interno 1", fichaTecnica.modelo_interno_1_label ?? fichaTecnica.modelo_interno_1],
                        ["Outro Modelo 1", fichaTecnica.outro_modelo_1],
                        ["Modelo 2", fichaTecnica.modelo_2_label ?? fichaTecnica.modelo_2],
                        ["Modelo Interno 2", fichaTecnica.modelo_interno_2_label ?? fichaTecnica.modelo_interno_2],
                        ["Outro Modelo 2", fichaTecnica.outro_modelo_2],
                        ["Modelo Externo Anel", fichaTecnica.modelo_externo_anel],
                      ],
                    },
                    {
                      titulo: "Gravação",
                      campos: [
                        ["Tipo Fonte 1", fichaTecnica.tipo_fonte_1_label ?? fichaTecnica.tipo_fonte_1],
                        ["Texto 1", fichaTecnica.texto_tipo_fonte_1],
                        ["Tipo Fonte 2", fichaTecnica.tipo_fonte_2_label ?? fichaTecnica.tipo_fonte_2],
                        ["Texto 2", fichaTecnica.texto_tipo_fonte_2],
                      ],
                    },
                    {
                      titulo: "Corrente / Pulseira",
                      campos: [
                        ["Tipo Elo", fichaTecnica.tipo_elo_label ?? fichaTecnica.tipo_elo],
                        ["Outro Elo", fichaTecnica.outro_tipo_elo],
                        ["Tipo Fecho", fichaTecnica.tipo_fecho_label ?? fichaTecnica.tipo_fecho],
                        ["Outro Fecho", fichaTecnica.outro_tipo_fecho],
                        ["Modelo Bracelete", fichaTecnica.modelo_bracelete],
                      ],
                    },
                    {
                      titulo: "Pingente",
                      campos: [
                        ["Modelo", fichaTecnica.modelo_pingente_label ?? fichaTecnica.modelo_pingente],
                        ["Outro Modelo", fichaTecnica.outro_modelo_pingente],
                        ["Altura", fichaTecnica.altura_pingente != null ? `${fichaTecnica.altura_pingente} mm` : null],
                        ["Largura", fichaTecnica.largura_pingente != null ? `${fichaTecnica.largura_pingente} mm` : null],
                      ],
                    },
                    {
                      titulo: "Anel",
                      campos: [
                        ["Modelo Anel", fichaTecnica.modelo_anel],
                        ["Milim. Base", fichaTecnica.milimetragem_da_base != null ? `${fichaTecnica.milimetragem_da_base} mm` : null],
                        ["Milim. Aro", fichaTecnica.milimetragem_do_aro != null ? `${fichaTecnica.milimetragem_do_aro} mm` : null],
                        ["Modelo Interno", fichaTecnica.modelo_interno_anel],
                      ],
                    },
                    {
                      titulo: "Placa / Chapa",
                      campos: [
                        ["Altura Placa", fichaTecnica.altura_placa != null ? `${fichaTecnica.altura_placa} mm` : null],
                        ["Largura Placa", fichaTecnica.largura_placa != null ? `${fichaTecnica.largura_placa} mm` : null],
                        ["Espessura Chapa", fichaTecnica.expessura_chapa != null ? `${fichaTecnica.expessura_chapa} mm` : null],
                        ["Nome Chapa", fichaTecnica.nome_chapa],
                        ["Tipo Tarraxa", fichaTecnica.tipo_tarraxa],
                      ],
                    },
                  ].map((grupo) => {
                    const visiveis = grupo.campos.filter(([, v]) => v != null && v !== "");
                    if (visiveis.length === 0) return null;
                    return (
                      <div key={grupo.titulo}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>{grupo.titulo}</p>
                        <div className="grid grid-cols-2 gap-x-8">
                          {visiveis.map(([label, value]) => (
                            <InfoRow key={label} label={label} value={String(value)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-right" style={{ color: "#C4B5A0" }}>Ficha #{fichaTecnica.ficha_id}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <p className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>Timeline</p>
            <div>
              {timeline.map((ev, i) => {
                const isConcluido  = ev.status === "concluido";
                const isAtual      = i === passoAtualIdx;
                const isPendente   = ev.status === "pendente" && !isAtual;

                const dotColor = isConcluido ? C.esmeralda : isAtual ? C.dourado : C.cremeBorder;
                const labelColor = isConcluido ? "#1A1A1A" : isAtual ? C.dourado : "#C4B5A0";

                return (
                  <div key={ev.passo} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${isAtual ? "animate-pulse" : ""}`}
                        style={{ backgroundColor: dotColor }}
                      />
                      {i < timeline.length - 1 && (
                        <div className="w-px flex-1 min-h-[28px] mt-1" style={{ backgroundColor: isConcluido ? C.esmeralda : C.cremeBorder, opacity: isConcluido ? 0.3 : 1 }} />
                      )}
                    </div>
                    <div className="pb-4 min-w-0">
                      <p
                        className="text-[13px] font-medium leading-tight"
                        style={{ color: labelColor }}
                      >
                        {ev.evento}
                        {isAtual && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.dourado }}>
                            atual
                          </span>
                        )}
                      </p>
                      {ev.detalhe && !isPendente && (
                        <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{ev.detalhe}</p>
                      )}
                      {ev.data_evento && (
                        <p className="font-mono text-[10px] mt-0.5" style={{ color: "#C4B5A0" }}>
                          {new Date(ev.data_evento).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resumo rápido */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <p className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>Resumo</p>
            <div className="space-y-2">
              {[
                { label: "Apontamentos",   value: apontamentos.length },
                { label: "Mov. Estoque",   value: movEstoque.length },
                { label: "Transferências", value: transferencias.length },
                ordem.pcp_total_pedras_un > 0 && { label: "Pedras",       value: `${ordem.pcp_total_pedras_un} un` },
                ordem.dist_id && { label: "Distribuição",  value: `#${ordem.dist_id}` },
              ].filter(Boolean).map((item: any) => (
                <div key={item.label} className="flex justify-between text-[12px]">
                  <span style={{ color: "#9CA3AF" }}>{item.label}</span>
                  <span className="font-mono font-medium" style={{ color: "#1A1A1A" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Info extra */}
          <div className="rounded-xl p-4" style={{ backgroundColor: C.creme }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Datas</p>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span style={{ color: "#9CA3AF" }}>Criado</span>
                <span className="font-mono" style={{ color: "#1A1A1A" }}>
                  {ordem.date_created ? new Date(ordem.date_created).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#9CA3AF" }}>Entrega</span>
                <span className="font-mono" style={{ color: "#1A1A1A" }}>
                  {ordem.data_entrega ? new Date(ordem.data_entrega).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
              {ordem.pcp_data_conclusao && (
                <div className="flex justify-between">
                  <span style={{ color: "#9CA3AF" }}>Concluído</span>
                  <span className="font-mono" style={{ color: C.success }}>
                    {new Date(ordem.pcp_data_conclusao).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
