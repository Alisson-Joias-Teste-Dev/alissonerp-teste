"use client";

/**
 * Aba de gerenciamento das regras de precificação de pedras.
 * Consome a API /api/precificacao/regras-pedras (tabela pedras_precificacao_regras).
 *
 * Substitui a antiga TabMarkupPedras que usava markup_pedras (tabela desativada).
 */
import { useState, useEffect, useCallback } from "react";
import React from "react";
import {
  Plus, Trash2, Save, X, Check, Loader2, AlertTriangle, ChevronDown, ChevronRight
} from "lucide-react";

interface RegraPedra {
  id: number;
  nome_tabela: string;
  categoria_pedra: string;
  custo_usd_ct: number | null;
  preco_rs_un: number | null;
  tamanho_inicial_mm: number;
  tamanho_final_mm: number;
  markup_inicial: number;
  markup_final: number;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

interface RegraForm {
  nome_tabela: string;
  categoria_pedra: string;
  custo_usd_ct: string;
  preco_rs_un: string;
  tamanho_inicial_mm: string;
  tamanho_final_mm: string;
  markup_inicial: string;
  markup_final: string;
  ativa: boolean;
}

/** Produto retornado pela API de auditoria por regra */
interface ProdutoAuditoria {
  id_produto: number;
  nome: string;
  sku: string;
  peso_ct: number | null;
  preco_venda: number | null;
  markup_calculado: number | null;
}

/** Pedra sem preço (nenhum grupo casou) — precisa ser colocada num grupo */
interface PedraAguardando {
  id_produto: number;
  sku: string;
  nome: string;
  tipo_de_pedra: string | null;
  tamanho_mm: number | null;
  peso_ct: number | null;
  custo_proprio_usd: number | null;
  grupo_precificacao_id: number | null;
}

const C = {
  bg: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  sage: "#6b7280",
  muted: "#9ca3af",
  verde: "#16a34a",
  vermelho: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
  verdeBg: "#f0fdf4",
  vermelhoBg: "#fef2f2",
};

const emptyForm: RegraForm = {
  nome_tabela: "",
  categoria_pedra: "",
  custo_usd_ct: "",
  preco_rs_un: "",
  tamanho_inicial_mm: "1.0",
  tamanho_final_mm: "2.5",
  markup_inicial: "10",
  markup_final: "4",
  ativa: false,
};

function fmtBrl(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata markup: remove zeros desnecessários (10.0000 → 10, 4.5000 → 4.5) */
function fmtMkp(v: number | string | null | undefined): string {
  if (v == null) return "—";
  return Number(Number(v).toFixed(4)).toString();
}

export default function RegrasPedrasTab() {
  const [regras, setRegras] = useState<RegraPedra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState<RegraForm>(emptyForm);
  const [criando, setCriando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Auditoria: expansão por regra individual → lista de produtos
  const [expandirRegra, setExpandirRegra] = useState<Record<number, { loading: boolean; produtos: ProdutoAuditoria[] } | null>>({});
  // Pedras aguardando markup (sem grupo) + resumo de cobertura
  const [pedrasResumo, setPedrasResumo] = useState<{ total: number; com_preco: number; aguardando: number } | null>(null);
  const [aguardando, setAguardando] = useState<PedraAguardando[]>([]);
  const [grupoSel, setGrupoSel] = useState<Record<number, string>>({});
  const [movendo, setMovendo] = useState<number | null>(null);

  const carregarRegras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/precificacao/regras-pedras");
      if (!r.ok) throw new Error("Erro ao buscar regras");
      const d = await r.json();
      setRegras(d.regras ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarRegras(); }, [carregarRegras]);

  // Carrega as pedras sem preço (aguardando markup) + o resumo de cobertura.
  // REGRA: toda pedra tem que aparecer — as sem grupo ficam aqui pra serem movidas.
  const carregarPedras = useCallback(async () => {
    try {
      const r = await fetch("/api/precificacao/pedras");
      if (!r.ok) return;
      const d = await r.json();
      setPedrasResumo(d.resumo ?? null);
      setAguardando(d.aguardando ?? []);
    } catch { /* silencioso — bucket some se a chamada falhar */ }
  }, []);

  useEffect(() => { carregarPedras(); }, [carregarPedras]);

  // Move (fixa) a pedra num grupo. O preço sai do markup do grupo × custo da pedra.
  async function moverPedra(produtoId: number, grupoId: number) {
    setMovendo(produtoId);
    try {
      const r = await fetch(`/api/precificacao/pedras/${produtoId}/grupo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo_precificacao_id: grupoId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { showToast(d.error ?? "Erro ao mover", false); return; }
      showToast(
        d.aguardando_markup
          ? "Movida, mas segue sem preço — confira a faixa de tamanho do grupo"
          : `Precificada no grupo ${d.grupo}`,
        !d.aguardando_markup,
      );
      carregarPedras();
    } catch {
      showToast("Erro ao mover", false);
    } finally {
      setMovendo(null);
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function iniciarEdicao(r: RegraPedra) {
    setEditando(r.id);
    setForm({
      nome_tabela: r.nome_tabela,
      categoria_pedra: r.categoria_pedra,
      custo_usd_ct: r.custo_usd_ct != null ? String(r.custo_usd_ct) : "",
      preco_rs_un: r.preco_rs_un != null ? String(r.preco_rs_un) : "",
      tamanho_inicial_mm: String(r.tamanho_inicial_mm),
      tamanho_final_mm: String(r.tamanho_final_mm),
      markup_inicial: String(r.markup_inicial),
      markup_final: String(r.markup_final),
      ativa: r.ativa,
    });
  }

  function cancelarEdicao() {
    setEditando(null);
    setCriando(false);
    setForm(emptyForm);
  }

  async function salvarEdicao() {
    if (editando == null) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: editando };
      if (form.nome_tabela) body.nome_tabela = form.nome_tabela;
      if (form.categoria_pedra) body.categoria_pedra = form.categoria_pedra;
      if (form.custo_usd_ct) body.custo_usd_ct = Number(form.custo_usd_ct);
      else body.custo_usd_ct = null;
      if (form.preco_rs_un) body.preco_rs_un = Number(form.preco_rs_un);
      else body.preco_rs_un = null;
      body.tamanho_inicial_mm = Number(form.tamanho_inicial_mm);
      body.tamanho_final_mm = Number(form.tamanho_final_mm);
      body.markup_inicial = Number(form.markup_inicial);
      body.markup_final = Number(form.markup_final);
      body.ativa = form.ativa;

      const r = await fetch("/api/precificacao/regras-pedras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Erro ao salvar"); }
      showToast("Regra atualizada", true);
      cancelarEdicao();
      carregarRegras();
      carregarPedras(); // markup mudou → preço/cobertura das pedras pode mudar
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro", false);
    } finally {
      setSaving(false);
    }
  }

  async function criarRegra() {
    if (!form.categoria_pedra || !form.nome_tabela) {
      showToast("Categoria e nome obrigatórios", false);
      return;
    }
    if (!form.custo_usd_ct && !form.preco_rs_un) {
      showToast("Informe custo_usd_ct ou preco_rs_un", false);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nome_tabela: form.nome_tabela,
        categoria_pedra: form.categoria_pedra,
        tamanho_inicial_mm: Number(form.tamanho_inicial_mm),
        tamanho_final_mm: Number(form.tamanho_final_mm),
        markup_inicial: Number(form.markup_inicial),
        markup_final: Number(form.markup_final),
        ativa: form.ativa,
      };
      if (form.custo_usd_ct) body.custo_usd_ct = Number(form.custo_usd_ct);
      if (form.preco_rs_un) body.preco_rs_un = Number(form.preco_rs_un);

      const r = await fetch("/api/precificacao/regras-pedras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Erro ao criar"); }
      showToast("Regra criada", true);
      cancelarEdicao();
      carregarRegras();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro", false);
    } finally {
      setSaving(false);
    }
  }

  async function remover(id: number) {
    if (!confirm("Remover esta regra?")) return;
    try {
      const r = await fetch(`/api/precificacao/regras-pedras?id=${id}`, { method: "DELETE" });
      if (!r.ok) { showToast("Erro ao remover", false); return; }
      showToast("Regra removida", true);
      carregarRegras();
    } catch {
      showToast("Erro ao remover", false);
    }
  }

  async function toggleAtiva(r: RegraPedra) {
    try {
      const res = await fetch("/api/precificacao/regras-pedras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, ativa: true }),
      });
      if (!res.ok) { showToast("Erro ao ativar", false); return; }
      showToast(`Regra "${r.nome_tabela}" ativada para ${r.categoria_pedra}`, true);
      carregarRegras();
      carregarPedras();
    } catch {
      showToast("Erro ao ativar", false);
    }
  }

  /** Expande/recolhe a auditoria de produtos de uma regra */
  async function toggleAuditarProdutos(r: RegraPedra) {
    const atual = expandirRegra[r.id];
    if (atual) {
      // Já expandido → recolher
      setExpandirRegra((p) => ({ ...p, [r.id]: null }));
      return;
    }
    // Expandir → buscar produtos
    setExpandirRegra((p) => ({ ...p, [r.id]: { loading: true, produtos: [] } }));
    try {
      const res = await fetch(`/api/precificacao/regras-pedras/${r.id}/produtos`);
      if (!res.ok) throw new Error("Erro ao buscar produtos");
      const d = await res.json();
      setExpandirRegra((p) => ({ ...p, [r.id]: { loading: false, produtos: d.produtos ?? [] } }));
    } catch {
      setExpandirRegra((p) => ({ ...p, [r.id]: null }));
      showToast("Erro ao buscar produtos da regra", false);
    }
  }

  // Agrupa regras por categoria
  const categorias = [...new Set(regras.map((r) => r.categoria_pedra))].sort();

  if (loading) return <div className="flex items-center gap-2 py-8 justify-center" style={{ color: C.sage }}><Loader2 size={18} className="animate-spin" /> Carregando...</div>;
  if (error) return <div className="py-8 text-center" style={{ color: C.vermelho }}><AlertTriangle size={18} className="inline mr-2" />{error}</div>;

  return (
    <div>
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium"
          style={{ backgroundColor: toast.ok ? C.verdeBg : C.vermelhoBg, color: toast.ok ? C.verde : C.vermelho, border: `1px solid ${toast.ok ? C.verde : C.vermelho}` }}
        >
          {toast.msg}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold" style={{ color: C.text }}>Regras de Precificação por Categoria</h3>
        <button
          onClick={() => { if (!criando) { setCriando(true); setForm(emptyForm); } else cancelarEdicao(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: criando ? "#f3f4f6" : C.blue, color: criando ? C.text : "#fff" }}
        >
          {criando ? <X size={14} /> : <Plus size={14} />}
          {criando ? "Cancelar" : "Nova Regra"}
        </button>
      </div>

      {/* Formulário de criação */}
      {criando && (
        <div className="mb-4 p-4 rounded-xl border" style={{ borderColor: C.blue, backgroundColor: "#f0f7ff" }}>
          <RegraFormFields form={form} setForm={setForm} />
          <button
            onClick={criarRegra}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 mt-3 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: saving ? C.muted : C.verde }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Salvando..." : "Criar Regra"}
          </button>
        </div>
      )}

      {/* Resumo de cobertura + bucket "aguardando markup" */}
      {pedrasResumo && (
        <div className="mb-4">
          <div className="flex items-center gap-4 mb-2 text-sm">
            <span style={{ color: C.sage }}><strong style={{ color: C.text }}>{pedrasResumo.total}</strong> pedras</span>
            <span style={{ color: C.verde }}><Check size={13} className="inline mr-1" />{pedrasResumo.com_preco} com preço</span>
            <span style={{ color: pedrasResumo.aguardando > 0 ? C.amber : C.sage }}>
              {pedrasResumo.aguardando} aguardando markup
            </span>
          </div>

          {aguardando.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.amber, backgroundColor: "#fffbeb" }}>
              <div className="px-3 py-2 text-sm font-medium flex items-center gap-2" style={{ color: C.amber }}>
                <AlertTriangle size={14} /> Pedras sem preço — coloque cada uma num grupo
              </div>
              <div className="overflow-x-auto" style={{ borderTop: `1px solid ${C.amber}` }}>
                <table className="w-full text-sm" style={{ backgroundColor: C.card }}>
                  <thead>
                    <tr style={{ backgroundColor: "#fffbeb", color: C.sage }}>
                      <th className="p-2 text-left font-medium">SKU</th>
                      <th className="p-2 text-left font-medium">Pedra</th>
                      <th className="p-2 text-left font-medium">Tipo</th>
                      <th className="p-2 text-right font-medium">Tam (mm)</th>
                      <th className="p-2 text-right font-medium">Custo US$</th>
                      <th className="p-2 text-left font-medium">Pôr no grupo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aguardando.map((p) => (
                      <tr key={p.id_produto} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="p-2 font-mono" style={{ color: C.sage }}>{p.sku}</td>
                        <td className="p-2" style={{ color: C.text }}>{p.nome}</td>
                        <td className="p-2 capitalize" style={{ color: C.sage }}>{p.tipo_de_pedra ?? "—"}</td>
                        <td className="p-2 text-right" style={{ color: C.text }}>{p.tamanho_mm ?? "—"}</td>
                        <td className="p-2 text-right" style={{ color: C.text }}>{p.custo_proprio_usd != null ? `$${p.custo_proprio_usd}` : "—"}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={grupoSel[p.id_produto] ?? ""}
                              onChange={(e) => setGrupoSel((s) => ({ ...s, [p.id_produto]: e.target.value }))}
                              className="px-2 py-1 rounded border text-xs"
                              style={{ borderColor: C.border }}
                            >
                              <option value="">escolher grupo…</option>
                              {regras.map((r) => (
                                <option key={r.id} value={r.id}>{r.categoria_pedra} · {r.nome_tabela}</option>
                              ))}
                            </select>
                            <button
                              disabled={!grupoSel[p.id_produto] || movendo === p.id_produto}
                              onClick={() => moverPedra(p.id_produto, Number(grupoSel[p.id_produto]))}
                              className="px-2 py-1 rounded text-xs text-white disabled:opacity-40"
                              style={{ backgroundColor: C.verde }}
                            >
                              {movendo === p.id_produto ? "…" : "mover"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de regras por categoria */}
      {categorias.length === 0 ? (
        <p style={{ color: C.sage }}>Nenhuma regra cadastrada.</p>
      ) : (
        categorias.map((cat) => {
          const regrasCat = regras.filter((r) => r.categoria_pedra === cat);
          const ex = expanded[cat];

          return (
            <div key={cat} className="mb-3 rounded-xl border" style={{ borderColor: C.border }}>
              {/* Cabeçalho da categoria */}
              <button
                onClick={() => setExpanded((p) => ({ ...p, [cat]: !p[cat] }))}
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  {ex ? <ChevronDown size={16} style={{ color: C.sage }} /> : <ChevronRight size={16} style={{ color: C.sage }} />}
                  <span className="font-medium capitalize" style={{ color: C.text }}>{cat}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f3f4f6", color: C.sage }}>
                    {regrasCat.length} regra{regrasCat.length !== 1 ? "s" : ""}
                  </span>
                  {regrasCat.some((r) => r.ativa) && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.verdeBg, color: C.verde }}>ativa</span>
                  )}
                </div>
              </button>

              {/* Tabela de regras da categoria */}
              {ex && (
                <div className="overflow-x-auto" style={{ borderTop: `1px solid ${C.border}` }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: "#f9fafb", color: C.sage }}>
                        <th className="p-2 text-left font-medium">Nome</th>
                        <th className="p-2 text-left font-medium">Range (mm)</th>
                        <th className="p-2 text-right font-medium">Custo USD/ct</th>
                        <th className="p-2 text-right font-medium">Preço R$/un</th>
                        <th className="p-2 text-right font-medium">Markup Ini</th>
                        <th className="p-2 text-right font-medium">Markup Fim</th>
                        <th className="p-2 text-center font-medium">Ativa</th>
                        <th className="p-2 text-center font-medium">Ações</th>
                        <th className="p-2 text-center font-medium" style={{ width: 30 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {regrasCat.map((r) => {
                          const aud = expandirRegra[r.id];
                          const audExpandido = aud != null;

                          return (
                            <React.Fragment key={r.id}>
                              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                                {editando === r.id ? (
                                  <EdicaoColunas r={r} form={form} setForm={setForm} saving={saving} onSave={salvarEdicao} onCancel={cancelarEdicao} />
                                ) : (
                                  <>
                                    <td className="p-2" style={{ color: C.text }}>{r.nome_tabela}</td>
                                    <td className="p-2" style={{ color: C.sage }}>{Number(r.tamanho_inicial_mm)}–{Number(r.tamanho_final_mm)}mm</td>
                                    <td className="p-2 text-right" style={{ color: C.text }}>{r.custo_usd_ct != null ? `$${Number(r.custo_usd_ct)}` : "—"}</td>
                                    <td className="p-2 text-right" style={{ color: C.text }}>{r.preco_rs_un != null ? fmtBrl(r.preco_rs_un) : "—"}</td>
                                    <td className="p-2 text-right" style={{ color: C.text }}>{fmtMkp(r.markup_inicial)}×</td>
                                    <td className="p-2 text-right" style={{ color: C.text }}>{fmtMkp(r.markup_final)}×</td>
                                    <td className="p-2 text-center">
                                      {r.ativa ? (
                                        <Check size={16} style={{ color: C.verde, display: "inline" }} />
                                      ) : (
                                        <button
                                          onClick={() => toggleAtiva(r)}
                                          className="text-xs underline"
                                          style={{ color: C.blue }}
                                          title="Ativar esta regra"
                                        >
                                          ativar
                                        </button>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => iniciarEdicao(r)}
                                          className="p-1 rounded hover:bg-gray-100"
                                          title="Editar"
                                        >
                                          <Save size={14} style={{ color: C.blue }} />
                                        </button>
                                        <button
                                          onClick={() => remover(r.id)}
                                          className="p-1 rounded hover:bg-gray-100"
                                          title="Remover"
                                        >
                                          <Trash2 size={14} style={{ color: C.vermelho }} />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                                {/* Botão expandir produtos */}
                                {editando !== r.id && (
                                  <td className="p-2 text-center">
                                    <button
                                      onClick={() => toggleAuditarProdutos(r)}
                                      className="p-1 rounded hover:bg-gray-100"
                                      title={audExpandido ? "Recolher produtos" : "Ver produtos desta regra"}
                                    >
                                      {aud?.loading ? (
                                        <Loader2 size={14} className="animate-spin" style={{ color: C.sage }} />
                                      ) : audExpandido ? (
                                        <ChevronDown size={14} style={{ color: C.blue }} />
                                      ) : (
                                        <ChevronRight size={14} style={{ color: C.sage }} />
                                      )}
                                    </button>
                                  </td>
                                )}
                              </tr>
                              {/* Sub-tabela: produtos da regra */}
                              {audExpandido && (
                                <tr key={`aud-${r.id}`}>
                                  <td colSpan={10} className="p-0" style={{ backgroundColor: "#f8fafc" }}>
                                    {aud?.loading ? (
                                      <div className="flex items-center gap-2 p-3 text-sm" style={{ color: C.sage }}>
                                        <Loader2 size={14} className="animate-spin" /> Buscando produtos...
                                      </div>
                                    ) : aud?.produtos.length === 0 ? (
                                      <div className="p-3 text-sm" style={{ color: C.sage }}>
                                        Nenhum produto encontrado neste range.
                                      </div>
                                    ) : (
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr style={{ backgroundColor: "#f1f5f9", color: C.sage }}>
                                            <th className="p-1.5 text-left font-medium">SKU</th>
                                            <th className="p-1.5 text-left font-medium">Nome</th>
                                            <th className="p-1.5 text-right font-medium">Peso (ct)</th>
                                            <th className="p-1.5 text-right font-medium">Markup</th>
                                            <th className="p-1.5 text-right font-medium">Preço Venda</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {aud!.produtos.map((prod) => (
                                            <tr key={prod.id_produto} style={{ borderTop: `1px solid #e2e8f0` }}>
                                              <td className="p-1.5" style={{ color: C.sage, fontFamily: "monospace" }}>{prod.sku}</td>
                                              <td className="p-1.5" style={{ color: C.text }}>{prod.nome}</td>
                                              <td className="p-1.5 text-right" style={{ color: C.text }}>{prod.peso_ct != null ? Number(prod.peso_ct) : "—"}</td>
                                              <td className="p-1.5 text-right" style={{ color: C.text }}>{fmtMkp(prod.markup_calculado)}×</td>
                                              <td className="p-1.5 text-right font-medium" style={{ color: C.text }}>{prod.preco_venda != null ? fmtBrl(prod.preco_venda) : "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Formulário inline ─────────────────────────────────────────────────────────
function RegraFormFields({
  form, setForm,
}: {
  form: RegraForm;
  setForm: (f: RegraForm) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <label style={{ color: "#374151" }}>
        Categoria
        <input
          value={form.categoria_pedra}
          onChange={(e) => setForm({ ...form, categoria_pedra: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
          placeholder="diamante"
        />
      </label>
      <label style={{ color: "#374151" }}>
        Nome Tabela
        <input
          value={form.nome_tabela}
          onChange={(e) => setForm({ ...form, nome_tabela: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
          placeholder="Padrão 1.0–2.5mm"
        />
      </label>
      <label style={{ color: "#374151" }}>
        Custo USD/ct
        <input
          value={form.custo_usd_ct}
          onChange={(e) => setForm({ ...form, custo_usd_ct: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
          placeholder="400"
        />
      </label>
      <label style={{ color: "#374151" }}>
        Preço R$/un (Zircônia)
        <input
          value={form.preco_rs_un}
          onChange={(e) => setForm({ ...form, preco_rs_un: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
          placeholder="40"
        />
      </label>
      <label style={{ color: "#374151" }}>
        Tam. Inicial (mm)
        <input
          value={form.tamanho_inicial_mm}
          onChange={(e) => setForm({ ...form, tamanho_inicial_mm: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </label>
      <label style={{ color: "#374151" }}>
        Tam. Final (mm)
        <input
          value={form.tamanho_final_mm}
          onChange={(e) => setForm({ ...form, tamanho_final_mm: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </label>
      <label style={{ color: "#374151" }}>
        Markup Inicial
        <input
          value={form.markup_inicial}
          onChange={(e) => setForm({ ...form, markup_inicial: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </label>
      <label style={{ color: "#374151" }}>
        Markup Final
        <input
          value={form.markup_final}
          onChange={(e) => setForm({ ...form, markup_final: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </label>
      <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#374151" }}>
        <input
          type="checkbox"
          checked={form.ativa}
          onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
        />
        Regra ATUAL
      </label>
    </div>
  );
}

// ─── Colunas em modo edição ─────────────────────────────────────────────────────
function EdicaoColunas({
  r, form, setForm, saving, onSave, onCancel,
}: {
  r: RegraPedra;
  form: RegraForm;
  setForm: (f: RegraForm) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <td className="p-1">
        <input
          value={form.nome_tabela}
          onChange={(e) => setForm({ ...form, nome_tabela: e.target.value })}
          className="w-full px-1 py-0.5 text-sm rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </td>
      <td className="p-1">
        <div className="flex gap-1">
          <input
            value={form.tamanho_inicial_mm}
            onChange={(e) => setForm({ ...form, tamanho_inicial_mm: e.target.value })}
            className="w-14 px-1 py-0.5 text-sm rounded border"
            style={{ borderColor: "#d1d5db" }}
          />
          <span style={{ color: "#9ca3af" }}>–</span>
          <input
            value={form.tamanho_final_mm}
            onChange={(e) => setForm({ ...form, tamanho_final_mm: e.target.value })}
            className="w-14 px-1 py-0.5 text-sm rounded border"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>
      </td>
      <td className="p-1">
        <input
          value={form.custo_usd_ct}
          onChange={(e) => setForm({ ...form, custo_usd_ct: e.target.value })}
          className="w-20 px-1 py-0.5 text-sm rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </td>
      <td className="p-1">
        <input
          value={form.preco_rs_un}
          onChange={(e) => setForm({ ...form, preco_rs_un: e.target.value })}
          className="w-20 px-1 py-0.5 text-sm rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </td>
      <td className="p-1">
        <input
          value={form.markup_inicial}
          onChange={(e) => setForm({ ...form, markup_inicial: e.target.value })}
          className="w-16 px-1 py-0.5 text-sm rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </td>
      <td className="p-1">
        <input
          value={form.markup_final}
          onChange={(e) => setForm({ ...form, markup_final: e.target.value })}
          className="w-16 px-1 py-0.5 text-sm rounded border"
          style={{ borderColor: "#d1d5db" }}
        />
      </td>
      <td className="p-1 text-center">
        <input
          type="checkbox"
          checked={form.ativa}
          onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
        />
      </td>
      <td className="p-1 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="p-1 rounded hover:bg-green-50"
            title="Salvar"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} style={{ color: C.verde }} />}
          </button>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-red-50"
            title="Cancelar"
          >
            <X size={14} style={{ color: C.vermelho }} />
          </button>
        </div>
      </td>
    </>
  );
}
