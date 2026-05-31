"use client";

import { useState, useEffect } from "react";
import {
  CircleDollarSign, Loader2, Plus, X, CheckCircle, AlertTriangle,
  TrendingUp, ExternalLink, Image, Clock, Truck, User, MapPin,
  Ban, ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, STATUS_COLORS } from "@/lib/cofre-ouro-status";

const C = {
  esmeralda: "#184036", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7",
  dourado: "#DB9864", ambar: "#D97706", creme: "#F3EADA",
  cinza: "#6B7280", verde: "#059669", vermelho: "#DC2626",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDatetime = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_LABEL_MAP = STATUS_LABEL;

const DESTINO_LABEL: Record<string, string> = {
  alisson: "Alisson (direta)",
  fabrica: "Fábrica",
  service: "Service",
};

const EVENTO_ICON: Record<string, any> = {
  venda_confirmada:    TrendingUp,
  baixa_iniciada:      Truck,
  baixa_direta_alisson: CheckCircle,
  protocolo_criado:    Plus,
  recebido_confirmado: CheckCircle,
};

const EVENTO_LABEL: Record<string, string> = {
  venda_confirmada:    "Venda confirmada",
  baixa_iniciada:      "Baixa iniciada",
  baixa_direta_alisson: "Baixa direta (Alisson)",
  protocolo_criado:    "Protocolo criado",
  recebido_confirmado: "Recebido e confirmado",
};

interface CofreDisponivel {
  total_transacoes: number;
  total_gramas: number;
  disponivel_gramas: number;
  total_valor_brl: number;
  preco_medio_grama: number;
}

interface Baixa {
  id: number;
  gramas: number;
  destino: string;
  status: string;
  protocolo_id: number | null;
  realizado_nome: string | null;
  transportador_nome: string | null;
  recebedor_nome: string | null;
  confirmado_em: string | null;
  foto_comprovacao: string | null;
  obs: string | null;
  created_at: string;
  updated_at: string;
}

interface Rastreio {
  id: number;
  pagamento_id: number | null;
  baixa_id: number | null;
  protocolo_id: number | null;
  evento: string;
  gramas: number | null;
  origem_nome: string | null;
  destino_nome: string | null;
  observacao: string | null;
  created_at: string;
}

export default function CofreClient() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cofre, setCofre] = useState<CofreDisponivel | null>(null);
  const [baixas, setBaixas] = useState<Baixa[]>([]);
  const [userRole, setUserRole] = useState<string>("");

  // Modal Dar Baixa
  const [showModal, setShowModal] = useState(false);
  const [gramas, setGramas] = useState("");
  const [destino, setDestino] = useState<"alisson" | "fabrica" | "service">("fabrica");
  const [transportadorId, setTransportadorId] = useState("");
  const [transportadorNome, setTransportadorNome] = useState("");
  const [obs, setObs] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  // Expansão de rastreio
  const [baixaExpandida, setBaixaExpandida] = useState<number | null>(null);
  const [rastreios, setRastreios] = useState<Record<number, Rastreio[]>>({});
  const [loadingRastreio, setLoadingRastreio] = useState(false);

  // Foto modal
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  useEffect(() => {
    setErro(null);
    setLoading(true);

    const supabase = createClient();
    const userPromise = supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return "";
      const res = await fetch(`/api/user/role?user_id=${user.id}`);
      const d = await res.json().catch(() => ({}));
      return d.role ?? "";
    });

    Promise.all([
      fetch("/api/financeiro/cofre-ouro/disponivel").then(r => r.ok ? r.json() : null),
      fetch("/api/financeiro/cofre-ouro/baixas").then(r => r.ok ? r.json() : []),
      userPromise,
    ]).then(([c, b, role]) => {
      setCofre(c);
      setBaixas(b);
      setUserRole(role);
    }).catch(() => setErro("Erro ao carregar dados do cofre"))
    .finally(() => setLoading(false));
  }, []);

  async function carregarRastreio(baixaId: number) {
    if (rastreios[baixaId]) return;
    setLoadingRastreio(true);
    try {
      const res = await fetch(`/api/financeiro/cofre-ouro/rastreios?baixa_id=${baixaId}`);
      const data = await res.json();
      setRastreios(prev => ({ ...prev, [baixaId]: Array.isArray(data) ? data : [] }));
    } catch { }
    setLoadingRastreio(false);
  }

  async function handleDarBaixa() {
    setErroModal(null);
    const g = parseFloat(gramas.replace(",", "."));
    if (!g || g <= 0) { setErroModal("Informe um peso válido"); return; }
    if (cofre && g > cofre.disponivel_gramas) { setErroModal(`Máximo disponível: ${cofre.disponivel_gramas.toFixed(3)}g`); return; }
    setCriando(true);

    try {
      const res = await fetch("/api/financeiro/cofre-ouro/baixas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gramas: g,
          destino,
          transportador_id: transportadorId || undefined,
          transportador_nome: transportadorNome || undefined,
          obs: obs || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErroModal(data.error ?? "Erro ao criar baixa"); setCriando(false); return; }

      // Recarregar dados
      const [c, b] = await Promise.all([
        fetch("/api/financeiro/cofre-ouro/disponivel").then(r => r.ok ? r.json() : null),
        fetch("/api/financeiro/cofre-ouro/baixas").then(r => r.ok ? r.json() : []),
      ]);
      setCofre(c);
      setBaixas(b);
      setShowModal(false);
      setGramas("");
      setDestino("fabrica");
      setTransportadorId("");
      setTransportadorNome("");
      setObs("");
    } catch { setErroModal("Erro de rede"); }
    setCriando(false);
  }

  async function handleCancelarBaixa(id: number) {
    if (!confirm("Cancelar esta baixa?")) return;
    try {
      await fetch(`/api/financeiro/cofre-ouro/baixas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cancelado" }),
      });
      setBaixas(prev => prev.map(b => b.id === id ? { ...b, status: "cancelado" } : b));
    } catch { }
  }

  const podeDarBaixa = ["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja"].includes(userRole);
  const podeCancelar = ["admin", "desenvolvedor"].includes(userRole);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin" style={{ color: C.cinza }} />
      </div>
    );
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 rounded-full" style={{ backgroundColor: C.dourado }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "#1A1A1A" }}>
              Cofre de Ouro
            </h1>
            <p className="text-xs mt-0.5" style={{ color: C.cinza }}>
              Gestão de estoque de ouro recebido em pagamentos
            </p>
          </div>
        </div>
        <a href="/financeiro" className="text-xs font-medium flex items-center gap-1 px-3 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder, color: C.cinza }}>
          <ArrowRight size={12} /> Voltar ao Financeiro
        </a>
      </div>

      {erro && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
          <AlertTriangle size={14} /> {erro}
        </div>
      )}

      {/* Cards de Saldo */}
      {cofre && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "#D97706", backgroundColor: "#FFFBEB" }}>
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#B45309" }}>Disponível</p>
            <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: "#92400E" }}>
              {cofre.disponivel_gramas.toFixed(3)}g
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Total Recebido</p>
            <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: "#1A1A1A" }}>
              {cofre.total_gramas.toFixed(3)}g
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Valor Total</p>
            <p className="text-xl font-bold tabular-nums mt-1" style={{ color: C.verde }}>
              {fmt(cofre.total_valor_brl)}
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Preço Médio/g</p>
            <p className="text-xl font-bold tabular-nums mt-1" style={{ color: C.dourado }}>
              {fmt(cofre.preco_medio_grama)}
            </p>
          </div>
        </div>
      )}

      {/* Botão Dar Baixa */}
      {podeDarBaixa && (
        <div className="flex justify-end">
          <button
            onClick={() => { setErroModal(null); setGramas(cofre ? String(cofre.disponivel_gramas) : ""); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} /> Dar Baixa
          </button>
        </div>
      )}

      {/* Tabela de Baixas */}
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>
          Histórico de Baixas ({baixas.length})
        </p>
        {baixas.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: C.cremeBorder }}>
            <CircleDollarSign size={32} style={{ color: C.cinza }} className="mx-auto mb-2" />
            <p className="text-sm" style={{ color: C.cinza }}>Nenhuma baixa registrada.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {baixas.map(b => {
              const label = STATUS_LABEL[b.status] ?? b.status;
              const col = STATUS_COLORS[b.status] ?? { bg: C.cremeBg, text: C.cinza };
              const expanded = baixaExpandida === b.id;
              return (
                <div key={b.id} className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                  <div
                    className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                    style={{ backgroundColor: C.cremeBg }}
                    onClick={() => {
                      if (expanded) { setBaixaExpandida(null); return; }
                      setBaixaExpandida(b.id);
                      carregarRastreio(b.id);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold tabular-nums" style={{ color: C.dourado }}>
                          {Number(b.gramas).toFixed(3)}g
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: col.bg, color: col.text }}>{label}</span>
                      </div>
                      <span className="text-xs" style={{ color: C.cinza }}>{DESTINO_LABEL[b.destino] ?? b.destino}</span>
                      <span className="text-xs" style={{ color: C.cinza }}>· {fmtDatetime(b.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.protocolo_id && (
                        <a href={`/protocolo`}
                          className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border"
                          style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={10} /> Protocolo #{b.protocolo_id}
                        </a>
                      )}
                      {podeCancelar && b.status !== "cancelado" && b.status !== "concluido" && (
                        <button
                          onClick={e => { e.stopPropagation(); handleCancelarBaixa(b.id); }}
                          className="text-xs px-2 py-1 rounded-lg border font-medium"
                          style={{ borderColor: C.vermelho, color: C.vermelho }}
                        >
                          <Ban size={11} />
                        </button>
                      )}
                      <ChevronDown expanded={expanded} />
                    </div>
                  </div>

                  {/* Expanded: rastreio timeline */}
                  {expanded && (
                    <div className="px-4 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      {b.obs && (
                        <p className="text-xs mb-3 italic" style={{ color: C.cinza }}>Obs: {b.obs}</p>
                      )}
                      <div className="flex items-center gap-4 flex-wrap text-xs mb-3">
                        {b.realizado_nome && <span style={{ color: "#374151" }}><User size={11} className="inline mr-1" />{b.realizado_nome}</span>}
                        {b.transportador_nome && <span style={{ color: "#374151" }}><Truck size={11} className="inline mr-1" />Transportador: {b.transportador_nome}</span>}
                        {b.recebedor_nome && <span style={{ color: "#374151" }}><CheckCircle size={11} className="inline mr-1" />Recebedor: {b.recebedor_nome}</span>}
                        {b.foto_comprovacao && (
                          <button
                            onClick={() => setFotoModal(b.foto_comprovacao!)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium hover:opacity-80"
                            style={{ borderColor: C.dourado, color: "#92400E", backgroundColor: "white" }}
                          >
                            <Image size={11} /> Comprovação
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.cinza }}>Rastreio</p>
                      {loadingRastreio && !rastreios[b.id] ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 size={12} className="animate-spin" style={{ color: C.cinza }} />
                          <span className="text-xs" style={{ color: C.cinza }}>Carregando...</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(rastreios[b.id] ?? []).length === 0 ? (
                            <p className="text-xs" style={{ color: C.cinza }}>Nenhum evento registrado.</p>
                          ) : (
                            (rastreios[b.id] ?? []).map(r => {
                              const Icon = EVENTO_ICON[r.evento] ?? Clock;
                              return (
                                <div key={r.id} className="flex items-start gap-3">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                    style={{ backgroundColor: "#FEF3C7" }}>
                                    <Icon size={10} style={{ color: "#92400E" }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium" style={{ color: "#374151" }}>
                                      {EVENTO_LABEL[r.evento] ?? r.evento}
                                    </p>
                                    <p className="text-[11px]" style={{ color: C.cinza }}>
                                      {r.gramas ? `${Number(r.gramas).toFixed(3)}g · ` : ""}
                                      {r.observacao ?? ""}
                                      · {fmtDatetime(r.created_at)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Dar Baixa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !criando && setShowModal(false)}>
          <div className="bg-white rounded-2xl border w-full max-w-md p-6 space-y-4" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Dar Baixa no Cofre de Ouro</h3>

            {/* Gramas */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Gramas</label>
              <input
                value={gramas} onChange={e => setGramas(e.target.value)}
                placeholder="0.000"
                type="number" step="0.001"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none tabular-nums"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
              {cofre && <p className="text-[11px] mt-1" style={{ color: C.cinza }}>Disponível: {cofre.disponivel_gramas.toFixed(3)}g</p>}
            </div>

            {/* Destino */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Destino</label>
              <div className="grid grid-cols-3 gap-2">
                {(["alisson", "fabrica", "service"] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDestino(d)}
                    className="px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: destino === d ? "#FEF3C7" : "white",
                      borderColor: destino === d ? "#D97706" : C.cremeBorder,
                      color: destino === d ? "#92400E" : C.cinza,
                    }}
                  >
                    {DESTINO_LABEL[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Transportador (apenas para fabrica/service) */}
            {destino !== "alisson" && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>
                  Transportador (quem está levando)
                </label>
                <input
                  value={transportadorNome}
                  onChange={e => setTransportadorNome(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                />
              </div>
            )}

            {/* Observação */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Observação (opcional)</label>
              <input
                value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Motivo da baixa"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>

            {erroModal && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
                <AlertTriangle size={12} /> {erroModal}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)} disabled={criando}
                className="px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.cinza }}>Cancelar</button>
              <button onClick={handleDarBaixa} disabled={criando}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                {criando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {criando ? "Criando..." : destino === "alisson" ? "Confirmar Baixa" : "Criar Baixa + Protocolo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foto modal */}
      {fotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setFotoModal(null)}>
          <div className="bg-white rounded-2xl border overflow-hidden max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <p className="text-sm font-semibold">Foto de Comprovação</p>
              <button onClick={() => setFotoModal(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X size={15} style={{ color: "#9CA3AF" }} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoModal.startsWith("http") ? fotoModal : `/api/storage?path=${encodeURIComponent(fotoModal)}`}
              alt="Comprovação"
              className="w-full object-contain max-h-[70vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDown({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: C.cinza, transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
