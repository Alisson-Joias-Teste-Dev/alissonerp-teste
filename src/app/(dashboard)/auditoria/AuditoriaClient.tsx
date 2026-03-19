"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Loader2,
  X,
  ChevronDown,
  Store,
  Factory,
  SlidersHorizontal,
} from "lucide-react";
import { MobileCard } from "@/components/ui/MobileCard";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DashboardRow {
  tipo_auditoria: string;
  pendentes: number;
  em_analise: number;
  aprovadas: number;
  reprovadas: number;
  pendenciadas: number;
  total: number;
  taxa_aprovacao: number;
  media_dias: number;
  alertas_quebra: number;
}

interface AuditoriaRow {
  id: number;
  situacao: string;
  situacao_label: string;
  tipo_auditoria: string;
  tipo_auditoria_label: string;
  rota_processo: string | null;
  ordem_id: number;
  numero_ordem: string | null;
  numero_pedido: string | null;
  tipo_ordem: string | null;
  rota_ordem: string | null;
  ourives_nome: string | null;
  peso_negociado: number;
  peso_final: number;
  pmc: number;
  quebra: number;
  quebra_percentual: number;
  total_metal: number;
  retorno_metal: number;
  metal_externo: number;
  ficha_tecnica_obs: string | null;
  dados_ordem: Record<string, unknown> | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  parecer: string | null;
  motivo_reprovacao: string | null;
  tipo_retrabalho: string | null;
  ordem_retrabalho_id: number | null;
  ordem_retrabalho_numero: string | null;
  cliente_nome: string | null;
  vendedor_nome: string | null;
  diff_peso_pct: number;
  created_at: string;
  data_conclusao: string | null;
  dias_analise: number;
  data_entrega: string | null;
  peso_metal_externo: number;
  detalhes_ordem: string | null;
}

interface Props {
  dashboards: DashboardRow[];
  auditorias: AuditoriaRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtNum(n: number | null | undefined, dec = 2) {
  return Number(n ?? 0).toFixed(dec);
}

function QuebraChip({ pct }: { pct: number }) {
  const v = Number(pct ?? 0);
  let bg = "#ECFDF5", color = "#059669";
  if (v > 5) { bg = "#FEF2F2"; color = "#DC2626"; }
  else if (v > 3) { bg = "#FEF3C7"; color = "#92400E"; }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      {v > 5 && <AlertTriangle size={10} />}
      {fmtNum(v, 1)}%
    </span>
  );
}

function SituacaoBadge({ situacao }: { situacao: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; icon: typeof Clock }> = {
    pendente:    { label: "Pendente",    bg: "#FEF3C7", color: "#92400E", icon: Clock },
    em_analise:  { label: "Em Análise",  bg: "#EFF6FF", color: "#2563EB", icon: Clock },
    aprovado:    { label: "Aprovada",    bg: "#ECFDF5", color: "#059669", icon: CheckCircle2 },
    reprovado:   { label: "Reprovada",   bg: "#FEF2F2", color: "#DC2626", icon: XCircle },
    pendenciado: { label: "Pendenciada", bg: "#F5F3FF", color: "#7C3AED", icon: Clock },
  };
  const s = cfg[situacao] ?? { label: situacao, bg: "#F3F4F6", color: "#6B7280", icon: Clock };
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <Icon size={10} />
      {s.label}
    </span>
  );
}

function KpiCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "#9CA3AF" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: color ?? C.esmeralda }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{sub}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AuditoriaModal({
  aud, onClose, onRefresh,
}: {
  aud: AuditoriaRow;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [action, setAction] = useState<"detail" | "aprovar" | "reprovar" | "pendenciar">("detail");
  const [parecer, setParecer] = useState(aud.parecer ?? "");
  const [motivo, setMotivo] = useState(aud.motivo_reprovacao ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fichaTecnica, setFichaTecnica] = useState<Record<string, unknown> | null>(null);
  const [fichaLoading, setFichaLoading] = useState(true);

  const isLoja = aud.tipo_auditoria === "loja";

  // Buscar ficha técnica via API route (usa sql direto, bypassa PostgREST)
  // PostgREST só expõe public+directus — alissonerp não está no PGRST_DB_SCHEMAS
  useEffect(() => {
    setFichaLoading(true);
    fetch(`/api/ficha/${aud.ordem_id}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        setFichaTecnica(data && data.ficha_id ? data : null);
        setFichaLoading(false);
      })
      .catch(() => setFichaLoading(false));
  }, [aud.ordem_id]);
  const isPendente = ["pendente", "em_analise", "pendenciado"].includes(aud.situacao);
  const dados = aud.dados_ordem as Record<string, unknown> | null;

  async function patchAuditoria(body: Record<string, unknown>) {
    const res = await fetch(`/api/auditoria/${aud.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Erro ${res.status}`);
    }
  }

  async function handleAprovar() {
    setError("");
    setLoading(true);
    try {
      await patchAuditoria({ situacao: "aprovado", parecer: parecer || null });
      onRefresh();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar");
    } finally {
      setLoading(false);
    }
  }

  async function handleReprovar() {
    setError("");
    if (!motivo.trim()) { setError("Motivo de reprovação é obrigatório."); return; }
    setLoading(true);
    try {
      await patchAuditoria({ situacao: "reprovado", motivo_reprovacao: motivo, parecer: parecer || null });
      onRefresh();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao reprovar");
    } finally {
      setLoading(false);
    }
  }

  async function handlePendenciar() {
    setError("");
    setLoading(true);
    try {
      await patchAuditoria({ situacao: "pendenciado", parecer: parecer || null });
      onRefresh();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao pendenciar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-xl md:mx-4 md:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
                Auditoria #{aud.id}
              </h3>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: isLoja ? "#EFF6FF" : "#F0FDF4",
                  color: isLoja ? "#2563EB" : "#15803D",
                }}
              >
                {isLoja ? <Store size={10} /> : <Factory size={10} />}
                {aud.tipo_auditoria_label}
              </span>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Ordem {aud.numero_ordem ?? `#${aud.ordem_id}`}
              {aud.cliente_nome ? ` — ${aud.cliente_nome}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SituacaoBadge situacao={aud.situacao} />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
            >
              <X size={17} style={{ color: "#9CA3AF" }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">

          {/* ── AUDITORIA LOJA: dados da ordem ─────────────────────────────────── */}
          {isLoja && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Dados da Ordem (PDV)
              </p>
              <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                {[
                  ...(aud.numero_pedido ? [["Nº Pedido PDV", `#${aud.numero_pedido}`]] : []),
                  ["Nº Ordem", aud.numero_ordem ?? `#${aud.ordem_id}`],
                  ["Cliente", aud.cliente_nome ?? "—"],
                  ["Vendedor", aud.vendedor_nome ?? "—"],
                  ["Tipo Ordem", aud.tipo_ordem ?? (dados?.tipo_ordem as string) ?? "—"],
                  ["Rota", aud.rota_ordem ?? (dados?.rota as string) ?? "—"],
                  ["Peso Negociado", `${fmtNum(aud.peso_negociado)} g`],
                  ...(aud.data_entrega ? [["Data Entrega", fmt(aud.data_entrega)]] : []),
                  ...(aud.peso_metal_externo > 0 ? [["Peso Metal Externo", `${fmtNum(aud.peso_metal_externo)} g`]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span style={{ color: "#6B7280" }}>{k}</span>
                    <span
                      className={k === "Nº Pedido PDV" ? "font-mono font-bold" : "font-medium"}
                      style={{ color: k === "Nº Pedido PDV" ? C.esmeralda : "#111827" }}
                    >{v}</span>
                  </div>
                ))}
              </div>
              {aud.ficha_tecnica_obs && (
                <p className="text-sm rounded-lg p-3 mt-2" style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                  <strong>Obs. Ficha Técnica:</strong> {aud.ficha_tecnica_obs}
                </p>
              )}
            </div>
          )}

          {/* ── AUDITORIA FÁBRICA: dados de produção ───────────────────────────── */}
          {!isLoja && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Dados de Produção
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Peso Negociado", value: `${fmtNum(aud.peso_negociado)} g` },
                  { label: "Peso Final",     value: `${fmtNum(aud.peso_final)} g` },
                  { label: "PMC",            value: `${fmtNum(aud.pmc)} g` },
                  { label: "Quebra",         value: `${fmtNum(aud.quebra)} g` },
                  { label: "% Quebra",       value: <QuebraChip pct={aud.quebra_percentual} /> },
                  { label: "Diff. Peso",     value: `${fmtNum(aud.diff_peso_pct, 1)}%` },
                  { label: "Total Metal",    value: `${fmtNum(aud.total_metal)} g` },
                  { label: "Retorno Metal",  value: `${fmtNum(aud.retorno_metal)} g` },
                  { label: "Metal Externo",  value: `${fmtNum(aud.metal_externo)} g` },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg p-2.5"
                    style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                  >
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{item.label}</p>
                    <div className="text-sm font-semibold mt-0.5" style={{ color: C.esmeralda }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalhes da Ordem — só exibe quando preenchido */}
          {aud.detalhes_ordem && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Detalhes da Ordem
              </p>
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}
              >
                <p
                  className="text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ color: "#78350F" }}
                >
                  {aud.detalhes_ordem}
                </p>
              </div>
            </div>
          )}

          {/* Ficha Técnica */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Ficha Técnica{fichaTecnica ? ` #${String(fichaTecnica.ficha_id)}` : ""}
            </p>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD" }}>
              {fichaLoading ? (
                <div className="flex items-center gap-2 py-1" style={{ color: "#0369A1" }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-sm">Carregando ficha...</span>
                </div>
              ) : !fichaTecnica ? (
                <p className="text-sm italic" style={{ color: "#94A3B8" }}>Nenhuma ficha técnica vinculada a esta ordem.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    {
                      grupo: "Medições",
                      campos: [
                        ["Milimetragem 1", fichaTecnica.milimetragem_1 != null ? `${fichaTecnica.milimetragem_1} mm` : null],
                        ["Milimetragem 2", fichaTecnica.milimetragem_2 != null ? `${fichaTecnica.milimetragem_2} mm` : null],
                        ["Numeração 1",    fichaTecnica.numeracao],
                        ["Numeração 2",    fichaTecnica.numeracao_2],
                        ["Comprimento",    fichaTecnica.comprimento != null ? `${fichaTecnica.comprimento} mm` : null],
                      ],
                    },
                    {
                      grupo: "Modelo",
                      campos: [
                        ["Modelo 1",         fichaTecnica.modelo_1_label ?? fichaTecnica.modelo_1],
                        ["Modelo Interno 1", fichaTecnica.modelo_interno_1_label ?? fichaTecnica.modelo_interno_1],
                        ["Outro Modelo 1",   fichaTecnica.outro_modelo_1],
                        ["Modelo 2",         fichaTecnica.modelo_2_label ?? fichaTecnica.modelo_2],
                        ["Modelo Interno 2", fichaTecnica.modelo_interno_2_label ?? fichaTecnica.modelo_interno_2],
                        ["Outro Modelo 2",   fichaTecnica.outro_modelo_2],
                        ["Modelo Externo",   fichaTecnica.modelo_externo_anel],
                      ],
                    },
                    {
                      grupo: "Gravação",
                      campos: [
                        ["Tipo Fonte 1", fichaTecnica.tipo_fonte_1_label ?? fichaTecnica.tipo_fonte_1],
                        ["Texto 1",      fichaTecnica.texto_tipo_fonte_1],
                        ["Tipo Fonte 2", fichaTecnica.tipo_fonte_2_label ?? fichaTecnica.tipo_fonte_2],
                        ["Texto 2",      fichaTecnica.texto_tipo_fonte_2],
                      ],
                    },
                    {
                      grupo: "Corrente / Pulseira",
                      campos: [
                        ["Tipo Elo",    fichaTecnica.tipo_elo_label ?? fichaTecnica.tipo_elo],
                        ["Outro Elo",   fichaTecnica.outro_tipo_elo],
                        ["Tipo Fecho",  fichaTecnica.tipo_fecho_label ?? fichaTecnica.tipo_fecho],
                        ["Outro Fecho", fichaTecnica.outro_tipo_fecho],
                        ["Bracelete",   fichaTecnica.modelo_bracelete],
                      ],
                    },
                    {
                      grupo: "Pingente",
                      campos: [
                        ["Modelo",       fichaTecnica.modelo_pingente_label ?? fichaTecnica.modelo_pingente],
                        ["Outro Modelo", fichaTecnica.outro_modelo_pingente],
                        ["Altura",       fichaTecnica.altura_pingente != null ? `${fichaTecnica.altura_pingente} mm` : null],
                        ["Largura",      fichaTecnica.largura_pingente != null ? `${fichaTecnica.largura_pingente} mm` : null],
                      ],
                    },
                    {
                      grupo: "Anel",
                      campos: [
                        ["Modelo Anel",    fichaTecnica.modelo_anel],
                        ["Milim. Base",    fichaTecnica.milimetragem_da_base != null ? `${fichaTecnica.milimetragem_da_base} mm` : null],
                        ["Milim. Aro",     fichaTecnica.milimetragem_do_aro != null ? `${fichaTecnica.milimetragem_do_aro} mm` : null],
                        ["Modelo Interno", fichaTecnica.modelo_interno_anel],
                      ],
                    },
                    {
                      grupo: "Placa / Chapa",
                      campos: [
                        ["Altura Placa",    fichaTecnica.altura_placa != null ? `${fichaTecnica.altura_placa} mm` : null],
                        ["Largura Placa",   fichaTecnica.largura_placa != null ? `${fichaTecnica.largura_placa} mm` : null],
                        ["Espessura Chapa", fichaTecnica.expessura_chapa != null ? `${fichaTecnica.expessura_chapa} mm` : null],
                        ["Nome Chapa",      fichaTecnica.nome_chapa],
                        ["Tipo Tarraxa",    fichaTecnica.tipo_tarraxa],
                      ],
                    },
                  ].map(({ grupo, campos }) => {
                    const visiveis = campos.filter(([, v]) => v != null && v !== "");
                    if (visiveis.length === 0) return null;
                    return (
                      <div key={grupo}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#0369A1" }}>{grupo}</p>
                        <div className="space-y-1">
                          {visiveis.map(([k, v]) => (
                            <div key={String(k)} className="flex items-center justify-between text-[13px]">
                              <span style={{ color: "#4B8BA8" }}>{String(k)}</span>
                              <span className="font-medium" style={{ color: "#0C4A6E" }}>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Operacional (comum) */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Operacional
            </p>
            <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
              {[
                ...(!isLoja ? [["Ourives", aud.ourives_nome ?? "—"]] : []),
                ...(isLoja ? [] : []),
                ["Responsável", aud.responsavel_nome ?? "Não atribuído"],
                ["Criado em",   fmt(aud.created_at)],
                ["Concluído em", fmt(aud.data_conclusao)],
                ["Dias em análise", `${fmtNum(aud.dias_analise, 1)} dias`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>{k}</span>
                  <span className="font-medium" style={{ color: "#111827" }}>{v}</span>
                </div>
              ))}
              {aud.ordem_retrabalho_numero && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Ordem Retrabalho</span>
                  <span className="font-medium text-amber-700">{aud.ordem_retrabalho_numero}</span>
                </div>
              )}
            </div>
          </div>

          {/* Parecer / Motivo existentes */}
          {(aud.parecer || aud.motivo_reprovacao) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Análise Registrada
              </p>
              {aud.parecer && (
                <p className="text-sm rounded-lg p-3" style={{ backgroundColor: "#ECFDF5", color: "#065F46" }}>
                  <strong>Parecer:</strong> {aud.parecer}
                </p>
              )}
              {aud.motivo_reprovacao && (
                <p className="text-sm rounded-lg p-3 mt-2" style={{ backgroundColor: "#FEF2F2", color: "#991B1B" }}>
                  <strong>Motivo Reprovação:</strong> {aud.motivo_reprovacao}
                </p>
              )}
            </div>
          )}

          {/* Ações — só para auditorias pendentes */}
          {isPendente && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Ação
              </p>

              <div className="flex gap-1 rounded-lg p-0.5 mb-3 w-fit" style={{ backgroundColor: C.creme }}>
                {(["aprovar", "reprovar", "pendenciar"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className="px-3 py-1 rounded-md text-[12px] font-medium transition-colors"
                    style={{
                      backgroundColor: action === a ? C.esmeralda : "transparent",
                      color: action === a ? C.creme : "#6B7280",
                    }}
                  >
                    {a === "aprovar" ? "Aprovar" : a === "reprovar" ? "Reprovar" : "Pendenciar"}
                  </button>
                ))}
              </div>

              <div className="mb-3">
                <label className="text-[12px] font-medium block mb-1" style={{ color: "#374151" }}>
                  Parecer (opcional)
                </label>
                <textarea
                  value={parecer}
                  onChange={(e) => setParecer(e.target.value)}
                  rows={2}
                  placeholder="Observações do gerente..."
                  className="w-full text-sm rounded-lg border px-3 py-2 focus:outline-none resize-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>

              {action === "reprovar" && (
                <div className="mb-3">
                  <label className="text-[12px] font-medium block mb-1" style={{ color: "#374151" }}>
                    Motivo da Reprovação <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    placeholder={
                      isLoja
                        ? "Descreva o problema para devolver ao PDV corrigir..."
                        : "Descreva o problema de produção (obrigatório)..."
                    }
                    className="w-full text-sm rounded-lg border px-3 py-2 focus:outline-none resize-none"
                    style={{ borderColor: motivo.trim() ? C.cremeBorder : "#FCA5A5" }}
                  />
                </div>
              )}

              {error && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] mb-3"
                  style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={
                  action === "aprovar" ? handleAprovar
                  : action === "reprovar" ? handleReprovar
                  : handlePendenciar
                }
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor:
                    action === "aprovar" ? "#059669"
                    : action === "reprovar" ? "#DC2626"
                    : "#7C3AED",
                  color: "#fff",
                }}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Salvando...</>
                ) : action === "aprovar" ? (
                  <><CheckCircle2 size={14} />
                    {isLoja ? "Aprovar — Liberar para Produção" : "Aprovar Auditoria"}
                  </>
                ) : action === "reprovar" ? (
                  <><XCircle size={14} />
                    {isLoja ? "Reprovar — Devolver ao PDV" : "Reprovar e Criar Retrabalho"}
                  </>
                ) : (
                  <><Clock size={14} /> Pendenciar</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

type TabTipo = "loja" | "fabrica";

export default function AuditoriaClient({ dashboards, auditorias }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<TabTipo>("loja");
  const [search, setSearch] = useState("");
  const [filterSituacao, setFilterSituacao] = useState<string>("todos");
  const [selected, setSelected] = useState<AuditoriaRow | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const dash = dashboards.find((d) => d.tipo_auditoria === tab) ?? ({} as DashboardRow);

  const filtered = auditorias.filter((a) => {
    if (a.tipo_auditoria !== tab) return false;
    if (filterSituacao !== "todos" && a.situacao !== filterSituacao) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(a.id).includes(q) ||
      (a.numero_ordem ?? "").toLowerCase().includes(q) ||
      (a.numero_pedido ?? "").includes(q) ||
      (a.ourives_nome ?? "").toLowerCase().includes(q) ||
      (a.cliente_nome ?? "").toLowerCase().includes(q)
    );
  });

  const countByTipo = (tipo: TabTipo) =>
    auditorias.filter(
      (a) => a.tipo_auditoria === tipo && ["pendente", "em_analise", "pendenciado"].includes(a.situacao)
    ).length;

  const tabCfg: Record<TabTipo, { label: string; Icon: typeof Store }> = {
    loja:    { label: "Auditoria Loja",    Icon: Store },
    fabrica: { label: "Auditoria Fábrica", Icon: Factory },
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h2
          className="text-xl md:text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
        >
          Auditoria
        </h2>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Controle de qualidade — Loja (pré-produção) e Fábrica (pós-PCP)
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6 w-fit"
        style={{ backgroundColor: C.creme, border: `1px solid ${C.cremeBorder}` }}
      >
        {(Object.entries(tabCfg) as [TabTipo, { label: string; Icon: typeof Store }][]).map(
          ([tipo, { label, Icon }]) => {
            const pending = countByTipo(tipo);
            const isActive = tab === tipo;
            return (
              <button
                key={tipo}
                onClick={() => { setTab(tipo); setFilterSituacao("todos"); setSearch(""); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: isActive ? C.esmeralda : "transparent",
                  color: isActive ? C.creme : "#6B7280",
                }}
              >
                <Icon size={14} />
                {label}
                {pending > 0 && (
                  <span
                    className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: isActive ? "#ffffff30" : "#DC262620",
                      color: isActive ? "#fff" : "#DC2626",
                    }}
                  >
                    {pending}
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Pendentes"
          value={dash.pendentes ?? 0}
          color={(dash.pendentes ?? 0) > 0 ? "#92400E" : C.esmeralda}
        />
        <KpiCard label="Em Análise" value={dash.em_analise ?? 0} color="#2563EB" />
        <KpiCard
          label="Aprovadas"
          value={dash.aprovadas ?? 0}
          sub={`${dash.taxa_aprovacao ?? 0}% taxa`}
          color="#059669"
        />
        <KpiCard label="Reprovadas" value={dash.reprovadas ?? 0} color="#DC2626" />
        {tab === "fabrica" ? (
          <KpiCard
            label="Alertas Quebra"
            value={dash.alertas_quebra ?? 0}
            sub=">5% quebra"
            color={(dash.alertas_quebra ?? 0) > 0 ? "#DC2626" : C.esmeralda}
          />
        ) : (
          <KpiCard
            label="Pendenciadas"
            value={dash.pendenciadas ?? 0}
            color={(dash.pendenciadas ?? 0) > 0 ? "#7C3AED" : C.esmeralda}
          />
        )}
      </div>

      {/* Filtros mobile */}
      <div className="flex gap-2 mb-2 md:hidden">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder="Buscar ordem, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>
        <button
          onClick={() => setFiltrosAbertos((v) => !v)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border"
          style={{
            borderColor: C.cremeBorder,
            backgroundColor: filtrosAbertos ? C.esmeralda : C.creme,
            color: filtrosAbertos ? C.creme : C.esmeralda,
          }}
        >
          <SlidersHorizontal size={14} />
          Filtros
        </button>
      </div>

      {filtrosAbertos && (
        <div className="mb-3 md:hidden">
          <div className="relative">
            <select
              value={filterSituacao}
              onChange={(e) => setFilterSituacao(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, color: "#374151" }}
            >
              <option value="todos">Todas as situações</option>
              <option value="pendente">Pendentes</option>
              <option value="em_analise">Em Análise</option>
              <option value="aprovado">Aprovadas</option>
              <option value="reprovado">Reprovadas</option>
              <option value="pendenciado">Pendenciadas</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
          </div>
        </div>
      )}

      {/* Filtros desktop */}
      <div className="hidden md:flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder={
              tab === "loja"
                ? "Buscar por ordem, cliente, vendedor..."
                : "Buscar por ordem, ourives, cliente..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>
        <div className="relative">
          <select
            value={filterSituacao}
            onChange={(e) => setFilterSituacao(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ borderColor: C.cremeBorder, color: "#374151" }}
          >
            <option value="todos">Todas as situações</option>
            <option value="pendente">Pendentes</option>
            <option value="em_analise">Em Análise</option>
            <option value="aprovado">Aprovadas</option>
            <option value="reprovado">Reprovadas</option>
            <option value="pendenciado">Pendenciadas</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
        </div>
      </div>

      {/* Lista mobile */}
      <div className="block md:hidden space-y-3 mb-3">
        {filtered.map((a) => {
          const situacaoCor =
            a.situacao === "aprovado" ? "bg-green-100 text-green-700"
            : a.situacao === "reprovado" ? "bg-red-100 text-red-700"
            : a.situacao === "pendenciado" ? "bg-purple-100 text-purple-700"
            : "bg-yellow-100 text-yellow-700";
          const situacaoLabel =
            a.situacao === "aprovado" ? "Aprovada"
            : a.situacao === "reprovado" ? "Reprovada"
            : a.situacao === "em_analise" ? "Em Análise"
            : a.situacao === "pendenciado" ? "Pendenciada"
            : "Pendente";
          return (
            <MobileCard
              key={a.id}
              titulo={a.numero_ordem ?? `#${a.ordem_id}`}
              subtitulo={tab === "loja" ? (a.cliente_nome ?? '') : (a.ourives_nome ?? '')}
              badges={[
                { label: situacaoLabel, cor: situacaoCor },
                { label: tab === "loja" ? "Loja" : "Fábrica", cor: tab === "loja" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700" },
              ]}
              campos={
                tab === "loja"
                  ? [
                      { label: "Pedido PDV", valor: a.numero_pedido ? `#${a.numero_pedido}` : "—" },
                      { label: "Vendedor", valor: a.vendedor_nome ?? "—" },
                      { label: "Peso Neg.", valor: `${fmtNum(a.peso_negociado)} g` },
                      { label: "Criado em", valor: fmt(a.created_at) },
                    ]
                  : [
                      { label: "Pedido PDV", valor: a.numero_pedido ? `#${a.numero_pedido}` : "—" },
                      { label: "Peso Neg.", valor: `${fmtNum(a.peso_negociado)} g` },
                      { label: "Peso Final", valor: `${fmtNum(a.peso_final)} g` },
                      { label: "% Quebra", valor: `${fmtNum(a.quebra_percentual, 1)}%` },
                    ]
              }
              onClick={() => setSelected(a)}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            Nenhuma auditoria encontrada
          </p>
        )}
      </div>

      {/* Tabela desktop */}
      <div className="hidden md:block rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
              {tab === "loja"
                ? ["ID", "Pedido PDV", "Ordem", "Cliente", "Vendedor", "Peso Neg.", "Status", "Criado em", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
                  ))
                : ["ID", "Pedido PDV", "Ordem", "Ourives", "Peso Neg.", "Peso Final", "% Quebra", "Status", "Criado em", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
                  ))
              }
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={tab === "loja" ? 9 : 10} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>
                  Nenhuma auditoria encontrada
                </td>
              </tr>
            )}
            {filtered.map((a, i) => (
              <tr key={a.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{a.id}</td>
                <td className="px-4 py-3 font-mono text-[12px] font-semibold" style={{ color: a.numero_pedido ? C.esmeralda : "#D1D5DB" }}>
                  {a.numero_pedido ? `#${a.numero_pedido}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/ordens/${a.ordem_id}`}
                    className="font-medium hover:underline"
                    style={{ color: "#184036" }}
                    title="Ver detalhes da ordem"
                  >
                    {a.numero_ordem ?? `#${a.ordem_id}`}
                  </Link>
                </td>
                {tab === "loja" ? (
                  <>
                    <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{a.cliente_nome ?? "—"}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{a.vendedor_nome ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>{fmtNum(a.peso_negociado)} g</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{a.ourives_nome ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>{fmtNum(a.peso_negociado)} g</td>
                    <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>{fmtNum(a.peso_final)} g</td>
                    <td className="px-4 py-3"><QuebraChip pct={a.quebra_percentual} /></td>
                  </>
                )}
                <td className="px-4 py-3"><SituacaoBadge situacao={a.situacao} /></td>
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(a.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setSelected(a)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                    style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                  >
                    {["pendente", "em_analise", "pendenciado"].includes(a.situacao) ? "Analisar" : "Ver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="text-[11px] mt-2 text-right" style={{ color: "#9CA3AF" }}>
          {filtered.length} auditoria{filtered.length !== 1 ? "s" : ""} exibida{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {selected && (
        <AuditoriaModal
          aud={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { setSelected(null); refresh(); }}
        />
      )}
    </div>
  );
}
