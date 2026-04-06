"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Circle, Clock, CheckCircle2, XCircle, ShieldCheck,
  Search, Loader2, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/apiFetch";
import TarefaDrawer from "./TarefaDrawer";
import AutomacoesTab from "./AutomacoesTab";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Tarefa {
  id: number;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  data_limite: string | null;
  ordem_id: number | null;
  numero_ordem: string | null;
  tags: string[];
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  criador_nome: string | null;
  created_at: string;
  updated_at: string;
  concluida_em: string | null;
}

export interface Usuario { id: string; nome: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

export const STATUS_COLS = [
  { key: "pendente",             label: "Pendente",             icon: Circle,       color: "#6B7280", bg: "#F3F4F6" },
  { key: "em_andamento",        label: "Em Andamento",         icon: Clock,        color: "#D97706", bg: "#FEF3C7" },
  { key: "aguardando_aprovacao",label: "Aguard. Aprovação",    icon: ShieldCheck,  color: "#7C3AED", bg: "#EDE9FE" },
  { key: "concluida",           label: "Concluída",            icon: CheckCircle2, color: "#059669", bg: "#D1FAE5" },
  { key: "cancelada",           label: "Cancelada",            icon: XCircle,      color: "#DC2626", bg: "#FEE2E2" },
] as const;

export const PRIORIDADE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  urgente: { bg: "#FEE2E2", text: "#991B1B", label: "Urgente" },
  alta:    { bg: "#FEF3C7", text: "#92400E", label: "Alta"    },
  media:   { bg: "#E0E7FF", text: "#3730A3", label: "Média"   },
  baixa:   { bg: "#F3F4F6", text: "#6B7280", label: "Baixa"   },
};

// ─── SortableCard ─────────────────────────────────────────────────────────────
function SortableCard({ tarefa, onClick }: { tarefa: Tarefa; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tarefa.id });
  const pri = PRIORIDADE_BADGE[tarefa.prioridade] ?? PRIORIDADE_BADGE.media;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isVencida = tarefa.data_limite && new Date(tarefa.data_limite) < new Date() && tarefa.status !== "concluida";

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: C.cremeBorder, backgroundColor: "#fff" }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="p-3 rounded-xl border cursor-pointer hover:shadow-md transition-all select-none"
    >
      {/* Prioridade + título */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
          style={{ backgroundColor: pri.bg, color: pri.text }}>
          {pri.label}
        </span>
        <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: "#1A1A1A" }}>
          {tarefa.titulo}
        </p>
      </div>

      {/* Tags */}
      {tarefa.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tarefa.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: C.cremeBg, color: "#6B7280", border: `1px solid ${C.cremeBorder}` }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "#9CA3AF" }}>
        {tarefa.responsavel_nome && (
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
              style={{ backgroundColor: C.esmeralda + "20", color: C.esmeralda }}>
              {tarefa.responsavel_nome[0]}
            </span>
            {tarefa.responsavel_nome.split(" ")[0]}
          </span>
        )}
        {tarefa.data_limite && (
          <span style={{ color: isVencida ? "#EF4444" : "#9CA3AF" }}>
            {isVencida ? "⚠️ " : ""}
            {new Date(tarefa.data_limite + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
        {tarefa.numero_ordem && <span>#{tarefa.numero_ordem}</span>}
      </div>
    </div>
  );
}

// ─── DroppableColumn ─────────────────────────────────────────────────────────
function DroppableColumn({
  col, tarefas, onCardClick, activeId,
}: {
  col: typeof STATUS_COLS[number];
  tarefas: Tarefa[];
  onCardClick: (t: Tarefa) => void;
  activeId: number | null;
}) {
  return (
    <div className="flex flex-col min-w-[260px] max-w-[280px]">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
        <span className="font-semibold text-xs uppercase tracking-wide flex-1" style={{ color: col.color }}>
          {col.label}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: col.bg, color: col.color }}>
          {tarefas.length}
        </span>
      </div>

      {/* Drop area */}
      <div
        className="flex-1 rounded-xl p-2 min-h-[120px] transition-colors"
        style={{ backgroundColor: tarefas.length === 0 ? col.bg + "40" : "transparent" }}
      >
        <SortableContext items={tarefas.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tarefas.map(t => (
              <SortableCard
                key={t.id}
                tarefa={t}
                onClick={() => onCardClick(t)}
              />
            ))}
            {tarefas.length === 0 && activeId === null && (
              <p className="text-[11px] text-center py-6" style={{ color: "#9CA3AF" }}>
                Nenhuma tarefa
              </p>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TarefasClient() {
  const { user, role } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [aba, setAba] = useState<"kanban" | "automacoes">("kanban");

  // Drawer state
  const [drawerTarefa, setDrawerTarefa] = useState<Tarefa | null>(null);
  const [showNova, setShowNova] = useState(false);
  const [novaForm, setNovaForm] = useState({ titulo: "", descricao: "", prioridade: "media", data_limite: "", tags: "" });
  const [responsavelId, setResponsavelId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // DnD state
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const podeGerenciar = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"].includes(role ?? "");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Tarefa[]>("/api/tarefas");
      setTarefas(data);
    } catch { /* silencioso */ }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    apiFetch<Usuario[]>("/api/usuarios/busca", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: "" }),
    }).then(setUsuarios).catch(() => {});
  }, []);

  // ─── DnD handlers ───────────────────────────────────────────────────────────
  const tarefaById = (id: number) => tarefas.find(t => t.id === id);
  const statusOfId = (id: number) => tarefaById(id)?.status ?? "pendente";

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeStatus = statusOfId(Number(active.id));
    const overId = over.id;

    // Se arrastando sobre uma coluna (key do STATUS_COLS)
    const colKey = STATUS_COLS.find(c => c.key === String(overId))?.key;
    if (colKey && colKey !== activeStatus) {
      setTarefas(prev => prev.map(t =>
        t.id === Number(active.id) ? { ...t, status: colKey } : t
      ));
    }

    // Se arrastando sobre outro card
    const overStatus = statusOfId(Number(overId));
    if (overStatus && overStatus !== activeStatus && Number(overId) !== Number(active.id)) {
      setTarefas(prev => prev.map(t =>
        t.id === Number(active.id) ? { ...t, status: overStatus } : t
      ));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const novoStatus = statusOfId(Number(active.id));
    const tarefa = tarefaById(Number(active.id));
    if (!tarefa || novoStatus === tarefa.status) return;

    // Persistir no backend
    await apiFetch(`/api/tarefas/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    }).catch(() => carregar());
  }

  // ─── Nova Tarefa ────────────────────────────────────────────────────────────
  async function criarTarefa() {
    if (!novaForm.titulo.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: novaForm.titulo,
          descricao: novaForm.descricao || undefined,
          prioridade: novaForm.prioridade,
          data_limite: novaForm.data_limite || undefined,
          responsavel_id: responsavelId || undefined,
          tags: novaForm.tags ? novaForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      setShowNova(false);
      setNovaForm({ titulo: "", descricao: "", prioridade: "media", data_limite: "", tags: "" });
      setResponsavelId("");
      carregar();
    } catch { /* silencioso */ }
    setSalvando(false);
  }

  // ─── Filtros ────────────────────────────────────────────────────────────────
  const tarefasFiltradas = tarefas.filter(t => {
    if (filtro && !t.titulo.toLowerCase().includes(filtro.toLowerCase())) return false;
    if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
    return true;
  });

  const porStatus = (s: string) => tarefasFiltradas.filter(t => t.status === s);
  const activeTarefa = activeId ? tarefaById(activeId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b flex items-center justify-between gap-3 flex-wrap"
        style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Tarefas
          </h1>
          {/* Tabs */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            {([["kanban", "Kanban"], ["automacoes", "Automações"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setAba(key)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
                style={{ backgroundColor: aba === key ? C.esmeralda : C.cremeBg, color: aba === key ? C.creme : "#6B7280" }}>
                {key === "automacoes" && <Zap size={11} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {aba === "kanban" && (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Buscar..." value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-lg text-xs w-40 outline-none"
                  style={{ borderColor: C.cremeBorder }} />
              </div>
              <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}
                className="px-2 py-1.5 border rounded-lg text-xs outline-none"
                style={{ borderColor: C.cremeBorder }}>
                <option value="">Prioridade</option>
                <option value="urgente">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </>
          )}
          <button onClick={() => setShowNova(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            <Plus size={13} /> Nova
          </button>
        </div>
      </div>

      {/* Content */}
      {aba === "automacoes" ? (
        <AutomacoesTab usuarios={usuarios} podeGerenciar={podeGerenciar} />
      ) : loading ? (
        <div className="flex items-center justify-center flex-1 py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-4 md:p-6 min-h-full" style={{ minWidth: `${STATUS_COLS.length * 290}px` }}>
              {STATUS_COLS.map(col => (
                <DroppableColumn
                  key={col.key}
                  col={col}
                  tarefas={porStatus(col.key)}
                  onCardClick={(t) => setDrawerTarefa(t)}
                  activeId={activeId}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTarefa && (
                <div className="p-3 rounded-xl border shadow-xl rotate-2 w-64"
                  style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
                  <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{activeTarefa.titulo}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Drawer de detalhe */}
      {drawerTarefa && (
        <TarefaDrawer
          tarefa={drawerTarefa}
          usuarios={usuarios}
          currentUserId={user?.id ?? ""}
          podeGerenciar={podeGerenciar}
          onClose={() => setDrawerTarefa(null)}
          onUpdated={(updated) => {
            setTarefas(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
            setDrawerTarefa(prev => prev ? { ...prev, ...updated } : null);
          }}
          onDeleted={(id) => {
            setTarefas(prev => prev.filter(t => t.id !== id));
            setDrawerTarefa(null);
          }}
        />
      )}

      {/* Modal Nova Tarefa */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setShowNova(false); }}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-3 shadow-2xl">
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>Nova Tarefa</h2>
            <input type="text" placeholder="Título *" autoFocus
              value={novaForm.titulo} onChange={e => setNovaForm({ ...novaForm, titulo: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}
              onKeyDown={e => { if (e.key === "Enter") criarTarefa(); }}
            />
            <textarea placeholder="Descrição (opcional)" rows={2}
              value={novaForm.descricao} onChange={e => setNovaForm({ ...novaForm, descricao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={novaForm.prioridade} onChange={e => setNovaForm({ ...novaForm, prioridade: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <input type="date" value={novaForm.data_limite}
                onChange={e => setNovaForm({ ...novaForm, data_limite: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }} />
            </div>
            <select value={responsavelId} onChange={e => setResponsavelId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Sem responsável</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <input type="text" placeholder="Tags (separadas por vírgula)"
              value={novaForm.tags} onChange={e => setNovaForm({ ...novaForm, tags: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowNova(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Cancelar</button>
              <button onClick={criarTarefa} disabled={salvando || !novaForm.titulo.trim()}
                className="px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                {salvando && <Loader2 size={13} className="animate-spin" />}
                {salvando ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
