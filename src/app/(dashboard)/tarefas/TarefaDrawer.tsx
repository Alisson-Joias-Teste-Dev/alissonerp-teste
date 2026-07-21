"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Loader2, Send, ShieldCheck, Check, XCircle,
  Trash2, Calendar, User, Tag, MessageSquare, Edit3,
  Paperclip, History, ArrowRightLeft,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { getPublicUrl } from "@/lib/storage-url";
import { useErrorStore } from "@/stores/errorStore";
import { type Tarefa, type Usuario, PRIORIDADE_BADGE, STATUS_COLS } from "./TarefasClient";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Comentario {
  id: number;
  texto: string;
  autor_id: string;
  autor_nome: string;
  created_at: string;
}

interface Aprovacao {
  id: number;
  status: string;
  motivo: string | null;
  solicitante_nome: string;
  aprovador_nome: string;
  aprovador_id: string;
  created_at: string;
  respondido_em: string | null;
}

interface HistoricoEntry {
  id: number;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  comentario: string | null;
  usuario_nome: string | null;
  created_at: string;
}

interface Anexo {
  id: number;
  nome: string;
  url: string;
  tamanho: number | null;
  tipo_mime: string | null;
  usuario_nome: string | null;
  created_at: string;
}

interface EvidenciaLimpeza {
  id: number;
  gramas: number;
  destino: string;
  limpeza_peso_limpo: number | null;
  limpeza_perda_bruta_g: number | null;
  limpeza_perda_bruta_pct: number | null;
  limpeza_perda_ouro_g: number | null;
  limpeza_perda_ouro_pct: number | null;
  limpeza_houve_pedras: boolean | null;
  limpeza_peso_pedras: number | null;
  limpeza_foto_antes_path: string | null;
  limpeza_foto_depois_path: string | null;
  limpeza_foto_peso_pedras_path: string | null;
}

interface Props {
  tarefa: Tarefa;
  usuarios: Usuario[];
  currentUserId: string;
  role: string;
  podeGerenciar: boolean;
  onClose: () => void;
  onUpdated: (t: Partial<Tarefa> & { id: number }) => void;
  onDeleted: (id: number) => void;
}

function safeDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

function fmt(d: string | null | undefined): string {
  const date = safeDate(d);
  if (!date) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtHora(d: string | null | undefined): string {
  const date = safeDate(d);
  if (!date) return "-";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(acao: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    criada: { label: "Criada", color: "#6B7280", bg: "#F3F4F6" },
    pendente: { label: "Pendente", color: "#6B7280", bg: "#F3F4F6" },
    em_andamento: { label: "Em Andamento", color: "#D97706", bg: "#FEF3C7" },
    aguardando_aprovacao: { label: "Aguard. Aprovação", color: "#7C3AED", bg: "#EDE9FE" },
    aprovado: { label: "Aprovada", color: "#059669", bg: "#D1FAE5" },
    aprovada: { label: "Aprovada", color: "#059669", bg: "#D1FAE5" },
    rejeitado: { label: "Rejeitada", color: "#DC2626", bg: "#FEE2E2" },
    rejeitada: { label: "Rejeitada", color: "#DC2626", bg: "#FEE2E2" },
    concluida: { label: "Concluída", color: "#059669", bg: "#D1FAE5" },
    cancelada: { label: "Cancelada", color: "#DC2626", bg: "#FEE2E2" },
    vencida: { label: "Vencida", color: "#EF4444", bg: "#FEE2E2" },
    atribuida: { label: "Atribuída", color: "#2563EB", bg: "#DBEAFE" },
  };
  return map[acao] ?? { label: acao, color: "#6B7280", bg: "#F3F4F6" };
}

export default function TarefaDrawer({ tarefa, usuarios, currentUserId, role, podeGerenciar, onClose, onUpdated, onDeleted }: Props) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [evidenciaLimpeza, setEvidenciaLimpeza] = useState<EvidenciaLimpeza | null>(null);
  const [novoComentario, setNovoComentario] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [aba, setAba] = useState<"detalhes" | "comentarios" | "aprovacao" | "historico" | "anexos">("detalhes");

  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({
    titulo: tarefa.titulo,
    descricao: tarefa.descricao ?? "",
    prioridade: tarefa.prioridade,
    data_limite: tarefa.data_limite ?? "",
    responsavel_id: tarefa.responsavel_id ?? "",
    tags: tarefa.tags.join(", "),
  });
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  const [aprovadorId, setAprovadorId] = useState("");
  const [solicitandoAprovacao, setSolicitandoAprovacao] = useState(false);
  const [respondendoAprovacao, setRespondendoAprovacao] = useState<number | string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const [deletando, setDeletando] = useState(false);

  const [delegando, setDelegando] = useState(false);
  const [novoResponsavelId, setNovoResponsavelId] = useState("");
  const [motivoDelegacao, setMotivoDelegacao] = useState("");

  const baixaIdLimpeza = Array.isArray(tarefa.tags)
    ? Number(tarefa.tags.find((t) => String(t).startsWith("limpeza_ouro:"))?.split(":")[1] ?? 0)
    : 0;

  const carregarComentarios = useCallback(async () => {
    try {
      const data = await apiFetch<Tarefa & { comentarios?: Comentario[] }>(`/api/tarefas/${tarefa.id}`);
      setComentarios(data.comentarios ?? []);
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  const carregarAprovacoes = useCallback(async () => {
    try {
      const data = await apiFetch<Aprovacao[]>(`/api/tarefas/${tarefa.id}/aprovacao`);
      setAprovacoes(data);
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  const carregarHistorico = useCallback(async () => {
    try {
      const data = await apiFetch<HistoricoEntry[]>(`/api/tarefas/${tarefa.id}/historico`);
      setHistorico(data);
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  const carregarAnexos = useCallback(async () => {
    try {
      const data = await apiFetch<Anexo[]>(`/api/tarefas/${tarefa.id}/anexos`);
      setAnexos(data);
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  useEffect(() => {
    carregarComentarios();
    carregarAprovacoes();
  }, [carregarComentarios, carregarAprovacoes]);

  useEffect(() => {
    /**
     * REGRA DE NEGÓCIO: aprovação de limpeza precisa mostrar fotos antes/depois
     * e dados de pedras antes do aprovador decidir.
     * O QUE: busca a última tentativa estruturada da baixa vinculada à tag
     * limpeza_ouro:{id}.
     * POR QUE: a decisão de quebra depende de evidência visual, não só da
     * descrição textual da tarefa.
     * IMPACTO SE REMOVIDO: aprovador pode aprovar limpeza sem ver as fotos
     * obrigatórias da versão 2.0.
     */
    if (!baixaIdLimpeza) {
      setEvidenciaLimpeza(null);
      return;
    }
    apiFetch<EvidenciaLimpeza | null>(`/api/purificacao/limpeza?baixa_id=${baixaIdLimpeza}`)
      .then((data) => setEvidenciaLimpeza(data))
      .catch(() => setEvidenciaLimpeza(null));
  }, [baixaIdLimpeza]);

  useEffect(() => {
    if (aba === "historico") carregarHistorico();
    if (aba === "anexos") carregarAnexos();
  }, [aba, carregarHistorico, carregarAnexos]);

  async function enviarComentario() {
    if (!novoComentario.trim()) return;
    setSendingComment(true);
    try {
      await apiFetch(`/api/tarefas/${tarefa.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: novoComentario.trim() }),
      });
      setNovoComentario("");
      carregarComentarios();
    } catch { /* silencioso */ }
    setSendingComment(false);
  }

  async function salvarEdicao() {
    setSalvandoEdit(true);
    try {
      const novoRespId = editForm.responsavel_id || null;
      await apiFetch(`/api/tarefas/${tarefa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo:         editForm.titulo,
          descricao:      editForm.descricao || null,
          prioridade:     editForm.prioridade,
          data_limite:    editForm.data_limite || null,
          responsavel_id: novoRespId,
          tags:           editForm.tags ? editForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          motivo_delegacao: novoRespId !== tarefa.responsavel_id ? motivoDelegacao || undefined : undefined,
        }),
      });
      setEditando(false);
      onUpdated({
        id: tarefa.id,
        titulo:         editForm.titulo,
        descricao:      editForm.descricao || null,
        prioridade:     editForm.prioridade,
        data_limite:    editForm.data_limite || null,
        responsavel_id: novoRespId,
        responsavel_nome: usuarios.find(u => u.id === editForm.responsavel_id)?.nome ?? null,
        tags:           editForm.tags ? editForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      });
    } catch { /* silencioso */ }
    setSalvandoEdit(false);
  }

  async function moverStatus(status: string) {
    await apiFetch(`/api/tarefas/${tarefa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao mover tarefa", { level: "critical" }));
    onUpdated({ id: tarefa.id, status });
  }

  async function solicitarAprovacao() {
    if (!aprovadorId) return;
    setSolicitandoAprovacao(true);
    try {
      await apiFetch(`/api/tarefas/${tarefa.id}/aprovacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovador_id: aprovadorId }),
      });
      onUpdated({ id: tarefa.id, status: "aguardando_aprovacao" });
      carregarAprovacoes();
    } catch { /* silencioso */ }
    setSolicitandoAprovacao(false);
  }

  async function responderAprovacao(aprovacaoId: number, decisao: "aprovado" | "rejeitado") {
    setRespondendoAprovacao(aprovacaoId);
    try {
      await apiFetch(`/api/tarefas/${tarefa.id}/aprovacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprovacao_id: aprovacaoId, decisao, motivo: motivoRejeicao || undefined }),
      });
      const novoStatus = decisao === "aprovado" ? "aprovada" : "rejeitada";
      onUpdated({ id: tarefa.id, status: novoStatus });
      carregarAprovacoes();
      setMotivoRejeicao("");
    } catch { /* silencioso */ }
    setRespondendoAprovacao(null);
  }

  async function deletar() {
    if (!confirm("Deletar esta tarefa?")) return;
    setDeletando(true);
    try {
      await apiFetch(`/api/tarefas/${tarefa.id}`, { method: "DELETE" });
      onDeleted(tarefa.id);
    } catch { /* silencioso */ }
    setDeletando(false);
  }

  async function delegarTarefa() {
    if (!novoResponsavelId) return;
    setEditando(false);
    try {
      await apiFetch(`/api/tarefas/${tarefa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsavel_id: novoResponsavelId,
          motivo_delegacao: motivoDelegacao || undefined,
        }),
      });
      onUpdated({
        id: tarefa.id,
        responsavel_id: novoResponsavelId,
        responsavel_nome: usuarios.find(u => u.id === novoResponsavelId)?.nome ?? null,
      });
      setDelegando(false);
      setNovoResponsavelId("");
      setMotivoDelegacao("");
    } catch (e) {
      useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao delegar", { level: "critical" });
    }
  }

  const pri = PRIORIDADE_BADGE[tarefa.prioridade] ?? PRIORIDADE_BADGE.media;
  const statusCol = STATUS_COLS.find(c => c.key === tarefa.status);
  const pendingAprovacao = aprovacoes.find(a => a.status === "pendente");
  const isAprovador = pendingAprovacao?.aprovador_id === currentUserId;
  const isLimpezaOuro = baixaIdLimpeza > 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl flex flex-col"
        style={{ borderLeft: `1px solid ${C.cremeBorder}` }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: C.cremeBorder }}>
          <div className="flex-1 min-w-0">
            {!editando && (
              <p className="text-sm font-semibold truncate" style={{ color: "#1A1A1A" }}>{tarefa.titulo}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: pri.bg, color: pri.text }}>{pri.label}</span>
              {statusCol && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: statusCol.bg, color: statusCol.color }}>{statusCol.label}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!editando && (podeGerenciar || tarefa.criado_por === currentUserId) && (
              <button onClick={() => setEditando(true)}
                className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
                <Edit3 size={15} />
              </button>
            )}
            {(podeGerenciar || tarefa.criado_por === currentUserId) && (
              <button onClick={deletar} disabled={deletando}
                className="p-2 rounded-lg hover:bg-red-50 disabled:opacity-40" style={{ color: "#EF4444" }}>
                {deletando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 md:px-5 flex-shrink-0 overflow-x-auto scrollbar-hide" style={{ borderColor: C.cremeBorder }}>
          {([
            ["detalhes",    "Detalhes"],
            ["comentarios", `Coment.${comentarios.length > 0 ? ` (${comentarios.length})` : ""}`],
            ["aprovacao",   "Aprovação"],
            ["historico",   "Histórico"],
            ["anexos",      "Anexos"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)}
              className="px-3 py-3 md:py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{
                borderColor: aba === key ? C.esmeralda : "transparent",
                color: aba === key ? C.esmeralda : "#9CA3AF",
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ─── Detalhes ─── */}
          {aba === "detalhes" && (
            <div className="p-5 space-y-4">
              {editando ? (
                <>
                  <input type="text" value={editForm.titulo}
                    onChange={e => setEditForm({ ...editForm, titulo: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none font-medium"
                    style={{ borderColor: C.cremeBorder }} />
                  <textarea rows={3} value={editForm.descricao}
                    onChange={e => setEditForm({ ...editForm, descricao: e.target.value })}
                    placeholder="Descrição..." className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
                    style={{ borderColor: C.cremeBorder }} />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={editForm.prioridade} onChange={e => setEditForm({ ...editForm, prioridade: e.target.value })}
                      className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                      style={{ borderColor: C.cremeBorder }}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                    <input type="date" value={editForm.data_limite}
                      onChange={e => setEditForm({ ...editForm, data_limite: e.target.value })}
                      className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                      style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <select value={editForm.responsavel_id} onChange={e => setEditForm({ ...editForm, responsavel_id: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}>
                    <option value="">Sem responsável</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                  <input type="text" placeholder="Motivo da delegação (opcional, se alterar responsável)"
                    value={motivoDelegacao} onChange={e => setMotivoDelegacao(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-xl text-xs outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                  <input type="text" placeholder="Tags (separadas por vírgula)"
                    value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                  <div className="flex gap-2">
                    <button onClick={() => { setEditando(false); setDelegando(false); }}
                      className="flex-1 py-2 rounded-xl text-sm border"
                      style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                    <button onClick={salvarEdicao} disabled={salvandoEdit}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {salvandoEdit && <Loader2 size={13} className="animate-spin" />}
                      Salvar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {tarefa.descricao && (
                    <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#374151" }}>{tarefa.descricao}</p>
                  )}

                  <div className="space-y-2.5">
                    {tarefa.responsavel_nome && (
                      <div className="flex items-center gap-3 text-sm">
                        <User size={14} style={{ color: "#9CA3AF" }} />
                        <span style={{ color: "#6B7280" }}>Responsável:</span>
                        <span className="font-medium" style={{ color: "#1A1A1A" }}>{tarefa.responsavel_nome}</span>
                      </div>
                    )}
                    {tarefa.data_limite && (
                      <div className="flex items-center gap-3 text-sm">
                        <Calendar size={14} style={{ color: "#9CA3AF" }} />
                        <span style={{ color: "#6B7280" }}>Prazo:</span>
                        <span className="font-medium" style={{ color: "#1A1A1A" }}>{fmt(tarefa.data_limite)}</span>
                      </div>
                    )}
                    {tarefa.criador_nome && (
                      <div className="flex items-center gap-3 text-sm">
                        <User size={14} style={{ color: "#9CA3AF" }} />
                        <span style={{ color: "#6B7280" }}>Criado por:</span>
                        <span style={{ color: "#6B7280" }}>{tarefa.criador_nome}</span>
                      </div>
                    )}
                    {tarefa.peso_metal != null && (
                      <div className="flex items-center gap-3 text-sm">
                        <span style={{ color: "#9CA3AF", fontSize: 14 }}>⚖</span>
                        <span style={{ color: "#6B7280" }}>Metal enviado:</span>
                        <span className="font-medium" style={{ color: "#1A1A1A" }}>{Number(tarefa.peso_metal).toFixed(2)}g</span>
                      </div>
                    )}
                    {tarefa.ordem_ids && tarefa.ordem_ids.length > 0 && (
                      <div className="flex items-start gap-3 text-sm">
                        <span style={{ color: "#9CA3AF", fontSize: 14 }}>📋</span>
                        <span style={{ color: "#6B7280" }}>Ordens:</span>
                        <span className="font-medium" style={{ color: "#1A1A1A" }}>IDs: {tarefa.ordem_ids.join(", ")}</span>
                      </div>
                    )}
                    {tarefa.tags.length > 0 && (
                      <div className="flex items-start gap-3">
                        <Tag size={14} style={{ color: "#9CA3AF", marginTop: 2 }} />
                        <div className="flex flex-wrap gap-1">
                          {tarefa.tags.map(tag => (
                            <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: C.cremeBg, color: "#6B7280", border: `1px solid ${C.cremeBorder}` }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botão de delegar rápido */}
                  {podeGerenciar && (
                    <div className="pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                      {!delegando ? (
                        <button onClick={() => setDelegando(true)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-80"
                          style={{ color: "#2563EB", backgroundColor: "#DBEAFE" }}>
                          <ArrowRightLeft size={12} />
                          Delegar / Reatribuir
                        </button>
                      ) : (
                        <div className="space-y-2 p-3 rounded-xl border" style={{ borderColor: "#2563EB33", backgroundColor: "#EFF6FF" }}>
                          <p className="text-xs font-semibold" style={{ color: "#1E40AF" }}>Delegar para</p>
                          <select value={novoResponsavelId} onChange={e => setNovoResponsavelId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl text-sm outline-none"
                            style={{ borderColor: C.cremeBorder }}>
                            <option value="">Selecionar novo responsável...</option>
                            {usuarios.filter(u => u.id !== tarefa.responsavel_id).map(u => (
                              <option key={u.id} value={u.id}>{u.nome}</option>
                            ))}
                          </select>
                          <input type="text" placeholder="Motivo (opcional)"
                            value={motivoDelegacao} onChange={e => setMotivoDelegacao(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl text-xs outline-none"
                            style={{ borderColor: C.cremeBorder }} />
                          <div className="flex gap-2">
                            <button onClick={() => { setDelegando(false); setNovoResponsavelId(""); setMotivoDelegacao(""); }}
                              className="flex-1 py-2 rounded-xl text-xs border"
                              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                            <button onClick={delegarTarefa} disabled={!novoResponsavelId}
                              className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                              style={{ backgroundColor: "#2563EB", color: "#fff" }}>
                              Delegar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Confirmar Recebimento — protocolo de metal */}
                  {tarefa.tipo === "protocolo_metal"
                    && !isLimpezaOuro
                    && tarefa.responsavel_id === currentUserId
                    && tarefa.status !== "concluida" && (
                    <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#10B98133", backgroundColor: "#F0FDF4" }}>
                      <p className="text-sm font-semibold" style={{ color: "#065F46" }}>📦 Confirmar Recebimento</p>
                      <p className="text-xs" style={{ color: "#6B7280" }}>
                        Você é o responsável por receber este metal.
                        {tarefa.peso_metal != null && ` Peso esperado: ${Number(tarefa.peso_metal).toFixed(2)}g.`}
                      </p>
                      <button onClick={() => moverStatus("concluida")}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ backgroundColor: "#059669", color: "#fff" }}>
                        <Check size={15} /> Confirmar Recebimento
                      </button>
                    </div>
                  )}

                  {/* Ações de status rápido */}
                  <div className="pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                    <p className="text-[11px] uppercase font-semibold mb-2" style={{ color: "#9CA3AF" }}>Mover para</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_COLS.filter(c => c.key !== tarefa.status && c.key !== "aguardando_aprovacao").map(col => (
                        <button key={col.key} onClick={() => moverStatus(col.key)}
                          className="text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: col.bg, color: col.color }}>
                          {col.label}
                        </button>
                      ))}
                      {tarefa.status !== "cancelada" && (
                        <button onClick={() => moverStatus("cancelada")}
                          className="text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}>
                          Cancelada
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Comentários ─── */}
          {aba === "comentarios" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {comentarios.length === 0 && (
                  <div className="text-center py-10">
                    <MessageSquare size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhum comentário ainda</p>
                  </div>
                )}
                {comentarios.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: C.esmeralda + "20", color: C.esmeralda }}>
                      {(c.autor_nome ?? "?")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>{c.autor_nome}</span>
                        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{fmtHora(c.created_at)}</span>
                      </div>
                      <p className="text-sm leading-relaxed rounded-xl px-3 py-2"
                        style={{ backgroundColor: C.cremeBg, color: "#374151" }}>
                        {c.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t flex-shrink-0" style={{ borderColor: C.cremeBorder }}>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    placeholder="Escrever comentário..."
                    value={novoComentario}
                    onChange={e => setNovoComentario(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-xl text-sm outline-none resize-none"
                    style={{ borderColor: C.cremeBorder }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarComentario(); } }}
                  />
                  <button onClick={enviarComentario} disabled={sendingComment || !novoComentario.trim()}
                    className="p-2.5 rounded-xl disabled:opacity-40 flex-shrink-0 self-end"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    {sendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Aprovação ─── */}
          {aba === "aprovacao" && (
            <div className="p-5 space-y-4">
              {isLimpezaOuro && evidenciaLimpeza && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#7C3AED33", backgroundColor: "#F5F3FF" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#7C3AED" }} />
                    <p className="text-sm font-semibold" style={{ color: "#5B21B6" }}>Evidências da Limpeza</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2 border" style={{ borderColor: "#DDD6FE" }}>
                      <p style={{ color: "#6B7280" }}>Peso sujo</p>
                      <p className="font-bold" style={{ color: "#111827" }}>{Number(evidenciaLimpeza.gramas).toFixed(3)}g</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border" style={{ borderColor: "#DDD6FE" }}>
                      <p style={{ color: "#6B7280" }}>Peso limpo</p>
                      <p className="font-bold" style={{ color: "#111827" }}>{evidenciaLimpeza.limpeza_peso_limpo != null ? `${Number(evidenciaLimpeza.limpeza_peso_limpo).toFixed(3)}g` : "-"}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border" style={{ borderColor: "#DDD6FE" }}>
                      <p style={{ color: "#6B7280" }}>Perda bruta</p>
                      <p className="font-bold" style={{ color: "#111827" }}>{evidenciaLimpeza.limpeza_perda_bruta_g != null ? `${Number(evidenciaLimpeza.limpeza_perda_bruta_g).toFixed(3)}g` : "-"}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border" style={{ borderColor: "#DDD6FE" }}>
                      <p style={{ color: "#6B7280" }}>Quebra real ouro</p>
                      <p className="font-bold" style={{ color: "#111827" }}>{evidenciaLimpeza.limpeza_perda_ouro_g != null ? `${Number(evidenciaLimpeza.limpeza_perda_ouro_g).toFixed(3)}g` : "-"}</p>
                      {evidenciaLimpeza.limpeza_perda_ouro_pct != null && (
                        <p className="text-[10px]" style={{ color: "#6B7280" }}>{Number(evidenciaLimpeza.limpeza_perda_ouro_pct).toFixed(2)}%</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {evidenciaLimpeza.limpeza_foto_antes_path && (
                      <a href={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_antes_path)} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border bg-white" style={{ borderColor: "#DDD6FE" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_antes_path)} alt="Antes da limpeza" className="w-full h-28 object-cover" />
                        <p className="text-[11px] font-semibold px-2 py-1" style={{ color: "#5B21B6" }}>Antes</p>
                      </a>
                    )}
                    {evidenciaLimpeza.limpeza_foto_depois_path && (
                      <a href={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_depois_path)} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border bg-white" style={{ borderColor: "#DDD6FE" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_depois_path)} alt="Depois da limpeza" className="w-full h-28 object-cover" />
                        <p className="text-[11px] font-semibold px-2 py-1" style={{ color: "#5B21B6" }}>Depois</p>
                      </a>
                    )}
                  </div>

                  {evidenciaLimpeza.limpeza_houve_pedras && (
                    <div className="rounded-xl border bg-white p-3 space-y-2" style={{ borderColor: "#DDD6FE" }}>
                      <p className="text-xs font-semibold" style={{ color: "#5B21B6" }}>
                        Pedras removidas: {evidenciaLimpeza.limpeza_peso_pedras != null ? `${Number(evidenciaLimpeza.limpeza_peso_pedras).toFixed(3)}g` : "peso não informado"}
                      </p>
                      {evidenciaLimpeza.limpeza_foto_peso_pedras_path && (
                        <a href={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_peso_pedras_path)} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border" style={{ borderColor: "#DDD6FE" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={getPublicUrl("purificacao-fotos", evidenciaLimpeza.limpeza_foto_peso_pedras_path)} alt="Peso das pedras" className="w-full h-32 object-cover" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {aprovacoes.length > 0 && (
                <div className="space-y-3">
                  {aprovacoes.map(a => {
                    const isPending = a.status === "pendente";
                    return (
                      <div key={a.id} className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>
                            Solicitado por {a.solicitante_nome}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: a.status === "aprovado" ? "#D1FAE5" : a.status === "rejeitado" ? "#FEE2E2" : "#EDE9FE",
                              color: a.status === "aprovado" ? "#059669" : a.status === "rejeitado" ? "#DC2626" : "#7C3AED",
                            }}>
                            {a.status === "aprovado" ? "Aprovado" : a.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                          </span>
                        </div>
                        <p className="text-[11px]" style={{ color: "#6B7280" }}>Aprovador: {a.aprovador_nome}</p>
                        {a.motivo && <p className="text-xs mt-1 italic" style={{ color: "#6B7280" }}>&ldquo;{a.motivo}&rdquo;</p>}
                        {a.respondido_em && <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>Respondido em {fmtHora(a.respondido_em)}</p>}

                        {/*
                          REGRA DE NEGÓCIO: botão de decisão só aparece pro
                          aprovador_id gravado na linha (mesmo critério usado
                          para TODOS os tipos multi-aprovador — compra_comercial,
                          conversao_reversa, garantia_fora_prazo etc.). Frete
                          avulso migrou pra camada central de aprovações no
                          merge com a main (20/07) e passou a seguir a MESMA
                          regra — removido o pode_decidir_pool que só este tipo
                          tinha. O dispatcher (PATCH .../aprovacao) autoriza de
                          verdade via podeDecidir (config-first); um aprovador
                          configurado que não seja o aprovador_id da linha ainda
                          decide certo pela API, mas só vê o botão aqui se for
                          o aprovador_id gravado — limitação PRÉ-EXISTENTE da
                          camada central, igual pros demais tipos multi.
                        */}
                        {isPending && a.aprovador_id === currentUserId && (
                          <div className="mt-3 space-y-2">
                            <textarea rows={2} placeholder="Motivo (obrigatório para rejeitar)"
                              value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)}
                              className="w-full px-3 py-2 border rounded-xl text-xs outline-none resize-none"
                              style={{ borderColor: C.cremeBorder }} />
                            <div className="flex gap-2">
                              <button onClick={() => responderAprovacao(a.id, "aprovado")}
                                disabled={respondendoAprovacao === a.id}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                                style={{ backgroundColor: "#059669", color: "#fff" }}>
                                {respondendoAprovacao === a.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Aprovar
                              </button>
                              <button onClick={() => {
                                if (!motivoRejeicao.trim()) {
                                  useErrorStore.getState().push("Motivo obrigatório para rejeitar", { level: "warning" });
                                  return;
                                }
                                responderAprovacao(a.id, "rejeitado");
                              }}
                                disabled={respondendoAprovacao === a.id}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                                style={{ backgroundColor: "#EF4444", color: "#fff" }}>
                                <XCircle size={12} />
                                Rejeitar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {tarefa.status !== "concluida" && tarefa.status !== "aguardando_aprovacao" && tarefa.status !== "aprovada" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: "#EDE9FE20" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#7C3AED" }} />
                    <p className="text-sm font-semibold" style={{ color: "#7C3AED" }}>Solicitar Aprovação</p>
                  </div>
                  <select value={aprovadorId} onChange={e => setAprovadorId(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}>
                    <option value="">Selecionar aprovador...</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                  <button onClick={solicitarAprovacao} disabled={!aprovadorId || solicitandoAprovacao}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#7C3AED", color: "#fff" }}>
                    {solicitandoAprovacao && <Loader2 size={14} className="animate-spin" />}
                    Solicitar Aprovação
                  </button>
                </div>
              )}

              {/* ── Conversão de SKU (aprovação direta) ── */}
              {tarefa.tipo === "conversao_sku" && tarefa.status === "aguardando_aprovacao" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#92400E" }} />
                    <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Conversão de SKU</p>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Esta tarefa é uma conversão de SKU para outro SKU.
                  </p>
                  {tarefa.ordem_id && (
                    <a href={`/conversoes/${tarefa.ordem_id}`}
                      className="text-xs underline block"
                      style={{ color: "#184036" }}>
                      Ver detalhes da conversão →
                    </a>
                  )}
                  <div className="space-y-2">
                    <textarea rows={2} placeholder="Motivo (obrigatório para rejeitar)"
                      value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-xs outline-none resize-none"
                      style={{ borderColor: "#E8DCC8" }} />
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        setRespondendoAprovacao("aprovar");
                        try {
                          await apiFetch("/api/conversao-sku/aprovar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id }),
                          });
                          useErrorStore.getState().push("Conversão SKU aprovada!", { level: "success" });
                          onUpdated({ ...tarefa, status: "aprovada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao aprovar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "aprovar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#059669", color: "#fff" }}>
                        {respondendoAprovacao === "aprovar" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Aprovar
                      </button>
                      <button onClick={async () => {
                        if (!motivoRejeicao.trim()) {
                          useErrorStore.getState().push("Motivo obrigatório para rejeitar", { level: "warning" });
                          return;
                        }
                        setRespondendoAprovacao("rejeitar");
                        try {
                          await apiFetch("/api/conversao-sku/recusar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id, motivo: motivoRejeicao.trim() }),
                          });
                          useErrorStore.getState().push("Conversão SKU recusada.", { level: "success" });
                          onUpdated({ ...tarefa, status: "rejeitada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao recusar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "rejeitar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#EF4444", color: "#fff" }}>
                        {respondendoAprovacao === "rejeitar" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Conversão de Estoque (aprovação direta) ── */}
              {tarefa.tipo === "conversao" && tarefa.status === "aguardando_aprovacao" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#92400E" }} />
                    <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Conversão de Estoque</p>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Esta tarefa é uma conversão de estoque comercial para metal.
                  </p>
                  {tarefa.ordem_id && (
                    <a href={`/conversoes/${tarefa.ordem_id}`}
                      className="text-xs underline block"
                      style={{ color: "#184036" }}>
                      Ver detalhes da conversão →
                    </a>
                  )}
                  <div className="space-y-2">
                    <textarea rows={2} placeholder="Motivo (obrigatório para rejeitar)"
                      value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-xs outline-none resize-none"
                      style={{ borderColor: "#E8DCC8" }} />
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        setRespondendoAprovacao("aprovar");
                        try {
                          await apiFetch("/api/conversao/aprovar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id }),
                          });
                          useErrorStore.getState().push("Conversão aprovada! Liberada para protocolo.", { level: "success" });
                          onUpdated({ ...tarefa, status: "aprovada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao aprovar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "aprovar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#059669", color: "#fff" }}>
                        {respondendoAprovacao === "aprovar" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Aprovar
                      </button>
                      <button onClick={async () => {
                        if (!motivoRejeicao.trim()) {
                          useErrorStore.getState().push("Motivo obrigatório para rejeitar", { level: "warning" });
                          return;
                        }
                        setRespondendoAprovacao("rejeitar");
                        try {
                          await apiFetch("/api/conversao/recusar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id, motivo: motivoRejeicao.trim() }),
                          });
                          useErrorStore.getState().push("Conversão recusada. Produtos devolvidos ao estoque.", { level: "success" });
                          onUpdated({ ...tarefa, status: "rejeitada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao recusar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "rejeitar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#EF4444", color: "#fff" }}>
                        {respondendoAprovacao === "rejeitar" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tarefa.tipo === "conversao_reversa" && tarefa.status === "aguardando_aprovacao" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#92400E" }} />
                    <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Conversão Reversa</p>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Metal já registrado no Caixa de Ouro vira peça pronta: aprovar dá baixa no cofre e entrada no estoque; recusar não mexe em nada.
                  </p>
                  <div className="space-y-2">
                    <textarea rows={2} placeholder="Motivo (obrigatório para rejeitar)"
                      value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-xs outline-none resize-none"
                      style={{ borderColor: "#E8DCC8" }} />
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        setRespondendoAprovacao("aprovar");
                        try {
                          await apiFetch("/api/conversao-reversa/aprovar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id }),
                          });
                          useErrorStore.getState().push("Conversão reversa aprovada! Metal saiu do cofre e a peça entrou no estoque.", { level: "success" });
                          onUpdated({ ...tarefa, status: "aprovada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao aprovar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "aprovar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#059669", color: "#fff" }}>
                        {respondendoAprovacao === "aprovar" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Aprovar
                      </button>
                      <button onClick={async () => {
                        if (!motivoRejeicao.trim()) {
                          useErrorStore.getState().push("Motivo obrigatório para rejeitar", { level: "warning" });
                          return;
                        }
                        setRespondendoAprovacao("rejeitar");
                        try {
                          await apiFetch("/api/conversao-reversa/recusar", {
                            method: "POST",
                            body: JSON.stringify({ tarefa_id: tarefa.id, motivo_recusa: motivoRejeicao.trim() }),
                          });
                          useErrorStore.getState().push("Conversão reversa recusada. Nada saiu do cofre.", { level: "success" });
                          onUpdated({ ...tarefa, status: "rejeitada" });
                          carregarAprovacoes();
                        } catch (e: any) {
                          useErrorStore.getState().push(e?.message ?? "Erro ao recusar", { level: "critical" });
                        } finally {
                          setRespondendoAprovacao(null);
                        }
                      }}
                        disabled={respondendoAprovacao === "rejeitar"}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                        style={{ backgroundColor: "#EF4444", color: "#fff" }}>
                        {respondendoAprovacao === "rejeitar" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tarefa.status === "aguardando_aprovacao" && tarefa.tipo !== "conversao" && tarefa.tipo !== "conversao_sku" && tarefa.tipo !== "conversao_reversa" && !pendingAprovacao && (
                <p className="text-sm text-center py-4" style={{ color: "#9CA3AF" }}>
                  Aguardando resposta do aprovador...
                </p>
              )}
            </div>
          )}

          {/* ─── Histórico ─── */}
          {aba === "historico" && (
            <div className="p-5">
              {historico.length === 0 ? (
                <div className="text-center py-10">
                  <History size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhum histórico registrado</p>
                </div>
              ) : (
                <div className="space-y-0 relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-px" style={{ backgroundColor: C.cremeBorder }} />
                  {historico.map((h) => {
                    const sl = statusLabel(h.acao);
                    return (
                      <div key={h.id} className="flex gap-3 pb-4 relative">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center z-10"
                          style={{ backgroundColor: sl.bg, border: `2px solid ${sl.color}` }}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sl.color }} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: sl.bg, color: sl.color }}>
                              {sl.label}
                            </span>
                            {h.usuario_nome && (
                              <span className="text-xs font-medium" style={{ color: "#1A1A1A" }}>{h.usuario_nome}</span>
                            )}
                          </div>
                          {h.campo && h.valor_anterior && h.valor_novo && (
                            <p className="text-[11px]" style={{ color: "#6B7280" }}>
                              {h.campo}: de &ldquo;{h.valor_anterior}&rdquo; → &ldquo;{h.valor_novo}&rdquo;
                            </p>
                          )}
                          {h.comentario && (
                            <p className="text-[11px] italic mt-0.5" style={{ color: "#9CA3AF" }}>&ldquo;{h.comentario}&rdquo;</p>
                          )}
                          <p className="text-[10px] mt-0.5" style={{ color: "#D1D5DB" }}>{fmtHora(h.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Anexos ─── */}
          {aba === "anexos" && (
            <div className="p-5 space-y-3">
              {anexos.length === 0 ? (
                <div className="text-center py-10">
                  <Paperclip size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhum anexo</p>
                </div>
              ) : (
                anexos.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border"
                    style={{ borderColor: C.cremeBorder }}>
                    <Paperclip size={16} style={{ color: "#9CA3AF" }} />
                    <div className="flex-1 min-w-0">
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline truncate block"
                        style={{ color: C.esmeralda }}>
                        {a.nome}
                      </a>
                      <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                        {a.usuario_nome && `${a.usuario_nome} · `}
                        {a.tamanho ? `${(a.tamanho / 1024).toFixed(0)} KB · ` : ""}
                        {fmtHora(a.created_at)}
                      </p>
                    </div>
                    {(podeGerenciar || a.usuario_nome === usuarios.find(u => u.id === currentUserId)?.nome) && (
                      <button onClick={async () => {
                        await apiFetch(`/api/tarefas/${tarefa.id}/anexos/${a.id}`, { method: "DELETE" });
                        carregarAnexos();
                      }}
                        className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
              {/* Upload simplificado via URL */}
              {podeGerenciar && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs font-semibold" style={{ color: C.esmeralda }}>Adicionar link/URL</p>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const nome = (form.elements.namedItem("nome") as HTMLInputElement).value;
                    const url = (form.elements.namedItem("url") as HTMLInputElement).value;
                    if (!nome || !url) return;
                    await apiFetch(`/api/tarefas/${tarefa.id}/anexos`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ nome, url }),
                    });
                    carregarAnexos();
                    form.reset();
                  }}
                    className="flex gap-2">
                    <input name="nome" type="text" placeholder="Nome do arquivo"
                      className="flex-1 px-2.5 py-2 border rounded-lg text-xs outline-none"
                      style={{ borderColor: C.cremeBorder }} />
                    <input name="url" type="text" placeholder="URL"
                      className="flex-1 px-2.5 py-2 border rounded-lg text-xs outline-none"
                      style={{ borderColor: C.cremeBorder }} />
                    <button type="submit"
                      className="px-3 py-2 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      Adicionar
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
