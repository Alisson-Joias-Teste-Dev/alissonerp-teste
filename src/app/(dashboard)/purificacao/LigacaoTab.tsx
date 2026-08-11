"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeImageUrl } from "@/lib/storage-url";
import {
  FlaskConical,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  TrendingDown,
  Lock,
  Unlock,
} from "lucide-react";
import { P, inputStyle, labelStyle, btnPrimary, btnSecondary } from "./_shared/estilos";
import { formatPeso, formatDate, timeAgo, STATUS_LABEL, STATUS_COLOR, ROLES_CANCELAR } from "./_shared/formatadores";
import { Section, Row, Overlay, ModalBox } from "./_shared/ui";
import { useFotoBalancaIA } from "./_shared/useFotoBalancaIA";
import { FotoBalancaIACampo } from "./_shared/FotoBalancaIACampo";
import { ResultadoProcessoBox } from "./_shared/ResultadoProcessoBox";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LigaTipo {
  id: number;
  tipo_18k_insumo_id: number;
  tipo_18k_nome: string;
  liga_insumo_id: number;
  liga_nome: string;
  teor_default: number;
  ativo: boolean;
  saldo_24k: number;
  saldo_liga: number;
}

export interface Ligacao {
  id: number;
  status: "em_processo" | "concluida" | "cancelada";
  tipo_18k_insumo_id: number;
  tipo_18k_nome: string;
  liga_insumo_id: number;
  liga_nome: string;
  peso_24k: number;
  pureza: number;
  teor: number;
  peso_liga_calculado: number;
  peso_18k_esperado: number;
  foto_envio: string | null;
  observacao_envio: string | null;
  data_envio: string;
  peso_18k_real: number | null;
  perda_processo: number | null;
  perda_percentual: number | null;
  foto_resultado: string | null;
  observacao_resultado: string | null;
  data_conclusao: string | null;
  criado_por_nome: string | null;
  criado_por_foto: string | null;
  concluido_por_nome: string | null;
}

export interface LigacaoStats {
  em_processo_count: number;
  em_processo_g: number;
  concluidas_30d: number;
  perda_media_pct: number;
}

const ROLES_LIGACAO  = ["admin", "desenvolvedor", "gerente_fabrica"];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LigacaoTab({
  ligacoes: initial,
  ligaTipos,
  stats,
  userRole,
  userId,
  permissoes,
}: {
  ligacoes: Ligacao[];
  ligaTipos: LigaTipo[];
  stats: LigacaoStats;
  userRole: string | null;
  userId: string | null;
  permissoes?: {
    abrir_ligacao: boolean;
    concluir_ligacao: boolean;
    editar_teor_ligacao?: boolean;
  };
}) {
  const router = useRouter();
  const [ligacoes, setLigacoes] = useState<Ligacao[]>(initial);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [canceladasAberto, setCanceladasAberto] = useState(false);

  const [modalNova, setModalNova] = useState(false);
  const [modalConcluir, setModalConcluir] = useState<Ligacao | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Ligacao | null>(null);

  const isFullAccess = userRole === "admin" || userRole === "desenvolvedor";
  const canCreate  = isFullAccess || (permissoes?.abrir_ligacao ?? false);
  const canConcluir = isFullAccess || (permissoes?.concluir_ligacao ?? false);
  const podeEditarTeor = isFullAccess || (permissoes?.editar_teor_ligacao ?? false);
  const canCancel  = userRole ? ROLES_CANCELAR.includes(userRole) : false;

  const filtradas = filtroStatus === "todos"
    ? ligacoes
    : ligacoes.filter(l => l.status === filtroStatus);

  const emProcesso = filtradas.filter(l => l.status === "em_processo");
  const concluidas = filtradas.filter(l => l.status === "concluida");
  const canceladas = filtradas.filter(l => l.status === "cancelada");

  async function reload() {
    const res = await fetch("/api/purificacao/ligacao");
    if (res.ok) {
      const data = await res.json();
      setLigacoes(data.ligacoes);
    }
    router.refresh();
  }

  // Saldo 24k (shared across all tipos)
  const saldo24k = ligaTipos[0]?.saldo_24k ?? 0;

  return (
    <div>
      {/* Header com botão */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        {canCreate && (
          <button
            onClick={() => setModalNova(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: P.rose, color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 20px",
              fontWeight: 600, cursor: "pointer", fontSize: 14,
            }}
          >
            <Plus size={18} /> Nova Ligação
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard
          icon={<Clock size={20} color={P.amber} />}
          label="Em Processo"
          value={`${stats.em_processo_count} lote${stats.em_processo_count !== 1 ? "s" : ""}`}
          sub={stats.em_processo_g > 0 ? formatPeso(stats.em_processo_g) + " 24k" : undefined}
          color={P.amber}
        />
        <StatCard
          icon={<CheckCircle size={20} color={P.verde} />}
          label="Concluídas (30 dias)"
          value={String(stats.concluidas_30d)}
          color={P.verde}
        />
        <StatCard
          icon={<TrendingDown size={20} color={stats.perda_media_pct > 2 ? P.vermelho : P.verde} />}
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
              padding: "6px 16px", borderRadius: 20,
              border: `2px solid ${filtroStatus === s ? P.rose : P.border}`,
              background: filtroStatus === s ? P.rose : P.card,
              color: filtroStatus === s ? "#fff" : P.text,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
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
            {emProcesso.map(l => (
              <LigacaoCard
                key={l.id}
                ligacao={l}
                onConcluir={() => setModalConcluir(l)}
                onCancelar={canCancel ? () => setConfirmCancel(l) : undefined}
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
            {concluidas.map(l => (
              <LigacaoCard key={l.id} ligacao={l} />
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
              {canceladas.map(l => (
                <LigacaoCard key={l.id} ligacao={l} />
              ))}
            </div>
          )}
        </div>
      )}

      {filtradas.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: P.muted }}>
          <FlaskConical size={48} color={P.border} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 16 }}>Nenhuma ligação encontrada</p>
        </div>
      )}

      {/* Modais */}
      {modalNova && (
        <ModalNovaLigacao
          ligaTipos={ligaTipos}
          saldo24k={saldo24k}
          userRole={userRole}
          userId={userId}
          podeEditarTeor={podeEditarTeor}
          onClose={() => setModalNova(false)}
          onSaved={reload}
        />
      )}
      {modalConcluir && (
        <ModalConcluirLigacao
          ligacao={modalConcluir}
          userRole={userRole}
          userId={userId}
          onClose={() => setModalConcluir(null)}
          onSaved={reload}
        />
      )}
      {confirmCancel && (
        <ModalConfirmCancel
          ligacao={confirmCancel}
          userRole={userRole}
          userId={userId}
          onClose={() => setConfirmCancel(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ background: color + "15", borderRadius: 8, padding: 10 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: P.muted, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: P.text }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: P.muted }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── LigacaoCard ──────────────────────────────────────────────────────────────
function LigacaoCard({
  ligacao,
  onConcluir,
  onCancelar,
  canCreate,
}: {
  ligacao: Ligacao;
  onConcluir?: () => void;
  onCancelar?: () => void;
  canCreate?: boolean;
}) {
  const statusColor = STATUS_COLOR[ligacao.status] ?? P.muted;

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
          <span style={{ fontWeight: 700, fontSize: 14, color: P.text }}>Ligação #{ligacao.id}</span>
          <div style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>
            {formatDate(ligacao.data_envio)} · {timeAgo(ligacao.data_envio)}
          </div>
        </div>
        <span style={{ fontSize: 11, background: statusColor + "20", color: statusColor, borderRadius: 8, padding: "3px 10px", fontWeight: 600 }}>
          {STATUS_LABEL[ligacao.status] ?? ligacao.status}
        </span>
      </div>

      {/* Resumo processo */}
      <div style={{ fontSize: 13, color: P.text, fontWeight: 600 }}>
        {formatPeso(ligacao.peso_24k)} 24k → {ligacao.tipo_18k_nome}
      </div>
      <div style={{ fontSize: 12, color: P.muted }}>
        {ligacao.liga_nome} · Teor: {(Number(ligacao.teor) * 100).toFixed(2)}%
        {Number(ligacao.pureza) < 100 && ` · Pureza: ${Number(ligacao.pureza).toFixed(2)}%`}
      </div>

      {/* Métricas */}
      <div style={{ background: P.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <Row label="24k usado"       value={formatPeso(ligacao.peso_24k)} />
        <Row label={ligacao.liga_nome} value={formatPeso(ligacao.peso_liga_calculado)} />
        <Row label="18k esperado"    value={formatPeso(ligacao.peso_18k_esperado)} bold />
        {ligacao.status === "concluida" && (
          <>
            <Row label="18k produzido" value={formatPeso(ligacao.peso_18k_real)} bold />
            <Row
              label="Perda"
              value={`${formatPeso(ligacao.perda_processo)} (${(ligacao.perda_percentual ?? 0).toFixed(2)}%)`}
              color={(ligacao.perda_percentual ?? 0) > 2 ? P.vermelho : P.verde}
            />
          </>
        )}
      </div>

      {/* Criado por */}
      {ligacao.criado_por_nome && (
        <div style={{ fontSize: 11, color: P.muted }}>Por: {ligacao.criado_por_nome}</div>
      )}
      {ligacao.concluido_por_nome && (
        <div style={{ fontSize: 11, color: P.muted }}>Concluído por: {ligacao.concluido_por_nome}</div>
      )}

      {/* Observações */}
      {ligacao.observacao_envio && (
        <div style={{ fontSize: 11, color: P.muted, fontStyle: "italic" }}>{ligacao.observacao_envio}</div>
      )}

      {/* Fotos — normalizeImageUrl converte URL antiga do bucket privado pro proxy autenticado */}
      {ligacao.foto_envio && (
        <a href={normalizeImageUrl(ligacao.foto_envio)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: P.azul }}>Ver foto envio</a>
      )}
      {ligacao.foto_resultado && (
        <a href={normalizeImageUrl(ligacao.foto_resultado)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: P.verde }}>Ver foto resultado</a>
      )}

      {/* Ações */}
      {ligacao.status === "em_processo" && (
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

// ─── Modal Nova Ligação ───────────────────────────────────────────────────────
function ModalNovaLigacao({
  ligaTipos,
  saldo24k,
  userRole,
  userId,
  podeEditarTeor,
  onClose,
  onSaved,
}: {
  ligaTipos: LigaTipo[];
  saldo24k: number;
  userRole: string | null;
  userId: string | null;
  podeEditarTeor: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const primeiro = ligaTipos[0];
  const [tipoSelecionado, setTipoSelecionado] = useState<LigaTipo | null>(primeiro ?? null);
  const [peso24k, setPeso24k] = useState("");
  const [pureza, setPureza] = useState("100.00");
  const [teor, setTeor] = useState(primeiro ? String((Number(primeiro.teor_default) * 100).toFixed(2)) : "75.00");
  const [teorManual, setTeorManual] = useState(false);
  const [observacao, setObservacao] = useState("");
  const { fotoBase64, fotoFile, iaResult, iaLoading, handleFoto, chamarIA, setIaResult } = useFotoBalancaIA();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Cálculo em tempo real
  const peso24kNum    = parseFloat(peso24k) || 0;
  const purezaNum     = Math.min(Math.max(parseFloat(pureza) || 100, 0), 100);
  const teorNum       = (parseFloat(teor) || 0) / 100;
  const ouroPuroReal  = Number((peso24kNum * purezaNum / 100).toFixed(3));
  const peso18k       = teorNum > 0 ? Number((ouroPuroReal / teorNum).toFixed(3)) : 0;
  const pesoLiga      = peso18k > 0 ? Number((peso18k - peso24kNum).toFixed(3)) : 0;
  const saldoLiga     = tipoSelecionado?.saldo_liga ?? 0;
  const quilatesAprox = Number((purezaNum / 100 * 24).toFixed(1));

  function onTipoChange(id: number) {
    const t = ligaTipos.find(lt => lt.tipo_18k_insumo_id === id);
    if (t) {
      setTipoSelecionado(t);
      // Só atualiza teor automaticamente se não está no modo manual
      if (!teorManual) {
        setTeor(String((Number(t.teor_default) * 100).toFixed(2)));
      }
    }
  }

  function toggleTeorManual() {
    if (teorManual) {
      // Ao travar de volta: restaurar teor automático do tipo selecionado
      if (tipoSelecionado) {
        setTeor(String((Number(tipoSelecionado.teor_default) * 100).toFixed(2)));
      }
      setTeorManual(false);
    } else {
      setTeorManual(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!tipoSelecionado) {
      setErro("Selecione o tipo de 18k");
      return;
    }
    if (!peso24kNum || peso24kNum <= 0) {
      setErro("Informe o peso do Ouro 24k");
      return;
    }
    if (!teorNum || teorNum <= 0 || teorNum > 1) {
      setErro("Teor inválido (1-100%)");
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
      const res = await fetch("/api/purificacao/ligacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_18k_insumo_id: tipoSelecionado.tipo_18k_insumo_id,
          peso_24k: peso24kNum,
          pureza: purezaNum,
          teor: teorNum,
          foto_envio: fotoBase64,
          observacao: observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar ligação");
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
      <ModalBox title="Nova Ligação" onClose={onClose}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tipo de 18k */}
          <div>
            <label style={labelStyle}>Tipo de 18k *</label>
            <select
              value={tipoSelecionado?.tipo_18k_insumo_id ?? ""}
              onChange={e => onTipoChange(Number(e.target.value))}
              style={inputStyle}
            >
              {ligaTipos.map(lt => (
                <option key={lt.tipo_18k_insumo_id} value={lt.tipo_18k_insumo_id}>
                  {lt.tipo_18k_nome}
                </option>
              ))}
            </select>
            {tipoSelecionado && (
              <div style={{ fontSize: 11, color: P.muted, marginTop: 4 }}>
                Liga: {tipoSelecionado.liga_nome} · Saldo: {formatPeso(saldoLiga)}
              </div>
            )}
          </div>

          {/* Peso Ouro */}
          <div>
            <label style={labelStyle}>Peso Ouro (g) *</label>
            <input
              type="number"
              placeholder="Ex: 75.00"
              value={peso24k}
              min={0.001}
              step="0.001"
              onChange={e => { setPeso24k(e.target.value); setIaResult(null); }}
              style={{ ...inputStyle, fontSize: 18, fontWeight: 700, borderColor: peso24kNum > saldo24k && peso24kNum > 0 ? P.vermelho : P.border }}
              required
            />
            <div style={{ fontSize: 11, color: peso24kNum > saldo24k && peso24kNum > 0 ? P.vermelho : P.muted, marginTop: 3 }}>
              Disponível: {formatPeso(saldo24k)}
              {peso24kNum > saldo24k && peso24kNum > 0 && " — Saldo insuficiente"}
            </div>
          </div>

          {/* Pureza */}
          <div>
            <label style={labelStyle}>Pureza (%) *</label>
            <input
              type="number"
              placeholder="Ex: 100.00"
              value={pureza}
              min={0.01}
              max={100}
              step="0.01"
              onChange={e => setPureza(e.target.value)}
              style={inputStyle}
              required
            />
            <div style={{ fontSize: 11, color: P.muted, marginTop: 3 }}>
              100 = 24k · 75 = 18k · 58.3 = 14k{purezaNum < 100 ? ` · ≈${quilatesAprox}k` : ""}
            </div>
          </div>

          {/* Teor — automático ou manual (bloqueado por permissão) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                TEOR (%) — {teorManual ? "MANUAL" : "AUTOMÁTICO"}
              </label>
              {podeEditarTeor && (
                <button
                  type="button"
                  onClick={toggleTeorManual}
                  title={teorManual ? "Travar teor (voltar ao automático)" : "Desbloquear edição manual do teor"}
                  style={{
                    background: "none",
                    border: `1px solid ${teorManual ? P.amber : P.border}`,
                    borderRadius: 6,
                    padding: "2px 8px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    color: teorManual ? P.amber : P.muted,
                    fontSize: 11,
                  }}
                >
                  {teorManual
                    ? <><Lock size={11} /> Travar</>
                    : <><Unlock size={11} /> Editar</>
                  }
                </button>
              )}
            </div>
            <input
              type="number"
              value={teor}
              readOnly={!teorManual}
              onChange={e => teorManual && setTeor(e.target.value)}
              style={{
                ...inputStyle,
                background: teorManual ? "#ffffff" : "#f3f4f6",
                cursor: teorManual ? "text" : "not-allowed",
                color: teorManual ? P.text : P.muted,
                borderColor: teorManual ? P.amber : P.border,
              }}
              title={teorManual ? "Teor editado manualmente" : "Definido nas configurações"}
            />
            <div style={{ fontSize: 11, color: teorManual ? P.amber : P.muted, marginTop: 3 }}>
              {teorManual
                ? "⚠️ Teor editado manualmente"
                : "Definido nas configurações — selecione o tipo de ouro para preencher"}
            </div>
          </div>

          {/* Cálculo em tempo real */}
          {peso24kNum > 0 && teorNum > 0 && (
            <div style={{
              background: P.bg,
              border: `1px solid ${P.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: P.text, marginBottom: 6 }}>Cálculo</div>
              <Row label="Ouro informado"  value={formatPeso(peso24kNum)} />
              <Row label={`Pureza`}        value={`${purezaNum.toFixed(2)}% (≈${quilatesAprox}k)`} />
              <Row label="Ouro puro real"  value={formatPeso(ouroPuroReal)} />
              <Row label="18k esperado"    value={formatPeso(peso18k)} bold />
              <Row
                label={tipoSelecionado?.liga_nome ?? "Liga necessária"}
                value={formatPeso(pesoLiga)}
                color={pesoLiga > saldoLiga ? P.vermelho : P.text}
              />
              <Row
                label="Liga disponível"
                value={`${formatPeso(saldoLiga)} ${pesoLiga <= saldoLiga ? "✅" : "❌"}`}
                color={pesoLiga > saldoLiga ? P.vermelho : P.verde}
              />
              {pesoLiga > saldoLiga && (
                <div style={{ color: P.vermelho, fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                  Saldo insuficiente de {tipoSelecionado?.liga_nome}
                </div>
              )}
            </div>
          )}

          {/* Foto da balança (OBRIGATÓRIA) */}
          <FotoBalancaIACampo
            label="Foto Balança *"
            textoSelecionada="Foto selecionada ✓"
            fotoBase64={fotoBase64}
            fotoFile={fotoFile}
            iaResult={iaResult}
            iaLoading={iaLoading}
            peso={peso24kNum}
            onFoto={file => handleFoto(file, peso24kNum)}
            onRevalidar={(file, peso) => void chamarIA(file, peso)}
          />

          {/* Observação */}
          <div>
            <label style={labelStyle}>Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              placeholder="Observações sobre o lote..."
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
              style={{ ...btnPrimary, background: P.rose, opacity: (!fotoBase64 || iaLoading || !iaResult) ? 0.5 : 1 }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
              {loading ? "Salvando..." : "Iniciar Ligação"}
            </button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Modal Concluir Ligação ───────────────────────────────────────────────────
function ModalConcluirLigacao({
  ligacao,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  ligacao: Ligacao;
  userRole: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [peso18kReal, setPeso18kReal] = useState("");
  const [observacao, setObservacao] = useState("");
  const { fotoBase64, fotoFile, iaResult, iaLoading, handleFoto, chamarIA, setIaResult } = useFotoBalancaIA();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pesoEsperado = Number(ligacao.peso_18k_esperado);
  const pesoRealNum  = parseFloat(peso18kReal) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!pesoRealNum || pesoRealNum <= 0) {
      setErro("Informe o peso do 18k produzido");
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
      const res = await fetch(`/api/purificacao/ligacao/${ligacao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peso_18k_real: pesoRealNum,
          foto_resultado: fotoBase64,
          observacao: observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao concluir ligação");
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
      <ModalBox title={`Concluir Ligação #${ligacao.id}`} onClose={onClose}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Dados readonly */}
          <div style={{ background: P.bg, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: P.muted, marginBottom: 6, fontSize: 11, textTransform: "uppercase" }}>Dados da Ligação</div>
            <Row label="24k usado"          value={formatPeso(ligacao.peso_24k)} />
            <Row label={ligacao.liga_nome}  value={formatPeso(ligacao.peso_liga_calculado)} />
            <Row label="Teor"               value={(ligacao.teor * 100).toFixed(2) + "%"} />
            <Row label="18k esperado"       value={formatPeso(pesoEsperado)} bold />
          </div>

          {/* Peso 18k real */}
          <div>
            <label style={labelStyle}>Peso 18k Produzido (g) *</label>
            <input
              type="number"
              placeholder="Ex: 99.80"
              value={peso18kReal}
              min={0.001}
              step="0.001"
              onChange={e => { setPeso18kReal(e.target.value); setIaResult(null); }}
              style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              required
            />
          </div>

          {/* Resultado em tempo real */}
          {pesoRealNum > 0 && (
            <ResultadoProcessoBox
              pesoEsperado={pesoEsperado}
              pesoRealNum={pesoRealNum}
              labelRetorno="Produzido"
              labelPerda="Perda"
            />
          )}

          {/* Foto */}
          <FotoBalancaIACampo
            label="Foto Balança (18k) *"
            textoSelecionada="Foto selecionada ✓"
            fotoBase64={fotoBase64}
            fotoFile={fotoFile}
            iaResult={iaResult}
            iaLoading={iaLoading}
            peso={pesoRealNum}
            onFoto={file => handleFoto(file, pesoRealNum)}
            onRevalidar={(file, peso) => void chamarIA(file, peso)}
          />

          {/* Observação */}
          <div>
            <label style={labelStyle}>Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              placeholder="Observações sobre o resultado..."
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
              {loading ? "Salvando..." : "Concluir Ligação"}
            </button>
          </div>
        </form>
      </ModalBox>
    </Overlay>
  );
}

// ─── Modal Confirmar Cancelamento ─────────────────────────────────────────────
function ModalConfirmCancel({
  ligacao,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  ligacao: Ligacao;
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
      const res = await fetch(`/api/purificacao/ligacao/${ligacao.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao cancelar ligação");
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
      <ModalBox title="Cancelar Ligação" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AlertTriangle size={24} color={P.vermelho} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ color: P.text, fontWeight: 600, margin: "0 0 8px" }}>
                Cancelar Ligação #{ligacao.id}?
              </p>
              <p style={{ color: P.muted, fontSize: 13, margin: 0 }}>
                Esta ação irá estornar {formatPeso(ligacao.peso_24k)} de Ouro 24k
                e {formatPeso(ligacao.peso_liga_calculado)} de {ligacao.liga_nome} de volta para o pote.
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

