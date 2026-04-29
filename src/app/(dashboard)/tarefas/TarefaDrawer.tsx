"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Loader2, Send, ShieldCheck, Check, XCircle,
  Trash2, Calendar, User, Tag, MessageSquare, Clock, Edit3,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
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

interface Props {
  tarefa: Tarefa;
  usuarios: Usuario[];
  currentUserId: string;
  podeGerenciar: boolean;
  onClose: () => void;
  onUpdated: (t: Partial<Tarefa> & { id: number }) => void;
  onDeleted: (id: number) => void;
}

function fmt(d: string) {
  return new Date(d.includes("T") ? d : d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtHora(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TarefaDrawer({ tarefa, usuarios, currentUserId, podeGerenciar, onClose, onUpdated, onDeleted }: Props) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [aba, setAba] = useState<"detalhes" | "comentarios" | "aprovacao">("detalhes");

  // Edição
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

  // Aprovação
  const [aprovadorId, setAprovadorId] = useState("");
  const [solicitandoAprovacao, setSolicitandoAprovacao] = useState(false);
  const [respondendoAprovacao, setRespondendoAprovacao] = useState<number | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const [deletando, setDeletando] = useState(false);

  const carregarComentarios = useCallback(async () => {
    try {
      const res = await fetch(`/api/tarefas/${tarefa.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { comentarios?: Comentario[] };
        setComentarios(data.comentarios ?? []);
      }
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  const carregarAprovacoes = useCallback(async () => {
    try {
      const data = await apiFetch<Aprovacao[]>(`/api/tarefas/${tarefa.id}/aprovacao`);
      setAprovacoes(data);
    } catch { /* silencioso */ }
  }, [tarefa.id]);

  useEffect(() => {
    carregarComentarios();
    carregarAprovacoes();
  }, [carregarComentarios, carregarAprovacoes]);

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
      await apiFetch(`/api/tarefas/${tarefa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo:         editForm.titulo,
          descricao:      editForm.descricao || null,
          prioridade:     editForm.prioridade,
          data_limite:    editForm.data_limite || null,
          responsavel_id: editForm.responsavel_id || null,
          tags:           editForm.tags ? editForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      setEditando(false);
      onUpdated({
        id: tarefa.id,
        titulo:         editForm.titulo,
        descricao:      editForm.descricao || null,
        prioridade:     editForm.prioridade,
        data_limite:    editForm.data_limite || null,
        responsavel_id: editForm.responsavel_id || null,
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
      const novoStatus = decisao === "aprovado" ? "concluida" : "em_andamento";
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

  const pri = PRIORIDADE_BADGE[tarefa.prioridade] ?? PRIORIDADE_BADGE.media;
  const statusCol = STATUS_COLS.find(c => c.key === tarefa.status);
  const pendingAprovacao = aprovacoes.find(a => a.status === "pendente");
  const isAprovador = pendingAprovacao?.aprovador_id === currentUserId;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl flex flex-col"
        style={{ borderLeft: `1px solid ${C.cremeBorder}` }}>

        {/* Header do drawer */}
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
        <div className="flex border-b px-5 flex-shrink-0" style={{ borderColor: C.cremeBorder }}>
          {([
            ["detalhes",    "Detalhes"],
            ["comentarios", `Comentários${comentarios.length > 0 ? ` (${comentarios.length})` : ""}`],
            ["aprovacao",   "Aprovação"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)}
              className="px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors"
              style={{
                borderColor: aba === key ? C.esmeralda : "transparent",
                color: aba === key ? C.esmeralda : "#9CA3AF",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
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
                  <input type="text" placeholder="Tags (separadas por vírgula)"
                    value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                    className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(false)}
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

                  {/* Confirmar Recebimento — protocolo de metal */}
                  {tarefa.tipo === "protocolo_metal"
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

              {/* Input comentário */}
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

              {/* Aprovações anteriores */}
              {aprovacoes.length > 0 && (
                <div className="space-y-3">
                  {aprovacoes.map(a => (
                    <div key={a.id} className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>
                          Solicitado por {a.solicitante_nome}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full`}
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

                      {/* Botões de resposta para o aprovador */}
                      {a.status === "pendente" && isAprovador && (
                        <div className="mt-3 space-y-2">
                          <textarea rows={2} placeholder="Motivo (opcional)"
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
                            <button onClick={() => responderAprovacao(a.id, "rejeitado")}
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
                  ))}
                </div>
              )}

              {/* Nova solicitação de aprovação */}
              {tarefa.status !== "concluida" && tarefa.status !== "aguardando_aprovacao" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: "#EDE9FE20" }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: "#7C3AED" }} />
                    <p className="text-sm font-semibold" style={{ color: "#7C3AED" }}>Solicitar Aprovação</p>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Envie esta tarefa para aprovação de um gerente antes de concluí-la.
                  </p>
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

              {tarefa.status === "aguardando_aprovacao" && !pendingAprovacao && (
                <p className="text-sm text-center py-4" style={{ color: "#9CA3AF" }}>
                  Aguardando resposta do aprovador...
                </p>
              )}

              {aprovacoes.length === 0 && tarefa.status === "concluida" && (
                <p className="text-sm text-center py-4" style={{ color: "#9CA3AF" }}>Tarefa concluída.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
