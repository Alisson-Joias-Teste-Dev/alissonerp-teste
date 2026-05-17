"use client";

import { useState, useCallback, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, CheckCircle2, Clock, Package, ChevronDown } from "lucide-react";
import NovaProtocoloModal from "@/components/forms/NovaProtocoloModal";
import ConcluirProtocoloModal from "@/components/forms/ConcluirProtocoloModal";
import { MobileCard } from "@/components/ui/MobileCard";
import { getPublicUrl } from "@/lib/storage-url";

const TIPOS_PROTOCOLO_DROPDOWN = [
  { tipo: "fabrica", label: "Fábrica", emoji: "🏭" },
  { tipo: "service", label: "Service", emoji: "🔧" },
];

function resolveStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // getPublicUrl roteia bucket privado (protocolo-fotos) pelo proxy /api/storage/...
  return getPublicUrl("protocolo-fotos", path);
}

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

type Tab = "ida" | "volta" | "entregas";
type Filtro = "pendentes" | "concluidos" | "todos";

interface ProtocoloRow {
  id: number;
  etapas: string;
  tipo_protocolo?: string | null;
  data_conclusao: string | null;
  created_at: string;
  total_ordens: number;
  criado_por_nome: string | null;
  concluido_por_nome: string | null;
  foto_criacao: string | null;
  foto_conclusao: string | null;
}

interface AprovacaoRow {
  id: number;
  etapas: string;
  ordem_id: number;
  consultora_id: number | null;
  obs: string | null;
  created_at: string;
  numero_ordem: string | null;
  consultora_nome: string | null;
}

interface EntregaRow {
  id: number;
  etapas: string;
  ordem_id: number;
  created_at: string;
  numero_ordem: string | null;
}

interface OrdemConcluida {
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_negociado: number | null;
  cliente_nome: string | null;
}

interface ProtocoloConcluido {
  protocolo_id: number;
  direcao: "ida" | "volta";
  protocolo_criado: string;
  data_conclusao: string | null;
  criado_por_nome: string | null;
  concluido_por_nome: string | null;
  foto_criacao: string | null;
  foto_conclusao: string | null;
  ordens: OrdemConcluida[];
}

interface Props {
  ida: ProtocoloRow[];
  volta: ProtocoloRow[];
  aprovacoes: AprovacaoRow[];
  entregas: EntregaRow[];
  tiposProtocoloPermitidos?: string[];
}

const TIPO_LABEL: Record<string, string> = {
  servico_venda: "Serv. Venda",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
};

function EtapaBadge({ etapa }: { etapa: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    concluido:    { label: "Concluído",    bg: "#ECFDF5", color: "#059669" },
    em_andamento: { label: "Em Andamento", bg: "#EFF6FF", color: "#2563EB" },
    pendente:     { label: "Pendente",     bg: "#FEF3C7", color: "#92400E" },
    aprovado:     { label: "Aprovado",     bg: "#ECFDF5", color: "#059669" },
    reprovado:    { label: "Reprovado",    bg: "#FEF2F2", color: "#DC2626" },
  };
  const s = cfg[etapa] ?? { label: etapa, bg: "#F3F4F6", color: "#6B7280" };
  const Icon = etapa === "concluido" || etapa === "aprovado" ? CheckCircle2 : Clock;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <Icon size={10} />
      {s.label}
    </span>
  );
}

function TipoBadge({ tipo }: { tipo?: string | null }) {
  if (!tipo) return null;
  const isService = tipo === "service";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        backgroundColor: isService ? "#FEF3C7" : "#F3F4F6",
        color: isService ? "#B45309" : "#6B7280",
      }}
    >
      {isService ? "🔧 Service" : "🏭 Fábrica"}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function ProtocoloClient({ ida, volta, tiposProtocoloPermitidos = [] }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ida");

  // Modal state: which direcao + which tipo was selected from dropdown
  const [modalAberto, setModalAberto] = useState<{ direcao: "ida" | "volta"; tipo: string } | null>(null);

  const [concluirProt, setConcluirProt] = useState<ProtocoloRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [concluidos, setConcluidos] = useState<ProtocoloConcluido[] | null>(null);
  const [fotoModal, setFotoModal] = useState<{ url: string; titulo: string } | null>(null);
  const [fotoZoom, setFotoZoom] = useState(1);
  const [fotoPan, setFotoPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [filtroIda, setFiltroIda] = useState<Filtro>("pendentes");
  const [filtroVolta, setFiltroVolta] = useState<Filtro>("pendentes");

  // Dropdown state para cada tab
  const [dropdownIdaAberto, setDropdownIdaAberto] = useState(false);
  const [dropdownVoltaAberto, setDropdownVoltaAberto] = useState(false);
  const dropdownIdaRef  = useRef<HTMLDivElement>(null);
  const dropdownVoltaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownIdaRef.current && !dropdownIdaRef.current.contains(e.target as Node))
        setDropdownIdaAberto(false);
      if (dropdownVoltaRef.current && !dropdownVoltaRef.current.contains(e.target as Node))
        setDropdownVoltaAberto(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function abrirModal(direcao: "ida" | "volta", tipo: string) {
    setDropdownIdaAberto(false);
    setDropdownVoltaAberto(false);
    setModalAberto({ direcao, tipo });
  }

  const podeNovProtocolo = tiposProtocoloPermitidos.length > 0;
  const dropdownAberto  = tab === "ida" ? dropdownIdaAberto  : dropdownVoltaAberto;
  const setDropdown     = tab === "ida" ? setDropdownIdaAberto : setDropdownVoltaAberto;
  const dropdownRef     = tab === "ida" ? dropdownIdaRef      : dropdownVoltaRef;

  const abrirFotoModal = (url: string | null | undefined, titulo: string) => {
    if (url) {
      setFotoModal({ url, titulo });
      setFotoZoom(1);
      setFotoPan({ x: 0, y: 0 });
    }
  };

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  useEffect(() => {
    if (tab !== "entregas") return;
    setConcluidos(null);
    fetch("/api/protocolo/concluidos")
      .then((r) => r.json())
      .then((data) => setConcluidos(Array.isArray(data) ? data : []))
      .catch(() => setConcluidos([]));
  }, [tab]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "ida",      label: "Ida",      count: ida.length },
    { key: "volta",    label: "Volta",    count: volta.length },
    { key: "entregas", label: "Entregas", count: concluidos?.length ?? 0 },
  ];

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Protocolo
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Transporte Loja ↔ Fábrica
          </p>
        </div>
        {(tab === "ida" || tab === "volta") && podeNovProtocolo && (
          <div className="relative" ref={dropdownRef}>
            {tiposProtocoloPermitidos.length === 1 ? (
              /* Só 1 tipo permitido → botão direto */
              <button
                onClick={() => abrirModal(tab, tiposProtocoloPermitidos[0])}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                <Plus size={15} />
                Novo Protocolo {tab === "ida" ? "Ida" : "Volta"}
              </button>
            ) : (
              /* Múltiplos tipos → dropdown */
              <>
                <button
                  onClick={() => setDropdown((v) => !v)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  <Plus size={15} />
                  Novo Protocolo {tab === "ida" ? "Ida" : "Volta"}
                  <ChevronDown size={13} className={`transition-transform ${dropdownAberto ? "rotate-180" : ""}`} />
                </button>
                {dropdownAberto && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-30 bg-white rounded-xl shadow-lg border overflow-hidden min-w-[170px]"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {TIPOS_PROTOCOLO_DROPDOWN.filter((t) => tiposProtocoloPermitidos.includes(t.tipo)).map((t) => (
                      <button
                        key={t.tipo}
                        onClick={() => abrirModal(tab, t.tipo)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left border-b last:border-0"
                        style={{ borderColor: "#F3EADA", color: "#1A1A1A" }}
                      >
                        <span>{t.emoji}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 rounded-lg p-0.5 mb-5 w-fit" style={{ backgroundColor: C.creme }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            style={{
              backgroundColor: tab === t.key ? C.esmeralda : "transparent",
              color: tab === t.key ? C.creme : "#6B7280",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: tab === t.key ? "#ffffff30" : "#18403620",
                  color: tab === t.key ? C.creme : C.esmeralda,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs — mantém visível durante refresh (isPending) */}
      <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isPending ? "none" : undefined }}>

      {/* Tab: Ida */}
      {tab === "ida" && (
        <ProtocoloTable
          rows={ida}
          direcao="ida"
          onConcluir={(row) => setConcluirProt(row)}
          onAbrirFoto={abrirFotoModal}
          filtro={filtroIda}
          onFiltroChange={setFiltroIda}
        />
      )}

      {/* Tab: Volta */}
      {tab === "volta" && (
        <ProtocoloTable
          rows={volta}
          direcao="volta"
          onConcluir={(row) => setConcluirProt(row)}
          onAbrirFoto={abrirFotoModal}
          filtro={filtroVolta}
          onFiltroChange={setFiltroVolta}
        />
      )}

      {/* Tab: Entregas — protocolos concluídos com ordens */}
      {tab === "entregas" && (
        <div className="space-y-4">
          {concluidos === null && (
            <p className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Carregando...</p>
          )}
          {concluidos !== null && concluidos.length === 0 && (
            <p className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhum protocolo concluído.</p>
          )}
          {concluidos?.map((p) => (
            <div key={p.protocolo_id} className="rounded-xl border bg-white" style={{ borderColor: C.cremeBorder }}>
              {/* Cabeçalho do protocolo */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-sm" style={{ color: C.esmeralda }}>
                    Protocolo #{p.protocolo_id}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}>
                    {p.direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}
                  </span>
                </div>
                <EtapaBadge etapa="concluido" />
              </div>

              {/* Responsáveis + data + fotos */}
              <div className="px-4 py-2 border-b" style={{ borderColor: C.cremeBorder }}>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2" style={{ color: "#6B7280" }}>
                  {p.criado_por_nome && <span>Entregue por: <span style={{ color: "#374151" }}>{p.criado_por_nome}</span></span>}
                  {p.concluido_por_nome && <span>Recebido por: <span style={{ color: "#374151" }}>{p.concluido_por_nome}</span></span>}
                  <span>Concluído em: <span style={{ color: "#374151" }}>{fmt(p.data_conclusao)}</span></span>
                </div>
                {(resolveStorageUrl(p.foto_criacao) || resolveStorageUrl(p.foto_conclusao)) && (
                  <div className="flex gap-3">
                    {resolveStorageUrl(p.foto_criacao) && (
                      <div>
                        <span className="text-[10px] block mb-1" style={{ color: "#9CA3AF" }}>Foto Criação</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveStorageUrl(p.foto_criacao)!}
                          alt="Foto criação"
                          className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => abrirFotoModal(resolveStorageUrl(p.foto_criacao), "Foto de Criação")}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    )}
                    {resolveStorageUrl(p.foto_conclusao) && (
                      <div>
                        <span className="text-[10px] block mb-1" style={{ color: "#9CA3AF" }}>Foto Conclusão</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveStorageUrl(p.foto_conclusao)!}
                          alt="Foto conclusão"
                          className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => abrirFotoModal(resolveStorageUrl(p.foto_conclusao), "Foto de Conclusão")}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ordens */}
              {p.ordens.length === 0 ? (
                <div className="px-4 py-3 flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                  <Package size={12} /> Sem ordens vinculadas
                </div>
              ) : (
                <div>
                  {p.ordens.map((o, i) => (
                    <div
                      key={o.ordem_id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                      style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/ordens/${o.ordem_id}`}
                          className="font-mono font-semibold hover:underline"
                          style={{ color: "#184036" }}
                          title="Ver detalhes da ordem"
                        >
                          {o.numero_ordem ?? `#${o.ordem_id}`}
                        </Link>
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          {o.tipo_ordem ? (TIPO_LABEL[o.tipo_ordem] ?? o.tipo_ordem) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs" style={{ color: "#374151" }}>{o.cliente_nome ?? "—"}</span>
                        <span className="font-mono text-xs" style={{ color: "#9CA3AF" }}>
                          {o.peso_negociado ? `${o.peso_negociado}g` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </div>{/* fim do wrapper isPending */}

      {/* Modal novo protocolo — tipo vem do dropdown */}
      {modalAberto && (
        <NovaProtocoloModal
          isOpen={true}
          onClose={() => setModalAberto(null)}
          direcao={modalAberto.direcao}
          tipoProtocolo={modalAberto.tipo}
          onSuccess={() => { setModalAberto(null); refresh(); }}
        />
      )}
      {concluirProt && (
        <ConcluirProtocoloModal
          isOpen={true}
          onClose={() => setConcluirProt(null)}
          protocoloId={concluirProt.id}
          direcao={tab === "ida" ? "ida" : "volta"}
          totalOrdens={concluirProt.total_ordens}
          onSuccess={() => { setConcluirProt(null); refresh(); }}
        />
      )}

      {/* Modal foto ampliada com zoom */}
      {fotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)" }}
          onClick={() => setFotoModal(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* Header: título + controles de zoom */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm" style={{ color: "#fff" }}>{fotoModal.titulo}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setFotoZoom(z => Math.max(1, z - 0.5)); setFotoPan({ x: 0, y: 0 }); }}
                  disabled={fotoZoom <= 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }}
                >
                  −
                </button>
                <span className="text-xs min-w-[3rem] text-center" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {Math.round(fotoZoom * 100)}%
                </span>
                <button
                  onClick={() => setFotoZoom(z => Math.min(5, z + 0.5))}
                  disabled={fotoZoom >= 5}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold disabled:opacity-30 hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }}
                >
                  +
                </button>
                {fotoZoom > 1 && (
                  <button
                    onClick={() => { setFotoZoom(1); setFotoPan({ x: 0, y: 0 }); }}
                    className="px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setFotoModal(null)}
                  className="text-2xl leading-none ml-2 hover:opacity-70 transition-opacity"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Container da imagem com zoom + pan */}
            <div
              className="overflow-hidden rounded-lg"
              style={{
                maxHeight: "75vh",
                backgroundColor: "rgba(0,0,0,0.4)",
                cursor: fotoZoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.25 : 0.25;
                setFotoZoom(z => {
                  const novoZoom = Math.max(1, Math.min(5, z + delta));
                  if (novoZoom === 1) setFotoPan({ x: 0, y: 0 });
                  return novoZoom;
                });
              }}
              onMouseDown={(e) => {
                if (fotoZoom > 1) {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX - fotoPan.x, y: e.clientY - fotoPan.y });
                }
              }}
              onMouseMove={(e) => {
                if (isDragging && fotoZoom > 1) {
                  setFotoPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
                }
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onDoubleClick={() => {
                if (fotoZoom === 1) {
                  setFotoZoom(2.5);
                } else {
                  setFotoZoom(1);
                  setFotoPan({ x: 0, y: 0 });
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoModal.url}
                alt={fotoModal.titulo}
                draggable={false}
                className="w-full h-auto object-contain select-none"
                style={{
                  maxHeight: "75vh",
                  transform: `scale(${fotoZoom}) translate(${fotoPan.x / fotoZoom}px, ${fotoPan.y / fotoZoom}px)`,
                  transition: isDragging ? "none" : "transform 0.2s ease",
                }}
              />
            </div>

            {/* Dica de uso */}
            <p className="text-xs text-center mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
              {fotoZoom === 1
                ? "Scroll ou duplo clique para zoom · Clique fora para fechar"
                : "Arraste para mover · Scroll para zoom · Duplo clique para resetar"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtocoloTable({
  rows,
  direcao,
  onConcluir,
  onAbrirFoto,
  filtro,
  onFiltroChange,
}: {
  rows: ProtocoloRow[];
  direcao: "ida" | "volta";
  onConcluir: (row: ProtocoloRow) => void;
  onAbrirFoto: (url: string | null | undefined, titulo: string) => void;
  filtro: Filtro;
  onFiltroChange: (f: Filtro) => void;
}) {
  const countPendentes = rows.filter((r) => r.etapas !== "concluido").length;
  const countConcluidos = rows.filter((r) => r.etapas === "concluido").length;

  const rowsFiltrados =
    filtro === "pendentes" ? rows.filter((r) => r.etapas !== "concluido") :
    filtro === "concluidos" ? rows.filter((r) => r.etapas === "concluido") :
    rows;

  const opFiltro: { value: Filtro; label: string; count: number }[] = [
    { value: "pendentes", label: "Pendentes", count: countPendentes },
    { value: "concluidos", label: "Concluídas", count: countConcluidos },
    { value: "todos",      label: "Todas",     count: rows.length },
  ];

  return (
    <>
      {/* Pills de filtro */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {opFiltro.map((op) => (
          <button
            key={op.value}
            onClick={() => onFiltroChange(op.value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              backgroundColor: filtro === op.value ? C.esmeralda : C.creme,
              color: filtro === op.value ? C.creme : "#6B7280",
            }}
          >
            {op.label}
            <span
              className="text-[10px] font-bold px-1 py-0.5 rounded-full"
              style={{
                backgroundColor: filtro === op.value ? "rgba(255,255,255,0.2)" : "#18403618",
                color: filtro === op.value ? C.creme : C.esmeralda,
              }}
            >
              {op.count}
            </span>
          </button>
        ))}
      </div>

      {/* Lista mobile */}
      <div className="block md:hidden space-y-3 mb-3">
        {rowsFiltrados.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>Nenhum protocolo encontrado</p>
        )}
        {rowsFiltrados.map((r) => (
          <MobileCard
            key={r.id}
            titulo={`Protocolo #${r.id}`}
            subtitulo={direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}
            badges={[
              { label: r.etapas === "concluido" ? "Concluído" : r.etapas === "em_andamento" ? "Em Andamento" : "Pendente", cor: r.etapas === "concluido" ? "bg-green-100 text-green-700" : r.etapas === "em_andamento" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700" },
              ...(r.tipo_protocolo ? [{ label: r.tipo_protocolo === "service" ? "🔧 Service" : "🏭 Fábrica", cor: r.tipo_protocolo === "service" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600" }] : []),
            ]}
            campos={[
              { label: "Ordens", valor: String(r.total_ordens) },
              { label: "Criado em", valor: fmt(r.created_at) },
              { label: "Concluído em", valor: fmt(r.data_conclusao) },
              ...(r.criado_por_nome ? [{ label: "Responsável", valor: r.criado_por_nome }] : []),
              ...(r.concluido_por_nome ? [{ label: "Concluído por", valor: r.concluido_por_nome }] : []),
              ...((resolveStorageUrl(r.foto_criacao) || resolveStorageUrl(r.foto_conclusao)) ? [{
                label: "Fotos",
                valor: (
                  <div className="flex gap-2">
                    {resolveStorageUrl(r.foto_criacao) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveStorageUrl(r.foto_criacao)!}
                        alt="Criação"
                        className="w-12 h-12 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onAbrirFoto(resolveStorageUrl(r.foto_criacao), "Foto de Criação"); }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    {resolveStorageUrl(r.foto_conclusao) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveStorageUrl(r.foto_conclusao)!}
                        alt="Conclusão"
                        className="w-12 h-12 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onAbrirFoto(resolveStorageUrl(r.foto_conclusao), "Foto de Conclusão"); }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                ),
              }] : []),
              { label: "Ação", valor: r.etapas === "pendente" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onConcluir(r); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                >
                  <CheckCircle2 size={11} /> Concluir
                </button>
              ) : "—" },
            ]}
          />
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="hidden md:block rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
              {["ID", "Tipo", "Status", "Ordens", "Criado em", "Concluído em", "Responsável", "Concluído por", "Fotos", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFiltrados.length === 0 && (
              <tr><td colSpan={10} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhum protocolo encontrado</td></tr>
            )}
            {rowsFiltrados.map((r, i) => (
              <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{r.id}</td>
                <td className="px-4 py-3"><TipoBadge tipo={r.tipo_protocolo} /></td>
                <td className="px-4 py-3"><EtapaBadge etapa={r.etapas} /></td>
                <td className="px-4 py-3 font-mono text-center" style={{ color: "#374151" }}>{r.total_ordens}</td>
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(r.created_at)}</td>
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: r.data_conclusao ? "#059669" : "#9CA3AF" }}>
                  {fmt(r.data_conclusao)}
                </td>
                <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{r.criado_por_nome || "—"}</td>
                <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>{r.concluido_por_nome || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {resolveStorageUrl(r.foto_criacao) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveStorageUrl(r.foto_criacao)!}
                        alt="Criação"
                        title="Foto de Criação"
                        className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onAbrirFoto(resolveStorageUrl(r.foto_criacao), "Foto de Criação")}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    {resolveStorageUrl(r.foto_conclusao) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveStorageUrl(r.foto_conclusao)!}
                        alt="Conclusão"
                        title="Foto de Conclusão"
                        className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onAbrirFoto(resolveStorageUrl(r.foto_conclusao), "Foto de Conclusão")}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.etapas === "pendente" && (
                    <button
                      onClick={() => onConcluir(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ml-auto"
                      style={{ backgroundColor: "#18403612", color: C.esmeralda }}
                    >
                      <CheckCircle2 size={12} /> Concluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
