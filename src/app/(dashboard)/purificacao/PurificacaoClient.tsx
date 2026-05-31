"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Flame,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Camera,
  Loader2,
  AlertTriangle,
  Trash2,
  X,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import LigacaoTab, { type LigaTipo, type Ligacao, type LigacaoStats } from "./LigacaoTab";
import LimpezaTab from "./LimpezaTab";
import { normalizeImageUrl } from "@/lib/storage-url";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  text:     "#111827",
  muted:    "#6b7280",
  amber:    "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
  azul:     "#2563eb",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Teor {
  id: number;
  insumo_id: number;
  nome: string;
  teor: number;
  ativo: boolean;
  sku: string;
  unidade: string;
  saldo: number | null;
}

interface ItemPurif {
  insumo_id: number;
  peso: number;
  teor: number;
}

interface Purificacao {
  id: number;
  status: "em_processo" | "concluida" | "cancelada";
  itens: ItemPurif[];
  peso_total_enviado: number;
  teor_medio: number;
  peso_esperado_24k: number;
  foto_envio: string | null;
  observacao_envio: string | null;
  data_envio: string;
  peso_retornado_24k: number | null;
  perda_processo: number | null;
  perda_percentual: number | null;
  foto_retorno: string | null;
  observacao_retorno: string | null;
  data_retorno: string | null;
  criado_por_nome: string | null;
  criado_por_foto: string | null;
  concluido_por_nome: string | null;
}

interface Stats {
  em_processo_g: number;
  concluidas_30d: number;
  perda_media_pct: number;
}

interface Props {
  purificacoes: Purificacao[];
  teores: Teor[];
  stats: Stats;
  ligacoes: Ligacao[];
  ligaTipos: LigaTipo[];
  ligacaoStats: LigacaoStats;
  userRole: string | null;
  userId: string | null;
  permissoesPurif: {
    abrir_purificacao: boolean;
    concluir_purificacao: boolean;
    abrir_ligacao: boolean;
    concluir_ligacao: boolean;
    editar_teor_ligacao: boolean;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPeso(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return isNaN(v) ? "—" : v.toFixed(2) + "g";
}
function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatTeor(t: number): string {
  return (t * 100).toFixed(2) + "%";
}

const STATUS_LABEL: Record<string, string> = {
  em_processo: "Em Processo",
  concluida:   "Concluída",
  cancelada:   "Cancelada",
};
const STATUS_COLOR: Record<string, string> = {
  em_processo: "#d97706",
  concluida:   "#16a34a",
  cancelada:   "#6b7280",
};

const ROLES_CANCELAR = ["admin", "desenvolvedor"];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PurificacaoClient({ purificacoes: initial, teores, stats, ligacoes, ligaTipos, ligacaoStats, userRole, userId, permissoesPurif }: Props) {
  const router = useRouter();
  const [purificacoes, setPurificacoes] = useState<Purificacao[]>(initial);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [canceladasAberto, setCanceladasAberto] = useState(false);
  const [activeTab, setActiveTab] = useState<"purificacao" | "ligacao" | "limpeza">("purificacao");

  // Modais
  const [modalNova, setModalNova] = useState(false);
  const [modalConcluir, setModalConcluir] = useState<Purificacao | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Purificacao | null>(null);

  const isFullAccess = userRole === "admin" || userRole === "desenvolvedor";
  const canCreate  = isFullAccess || permissoesPurif.abrir_purificacao;
  const canConcluir = isFullAccess || permissoesPurif.concluir_purificacao;
  const canCancel  = userRole ? ROLES_CANCELAR.includes(userRole) : false;

  // Filtrar
  const filtradas = filtroStatus === "todos"
    ? purificacoes
    : purificacoes.filter(p => p.status === filtroStatus);

  const emProcesso = filtradas.filter(p => p.status === "em_processo");
  const concluidas = filtradas.filter(p => p.status === "concluida");
  const canceladas = filtradas.filter(p => p.status === "cancelada");

  async function reload() {
    const res = await fetch("/api/purificacao");
    if (res.ok) {
      const data = await res.json();
      setPurificacoes(data.purificacoes);
    }
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Flame size={28} color={P.amber} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: P.text, margin: 0 }}>Purificação de Ouro</h1>
        </div>
        {activeTab === "purificacao" && canCreate && (
          <button
            onClick={() => setModalNova(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: P.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            <Plus size={18} />
            Nova Purificação
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `2px solid ${P.border}`, flexWrap: "wrap" }}>
        {([
          { key: "purificacao", label: "Purificação", icon: <Flame size={15} /> },
          { key: "ligacao",     label: "Ligação",     icon: <FlaskConical size={15} /> },
          { key: "limpeza",     label: "Limpeza",     icon: <Sparkles size={15} /> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: `3px solid ${activeTab === tab.key ? P.amber : "transparent"}`,
              color: activeTab === tab.key ? P.amber : P.muted,
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              marginBottom: -2,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA LIGAÇÃO ────────────────────────────────────────────────────────── */}
      {activeTab === "ligacao" && (
        <LigacaoTab
          ligacoes={ligacoes}
          ligaTipos={ligaTipos}
          stats={ligacaoStats}
          userRole={userRole}
          userId={userId}
          permissoes={permissoesPurif}
        />
      )}

      {/* ── ABA LIMPEZA ────────────────────────────────────────────────────────── */}
      {activeTab === "limpeza" && (
        <LimpezaTab
          userRole={userRole}
          userId={userId}
        />
      )}

      {/* ── ABA PURIFICAÇÃO ────────────────────────────────────────────────────── */}
      {activeTab === "purificacao" && (
      <>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard
          icon={<Clock size={20} color={P.amber} />}
          label="Em Processo"
          value={formatPeso(stats.em_processo_g)}
          color={P.amber}
        />
        <StatCard
          icon={<CheckCircle size={20} color={P.verde} />}
          label="Concluídas (30 dias)"
          value={String(stats.concluidas_30d)}
          color={P.verde}
        />
        <StatCard
          icon={<Flame size={20} color={P.vermelho} />}
          label="Perda Média (30 dias)"
          value={stats.perda_media_pct.toFixed(2) + "%"}
          color={stats.perda_media_pct > 2 ? P.vermelho : P.verde}
        />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["todos", "em_processo", "concluida", "cancelada"].map(s => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              border: `2px solid ${filtroStatus === s ? P.amber : P.border}`,
              background: filtroStatus === s ? P.amber : P.card,
              color: filtroStatus === s ? "#fff" : P.text,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {s === "todos" ? "Todos" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Em Processo */}
      {emProcesso.length > 0 && (
        <Section title="Em Processo" count={emProcesso.length} color={P.amber}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {emProcesso.map(p => (
              <PurificacaoCard
                key={p.id}
                purif={p}
                teores={teores}
                onConcluir={() => setModalConcluir(p)}
                onCancelar={canCancel ? () => setConfirmCancel(p) : undefined}
                canCreate={canConcluir}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Concluídas */}
      {concluidas.length > 0 && (
        <Section title="Concluídas" count={concluidas.length} color={P.verde}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {concluidas.map(p => (
              <PurificacaoCard key={p.id} purif={p} teores={teores} />
            ))}
          </div>
        </Section>
      )}

      {/* Canceladas (colapsável) */}
      {canceladas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setCanceladasAberto(!canceladasAberto)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: P.muted, fontWeight: 600, fontSize: 14, marginBottom: 8 }}
          >
            {canceladasAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Canceladas ({canceladas.length})
          </button>
          {canceladasAberto && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {canceladas.map(p => (
                <PurificacaoCard key={p.id} purif={p} teores={teores} />
              ))}
            </div>
          )}
        </div>
      )}

      {filtradas.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: P.muted }}>
          <Flame size={48} color={P.border} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 16 }}>Nenhuma purificação encontrada</p>
        </div>
      )}

      {/* Modais */}
      {modalNova && (
        <ModalNovaPurificacao
          teores={teores}
          userRole={userRole}
          userId={userId}
          onClose={() => setModalNova(false)}
          onSaved={reload}
        />
      )}
      {modalConcluir && (
        <ModalConcluir
          purif={modalConcluir}
          userRole={userRole}
          userId={userId}
          onClose={() => setModalConcluir(null)}
          onSaved={reload}
        />
      )}
      {confirmCancel && (
        <ModalConfirmCancel
          purif={confirmCancel}
          userRole={userRole}
          userId={userId}
          onClose={() => setConfirmCancel(null)}
          onSaved={reload}
        />
      )}
      </>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ background: color + "15", borderRadius: 8, padding: 10 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: P.muted, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: P.text }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: P.text, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, background: color + "20", color: color, borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

// ─── PurificacaoCard ──────────────────────────────────────────────────────────
function PurificacaoCard({
  purif,
  teores,
  onConcluir,
  onCancelar,
  canCreate,
}: {
  purif: Purificacao;
  teores: Teor[];
  onConcluir?: () => void;
  onCancelar?: () => void;
  canCreate?: boolean;
}) {
  const statusColor = STATUS_COLOR[purif.status] ?? P.muted;

  return (
    <div style={{
      background: P.card,
      border: `1px solid ${P.border}`,
      borderLeft: `4px solid ${statusColor}`,
      borderRadius: 12,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: P.text }}>Purif. #{purif.id}</span>
          <div style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>{formatDate(purif.data_envio)}</div>
        </div>
        <span style={{ fontSize: 11, background: statusColor + "20", color: statusColor, borderRadius: 8, padding: "3px 10px", fontWeight: 600 }}>
          {STATUS_LABEL[purif.status] ?? purif.status}
        </span>
      </div>

      {/* Itens */}
      <div style={{ fontSize: 12, color: P.muted }}>
        {purif.itens.map((item: { insumo_id: number; peso: number }, i: number) => {
          const teor = teores.find(t => t.insumo_id === item.insumo_id);
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{teor?.nome ?? `Insumo #${item.insumo_id}`}</span>
              <span style={{ fontWeight: 600, color: P.text }}>{formatPeso(item.peso)}</span>
            </div>
          );
        })}
      </div>

      {/* Métricas */}
      <div style={{ background: P.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <Row label="Total Enviado" value={formatPeso(purif.peso_total_enviado)} />
        <Row label="Teor Médio" value={formatTeor(purif.teor_medio)} />
        <Row label="24k Esperado" value={formatPeso(purif.peso_esperado_24k)} bold />
        {purif.status === "concluida" && (
          <>
            <Row label="24k Retornado" value={formatPeso(purif.peso_retornado_24k)} bold />
            <Row
              label="Perda"
              value={`${formatPeso(purif.perda_processo)} (${(purif.perda_percentual ?? 0).toFixed(2)}%)`}
              color={(purif.perda_percentual ?? 0) > 2 ? P.vermelho : P.verde}
            />
          </>
        )}
      </div>

      {/* Criado por */}
      {purif.criado_por_nome && (
        <div style={{ fontSize: 11, color: P.muted }}>Por: {purif.criado_por_nome}</div>
      )}
      {purif.concluido_por_nome && (
        <div style={{ fontSize: 11, color: P.muted }}>Concluído por: {purif.concluido_por_nome}</div>
      )}

      {/* Observações */}
      {purif.observacao_envio && (
        <div style={{ fontSize: 11, color: P.muted, fontStyle: "italic" }}>{purif.observacao_envio}</div>
      )}

      {/* Foto envio — normalizeImageUrl converte URL antiga do bucket privado pro proxy autenticado */}
      {purif.foto_envio && (
        <a href={normalizeImageUrl(purif.foto_envio)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: P.azul }}>Ver foto envio</a>
      )}
      {purif.foto_retorno && (
        <a href={normalizeImageUrl(purif.foto_retorno)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: P.verde }}>Ver foto retorno</a>
      )}

      {/* Ações */}
      {purif.status === "em_processo" && (
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {canCreate && onConcluir && (
            <button
              onClick={onConcluir}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.verde, color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
            >
              <CheckCircle size={14} /> Concluir
            </button>
          )}
          {onCancelar && (
            <button
              onClick={onCancelar}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", color: P.vermelho, border: `1px solid ${P.vermelho}`, borderRadius: 8, padding: "8px 12px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
            >
              <XCircle size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ color: P.muted }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: color ?? P.text }}>{value}</span>
    </div>
  );
}

// ─── Modal Nova Purificação ───────────────────────────────────────────────────
function ModalNovaPurificacao({
  teores,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  teores: Teor[];
  userRole: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itens, setItens] = useState<{ insumo_id: number; peso: string; teor: string }[]>([
    { insumo_id: teores[0]?.insumo_id ?? 0, peso: "", teor: teores[0] ? String((teores[0].teor * 100).toFixed(2)) : "" },
  ]);
  const [observacao, setObservacao] = useState("");
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [iaResult, setIaResult] = useState<{ peso_digitado: number; peso_balanca: number | null; confianca: string; match: boolean; mensagem: string } | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addItem() {
    setItens(prev => [...prev, { insumo_id: teores[0]?.insumo_id ?? 0, peso: "", teor: teores[0] ? String((teores[0].teor * 100).toFixed(2)) : "" }]);
  }

  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i));
  }

  function changeItem(i: number, field: string, value: string | number) {
    setItens(prev => {
      const next = [...prev];
      if (field === "insumo_id") {
        const t = teores.find(t => t.insumo_id === Number(value));
        next[i] = { ...next[i], insumo_id: Number(value), teor: t ? String((t.teor * 100).toFixed(2)) : next[i].teor };
      } else {
        next[i] = { ...next[i], [field]: String(value) };
      }
      return next;
    });
  }

  async function chamarIA(file: File, peso: number) {
    setIaLoading(true);
    setIaResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("peso", String(peso));
      fd.append("tipo", "metal");
      const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const data = await res.json() as { peso_digitado: number; peso_balanca: number | null; confianca: string; match: boolean; mensagem: string };
      setIaResult(data);
    } catch {
      setIaResult({ peso_digitado: peso, peso_balanca: null, confianca: "nenhuma", match: false, mensagem: "Erro ao contatar IA" });
    } finally {
      setIaLoading(false);
    }
  }

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setIaResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFotoBase64(reader.result as string);
      if (pesoTotal > 0) void chamarIA(file, pesoTotal);
    };
    reader.readAsDataURL(file);
  }

  // Calcular resumo em tempo real
  const validItens = itens.filter(i => i.insumo_id && parseFloat(i.peso) > 0 && parseFloat(i.teor) > 0);
  const pesoTotal = validItens.reduce((s, i) => s + parseFloat(i.peso), 0);
  const teorMedio = validItens.length > 0
    ? validItens.reduce((s, i) => s + parseFloat(i.peso) * (parseFloat(i.teor) / 100), 0) / pesoTotal
    : 0;
  const esperado24k = pesoTotal * teorMedio;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (validItens.length === 0) {
      setErro("Adicione pelo menos um item com peso válido");
      return;
    }
    if (!fotoBase64) {
      setErro("Foto da balança é obrigatória");
      return;
    }
    if (!iaResult) {
      setErro("Aguarde a validação da IA após selecionar a foto");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/purificacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: validItens.map(i => ({
            insumo_id: i.insumo_id,
            peso: parseFloat(i.peso),
            teor: parseFloat(i.teor) / 100,
          })),
          foto_envio: fotoBase64,
          observacao_envio: observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar purificação");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalBox title="Nova Purificação" onClose={onClose}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Itens */}
          <div>
            <label style={labelStyle}>Itens a purificar</label>
            {itens.map((item, i) => {
              const t = teores.find(t => t.insumo_id === item.insumo_id);
              const saldo = t?.saldo ?? null;
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <select
                      value={item.insumo_id}
                      onChange={e => changeItem(i, "insumo_id", e.target.value)}
                      style={inputStyle}
                    >
                      {teores.map(t => (
                        <option key={t.insumo_id} value={t.insumo_id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                    {saldo !== null && (
                      <div style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>
                        Saldo: {formatPeso(saldo)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 80 }}>
                    <input
                      type="number"
                      placeholder="Peso (g)"
                      value={item.peso}
                      min={0.01}
                      step="0.01"
                      onChange={e => changeItem(i, "peso", e.target.value)}
                      style={{ ...inputStyle, borderColor: saldo !== null && parseFloat(item.peso) > saldo ? P.vermelho : P.border }}
                    />
                    {saldo !== null && parseFloat(item.peso) > saldo && (
                      <div style={{ fontSize: 11, color: P.vermelho }}>Excede saldo</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 80 }}>
                    <input
                      type="number"
                      placeholder="Teor %"
                      value={item.teor}
                      min={1}
                      max={100}
                      step="0.01"
                      onChange={e => changeItem(i, "teor", e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: P.vermelho, padding: "8px 0" }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addItem}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px dashed ${P.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: P.muted, fontSize: 13 }}
            >
              <Plus size={14} /> Adicionar outro tipo
            </button>
          </div>

          {/* Resumo */}
          {pesoTotal > 0 && (
            <div style={{ background: P.bg, border: `1px solid ${P.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: P.text, marginBottom: 6 }}>Resumo</div>
              <Row label="Total enviado" value={formatPeso(pesoTotal)} />
              <Row label="Teor médio" value={formatTeor(teorMedio)} />
              <Row label="24k esperado" value={formatPeso(esperado24k)} bold />
            </div>
          )}

          {/* Foto da balança (OBRIGATÓRIA) */}
          <div>
            <label style={labelStyle}>Foto da balança *</label>
            <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={onFoto} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: P.bg,
                border: `1px dashed ${fotoBase64 ? P.verde : P.vermelho}`,
                borderRadius: 8, padding: "10px 16px", cursor: "pointer",
                color: fotoBase64 ? P.verde : P.muted, fontSize: 13, width: "100%",
              }}
            >
              <Camera size={16} />
              {fotoBase64 ? "Foto da balança selecionada ✓" : "Selecionar foto da balança (obrigatório)"}
            </button>
            {fotoBase64 && (
              <img src={fotoBase64} alt="preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, objectFit: "cover" }} />
            )}
            {/* Resultado da IA */}
            {iaLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: P.muted }}>
                <Loader2 size={14} className="animate-spin" /> Validando peso com IA...
              </div>
            )}
            {!iaLoading && iaResult && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                background: iaResult.match ? "#dcfce7" : "#fef9c3",
                border: `1px solid ${iaResult.match ? P.verde : "#ca8a04"}`,
                color: iaResult.match ? P.verde : "#854d0e",
              }}>
                {iaResult.peso_balanca !== null
                  ? `IA leu: ${iaResult.peso_balanca.toFixed(2)}g · Informado: ${iaResult.peso_digitado.toFixed(2)}g · ${iaResult.match ? "✅ OK" : "⚠️ Divergência"}`
                  : `⚠️ IA não conseguiu ler o peso — ${iaResult.mensagem}`
                }
              </div>
            )}
            {!iaLoading && fotoFile && pesoTotal > 0 && !iaResult && (
              <button
                type="button"
                onClick={() => void chamarIA(fotoFile, pesoTotal)}
                style={{ marginTop: 8, fontSize: 12, color: P.azul, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Revalidar com IA
              </button>
            )}
          </div>

          {/* Observação */}
          <div>
            <label style={labelStyle}>Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              placeholder="Observações sobre o envio..."
            />
          </div>

          {erro && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fee2e2", color: P.vermelho, padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
              <AlertTriangle size={16} /> {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button
              type="submit"
              disabled={loading || !fotoBase64 || iaLoading || !iaResult}
              style={{ ...btnPrimary, opacity: (!fotoBase64 || iaLoading || !iaResult) ? 0.5 : 1 }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
              {loading ? "Salvando..." : "Registrar Purificação"}
            </button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Modal Concluir Purificação ───────────────────────────────────────────────
function ModalConcluir({
  purif,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  purif: Purificacao;
  userRole: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pesoRetornado, setPesoRetornado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [iaResult, setIaResult] = useState<{ peso_digitado: number; peso_balanca: number | null; confianca: string; match: boolean; mensagem: string } | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pesoEsperado = Number(purif.peso_esperado_24k);
  const retornadoNum = parseFloat(pesoRetornado) || 0;
  const perda = pesoEsperado > 0 ? pesoEsperado - retornadoNum : 0;
  const perdaPct = pesoEsperado > 0 ? (perda / pesoEsperado) * 100 : 0;
  const perdaAlta = perdaPct > 2;
  const perdaBaixa = retornadoNum > 0 && perdaPct < 1;

  async function chamarIA(file: File, peso: number) {
    setIaLoading(true);
    setIaResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("peso", String(peso));
      fd.append("tipo", "metal");
      const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const data = await res.json() as { peso_digitado: number; peso_balanca: number | null; confianca: string; match: boolean; mensagem: string };
      setIaResult(data);
    } catch {
      setIaResult({ peso_digitado: peso, peso_balanca: null, confianca: "nenhuma", match: false, mensagem: "Erro ao contatar IA" });
    } finally {
      setIaLoading(false);
    }
  }

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setIaResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFotoBase64(reader.result as string);
      if (retornadoNum > 0) void chamarIA(file, retornadoNum);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!retornadoNum || retornadoNum <= 0) {
      setErro("Informe o peso retornado");
      return;
    }
    if (!fotoBase64) {
      setErro("Foto da balança é obrigatória");
      return;
    }
    if (!iaResult) {
      setErro("Aguarde a validação da IA após selecionar a foto");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/purificacao/${purif.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peso_retornado_24k: retornadoNum,
          foto_retorno: fotoBase64,
          observacao_retorno: observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao concluir purificação");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalBox title={`Concluir Purificação #${purif.id}`} onClose={onClose}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Dados envio (readonly) */}
          <div style={{ background: P.bg, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: P.muted, marginBottom: 6, fontSize: 11, textTransform: "uppercase" }}>Envio</div>
            <Row label="Data envio" value={formatDate(purif.data_envio)} />
            <Row label="Total enviado" value={formatPeso(purif.peso_total_enviado)} />
            <Row label="Teor médio" value={formatTeor(purif.teor_medio)} />
            <Row label="24k esperado" value={formatPeso(pesoEsperado)} bold />
          </div>

          {/* Peso retornado */}
          <div>
            <label style={labelStyle}>Peso Retornado 24k (g)</label>
            <input
              type="number"
              placeholder="Ex: 12.50"
              value={pesoRetornado}
              min={0.01}
              step="0.01"
              onChange={e => setPesoRetornado(e.target.value)}
              style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              required
            />
          </div>

          {/* Resultado em tempo real */}
          {retornadoNum > 0 && (
            <div style={{
              background: perdaAlta ? "#fee2e2" : perdaBaixa ? "#dcfce7" : P.bg,
              border: `1px solid ${perdaAlta ? P.vermelho : perdaBaixa ? P.verde : P.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
            }}>
              <Row label="Esperado" value={formatPeso(pesoEsperado)} />
              <Row label="Retornado" value={formatPeso(retornadoNum)} bold />
              <Row
                label="Perda processo"
                value={`${formatPeso(perda)} (${perdaPct.toFixed(2)}%)`}
                color={perdaAlta ? P.vermelho : perdaBaixa ? P.verde : P.text}
                bold
              />
              {perdaAlta && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.vermelho, marginTop: 6, fontWeight: 600 }}>
                  <AlertTriangle size={14} /> Perda acima de 2% — verificar processo
                </div>
              )}
              {perdaBaixa && (
                <div style={{ color: P.verde, marginTop: 6, fontWeight: 600 }}>Excelente rendimento (abaixo de 1%)</div>
              )}
            </div>
          )}

          {/* Foto da balança (OBRIGATÓRIA) */}
          <div>
            <label style={labelStyle}>Foto da balança *</label>
            <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={onFoto} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: P.bg,
                border: `1px dashed ${fotoBase64 ? P.verde : P.vermelho}`,
                borderRadius: 8, padding: "10px 16px", cursor: "pointer",
                color: fotoBase64 ? P.verde : P.muted, fontSize: 13, width: "100%",
              }}
            >
              <Camera size={16} />
              {fotoBase64 ? "Foto da balança selecionada ✓" : "Selecionar foto da balança (obrigatório)"}
            </button>
            {fotoBase64 && (
              <img src={fotoBase64} alt="preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, objectFit: "cover" }} />
            )}
            {/* Resultado da IA */}
            {iaLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: P.muted }}>
                <Loader2 size={14} className="animate-spin" /> Validando peso com IA...
              </div>
            )}
            {!iaLoading && iaResult && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                background: iaResult.match ? "#dcfce7" : "#fef9c3",
                border: `1px solid ${iaResult.match ? P.verde : "#ca8a04"}`,
                color: iaResult.match ? P.verde : "#854d0e",
              }}>
                {iaResult.peso_balanca !== null
                  ? `IA leu: ${iaResult.peso_balanca.toFixed(2)}g · Informado: ${iaResult.peso_digitado.toFixed(2)}g · ${iaResult.match ? "✅ OK" : "⚠️ Divergência"}`
                  : `⚠️ IA não conseguiu ler o peso — ${iaResult.mensagem}`
                }
              </div>
            )}
            {!iaLoading && fotoFile && retornadoNum > 0 && !iaResult && (
              <button
                type="button"
                onClick={() => void chamarIA(fotoFile, retornadoNum)}
                style={{ marginTop: 8, fontSize: 12, color: P.azul, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Revalidar com IA
              </button>
            )}
          </div>

          {/* Observação */}
          <div>
            <label style={labelStyle}>Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              placeholder="Observações sobre o retorno..."
            />
          </div>

          {erro && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fee2e2", color: P.vermelho, padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
              <AlertTriangle size={16} /> {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button
              type="submit"
              disabled={loading || !fotoBase64 || iaLoading || !iaResult}
              style={{ ...btnPrimary, background: P.verde, opacity: (!fotoBase64 || iaLoading || !iaResult) ? 0.5 : 1 }}
            >
              {loading ? <Loader2 size={16} /> : <CheckCircle size={16} />}
              {loading ? "Salvando..." : "Confirmar Retorno"}
            </button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Modal Confirmar Cancelamento ─────────────────────────────────────────────
function ModalConfirmCancel({
  purif,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  purif: Purificacao;
  userRole: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleCancel() {
    setErro(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/purificacao/${purif.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao cancelar purificação");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalBox title="Cancelar Purificação" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AlertTriangle size={24} color={P.vermelho} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ color: P.text, fontWeight: 600, margin: "0 0 8px" }}>
                Cancelar Purificação #{purif.id}?
              </p>
              <p style={{ color: P.muted, fontSize: 13, margin: 0 }}>
                Esta ação irá estornar {formatPeso(purif.peso_total_enviado)} de volta para o pote (Almoxarifado).
                Esta operação não pode ser desfeita.
              </p>
            </div>
          </div>
          {erro && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fee2e2", color: P.vermelho, padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
              <AlertTriangle size={16} /> {erro}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={btnSecondary}>Não cancelar</button>
            <button
              onClick={handleCancel}
              disabled={loading}
              style={{ ...btnPrimary, background: P.vermelho }}
            >
              {loading ? <Loader2 size={16} /> : <XCircle size={16} />}
              {loading ? "Cancelando..." : "Confirmar Cancelamento"}
            </button>
          </div>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function ModalBox({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      background: P.card, borderRadius: 16, padding: 24,
      width: "100%", maxWidth: 520, maxHeight: "90vh",
      overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: P.text }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: P.muted, padding: 4 }}>
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${P.border}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: P.text,
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: P.muted,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const btnPrimary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: P.amber,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#fff",
  color: P.text,
  border: `1px solid ${P.border}`,
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};
