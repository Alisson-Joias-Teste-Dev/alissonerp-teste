"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, LogOut, FlaskConical } from "lucide-react";
import ApontamentoPCPModal   from "@/components/forms/ApontamentoPCPModal";
import TransferenciaPCPModal from "@/components/forms/TransferenciaPCPModal";
import SaidaOrdemModal       from "@/components/forms/SaidaOrdemModal";
import NovaPCPModal          from "@/components/forms/NovaPCPModal";
import PCPDetalheModal       from "@/components/forms/PCPDetalheModal";
import OrdemTesteModal       from "@/components/forms/OrdemTesteModal";

const ETAPAS = [
  { key: "Novas Ordens", color: "#6366F1", bg: "#EEF2FF" },
  { key: "Pendencia",    color: "#F59E0B", bg: "#FFFBEB" },
  { key: "Aguardando",   color: "#0EA5E9", bg: "#F0F9FF" },
  { key: "Em Andamento", color: "#10B981", bg: "#ECFDF5" },
  { key: "Concluido",    color: "#184036", bg: "#F3EADA" },
  { key: "Cancelado",    color: "#EF4444", bg: "#FEF2F2" },
];

const ETAPAS_APONTAMENTO   = new Set(["Novas Ordens", "Em Andamento"]);
const ETAPAS_TRANSFERENCIA = new Set(["Em Andamento"]);
const ETAPAS_SAIDA         = new Set(["Em Andamento"]);

type PCPItem = any;

interface ModalState {
  pcpId:     number;
  ordemId:   number;
  depositoId: number;
  setorId:   number | null;
}

type ActiveModal =
  | { type: "detalhe";       data: PCPItem }
  | { type: "apontamento";   data: ModalState }
  | { type: "transferencia"; data: ModalState }
  | { type: "saida";         data: ModalState }
  | { type: "nova_pcp";      data: null }
  | { type: "ordem_teste";   data: null }
  | null;

function KanbanCard({
  pcp,
  onDetalhe,
  onApontar,
  onTransferir,
  onSaida,
}: {
  pcp:          PCPItem;
  onDetalhe:    (pcp: PCPItem) => void;
  onApontar:    (pcp: PCPItem) => void;
  onTransferir: (pcp: PCPItem) => void;
  onSaida:      (pcp: PCPItem) => void;
}) {
  const etapa        = pcp.etapas ?? "";
  const podeApontar    = ETAPAS_APONTAMENTO.has(etapa);
  const podeTransferir = ETAPAS_TRANSFERENCIA.has(etapa);
  const podeSaida      = ETAPAS_SAIDA.has(etapa);

  return (
    <div
      onClick={() => onDetalhe(pcp)}
      className="bg-white rounded-lg border p-3 text-xs shadow-sm hover:shadow-md hover:ring-1 transition-all cursor-pointer"
      style={{ borderColor: "#E8DCC8", "--tw-ring-color": "#18403630" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Link
          href={`/ordens/${pcp.ordem_id}`}
          className="font-semibold text-sm hover:underline"
          style={{ color: "#184036" }}
          title="Ver detalhes da ordem"
          onClick={(e) => e.stopPropagation()}
        >
          {pcp.numero_ordem ?? `#${pcp.ordem_id}`}
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Badge de teste */}
          {pcp.eh_teste && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              🧪
            </span>
          )}
          {Number(pcp.total_apontamentos) > 0 && (
            <span
              className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#18403620", color: "#184036" }}
            >
              {pcp.total_apontamentos} apt
            </span>
          )}
          <span className="font-mono text-[10px]" style={{ color: "#6B7280" }}>
            #{pcp.id}
          </span>
        </div>
      </div>

      {pcp.cliente_nome && (
        <p className="truncate mb-1" style={{ color: "#1A1A1A" }}>
          {pcp.cliente_nome}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "#F3EADA" }}>
        <span style={{ color: "#6B7280" }}>{pcp.vendedor_nome ?? "—"}</span>
        {Number(pcp.peso_final) > 0 ? (
          <span className="font-mono font-semibold" style={{ color: "#DB9864" }}>
            {Number(pcp.peso_final).toFixed(2)}g
          </span>
        ) : (
          <span style={{ color: "#9CA3AF" }}>—</span>
        )}
      </div>

      {/* Botões contextuais — stopPropagation para não abrir detalhe */}
      {(podeApontar || podeTransferir || podeSaida) && (
        <div className="mt-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          {podeApontar && (
            <button
              onClick={() => onApontar(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#18403612", color: "#184036" }}
            >
              <Plus size={11} strokeWidth={2.5} />
              Apontar
            </button>
          )}
          {podeTransferir && (
            <button
              onClick={() => onTransferir(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#0EA5E912", color: "#0284C7" }}
            >
              <ArrowRight size={11} strokeWidth={2.5} />
              Transferir
            </button>
          )}
          {podeSaida && (
            <button
              onClick={() => onSaida(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#F59E0B12", color: "#B45309" }}
            >
              <LogOut size={11} strokeWidth={2.5} />
              Saída
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function KanbanClient({
  pcps,
  userRole,
}: {
  pcps: any[];
  userRole?: string | null;
}) {
  const router = useRouter();
  const [search, setSearch]           = useState("");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const isDesenvolvedor = userRole === "desenvolvedor";

  const filtered = useMemo(() => {
    if (!search) return pcps;
    const q = search.toLowerCase();
    return pcps.filter(
      (p) =>
        p.numero_ordem?.toLowerCase().includes(q) ||
        p.cliente_nome?.toLowerCase().includes(q)
    );
  }, [pcps, search]);

  const byEtapa = useMemo(() => {
    const map: Record<string, PCPItem[]> = {};
    for (const e of ETAPAS) map[e.key] = [];
    for (const p of filtered) {
      const etapa = p.etapas ?? "Desconhecido";
      if (!map[etapa]) map[etapa] = [];
      map[etapa].push(p);
    }
    return map;
  }, [filtered]);

  const makeModalData = useCallback((pcp: PCPItem): ModalState => ({
    pcpId:      pcp.id,
    ordemId:    pcp.ordem_id,
    depositoId: pcp.deposito_id ?? 2,
    setorId:    pcp.setor_id ?? null,
  }), []);

  const handleDetalhe    = useCallback((pcp: PCPItem) => setActiveModal({ type: "detalhe",       data: pcp }), []);
  const handleApontar    = useCallback((pcp: PCPItem) => setActiveModal({ type: "apontamento",   data: makeModalData(pcp) }), [makeModalData]);
  const handleTransferir = useCallback((pcp: PCPItem) => setActiveModal({ type: "transferencia", data: makeModalData(pcp) }), [makeModalData]);
  const handleSaida      = useCallback((pcp: PCPItem) => setActiveModal({ type: "saida",         data: makeModalData(pcp) }), [makeModalData]);

  const handleClose   = useCallback(() => setActiveModal(null), []);
  const handleSuccess = useCallback(() => { router.refresh(); }, [router]);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}
          >
            PCP — Kanban
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {pcps.length} registros — alissonerp.vw_pcp_erp
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Botão visível somente para desenvolvedor */}
          {isDesenvolvedor && (
            <button
              onClick={() => setActiveModal({ type: "ordem_teste", data: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              title="Criar ordem de teste (modo desenvolvimento)"
            >
              <FlaskConical size={13} />
              Ordem Teste
            </button>
          )}
          <button
            onClick={() => setActiveModal({ type: "nova_pcp", data: null })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            <Plus size={13} strokeWidth={2.5} />
            Nova Ordem
          </button>
          <input
            type="text"
            placeholder="Buscar ordem ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm outline-none w-full md:w-60"
            style={{ borderColor: "#E8DCC8" }}
          />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:snap-none">
        {ETAPAS.map((etapa) => {
          const cards = byEtapa[etapa.key] ?? [];
          return (
            <div
              key={etapa.key}
              className="flex-shrink-0 w-[calc(100vw-3rem)] md:w-56 snap-start rounded-xl flex flex-col"
              style={{ backgroundColor: etapa.bg, minHeight: 200 }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-t-xl"
                style={{
                  backgroundColor: etapa.color + "20",
                  borderBottom: `2px solid ${etapa.color}`,
                }}
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: etapa.color }}
                >
                  {etapa.key}
                </span>
                <span
                  className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: etapa.color, color: "#fff" }}
                >
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div
                className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto"
                style={{ maxHeight: "70vh" }}
              >
                {cards.map((p) => (
                  <KanbanCard
                    key={p.id}
                    pcp={p}
                    onDetalhe={handleDetalhe}
                    onApontar={handleApontar}
                    onTransferir={handleTransferir}
                    onSaida={handleSaida}
                  />
                ))}
                {cards.length === 0 && (
                  <p
                    className="text-center text-[11px] py-4"
                    style={{ color: "#9CA3AF" }}
                  >
                    Vazio
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modais */}
      {activeModal?.type === "detalhe" && (
        <PCPDetalheModal
          pcp={activeModal.data}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "nova_pcp" && (
        <NovaPCPModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "ordem_teste" && (
        <OrdemTesteModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "apontamento" && (
        <ApontamentoPCPModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "transferencia" && (
        <TransferenciaPCPModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "saida" && (
        <SaidaOrdemModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
