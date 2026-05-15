"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Loader2, Edit3, Trash2, Save,
  FileText, Shield,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Template {
  id: number;
  nome: string;
  descricao: string | null;
  titulo_padrao: string;
  descricao_padrao: string | null;
  prioridade: string;
  tipo: string | null;
  tags: string[];
  ativo: boolean;
  responsavel_default_id: string | null;
  responsavel_default_nome: string | null;
  created_at: string;
}

interface Regra {
  id: number;
  nome: string;
  descricao: string | null;
  tipo_evento: string;
  condicao_json: Record<string, unknown>;
  aprovador_role: string | null;
  aprovador_id: string | null;
  aprovador_nome: string | null;
  template_id: number | null;
  template_nome: string | null;
  ativo: boolean;
  prioridade_regra: number;
  created_at: string;
}

interface Usuario {
  id: string;
  nome: string;
}

interface Props {
  usuarios: Usuario[];
  podeGerenciar: boolean;
}

export default function ConfigTab({ usuarios, podeGerenciar }: Props) {
  const [aba, setAba] = useState<"templates" | "regras">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState({
    nome: "", descricao: "", titulo_padrao: "", descricao_padrao: "",
    prioridade: "media", tipo: "", tags: "", responsavel_default_id: "",
  });

  // Regra form
  const [showRegraForm, setShowRegraForm] = useState(false);
  const [editingRegra, setEditingRegra] = useState<Regra | null>(null);
  const [regraForm, setRegraForm] = useState({
    nome: "", descricao: "", tipo_evento: "desconto_acima",
    condicao_percentual: "30", condicao_valor: "1000",
    aprovador_role: "", aprovador_id: "", template_id: "",
    prioridade_regra: "0",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      if (aba === "templates") {
        const data = await apiFetch<Template[]>("/api/tarefas/templates");
        setTemplates(data);
      } else {
        const data = await apiFetch<Regra[]>("/api/tarefas/regras-aprovacao");
        setRegras(data);
      }
    } catch { /* silencioso */ }
    setLoading(false);
  }, [aba]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTemplate() {
    const body = {
      nome: templateForm.nome,
      descricao: templateForm.descricao || undefined,
      titulo_padrao: templateForm.titulo_padrao,
      descricao_padrao: templateForm.descricao_padrao || undefined,
      prioridade: templateForm.prioridade,
      tipo: templateForm.tipo || undefined,
      tags: templateForm.tags ? templateForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      responsavel_default_id: templateForm.responsavel_default_id || undefined,
    };

    try {
      if (editingTemplate) {
        await apiFetch(`/api/tarefas/templates/${editingTemplate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/tarefas/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowTemplateForm(false);
      setEditingTemplate(null);
      carregar();
    } catch (e) {
      useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao salvar", { level: "critical" });
    }
  }

  async function deletarTemplate(id: number) {
    if (!confirm("Deletar este template?")) return;
    try {
      await apiFetch(`/api/tarefas/templates/${id}`, { method: "DELETE" });
      carregar();
    } catch { /* silencioso */ }
  }

  async function toggleTemplateAtivo(id: number, ativo: boolean) {
    await apiFetch(`/api/tarefas/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !ativo }),
    });
    carregar();
  }

  async function salvarRegra() {
    const condicao = regraForm.tipo_evento === "desconto_acima" || regraForm.tipo_evento === "orcamento_acima"
      ? { percentual: Number(regraForm.condicao_percentual) }
      : { valor: Number(regraForm.condicao_valor) };

    const body = {
      nome: regraForm.nome,
      descricao: regraForm.descricao || undefined,
      tipo_evento: regraForm.tipo_evento,
      condicao_json: condicao,
      aprovador_role: regraForm.aprovador_role || undefined,
      aprovador_id: regraForm.aprovador_id || undefined,
      template_id: regraForm.template_id ? Number(regraForm.template_id) : undefined,
      prioridade_regra: Number(regraForm.prioridade_regra),
    };

    try {
      if (editingRegra) {
        await apiFetch(`/api/tarefas/regras-aprovacao/${editingRegra.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/tarefas/regras-aprovacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowRegraForm(false);
      setEditingRegra(null);
      carregar();
    } catch (e) {
      useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao salvar", { level: "critical" });
    }
  }

  async function deletarRegra(id: number) {
    if (!confirm("Deletar esta regra?")) return;
    try {
      await apiFetch(`/api/tarefas/regras-aprovacao/${id}`, { method: "DELETE" });
      carregar();
    } catch { /* silencioso */ }
  }

  async function toggleRegraAtivo(id: number, ativo: boolean) {
    await apiFetch(`/api/tarefas/regras-aprovacao/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !ativo }),
    });
    carregar();
  }

  const eventoLabels: Record<string, string> = {
    desconto_acima: "Desconto acima de X%",
    valor_venda_acima: "Valor da venda acima de R$ X",
    credito_loja: "Crédito loja (A Receber)",
    devolucao: "Devolução",
    orcamento_acima: "Orçamento acima de R$ X",
  };

  if (!podeGerenciar) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "#9CA3AF" }}>Acesso restrito a admin/gerentes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          {([["templates", "Templates"], ["regras", "Regras de Aprovação"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)}
              className="px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ backgroundColor: aba === key ? C.esmeralda : C.cremeBg, color: aba === key ? C.creme : "#6B7280" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => {
          if (aba === "templates") {
            setEditingTemplate(null);
            setTemplateForm({ nome: "", descricao: "", titulo_padrao: "", descricao_padrao: "", prioridade: "media", tipo: "", tags: "", responsavel_default_id: "" });
            setShowTemplateForm(true);
          } else {
            setEditingRegra(null);
            setRegraForm({ nome: "", descricao: "", tipo_evento: "desconto_acima", condicao_percentual: "30", condicao_valor: "1000", aprovador_role: "", aprovador_id: "", template_id: "", prioridade_regra: "0" });
            setShowRegraForm(true);
          }
        }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
          <Plus size={13} /> Novo
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} /></div>
        ) : aba === "templates" ? (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="p-3 rounded-xl border flex items-center gap-3"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", opacity: t.ativo ? 1 : 0.5 }}>
                <FileText size={16} style={{ color: C.esmeralda }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{t.nome}</p>
                  <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                    {t.titulo_padrao?.substring(0, 60)}{(t.titulo_padrao?.length ?? 0) > 60 ? "..." : ""}
                    {t.tipo && ` · ${t.tipo}`}
                  </p>
                </div>
                <button onClick={() => toggleTemplateAtivo(t.id, t.ativo)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                  style={{ backgroundColor: t.ativo ? "#D1FAE5" : "#FEE2E2", color: t.ativo ? "#059669" : "#DC2626" }}>
                  {t.ativo ? "Ativo" : "Inativo"}
                </button>
                <button onClick={() => {
                  setEditingTemplate(t);
                  setTemplateForm({
                    nome: t.nome, descricao: t.descricao ?? "", titulo_padrao: t.titulo_padrao,
                    descricao_padrao: t.descricao_padrao ?? "", prioridade: t.prioridade,
                    tipo: t.tipo ?? "", tags: t.tags.join(", "),
                    responsavel_default_id: t.responsavel_default_id ?? "",
                  });
                  setShowTemplateForm(true);
                }}
                  className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
                  <Edit3 size={13} />
                </button>
                <button onClick={() => deletarTemplate(t.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: "#EF4444" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "#9CA3AF" }}>Nenhum template criado</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {regras.map(r => (
              <div key={r.id} className="p-3 rounded-xl border flex items-center gap-3"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", opacity: r.ativo ? 1 : 0.5 }}>
                <Shield size={16} style={{ color: "#7C3AED" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{r.nome}</p>
                  <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                    {eventoLabels[r.tipo_evento] ?? r.tipo_evento}
                    {r.aprovador_nome ? ` · Aprovador: ${r.aprovador_nome}` : ""}
                    {r.aprovador_role ? ` · Role: ${r.aprovador_role}` : ""}
                    {r.template_nome ? ` · Template: ${r.template_nome}` : ""}
                  </p>
                </div>
                <button onClick={() => toggleRegraAtivo(r.id, r.ativo)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                  style={{ backgroundColor: r.ativo ? "#D1FAE5" : "#FEE2E2", color: r.ativo ? "#059669" : "#DC2626" }}>
                  {r.ativo ? "Ativo" : "Inativo"}
                </button>
                <button onClick={() => {
                  setEditingRegra(r);
                  const cond = r.condicao_json as Record<string, number>;
                  setRegraForm({
                    nome: r.nome, descricao: r.descricao ?? "", tipo_evento: r.tipo_evento,
                    condicao_percentual: String(cond.percentual ?? 30),
                    condicao_valor: String(cond.valor ?? 1000),
                    aprovador_role: r.aprovador_role ?? "",
                    aprovador_id: r.aprovador_id ?? "",
                    template_id: r.template_id ? String(r.template_id) : "",
                    prioridade_regra: String(r.prioridade_regra),
                  });
                  setShowRegraForm(true);
                }}
                  className="p-1.5 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
                  <Edit3 size={13} />
                </button>
                <button onClick={() => deletarRegra(r.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: "#EF4444" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {regras.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "#9CA3AF" }}>Nenhuma regra configurada</p>
            )}
          </div>
        )}
      </div>

      {/* Modal Template */}
      {showTemplateForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowTemplateForm(false); }}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              {editingTemplate ? "Editar Template" : "Novo Template"}
            </h2>
            <input type="text" placeholder="Nome do template *" autoFocus
              value={templateForm.nome} onChange={e => setTemplateForm({ ...templateForm, nome: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <input type="text" placeholder="Título padrão * (use {variavel})"
              value={templateForm.titulo_padrao} onChange={e => setTemplateForm({ ...templateForm, titulo_padrao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <textarea placeholder="Descrição padrão (use {variavel})" rows={3}
              value={templateForm.descricao_padrao} onChange={e => setTemplateForm({ ...templateForm, descricao_padrao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <textarea placeholder="Descrição do template" rows={2}
              value={templateForm.descricao} onChange={e => setTemplateForm({ ...templateForm, descricao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={templateForm.prioridade} onChange={e => setTemplateForm({ ...templateForm, prioridade: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <select value={templateForm.tipo} onChange={e => setTemplateForm({ ...templateForm, tipo: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}>
                <option value="">Tipo (opcional)</option>
                <option value="geral">Geral</option>
                <option value="desconto">Aprovação Desconto</option>
                <option value="credito">Aprovação Crédito</option>
              </select>
            </div>
            <select value={templateForm.responsavel_default_id} onChange={e => setTemplateForm({ ...templateForm, responsavel_default_id: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Responsável padrão (opcional)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <input type="text" placeholder="Tags (separadas por vírgula)"
              value={templateForm.tags} onChange={e => setTemplateForm({ ...templateForm, tags: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowTemplateForm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Cancelar</button>
              <button onClick={salvarTemplate}
                disabled={!templateForm.nome.trim() || !templateForm.titulo_padrao.trim()}
                className="px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                <Save size={13} />
                {editingTemplate ? "Atualizar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Regra */}
      {showRegraForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowRegraForm(false); }}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              {editingRegra ? "Editar Regra" : "Nova Regra"}
            </h2>
            <input type="text" placeholder="Nome da regra *" autoFocus
              value={regraForm.nome} onChange={e => setRegraForm({ ...regraForm, nome: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <select value={regraForm.tipo_evento} onChange={e => setRegraForm({ ...regraForm, tipo_evento: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="desconto_acima">Desconto acima de X%</option>
              <option value="valor_venda_acima">Valor da venda acima de R$ X</option>
              <option value="credito_loja">Crédito loja (A Receber)</option>
              <option value="devolucao">Devolução</option>
              <option value="orcamento_acima">Orçamento acima de R$ X</option>
            </select>
            {(regraForm.tipo_evento === "desconto_acima" || regraForm.tipo_evento === "orcamento_acima") ? (
              <input type="number" placeholder="Percentual (%)"
                value={regraForm.condicao_percentual} onChange={e => setRegraForm({ ...regraForm, condicao_percentual: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }} />
            ) : regraForm.tipo_evento !== "devolucao" && regraForm.tipo_evento !== "credito_loja" ? (
              <input type="number" placeholder="Valor (R$)"
                value={regraForm.condicao_valor} onChange={e => setRegraForm({ ...regraForm, condicao_valor: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }} />
            ) : null}
            <select value={regraForm.aprovador_role} onChange={e => setRegraForm({ ...regraForm, aprovador_role: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Aprovador por role (opcional)</option>
              <option value="admin">Admin</option>
              <option value="gerente_loja">Gerente Loja</option>
              <option value="gerente_fabrica">Gerente Fabrica</option>
            </select>
            <select value={regraForm.aprovador_id} onChange={e => setRegraForm({ ...regraForm, aprovador_id: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Aprovador específico (opcional)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <select value={regraForm.template_id} onChange={e => setRegraForm({ ...regraForm, template_id: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Template vinculado (opcional)</option>
              {templates.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <textarea placeholder="Descrição (opcional)" rows={2}
              value={regraForm.descricao} onChange={e => setRegraForm({ ...regraForm, descricao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowRegraForm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Cancelar</button>
              <button onClick={salvarRegra}
                disabled={!regraForm.nome.trim() || !regraForm.tipo_evento}
                className="px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                <Save size={13} />
                {editingRegra ? "Atualizar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
