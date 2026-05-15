"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Search, Loader2, ImagePlus, CheckSquare, Square, Store,
} from "lucide-react";
import { useDebounce } from "./_shared/useDebounce";
import { compressImage } from "./_shared/compressImage";
import { C } from "./_shared/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Produto {
  id_produto: number;
  nome: string;
  sku: string;
  peso_precificado: number | null;
  tipo_metal?: string | null;
}

interface Variacao {
  id_produto: number;
  nome: string;
  sku: string;
  peso_precificado: number | null;
  sufixo_variacao: string | null;
  numeracao: string | null;
  tipo_metal?: string | null;
}

interface ItemSelecionado {
  qtd: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userName: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NovaOrdemReposicaoLojaModal({
  isOpen,
  onClose,
  onSuccess,
  userName,
}: Props) {
  // ── Busca ──────────────────────────────────────────────────────────────────
  const [busca, setBusca]           = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [buscando, setBuscando]     = useState(false);
  const [dropOpen, setDropOpen]     = useState(false);
  const buscaRef                    = useRef<HTMLDivElement>(null);
  const buscaDebounced              = useDebounce(busca, 300);

  // ── Produto / variações ────────────────────────────────────────────────────
  const [produto, setProduto]           = useState<Produto | null>(null);
  const [variacoes, setVariacoes]       = useState<Variacao[]>([]);
  const [loadingVar, setLoadingVar]     = useState(false);
  const [selecionados, setSelecionados] = useState<Map<number, ItemSelecionado>>(new Map());

  // ── Produto simples (sem variações) ───────────────────────────────────────
  const [qtdSimples,  setQtdSimples]  = useState(1);
  const [pesoSimples, setPesoSimples] = useState("");

  // ── Misc ───────────────────────────────────────────────────────────────────
  const [obs,      setObs]      = useState("");
  const [fotos,    setFotos]    = useState<{ file: File; preview: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  // ── Fechar dropdown de busca ao clicar fora ────────────────────────────────
  useEffect(() => {
    function h(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node))
        setDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Reset ao abrir ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setBusca(""); setResultados([]); setDropOpen(false);
    setProduto(null); setVariacoes([]); setSelecionados(new Map());
    setQtdSimples(1); setPesoSimples("");
    setObs("");
    setFotos(prev => { prev.forEach(f => URL.revokeObjectURL(f.preview)); return []; });
    setErro(null);
  }, [isOpen]);

  // ── Busca de produtos (debounce 300ms) ─────────────────────────────────────
  useEffect(() => {
    if (buscaDebounced.length < 2 || produto) {
      setResultados([]); setDropOpen(false); return;
    }
    setBuscando(true);
    fetch(`/api/ordens/produtos-busca?busca=${encodeURIComponent(buscaDebounced)}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setResultados(Array.isArray(d) ? d : []); setDropOpen(true); })
      .catch(() => setResultados([]))
      .finally(() => setBuscando(false));
  }, [buscaDebounced, produto]);

  // ── Selecionar produto ─────────────────────────────────────────────────────
  async function selecionar(p: Produto) {
    setBusca(""); setDropOpen(false); setResultados([]);
    setProduto(p);
    setSelecionados(new Map());
    setVariacoes([]);
    setPesoSimples(p.peso_precificado != null ? Number(p.peso_precificado).toFixed(2) : "");
    setQtdSimples(1);
    setLoadingVar(true);
    try {
      const res = await fetch(`/api/produtos/${p.id_produto}/variacoes`);
      if (res.ok) {
        const data = await res.json();
        setVariacoes(data.variacoes ?? []);
      }
    } catch { /* trata como simples */ }
    finally { setLoadingVar(false); }
  }

  function removerProduto() {
    setProduto(null); setVariacoes([]); setSelecionados(new Map());
    setQtdSimples(1); setPesoSimples("");
  }

  // ── Toggle variação ────────────────────────────────────────────────────────
  function toggle(v: Variacao) {
    setSelecionados(prev => {
      const m = new Map(prev);
      if (m.has(v.id_produto)) m.delete(v.id_produto);
      else m.set(v.id_produto, { qtd: 1 });
      return m;
    });
  }

  function setQtdVar(id: number, qtd: number) {
    setSelecionados(prev => {
      const m    = new Map(prev);
      const item = m.get(id);
      if (item) m.set(id, { qtd: Math.max(1, Math.floor(qtd) || 1) });
      return m;
    });
  }

  // ── Resumo calculado em tempo real ─────────────────────────────────────────
  const temVar   = variacoes.length > 0;
  const totalUn  = temVar
    ? Array.from(selecionados.values()).reduce((s, i) => s + i.qtd, 0)
    : qtdSimples;
  const pesoTotal = temVar
    ? Array.from(selecionados.entries()).reduce((s, [id, item]) => {
        const v = variacoes.find(x => x.id_produto === id);
        return s + item.qtd * (v?.peso_precificado != null ? Number(v.peso_precificado) : 0);
      }, 0)
    : qtdSimples * (parseFloat(pesoSimples) || 0);

  const canSubmit = !salvando && produto != null && (
    temVar ? selecionados.size > 0 && totalUn > 0 : qtdSimples >= 1
  );

  // ── Fotos ──────────────────────────────────────────────────────────────────
  function addFotos(files: FileList | null) {
    if (!files) return;
    const novas = Array.from(files)
      .filter(f => f.size <= 10 * 1024 * 1024)
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setFotos(prev => [...prev, ...novas]);
  }

  function removerFoto(i: number) {
    setFotos(prev => {
      const arr = [...prev];
      URL.revokeObjectURL(arr[i].preview);
      arr.splice(i, 1);
      return arr;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || !produto) return;
    setSalvando(true);
    setErro(null);

    try {
      // Comprimir fotos e converter para base64 (upload server-side na API)
      const fotosBase64: string[] = [];
      for (const f of fotos) {
        const b64 = await compressImage(f.file);
        if (b64) fotosBase64.push(b64);
      }

      // Montar itens
      const itens = temVar
        ? Array.from(selecionados.entries()).map(([id, item]) => {
            const v = variacoes.find(x => x.id_produto === id)!;
            return {
              produto_id:    id,
              quantidade:    item.qtd,
              peso_estimado: parseFloat(
                (item.qtd * (v.peso_precificado != null ? Number(v.peso_precificado) : 0)).toFixed(2)
              ),
            };
          })
        : [{
            produto_id:    produto.id_produto,
            quantidade:    qtdSimples,
            peso_estimado: parseFloat(
              (qtdSimples * (parseFloat(pesoSimples) || 0)).toFixed(2)
            ),
          }];

      const bodyPayload: Record<string, unknown> = {
        tipo_ordem:     "reposicao_loja",
        detalhes_ordem: obs.trim() || null,
        itens,
      };
      if (fotosBase64.length > 0) bodyPayload.fotos_base64 = fotosBase64;

      const res  = await fetch("/api/ordens", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(bodyPayload),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? "Erro ao criar ordem");
        return;
      }

      onClose();
      onSuccess?.(data.numero_ordem);
    } catch {
      setErro("Erro inesperado. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  if (!isOpen) return null;

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop — clique fecha o modal */}
      <div
        className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        {/* Painel — stopPropagation evita fechar ao clicar dentro */}
        <div
          className="w-full md:max-w-xl md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col shadow-2xl"
          style={{ backgroundColor: "#fff", maxHeight: "90vh" }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div
            className="px-5 py-4 flex items-center justify-between border-b shrink-0"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#E0F2FE" }}
              >
                <Store size={17} style={{ color: "#0369A1" }} />
              </div>
              <div>
                <h2
                  className="text-base font-semibold leading-tight"
                  style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
                >
                  Reposição Loja
                </h2>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: "#E0F2FE", color: "#0369A1" }}
                >
                  Nova Ordem
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Fechar"
            >
              <X size={18} style={{ color: "#6B7280" }} />
            </button>
          </div>

          {/* ── Body rolável ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Info: solicitante + data */}
            <div
              className="grid grid-cols-2 gap-3 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: C.bg, border: `1px solid ${C.cremeBorder}` }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "#9CA3AF" }}>
                  Solicitante
                </p>
                <p className="font-medium truncate" style={{ color: "#1A1A1A" }}>{userName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "#9CA3AF" }}>
                  Data
                </p>
                <p className="font-medium" style={{ color: "#1A1A1A" }}>{hoje}</p>
              </div>
            </div>

            {/* ── Busca / seleção de produto ─────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Produto
              </p>

              {!produto ? (
                /* Campo de busca */
                <div className="relative" ref={buscaRef}>
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  >
                    {buscando
                      ? <Loader2 size={15} className="animate-spin shrink-0" style={{ color: "#9CA3AF" }} />
                      : <Search size={15} className="shrink-0" style={{ color: "#9CA3AF" }} />
                    }
                    <input
                      type="text"
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar por nome ou SKU..."
                      className="flex-1 text-sm bg-transparent outline-none"
                      style={{ color: "#1A1A1A" }}
                      autoFocus
                    />
                  </div>

                  {/* Dropdown resultados */}
                  {dropOpen && resultados.length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border overflow-hidden max-h-48 overflow-y-auto"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      {resultados.map(p => (
                        <button
                          key={p.id_produto}
                          onClick={() => selecionar(p)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left border-b last:border-0"
                          style={{ borderColor: C.creme }}
                        >
                          <div className="min-w-0 mr-2">
                            <p className="font-medium truncate" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                            <p className="text-xs" style={{ color: "#6B7280" }}>
                              {p.sku}{p.tipo_metal ? ` · ${p.tipo_metal}` : ""}
                            </p>
                          </div>
                          {p.peso_precificado != null && (
                            <span className="text-xs shrink-0" style={{ color: "#9CA3AF" }}>
                              {Number(p.peso_precificado).toFixed(2)}g
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dropdown "sem resultados" */}
                  {dropOpen && busca.length >= 2 && resultados.length === 0 && !buscando && (
                    <div
                      className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border px-4 py-3 text-sm"
                      style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                    >
                      Nenhum produto encontrado para &ldquo;{busca}&rdquo;
                    </div>
                  )}
                </div>
              ) : (
                /* Card produto selecionado */
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: "#0369A1", backgroundColor: "#F0F9FF" }}
                >
                  {/* Header do card */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 mr-2">
                      <p className="font-semibold text-sm truncate" style={{ color: "#1A1A1A" }}>
                        {produto.nome}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                        {produto.sku}{produto.tipo_metal ? ` · ${produto.tipo_metal}` : ""}
                        {!temVar && !loadingVar && produto.peso_precificado != null && (
                          <> · {Number(produto.peso_precificado).toFixed(2)}g/un</>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={removerProduto}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                      title="Remover produto"
                    >
                      <X size={14} style={{ color: "#0369A1" }} />
                    </button>
                  </div>

                  {loadingVar ? (
                    <div className="flex items-center gap-2 py-1" style={{ color: "#6B7280" }}>
                      <Loader2 size={13} className="animate-spin" />
                      <span className="text-xs">Carregando variações...</span>
                    </div>
                  ) : temVar ? (
                    /* Checklist de variações */
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#0369A1" }}>
                        Variações disponíveis ({variacoes.length})
                      </p>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                        {variacoes.map(v => {
                          const checked = selecionados.has(v.id_produto);
                          const item    = selecionados.get(v.id_produto);
                          return (
                            <div
                              key={v.id_produto}
                              className="flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors"
                              style={{
                                backgroundColor: checked ? "#DBEAFE" : "#fff",
                                border: `1px solid ${checked ? "#3B82F6" : C.cremeBorder}`,
                              }}
                            >
                              <button
                                onClick={() => toggle(v)}
                                className="shrink-0"
                                aria-label={checked ? "Desmarcar" : "Marcar"}
                              >
                                {checked
                                  ? <CheckSquare size={16} style={{ color: "#2563EB" }} />
                                  : <Square      size={16} style={{ color: "#9CA3AF" }} />
                                }
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "#1A1A1A" }}>
                                  {v.sufixo_variacao ? `Tam. ${v.sufixo_variacao}` : v.nome}
                                </p>
                                <p className="text-[10px]" style={{ color: "#6B7280" }}>
                                  {v.sku} · {v.peso_precificado != null ? `${Number(v.peso_precificado).toFixed(2)}g` : "—"}
                                </p>
                              </div>
                              <input
                                type="number"
                                min={1}
                                value={checked ? (item?.qtd ?? 1) : ""}
                                disabled={!checked}
                                onChange={e => setQtdVar(v.id_produto, parseInt(e.target.value) || 1)}
                                onFocus={e => { if (checked) e.target.select(); }}
                                placeholder="Qtd"
                                className="w-14 text-center text-xs px-1.5 py-1.5 rounded-lg border outline-none"
                                style={{
                                  borderColor:     checked ? "#3B82F6" : C.cremeBorder,
                                  backgroundColor: checked ? "#fff"    : "#F3F4F6",
                                  color:           checked ? "#1A1A1A" : "#9CA3AF",
                                  cursor: checked ? "text" : "not-allowed",
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Produto simples — quantidade + peso */
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label
                          className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
                          style={{ color: "#0369A1" }}
                        >
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={qtdSimples}
                          onChange={e => setQtdSimples(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                          style={{ borderColor: "#0369A1", backgroundColor: "#fff", color: "#1A1A1A" }}
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
                          style={{ color: "#0369A1" }}
                        >
                          Peso unit. (g)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={pesoSimples}
                          onChange={e => setPesoSimples(e.target.value)}
                          className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                          style={{ borderColor: "#0369A1", backgroundColor: "#fff", color: "#1A1A1A" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Resumo ─────────────────────────────────────────────────────── */}
            {produto && (temVar ? selecionados.size > 0 : qtdSimples > 0) && (
              <div
                className="flex items-center gap-5 px-4 py-3 rounded-xl"
                style={{ backgroundColor: C.bg, border: `1px solid ${C.cremeBorder}` }}
              >
                {temVar && (
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>
                      Variações
                    </p>
                    <p className="font-bold text-lg leading-tight" style={{ color: C.esmeralda }}>
                      {selecionados.size}
                    </p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>
                    Unidades
                  </p>
                  <p className="font-bold text-lg leading-tight" style={{ color: C.esmeralda }}>
                    {totalUn}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>
                    Peso est.
                  </p>
                  <p className="font-bold text-lg leading-tight" style={{ color: C.esmeralda }}>
                    {pesoTotal.toFixed(2)}g
                  </p>
                </div>
              </div>
            )}

            {/* ── Observações ────────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Observações{" "}
                <span style={{ color: "#9CA3AF", textTransform: "none", fontWeight: "normal" }}>
                  (opcional)
                </span>
              </p>
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={2}
                placeholder="Instruções, urgência, referências..."
                className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none resize-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: "#1A1A1A" }}
              />
            </div>

            {/* ── Fotos de referência ────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Fotos de referência{" "}
                <span style={{ color: "#9CA3AF", textTransform: "none", fontWeight: "normal" }}>
                  (opcional · max 10MB cada)
                </span>
              </p>
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => addFotos(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative w-20 h-20 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.preview}
                      alt={`foto ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-xl border"
                      style={{ borderColor: C.cremeBorder }}
                    />
                    <button
                      onClick={() => removerFoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: "#EF4444" }}
                      aria-label="Remover foto"
                    >
                      <X size={10} color="#fff" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fotoRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors hover:bg-gray-50 shrink-0"
                  style={{ borderColor: C.cremeBorder }}
                >
                  <ImagePlus size={18} style={{ color: "#9CA3AF" }} />
                  <span className="text-[10px]" style={{ color: "#9CA3AF" }}>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}
              >
                {erro}
              </div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div
            className="px-5 py-4 border-t flex items-center justify-between gap-3 shrink-0"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                backgroundColor: canSubmit ? C.esmeralda : "#9CA3AF",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.7,
              }}
            >
              {salvando ? (
                <><Loader2 size={14} className="animate-spin" /> Criando...</>
              ) : (
                "Criar Ordem"
              )}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
