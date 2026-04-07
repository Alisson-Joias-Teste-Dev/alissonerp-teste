"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, LogOut, FlaskConical, UserCheck, X, Loader2 } from "lucide-react";
import ApontamentoPCPModal   from "@/components/forms/ApontamentoPCPModal";
import TransferenciaPCPModal from "@/components/forms/TransferenciaPCPModal";
import SaidaOrdemModal       from "@/components/forms/SaidaOrdemModal";
import NovaPCPModal          from "@/components/forms/NovaPCPModal";
import PCPDetalheModal       from "@/components/forms/PCPDetalheModal";
import OrdemTesteModal       from "@/components/forms/OrdemTesteModal";

// ─── Modal de Atribuir Operador ───────────────────────────────────────────────
interface AtribuirOperadorModalProps {
  pcpId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function AtribuirOperadorModal({ pcpId, onClose, onSuccess }: AtribuirOperadorModalProps) {
  const [depositos, setDepositos] = useState<{ id: number; nome: string }[]>([]);
  const [depositoSelecionado, setDepositoSelecionado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((data: { id: number; nome: string }[]) => {
        // Excluir Almoxarifado Central (id=1)
        setDepositos(Array.isArray(data) ? data.filter((d) => d.id !== 1) : []);
      })
      .catch(() => setError("Erro ao carregar depósitos."));
  }, []);

  async function handleConfirmar() {
    if (!depositoSelecionado) {
      setError("Selecione um operador.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pcp/${pcpId}/atribuir-operador`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposito_id: depositoSelecionado }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Erro ao atribuir operador.");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("Erro de rede.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "#E8DCC8" }}
        >
          <h3 className="text-base font-semibold" style={{ color: "#111827" }}>
            Atribuir Operador
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={15} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px]" style={{ color: "#6B7280" }}>
            PCP #{pcpId} — Selecione o operador responsável:
          </p>

          {depositos.length === 0 && !error && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "#9CA3AF" }}>
              <Loader2 size={13} className="animate-spin" /> Carregando...
            </div>
          )}

          <div className="space-y-2">
            {depositos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setDepositoSelecionado(d.id); setError(""); }}
                className="w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all"
                style={{
                  borderColor: depositoSelecionado === d.id ? "#184036" : "#E8DCC8",
                  backgroundColor: depositoSelecionado === d.id ? "#18403610" : "#fff",
                  color: "#111827",
                  fontWeight: depositoSelecionado === d.id ? 600 : 400,
                }}
              >
                {d.nome}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[12px] font-semibold" style={{ color: "#DC2626" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 border-t"
          style={{ borderColor: "#E8DCC8" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={loading || !depositoSelecionado}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

const ETAPAS = [
  { key: "Novas Ordens", color: "#6366F1", bg: "#EEF2FF" },
  { key: "Pendencia",    color: "#F59E0B", bg: "#FFFBEB" },
  { key: "Aguardando",   color: "#0EA5E9", bg: "#F0F9FF" },
  { key: "Em Andamento", color: "#10B981", bg: "#ECFDF5" },
  { key: "Concluido",    color: "#184036", bg: "#F3EADA" },
  { key: "Cancelado",    color: "#EF4444", bg: "#FEF2F2" },
];

const ETAPAS_APONTAMENTO   = new Set(["Novas Ordens", "Em Andamento"]);
const ETAPAS_TRANSFERENCIA = new Set(["Novas Ordens", "Em Andamento"]);
const ETAPAS_SAIDA         = new Set(["Em Andamento"]);

type PCPItem = any;

interface ModalState {
  pcpId:              number;
  ordemId:            number;
  depositoId:         number;
  setorId:            number | null;
  depositoAtribuido:  boolean;
  pesoMetalExterno?:  number;
}

type ActiveModal =
  | { type: "detalhe";           data: PCPItem }
  | { type: "apontamento";       data: ModalState }
  | { type: "transferencia";     data: ModalState }
  | { type: "saida";             data: ModalState }
  | { type: "atribuir_operador"; data: { pcpId: number } }
  | { type: "nova_pcp";          data: null }
  | { type: "ordem_teste";       data: null }
  | null;

function KanbanCard({
  pcp,
  onDetalhe,
  onApontar,
  onTransferir,
  onSaida,
  onAtribuir,
}: {
  pcp:          PCPItem;
  onDetalhe:    (pcp: PCPItem) => void;
  onApontar:    (pcp: PCPItem) => void;
  onTransferir: (pcp: PCPItem) => void;
  onSaida:      (pcp: PCPItem) => void;
  onAtribuir:   (pcp: PCPItem) => void;
}) {
  const etapa        = pcp.etapas ?? "";
  const podeApontar    = ETAPAS_APONTAMENTO.has(etapa);
  const podeTransferir = ETAPAS_TRANSFERENCIA.has(etapa);
  const podeSaida      = ETAPAS_SAIDA.has(etapa);
  // Botão atribuir operador: visível quando sem deposito_id e na coluna Novas Ordens
  const podeAtribuir = pcp.deposito_id == null && etapa === "Novas Ordens";

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
          {/* Badge Na Service */}
          {pcp.na_service && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA" }}
            >
              Na service
            </span>
          )}
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

      {/* Nome do operador atual (se atribuído) */}
      {pcp.deposito_nome && (
        <div className="mt-1.5 text-[10px] font-medium truncate" style={{ color: "#6B7280" }}>
          👤 {pcp.deposito_nome}
        </div>
      )}

      {/* Botões contextuais — stopPropagation para não abrir detalhe */}
      {(podeApontar || podeTransferir || podeSaida || podeAtribuir) && (
        <div className="mt-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          {podeAtribuir && (
            <button
              onClick={() => onAtribuir(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#7C3AED12", color: "#7C3AED" }}
            >
              <UserCheck size={11} strokeWidth={2.5} />
              Atribuir Operador
            </button>
          )}
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
    pcpId:             pcp.id,
    ordemId:           pcp.ordem_id,
    depositoId:        pcp.deposito_id ?? 2,
    setorId:           pcp.setor_id ?? null,
    depositoAtribuido: pcp.deposito_id != null,
    pesoMetalExterno:  pcp.peso_metal_externo != null ? Number(pcp.peso_metal_externo) : undefined,
  }), []);

  const handleDetalhe    = useCallback((pcp: PCPItem) => setActiveModal({ type: "detalhe",           data: pcp }), []);
  const handleApontar    = useCallback((pcp: PCPItem) => setActiveModal({ type: "apontamento",       data: makeModalData(pcp) }), [makeModalData]);
  const handleTransferir = useCallback((pcp: PCPItem) => setActiveModal({ type: "transferencia",     data: makeModalData(pcp) }), [makeModalData]);
  const handleSaida      = useCallback((pcp: PCPItem) => setActiveModal({ type: "saida",             data: makeModalData(pcp) }), [makeModalData]);
  const handleAtribuir   = useCallback((pcp: PCPItem) => setActiveModal({ type: "atribuir_operador", data: { pcpId: pcp.id } }), []);

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
                    onAtribuir={handleAtribuir}
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

      {/* Modal de atribuir operador */}
      {activeModal?.type === "atribuir_operador" && (
        <AtribuirOperadorModal
          pcpId={activeModal.data.pcpId}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}

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
          depositoAtribuido={activeModal.data.depositoAtribuido}
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
          pesoMetalExterno={activeModal.data.pesoMetalExterno}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
