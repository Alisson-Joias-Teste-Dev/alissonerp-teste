"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, CheckCircle2, Circle, Clock, XCircle,
  AlertTriangle, ChevronRight, MessageSquare, Calendar,
  User, Tag, Filter, Search
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/apiFetch";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tarefa {
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

interface Usuario { id: string; nome: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLS = [
  { key: "pendente",      label: "Pendentes",     icon: Circle,       color: "#6B7280" },
  { key: "em_andamento",  label: "Em Andamento",  icon: Clock,        color: "#D97706" },
  { key: "concluida",     label: "Concluídas",    icon: CheckCircle2, color: "#059669" },
  { key: "cancelada",     label: "Canceladas",    icon: XCircle,      color: "#DC2626" },
] as const;

const PRIORIDADE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  urgente: { bg: "#FEE2E2", text: "#991B1B", label: "Urgente" },
  alta:    { bg: "#FEF3C7", text: "#92400E", label: "Alta" },
  media:   { bg: "#E0E7FF", text: "#3730A3", label: "Média" },
  baixa:   { bg: "#F3F4F6", text: "#6B7280", label: "Baixa" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function TarefasClient() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [showNova, setShowNova] = useState(false);
  const [novaForm, setNovaForm] = useState({ titulo: "", descricao: "", prioridade: "media", data_limite: "" });
  const [salvando, setSalvando] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [responsavelId, setResponsavelId] = useState("");

  const carregarTarefas = useCallback(async () => {
    try {
      const data = await apiFetch<Tarefa[]>("/api/tarefas");
      setTarefas(data);
    } catch(e) { console.error('Erro ao carregar tarefas:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { carregarTarefas(); }, [carregarTarefas]);

  useEffect(() => {
    apiFetch<Usuario[]>("/api/usuarios/busca", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: "" }),
    }).then(setUsuarios).catch(() => {});
  }, []);

  const criarTarefa = async () => {
    if (!novaForm.titulo.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...novaForm,
          responsavel_id: responsavelId || undefined,
          data_limite: novaForm.data_limite || undefined,
        }),
      });
      setShowNova(false);
      setNovaForm({ titulo: "", descricao: "", prioridade: "media", data_limite: "" });
      setResponsavelId("");
      carregarTarefas();
    } catch(e) { console.error('Erro ao criar tarefa:', e); }
    setSalvando(false);
  };

  const moverTarefa = async (id: number, novoStatus: string) => {
    await apiFetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    }).catch(e => console.error('Erro ao mover tarefa:', e));
    carregarTarefas();
  };

  const tarefasFiltradas = tarefas.filter((t) => {
    if (filtro && !t.titulo.toLowerCase().includes(filtro.toLowerCase())) return false;
    if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
    return true;
  });

  const porStatus = (s: string) => tarefasFiltradas.filter((t) => t.status === s);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full" style={{ borderColor: "#184036", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <h1 className="text-xl font-bold" style={{ color: "#184036" }}>Tarefas</h1>
        <button
          onClick={() => setShowNova(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: "#184036" }}
        >
          <Plus size={16} /> Nova Tarefa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Buscar tarefa..."
            value={filtro} onChange={(e) => setFiltro(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
          />
        </div>
        <select
          value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
        >
          <option value="">Todas prioridades</option>
          <option value="urgente">Urgente</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto">
        {STATUS_COLS.map((col) => (
          <div key={col.key} className="min-w-[280px]">
            <div className="flex items-center gap-2 mb-3 px-1">
              <col.icon size={18} style={{ color: col.color }} />
              <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                {porStatus(col.key).length}
              </span>
            </div>
            <div className="space-y-2">
              {porStatus(col.key).map((t) => {
                const pri = PRIORIDADE_BADGE[t.prioridade] ?? PRIORIDADE_BADGE.media;
                return (
                  <div
                    key={t.id}
                    className="p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow"
                    style={{ borderColor: "#E8DCC8", backgroundColor: "#FAFAF7" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 leading-snug">{t.titulo}</p>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
                        style={{ backgroundColor: pri.bg, color: pri.text }}
                      >
                        {pri.label}
                      </span>
                    </div>

                    {t.descricao && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.descricao}</p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                      {t.responsavel_nome && (
                        <span className="flex items-center gap-1"><User size={11} />{t.responsavel_nome}</span>
                      )}
                      {t.data_limite && (
                        <span className="flex items-center gap-1"><Calendar size={11} />{new Date(t.data_limite).toLocaleDateString("pt-BR")}</span>
                      )}
                      {t.numero_ordem && (
                        <span className="flex items-center gap-1">#{t.numero_ordem}</span>
                      )}
                    </div>

                    {/* Botões de ação */}
                    <div className="flex gap-1 mt-2">
                      {col.key === "pendente" && (
                        <button
                          onClick={() => moverTarefa(t.id, "em_andamento")}
                          className="text-[10px] px-2 py-1 rounded text-white" style={{ backgroundColor: "#D97706" }}
                        >Iniciar</button>
                      )}
                      {col.key === "em_andamento" && (
                        <button
                          onClick={() => moverTarefa(t.id, "concluida")}
                          className="text-[10px] px-2 py-1 rounded text-white" style={{ backgroundColor: "#059669" }}
                        >Concluir</button>
                      )}
                      {col.key !== "concluida" && (
                        <button
                          onClick={() => moverTarefa(t.id, "cancelada")}
                          className="text-[10px] px-2 py-1 rounded text-gray-500 hover:bg-gray-100"
                        >Cancelar</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {porStatus(col.key).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">Nenhuma tarefa</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Nova Tarefa */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
          <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold" style={{ color: "#184036" }}>Nova Tarefa</h2>
            <input
              type="text" placeholder="Título *" autoFocus
              value={novaForm.titulo} onChange={(e) => setNovaForm({ ...novaForm, titulo: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
            />
            <textarea
              placeholder="Descrição (opcional)" rows={3}
              value={novaForm.descricao} onChange={(e) => setNovaForm({ ...novaForm, descricao: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={novaForm.prioridade} onChange={(e) => setNovaForm({ ...novaForm, prioridade: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <input
                type="date"
                value={novaForm.data_limite} onChange={(e) => setNovaForm({ ...novaForm, data_limite: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
              />
            </div>
            <select
              value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E8DCC8" }}
            >
              <option value="">Sem responsável</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNova(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
              >Cancelar</button>
              <button
                onClick={criarTarefa} disabled={salvando || !novaForm.titulo.trim()}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "#184036" }}
              >{salvando ? "Salvando..." : "Criar Tarefa"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
