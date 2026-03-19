"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  X, Plus, ArrowRight, LogOut, Loader2, Image as ImageIcon,
  Package, ArrowLeftRight, CheckSquare, RefreshCw,
} from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { formatPeso } from "@/lib/formatters";
import ApontamentoPCPModal from "@/components/forms/ApontamentoPCPModal";
import TransferenciaPCPModal from "@/components/forms/TransferenciaPCPModal";
import SaidaOrdemModal from "@/components/forms/SaidaOrdemModal";
import type { EventoHistorico } from "@/app/api/pcp/[id]/historico/route";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  dourado: "#DB9864",
};

const ETAPA_LABEL: Record<string, string> = {
  novas_ordens: "Novas Ordens",
  pendencia:    "Pendência",
  aguardando:   "Aguardando",
  em_andamento: "Em Andamento",
  concluido:    "Concluído",
  cancelado:    "Cancelado",
};

// Metadados visuais por tipo de evento
const EVENTO_META: Record<
  EventoHistorico["tipo"],
  { label: string; bg: string; color: string }
> = {
  apontamento_distribuicao: { label: "Lote",      bg: "#EFF6FF", color: "#1D4ED8" },
  saida_distribuicao:       { label: "Saída Dist", bg: "#F5F3FF", color: "#6D28D9" },
  apontamento_pcp:          { label: "PCP",        bg: "#F0FDF4", color: "#166534" },
  transferencia:            { label: "Transf.",    bg: "#FFFBEB", color: "#92400E" },
  saida_pcp:                { label: "Saída PCP",  bg: "#ECFDF5", color: "#065F46" },
};

interface PCPDetalhe {
  id: number;
  etapas_cod: string;
  ordem_id: number;
  numero_ordem: string | null;
  cliente_nome: string | null;
  vendedor_nome: string | null;
  peso_metal_negociado: number | null;
  peso_final: number | null;
  metal_externo: number | null;
  pmc: number | null;
  deposito_id: number | null;
  setor_id: number | null;
  deposito_nome: string | null;
  setor_nome: string | null;
  dist_ouro_real: number | null;
  dist_pedras_qtd: number | null;
  dist_pedras_g: number | null;
  dist_quebra: number | null;
}

interface ResumoApontamento {
  tipo_id: number;
  tipo_nome: string;
  total_apontamentos: number;
  total_qtd: number;
  peso_metal: number;
  peso_pedras: number;
  qtd_pedras: number;
  categoria_id: number;
}

interface TotaisResumo {
  metal_entrada: number;
  metal_retorno: number;
  metal_liquido: number;
  pedras_qtd: number;
  pedras_peso: number;
  pedras_entrada_qtd: number;
  pedras_retorno_qtd: number;
}

type SubModal = "apontamento" | "transferencia" | "saida" | null;

interface Props {
  pcp: { id: number; ordem_id: number; etapas: string; deposito_id?: number; setor_id?: number };
  onClose: () => void;
  onSuccess: () => void;
}

export default function PCPDetalheModal({ pcp, onClose, onSuccess }: Props) {
  const [detalhe, setDetalhe]           = useState<PCPDetalhe | null>(null);
  const [historico, setHistorico]       = useState<EventoHistorico[]>([]);
  const [resumo, setResumo]             = useState<ResumoApontamento[]>([]);
  const [totais, setTotais]             = useState<TotaisResumo | null>(null);
  const [loadingData, setLoadingData]   = useState(true);
  const [loadingHist, setLoadingHist]   = useState(false);
  // fotoUrls: keyed by foto_balanca path (bucket: apontamento-fotos)
  const [fotoUrls, setFotoUrls]         = useState<Record<string, string>>({});
  const [subModal, setSubModal]         = useState<SubModal>(null);

  const loadHistorico = useCallback(async () => {
    setLoadingHist(true);
    try {
      const [resHist, resResumo] = await Promise.all([
        fetch(`/api/pcp/${pcp.id}/historico`),
        fetch(`/api/pcp/${pcp.id}/resumo`),
      ]);

      const histData = await resHist.json() as { eventos: EventoHistorico[]; total: number };
      const lista = Array.isArray(histData?.eventos) ? histData.eventos : [];
      setHistorico(lista);

      const resumoData = await resResumo.json() as { resumo: ResumoApontamento[]; totais: TotaisResumo };
      if (resumoData?.resumo) {
        setResumo(resumoData.resumo);
        setTotais(resumoData.totais);
      }

      // URLs públicas para eventos com foto_balanca (bucket apontamento-fotos público)
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const comFoto = lista.filter((e) => e.foto_balanca);
      if (comFoto.length > 0) {
        const urls: Record<string, string> = {};
        comFoto.forEach((e) => {
          const path = e.foto_balanca!;
          urls[path] = `${SUPABASE_URL}/storage/v1/object/public/apontamento-fotos/${path}`;
        });
        setFotoUrls(urls);
      }
    } finally {
      setLoadingHist(false);
    }
  }, [pcp.id]);

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      fetch(`/api/pcp/${pcp.id}`).then((r) => r.json()),
      loadHistorico(),
    ]).then(([det]) => {
      setDetalhe(det as PCPDetalhe);
      setLoadingData(false);
    });
  }, [pcp.id, loadHistorico]);

  const loadDetalhe = useCallback(async () => {
    const res = await fetch(`/api/pcp/${pcp.id}`);
    const det = await res.json() as PCPDetalhe;
    setDetalhe(det);
  }, [pcp.id]);

  const handleApontamentoSuccess = useCallback(async () => {
    setSubModal(null);
    await Promise.all([loadDetalhe(), loadHistorico()]);
    onSuccess();
  }, [loadDetalhe, loadHistorico, onSuccess]);

  const handleTransferirSuccess = useCallback(async () => {
    setSubModal(null);
    await Promise.all([loadDetalhe(), loadHistorico()]);
    onSuccess();
  }, [loadDetalhe, loadHistorico, onSuccess]);

  const etapaCod = detalhe?.etapas_cod ?? pcp.etapas?.toLowerCase().replace(/ /g, "_") ?? "";
  const podeApontar    = ["novas_ordens", "em_andamento"].includes(etapaCod);
  const podeTransferir = ["em_andamento", "aguardando"].includes(etapaCod);
  const podeSaida      = ["em_andamento", "aguardando"].includes(etapaCod);

  const depositoId = detalhe?.deposito_id ?? pcp.deposito_id ?? 2;
  const setorId    = detalhe?.setor_id    ?? pcp.setor_id    ?? null;

  function fmtData(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function fmtQtd(e: EventoHistorico) {
    if (e.qtd === undefined) return null;
    if (e.categoria_id === 2) {
      const un = Math.round(e.qtd);
      const gStr = e.peso_pedra ? ` · ${formatPeso(e.qtd * e.peso_pedra)}g` : "";
      return `${un} UN${gStr}`;
    }
    return `${formatPeso(e.qtd)}g`;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer lateral */}
      <div
        className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-md bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: C.cremeBorder, backgroundColor: C.esmeralda }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold" style={{ color: C.creme }}>
                {detalhe?.numero_ordem ?? `#${pcp.id}`}
              </h2>
              <Link
                href={`/ordens/${pcp.ordem_id}`}
                className="text-[11px] font-semibold px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
                style={{ backgroundColor: "#ffffff15", color: C.sage }}
                title="Ver detalhes da ordem"
                onClick={(e) => e.stopPropagation()}
              >
                Ver Ordem ↗
              </Link>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: C.sage }}>
              PCP #{pcp.id} · {ETAPA_LABEL[etapaCod] ?? etapaCod}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          >
            <X size={16} style={{ color: C.sage }} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {loadingData ? (
            <div className="flex items-center justify-center py-12" style={{ color: C.sage }}>
              <Loader2 size={18} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <>
              {/* Info da ordem */}
              <div className="px-5 py-4 space-y-2 border-b" style={{ borderColor: C.cremeBorder }}>
                {detalhe?.cliente_nome && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "#6B7280" }}>Cliente</span>
                    <span className="font-medium" style={{ color: "#111827" }}>{detalhe.cliente_nome}</span>
                  </div>
                )}
                {detalhe?.vendedor_nome && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "#6B7280" }}>Vendedor</span>
                    <span style={{ color: "#374151" }}>{detalhe.vendedor_nome}</span>
                  </div>
                )}
                {detalhe?.deposito_nome && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "#6B7280" }}>Operador atual</span>
                    <span style={{ color: "#374151" }}>
                      {detalhe.deposito_nome}{detalhe.setor_nome ? ` · ${detalhe.setor_nome}` : ""}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Peso negociado</span>
                  <span className="font-mono" style={{ color: C.dourado }}>
                    {detalhe?.peso_metal_negociado
                      ? `${Number(detalhe.peso_metal_negociado).toFixed(2)}g`
                      : "—"}
                  </span>
                </div>
                {Number(detalhe?.peso_final) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "#6B7280" }}>Peso final</span>
                    <span className="font-mono font-semibold" style={{ color: C.dourado }}>
                      {Number(detalhe!.peso_final).toFixed(2)}g
                    </span>
                  </div>
                )}
              </div>

              {/* Resumo de apontamentos */}
              {(resumo.length > 0 || Number(detalhe?.dist_ouro_real) > 0) && (
                <div className="px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                    Resumo
                  </h3>
                  <div className="space-y-1.5">
                    {/* Ouro vindo do lote (distribuição) */}
                    {Number(detalhe?.dist_ouro_real) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: "#374151" }}>🥇 Ouro do lote</span>
                        <span className="font-mono text-[12px]" style={{ color: "#1A1A1A" }}>
                          {formatPeso(Number(detalhe!.dist_ouro_real))}g
                        </span>
                      </div>
                    )}
                    {resumo.map((r) => (
                      <div key={r.tipo_id} className="flex items-center justify-between text-sm">
                        <span style={{ color: "#374151" }}>
                          {r.categoria_id === 1 ? "🥇" : r.categoria_id === 2 ? "💎" : "📝"}{" "}
                          {r.tipo_nome}
                        </span>
                        <span className="font-mono text-[12px]" style={{ color: "#1A1A1A" }}>
                          {r.categoria_id === 2
                            ? `${Math.round(r.qtd_pedras)} UN · ${formatPeso(r.peso_pedras)}g`
                            : `${formatPeso(r.peso_metal)}g`}
                          <span className="text-[10px] ml-1" style={{ color: "#9CA3AF" }}>
                            ({r.total_apontamentos})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {totais && (() => {
                    const distOuro = Number(detalhe?.dist_ouro_real ?? 0);
                    const totalMetalReal = totais.metal_liquido + distOuro;
                    return (
                      <div
                        className="mt-3 pt-3 space-y-1"
                        style={{ borderTop: `1px solid ${C.cremeBorder}` }}
                      >
                        <div className="flex justify-between text-sm font-semibold">
                          <span style={{ color: "#374151" }}>Total Metal</span>
                          <span className="font-mono" style={{ color: C.esmeralda }}>
                            {formatPeso(totalMetalReal)}g
                            {(totais.metal_retorno > 0 || distOuro > 0) && (
                              <span className="text-[10px] font-normal ml-1" style={{ color: "#9CA3AF" }}>
                                ({distOuro > 0 ? `${formatPeso(distOuro)}+` : ""}{formatPeso(totais.metal_entrada)}g
                                {totais.metal_retorno > 0 ? ` − ${formatPeso(totais.metal_retorno)}g` : ""})
                              </span>
                            )}
                          </span>
                        </div>
                        {(totais.pedras_entrada_qtd > 0 || totais.pedras_retorno_qtd > 0) && (
                          <div className="flex justify-between text-sm font-semibold">
                            <span style={{ color: "#374151" }}>Total Pedras</span>
                            <span className="font-mono" style={{ color: "#7C3AED" }}>
                              {Math.round(totais.pedras_qtd)} UN · {formatPeso(totais.pedras_peso)}g
                              {totais.pedras_retorno_qtd > 0 && (
                                <span className="text-[10px] font-normal ml-1" style={{ color: "#9CA3AF" }}>
                                  ({Math.round(totais.pedras_entrada_qtd)} ent − {Math.round(totais.pedras_retorno_qtd)} ret)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}


              {/* ──── HISTÓRICO (timeline) ──── */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                    Histórico ({historico.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    {podeApontar && (
                      <button
                        onClick={() => setSubModal("apontamento")}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ backgroundColor: C.esmeralda + "15", color: C.esmeralda }}
                      >
                        <Plus size={11} strokeWidth={2.5} /> Apontar
                      </button>
                    )}
                    <button
                      onClick={loadHistorico}
                      disabled={loadingHist}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px]"
                      style={{ color: "#9CA3AF" }}
                      title="Atualizar histórico"
                    >
                      <RefreshCw size={11} className={loadingHist ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {loadingHist && historico.length === 0 ? (
                  <div className="flex items-center gap-2 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={12} className="animate-spin" /> Carregando histórico...
                  </div>
                ) : historico.length === 0 ? (
                  <p className="text-[13px] py-2" style={{ color: "#9CA3AF" }}>
                    Nenhum registro no histórico.
                  </p>
                ) : (
                  <div className="space-y-0">
                    {historico.map((evento, idx) => {
                      const meta = EVENTO_META[evento.tipo];
                      const qtdStr = fmtQtd(evento);

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-3 py-3"
                          style={{
                            borderBottom: idx < historico.length - 1 ? `1px solid ${C.cremeBorder}` : undefined,
                          }}
                        >
                          {/* Ícone por tipo */}
                          <div className="flex-shrink-0 pt-0.5">
                            {evento.tipo === "apontamento_distribuicao" && (
                              <Package size={14} style={{ color: meta.color }} />
                            )}
                            {evento.tipo === "saida_distribuicao" && (
                              <LogOut size={14} style={{ color: meta.color }} />
                            )}
                            {evento.tipo === "apontamento_pcp" && (
                              <Plus size={14} style={{ color: meta.color }} />
                            )}
                            {evento.tipo === "transferencia" && (
                              <ArrowLeftRight size={14} style={{ color: meta.color }} />
                            )}
                            {evento.tipo === "saida_pcp" && (
                              <CheckSquare size={14} style={{ color: meta.color }} />
                            )}
                          </div>

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0">
                            {/* Linha 1: tipo + badge + valor */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[12px] font-semibold truncate" style={{ color: "#111827" }}>
                                  {evento.tipo === "apontamento_distribuicao" && (evento.tipo_nome ?? "Apontamento")}
                                  {evento.tipo === "saida_distribuicao" && "Saída Distribuição"}
                                  {evento.tipo === "apontamento_pcp" && (evento.tipo_nome ?? "Apontamento")}
                                  {evento.tipo === "transferencia" && "Transferência"}
                                  {evento.tipo === "saida_pcp" && "Saída PCP"}
                                </span>
                                <span
                                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: meta.bg, color: meta.color }}
                                >
                                  {meta.label}
                                  {evento.lote_id ? ` #${evento.lote_id}` : ""}
                                </span>
                              </div>
                              {/* Valor à direita */}
                              {qtdStr && (
                                <span className="font-mono text-[12px] font-bold flex-shrink-0" style={{ color: C.dourado }}>
                                  {qtdStr}
                                </span>
                              )}
                            </div>

                            {/* Linha 2: insumo / detalhes */}
                            {evento.tipo === "apontamento_distribuicao" || evento.tipo === "apontamento_pcp" ? (
                              <>
                                {evento.insumo_nome && (
                                  <p className="text-[11px] mt-0.5" style={{ color: "#374151" }}>
                                    {evento.insumo_nome}
                                    {evento.deposito_nome ? ` · ${evento.deposito_nome}` : ""}
                                  </p>
                                )}
                              </>
                            ) : evento.tipo === "saida_distribuicao" ? (
                              <p className="text-[11px] mt-0.5" style={{ color: "#374151" }}>
                                {evento.peso_bruto != null ? `Bruto ${formatPeso(evento.peso_bruto)}g` : ""}
                                {evento.peso_pedras != null && evento.peso_pedras > 0
                                  ? ` · Pedras ${formatPeso(evento.peso_pedras)}g`
                                  : ""}
                                {evento.peso_ouro_real != null ? ` · Ouro ${formatPeso(evento.peso_ouro_real)}g` : ""}
                              </p>
                            ) : evento.tipo === "transferencia" ? (
                              <p className="text-[11px] mt-0.5" style={{ color: "#374151" }}>
                                → {evento.destino_nome ?? "—"}
                                {evento.obs ? ` · ${evento.obs}` : ""}
                              </p>
                            ) : evento.tipo === "saida_pcp" ? (
                              <p className="text-[11px] mt-0.5" style={{ color: "#374151" }}>
                                {evento.peso_final != null ? `Final ${formatPeso(evento.peso_final)}g` : ""}
                                {evento.pmc != null ? ` · PMC ${formatPeso(evento.pmc)}g` : ""}
                                {evento.quebra != null
                                  ? ` · Quebra ${evento.quebra > 0 ? "+" : ""}${formatPeso(evento.quebra)}g`
                                  : ""}
                              </p>
                            ) : null}

                            {/* Linha 3: usuário + data + foto */}
                            <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-1.5">
                                {evento.criado_por_nome && (
                                  <UserAvatar
                                    nome={evento.criado_por_nome}
                                    fotoUrl={evento.criado_por_foto ?? null}
                                    size={16}
                                  />
                                )}
                                <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                                  {evento.criado_por_nome ? `${evento.criado_por_nome} · ` : ""}
                                  {fmtData(evento.data)}
                                </span>
                              </div>
                              {evento.foto_balanca && fotoUrls[evento.foto_balanca] && (
                                <a
                                  href={fotoUrls[evento.foto_balanca]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded"
                                  style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                                >
                                  <ImageIcon size={10} /> Ver foto
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — ações */}
        <div
          className="px-5 py-4 border-t flex gap-2"
          style={{ borderColor: C.cremeBorder }}
        >
          {podeApontar && (
            <button
              onClick={() => setSubModal("apontamento")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ backgroundColor: C.esmeralda + "15", color: C.esmeralda }}
            >
              <Plus size={13} strokeWidth={2.5} /> Apontar
            </button>
          )}
          {podeTransferir && (
            <button
              onClick={() => setSubModal("transferencia")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ backgroundColor: "#0EA5E915", color: "#0284C7" }}
            >
              <ArrowRight size={13} strokeWidth={2.5} /> Transferir
            </button>
          )}
          {podeSaida && (
            <button
              onClick={() => setSubModal("saida")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ backgroundColor: "#F59E0B15", color: "#B45309" }}
            >
              <LogOut size={13} strokeWidth={2.5} /> Saída
            </button>
          )}
        </div>
      </div>

      {/* Sub-modais */}
      {subModal === "apontamento" && (
        <ApontamentoPCPModal
          isOpen
          onClose={() => setSubModal(null)}
          pcpId={pcp.id}
          ordemId={pcp.ordem_id}
          depositoId={depositoId}
          setorId={setorId}
          onSuccess={handleApontamentoSuccess}
        />
      )}
      {subModal === "transferencia" && (
        <TransferenciaPCPModal
          isOpen
          onClose={() => setSubModal(null)}
          pcpId={pcp.id}
          ordemId={pcp.ordem_id}
          depositoId={depositoId}
          setorId={setorId}
          onSuccess={handleTransferirSuccess}
        />
      )}
      {subModal === "saida" && (
        <SaidaOrdemModal
          isOpen
          onClose={() => setSubModal(null)}
          pcpId={pcp.id}
          ordemId={pcp.ordem_id}
          depositoId={depositoId}
          onSuccess={() => { setSubModal(null); onSuccess(); onClose(); }}
        />
      )}
    </>
  );
}
