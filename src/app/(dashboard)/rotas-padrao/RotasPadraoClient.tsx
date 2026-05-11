"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Pencil, Trash2, X, Star, ChevronUp, ChevronDown, Check, Layers } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  dourado:     "#DB9864",
};

interface Template {
  id: number;
  nome: string;
  categoria: string | null;
  is_default: boolean;
  ativo: boolean;
  qtd_etapas: number;
}

interface Setor {
  id: number;
  nome: string;
  requer_peso: boolean;
}

export default function RotasPadraoClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Template | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const [tplRes, catRes, setRes] = await Promise.all([
        fetch("/api/rotas-template"),
        fetch("/api/produtos/categorias-distinct"),
        fetch("/api/setores"),
      ]);
      if (!tplRes.ok) throw new Error("Erro ao carregar templates");
      if (!catRes.ok) throw new Error("Erro ao carregar categorias");
      if (!setRes.ok) throw new Error("Erro ao carregar setores");
      const [tpls, cats, sets] = await Promise.all([
        tplRes.json() as Promise<Template[]>,
        catRes.json() as Promise<string[]>,
        setRes.json() as Promise<Setor[]>,
      ]);
      setTemplates(tpls);
      setCategorias(cats);
      setSetores(sets.filter((s) => (s as Setor & { ativo?: boolean }).ativo !== false));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Agrupa templates por categoria
  const grupos = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const key = t.categoria ?? "(sem categoria)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Ordena: default primeiro dentro de cada grupo, depois por nome
    for (const arr of map.values()) {
      arr.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.nome.localeCompare(b.nome));
    }
    // Categorias em ordem alfabética; "(sem categoria)" no fim
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "(sem categoria)") return 1;
      if (b === "(sem categoria)") return -1;
      return a.localeCompare(b);
    });
  }, [templates]);

  async function excluir(t: Template) {
    if (!confirm(`Inativar template "${t.nome}"?`)) return;
    try {
      const r = await fetch(`/api/rotas-template/${t.id}`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    }
  }

  async function toggleDefault(t: Template) {
    if (!t.categoria) {
      setErro("Defina uma categoria antes de marcar como default");
      return;
    }
    try {
      const r = await fetch(`/api/rotas-template/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: !t.is_default }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    }
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      <div className="mb-4 md:mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Rotas Padrão
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Templates de rota reutilizáveis. Quando produto Alisson é cadastrado, a rota
            <strong> default da categoria</strong> é aplicada automaticamente.
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={14} strokeWidth={2.5} /> Novo template
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm border flex items-center justify-between gap-3" style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#7F1D1D" }}>
          <span>⚠ {erro}</span>
          <button onClick={() => setErro(null)} className="p-1 rounded hover:bg-red-100">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: "#9CA3AF" }}>
          <Loader2 size={20} className="animate-spin mr-2" /> Carregando…
        </div>
      ) : grupos.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>
          Nenhum template ativo. Use <strong>Novo template</strong> pra começar.
        </p>
      ) : (
        <div className="space-y-6">
          {grupos.map(([categoria, tpls]) => (
            <section key={categoria}>
              <h3 className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
                {categoria}
              </h3>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                {tpls.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3 border-b"
                    style={{ borderColor: C.cremeBorder, opacity: t.ativo ? 1 : 0.5 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: "#111827" }}>{t.nome}</span>
                        {t.is_default && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                            style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                            title="Aplicado automaticamente em produtos Alisson dessa categoria"
                          >
                            <Star size={9} fill="currentColor" /> DEFAULT
                          </span>
                        )}
                      </div>
                      <span className="text-[11px]" style={{ color: "#6B7280" }}>
                        <Layers size={10} className="inline" /> {t.qtd_etapas} etapa(s)
                      </span>
                    </div>
                    <button
                      onClick={() => toggleDefault(t)}
                      disabled={!t.categoria}
                      className="p-1.5 rounded hover:bg-amber-50 disabled:opacity-30"
                      title={t.is_default ? "Remover default" : "Marcar como default"}
                      style={{ color: t.is_default ? "#D97706" : "#9CA3AF" }}
                    >
                      <Star size={14} fill={t.is_default ? "currentColor" : "none"} />
                    </button>
                    <button
                      onClick={() => setEditando(t)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                      title="Editar etapas"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => excluir(t)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                      title="Inativar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(criando || editando) && (
        <ModalEditar
          template={editando}
          categorias={categorias}
          setores={setores}
          onClose={() => { setCriando(false); setEditando(null); }}
          onSuccess={() => { setCriando(false); setEditando(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ─── Modal de criar/editar template ─────────────────────────────────────────
function ModalEditar({
  template,
  categorias,
  setores,
  onClose,
  onSuccess,
}: {
  template: Template | null;
  categorias: string[];
  setores: Setor[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isNovo = template == null;
  const [nome, setNome] = useState(template?.nome ?? "");
  const [categoria, setCategoria] = useState(template?.categoria ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [etapas, setEtapas] = useState<number[]>([]);
  const [loadingEtapas, setLoadingEtapas] = useState(!isNovo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega etapas existentes
  useEffect(() => {
    if (isNovo || !template) { setLoadingEtapas(false); return; }
    fetch(`/api/rotas-template/${template.id}/etapas`)
      .then((r) => r.json())
      .then((arr: { setor_id: number }[]) => {
        if (Array.isArray(arr)) setEtapas(arr.map((e) => Number(e.setor_id)));
      })
      .catch(() => setErro("Erro ao carregar etapas"))
      .finally(() => setLoadingEtapas(false));
  }, [isNovo, template]);

  function adicionarEtapa(setorId: number) {
    setEtapas((arr) => [...arr, setorId]);
  }
  function removerEtapa(idx: number) {
    setEtapas((arr) => arr.filter((_, i) => i !== idx));
  }
  function moverEtapa(idx: number, dir: -1 | 1) {
    setEtapas((arr) => {
      const novo = [...arr];
      const j = idx + dir;
      if (j < 0 || j >= novo.length) return arr;
      [novo[idx], novo[j]] = [novo[j], novo[idx]];
      return novo;
    });
  }

  async function salvar() {
    if (!nome.trim()) { setErro("Nome obrigatório"); return; }
    if (isDefault && !categoria.trim()) { setErro("Default exige categoria"); return; }
    setSalvando(true); setErro(null);
    try {
      let tplId = template?.id;
      if (isNovo) {
        const r = await fetch("/api/rotas-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome.trim(), categoria: categoria.trim() || null, is_default: isDefault }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
          return;
        }
        const { id } = await r.json() as { id: number };
        tplId = id;
      } else {
        const r = await fetch(`/api/rotas-template/${template!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome.trim(), categoria: categoria.trim() || null, is_default: isDefault }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
          return;
        }
      }
      // Salva etapas
      if (tplId) {
        const r2 = await fetch(`/api/rotas-template/${tplId}/etapas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setor_ids: etapas }),
        });
        if (!r2.ok) {
          const b = await r2.json().catch(() => ({}));
          setErro((b as { error?: string }).error ?? `Erro ${r2.status} ao salvar etapas`);
          return;
        }
      }
      onSuccess();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-base font-semibold" style={{ color: C.esmeralda }}>
            {isNovo ? "Novo template de rota" : `Editar — ${template?.nome}`}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Nome do template
            </label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Anel cravado · Aliança lisa"
              className="w-full px-3 py-2 mt-1 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.cremeBorder, color: "#111827" }}
              maxLength={120}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>
              Categoria (match exato com produtos.categoria)
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full px-3 py-2 mt-1 rounded-lg border text-sm outline-none bg-white"
              style={{ borderColor: C.cremeBorder, color: "#111827" }}
            >
              <option value="">— Sem vínculo (aplicação manual apenas) —</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              disabled={!categoria}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-[#184036]"
            />
            <span className="text-sm flex items-center gap-1.5" style={{ color: categoria ? "#111827" : "#9CA3AF" }}>
              <Star size={12} fill={isDefault ? "#D97706" : "none"} style={{ color: "#D97706" }} />
              Default da categoria — aplicar automaticamente em produtos Alisson
            </span>
          </label>
          {!categoria && (
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
              Default só funciona com categoria selecionada.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                Etapas ({etapas.length})
              </label>
            </div>
            {loadingEtapas ? (
              <div className="flex items-center gap-2 text-[12px] py-2" style={{ color: "#9CA3AF" }}>
                <Loader2 size={12} className="animate-spin" /> Carregando etapas…
              </div>
            ) : (
              <div className="space-y-1.5">
                {etapas.length === 0 && (
                  <p className="text-[12px] py-2" style={{ color: "#9CA3AF" }}>
                    Nenhuma etapa. Adicione setores abaixo na ordem de fabricação.
                  </p>
                )}
                {etapas.map((setorId, idx) => {
                  const s = setores.find((x) => x.id === setorId);
                  return (
                    <div key={`${idx}-${setorId}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm" style={{ color: "#111827" }}>
                        {s?.nome ?? `(setor #${setorId})`}
                      </span>
                      <button
                        onClick={() => moverEtapa(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-white disabled:opacity-30"
                        title="Subir"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        onClick={() => moverEtapa(idx, 1)}
                        disabled={idx === etapas.length - 1}
                        className="p-1 rounded hover:bg-white disabled:opacity-30"
                        title="Descer"
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        onClick={() => removerEtapa(idx)}
                        className="p-1 rounded hover:bg-red-50 text-red-500"
                        title="Remover etapa"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}

                <select
                  value=""
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) adicionarEtapa(v);
                    e.target.value = "";
                  }}
                  className="w-full px-3 py-2 mt-2 rounded-lg border text-sm outline-none bg-white"
                  style={{ borderColor: C.cremeBorder, color: "#111827" }}
                >
                  <option value="">+ Adicionar etapa…</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} {s.requer_peso ? "" : "(pré-ouro)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {erro && <p className="text-[12px] text-red-600">⚠ {erro}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-[13px] hover:bg-gray-100" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !nome.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
