"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Zap, Play, Trash2, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";
import { type Usuario, PRIORIDADE_BADGE } from "./TarefasClient";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Automacao {
  id: number;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  recorrencia: string;
  dia_semana: number | null;
  dia_mes: number | null;
  tags: string[];
  ativa: boolean;
  ultima_execucao: string | null;
  total_execucoes: number;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  criador_nome: string | null;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RECORRENCIA_LABEL: Record<string, string> = { diaria: "Diária", semanal: "Semanal", mensal: "Mensal" };

export default function AutomacoesTab({ usuarios, podeGerenciar }: { usuarios: Usuario[]; podeGerenciar: boolean }) {
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);
  const [executando, setExecutando] = useState<number | null>(null);
  const [deletando, setDeletando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [novaForm, setNovaForm] = useState({
    titulo: "", descricao: "", prioridade: "media",
    recorrencia: "diaria", dia_semana: "1", dia_mes: "1",
    responsavel_id: "", tags: "",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Automacao[]>("/api/automacoes-tarefa");
      setAutomacoes(data);
    } catch { /* silencioso */ }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarAutomacao() {
    if (!novaForm.titulo.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/api/automacoes-tarefa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: novaForm.titulo,
          descricao: novaForm.descricao || undefined,
          prioridade: novaForm.prioridade,
          recorrencia: novaForm.recorrencia,
          dia_semana: novaForm.recorrencia === "semanal" ? Number(novaForm.dia_semana) : undefined,
          dia_mes: novaForm.recorrencia === "mensal" ? Number(novaForm.dia_mes) : undefined,
          responsavel_id: novaForm.responsavel_id || undefined,
          tags: novaForm.tags ? novaForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      setShowNova(false);
      setNovaForm({ titulo: "", descricao: "", prioridade: "media", recorrencia: "diaria", dia_semana: "1", dia_mes: "1", responsavel_id: "", tags: "" });
      carregar();
    } catch { /* silencioso */ }
    setSalvando(false);
  }

  async function executar(id: number) {
    setExecutando(id);
    try {
      await apiFetch(`/api/automacoes-tarefa/${id}/executar`, { method: "POST" });
      carregar();
    } catch { /* silencioso */ }
    setExecutando(null);
  }

  async function toggleAtiva(a: Automacao) {
    await apiFetch(`/api/automacoes-tarefa/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: !a.ativa }),
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao alterar automação", { level: "critical" }));
    setAutomacoes(prev => prev.map(x => x.id === a.id ? { ...x, ativa: !x.ativa } : x));
  }

  async function deletar(id: number) {
    if (!confirm("Deletar esta automação?")) return;
    setDeletando(id);
    try {
      await apiFetch(`/api/automacoes-tarefa/${id}`, { method: "DELETE" });
      setAutomacoes(prev => prev.filter(a => a.id !== id));
    } catch { /* silencioso */ }
    setDeletando(null);
  }

  function recorrenciaLabel(a: Automacao) {
    if (a.recorrencia === "semanal" && a.dia_semana != null) {
      return `Toda ${DIAS_SEMANA[a.dia_semana]}`;
    }
    if (a.recorrencia === "mensal" && a.dia_mes != null) {
      return `Todo dia ${a.dia_mes}`;
    }
    return RECORRENCIA_LABEL[a.recorrencia] ?? a.recorrencia;
  }

  return (
    <div className="flex-1 p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: C.esmeralda }}>Automações</h3>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Tarefas criadas automaticamente por recorrência</p>
        </div>
        {podeGerenciar && (
          <button onClick={() => setShowNova(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            <Plus size={13} /> Nova Automação
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {automacoes.map(a => {
            const pri = PRIORIDADE_BADGE[a.prioridade] ?? PRIORIDADE_BADGE.media;
            return (
              <div key={a.id} className="rounded-xl border p-4"
                style={{ borderColor: C.cremeBorder, backgroundColor: a.ativa ? "#fff" : "#F9FAFB" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: a.ativa ? "#1A1A1A" : "#9CA3AF" }}>
                        {a.titulo}
                      </p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: pri.bg, color: pri.text }}>{pri.label}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "#EDE9FE", color: "#7C3AED" }}>
                        <Zap size={8} className="inline mr-0.5" />{recorrenciaLabel(a)}
                      </span>
                    </div>
                    {a.descricao && (
                      <p className="text-xs line-clamp-1 mb-1" style={{ color: "#6B7280" }}>{a.descricao}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] flex-wrap" style={{ color: "#9CA3AF" }}>
                      {a.responsavel_nome && <span>Responsável: {a.responsavel_nome.split(" ")[0]}</span>}
                      <span>{a.total_execucoes} execuç{a.total_execucoes === 1 ? "ão" : "ões"}</span>
                      {a.ultima_execucao && <span>Última: {new Date(a.ultima_execucao + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Toggle ativa */}
                    <button onClick={() => toggleAtiva(a)} className="p-1.5 rounded-lg hover:bg-gray-100"
                      style={{ color: a.ativa ? "#059669" : "#9CA3AF" }}
                      title={a.ativa ? "Desativar" : "Ativar"}>
                      {a.ativa ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>

                    {/* Executar agora */}
                    <button onClick={() => executar(a.id)} disabled={executando === a.id}
                      className="p-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40"
                      style={{ color: "#059669" }} title="Executar agora">
                      {executando === a.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    </button>

                    {/* Deletar */}
                    {podeGerenciar && (
                      <button onClick={() => deletar(a.id)} disabled={deletando === a.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40"
                        style={{ color: "#EF4444" }}>
                        {deletando === a.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {automacoes.length === 0 && (
            <div className="rounded-xl border p-10 text-center" style={{ borderColor: C.cremeBorder }}>
              <Zap size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>Nenhuma automação criada</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                Automações criam tarefas recorrentes automaticamente
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal nova automação */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowNova(false); }}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-3 shadow-2xl">
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              Nova Automação
            </h2>
            <input type="text" placeholder="Título da tarefa *" autoFocus
              value={novaForm.titulo} onChange={e => setNovaForm({ ...novaForm, titulo: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <textarea placeholder="Descrição (opcional)" rows={2}
              value={novaForm.descricao} onChange={e => setNovaForm({ ...novaForm, descricao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={novaForm.prioridade} onChange={e => setNovaForm({ ...novaForm, prioridade: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <select value={novaForm.recorrencia} onChange={e => setNovaForm({ ...novaForm, recorrencia: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }}>
                <option value="diaria">Diária</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
            {novaForm.recorrencia === "semanal" && (
              <select value={novaForm.dia_semana} onChange={e => setNovaForm({ ...novaForm, dia_semana: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }}>
                {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            )}
            {novaForm.recorrencia === "mensal" && (
              <input type="number" min={1} max={31} placeholder="Dia do mês (1-31)"
                value={novaForm.dia_mes} onChange={e => setNovaForm({ ...novaForm, dia_mes: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
            )}
            <select value={novaForm.responsavel_id} onChange={e => setNovaForm({ ...novaForm, responsavel_id: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }}>
              <option value="">Sem responsável</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <input type="text" placeholder="Tags (separadas por vírgula)"
              value={novaForm.tags} onChange={e => setNovaForm({ ...novaForm, tags: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowNova(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Cancelar</button>
              <button onClick={criarAutomacao} disabled={salvando || !novaForm.titulo.trim()}
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
