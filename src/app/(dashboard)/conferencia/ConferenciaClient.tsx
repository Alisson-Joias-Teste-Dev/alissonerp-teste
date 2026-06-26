"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizeImageUrl } from "@/lib/storage-url";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Loader2,
  Wrench,
  ClipboardList,
  ImageOff,
  AlertTriangle,
} from "lucide-react";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AprovacaoRow {
  id: number;
  etapas: string;
  ordem_id: number;
  consultora_id: number | null;
  obs: string | null;
  created_at: string;
  updated_at: string | null;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number | null;
  data_entrega: string | null;
  consultora_nome: string | null;
  cliente_nome: string | null;
}

interface ServicoConferenciaRow {
  aprovacao_id: number;
  aprovacao_etapas: string;
  consultora_id: number | null;
  servico_id: number;
  tentativa: number;
  peso_entrada: number | null;
  peso_saida: number | null;
  consumo_solda: number | null;
  foto_conclusao_servico: string | null;
  concluido_em: string | null;
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  foto_peca_servico: string | null;
  detalhes_ordem: string | null;
  cliente_nome: string | null;
  consultora_nome: string | null;
  operador_nome: string | null;
}

interface Props {
  aprovacoes: AprovacaoRow[];
  servicosConferencia: ServicoConferenciaRow[];
}

type TabFilter = "pendente" | "aprovado" | "reprovado" | "todos";
type MainView  = "conferencia" | "servicos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtHora(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtNum(n: number | null | undefined, dec = 3) {
  if (n == null) return "—";
  return Number(n).toFixed(dec) + " g";
}

function fmtTipoOrdem(t: string | null) {
  if (!t) return "—";
  const map: Record<string, string> = {
    fabricacao: "Fabricação",
    servico_venda: "Serv. Venda",
    servico_interno: "Serv. Interno",
    reposicao_loja: "Rep. Loja",
    reposicao_venda: "Rep. Venda",
    garantia: "Garantia",
    compra_fornecedor: "Compra",
  };
  return map[t] ?? t;
}

function EtapasBadge({ etapas }: { etapas: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; Icon: typeof Clock }> = {
    pendente:   { label: "Pendente",   bg: "#FEF3C7", color: "#92400E", Icon: Clock },
    aguardando: { label: "Aguardando", bg: "#EFF6FF", color: "#2563EB", Icon: Clock },
    aprovado:   { label: "Aprovada",   bg: "#ECFDF5", color: "#059669", Icon: CheckCircle2 },
    reprovado:  { label: "Reprovada",  bg: "#FEF2F2", color: "#DC2626", Icon: XCircle },
  };
  const s = cfg[etapas] ?? { label: etapas, bg: "#F3F4F6", color: "#6B7280", Icon: Clock };
  const Icon = s.Icon;
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

function StatCard({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
    >
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "#9CA3AF" }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function FotoOuPlaceholder({ src, label }: { src: string | null; label: string }) {
  if (!src) {
    return (
      <div className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5"
        style={{ backgroundColor: "#F9FAFB", border: "1px dashed #D1D5DB" }}>
        <ImageOff size={20} color="#9CA3AF" />
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{label}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizeImageUrl(src)}
      alt={label}
      className="w-full aspect-square rounded-xl object-cover border"
      style={{ borderColor: C.cremeBorder }}
    />
  );
}

// ─── Modal de Reprovação ──────────────────────────────────────────────────────

interface ReprovModalProps {
  row: ServicoConferenciaRow;
  onClose: () => void;
  onConfirm: (motivo: string, fotoB64: string | null) => Promise<void>;
  loading: boolean;
}

function ReprovModal({ row, onClose, onConfirm, loading }: ReprovModalProps) {
  const [motivo, setMotivo] = useState("");
  const [fotoB64, setFotoB64] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFotoB64(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} color="#DC2626" />
            <h3 className="font-semibold text-base" style={{ color: C.esmeralda }}>
              Reprovar serviço
            </h3>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            {row.numero_ordem} — {row.cliente_nome ?? "—"}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
              Motivo da reprovação <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o problema encontrado..."
              rows={3}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none resize-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
              Foto do problema (opcional)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            {fotoB64 ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoB64} alt="preview" className="w-16 h-16 rounded-lg object-cover border" style={{ borderColor: C.cremeBorder }} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium" style={{ color: "#059669" }}>Foto selecionada</span>
                  <button onClick={() => setFotoB64(null)} className="text-xs underline text-left" style={{ color: "#6B7280" }}>
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              >
                Selecionar foto
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.cremeBorder }}>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: C.cremeBorder, color: "#374151" }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(motivo, fotoB64)}
            disabled={loading || !motivo.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Confirmar reprovação
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function ConferenciaClient({ aprovacoes, servicosConferencia }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mainView, setMainView]   = useState<MainView>("conferencia");
  const [tab, setTab]             = useState<TabFilter>("pendente");
  const [search, setSearch]       = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [localEtapas, setLocalEtapas]               = useState<Record<number, string>>({});
  const [localServicoEtapas, setLocalServicoEtapas] = useState<Record<number, string>>({});
  const [reprovModal, setReprovModal]     = useState<ServicoConferenciaRow | null>(null);
  const [loadingReprov, setLoadingReprov] = useState(false);

  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router]
  );

  function getEtapas(row: AprovacaoRow): string {
    return localEtapas[row.id] ?? row.etapas;
  }

  function getServicoEtapas(row: ServicoConferenciaRow): string {
    return localServicoEtapas[row.aprovacao_id] ?? row.aprovacao_etapas;
  }

  const pendentes  = aprovacoes.filter(a => { const e = getEtapas(a); return e === "pendente" || e === "aguardando"; }).length;
  const aprovadas  = aprovacoes.filter(a => getEtapas(a) === "aprovado").length;
  const reprovadas = aprovacoes.filter(a => getEtapas(a) === "reprovado").length;
  const servicosPendentes = servicosConferencia.filter(s => {
    const e = getServicoEtapas(s);
    return e === "pendente" || e === "aguardando";
  }).length;

  const filtered = aprovacoes.filter((a) => {
    const etapa = getEtapas(a);
    if (tab === "pendente" && etapa !== "pendente" && etapa !== "aguardando") return false;
    if (tab === "aprovado"  && etapa !== "aprovado")  return false;
    if (tab === "reprovado" && etapa !== "reprovado") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.numero_ordem ?? "").toLowerCase().includes(q) ||
        (a.cliente_nome ?? "").toLowerCase().includes(q) ||
        (a.consultora_nome ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Ações conferência geral ──────────────────────────────────────────────
  async function handleAction(aprovacaoId: number, etapas: "aprovado" | "reprovado") {
    setLoadingId(aprovacaoId);
    try {
      setLocalEtapas(prev => ({ ...prev, [aprovacaoId]: etapas }));
      const res = await fetch(`/api/aprovacao/${aprovacaoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLocalEtapas(prev => { const n = { ...prev }; delete n[aprovacaoId]; return n; });
        alert(data?.error ?? `Erro ${res.status}`);
        return;
      }
      refresh();
    } finally {
      setLoadingId(null);
    }
  }

  // ── Ações serviços ───────────────────────────────────────────────────────
  async function handleAprovarServico(row: ServicoConferenciaRow) {
    setLoadingId(row.aprovacao_id);
    try {
      setLocalServicoEtapas(prev => ({ ...prev, [row.aprovacao_id]: "aprovado" }));
      const res = await fetch(`/api/aprovacao/${row.aprovacao_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: "aprovado" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLocalServicoEtapas(prev => { const n = { ...prev }; delete n[row.aprovacao_id]; return n; });
        alert(data?.error ?? `Erro ${res.status}`);
        return;
      }
      refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleConfirmarReprovacao(motivo: string, fotoB64: string | null) {
    if (!reprovModal) return;
    setLoadingReprov(true);
    try {
      const res = await fetch("/api/service/reprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servico_id: reprovModal.servico_id,
          motivo_reprovacao: motivo,
          ...(fotoB64 ? { foto_reprovacao_base64: fotoB64 } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? `Erro ${res.status}`);
        return;
      }
      setLocalServicoEtapas(prev => ({ ...prev, [reprovModal.aprovacao_id]: "reprovado" }));
      setReprovModal(null);
      refresh();
    } finally {
      setLoadingReprov(false);
    }
  }

  const tabCfg: { value: TabFilter; label: string; count?: number }[] = [
    { value: "pendente",  label: "Pendentes",  count: pendentes },
    { value: "aprovado",  label: "Aprovadas",  count: aprovadas },
    { value: "reprovado", label: "Reprovadas", count: reprovadas },
    { value: "todos",     label: "Todas" },
  ];

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Conferência
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {mainView === "conferencia"
              ? "Aprovações de ordens pela consultora — conferência antes da entrega"
              : "Serviços prontos para conferência — compare fotos e aprove ou reprove"}
          </p>
        </div>

        {/* Toggle principal */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
          <button
            onClick={() => setMainView("conferencia")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: mainView === "conferencia" ? C.esmeralda : "#fff",
              color: mainView === "conferencia" ? C.creme : "#6B7280",
            }}
          >
            <ClipboardList size={14} />
            Conferência
          </button>
          <button
            onClick={() => setMainView("servicos")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: mainView === "servicos" ? C.esmeralda : "#fff",
              color: mainView === "servicos" ? C.creme : "#6B7280",
            }}
          >
            <Wrench size={14} />
            Serviços
            {servicosPendentes > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: mainView === "servicos" ? "rgba(255,255,255,0.25)" : "#FEF3C7",
                  color: mainView === "servicos" ? "#fff" : "#92400E",
                }}>
                {servicosPendentes}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── CONFERÊNCIA GERAL ─────────────────────────────────────────────────── */}
      {mainView === "conferencia" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 md:mb-6">
            <StatCard label="Pendentes"  value={pendentes}  color={pendentes > 0 ? "#92400E" : C.esmeralda} />
            <StatCard label="Aprovadas"  value={aprovadas}  color="#059669" />
            <StatCard label="Reprovadas" value={reprovadas} color="#DC2626" />
            <StatCard label="Total"      value={aprovacoes.length} color={C.esmeralda} />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 rounded-xl p-1"
              style={{ backgroundColor: C.creme, border: `1px solid ${C.cremeBorder}` }}>
              {tabCfg.map(({ value, label, count }) => {
                const isActive = tab === value;
                return (
                  <button key={value}
                    onClick={() => { setTab(value); setSearch(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ backgroundColor: isActive ? C.esmeralda : "transparent", color: isActive ? C.creme : "#6B7280" }}>
                    {label}
                    {count != null && count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                        style={{ backgroundColor: isActive ? "#ffffff30" : "#92400E20", color: isActive ? "#fff" : "#92400E" }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
              <input type="text" placeholder="Buscar por ordem, cliente, consultora..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }} />
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
                  {["Ordem", "Cliente", "Consultora", "Tipo", "Peso", "Data Entrega", "Criado em", "Status", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma conferência encontrada</td></tr>
                )}
                {filtered.map((a, i) => {
                  const etapa = getEtapas(a);
                  const isPendente = etapa === "pendente" || etapa === "aguardando";
                  const isLoading  = loadingId === a.id;
                  return (
                    <tr key={a.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                      <td className="px-4 py-3">
                        <Link href={`/ordens/${a.ordem_id}`} className="font-medium hover:underline" style={{ color: "#184036" }}>
                          {a.numero_ordem ?? `#${a.ordem_id}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{a.cliente_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{a.consultora_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{fmtTipoOrdem(a.tipo_ordem)}</td>
                      <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>{fmtNum(a.peso_metal_negociado)}</td>
                      <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>{fmt(a.data_entrega)}</td>
                      <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(a.created_at)}</td>
                      <td className="px-4 py-3"><EtapasBadge etapas={etapa} /></td>
                      <td className="px-4 py-3">
                        {isPendente ? (
                          <div className="flex items-center gap-2">
                            <button disabled={isLoading} onClick={() => handleAction(a.id, "aprovado")}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              Aprovar
                            </button>
                            <button disabled={isLoading} onClick={() => handleAction(a.id, "reprovado")}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                              Reprovar
                            </button>
                          </div>
                        ) : (
                          <span className="text-[12px]" style={{ color: "#D1D5DB" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="text-[11px] mt-2 text-right" style={{ color: "#9CA3AF" }}>
              {filtered.length} conferência{filtered.length !== 1 ? "s" : ""} exibida{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </>
      )}

      {/* ── SERVIÇOS CONFERÊNCIA ──────────────────────────────────────────────── */}
      {mainView === "servicos" && (
        <>
          {servicosConferencia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CheckCircle2 size={44} color="#D1D5DB" />
              <p className="text-base font-medium" style={{ color: "#6B7280" }}>Nenhum serviço aguardando conferência</p>
              <p className="text-sm" style={{ color: "#9CA3AF" }}>Serviços concluídos pelo operador aparecerão aqui</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {servicosConferencia.map(row => {
                const etapa      = getServicoEtapas(row);
                const isPendente = etapa === "pendente" || etapa === "aguardando";
                const isLoading  = loadingId === row.aprovacao_id;
                const difPeso    = row.peso_saida != null && row.peso_entrada != null
                  ? Number(row.peso_saida) - Number(row.peso_entrada)
                  : null;

                return (
                  <div key={row.servico_id}
                    className="rounded-2xl border bg-white overflow-hidden flex flex-col"
                    style={{ borderColor: C.cremeBorder }}>

                    {/* Card header */}
                    <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/ordens/${row.ordem_id}`}
                            className="font-bold text-sm hover:underline" style={{ color: C.esmeralda }}>
                            {row.numero_ordem ?? `#${row.ordem_id}`}
                          </Link>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "#FEF9C3", color: "#713F12" }}>
                            {fmtTipoOrdem(row.tipo_ordem)}
                          </span>
                          {row.tentativa > 1 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: "#FED7AA", color: "#7C2D12" }}>
                              {row.tentativa}ª tentativa
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                          {row.cliente_nome ?? "—"}
                          {row.operador_nome && <> · Operador: {row.operador_nome}</>}
                        </p>
                      </div>
                      {!isPendente && <EtapasBadge etapas={etapa} />}
                    </div>

                    {/* Comparação de fotos */}
                    <div className="px-4 py-2 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                          Como chegou
                        </p>
                        <FotoOuPlaceholder src={row.foto_peca_servico} label="Sem foto entrada" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold mb-1 uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                          Como ficou
                        </p>
                        <FotoOuPlaceholder src={row.foto_conclusao_servico} label="Sem foto saída" />
                      </div>
                    </div>

                    {/* Pesos */}
                    <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: "#6B7280" }}>
                        Entrada: <strong>{fmtNum(row.peso_entrada)}</strong>
                      </span>
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>→</span>
                      <span className="text-xs" style={{ color: "#6B7280" }}>
                        Saída: <strong>{fmtNum(row.peso_saida)}</strong>
                      </span>
                      {difPeso != null && (
                        <span className="text-xs font-bold"
                          style={{ color: difPeso >= 0 ? "#059669" : "#DC2626" }}>
                          ({difPeso >= 0 ? "+" : ""}{difPeso.toFixed(3)}g)
                        </span>
                      )}
                      {row.consumo_solda != null && (
                        <span className="text-xs" style={{ color: "#6B7280" }}>
                          · Aditivo: <strong>{fmtNum(row.consumo_solda)}</strong>
                        </span>
                      )}
                    </div>

                    {row.detalhes_ordem && (
                      <p className="px-4 text-[11px] italic line-clamp-1" style={{ color: "#9CA3AF" }}>
                        {row.detalhes_ordem}
                      </p>
                    )}
                    {row.concluido_em && (
                      <p className="px-4 pt-0.5 text-[10px]" style={{ color: "#9CA3AF" }}>
                        Concluído em {fmtHora(row.concluido_em)}
                      </p>
                    )}

                    {/* Ações */}
                    <div className="mt-auto px-4 pb-4 pt-3">
                      {isPendente ? (
                        <div className="flex gap-2">
                          <button disabled={isLoading} onClick={() => handleAprovarServico(row)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Aprovar
                          </button>
                          <button disabled={isLoading} onClick={() => setReprovModal(row)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            Reprovar
                          </button>
                        </div>
                      ) : (
                        <EtapasBadge etapas={etapa} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de reprovação */}
      {reprovModal && (
        <ReprovModal
          row={reprovModal}
          onClose={() => setReprovModal(null)}
          onConfirm={handleConfirmarReprovacao}
          loading={loadingReprov}
        />
      )}
    </div>
  );
}
