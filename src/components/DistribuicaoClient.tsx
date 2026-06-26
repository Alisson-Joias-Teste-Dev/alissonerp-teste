"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowLeft, CheckCircle2, Clock, Layers, RefreshCw, X, Search, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import NovaDistribuicaoModal from "@/components/forms/NovaDistribuicaoModal";
import ApontamentoDistModal from "@/components/forms/ApontamentoDistModal";
import FecharOrdemDistModal from "@/components/forms/FecharOrdemDistModal";
import ConcluirDistModal from "@/components/forms/ConcluirDistModal";
import { gramasToCt } from "@/lib/formatters";
import { normalizeImageUrl } from "@/lib/storage-url";

// Labels para o enum legado (distribuições antigas sem deposito_id)
const SETOR_LABEL: Record<string, string> = {
  fundicao: "Fundição", aliancas: "Alianças", cnc: "CNC",
  laser: "Laser", banca: "Banca", tamboreador: "Tamboreador", epg: "EPG",
};

type Etapa = "em_andamento" | "concluido";

interface DistRow {
  id: number;
  etapas: Etapa;
  setor: string | null;
  deposito_id: number | null;
  setor_id: number | null;
  deposito_nome: string | null;
  setor_nome: string | null;
  total_metal: number;
  retorno_metal: number;
  pmc: number | null;
  quebra: number | null;
  porcentagem_de_quebra: number | null;
  peso_final: number | null;
  created_at: string;
  total_ordens: number;
  ordens_concluidas: number;
  criado_por_nome: string | null;
  criado_por_foto: string | null;
}

interface ApontamentoRow {
  id: number;
  qtd: number;
  created_at: string;
  tipo_nome: string | null;
  tipo_apontamento_id: number;
  deposito_nome: string | null;
  setor_nome: string | null;
  insumo_nome: string | null;
  unidade: string | null;
  criado_por_nome: string | null;
  criado_por_foto: string | null;
  foto_balanca: string | null;
}

interface OrdemDetalhe {
  doo_id: number;
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number;
  cliente_nome: string | null;
  // Saída completa (migration 051)
  peso_bruto: number | null;
  peso_pedras: number | null;
  peso_ouro_real: number | null;
  quebra: number | null;
  ouro_entregue: number | null;
  data_baixa: string | null;
  // Saída sem peso (migration 077)
  sem_peso: boolean | null;
  justificativa_sem_peso: string | null;
  // Fechamento (trigger result)
  peso_fechamento: number | null;
  pmc_fechamento: number | null;
  pedras_fechamento: number | null;
  foto_fechamento: string | null;
  // Estorno (migration 081)
  estorno_id: number | null;
  estorno_motivo: string | null;
  estorno_justificativa: string | null;
  estorno_em: string | null;
  estorno_por_nome: string | null;
}

const MOTIVOS_ESTORNO = [
  { value: "peso_errado",    label: "Peso registrado incorreto" },
  { value: "pedra_errada",   label: "Pedra apontada incorretamente" },
  { value: "ordem_errada",   label: "Ordem no lote errado" },
  { value: "operador_errou", label: "Erro do operador no processo" },
  { value: "retrabalho",     label: "Peça precisa de retrabalho" },
  { value: "outro",          label: "Outro motivo" },
];

const MOTIVOS_ESTORNO_LOTE = [
  { value: "apontamento_errado", label: "Apontamento incorreto (peso/pedra)" },
  { value: "entrada_esquecida",  label: "Esqueceu de dar entrada de metal" },
  { value: "retorno_indevido",   label: "Retorno de metal indevido" },
  { value: "lote_errado",        label: "Ordens no lote errado" },
  { value: "retrabalho",         label: "Peças precisam de retrabalho" },
  { value: "outro",              label: "Outro motivo" },
];

const ROLES_ESTORNO = ["admin", "desenvolvedor", "gerente_fabrica"];

// ─── MODAL: ESTORNAR LOTE INTEIRO ────────────────────────────────────────────
function EstornarLoteModal({
  isOpen,
  onClose,
  distribuicaoId,
  ordens,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  distribuicaoId: number;
  ordens: OrdemDetalhe[];
  onSuccess: () => void;
}) {
  const [motivo, setMotivo]             = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirmacao, setConfirmacao]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMotivo(""); setJustificativa(""); setConfirmacao("");
      setError(""); setSuccess(false); setLoading(false);
    }
  }, [isOpen]);

  const confirmOk = confirmacao === "ESTORNAR";
  const formOk    = motivo && justificativa.trim().length >= 10 && confirmOk;

  async function handleSubmit() {
    if (!formOk) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/distribuicao/${distribuicaoId}/estorno-lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, justificativa }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao estornar"); return; }
      setSuccess(true);
      setTimeout(() => { onSuccess(); }, 800);
    } catch (err) { console.error("Estorno falhou:", err); setError("Erro ao estornar — tente novamente"); }
    finally  { setLoading(false); }
  }

  if (!isOpen) return null;

  const numOrdens = ordens.map((o) => o.numero_ordem ?? `#${o.ordem_id}`).join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" style={{ backgroundColor: "white", maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA" }}>
          <div className="flex items-center gap-2">
            <AlertCircle size={18} style={{ color: "#DC2626" }} />
            <h2 className="text-base font-semibold" style={{ color: "#991B1B" }}>
              Estornar Lote #{distribuicaoId}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: "#9CA3AF" }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Aviso */}
          <div className="rounded-lg p-3 text-[13px] space-y-1" style={{ backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
            <p className="font-semibold">⚠️ Esta ação irá:</p>
            <ul className="list-disc list-inside space-y-0.5 text-[12px]">
              <li>Reverter TODAS as movimentações de estoque do lote</li>
              <li>Reverter TODAS as saídas das ordens</li>
              <li>Devolver ouro e pedras aos saldos originais</li>
              {ordens.some((o) => o.data_baixa) && <li>Zerar registros de saída de todas as ordens</li>}
              <li>Se o lote estava concluído, será <strong>REABERTO</strong></li>
              <li>O operador terá que reapontar TUDO do zero</li>
            </ul>
          </div>

          {numOrdens && (
            <p className="text-[12px]" style={{ color: "#6B7280" }}>
              <span className="font-semibold">Ordens afetadas:</span> {numOrdens}
            </p>
          )}

          {/* Motivo */}
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Motivo <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: "#E8DCC8" }}
            >
              <option value="">Selecionar motivo…</option>
              {MOTIVOS_ESTORNO_LOTE.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Justificativa */}
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Justificativa <span style={{ color: "#DC2626" }}>*</span>{" "}
              <span style={{ color: "#9CA3AF" }}>(mín. {motivo === "outro" ? 20 : 10} caracteres)</span>
            </label>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Descreva em detalhes o motivo do estorno…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
              style={{ borderColor: "#E8DCC8" }}
            />
          </div>

          {/* Confirmação */}
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Digite <span className="font-mono font-bold">ESTORNAR</span> para confirmar:
            </label>
            <input
              type="text"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="ESTORNAR"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none"
              style={{ borderColor: confirmOk ? "#86EFAC" : "#E8DCC8" }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle2 size={14} className="shrink-0" />Estorno do lote registrado com sucesso!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: "#E8DCC8" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formOk || loading || success}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-40"
            style={{ backgroundColor: "#DC2626", color: "white" }}
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" />Estornando…</>
            ) : (
              <><RotateCcw size={14} />Confirmar Estorno do Lote</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Exibe o operador/setor de uma distribuição
function distLabel(d: DistRow): string {
  if (d.deposito_nome) {
    return d.setor_nome ? `${d.deposito_nome} · ${d.setor_nome}` : d.deposito_nome;
  }
  const legado = SETOR_LABEL[d.setor ?? ""] ?? d.setor;
  return legado ?? "—";
}

// Iniciais para avatar
function initials(nome: string | null): string {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function EtapaBadge({ etapa }: { etapa: Etapa }) {
  return etapa === "concluido" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: "#D1FAE5", color: "#059669" }}>
      <CheckCircle2 size={10} /> Concluído
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: "#FEF3C7", color: "#B45309" }}>
      <Clock size={10} /> Em Andamento
    </span>
  );
}

function Avatar({ nome, foto }: { nome: string | null; foto: string | null }) {
  if (foto) {
    return <img src={foto} alt={nome ?? ""} className="w-7 h-7 rounded-full object-cover border" style={{ borderColor: "#E8DCC8" }} />;
  }
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
      style={{ backgroundColor: "#18403620", color: "#184036" }}>
      {initials(nome)}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#E8DCC8" }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#059669" : "#184036" }} />
      </div>
      <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
        {done}/{total} {pct === 100 ? "✓" : `(${pct}%)`}
      </p>
    </div>
  );
}

function DistCard({ d, onClick }: { d: DistRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 transition-shadow hover:shadow-md"
      style={{ backgroundColor: "white", borderColor: "#E8DCC8" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold" style={{ color: "#9CA3AF" }}>#{d.id}</span>
        <EtapaBadge etapa={d.etapas} />
      </div>

      <p className="text-sm font-semibold mb-1 truncate" style={{ color: "#184036" }}>
        {distLabel(d)}
      </p>

      <ProgressBar done={d.ordens_concluidas} total={d.total_ordens} />

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
          {new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
        </span>
        <Avatar nome={d.criado_por_nome} foto={d.criado_por_foto} />
      </div>
    </button>
  );
}

type ActiveModal = "nova" | "apontamento" | "concluir" | "adicionar-ordens" | null;


// ─── MODAL: ADICIONAR ORDENS ──────────────────────────────────────────────────
interface OrdemDisponivel {
  id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number;
  cliente_nome: string | null;
  pcp_etapa: string;
}

function AdicionarOrdensModal({
  isOpen,
  onClose,
  distribuicaoId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  distribuicaoId: number;
  onSuccess: () => void;
}) {
  const [ordens, setOrdens] = useState<OrdemDisponivel[]>([]);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [selectedOrdens, setSelectedOrdens] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Carregar ordens disponíveis ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setSelectedOrdens(new Set());
    setBusca("");
    setError("");
    setSuccess(false);
    setLoadingOrdens(true);
    fetch(`/api/distribuicao/ordens-disponiveis?excluir_dist_id=${distribuicaoId}`)
      .then((r) => r.json())
      .then((rows) => setOrdens(rows as OrdemDisponivel[]))
      .catch(() => setOrdens([]))
      .finally(() => setLoadingOrdens(false));
  }, [isOpen]);

  const ordensFiltradas = useMemo(() => {
    if (!busca.trim()) return ordens;
    const q = busca.toLowerCase();
    return ordens.filter(
      (o) =>
        (o.numero_ordem ?? "").toLowerCase().includes(q) ||
        (o.cliente_nome ?? "").toLowerCase().includes(q),
    );
  }, [ordens, busca]);

  function toggleOrdem(id: number) {
    setSelectedOrdens((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setError("");
  }

  async function handleSubmit() {
    if (selectedOrdens.size === 0) {
      setError("Selecione ao menos uma ordem.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/distribuicao/${distribuicaoId}/adicionar-ordens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem_ids: Array.from(selectedOrdens) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Erro ao adicionar ordens.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: "#E8DCC8" }}
        >
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
            Adicionar Ordens ao Lote
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Busca */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#6B7280" }}
              >
                Ordens Disponíveis
              </label>
              <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                {ordens.length} disponíveis · {selectedOrdens.size} selecionadas
              </span>
            </div>
            <div className="relative mb-2">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "#9CA3AF" }}
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por ordem ou cliente…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: "#E8DCC8" }}
              />
            </div>

            <div
              className="rounded-lg border divide-y overflow-y-auto"
              style={{ borderColor: "#E8DCC8", maxHeight: 280 }}
            >
              {loadingOrdens && (
                <p className="text-center text-sm py-6" style={{ color: "#9CA3AF" }}>
                  <Loader2 size={14} className="inline animate-spin mr-1" />
                  Carregando…
                </p>
              )}
              {!loadingOrdens && ordensFiltradas.length === 0 && (
                <p className="text-center text-sm py-6" style={{ color: "#9CA3AF" }}>
                  {busca ? "Nenhuma ordem encontrada" : "Nenhuma ordem disponível"}
                </p>
              )}
              {ordensFiltradas.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrdens.has(o.id)}
                    onChange={() => toggleOrdem(o.id)}
                    className="rounded shrink-0"
                    style={{ accentColor: "#184036" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#184036" }}>
                      {o.numero_ordem ?? `#${o.id}`}
                    </p>
                    {o.cliente_nome && (
                      <p className="text-[11px] truncate" style={{ color: "#6B7280" }}>
                        {o.cliente_nome}
                      </p>
                    )}
                  </div>
                  {Number(o.peso_metal_negociado) > 0 && (
                    <span className="text-[11px] font-mono shrink-0" style={{ color: "#9CA3AF" }}>
                      {Number(o.peso_metal_negociado).toFixed(2)}g
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle2 size={14} className="shrink-0" />
              Ordens adicionadas com sucesso!
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: "#E8DCC8" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || selectedOrdens.size === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Adicionando…
              </>
            ) : (
              `Adicionar${selectedOrdens.size > 0 ? ` ${selectedOrdens.size} Ordem${selectedOrdens.size > 1 ? "ns" : ""}` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DistribuicaoClient({
  dists,
  semDeposito,
  userRole,
}: {
  dists: DistRow[];
  semDeposito?: boolean;
  userRole?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DistRow | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [ordens, setOrdens] = useState<OrdemDetalhe[]>([]);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [apontamentos, setApontamentos] = useState<ApontamentoRow[]>([]);
  const [loadingApontamentos, setLoadingApontamentos] = useState(false);
  const [ordemParaSaida, setOrdemParaSaida] = useState<OrdemDetalhe | null>(null);
  const [loteEstornoAberto, setLoteEstornoAberto] = useState(false);
  const [loteEstorno, setLoteEstorno]             = useState<{
    motivo: string; justificativa: string; created_at: string; estornado_por_nome: string | null;
  } | null>(null);

  const podeEstornar = ROLES_ESTORNO.includes(userRole ?? "");

  const refresh = useCallback(() => router.refresh(), [router]);

  // Carregar ordens do detalhe ao selecionar uma distribuição
  useEffect(() => {
    if (!selected) { setOrdens([]); setLoteEstorno(null); return; }
    setLoadingOrdens(true);
    fetch(`/api/distribuicao/${selected.id}`)
      .then((r) => r.json())
      .then((data) => {
        setOrdens(data.ordens ?? []);
        setLoteEstorno(data.lote_estorno ?? null);
      })
      .catch(() => setOrdens([]))
      .finally(() => setLoadingOrdens(false));
  }, [selected]);

  const loadApontamentos = useCallback(() => {
    if (!selected) return;
    setLoadingApontamentos(true);
    fetch(`/api/distribuicao/${selected.id}/apontamentos`)
      .then((r) => r.json())
      .then((data) => setApontamentos(Array.isArray(data) ? data : []))
      .catch(() => setApontamentos([]))
      .finally(() => setLoadingApontamentos(false));
  }, [selected]);

  useEffect(() => {
    if (!selected) { setApontamentos([]); return; }
    loadApontamentos();
  }, [selected, loadApontamentos]);

  const ativa = selected?.etapas === "em_andamento";

  // ─── DETALHE ──────────────────────────────────────────────────────────────
  if (selected) {
    // Ordem concluída = data_baixa preenchida (saída registrada) ou peso_fechamento > 0 (legado)
    const ordensConcluidas = ordens.filter((o) => o.data_baixa || (o.peso_fechamento && o.peso_fechamento > 0));
    return (
      <div className="px-3 md:px-6 py-4 md:py-8">
        <div className="mb-4 md:mb-6">
          <button
            onClick={() => { setSelected(null); setOrdens([]); setOrdemParaSaida(null); refresh(); }}
            className="flex items-center gap-1.5 text-sm mb-4 transition-opacity hover:opacity-70"
            style={{ color: "#6B7280" }}
          >
            <ArrowLeft size={15} /> Voltar à lista
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}>
                Distribuição #{selected.id}
              </h2>
              <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "#6B7280" }}>
                <Layers size={13} />
                {distLabel(selected)}
                {selected.criado_por_nome && (
                  <span>· por {selected.criado_por_nome}</span>
                )}
              </p>
              {loteEstorno && (
                <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#DC2626" }}>
                  <RotateCcw size={10} />
                  Estornado por {loteEstorno.estornado_por_nome ?? "—"} em{" "}
                  {new Date(loteEstorno.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {MOTIVOS_ESTORNO_LOTE.find((m) => m.value === loteEstorno.motivo)?.label ?? loteEstorno.motivo}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <EtapaBadge etapa={selected.etapas} />
              {podeEstornar && (
                <button
                  onClick={() => setLoteEstornoAberto(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
                  title="Reverter TODAS as movimentações deste lote"
                >
                  <AlertCircle size={12} /> Estornar Lote
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Metal Entrada", value: selected.total_metal?.toFixed(2) ?? "—", unit: "g", color: "#184036" },
            { label: "Retorno", value: selected.retorno_metal?.toFixed(2) ?? "—", unit: "g", color: "#6B7280" },
            { label: "PMC", value: selected.pmc != null ? selected.pmc.toFixed(2) : "—", unit: selected.pmc != null ? "g" : "", color: "#059669" },
            {
              label: "% Quebra",
              value: selected.porcentagem_de_quebra != null ? selected.porcentagem_de_quebra.toFixed(2) : "—",
              unit: selected.porcentagem_de_quebra != null ? "%" : "",
              color: selected.porcentagem_de_quebra == null ? "#9CA3AF"
                : selected.porcentagem_de_quebra > 8 ? "#DC2626"
                : selected.porcentagem_de_quebra > 3 ? "#D97706" : "#059669",
            },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="rounded-xl p-4 border" style={{ backgroundColor: "#FAFAF7", borderColor: "#E8DCC8" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
              <p className="text-xl font-mono font-bold" style={{ color }}>
                {value}<span className="text-sm font-normal ml-0.5">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Lista de ordens */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Ordens ({ordens.length})
            </h3>
            <div className="text-sm flex items-center gap-2" style={{ color: "#9CA3AF" }}>
              {ordensConcluidas.length}/{ordens.length} concluídas
              {ordens.filter((o) => o.sem_peso).length > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                  style={{ backgroundColor: "#FFFBEB", color: "#92400E", borderColor: "#FDE68A" }}
                >
                  {ordens.filter((o) => o.sem_peso).length} sem peso
                </span>
              )}
            </div>
          </div>

          {loadingOrdens ? (
            <p className="text-sm py-4 text-center" style={{ color: "#9CA3AF" }}>Carregando ordens…</p>
          ) : ordens.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "#9CA3AF" }}>Nenhuma ordem vinculada</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E8DCC8" }}>
              {ordens.map((o, i) => {
                const concluida = !!(o.data_baixa || (o.peso_fechamento && o.peso_fechamento > 0));
                const temDetalheSaida = o.peso_bruto != null;
                return (
                  <div
                    key={o.doo_id}
                    className="px-4 py-3"
                    style={{
                      borderTop: i > 0 ? "1px solid #F3EADA" : undefined,
                      backgroundColor: concluida ? "#F0FDF4" : "white",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/ordens/${o.ordem_id}`}
                            className="text-sm font-semibold hover:underline"
                            style={{ color: "#184036" }}
                            title="Ver detalhes da ordem"
                          >
                            {o.numero_ordem ?? `#${o.ordem_id}`}
                          </Link>
                          {o.sem_peso && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                              style={{ backgroundColor: "#FFFBEB", color: "#92400E", borderColor: "#FDE68A" }}
                            >
                              Sem Peso
                            </span>
                          )}
                          {/* Badge estornada: mostra quando há estorno e saída ainda não re-registrada */}
                          {!concluida && o.estorno_id && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                              style={{ backgroundColor: "#FEF2F2", color: "#DC2626", borderColor: "#FCA5A5" }}
                            >
                              <RotateCcw size={9} /> Estornada
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "#9CA3AF" }}>
                          {o.cliente_nome ?? "—"}
                          {Number(o.peso_metal_negociado) > 0 && ` · neg. ${Number(o.peso_metal_negociado).toFixed(2)}g`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {concluida ? (
                          <>
                            <CheckCircle2 size={16} style={{ color: "#059669" }} />
                          </>
                        ) : ativa ? (
                          <button
                            onClick={() => setOrdemParaSaida(o)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
                            style={{ backgroundColor: "#0EA5E912", color: "#0284C7" }}
                          >
                            📤 Registrar Saída
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Em andamento</span>
                        )}
                      </div>
                    </div>
                    {/* Resumo da saída sem peso */}
                    {concluida && o.sem_peso && (
                      <div className="mt-1.5 text-[11px]" style={{ color: "#B45309" }}>
                        {o.justificativa_sem_peso ?? "Saída sem peso"}
                      </div>
                    )}
                    {/* Resumo da saída normal */}
                    {concluida && !o.sem_peso && temDetalheSaida && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono">
                        <span style={{ color: "#184036" }}>
                          bruto {Number(o.peso_bruto).toFixed(2)}g
                        </span>
                        {o.peso_pedras != null && Number(o.peso_pedras) > 0 && (
                          <span style={{ color: "#7C3AED" }}>
                            pedras {Number(o.peso_pedras).toFixed(2)}g
                            {o.pedras_fechamento != null && Number(o.pedras_fechamento) > 0 && ` (${Math.round(Number(o.pedras_fechamento))} UN)`}
                          </span>
                        )}
                        <span style={{ color: "#059669" }}>
                          ouro {o.peso_ouro_real != null ? Number(o.peso_ouro_real).toFixed(2) : "—"}g
                        </span>
                      </div>
                    )}
                    {/* Legado: só peso_fechamento sem detalhes */}
                    {concluida && !o.sem_peso && !temDetalheSaida && o.peso_fechamento != null && (
                      <div className="mt-1 text-[11px] font-mono" style={{ color: "#059669" }}>
                        {Number(o.peso_fechamento).toFixed(2)}g
                        {o.pedras_fechamento != null && Number(o.pedras_fechamento) > 0 && ` · ${Math.round(Number(o.pedras_fechamento))} UN`}
                      </div>
                    )}
                    {/* Info do estorno (quando ordem foi estornada e aguarda re-registro) */}
                    {!concluida && o.estorno_id && o.estorno_em && (
                      <div className="mt-1.5 text-[10px] rounded px-2 py-1"
                        style={{ backgroundColor: "#FEF2F2", color: "#991B1B" }}>
                        Estornada por {o.estorno_por_nome ?? "—"} em{" "}
                        {new Date(o.estorno_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{MOTIVOS_ESTORNO.find((m) => m.value === o.estorno_motivo)?.label ?? o.estorno_motivo}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Barra de progresso */}
          {ordens.length > 0 && (
            <div className="mt-3">
              <ProgressBar done={ordensConcluidas.length} total={ordens.length} />
            </div>
          )}
        </div>

        {/* Resumo de apontamentos */}
        {apontamentos.length > 0 && (() => {
          const totalMetalEntrada = apontamentos.filter(a => a.tipo_apontamento_id === 2).reduce((s, a) => s + a.qtd, 0);
          const totalMetalAditivo = apontamentos.filter(a => a.tipo_apontamento_id === 1).reduce((s, a) => s + a.qtd, 0);
          const totalRetornoMetal = apontamentos.filter(a => a.tipo_apontamento_id === 5).reduce((s, a) => s + a.qtd, 0);
          const totalPedrasEntradaG = apontamentos.filter(a => a.tipo_apontamento_id === 3).reduce((s, a) => s + a.qtd, 0);
          const totalPedrasRetornoG = apontamentos.filter(a => a.tipo_apontamento_id === 6).reduce((s, a) => s + a.qtd, 0);
          const totalPedrasLiquidoCt = gramasToCt(totalPedrasEntradaG - totalPedrasRetornoG);
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {[
                { label: "Entrada Metal", value: `${(totalMetalEntrada + totalMetalAditivo).toFixed(2)}g`, color: "#184036" },
                { label: "Retorno Metal", value: `${totalRetornoMetal.toFixed(2)}g`, color: "#6B7280" },
                { label: "Pedras (ct)", value: totalPedrasLiquidoCt > 0 ? `${totalPedrasLiquidoCt.toFixed(4)} ct` : "0.0000 ct", color: "#7C3AED" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-3 border" style={{ backgroundColor: "#FAFAF7", borderColor: "#E8DCC8" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>{label}</p>
                  <p className="text-lg font-mono font-bold" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Lista de apontamentos */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Apontamentos ({apontamentos.length})
            </h3>
            <button
              onClick={loadApontamentos}
              className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
              style={{ color: "#9CA3AF" }}
            >
              <RefreshCw size={11} /> Atualizar
            </button>
          </div>

          {loadingApontamentos ? (
            <p className="text-sm py-4 text-center" style={{ color: "#9CA3AF" }}>Carregando…</p>
          ) : apontamentos.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "#9CA3AF" }}>Nenhum apontamento registrado</p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E8DCC8" }}>
              {apontamentos.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-3 gap-3"
                  style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined, backgroundColor: "white" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#184036" }}>
                      {a.tipo_nome ?? `Tipo ${a.tipo_apontamento_id}`}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "#9CA3AF" }}>
                      {a.insumo_nome ?? "—"}
                      {a.setor_nome && ` · ${a.setor_nome}`}
                      {a.criado_por_nome && ` · ${a.criado_por_nome}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold" style={{ color: "#184036" }}>
                      {a.unidade === "UN" ? `${Math.round(a.qtd)} UN` : a.unidade ? `${a.qtd.toFixed(2)}g` : a.qtd.toFixed(2)}
                    </p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                      {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {a.foto_balanca && (
                    <a href={normalizeImageUrl(a.foto_balanca)} target="_blank" rel="noreferrer"
                      className="shrink-0 text-[10px] underline" style={{ color: "#9CA3AF" }}>
                      foto
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de estornos */}
        {(() => {
          const estornadas = ordens.filter((o) => o.estorno_id && o.estorno_em);
          if (estornadas.length === 0) return null;
          return (
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#DC2626" }}>
                Histórico de Estornos ({estornadas.length})
              </h3>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#FCA5A5" }}>
                {estornadas.map((o, i) => (
                  <div key={o.doo_id}
                    className="px-4 py-3"
                    style={{ borderTop: i > 0 ? "1px solid #FEE2E2" : undefined, backgroundColor: "#FEF2F2" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: "#991B1B" }}>
                          {o.numero_ordem ?? `#${o.ordem_id}`}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "#DC2626" }}>
                          {MOTIVOS_ESTORNO.find((m) => m.value === o.estorno_motivo)?.label ?? o.estorno_motivo}
                        </p>
                        {o.estorno_justificativa && (
                          <p className="text-[11px] mt-0.5 italic" style={{ color: "#9CA3AF" }}>
                            &ldquo;{o.estorno_justificativa}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                          {o.estorno_por_nome ?? "—"}
                        </p>
                        {o.estorno_em && (
                          <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                            {new Date(o.estorno_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Ações */}
        {ativa && (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setActiveModal("apontamento")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: "#18403612", color: "#184036" }}
            >
              <Plus size={14} /> Apontar
            </button>
            <button
              onClick={() => setActiveModal("adicionar-ordens")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: "#0EA5E912", color: "#0284C7" }}
            >
              <Plus size={14} /> Adicionar Ordens
            </button>
            <button
              onClick={() => setActiveModal("concluir")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: "#F59E0B12", color: "#B45309" }}
            >
              Concluir Distribuição
            </button>
          </div>
        )}

        {/* Modais */}
        <ApontamentoDistModal
          isOpen={activeModal === "apontamento"}
          onClose={() => setActiveModal(null)}
          distribuicaoId={selected.id}
          depositoId={selected.deposito_id ?? 0}
          setorId={selected.setor_id ?? null}
          depositoNome={selected.deposito_nome ?? ""}
          setorNome={selected.setor_nome ?? null}
          onSuccess={() => { refresh(); loadApontamentos(); }}
        />
        <FecharOrdemDistModal
          isOpen={!!ordemParaSaida}
          onClose={() => setOrdemParaSaida(null)}
          distribuicaoId={selected.id}
          depositoNome={selected.deposito_nome ?? distLabel(selected)}
          ordem={ordemParaSaida ? {
            id: ordemParaSaida.ordem_id,
            numero_ordem: ordemParaSaida.numero_ordem,
            cliente_nome: ordemParaSaida.cliente_nome,
            peso_metal_negociado: ordemParaSaida.peso_metal_negociado,
          } : null}
          onSuccess={() => {
            setOrdemParaSaida(null);
            // Recarregar ordens para atualizar status de fechamento
            setLoadingOrdens(true);
            fetch(`/api/distribuicao/${selected.id}`)
              .then((r) => r.json())
              .then((data) => setOrdens(data.ordens ?? []))
              .catch(() => {})
              .finally(() => setLoadingOrdens(false));
            refresh();
          }}
        />
        <ConcluirDistModal
          isOpen={activeModal === "concluir"}
          onClose={() => setActiveModal(null)}
          distribuicaoId={selected.id}
          depositoLabel={distLabel(selected)}
          ouroEntregue={Math.max(0, (selected.total_metal ?? 0) - (selected.retorno_metal ?? 0))}
          ordens={ordens}
          onSuccess={() => { refresh(); setSelected(null); setOrdens([]); }}
        />
        <AdicionarOrdensModal
          isOpen={activeModal === "adicionar-ordens"}
          onClose={() => setActiveModal(null)}
          distribuicaoId={selected.id}
          onSuccess={() => {
            setActiveModal(null);
            // Recarregar ordens e atualizar contadores via router.refresh()
            setLoadingOrdens(true);
            fetch(`/api/distribuicao/${selected.id}`)
              .then((r) => r.json())
              .then((data) => setOrdens(data.ordens ?? []))
              .catch(() => {})
              .finally(() => setLoadingOrdens(false));
            refresh();
          }}
        />
        <EstornarLoteModal
          isOpen={loteEstornoAberto}
          onClose={() => setLoteEstornoAberto(false)}
          distribuicaoId={selected.id}
          ordens={ordens}
          onSuccess={() => {
            setLoteEstornoAberto(false);
            setLoadingOrdens(true);
            fetch(`/api/distribuicao/${selected.id}`)
              .then((r) => r.json())
              .then((data) => {
                setOrdens(data.ordens ?? []);
                setLoteEstorno(data.lote_estorno ?? null);
                if (data.dist?.etapas) {
                  setSelected((prev) => prev ? { ...prev, etapas: data.dist.etapas as Etapa } : null);
                }
              })
              .catch(() => {})
              .finally(() => setLoadingOrdens(false));
            refresh();
          }}
        />
      </div>
    );
  }

  // ─── SEM DEPÓSITO (ourives sem depósito configurado) ───────────────────────
  if (semDeposito) {
    return (
      <div className="px-3 md:px-6 py-4 md:py-8">
        <div className="mb-4 md:mb-8">
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}>
            Distribuição
          </h2>
        </div>
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "#E8DCC8", backgroundColor: "#FFFBEB" }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: "#92400E" }}>
            Depósito não configurado
          </p>
          <p className="text-sm" style={{ color: "#B45309" }}>
            Seu usuário não tem depósito configurado. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  // ─── KANBAN ────────────────────────────────────────────────────────────────
  const emAndamento = dists.filter((d) => d.etapas === "em_andamento");
  const concluidos  = dists.filter((d) => d.etapas === "concluido");

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-8 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}>
            Distribuição
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {emAndamento.length} em andamento · {concluidos.length} concluídas
          </p>
        </div>
        <button
          onClick={() => setActiveModal("nova")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: "#184036", color: "#F3EADA" }}
        >
          <Plus size={15} /> Nova Distribuição
        </button>
      </div>

      {/* Kanban 2 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Em Andamento */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} style={{ color: "#B45309" }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#B45309" }}>
              Em Andamento
            </h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#FEF3C7", color: "#B45309" }}>
              {emAndamento.length}
            </span>
          </div>
          {emAndamento.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-8 text-center"
              style={{ borderColor: "#E8DCC8" }}>
              <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma distribuição ativa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {emAndamento.map((d) => (
                <DistCard key={d.id} d={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          )}
        </div>

        {/* Concluído */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={14} style={{ color: "#059669" }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#059669" }}>
              Concluído
            </h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#D1FAE5", color: "#059669" }}>
              {concluidos.length}
            </span>
          </div>
          {concluidos.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-8 text-center"
              style={{ borderColor: "#E8DCC8" }}>
              <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma concluída ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {concluidos.map((d) => (
                <DistCard key={d.id} d={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal nova distribuição */}
      <NovaDistribuicaoModal
        isOpen={activeModal === "nova"}
        onClose={() => setActiveModal(null)}
        onSuccess={() => { setActiveModal(null); refresh(); }}
      />
    </div>
  );
}
